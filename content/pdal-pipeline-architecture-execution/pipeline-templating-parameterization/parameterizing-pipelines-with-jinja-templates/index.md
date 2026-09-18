---
title: "Parameterizing Pipelines with Jinja Templates"
description: "Write Jinja2 templates for PDAL pipeline JSON that render safely: the tojson filter for every value, StrictUndefined, conditional stages, loops over tiles for merge pipelines, and golden-file tests for rendered output."
slug: "parameterizing-pipelines-with-jinja-templates"
type: "howto"
breadcrumb: "Jinja Pipeline Templates"
datePublished: "2026-09-18"
dateModified: "2026-09-18"
templateEngineOverride: md
---

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Article",
      "headline": "Parameterizing Pipelines with Jinja Templates",
      "description": "Write Jinja2 templates for PDAL pipeline JSON that render safely: the tojson filter for every value, StrictUndefined, conditional stages, loops over tiles for merge pipelines, and golden-file tests for rendered output.",
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
          "name": "Pipeline Templating",
          "item": "https://www.pythonlidar.com/pdal-pipeline-architecture-execution/pipeline-templating-parameterization/"
        },
        {
          "@type": "ListItem",
          "position": 4,
          "name": "Jinja Pipeline Templates",
          "item": "https://www.pythonlidar.com/pdal-pipeline-architecture-execution/pipeline-templating-parameterization/parameterizing-pipelines-with-jinja-templates/"
        }
      ]
    },
    {
      "@type": "HowTo",
      "name": "Parameterize PDAL pipeline JSON with Jinja2 templates",
      "step": [
        {
          "@type": "HowToStep",
          "name": "Configure a strict environment",
          "text": "Create one jinja2.Environment with StrictUndefined, autoescape=False (HTML escaping would corrupt JSON), and keep_trailing_newline=True."
        },
        {
          "@type": "HowToStep",
          "name": "Render every value with tojson",
          "text": "{{ value | tojson }} emits a JSON literal of the right type: strings quoted and escaped, numbers bare, booleans as true/false, lists as arrays. Never write quotes around a placeholder yourself."
        },
        {
          "@type": "HowToStep",
          "name": "Build optional stages as whole objects",
          "text": "Wrap an entire stage object and its separating comma in one {% if %} block. The cleanest way to avoid comma bugs is to build the stage list with a loop over a Jinja list and loop.last."
        },
        {
          "@type": "HowToStep",
          "name": "Loop for variable-length inputs",
          "text": "For merge pipelines, loop over a list of input files to emit one reader per tile, followed by filters.merge."
        },
        {
          "@type": "HowToStep",
          "name": "Test rendered output against golden files",
          "text": "For each template, render with a fixed parameter set and compare with a committed expected JSON. Any template edit shows up as a reviewable diff of the golden file."
        }
      ]
    },
    {
      "@type": "FAQPage",
      "mainEntity": [
        {
          "@type": "Question",
          "name": "Why use tojson instead of quoting placeholders myself?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Because tojson knows the value's type and escapes it correctly. Hand-quoted placeholders break on backslashes, embedded quotes and non-ASCII characters, and they quote numbers that should be bare."
          }
        },
        {
          "@type": "Question",
          "name": "How do I include a stage only when a parameter is set?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Build the stage list as a Jinja list, append the optional stage inside an if block, and serialize the whole object with tojson at the end. That avoids comma handling entirely."
          }
        },
        {
          "@type": "Question",
          "name": "Can templates call Python functions?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Yes, by registering them as globals or filters on the environment, for example a function that picks a UTM zone from a bounding box. Keep such functions small and tested; complex logic is usually clearer in the Python that prepares the parameters."
          }
        },
        {
          "@type": "Question",
          "name": "How do I test a template?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Render it with fixed parameters and compare against a committed golden JSON file, then run pdal pipeline with the validate flag on the golden file. Both belong in CI."
          }
        }
      ]
    }
  ]
}
</script>

**TL;DR:** Render every value through Jinja's `tojson` filter (`"filename": {{ src | tojson }}`) so quoting and escaping are always correct, use `StrictUndefined` so a missing parameter raises, express optional stages with `{% if %}` blocks that emit a whole stage object, and pin rendered output with golden-file tests.

## Context and Motivation

This guide is part of [PDAL Pipeline Templating and Parameterization](https://www.pythonlidar.com/pdal-pipeline-architecture-execution/pipeline-templating-parameterization/). Jinja2 is the most common way to template PDAL pipelines because it is already in most Python environments, it is familiar from Airflow and Ansible, and it handles both simple substitution and conditional structure. It also makes it easy to produce broken JSON: a Windows path with backslashes, a string placeholder without quotes, a trailing comma after a conditional stage that did not render.

Every one of those failure modes has a mechanical fix, and applying the fixes consistently turns templates from a source of mysterious PDAL errors into something you can trust in a batch system.

<svg viewBox="0 0 740 210" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Rendering a path with and without the tojson filter" style="width:100%;max-width:740px;display:block;margin:1.6rem auto">
  <title>Why every value goes through tojson</title>
  <desc>Two rows. The first renders a Windows path into a quoted placeholder without a filter, producing invalid JSON because the backslashes are not escaped. The second renders the same path with the tojson filter and no surrounding quotes, producing a correctly quoted and escaped JSON string.</desc>
  <rect x="0" y="0" width="740" height="210" fill="var(--dg-bg)" rx="10"/>
  <rect x="20" y="24" width="700" height="74" rx="8" fill="var(--dg-e-soft)" stroke="var(--dg-e)" stroke-width="1.2"/>
  <text x="36" y="46" font-size="11" fill="var(--dg-text)">"filename": "{{ src }}"</text>
  <text x="36" y="68" font-size="11" fill="var(--dg-text)">→ "filename": "D:\tiles\new\t1.laz"</text>
  <text x="36" y="88" font-size="10.5" fill="var(--dg-e)">\t and \n become a tab and a newline; the JSON parser rejects or corrupts the path</text>
  <rect x="20" y="112" width="700" height="74" rx="8" fill="var(--dg-d-soft)" stroke="var(--dg-d)" stroke-width="1.2"/>
  <text x="36" y="134" font-size="11" fill="var(--dg-text)">"filename": {{ src | tojson }}</text>
  <text x="36" y="156" font-size="11" fill="var(--dg-text)">→ "filename": "D:\\tiles\\new\\t1.laz"</text>
  <text x="36" y="176" font-size="10.5" fill="var(--dg-text)">quotes and escapes added by the filter, correct for any string</text>
</svg>

## Prerequisites and Assumptions

- Python 3.10+ with Jinja2 3.x.
- A working PDAL pipeline to generalize, and the PDAL CLI for validation.
- Templates stored as files (`templates/*.json.j2`) rather than strings in code, so they can be reviewed and diffed.

## Step-by-Step Implementation

### Step 1 — Configure a strict environment

Create one `jinja2.Environment` with `StrictUndefined`, `autoescape=False` (HTML escaping would corrupt JSON), and `keep_trailing_newline=True`.

### Step 2 — Render every value with tojson

`{{ value | tojson }}` emits a JSON literal of the right type: strings quoted and escaped, numbers bare, booleans as `true`/`false`, lists as arrays. Never write quotes around a placeholder yourself.

### Step 3 — Build optional stages as whole objects

Wrap an entire stage object and its separating comma in one `{% if %}` block. The cleanest way to avoid comma bugs is to build the stage list with a loop over a Jinja list and `loop.last`.

### Step 4 — Loop for variable-length inputs

For merge pipelines, loop over a list of input files to emit one reader per tile, followed by `filters.merge`.

### Step 5 — Test rendered output against golden files

For each template, render with a fixed parameter set and compare with a committed expected JSON. Any template edit shows up as a reviewable diff of the golden file.

## Complete Working Example

`templates/clean_and_grid.json.j2`:

```jinja
{% set stages = [] %}
{% for f in inputs %}
  {% set _ = stages.append({"type": "readers.las", "filename": f, "default_srs": crs}) %}
{% endfor %}
{% if inputs | length > 1 %}
  {% set _ = stages.append({"type": "filters.merge"}) %}
{% endif %}
{% set _ = stages.append({"type": "filters.range",
                          "limits": "Classification![7:7],Classification![18:18]"}) %}
{% if reproject_to %}
  {% set _ = stages.append({"type": "filters.reprojection", "out_srs": reproject_to}) %}
{% endif %}
{% if outlier %}
  {% set _ = stages.append({"type": "filters.outlier", "method": "statistical",
                            "mean_k": outlier.mean_k, "multiplier": outlier.multiplier}) %}
{% endif %}
{% set _ = stages.append({"type": "writers.gdal", "filename": dst, "resolution": res,
                          "output_type": "idw", "data_type": "float32"}) %}
{{ {"pipeline": stages} | tojson(indent=2) }}
```

The template builds the stage list as a Jinja data structure and serializes it once with `tojson`, which removes the comma problem entirely: there is no hand-written JSON punctuation left in the template.

`render.py`:

```python
"""Render and sanity-check a PDAL pipeline from a Jinja2 template."""
from __future__ import annotations

import json
from pathlib import Path

import jinja2

ENV = jinja2.Environment(
    loader=jinja2.FileSystemLoader("templates"),
    undefined=jinja2.StrictUndefined,
    autoescape=False,
    keep_trailing_newline=True,
    extensions=["jinja2.ext.do"],
)


def render(template: str, **params) -> dict:
    text = ENV.get_template(template).render(**params)
    spec = json.loads(text)
    types = [s["type"] for s in spec["pipeline"]]
    assert types[0].startswith("readers."), types
    assert types[-1].startswith("writers."), types
    return spec


if __name__ == "__main__":
    spec = render(
        "clean_and_grid.json.j2",
        inputs=["tiles/t_0431.laz", "tiles/t_0432.laz"],
        crs="EPSG:6347",
        reproject_to=None,
        outlier={"mean_k": 12, "multiplier": 2.5},
        dst="out/block_043_dtm.tif",
        res=1.0,
    )
    Path("out").mkdir(exist_ok=True)
    Path("out/block_043.pipeline.json").write_text(json.dumps(spec, indent=2, sort_keys=True))
    print(" -> ".join(s["type"] for s in spec["pipeline"]))
```

Output:

```text
readers.las -> readers.las -> filters.merge -> filters.range -> filters.outlier -> writers.gdal
```

<svg viewBox="0 0 740 200" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Stage lists rendered from one template with different parameters" style="width:100%;max-width:740px;display:block;margin:1.6rem auto">
  <title>Same template, three stage lists</title>
  <desc>Three rows of stage chips rendered from the same template. With one input and no options: reader, range, writer. With two inputs and an outlier option: reader, reader, merge, range, outlier, writer. With one input and reprojection: reader, range, reprojection, writer.</desc>
  <rect x="0" y="0" width="740" height="200" fill="var(--dg-bg)" rx="10"/>
  <g font-size="10" fill="var(--dg-text)">
    <rect x="20" y="24" width="88" height="30" rx="6" fill="var(--dg-a-soft)" stroke="var(--dg-a)"/><text text-anchor="middle" x="64" y="43">readers.las</text>
    <rect x="116" y="24" width="88" height="30" rx="6" fill="var(--dg-b-soft)" stroke="var(--dg-b)"/><text text-anchor="middle" x="160" y="43">range</text>
    <rect x="212" y="24" width="88" height="30" rx="6" fill="var(--dg-d-soft)" stroke="var(--dg-d)"/><text text-anchor="middle" x="256" y="43">writers.gdal</text>
    <rect x="20" y="84" width="88" height="30" rx="6" fill="var(--dg-a-soft)" stroke="var(--dg-a)"/><text text-anchor="middle" x="64" y="103">readers.las</text>
    <rect x="116" y="84" width="88" height="30" rx="6" fill="var(--dg-a-soft)" stroke="var(--dg-a)"/><text text-anchor="middle" x="160" y="103">readers.las</text>
    <rect x="212" y="84" width="88" height="30" rx="6" fill="var(--dg-c-soft)" stroke="var(--dg-c)"/><text text-anchor="middle" x="256" y="103">merge</text>
    <rect x="308" y="84" width="88" height="30" rx="6" fill="var(--dg-b-soft)" stroke="var(--dg-b)"/><text text-anchor="middle" x="352" y="103">range</text>
    <rect x="404" y="84" width="88" height="30" rx="6" fill="var(--dg-c-soft)" stroke="var(--dg-c)"/><text text-anchor="middle" x="448" y="103">outlier</text>
    <rect x="500" y="84" width="88" height="30" rx="6" fill="var(--dg-d-soft)" stroke="var(--dg-d)"/><text text-anchor="middle" x="544" y="103">writers.gdal</text>
    <rect x="20" y="144" width="88" height="30" rx="6" fill="var(--dg-a-soft)" stroke="var(--dg-a)"/><text text-anchor="middle" x="64" y="163">readers.las</text>
    <rect x="116" y="144" width="88" height="30" rx="6" fill="var(--dg-b-soft)" stroke="var(--dg-b)"/><text text-anchor="middle" x="160" y="163">range</text>
    <rect x="212" y="144" width="88" height="30" rx="6" fill="var(--dg-c-soft)" stroke="var(--dg-c)"/><text text-anchor="middle" x="256" y="163">reprojection</text>
    <rect x="308" y="144" width="88" height="30" rx="6" fill="var(--dg-d-soft)" stroke="var(--dg-d)"/><text text-anchor="middle" x="352" y="163">writers.gdal</text>
  </g>
  <text x="610" y="43" font-size="10.5" fill="var(--dg-muted)">1 input</text>
  <text x="610" y="103" font-size="10.5" fill="var(--dg-muted)">2 inputs + outlier</text>
  <text x="610" y="163" font-size="10.5" fill="var(--dg-muted)">reproject_to set</text>
</svg>

## Key Parameter Table

| Setting | Value | Why |
|---|---|---|
| `undefined` | `StrictUndefined` | Missing parameters raise instead of rendering empty |
| `autoescape` | `False` | HTML escaping turns `&&` in expressions into `&amp;&amp;` |
| `tojson` filter | on every value | Correct quoting, escaping and types |
| `tojson(indent=2)` | on the final object | Readable output for provenance files |
| `jinja2.ext.do` | optional | Allows `{% do stages.append(...) %}` instead of `{% set _ = ... %}` |
| golden files | one per template | Template edits become reviewable diffs |

## Verification

Golden-file tests are the verification step that pays for itself fastest.

```python
import json
from pathlib import Path

import pytest

from render import render

CASES = {
    "two_tiles_outlier": dict(inputs=["a.laz", "b.laz"], crs="EPSG:6347", reproject_to=None,
                              outlier={"mean_k": 12, "multiplier": 2.5}, dst="o.tif", res=1.0),
}


@pytest.mark.parametrize("name", CASES)
def test_golden(name: str) -> None:
    got = render("clean_and_grid.json.j2", **CASES[name])
    want = json.loads(Path(f"tests/golden/{name}.json").read_text())
    assert got == want
```

Follow it with `pdal pipeline --validate` on each golden file in CI, which confirms the stages and options exist in the installed PDAL.

## Gotchas and Edge Cases

**`autoescape=True` corrupts expressions.** PDAL expressions such as `Classification == 2 && Z > 10` contain `&`. HTML autoescaping renders `&amp;&amp;`, which PDAL cannot parse. JSON templates must disable it.

**Numbers rendered as strings.** YAML loaded without type conversion yields `"1.0"` strings; `tojson` then quotes them faithfully, and PDAL may reject `"resolution": "1.0"` or interpret it differently. Convert types in the parameter loader, not in the template.

**Whitespace in hand-written JSON templates.** If you do write JSON by hand around placeholders, `trim_blocks` and `lstrip_blocks` keep the output tidy, but comma handling around conditionals remains fragile. Building a data structure and serializing once, as the example does, avoids the whole class of bug.

<svg viewBox="0 0 740 180" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Trailing comma produced by a conditional stage in hand-written JSON" style="width:100%;max-width:740px;display:block;margin:1.6rem auto">
  <title>The trailing-comma trap</title>
  <desc>A hand-written JSON template where the last stage is wrapped in an if block. When the condition is false, the preceding stage's trailing comma is left before the closing bracket, producing invalid JSON. Building the list as data and serializing it with tojson avoids the problem.</desc>
  <rect x="0" y="0" width="740" height="180" fill="var(--dg-bg)" rx="10"/>
  <rect x="20" y="20" width="340" height="140" rx="8" fill="var(--dg-surface)" stroke="var(--dg-line)" stroke-width="1.2"/>
  <text x="36" y="44" font-size="10.5" fill="var(--dg-text)">{ "type": "filters.range", ... },</text>
  <text x="36" y="66" font-size="10.5" fill="var(--dg-muted)">{% if outlier %}</text>
  <text x="36" y="88" font-size="10.5" fill="var(--dg-muted)">{ "type": "filters.outlier", ... }</text>
  <text x="36" y="110" font-size="10.5" fill="var(--dg-muted)">{% endif %}</text>
  <text x="36" y="132" font-size="10.5" fill="var(--dg-text)">]</text>
  <rect x="400" y="20" width="320" height="140" rx="8" fill="var(--dg-e-soft)" stroke="var(--dg-e)" stroke-width="1.2"/>
  <text x="416" y="44" font-size="10.5" fill="var(--dg-text)">outlier is false →</text>
  <text x="416" y="66" font-size="10.5" fill="var(--dg-text)">{ "type": "filters.range", ... },</text>
  <text x="416" y="88" font-size="10.5" fill="var(--dg-text)">]</text>
  <text x="416" y="120" font-size="10.5" fill="var(--dg-e)">trailing comma: invalid JSON</text>
</svg>

**Secrets in templates.** Credentials for S3 readers do not belong in templates or parameter files. Let GDAL and PDAL pick them up from the environment or an instance role, as described in [configuring GDAL /vsis3/ for fast point cloud reads](https://www.pythonlidar.com/batch-automation-cloud-integration/s3-cloud-storage-io/configuring-gdal-vsis3-for-fast-point-cloud-reads/).

## Frequently Asked Questions

**Why use tojson instead of quoting placeholders myself?**

Because tojson knows the value's type and escapes it correctly. Hand-quoted placeholders break on backslashes, embedded quotes and non-ASCII characters, and they quote numbers that should be bare.

**How do I include a stage only when a parameter is set?**

Build the stage list as a Jinja list, append the optional stage inside an if block, and serialize the whole object with tojson at the end. That avoids comma handling entirely.

**Can templates call Python functions?**

Yes, by registering them as globals or filters on the environment, for example a function that picks a UTM zone from a bounding box. Keep such functions small and tested; complex logic is usually clearer in the Python that prepares the parameters.

**How do I test a template?**

Render it with fixed parameters and compare against a committed golden JSON file, then run pdal pipeline with the validate flag on the golden file. Both belong in CI.

## Related

- [PDAL Pipeline Templating and Parameterization](https://www.pythonlidar.com/pdal-pipeline-architecture-execution/pipeline-templating-parameterization/) — choosing a mechanism
- [Overriding Stage Options from the Command Line](https://www.pythonlidar.com/pdal-pipeline-architecture-execution/pipeline-templating-parameterization/overriding-stage-options-from-the-command-line/) — lighter-weight per-run values
- [Building Pipelines with the Python Stage API](https://www.pythonlidar.com/pdal-pipeline-architecture-execution/pipeline-templating-parameterization/building-pipelines-with-the-python-stage-api/) — the code-first alternative
- [Schema-Validating Pipeline JSON Before Execution](https://www.pythonlidar.com/pdal-pipeline-architecture-execution/pipeline-validation/schema-validating-pipeline-json-before-execution/) — structural checks on rendered output
- [Testing PDAL Pipelines with pytest](https://www.pythonlidar.com/pdal-pipeline-architecture-execution/pipeline-validation/testing-pdal-pipelines-with-pytest/) — running rendered pipelines on fixtures
