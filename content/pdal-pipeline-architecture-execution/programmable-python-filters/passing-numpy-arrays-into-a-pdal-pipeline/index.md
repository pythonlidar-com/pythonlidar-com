---
title: "Passing NumPy Arrays into a PDAL Pipeline"
description: "Run PDAL stages on points that already live in Python: build a structured array with PDAL dimension names and types, pass it with pdal.Pipeline(spec, arrays=[...]) or stage.pipeline(arr), chain several arrays, and write results to LAS or COPC."
slug: "passing-numpy-arrays-into-a-pdal-pipeline"
type: "howto"
breadcrumb: "NumPy Arrays into PDAL"
datePublished: "2026-09-18"
dateModified: "2026-09-18"
---

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Article",
      "headline": "Passing NumPy Arrays into a PDAL Pipeline",
      "description": "Run PDAL stages on points that already live in Python: build a structured array with PDAL dimension names and types, pass it with pdal.Pipeline(spec, arrays=[...]) or stage.pipeline(arr), chain several arrays, and write results to LAS or COPC.",
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
          "name": "Programmable Python Filters",
          "item": "https://www.pythonlidar.com/pdal-pipeline-architecture-execution/programmable-python-filters/"
        },
        {
          "@type": "ListItem",
          "position": 4,
          "name": "NumPy Arrays into PDAL",
          "item": "https://www.pythonlidar.com/pdal-pipeline-architecture-execution/programmable-python-filters/passing-numpy-arrays-into-a-pdal-pipeline/"
        }
      ]
    },
    {
      "@type": "HowTo",
      "name": "Pass NumPy arrays into a PDAL pipeline",
      "step": [
        {
          "@type": "HowToStep",
          "name": "Define a dtype with PDAL dimension names",
          "text": "Use PDAL's canonical names and sensible types. Unknown names are kept as custom dimensions; misspelled standard names (classification in lower case) become custom dimensions too, which is a common silent bug."
        },
        {
          "@type": "HowToStep",
          "name": "Fill the array",
          "text": "Copy coordinates and attributes from wherever they came from. Unset fields default to zero."
        },
        {
          "@type": "HowToStep",
          "name": "Build the pipeline without a reader",
          "text": "Write the stage list starting from the first filter, and pass arrays=[arr]."
        },
        {
          "@type": "HowToStep",
          "name": "Supply the CRS where needed",
          "text": "Set in_srs on filters.reprojection and a_srs on writers, because the array has no spatial reference."
        },
        {
          "@type": "HowToStep",
          "name": "Read the results",
          "text": "pipeline.arrays returns a list of output arrays \u2014 one per output view \u2014 with any new dimensions appended."
        }
      ]
    },
    {
      "@type": "FAQPage",
      "mainEntity": [
        {
          "@type": "Question",
          "name": "How do I pass a NumPy array to PDAL?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Build a structured array with PDAL dimension names as fields, then pass it with the arrays argument of pdal.Pipeline along with a pipeline that has no reader, or call a stage's pipeline method with the array. Execute and read the results from pipeline.arrays."
          }
        },
        {
          "@type": "Question",
          "name": "What dtype should X, Y and Z have?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Float64. PDAL stores coordinates as doubles internally, and writers convert them to scaled integers using the scale and offset you set."
          }
        },
        {
          "@type": "Question",
          "name": "Why did SMRF not update my classification field?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Probably because the field is named in a different case, such as lower-case classification, which PDAL treats as a separate custom dimension. Use the exact standard name Classification."
          }
        },
        {
          "@type": "Question",
          "name": "Can I write the array straight to COPC?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Yes. Put writers.copc at the end of the pipeline with a_srs set. The array is processed by any earlier stages and then written as a COPC file."
          }
        }
      ]
    }
  ]
}
</script>

**TL;DR:** Build a NumPy structured array whose field names are PDAL dimension names (`X`, `Y`, `Z` as `float64`, `Classification` as `uint8`, `Intensity` as `uint16` …), then either `pdal.Pipeline(json.dumps({"pipeline": [stages...]}), arrays=[arr])` with no reader in the spec, or `pdal.Filter.smrf().pipeline(arr)`. After `execute()`, results are in `pipeline.arrays`, and a writer stage can put them straight into LAS, LAZ or COPC.

## Context and Motivation

This guide is part of [Programmable Python Filters](https://www.pythonlidar.com/pdal-pipeline-architecture-execution/programmable-python-filters/). Points do not always start life in a LAS file. They come out of a photogrammetry library, a simulation, a CSV export from survey software, a deep-learning model that predicted classes, or a laspy script that already did half the work. Writing them to a temporary LAS just so PDAL can read them back wastes time and disk. The Python bindings accept arrays directly: the array takes the place of the reader, and every downstream stage — SMRF, HAG, reprojection, writers — behaves exactly as it would on file input.

The only rule is that PDAL has to recognize the array's fields as dimensions, which comes down to names and types.

<svg viewBox="0 26 740 150" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="A NumPy structured array feeding PDAL stages in place of a reader" style="width:100%;max-width:740px;display:block;margin:1.6rem auto">
  <title>The array replaces the reader</title>
  <desc>On the left, a NumPy structured array with fields X, Y, Z as float64 and Classification as uint8. It feeds directly into filters.smrf, then filters.hag_nn, then writers.las. No readers stage appears in the pipeline. After execution, pipeline.arrays returns an array with the original fields plus HeightAboveGround.</desc>
  <defs><marker id="np-arw" markerWidth="9" markerHeight="7" refX="9" refY="3.5" orient="auto"><path d="M0,0 L0,7 L9,3.5 z" fill="var(--dg-line)"/></marker></defs>
  <rect x="0" y="26" width="740" height="150" fill="var(--dg-bg)" rx="10"/>
  <rect x="20" y="44" width="180" height="110" rx="8" fill="var(--dg-a-soft)" stroke="var(--dg-a)" stroke-width="1.3"/>
  <text x="110" y="68" text-anchor="middle" font-size="11.5" font-weight="600" fill="var(--dg-text)">structured array</text>
  <text x="36" y="92" font-size="10.5" fill="var(--dg-text)">X, Y, Z   float64</text>
  <text x="36" y="112" font-size="10.5" fill="var(--dg-text)">Intensity   uint16</text>
  <text x="36" y="132" font-size="10.5" fill="var(--dg-text)">Classification   uint8</text>
  <rect x="250" y="78" width="110" height="40" rx="7" fill="var(--dg-surface)" stroke="var(--dg-line)" stroke-width="1.2"/>
  <text x="305" y="102" text-anchor="middle" font-size="10.5" fill="var(--dg-text)">filters.smrf</text>
  <rect x="390" y="78" width="120" height="40" rx="7" fill="var(--dg-surface)" stroke="var(--dg-line)" stroke-width="1.2"/>
  <text x="450" y="102" text-anchor="middle" font-size="10.5" fill="var(--dg-text)">filters.hag_nn</text>
  <rect x="540" y="78" width="180" height="40" rx="7" fill="var(--dg-d-soft)" stroke="var(--dg-d)" stroke-width="1.2"/>
  <text x="630" y="102" text-anchor="middle" font-size="10.5" fill="var(--dg-text)">writers.las / arrays</text>
  <line x1="200" y1="98" x2="246" y2="98" stroke="var(--dg-line)" stroke-width="1.4" marker-end="url(#np-arw)"/>
  <line x1="360" y1="98" x2="386" y2="98" stroke="var(--dg-line)" stroke-width="1.4" marker-end="url(#np-arw)"/>
  <line x1="510" y1="98" x2="536" y2="98" stroke="var(--dg-line)" stroke-width="1.4" marker-end="url(#np-arw)"/>
  <text x="250" y="160" font-size="10.5" fill="var(--dg-muted)">no readers.* stage — the array is the input</text>
</svg>

## Prerequisites and Assumptions

- `python-pdal` 3.x, which accepts `arrays=` in the `Pipeline` constructor and provides `stage.pipeline(arr)`.
- NumPy structured arrays (not plain 2D arrays); a 2D `(N, 3)` array has no field names for PDAL to map.
- Coordinates in a known CRS. Arrays carry no CRS, so stages that care — reprojection, writers — need it supplied explicitly.

## Step-by-Step Implementation

### Step 1 — Define a dtype with PDAL dimension names

Use PDAL's canonical names and sensible types. Unknown names are kept as custom dimensions; misspelled standard names (`classification` in lower case) become custom dimensions too, which is a common silent bug.

### Step 2 — Fill the array

Copy coordinates and attributes from wherever they came from. Unset fields default to zero.

### Step 3 — Build the pipeline without a reader

Write the stage list starting from the first filter, and pass `arrays=[arr]`.

### Step 4 — Supply the CRS where needed

Set `in_srs` on `filters.reprojection` and `a_srs` on writers, because the array has no spatial reference.

### Step 5 — Read the results

`pipeline.arrays` returns a list of output arrays — one per output view — with any new dimensions appended.

## Complete Working Example

Classifying ground on points from a photogrammetry export and writing LAZ and COPC:

```python
"""Feed an in-memory point set through SMRF and HAG, then write LAZ and COPC."""
from __future__ import annotations

import json

import numpy as np
import pandas as pd
import pdal

CRS = "EPSG:6347+5703"

DTYPE = np.dtype([
    ("X", "f8"), ("Y", "f8"), ("Z", "f8"),
    ("Intensity", "u2"), ("Red", "u2"), ("Green", "u2"), ("Blue", "u2"),
    ("Classification", "u1"), ("ReturnNumber", "u1"), ("NumberOfReturns", "u1"),
])


def from_csv(path: str) -> np.ndarray:
    df = pd.read_csv(path, usecols=["x", "y", "z", "r", "g", "b"])
    arr = np.zeros(len(df), dtype=DTYPE)
    arr["X"], arr["Y"], arr["Z"] = df.x, df.y, df.z
    # 8-bit colour from the export scaled to the 16-bit range LAS expects.
    arr["Red"], arr["Green"], arr["Blue"] = df.r * 257, df.g * 257, df.b * 257
    arr["ReturnNumber"] = 1
    arr["NumberOfReturns"] = 1
    arr["Classification"] = 1
    return arr


def classify(arr: np.ndarray) -> np.ndarray:
    stages = [
        {"type": "filters.outlier", "method": "statistical", "mean_k": 12, "multiplier": 2.5},
        {"type": "filters.range", "limits": "Classification![7:7]"},
        {"type": "filters.smrf", "slope": 0.2, "window": 16, "threshold": 0.45, "cell": 0.5},
        {"type": "filters.hag_nn", "count": 2},
        {"type": "writers.las", "filename": "out/site_ground.laz", "a_srs": CRS,
         "minor_version": 4, "dataformat_id": 7, "extra_dims": "HeightAboveGround=float"},
        {"type": "writers.copc", "filename": "out/site_ground.copc.laz", "a_srs": CRS},
    ]
    p = pdal.Pipeline(json.dumps({"pipeline": stages}), arrays=[arr])
    n = p.execute()
    out = p.arrays[0]
    print(f"{n:,} points; ground share {(out['Classification'] == 2).mean():.1%}")
    return out


if __name__ == "__main__":
    classify(from_csv("exports/site_dense_cloud.csv"))
```

The same run with the stage API — one line for a single filter:

```python
ground = pdal.Filter.smrf(slope=0.2, window=16, threshold=0.45).pipeline(arr)
ground.execute()
result = ground.arrays[0]
```

<svg viewBox="0 0 740 190" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Correct and incorrect field names and what PDAL does with each" style="width:100%;max-width:740px;display:block;margin:1.6rem auto">
  <title>Names decide what PDAL sees</title>
  <desc>A table of four array fields. X with float64 is recognized as the standard X dimension. Classification with uint8 is recognized as standard Classification. classification in lower case is kept as an unrelated custom dimension, so SMRF writes to a different Classification field. intensity in lower case is likewise custom and ignored by stages that read Intensity.</desc>
  <rect x="0" y="0" width="740" height="190" fill="var(--dg-bg)" rx="10"/>
  <g font-size="10.5" fill="var(--dg-text)">
    <rect x="20" y="20" width="700" height="34" fill="var(--dg-d-soft)"/><text x="36" y="42">X (float64)</text><text x="300" y="42">standard dimension X</text>
    <rect x="20" y="58" width="700" height="34" fill="var(--dg-d-soft)"/><text x="36" y="80">Classification (uint8)</text><text x="300" y="80">standard Classification — SMRF writes here</text>
    <rect x="20" y="96" width="700" height="34" fill="var(--dg-e-soft)"/><text x="36" y="118">classification (uint8)</text><text x="300" y="118">custom dimension — SMRF ignores it, adds its own</text>
    <rect x="20" y="134" width="700" height="34" fill="var(--dg-e-soft)"/><text x="36" y="156">intensity (uint16)</text><text x="300" y="156">custom dimension — writers do not map it to Intensity</text>
  </g>
</svg>

## Key Parameter Table

| Dimension | Recommended type | Notes |
|---|---|---|
| `X`, `Y`, `Z` | `f8` | Always doubles; writers apply scale and offset |
| `Intensity` | `u2` | 16-bit in LAS |
| `Classification` | `u1` | ASPRS codes 0–255 |
| `ReturnNumber`, `NumberOfReturns` | `u1` | Set to 1 for single-return sources |
| `Red`, `Green`, `Blue` | `u2` | 16-bit; scale 8-bit colour by 257 |
| `GpsTime` | `f8` | Optional; zero if unknown |
| custom fields | any | Kept as extra dimensions; write with `extra_dims` |

## Verification

- **Round trip.** Write the array to LAS through a writer stage, read it back with a reader, and compare fields; coordinates should match to within the writer's scale.
- **Dimension names.** Print `p.arrays[0].dtype.names` after execution. Any duplicate-looking names (`Classification` and `classification`) indicate a naming mistake.
- **CRS in output.** `pdal info --metadata out/site_ground.laz` must show the CRS given in `a_srs`.

```python
names = p.arrays[0].dtype.names
lower = [n for n in names if n.lower() in {"classification", "intensity"} and n not in
         {"Classification", "Intensity"}]
assert not lower, f"mis-cased dimension names: {lower}"
```

## Gotchas and Edge Cases

**Plain 2D arrays.** `np.column_stack([x, y, z])` has no field names and cannot be passed as a PDAL array. Convert with `np.core.records.fromarrays` or build a structured array as above.

**Missing CRS.** Reprojection needs `in_srs` and writers need `a_srs` when input comes from arrays. Without them, the output file has no CRS and every downstream tool guesses.

**Multiple arrays.** `arrays=[a, b]` passes two input views; follow them with `filters.merge` if the next stage should see them together, exactly as with multiple readers.

**Large arrays and memory.** Passing an array does not copy it into a file, but PDAL builds its own point table from it, so memory holds both for the run. For very large arrays, write to LAZ in chunks with laspy and let PDAL stream from the file instead.

<svg viewBox="40 0 640 140" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Memory held when passing a large array to PDAL" style="width:100%;max-width:740px;display:block;margin:1.6rem auto">
  <title>Two copies for the duration of the run</title>
  <desc>Stacked bars of memory for a 50 million point array. The NumPy array itself takes about 2 gigabytes. PDAL's point table built from it takes another 2.4. The output array returned in pipeline.arrays adds 2.6 including new dimensions. A note suggests releasing the input array after execution or using a file for very large sets.</desc>
  <rect x="40" y="0" width="640" height="140" fill="var(--dg-bg)" rx="10"/>
  <rect x="60" y="50" width="160" height="40" fill="var(--dg-a-soft)" stroke="var(--dg-a)" stroke-width="1.2"/>
  <rect x="220" y="50" width="192" height="40" fill="var(--dg-b-soft)" stroke="var(--dg-b)" stroke-width="1.2"/>
  <rect x="412" y="50" width="208" height="40" fill="var(--dg-c-soft)" stroke="var(--dg-c)" stroke-width="1.2"/>
  <text x="140" y="75" text-anchor="middle" font-size="10.5" fill="var(--dg-text)">input array 2.0 GB</text>
  <text x="316" y="75" text-anchor="middle" font-size="10.5" fill="var(--dg-text)">PDAL table 2.4 GB</text>
  <text x="516" y="75" text-anchor="middle" font-size="10.5" fill="var(--dg-text)">output arrays 2.6 GB</text>
  <text x="60" y="32" font-size="10.5" fill="var(--dg-muted)">illustrative 50 M points with ten dimensions</text>
  <text x="60" y="126" font-size="10.5" fill="var(--dg-muted)">release the input with del arr after execute(), or stream from a file for very large sets</text>
</svg>

## Frequently Asked Questions

**How do I pass a NumPy array to PDAL?**

Build a structured array with PDAL dimension names as fields, then pass it with the arrays argument of pdal.Pipeline along with a pipeline that has no reader, or call a stage's pipeline method with the array. Execute and read the results from pipeline.arrays.

**What dtype should X, Y and Z have?**

Float64. PDAL stores coordinates as doubles internally, and writers convert them to scaled integers using the scale and offset you set.

**Why did SMRF not update my classification field?**

Probably because the field is named in a different case, such as lower-case classification, which PDAL treats as a separate custom dimension. Use the exact standard name Classification.

**Can I write the array straight to COPC?**

Yes. Put writers.copc at the end of the pipeline with a_srs set. The array is processed by any earlier stages and then written as a COPC file.

## Related

- [Programmable Python Filters](https://www.pythonlidar.com/pdal-pipeline-architecture-execution/programmable-python-filters/) — Python inside PDAL, the reverse direction
- [Writing a filters.python Stage with NumPy](https://www.pythonlidar.com/pdal-pipeline-architecture-execution/programmable-python-filters/writing-a-filters-python-stage-with-numpy/) — per-view Python code in a pipeline
- [Building Pipelines with the Python Stage API](https://www.pythonlidar.com/pdal-pipeline-architecture-execution/pipeline-templating-parameterization/building-pipelines-with-the-python-stage-api/) — stage.pipeline(arr) and composition
- [Reading LAS into NumPy with laspy](https://www.pythonlidar.com/point-cloud-data-standards-fundamentals/laspy-numpy-workflows/reading-las-into-numpy-with-laspy/) — getting arrays from files without PDAL
- [Running SMRF on Photogrammetric Point Clouds](https://www.pythonlidar.com/ground-filtering-dtm-dsm-generation/smrf-ground-classification/running-smrf-on-photogrammetric-point-clouds/) — the photogrammetry case in depth
