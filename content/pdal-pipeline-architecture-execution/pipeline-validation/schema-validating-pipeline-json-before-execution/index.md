---
title: "Schema-Validating Pipeline JSON Before Execution"
description: "Write a JSON Schema for your team's PDAL pipelines and validate every pipeline file before it runs: required stages, allowed stage types, typed options, writer rules, and clear error messages in CI with the jsonschema library."
slug: "schema-validating-pipeline-json-before-execution"
type: "howto"
breadcrumb: "Schema Validation"
datePublished: "2026-09-18"
dateModified: "2026-09-18"
---

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Article",
      "headline": "Schema-Validating Pipeline JSON Before Execution",
      "description": "Write a JSON Schema for your team's PDAL pipelines and validate every pipeline file before it runs: required stages, allowed stage types, typed options, writer rules, and clear error messages in CI with the jsonschema library.",
      "datePublished": "2026-09-18",
      "dateModified": "2026-09-18",
      "author": {
        "@type": "Organization",
        "name": "pythonlidar.com"
      }
    },
    {
      "@type": "BreadcrumbList",
      "itemListElement": [
        {
          "@type": "ListItem",
          "position": 1,
          "name": "Home",
          "item": "https://www.pythonlidar.com/"
        },
        {
          "@type": "ListItem",
          "position": 2,
          "name": "PDAL Pipeline Architecture and Execution",
          "item": "https://www.pythonlidar.com/pdal-pipeline-architecture-execution/"
        },
        {
          "@type": "ListItem",
          "position": 3,
          "name": "Pipeline Validation",
          "item": "https://www.pythonlidar.com/pdal-pipeline-architecture-execution/pipeline-validation/"
        },
        {
          "@type": "ListItem",
          "position": 4,
          "name": "Schema Validation",
          "item": "https://www.pythonlidar.com/pdal-pipeline-architecture-execution/pipeline-validation/schema-validating-pipeline-json-before-execution/"
        }
      ]
    },
    {
      "@type": "HowTo",
      "name": "Validate PDAL pipeline JSON against a JSON Schema",
      "step": [
        {
          "@type": "HowToStep",
          "name": "Describe the top level",
          "text": "A pipeline document is an object with a pipeline array of stages; a stage is either a filename string (inferred reader) or an object with a type."
        },
        {
          "@type": "HowToStep",
          "name": "Restrict stage types",
          "text": "List allowed types in an enum. A typo like filters.smfr then fails with a readable message before PDAL sees it, and experimental stages cannot slip into production unnoticed."
        },
        {
          "@type": "HowToStep",
          "name": "Add conditional rules per stage type",
          "text": "JSON Schema's if/then lets you say \"if type is writers.las, then minor_version must be 4 and a_srs must be present\"."
        },
        {
          "@type": "HowToStep",
          "name": "Add ordering rules in Python",
          "text": "Schema cannot easily express \"stage A appears before stage B\". A ten-line Python function can."
        },
        {
          "@type": "HowToStep",
          "name": "Run in CI and in the pipeline runner",
          "text": "Validate in CI for every committed pipeline, and again at run time for rendered pipelines just before execution."
        }
      ]
    },
    {
      "@type": "FAQPage",
      "mainEntity": [
        {
          "@type": "Question",
          "name": "Does PDAL provide a JSON Schema for pipelines?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "PDAL validates pipelines itself through the validate flag, which checks stage names and options against the installed version. A team schema is a separate layer for your own conventions, and you write it to match your rules."
          }
        },
        {
          "@type": "Question",
          "name": "What can a JSON Schema not check?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Relationships between stages, such as one stage appearing before another, and anything that depends on the data. Put ordering rules in a short Python function next to the schema validation, and data checks after execution."
          }
        },
        {
          "@type": "Question",
          "name": "Should I validate with the schema or with pdal --validate?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Both. The schema enforces team conventions and gives fast feedback in editors; PDAL's validation confirms the pipeline is runnable with the installed version. They catch different mistakes."
          }
        },
        {
          "@type": "Question",
          "name": "How do I keep the schema from rotting?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Keep a fixture of broken pipelines, one per rule, and assert that each fails. Any schema change that disables a rule then breaks a test."
          }
        }
      ]
    }
  ]
}
</script>

**TL;DR:** `pdal pipeline --validate` checks that stages and options exist; it cannot enforce your team's rules. Write a JSON Schema that describes allowed stage types, required options and their types, validate every pipeline with Python's `jsonschema` library, and add a few rules the schema cannot express — "noise removal must precede SMRF", "writers must set `a_srs`" — as short Python checks in the same validator.

## Context and Motivation

This guide is part of [Pipeline Validation](https://www.pythonlidar.com/pdal-pipeline-architecture-execution/pipeline-validation/). A team with dozens of pipelines accumulates conventions: every classification pipeline removes noise first, every LAS writer outputs LAS 1.4 PDRF 6, rasters are always float32 and compressed, no pipeline writes to a local path in production. PDAL does not know any of that. A pipeline that violates every convention is still perfectly valid to PDAL and will run.

JSON Schema turns conventions into machine-checked rules. It is declarative, language-independent, supported by editors (you get autocompletion and inline errors in VS Code), and fast — hundreds of pipelines validate in well under a second. Combined with `pdal --validate` in CI, it catches both kinds of mistake: things PDAL rejects and things your team rejects.

<svg viewBox="0 0 740 210" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="What pdal validate checks versus what a team schema checks" style="width:100%;max-width:740px;display:block;margin:1.6rem auto">
  <title>Two validators, two kinds of rule</title>
  <desc>Two overlapping regions. pdal validate covers stage names that exist, options that stages recognize, and graph structure. The team schema covers allowed stage types, required options such as a_srs on writers, value types and ranges, and ordering rules such as noise removal before SMRF. A pipeline must pass both.</desc>
  <rect x="0" y="0" width="740" height="210" fill="var(--dg-bg)" rx="10"/>
  <rect x="20" y="24" width="330" height="160" rx="12" fill="var(--dg-b-soft)" stroke="var(--dg-b)" stroke-width="1.3"/>
  <rect x="390" y="24" width="330" height="160" rx="12" fill="var(--dg-a-soft)" stroke="var(--dg-a)" stroke-width="1.3"/>
  <text x="185" y="50" text-anchor="middle" font-size="12" font-weight="600" fill="var(--dg-text)">pdal pipeline --validate</text>
  <text x="40" y="82" font-size="10.5" fill="var(--dg-text)">stage types exist in this PDAL</text>
  <text x="40" y="106" font-size="10.5" fill="var(--dg-text)">options are recognized</text>
  <text x="40" y="130" font-size="10.5" fill="var(--dg-text)">tags and inputs resolve</text>
  <text x="40" y="154" font-size="10.5" fill="var(--dg-muted)">knows nothing about your conventions</text>
  <text x="555" y="50" text-anchor="middle" font-size="12" font-weight="600" fill="var(--dg-text)">team JSON Schema</text>
  <text x="410" y="82" font-size="10.5" fill="var(--dg-text)">only approved stage types</text>
  <text x="410" y="106" font-size="10.5" fill="var(--dg-text)">writers set a_srs, LAS 1.4, PDRF 6</text>
  <text x="410" y="130" font-size="10.5" fill="var(--dg-text)">numeric options typed and bounded</text>
  <text x="410" y="154" font-size="10.5" fill="var(--dg-text)">+ ordering rules in Python</text>
</svg>

## Prerequisites and Assumptions

- Python with `jsonschema` 4.x.
- Pipelines stored as JSON files in a repository, or rendered from templates before execution.
- Agreement on the conventions to enforce. Start with three or four; a schema that nobody agrees with gets bypassed.

## Step-by-Step Implementation

### Step 1 — Describe the top level

A pipeline document is an object with a `pipeline` array of stages; a stage is either a filename string (inferred reader) or an object with a `type`.

### Step 2 — Restrict stage types

List allowed types in an `enum`. A typo like `filters.smfr` then fails with a readable message before PDAL sees it, and experimental stages cannot slip into production unnoticed.

### Step 3 — Add conditional rules per stage type

JSON Schema's `if`/`then` lets you say "if `type` is `writers.las`, then `minor_version` must be 4 and `a_srs` must be present".

### Step 4 — Add ordering rules in Python

Schema cannot easily express "stage A appears before stage B". A ten-line Python function can.

### Step 5 — Run in CI and in the pipeline runner

Validate in CI for every committed pipeline, and again at run time for rendered pipelines just before execution.

## Complete Working Example

`schema/pipeline.schema.json`:

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "required": ["pipeline"],
  "properties": {
    "pipeline": {
      "type": "array",
      "minItems": 2,
      "items": {
        "oneOf": [
          { "type": "string", "pattern": "\\.(laz|las|copc\\.laz)$" },
          { "$ref": "#/$defs/stage" }
        ]
      }
    }
  },
  "$defs": {
    "stage": {
      "type": "object",
      "required": ["type"],
      "properties": {
        "type": { "enum": [
          "readers.las", "readers.copc",
          "filters.range", "filters.expression", "filters.assign", "filters.ferry",
          "filters.reprojection", "filters.crop", "filters.smrf", "filters.pmf",
          "filters.hag_nn", "filters.outlier", "filters.merge",
          "writers.las", "writers.gdal", "writers.copc" ] },
        "tag": { "type": "string", "pattern": "^[a-z][a-z0-9_]*$" }
      },
      "allOf": [
        { "if": { "properties": { "type": { "const": "writers.las" } } },
          "then": { "required": ["filename", "a_srs"],
                    "properties": { "minor_version": { "const": 4 },
                                    "dataformat_id": { "enum": [6, 7, 8] } } } },
        { "if": { "properties": { "type": { "const": "writers.gdal" } } },
          "then": { "required": ["filename", "resolution", "data_type"],
                    "properties": { "resolution": { "type": "number", "exclusiveMinimum": 0, "maximum": 10 },
                                    "data_type": { "const": "float32" } } } },
        { "if": { "properties": { "type": { "const": "filters.smrf" } } },
          "then": { "properties": { "slope": { "type": "number", "minimum": 0.01, "maximum": 2.0 },
                                    "window": { "type": "number", "minimum": 2, "maximum": 100 } } } }
      ]
    }
  }
}
```

`validate_pipelines.py`:

```python
"""Validate pipeline JSON files against the team schema plus ordering rules."""
from __future__ import annotations

import json
import sys
from pathlib import Path

from jsonschema import Draft202012Validator

SCHEMA = json.loads(Path("schema/pipeline.schema.json").read_text())
VALIDATOR = Draft202012Validator(SCHEMA)
NEIGHBOURHOOD = {"filters.smrf", "filters.pmf", "filters.hag_nn", "filters.outlier"}


def stage_types(spec: dict) -> list[str]:
    return [s["type"] if isinstance(s, dict) else "reader" for s in spec["pipeline"]]


def ordering_errors(spec: dict) -> list[str]:
    types = stage_types(spec)
    errors = []
    first_nb = next((i for i, t in enumerate(types) if t in NEIGHBOURHOOD), None)
    if first_nb is not None:
        noise = [i for i, s in enumerate(spec["pipeline"]) if isinstance(s, dict)
                 and s.get("type") in {"filters.range", "filters.expression"}
                 and "7" in json.dumps(s) and "18" in json.dumps(s)]
        if not noise or noise[0] > first_nb:
            errors.append(f"noise classes 7 and 18 must be removed before {types[first_nb]}")
    if not types[-1].startswith("writers.") and not any(t.startswith("writers.") for t in types):
        errors.append("pipeline has no writer")
    return errors


def validate(path: Path) -> list[str]:
    spec = json.loads(path.read_text())
    errors = [f"{'/'.join(map(str, e.absolute_path)) or '<root>'}: {e.message}"
              for e in sorted(VALIDATOR.iter_errors(spec), key=lambda e: list(e.absolute_path))]
    return errors + ordering_errors(spec)


if __name__ == "__main__":
    failed = 0
    for p in sorted(Path("pipelines").rglob("*.json")):
        errs = validate(p)
        if errs:
            failed += 1
            print(f"FAIL {p}")
            for e in errs:
                print(f"  - {e}")
    print(f"{failed} pipeline(s) failed")
    sys.exit(1 if failed else 0)
```

Example output for a pipeline with two problems:

```text
FAIL pipelines/dtm_county_south.json
  - pipeline/4: 'a_srs' is a required property
  - noise classes 7 and 18 must be removed before filters.smrf
1 pipeline(s) failed
```

<svg viewBox="0 10 740 170" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="How a conditional schema rule applies to one stage" style="width:100%;max-width:740px;display:block;margin:1.6rem auto">
  <title>if type, then these requirements</title>
  <desc>A stage object with type writers.las and filename but no a_srs flows into the schema's if-then rule. The if clause matches because the type is writers.las. The then clause requires filename and a_srs, and minor_version 4. The stage fails with the message that a_srs is a required property, pointing at the stage's index in the pipeline.</desc>
  <defs><marker id="sch-arw" markerWidth="9" markerHeight="7" refX="9" refY="3.5" orient="auto"><path d="M0,0 L0,7 L9,3.5 z" fill="var(--dg-line)"/></marker></defs>
  <rect x="0" y="10" width="740" height="170" fill="var(--dg-bg)" rx="10"/>
  <rect x="20" y="40" width="210" height="110" rx="8" fill="var(--dg-surface)" stroke="var(--dg-line)" stroke-width="1.2"/>
  <text x="36" y="66" font-size="10.5" fill="var(--dg-text)">"type": "writers.las"</text>
  <text x="36" y="88" font-size="10.5" fill="var(--dg-text)">"filename": "out.laz"</text>
  <text x="36" y="110" font-size="10.5" fill="var(--dg-text)">"minor_version": 4</text>
  <text x="36" y="132" font-size="10.5" fill="var(--dg-e)">(no a_srs)</text>
  <rect x="280" y="30" width="200" height="50" rx="8" fill="var(--dg-a-soft)" stroke="var(--dg-a)" stroke-width="1.2"/>
  <text x="380" y="60" text-anchor="middle" font-size="10.5" fill="var(--dg-text)">if type == writers.las</text>
  <rect x="280" y="110" width="200" height="50" rx="8" fill="var(--dg-a-soft)" stroke="var(--dg-a)" stroke-width="1.2"/>
  <text x="380" y="134" text-anchor="middle" font-size="10.5" fill="var(--dg-text)">then require filename, a_srs</text>
  <text x="380" y="150" text-anchor="middle" font-size="10" fill="var(--dg-muted)">minor_version = 4</text>
  <rect x="530" y="80" width="190" height="50" rx="8" fill="var(--dg-e-soft)" stroke="var(--dg-e)" stroke-width="1.2"/>
  <text x="625" y="102" text-anchor="middle" font-size="10.5" fill="var(--dg-text)">pipeline/4:</text>
  <text x="625" y="120" text-anchor="middle" font-size="10.5" fill="var(--dg-text)">'a_srs' is required</text>
  <line x1="230" y1="70" x2="276" y2="58" stroke="var(--dg-line)" stroke-width="1.3" marker-end="url(#sch-arw)"/>
  <line x1="380" y1="80" x2="380" y2="106" stroke="var(--dg-line)" stroke-width="1.3" marker-end="url(#sch-arw)"/>
  <line x1="480" y1="126" x2="526" y2="110" stroke="var(--dg-line)" stroke-width="1.3" marker-end="url(#sch-arw)"/>
</svg>

## Key Parameter Table

| Schema feature | Example | Enforces |
|---|---|---|
| `enum` on `type` | approved stage list | No typos, no unapproved stages |
| `if` / `then` | writer requirements | Per-stage-type rules |
| `required` | `["filename", "a_srs"]` | Options that must be present |
| `const` | `"minor_version": {"const": 4}` | Fixed conventions |
| numeric bounds | `"maximum": 10` | Plausible parameter values |
| `pattern` | tag naming | Consistent identifiers |

## Verification

- **Known-bad fixtures.** Keep a folder of deliberately broken pipelines, one per rule, and assert each fails with the expected message. Without them, a schema edit can silently disable a rule.
- **All production pipelines pass.** Run the validator over the repository in CI.
- **Editor integration.** Add `"$schema"` to pipeline files, or map the schema to `pipelines/*.json` in your editor settings, and confirm errors appear inline.

## Gotchas and Edge Cases

**Schema too strict for new stages.** An `enum` of stage types must be updated when a new stage is adopted. That is intentional friction; make updating the schema part of adopting a stage.

**String filenames.** A bare filename as the first element is a valid PDAL reader. The schema above allows it with a pattern; if your convention forbids implicit readers, remove the string branch.

**`oneOf` error messages.** When a stage fails every branch of a `oneOf`, the library reports each branch's error, which can be noisy. Sorting and de-duplicating messages, as the validator does, keeps output readable.

<svg viewBox="60 20 640 130" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Validation time for a repository of pipelines" style="width:100%;max-width:740px;display:block;margin:1.6rem auto">
  <title>Cheap enough for every commit</title>
  <desc>Bars comparing time to check 200 pipeline files. Schema validation with jsonschema takes about 0.3 seconds. Running pdal pipeline validate on each file takes about 40 seconds because it starts PDAL for every file. Both are fast enough for CI, and the schema check gives feedback almost instantly in an editor.</desc>
  <rect x="60" y="20" width="640" height="130" fill="var(--dg-bg)" rx="10"/>
  <text x="220" y="54" text-anchor="end" font-size="11" fill="var(--dg-text)">jsonschema, 200 files</text>
  <rect x="230" y="38" width="6" height="24" fill="var(--dg-d)"/>
  <text x="244" y="55" font-size="10.5" fill="var(--dg-muted)">0.3 s</text>
  <text x="220" y="104" text-anchor="end" font-size="11" fill="var(--dg-text)">pdal --validate, 200 files</text>
  <rect x="230" y="88" width="440" height="24" fill="var(--dg-b)"/>
  <text x="662" y="130" text-anchor="end" font-size="10.5" fill="var(--dg-muted)">≈ 40 s</text>
</svg>

**Rendered pipelines.** Templates are not JSON until rendered. Validate the rendered output, as in [parameterizing pipelines with Jinja templates](https://www.pythonlidar.com/pdal-pipeline-architecture-execution/pipeline-templating-parameterization/parameterizing-pipelines-with-jinja-templates/), not the template file.

## Frequently Asked Questions

**Does PDAL provide a JSON Schema for pipelines?**

PDAL validates pipelines itself through the validate flag, which checks stage names and options against the installed version. A team schema is a separate layer for your own conventions, and you write it to match your rules.

**What can a JSON Schema not check?**

Relationships between stages, such as one stage appearing before another, and anything that depends on the data. Put ordering rules in a short Python function next to the schema validation, and data checks after execution.

**Should I validate with the schema or with pdal --validate?**

Both. The schema enforces team conventions and gives fast feedback in editors; PDAL's validation confirms the pipeline is runnable with the installed version. They catch different mistakes.

**How do I keep the schema from rotting?**

Keep a fixture of broken pipelines, one per rule, and assert that each fails. Any schema change that disables a rule then breaks a test.

## Related

- [Pipeline Validation](https://www.pythonlidar.com/pdal-pipeline-architecture-execution/pipeline-validation/) — the validation layers
- [Validating PDAL Pipelines in CI](https://www.pythonlidar.com/pdal-pipeline-architecture-execution/pipeline-validation/validating-pdal-pipelines-in-ci/) — running this on every commit
- [Testing PDAL Pipelines with pytest](https://www.pythonlidar.com/pdal-pipeline-architecture-execution/pipeline-validation/testing-pdal-pipelines-with-pytest/) — behavioural tests
- [PDAL Pipeline Templating and Parameterization](https://www.pythonlidar.com/pdal-pipeline-architecture-execution/pipeline-templating-parameterization/) — validating rendered pipelines
- [Removing Noise Classes Before Processing](https://www.pythonlidar.com/pdal-pipeline-architecture-execution/pipeline-filtering-logic/removing-noise-classes-before-processing/) — the ordering rule enforced here
