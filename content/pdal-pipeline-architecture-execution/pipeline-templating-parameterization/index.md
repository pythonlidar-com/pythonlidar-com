---
title: "PDAL Pipeline Templating and Parameterization"
description: "Stop copying pipeline JSON per project: parameterize PDAL pipelines with Jinja2 templates, command-line stage overrides and the Python stage API, validate the rendered result, and keep one versioned pipeline for many tiles and projects."
slug: "pipeline-templating-parameterization"
type: "topic"
breadcrumb: "Pipeline Templating"
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
      "headline": "PDAL Pipeline Templating and Parameterization",
      "description": "Stop copying pipeline JSON per project: parameterize PDAL pipelines with Jinja2 templates, command-line stage overrides and the Python stage API, validate the rendered result, and keep one versioned pipeline for many tiles and projects.",
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
        }
      ]
    },
    {
      "@type": "HowTo",
      "name": "Parameterize a PDAL pipeline for reuse across tiles and projects",
      "step": [
        {
          "@type": "HowToStep",
          "name": "Identify the variable parts",
          "text": "Separate values that change per tile (paths), per project (CRS, resolution, thresholds) and never (stage order, writer format)."
        },
        {
          "@type": "HowToStep",
          "name": "Choose a mechanism",
          "text": "Command-line overrides for one or two per-run values; Jinja2 templates for per-project configuration in a batch system; the Python stage API when pipelines are assembled conditionally in code."
        },
        {
          "@type": "HowToStep",
          "name": "Keep parameters typed and in one file",
          "text": "A small YAML or TOML per project, loaded and validated in Python, rather than values scattered across shell scripts."
        },
        {
          "@type": "HowToStep",
          "name": "Render deterministically",
          "text": "The same template and parameters must always produce byte-identical JSON; sort keys and avoid timestamps in the output."
        },
        {
          "@type": "HowToStep",
          "name": "Validate before execution",
          "text": "Parse the rendered JSON, check it against your own schema, and run pdal pipeline --validate or construct pdal.Pipeline without executing."
        },
        {
          "@type": "HowToStep",
          "name": "Record provenance",
          "text": "Store the rendered pipeline JSON beside each output, or its hash in the output's metadata, so the exact pipeline behind any deliverable is recoverable."
        }
      ]
    },
    {
      "@type": "FAQPage",
      "mainEntity": [
        {
          "@type": "Question",
          "name": "Does PDAL support variables in pipeline JSON?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Not as a templating language. PDAL supports overriding stage options from the command line, which covers per-run values like file names. For anything richer \u2014 computed values, conditionals, per-project defaults \u2014 render the JSON with a template engine or build it in Python."
          }
        },
        {
          "@type": "Question",
          "name": "When should I use the Python stage API instead of templates?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "When the set of stages depends on logic: add a reprojection only if the CRS differs, add a noise filter only for certain sensors. Code expresses conditionals more clearly than template syntax, and the result can still be serialized to JSON for provenance."
          }
        },
        {
          "@type": "Question",
          "name": "How do I know which pipeline produced an old output?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Store the rendered, key-sorted pipeline JSON beside each output, or record its hash in the output's metadata. Combined with the template and parameter files in version control, that makes any deliverable traceable."
          }
        },
        {
          "@type": "Question",
          "name": "Should parameter files be YAML, TOML or JSON?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Any format that loads into typed values works. YAML is the most common for hand-edited project configuration because it allows comments, which is where the reason for an unusual threshold belongs. Whatever you choose, load it through one function that converts types and checks ranges, so every project is held to the same rules."
          }
        },
        {
          "@type": "Question",
          "name": "Can I override an option on only one of two readers?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Yes. Give each stage a tag in the JSON and override with the stage.tag.option form on the command line. Without tags, a type-based override applies to every stage of that type."
          }
        }
      ]
    }
  ]
}
</script>

Every LiDAR team eventually finds a directory holding `dtm_projectA.json`, `dtm_projectA_v2.json`, `dtm_projectB_fixed.json` and a dozen more — nearly identical pipelines that differ in an EPSG code, a resolution and a file path. Each copy drifts: a bug fixed in one is still present in three others, and nobody can say which version produced last year's deliverable. Parameterization solves this by separating the *shape* of a pipeline — which stages, in which order — from the *values* that change per tile or per project. This topic in the [PDAL Pipeline Architecture and Execution](https://www.pythonlidar.com/pdal-pipeline-architecture-execution/) section compares the three practical ways to do that — PDAL's own command-line overrides, Jinja2 templates, and the Python stage API — and shows how to validate whatever you render before it touches data.

<svg viewBox="0 0 740 230" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="One template plus per-project parameters rendering into concrete pipelines" style="width:100%;max-width:740px;display:block;margin:1.6rem auto">
  <title>One shape, many sets of values</title>
  <desc>A single pipeline template in the centre with placeholders for input path, CRS and resolution. Three parameter sets on the left, for projects A, B and C, feed into it. Three rendered pipelines on the right come out, each validated before execution. A note says a fix to the template reaches every project at once.</desc>
  <defs><marker id="tpl-arw" markerWidth="9" markerHeight="7" refX="9" refY="3.5" orient="auto"><path d="M0,0 L0,7 L9,3.5 z" fill="var(--dg-line)"/></marker></defs>
  <rect x="0" y="0" width="740" height="230" fill="var(--dg-bg)" rx="10"/>
  <rect x="20" y="30" width="150" height="40" rx="7" fill="var(--dg-surface)" stroke="var(--dg-line)" stroke-width="1.2"/>
  <text x="95" y="55" text-anchor="middle" font-size="10.5" fill="var(--dg-text)">A: EPSG:6347, 1.0 m</text>
  <rect x="20" y="95" width="150" height="40" rx="7" fill="var(--dg-surface)" stroke="var(--dg-line)" stroke-width="1.2"/>
  <text x="95" y="120" text-anchor="middle" font-size="10.5" fill="var(--dg-text)">B: EPSG:25832, 0.5 m</text>
  <rect x="20" y="160" width="150" height="40" rx="7" fill="var(--dg-surface)" stroke="var(--dg-line)" stroke-width="1.2"/>
  <text x="95" y="185" text-anchor="middle" font-size="10.5" fill="var(--dg-text)">C: EPSG:2193, 2.0 m</text>
  <rect x="270" y="70" width="200" height="90" rx="9" fill="var(--dg-a-soft)" stroke="var(--dg-a)" stroke-width="1.5"/>
  <text x="370" y="98" text-anchor="middle" font-size="12" font-weight="600" fill="var(--dg-text)">dtm.json.j2</text>
  <text x="370" y="120" text-anchor="middle" font-size="10.5" fill="var(--dg-muted)">readers.las {{ src }}</text>
  <text x="370" y="140" text-anchor="middle" font-size="10.5" fill="var(--dg-muted)">writers.gdal {{ res }}</text>
  <path d="M170 50 L220 50 L220 105 L268 105" fill="none" stroke="var(--dg-line)" stroke-width="1.3" marker-end="url(#tpl-arw)"/>
  <line x1="170" y1="115" x2="268" y2="115" stroke="var(--dg-line)" stroke-width="1.3" marker-end="url(#tpl-arw)"/>
  <path d="M170 180 L220 180 L220 125 L268 125" fill="none" stroke="var(--dg-line)" stroke-width="1.3" marker-end="url(#tpl-arw)"/>
  <rect x="570" y="30" width="150" height="40" rx="7" fill="var(--dg-d-soft)" stroke="var(--dg-d)" stroke-width="1.2"/>
  <text x="645" y="55" text-anchor="middle" font-size="10.5" fill="var(--dg-text)">A pipeline ✓</text>
  <rect x="570" y="95" width="150" height="40" rx="7" fill="var(--dg-d-soft)" stroke="var(--dg-d)" stroke-width="1.2"/>
  <text x="645" y="120" text-anchor="middle" font-size="10.5" fill="var(--dg-text)">B pipeline ✓</text>
  <rect x="570" y="160" width="150" height="40" rx="7" fill="var(--dg-d-soft)" stroke="var(--dg-d)" stroke-width="1.2"/>
  <text x="645" y="185" text-anchor="middle" font-size="10.5" fill="var(--dg-text)">C pipeline ✓</text>
  <path d="M472 105 L520 105 L520 50 L568 50" fill="none" stroke="var(--dg-line)" stroke-width="1.3" marker-end="url(#tpl-arw)"/>
  <line x1="472" y1="115" x2="568" y2="115" stroke="var(--dg-line)" stroke-width="1.3" marker-end="url(#tpl-arw)"/>
  <path d="M472 125 L520 125 L520 180 L568 180" fill="none" stroke="var(--dg-line)" stroke-width="1.3" marker-end="url(#tpl-arw)"/>
  <text x="370" y="218" text-anchor="middle" font-size="10.5" fill="var(--dg-muted)">fix the template once and every project picks it up; ✓ = validated before execution</text>
</svg>

## Prerequisites

- **PDAL 2.4+** on the command line and the **Python bindings** (`python-pdal` 3.x) for the stage API.
- **Python 3.10+** with Jinja2 3.x, and optionally `jsonschema` for structural validation.
- **A working pipeline** you want to generalize. Start from something that runs correctly for one tile; parameterize second.
- **A parameter inventory.** Before templating, list what actually varies: input and output paths, CRS, resolution, filter thresholds, classes kept. Anything not on the list stays literal.
- **Version control** for templates and parameter files, so every rendered pipeline can be traced to a commit.

## Core Workflow Architecture

1. **Identify the variable parts.** Separate values that change per tile (paths), per project (CRS, resolution, thresholds) and never (stage order, writer format).
2. **Choose a mechanism.** Command-line overrides for one or two per-run values; Jinja2 templates for per-project configuration in a batch system; the Python stage API when pipelines are assembled conditionally in code.
3. **Keep parameters typed and in one file.** A small YAML or TOML per project, loaded and validated in Python, rather than values scattered across shell scripts.
4. **Render deterministically.** The same template and parameters must always produce byte-identical JSON; sort keys and avoid timestamps in the output.
5. **Validate before execution.** Parse the rendered JSON, check it against your own schema, and run `pdal pipeline --validate` or construct `pdal.Pipeline` without executing.
6. **Record provenance.** Store the rendered pipeline JSON beside each output, or its hash in the output's metadata, so the exact pipeline behind any deliverable is recoverable.

## Full Implementation

The implementation renders a Jinja2 template from a per-project YAML file, validates the result structurally and with PDAL, and runs it for a list of tiles, writing the rendered JSON next to each output.

```python
"""Render, validate and run a templated PDAL pipeline for a list of tiles."""
from __future__ import annotations

import hashlib
import json
import logging
import subprocess
from dataclasses import dataclass
from pathlib import Path

import jinja2
import pdal
import yaml

log = logging.getLogger("tpl")


@dataclass(frozen=True)
class ProjectParams:
    crs: str
    resolution: float
    smrf_slope: float
    smrf_window: float
    out_dir: Path

    @classmethod
    def load(cls, path: Path) -> "ProjectParams":
        raw = yaml.safe_load(path.read_text())
        p = cls(crs=str(raw["crs"]), resolution=float(raw["resolution"]),
                smrf_slope=float(raw["smrf"]["slope"]), smrf_window=float(raw["smrf"]["window"]),
                out_dir=Path(raw["out_dir"]))
        if not p.crs.startswith("EPSG:"):
            raise ValueError(f"crs must be an EPSG code, got {p.crs!r}")
        if not 0.1 <= p.resolution <= 10:
            raise ValueError(f"resolution {p.resolution} outside 0.1–10 m")
        return p


ENV = jinja2.Environment(loader=jinja2.FileSystemLoader("templates"),
                         undefined=jinja2.StrictUndefined, autoescape=False,
                         trim_blocks=True, lstrip_blocks=True)


def render(template: str, tile: Path, params: ProjectParams) -> dict:
    text = ENV.get_template(template).render(
        src=str(tile), dst=str(params.out_dir / f"{tile.stem}_dtm.tif"),
        crs=params.crs, res=params.resolution,
        slope=params.smrf_slope, window=params.smrf_window)
    spec = json.loads(text)                       # fails fast on broken JSON
    stages = spec["pipeline"]
    types = [s["type"] if isinstance(s, dict) else "reader" for s in stages]
    if types[-1].split(".")[0] != "writers":
        raise ValueError(f"last stage must be a writer, got {types[-1]}")
    return spec


def pdal_validate(spec: dict, scratch: Path) -> None:
    scratch.write_text(json.dumps(spec, indent=2, sort_keys=True))
    res = subprocess.run(["pdal", "pipeline", "--validate", str(scratch)],
                         capture_output=True, text=True)
    if res.returncode != 0:
        raise RuntimeError(f"pdal --validate failed: {res.stderr.strip() or res.stdout.strip()}")


def run_tile(template: str, tile: Path, params: ProjectParams) -> str:
    spec = render(template, tile, params)
    rendered = params.out_dir / f"{tile.stem}.pipeline.json"
    params.out_dir.mkdir(parents=True, exist_ok=True)
    pdal_validate(spec, rendered)
    digest = hashlib.sha256(rendered.read_bytes()).hexdigest()[:12]
    n = pdal.Pipeline(json.dumps(spec)).execute()
    log.info("%s: %d points, pipeline %s", tile.name, n, digest)
    return digest


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
    params = ProjectParams.load(Path("projects/county_north.yaml"))
    for tile in sorted(Path("tiles").glob("*.laz")):
        run_tile("dtm.json.j2", tile, params)
```

The template it renders:

```jinja
{
  "pipeline": [
    { "type": "readers.las", "filename": "{{ src }}", "default_srs": "{{ crs }}" },
    { "type": "filters.range", "limits": "Classification![7:7],Classification![18:18]" },
    { "type": "filters.smrf", "slope": {{ slope }}, "window": {{ window }},
      "threshold": 0.45, "scalar": 1.2, "cell": 1.0 },
    { "type": "filters.range", "limits": "Classification[2:2]" },
    { "type": "writers.gdal", "filename": "{{ dst }}", "resolution": {{ res }},
      "output_type": "idw", "window_size": 6, "data_type": "float32",
      "gdalopts": "COMPRESS=DEFLATE,TILED=YES" }
  ]
}
```

## Code Breakdown

**`StrictUndefined`.** Jinja2's default renders a missing variable as an empty string, which produces `"slope": ,` — broken JSON if you are lucky, or a silently empty filename if the placeholder was inside quotes. Strict mode raises instead, so a typo in a parameter name fails at render time.

**Typed parameters with range checks.** Loading YAML into a frozen dataclass converts types once and rejects nonsense before rendering. A resolution of 100 or a CRS of `"6347"` without the prefix fails with a readable message rather than as a PDAL error three stages in.

**`json.loads` immediately after rendering.** The rendered text must be valid JSON before anything else runs. Quoting mistakes in templates — a numeric placeholder wrapped in quotes, or a string placeholder without them — surface here.

**Structural check, then PDAL's check.** The code asserts a writer is last, which PDAL would also catch, but the custom check can encode team rules PDAL cannot, such as "every DTM pipeline must remove noise first". `pdal pipeline --validate` then confirms that every stage exists and every option is recognized by the installed PDAL.

**Sorted, indented rendered JSON beside the output.** Writing the exact pipeline next to its product, with sorted keys, makes the file reproducible and diff-able. The short SHA-256 digest logged per tile is enough to tell later whether two outputs came from the same pipeline.

**`default_srs` rather than `override_srs`.** The template assigns the project CRS only when the file lacks one; a file that declares its own CRS keeps it. Switch to `override_srs` deliberately when a vendor's CRS is known to be wrong, and put that decision in the parameter file, not the template.

## Parameter Reference Table

| Mechanism | Scope | Syntax | Best for | Weakness |
|---|---|---|---|---|
| CLI override | one run | `--readers.las.filename=...` | Paths per tile in shell loops | Cannot add or remove stages |
| Tagged CLI override | one run | `--stage.<tag>.<option>=...` | Overriding one of several stages of the same type | Tags must exist in the JSON |
| Jinja2 template | per project | `{{ res }}`, `{% if %}` | Batch systems, many projects | Needs rendering and validation step |
| Python stage API | in code | `pdal.Reader.las(...) \| pdal.Filter.smrf(...)` | Conditional assembly, notebooks, tests | Pipeline lives in code, not a file |
| `pdal.Pipeline(json, arrays=[...])` | in code | JSON without reader | Feeding NumPy arrays | Only for in-memory inputs |

<svg viewBox="0 0 740 240" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Decision tree for choosing a parameterization mechanism" style="width:100%;max-width:740px;display:block;margin:1.6rem auto">
  <title>Which mechanism fits the change</title>
  <desc>A decision tree. First question: does the set of stages change between runs? If yes, use the Python stage API or a template with conditionals. If no, second question: do more than two values change? If no, use command-line overrides. If yes, use a Jinja2 template with a parameter file.</desc>
  <defs><marker id="tpl-arw2" markerWidth="9" markerHeight="7" refX="9" refY="3.5" orient="auto"><path d="M0,0 L0,7 L9,3.5 z" fill="var(--dg-line)"/></marker></defs>
  <rect x="0" y="0" width="740" height="240" fill="var(--dg-bg)" rx="10"/>
  <rect x="240" y="16" width="260" height="42" rx="8" fill="var(--dg-surface)" stroke="var(--dg-line)" stroke-width="1.3"/>
  <text x="370" y="42" text-anchor="middle" font-size="11.5" fill="var(--dg-text)">do the stages themselves change?</text>
  <rect x="30" y="110" width="250" height="42" rx="8" fill="var(--dg-a-soft)" stroke="var(--dg-a)" stroke-width="1.3"/>
  <text x="155" y="136" text-anchor="middle" font-size="11" fill="var(--dg-text)">Python stage API</text>
  <rect x="430" y="96" width="270" height="42" rx="8" fill="var(--dg-surface)" stroke="var(--dg-line)" stroke-width="1.3"/>
  <text x="565" y="122" text-anchor="middle" font-size="11.5" fill="var(--dg-text)">more than two values change?</text>
  <rect x="330" y="180" width="180" height="42" rx="8" fill="var(--dg-b-soft)" stroke="var(--dg-b)" stroke-width="1.3"/>
  <text x="420" y="206" text-anchor="middle" font-size="11" fill="var(--dg-text)">CLI overrides</text>
  <rect x="530" y="180" width="190" height="42" rx="8" fill="var(--dg-d-soft)" stroke="var(--dg-d)" stroke-width="1.3"/>
  <text x="625" y="206" text-anchor="middle" font-size="11" fill="var(--dg-text)">Jinja2 template</text>
  <path d="M300 58 L300 80 L155 80 L155 108" fill="none" stroke="var(--dg-line)" stroke-width="1.3" marker-end="url(#tpl-arw2)"/>
  <path d="M440 58 L440 76 L565 76 L565 94" fill="none" stroke="var(--dg-line)" stroke-width="1.3" marker-end="url(#tpl-arw2)"/>
  <path d="M520 138 L520 158 L420 158 L420 178" fill="none" stroke="var(--dg-line)" stroke-width="1.3" marker-end="url(#tpl-arw2)"/>
  <path d="M610 138 L610 158 L625 158 L625 178" fill="none" stroke="var(--dg-line)" stroke-width="1.3" marker-end="url(#tpl-arw2)"/>
  <text x="200" y="74" font-size="10.5" fill="var(--dg-muted)">yes</text>
  <text x="500" y="70" font-size="10.5" fill="var(--dg-muted)">no</text>
  <text x="446" y="154" font-size="10.5" fill="var(--dg-muted)">no</text>
  <text x="640" y="154" font-size="10.5" fill="var(--dg-muted)">yes</text>
</svg>

## Validation and Integrity Checks

Validation of templated pipelines has three layers, and each catches a different class of mistake.

1. **Render-time.** Strict undefined variables and immediate `json.loads` catch missing parameters and quoting errors.
2. **Structure.** A JSON Schema or a few assertions encode team conventions: required stages, allowed writers, output extensions. See [schema-validating pipeline JSON before execution](https://www.pythonlidar.com/pdal-pipeline-architecture-execution/pipeline-validation/schema-validating-pipeline-json-before-execution/).
3. **PDAL.** `pdal pipeline --validate` checks stage names and options against the installed version. Run it in CI against every template with a representative parameter file, as in [validating PDAL pipelines in CI](https://www.pythonlidar.com/pdal-pipeline-architecture-execution/pipeline-validation/validating-pdal-pipelines-in-ci/).

<svg viewBox="0 0 740 200" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Three validation layers and the mistakes each one catches" style="width:100%;max-width:740px;display:block;margin:1.6rem auto">
  <title>Three layers, three kinds of mistake</title>
  <desc>Three stacked horizontal bands. The render layer catches missing parameters and broken quoting. The structure layer catches violations of team rules such as a missing noise filter or a wrong output extension. The PDAL layer catches unknown stages, misspelled options and options not supported by the installed version. An arrow shows a rendered pipeline passing down through all three before execution.</desc>
  <defs><marker id="tpl-arw3" markerWidth="9" markerHeight="7" refX="9" refY="3.5" orient="auto"><path d="M0,0 L0,7 L9,3.5 z" fill="var(--dg-line)"/></marker></defs>
  <rect x="0" y="0" width="740" height="200" fill="var(--dg-bg)" rx="10"/>
  <rect x="120" y="16" width="600" height="46" rx="8" fill="var(--dg-a-soft)" stroke="var(--dg-a)" stroke-width="1.3"/>
  <text x="140" y="36" font-size="11.5" font-weight="600" fill="var(--dg-text)">render</text>
  <text x="140" y="53" font-size="10.5" fill="var(--dg-muted)">missing parameters, broken quoting, invalid JSON</text>
  <rect x="120" y="76" width="600" height="46" rx="8" fill="var(--dg-b-soft)" stroke="var(--dg-b)" stroke-width="1.3"/>
  <text x="140" y="96" font-size="11.5" font-weight="600" fill="var(--dg-text)">structure</text>
  <text x="140" y="113" font-size="10.5" fill="var(--dg-muted)">team rules: noise filter first, writer last, allowed output formats</text>
  <rect x="120" y="136" width="600" height="46" rx="8" fill="var(--dg-d-soft)" stroke="var(--dg-d)" stroke-width="1.3"/>
  <text x="140" y="156" font-size="11.5" font-weight="600" fill="var(--dg-text)">PDAL</text>
  <text x="140" y="173" font-size="10.5" fill="var(--dg-muted)">unknown stages, misspelled options, options the installed version lacks</text>
  <line x1="60" y1="20" x2="60" y2="176" stroke="var(--dg-line)" stroke-width="1.6" marker-end="url(#tpl-arw3)"/>
  <text x="50" y="100" font-size="10.5" fill="var(--dg-muted)" transform="rotate(-90 50 100)" text-anchor="middle">rendered pipeline</text>
</svg>

The order matters for the quality of error messages as much as for correctness. A missing parameter reported as "undefined variable 'res'" is immediately actionable; the same mistake reported by PDAL as a failure to parse an empty resolution three stages into execution is not. Running the cheap, specific checks first means each failure is reported by the layer that understands it best.

It is also worth being explicit about what none of the layers catch: a pipeline that is valid but wrong. A slope of 0.15 where 0.5 was intended passes every check. The defence there is a small regression test on a reference tile — run the rendered pipeline and compare a few summary statistics of the output with stored values — which belongs in the same CI job as the validation.

A fourth, cheap check is determinism: render the same template and parameters twice and compare hashes. Anything that differs — a timestamp, an unordered set rendered into a list — will make provenance useless.

```python
def test_render_is_deterministic(tmp_path: Path) -> None:
    params = ProjectParams.load(Path("projects/county_north.yaml"))
    a = json.dumps(render("dtm.json.j2", Path("tiles/t1.laz"), params), sort_keys=True)
    b = json.dumps(render("dtm.json.j2", Path("tiles/t1.laz"), params), sort_keys=True)
    assert a == b
```

## Organizing Templates in a Repository

A layout that scales from one project to dozens keeps three things apart: templates, parameters and rendered output.

```text
pipelines/
  templates/
    dtm.json.j2
    dsm.json.j2
    classify.json.j2
  projects/
    county_north.yaml
    county_south.yaml
  schema/
    pipeline.schema.json
  tests/
    test_render.py
```

Templates change rarely and are reviewed like code. Parameter files change per project and are reviewed by whoever owns that project's specification. Rendered pipelines are never committed; they are build artefacts written beside outputs. Keeping the three apart means a pull request that edits a template is visibly different from one that edits a project, and a reviewer knows which kind of risk they are looking at.

Resist the temptation to put every conceivable option into the template. A template with forty placeholders is just the pipeline JSON with extra steps, and every placeholder is another value a parameter file can get wrong. Parameterize what has actually varied between projects; leave the rest literal until a real project needs it changed.

## Performance Tuning

Templating adds almost nothing to run time — rendering and validating a pipeline takes milliseconds, and `pdal pipeline --validate` well under a second. The performance levers are the ones parameterization makes easier to apply consistently.

- **Validate once per template and parameter set, not per tile.** Paths differ per tile but the stages and options do not; validating one rendered pipeline per project and then only substituting paths saves thousands of subprocess calls on a large batch.
- **Push per-tile values to CLI overrides.** For very large batches, render the project pipeline once to a file and loop `pdal pipeline dtm.json --readers.las.filename=... --writers.gdal.filename=...`. That avoids Python start-up per tile in shell-driven batch systems.
- **Parameterize tuning knobs.** Putting `chunk_size`, `threads` and resolution in the parameter file makes it trivial to run a quick benchmark across settings, as described in [optimizing PDAL for multi-core processing](https://www.pythonlidar.com/pdal-pipeline-architecture-execution/parallel-execution/optimizing-pdal-for-multi-core-processing/).

## Common Errors and Troubleshooting

**`json.decoder.JSONDecodeError: Expecting value`** after rendering. A placeholder rendered empty or a numeric value was quoted inconsistently. Print the rendered text around the reported column; with `StrictUndefined` a missing variable raises earlier, so this is almost always quoting.

**`PDAL: Unexpected argument 'windw'`** from `--validate`. A misspelled option in the template. Validation in CI catches it before a batch run does.

**CLI override ignored.** `--readers.las.filename` applies to every `readers.las` stage; if the pipeline has two, both are overridden. Tag stages and use `--stage.<tag>.filename` to target one.

**Different outputs from the same template.** Parameters loaded from YAML as strings in one project and floats in another render differently (`"1"` versus `1.0`). Type-convert in the loader, as the dataclass does.

**Template changes break old projects.** A template edit applies to every project on the next run. Version templates, and pin each project's parameter file to a template version when deliveries must be reproducible.

## Frequently Asked Questions

**Does PDAL support variables in pipeline JSON?**

Not as a templating language. PDAL supports overriding stage options from the command line, which covers per-run values like file names. For anything richer — computed values, conditionals, per-project defaults — render the JSON with a template engine or build it in Python.

**When should I use the Python stage API instead of templates?**

When the set of stages depends on logic: add a reprojection only if the CRS differs, add a noise filter only for certain sensors. Code expresses conditionals more clearly than template syntax, and the result can still be serialized to JSON for provenance.

**How do I know which pipeline produced an old output?**

Store the rendered, key-sorted pipeline JSON beside each output, or record its hash in the output's metadata. Combined with the template and parameter files in version control, that makes any deliverable traceable.

**Should parameter files be YAML, TOML or JSON?**

Any format that loads into typed values works. YAML is the most common for hand-edited project configuration because it allows comments, which is where the reason for an unusual threshold belongs. Whatever you choose, load it through one function that converts types and checks ranges, so every project is held to the same rules.

**Can I override an option on only one of two readers?**

Yes. Give each stage a tag in the JSON and override with the stage.tag.option form on the command line. Without tags, a type-based override applies to every stage of that type.

## Related

- [Parameterizing Pipelines with Jinja Templates](https://www.pythonlidar.com/pdal-pipeline-architecture-execution/pipeline-templating-parameterization/parameterizing-pipelines-with-jinja-templates/) — template design, filters and conditionals
- [Overriding Stage Options from the Command Line](https://www.pythonlidar.com/pdal-pipeline-architecture-execution/pipeline-templating-parameterization/overriding-stage-options-from-the-command-line/) — PDAL's built-in per-run parameters
- [Building Pipelines with the Python Stage API](https://www.pythonlidar.com/pdal-pipeline-architecture-execution/pipeline-templating-parameterization/building-pipelines-with-the-python-stage-api/) — composing stages in code
- [Pipeline Validation](https://www.pythonlidar.com/pdal-pipeline-architecture-execution/pipeline-validation/) — checking what you render
- [PDAL Stage Chaining](https://www.pythonlidar.com/pdal-pipeline-architecture-execution/pdal-stage-chaining/) — the pipeline shape being parameterized
