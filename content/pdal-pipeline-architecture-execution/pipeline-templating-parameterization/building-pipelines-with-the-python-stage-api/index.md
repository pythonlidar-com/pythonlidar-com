---
title: "Building Pipelines with the Python Stage API"
description: "Compose PDAL pipelines in Python with pdal.Reader, pdal.Filter and pdal.Writer and the | operator: conditional stages, reusable stage factories, serializing to JSON for provenance, and feeding NumPy arrays into a stage chain."
slug: "building-pipelines-with-the-python-stage-api"
type: "howto"
breadcrumb: "Python Stage API"
datePublished: "2026-09-18"
dateModified: "2026-09-18"
---

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Article",
      "headline": "Building Pipelines with the Python Stage API",
      "description": "Compose PDAL pipelines in Python with pdal.Reader, pdal.Filter and pdal.Writer and the | operator: conditional stages, reusable stage factories, serializing to JSON for provenance, and feeding NumPy arrays into a stage chain.",
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
          "name": "Python Stage API",
          "item": "https://www.pythonlidar.com/pdal-pipeline-architecture-execution/pipeline-templating-parameterization/building-pipelines-with-the-python-stage-api/"
        }
      ]
    },
    {
      "@type": "HowTo",
      "name": "Build PDAL pipelines in Python with the stage API",
      "step": [
        {
          "@type": "HowToStep",
          "name": "Create stages with typed keyword arguments",
          "text": "pdal.Filter.smrf(slope=0.15, window=18.0) creates a stage; attribute access names the stage type, keyword arguments become options."
        },
        {
          "@type": "HowToStep",
          "name": "Compose with the pipe operator",
          "text": "a | b joins stages into a Pipeline; piping a pipeline with another stage appends to it."
        },
        {
          "@type": "HowToStep",
          "name": "Build conditionally",
          "text": "Start from the reader, then add stages in if blocks. The result is always a valid linear chain."
        },
        {
          "@type": "HowToStep",
          "name": "Wrap recurring chains in factories",
          "text": "A function returning a stage or a short chain \u2014 noise_removal(), ground_only() \u2014 keeps options consistent across projects and makes them testable."
        },
        {
          "@type": "HowToStep",
          "name": "Serialize for provenance",
          "text": "pipeline.pipeline returns the JSON string. Write it next to the output before or after executing."
        }
      ]
    },
    {
      "@type": "FAQPage",
      "mainEntity": [
        {
          "@type": "Question",
          "name": "Which python-pdal version supports the stage API?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "The Reader, Filter and Writer classes and the pipe operator arrived with python-pdal 3.x. Earlier versions accept only JSON strings passed to pdal.Pipeline."
          }
        },
        {
          "@type": "Question",
          "name": "How do I get JSON out of a pipeline built with the stage API?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Read the pipeline property of the Pipeline object; it returns the equivalent JSON string, which you can parse, store or validate with the PDAL command-line tool."
          }
        },
        {
          "@type": "Question",
          "name": "Can I mix JSON and stage objects?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Yes. Construct a Pipeline from JSON and pipe additional stage objects onto it, or build the core in code and serialize it. Both produce the same underlying pipeline."
          }
        },
        {
          "@type": "Question",
          "name": "Is the stage API slower than JSON?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "No. It only constructs the same pipeline description; execution happens in PDAL's C++ code exactly as it does for JSON input."
          }
        }
      ]
    }
  ]
}
</script>

**TL;DR:** With `python-pdal` 3.x, `pdal.Reader.las(filename="in.laz") | pdal.Filter.smrf(slope=0.15) | pdal.Writer.las(filename="out.laz")` builds a `pdal.Pipeline` directly — no JSON strings. Wrap common chains in small factory functions, add stages conditionally with plain `if` statements, and write `pipeline.pipeline` (the JSON form) beside each output for provenance.

## Context and Motivation

This guide is part of [PDAL Pipeline Templating and Parameterization](https://www.pythonlidar.com/pdal-pipeline-architecture-execution/pipeline-templating-parameterization/). The stage API is the most Pythonic way to parameterize a pipeline, because there is nothing to render: stages are objects, options are keyword arguments, and conditional structure is ordinary Python. It suits code that already decides things at run time — reproject only if the CRS differs, add an outlier filter only for one sensor, choose a writer by output extension — and it is the easiest form to unit test.

The trade-off is that the pipeline no longer lives in a file a non-programmer can read. That is solved by serializing the composed pipeline to JSON and storing it beside each output, which also keeps provenance intact.

<svg viewBox="0 0 740 200" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Stage objects joined with the pipe operator into a Pipeline" style="width:100%;max-width:740px;display:block;margin:1.6rem auto">
  <title>Stages as objects, pipelines by composition</title>
  <desc>Three stage objects — Reader.las, Filter.smrf and Writer.gdal — joined by pipe operators into one Pipeline object. Below, the Pipeline exposes three things: execute to run it, arrays and metadata for results, and the pipeline property that returns the equivalent JSON.</desc>
  <rect x="0" y="0" width="740" height="200" fill="var(--dg-bg)" rx="10"/>
  <rect x="20" y="30" width="170" height="44" rx="8" fill="var(--dg-a-soft)" stroke="var(--dg-a)" stroke-width="1.3"/>
  <text x="105" y="57" text-anchor="middle" font-size="11" fill="var(--dg-text)">Reader.las(...)</text>
  <text x="222" y="58" text-anchor="middle" font-size="16" fill="var(--dg-muted)">|</text>
  <rect x="255" y="30" width="190" height="44" rx="8" fill="var(--dg-b-soft)" stroke="var(--dg-b)" stroke-width="1.3"/>
  <text x="350" y="57" text-anchor="middle" font-size="11" fill="var(--dg-text)">Filter.smrf(slope=0.15)</text>
  <text x="478" y="58" text-anchor="middle" font-size="16" fill="var(--dg-muted)">|</text>
  <rect x="510" y="30" width="210" height="44" rx="8" fill="var(--dg-d-soft)" stroke="var(--dg-d)" stroke-width="1.3"/>
  <text x="615" y="57" text-anchor="middle" font-size="11" fill="var(--dg-text)">Writer.gdal(resolution=1.0)</text>
  <rect x="160" y="110" width="420" height="72" rx="9" fill="var(--dg-surface)" stroke="var(--dg-line)" stroke-width="1.3"/>
  <text x="370" y="132" text-anchor="middle" font-size="12" font-weight="600" fill="var(--dg-text)">pdal.Pipeline</text>
  <text x="370" y="152" text-anchor="middle" font-size="10.5" fill="var(--dg-muted)">.execute() · .arrays · .metadata · .log</text>
  <text x="370" y="170" text-anchor="middle" font-size="10.5" fill="var(--dg-muted)">.pipeline → the equivalent JSON</text>
  <line x1="370" y1="78" x2="370" y2="106" stroke="var(--dg-line)" stroke-width="1.4"/>
</svg>

## Prerequisites and Assumptions

- `python-pdal` 3.x (`pip install pdal` or conda-forge `python-pdal`), which provides `pdal.Reader`, `pdal.Filter` and `pdal.Writer`.
- PDAL 2.4+ underneath; stage names and options are PDAL's own, so the stage API exposes whatever the installed PDAL supports.
- Familiarity with the equivalent JSON form — the API is a thin layer over it.

## Step-by-Step Implementation

### Step 1 — Create stages with typed keyword arguments

`pdal.Filter.smrf(slope=0.15, window=18.0)` creates a stage; attribute access names the stage type, keyword arguments become options.

### Step 2 — Compose with the pipe operator

`a | b` joins stages into a `Pipeline`; piping a pipeline with another stage appends to it.

### Step 3 — Build conditionally

Start from the reader, then add stages in `if` blocks. The result is always a valid linear chain.

### Step 4 — Wrap recurring chains in factories

A function returning a stage or a short chain — `noise_removal()`, `ground_only()` — keeps options consistent across projects and makes them testable.

### Step 5 — Serialize for provenance

`pipeline.pipeline` returns the JSON string. Write it next to the output before or after executing.

## Complete Working Example

```python
"""Compose a DTM pipeline with the PDAL Python stage API."""
from __future__ import annotations

import json
from pathlib import Path

import pdal


def noise_removal() -> pdal.Pipeline:
    return (pdal.Filter.range(limits="Classification![7:7],Classification![18:18]")
            | pdal.Filter.outlier(method="statistical", mean_k=12, multiplier=2.5))


def ground(slope: float = 0.15, window: float = 18.0) -> pdal.Pipeline:
    return (pdal.Filter.smrf(slope=slope, window=window, threshold=0.5, scalar=1.25)
            | pdal.Filter.range(limits="Classification[2:2]"))


def dtm_pipeline(src: Path, dst: Path, *, target_crs: str | None, source_crs: str,
                 resolution: float, steep: bool = False) -> pdal.Pipeline:
    p = pdal.Reader.las(filename=str(src), default_srs=source_crs) | noise_removal()
    if target_crs and target_crs != source_crs:
        p |= pdal.Filter.reprojection(out_srs=target_crs)
    p |= ground(slope=0.35, window=12.0) if steep else ground()
    p |= pdal.Writer.gdal(filename=str(dst), resolution=resolution, output_type="idw",
                          window_size=6, data_type="float32",
                          gdalopts="COMPRESS=DEFLATE,TILED=YES")
    return p


def run(src: Path, out_dir: Path, **kwargs) -> int:
    out_dir.mkdir(parents=True, exist_ok=True)
    dst = out_dir / f"{src.stem}_dtm.tif"
    pipeline = dtm_pipeline(src, dst, **kwargs)
    spec = json.loads(pipeline.pipeline)
    (out_dir / f"{src.stem}.pipeline.json").write_text(json.dumps(spec, indent=2, sort_keys=True))
    n = pipeline.execute()
    print(f"{src.name}: {n} points -> {dst.name}")
    print(" -> ".join(s["type"] for s in spec["pipeline"]))
    return n


if __name__ == "__main__":
    run(Path("tiles/t_0431.laz"), Path("out"), target_crs="EPSG:6347",
        source_crs="EPSG:26918", resolution=1.0, steep=True)
```

Expected console output:

```text
t_0431.laz: 18422907 points -> t_0431_dtm.tif
readers.las -> filters.range -> filters.outlier -> filters.reprojection -> filters.smrf -> filters.range -> writers.gdal
```

The executed count is the number of points reaching the end of the chain, which here is only the ground points written to the raster.

<svg viewBox="0 0 740 210" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Conditional branches producing different stage chains" style="width:100%;max-width:740px;display:block;margin:1.6rem auto">
  <title>Plain if statements shape the chain</title>
  <desc>A flow from the reader through noise removal. A decision on whether the target CRS differs adds a reprojection stage or skips it. A second decision on steep terrain selects SMRF with slope 0.35 and window 12, or the default slope 0.15 and window 18. Both paths end at the same writer.</desc>
  <defs><marker id="api-arw" markerWidth="9" markerHeight="7" refX="9" refY="3.5" orient="auto"><path d="M0,0 L0,7 L9,3.5 z" fill="var(--dg-line)"/></marker></defs>
  <rect x="0" y="0" width="740" height="210" fill="var(--dg-bg)" rx="10"/>
  <rect x="16" y="84" width="110" height="40" rx="7" fill="var(--dg-a-soft)" stroke="var(--dg-a)" stroke-width="1.2"/>
  <text x="71" y="108" text-anchor="middle" font-size="10.5" fill="var(--dg-text)">reader + noise</text>
  <rect x="160" y="84" width="120" height="40" rx="7" fill="var(--dg-surface)" stroke="var(--dg-line)" stroke-width="1.2"/>
  <text x="220" y="108" text-anchor="middle" font-size="10.5" fill="var(--dg-text)">CRS differs?</text>
  <rect x="310" y="24" width="130" height="40" rx="7" fill="var(--dg-b-soft)" stroke="var(--dg-b)" stroke-width="1.2"/>
  <text x="375" y="48" text-anchor="middle" font-size="10.5" fill="var(--dg-text)">reprojection</text>
  <rect x="470" y="84" width="110" height="40" rx="7" fill="var(--dg-surface)" stroke="var(--dg-line)" stroke-width="1.2"/>
  <text x="525" y="108" text-anchor="middle" font-size="10.5" fill="var(--dg-text)">steep?</text>
  <rect x="610" y="30" width="120" height="40" rx="7" fill="var(--dg-c-soft)" stroke="var(--dg-c)" stroke-width="1.2"/>
  <text x="670" y="54" text-anchor="middle" font-size="10.5" fill="var(--dg-text)">smrf 0.35 / 12</text>
  <rect x="610" y="140" width="120" height="40" rx="7" fill="var(--dg-d-soft)" stroke="var(--dg-d)" stroke-width="1.2"/>
  <text x="670" y="164" text-anchor="middle" font-size="10.5" fill="var(--dg-text)">smrf 0.15 / 18</text>
  <line x1="126" y1="104" x2="158" y2="104" stroke="var(--dg-line)" stroke-width="1.3" marker-end="url(#api-arw)"/>
  <path d="M220 84 L220 44 L308 44" fill="none" stroke="var(--dg-line)" stroke-width="1.3" marker-end="url(#api-arw)"/>
  <path d="M440 44 L525 44 L525 82" fill="none" stroke="var(--dg-line)" stroke-width="1.3" marker-end="url(#api-arw)"/>
  <line x1="280" y1="104" x2="468" y2="104" stroke="var(--dg-line)" stroke-width="1.3" marker-end="url(#api-arw)"/>
  <path d="M580 96 L595 96 L595 50 L608 50" fill="none" stroke="var(--dg-line)" stroke-width="1.3" marker-end="url(#api-arw)"/>
  <path d="M580 112 L595 112 L595 160 L608 160" fill="none" stroke="var(--dg-line)" stroke-width="1.3" marker-end="url(#api-arw)"/>
  <text x="228" y="70" font-size="10" fill="var(--dg-muted)">yes</text>
  <text x="360" y="120" font-size="10" fill="var(--dg-muted)">no</text>
  <text x="560" y="40" font-size="10" fill="var(--dg-muted)">yes</text>
  <text x="560" y="140" font-size="10" fill="var(--dg-muted)">no</text>
</svg>

## Stage Factories as a Shared Library

The factories in the example — `noise_removal()` and `ground()` — are the real payoff of the stage API. Once a team has a small module of them, every new pipeline is assembled from pieces that are already reviewed, tested and tuned, and a change to how noise is removed lands in every workflow the next time it runs.

A few conventions keep such a module healthy. Give every factory keyword-only arguments with defaults that match your standard specification, so the common case needs no arguments and unusual cases are visible at the call site. Return a `Pipeline` even for single stages, so callers can always use `|` without caring how many stages a factory contains. Keep factories free of file paths; readers and writers belong to the calling workflow, while factories describe processing. And test each factory in isolation by piping a tiny synthetic array through it, which the `stage.pipeline(arr)` form makes easy.

```python
import numpy as np

def test_noise_removal_drops_class_7() -> None:
    pts = np.zeros(4, dtype=[("X", "f8"), ("Y", "f8"), ("Z", "f8"), ("Classification", "u1")])
    pts["X"] = [0, 1, 2, 3]
    pts["Classification"] = [2, 7, 1, 18]
    p = pdal.Filter.range(limits="Classification![7:7],Classification![18:18]").pipeline(pts)
    p.execute()
    assert sorted(p.arrays[0]["Classification"].tolist()) == [1, 2]
```

## Key Parameter Table

| API element | Example | Notes |
|---|---|---|
| `pdal.Reader.<type>` | `pdal.Reader.las(filename=...)` | Any reader PDAL knows; `pdal.Reader("x.laz")` infers type |
| `pdal.Filter.<type>` | `pdal.Filter.hag_nn(count=2)` | Options as keyword arguments |
| `pdal.Writer.<type>` | `pdal.Writer.copc(filename=...)` | Writers end a chain |
| `a \| b` | stage or pipeline on either side | Returns a new `Pipeline` |
| `p \|= stage` | in-place append | Convenient inside `if` blocks |
| `p.pipeline` | JSON string | For provenance and validation |
| `stage.pipeline(arr)` | `pdal.Filter.smrf().pipeline(arr)` | Run a chain on a NumPy structured array |

## Verification

- **Compare with the JSON you expect.** In a unit test, build the pipeline with fixed arguments and compare `json.loads(p.pipeline)` against a committed expected structure.
- **Validate with PDAL.** Write `p.pipeline` to a file and run `pdal pipeline --validate` in CI.
- **Check the stage order.** Print the stage types after construction; a missing `|=` inside a branch is easy to miss by reading code.

```python
def test_steep_uses_steep_smrf(tmp_path: Path) -> None:
    p = dtm_pipeline(Path("a.laz"), tmp_path / "a.tif", target_crs=None,
                     source_crs="EPSG:6347", resolution=1.0, steep=True)
    stages = json.loads(p.pipeline)["pipeline"]
    smrf = next(s for s in stages if s["type"] == "filters.smrf")
    assert smrf["slope"] == 0.35 and smrf["window"] == 12.0
    assert not any(s["type"] == "filters.reprojection" for s in stages)
```

## Gotchas and Edge Cases

**Options pass through unchecked until execution.** A misspelled keyword such as `windw=18` is accepted by the Python object and only rejected by PDAL when the pipeline is validated or executed. Validate the serialized JSON in tests.

**Non-linear pipelines need tags.** The `|` operator builds linear chains. Branching pipelines with `inputs` and `tag` are possible by passing `tag=` and `inputs=` as options, but they are easier to read as JSON; see [branching a PDAL pipeline with tags](https://www.pythonlidar.com/pdal-pipeline-architecture-execution/pdal-stage-chaining/branching-a-pdal-pipeline-with-tags/).

**Older bindings.** `python-pdal` 2.x only accepts JSON strings. Pin 3.x in your environment and container so the stage API is guaranteed to exist.

<svg viewBox="0 24 740 146" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Where a misspelled option is caught" style="width:100%;max-width:740px;display:block;margin:1.6rem auto">
  <title>When a typo surfaces</title>
  <desc>A timeline of four moments: constructing the stage object, composing the pipeline, validating the serialized JSON, and executing. A misspelled option passes the first two silently and is caught at validation; without validation it fails only at execution, possibly deep into a batch run.</desc>
  <rect x="0" y="24" width="740" height="146" fill="var(--dg-bg)" rx="10"/>
  <line x1="40" y1="80" x2="700" y2="80" stroke="var(--dg-line)" stroke-width="1.4"/>
  <circle cx="100" cy="80" r="8" fill="var(--dg-surface)" stroke="var(--dg-line)" stroke-width="1.4"/>
  <circle cx="270" cy="80" r="8" fill="var(--dg-surface)" stroke="var(--dg-line)" stroke-width="1.4"/>
  <circle cx="450" cy="80" r="8" fill="var(--dg-d-soft)" stroke="var(--dg-d)" stroke-width="1.8"/>
  <circle cx="630" cy="80" r="8" fill="var(--dg-e-soft)" stroke="var(--dg-e)" stroke-width="1.8"/>
  <text x="100" y="56" text-anchor="middle" font-size="10.5" fill="var(--dg-text)">Filter.smrf(windw=18)</text>
  <text x="270" y="56" text-anchor="middle" font-size="10.5" fill="var(--dg-text)">reader | smrf | writer</text>
  <text x="450" y="56" text-anchor="middle" font-size="10.5" fill="var(--dg-text)">pdal --validate</text>
  <text x="630" y="56" text-anchor="middle" font-size="10.5" fill="var(--dg-text)">execute()</text>
  <text x="100" y="108" text-anchor="middle" font-size="10" fill="var(--dg-muted)">accepted</text>
  <text x="270" y="108" text-anchor="middle" font-size="10" fill="var(--dg-muted)">accepted</text>
  <text x="450" y="108" text-anchor="middle" font-size="10" fill="var(--dg-d)">caught here in CI</text>
  <text x="630" y="108" text-anchor="middle" font-size="10" fill="var(--dg-e)">or here, mid-batch</text>
  <text x="40" y="150" font-size="10.5" fill="var(--dg-muted)">validate the serialized JSON in tests so the typo never reaches a production run</text>
</svg>

## Frequently Asked Questions

**Which python-pdal version supports the stage API?**

The Reader, Filter and Writer classes and the pipe operator arrived with python-pdal 3.x. Earlier versions accept only JSON strings passed to pdal.Pipeline.

**How do I get JSON out of a pipeline built with the stage API?**

Read the pipeline property of the Pipeline object; it returns the equivalent JSON string, which you can parse, store or validate with the PDAL command-line tool.

**Can I mix JSON and stage objects?**

Yes. Construct a Pipeline from JSON and pipe additional stage objects onto it, or build the core in code and serialize it. Both produce the same underlying pipeline.

**Is the stage API slower than JSON?**

No. It only constructs the same pipeline description; execution happens in PDAL's C++ code exactly as it does for JSON input.

## Related

- [PDAL Pipeline Templating and Parameterization](https://www.pythonlidar.com/pdal-pipeline-architecture-execution/pipeline-templating-parameterization/) — choosing a mechanism
- [Parameterizing Pipelines with Jinja Templates](https://www.pythonlidar.com/pdal-pipeline-architecture-execution/pipeline-templating-parameterization/parameterizing-pipelines-with-jinja-templates/) — the file-based alternative
- [Overriding Stage Options from the Command Line](https://www.pythonlidar.com/pdal-pipeline-architecture-execution/pipeline-templating-parameterization/overriding-stage-options-from-the-command-line/) — per-run values without code
- [Passing NumPy Arrays into a PDAL Pipeline](https://www.pythonlidar.com/pdal-pipeline-architecture-execution/programmable-python-filters/passing-numpy-arrays-into-a-pdal-pipeline/) — running stage chains on arrays
- [Testing PDAL Pipelines with pytest](https://www.pythonlidar.com/pdal-pipeline-architecture-execution/pipeline-validation/testing-pdal-pipelines-with-pytest/) — tests for composed pipelines
