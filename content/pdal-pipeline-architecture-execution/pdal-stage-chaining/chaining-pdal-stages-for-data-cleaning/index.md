---
title: "Chaining PDAL Stages for Data Cleaning"
description: "Step-by-step guide to chaining PDAL readers, filters, and writers in Python for noise removal, outlier rejection, and classification refinement — with a complete runnable example."
slug: "chaining-pdal-stages-for-data-cleaning"
type: "long_tail"
breadcrumb:
  - label: "PDAL Pipeline Architecture & Execution"
    url: "/pdal-pipeline-architecture-execution/"
  - label: "PDAL Stage Chaining"
    url: "/pdal-pipeline-architecture-execution/pdal-stage-chaining/"
  - label: "Chaining PDAL Stages for Data Cleaning"
    url: "/pdal-pipeline-architecture-execution/pdal-stage-chaining/chaining-pdal-stages-for-data-cleaning/"
datePublished: "2024-11-15"
dateModified: "2026-06-24"
---

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Article",
      "headline": "Chaining PDAL Stages for Data Cleaning",
      "description": "Step-by-step guide to chaining PDAL readers, filters, and writers in Python for noise removal, outlier rejection, and classification refinement — with a complete runnable example.",
      "datePublished": "2024-11-15",
      "dateModified": "2026-06-24",
      "author": { "@type": "Organization", "name": "pythonlidar.com" }
    },
    {
      "@type": "BreadcrumbList",
      "itemListElement": [
        { "@type": "ListItem", "position": 1, "name": "PDAL Pipeline Architecture & Execution", "item": "https://pythonlidar.com/pdal-pipeline-architecture-execution/" },
        { "@type": "ListItem", "position": 2, "name": "PDAL Stage Chaining", "item": "https://pythonlidar.com/pdal-pipeline-architecture-execution/pdal-stage-chaining/" },
        { "@type": "ListItem", "position": 3, "name": "Chaining PDAL Stages for Data Cleaning", "item": "https://pythonlidar.com/pdal-pipeline-architecture-execution/pdal-stage-chaining/chaining-pdal-stages-for-data-cleaning/" }
      ]
    },
    {
      "@type": "HowTo",
      "name": "Chain PDAL Stages for Data Cleaning",
      "description": "Build a deterministic LiDAR cleaning pipeline by ordering PDAL readers, outlier filters, range clamps, classification assignments, and writers.",
      "step": [
        { "@type": "HowToStep", "position": 1, "name": "Declare the reader with a spatial reference", "text": "Start the pipeline with readers.las and set spatialreference to anchor the CRS." },
        { "@type": "HowToStep", "position": 2, "name": "Reproject if needed", "text": "Insert filters.reprojection or filters.assign before geometric filters to standardise units and vertical datums." },
        { "@type": "HowToStep", "position": 3, "name": "Apply geometric range clamps", "text": "Use filters.range to remove points outside valid elevation and scan-angle bounds." },
        { "@type": "HowToStep", "position": 4, "name": "Remove statistical outliers", "text": "Add filters.outlier with method statistical to flag isolated noise and atmospheric scatter." },
        { "@type": "HowToStep", "position": 5, "name": "Refine classification", "text": "Use filters.assign to set or override classification codes based on cleaned geometry." },
        { "@type": "HowToStep", "position": 6, "name": "Write compressed output", "text": "Terminate the chain with writers.las and compression true to produce a clean LAZ file." }
      ]
    },
    {
      "@type": "FAQPage",
      "mainEntity": [
        {
          "@type": "Question",
          "name": "What order should PDAL filters run in a cleaning pipeline?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Apply coordinate normalisation first, then geometric range clamps, then statistical outlier removal, then classification updates. Running outlier filters before range clamps wastes cycles on points that will be discarded anyway."
          }
        },
        {
          "@type": "Question",
          "name": "Does PDAL write intermediate files when stages are chained?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "No. PDAL passes a shared PointView buffer between stages entirely in memory. Intermediate disk writes only occur when you explicitly insert a writers.* stage mid-pipeline."
          }
        },
        {
          "@type": "Question",
          "name": "How do I handle multi-gigabyte LAS files in a cleaning chain?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Insert filters.splitter early in the chain. Set the length parameter to tile the point cloud into chunks that fit in RAM, forcing sequential processing and releasing memory between tiles."
          }
        }
      ]
    }
  ]
}
</script>

**TL;DR:** Chain a `readers.las` → `filters.range` → `filters.outlier` → `filters.assign` → `writers.las` pipeline, call `pdal.Pipeline(config).execute()`, and PDAL passes a shared in-memory buffer through each stage — no intermediate files, no redundant I/O.

## Context and Motivation

Raw LiDAR surveys contain acquisition artifacts that make direct analysis unreliable: atmospheric scatter above the sensor ceiling, sub-terrain noise from ground-penetrating returns, scan-angle-dependent intensity distortion, and unclassified or misclassified returns from water bodies and low vegetation. Cleaning these before downstream terrain modelling or feature extraction is non-negotiable in production workflows.

This guide is part of [PDAL Stage Chaining](/pdal-pipeline-architecture-execution/pdal-stage-chaining/), which explains the full buffer-passing execution model. The cleaning-specific techniques here build directly on how [PDAL Pipeline Architecture & Execution](/pdal-pipeline-architecture-execution/) allocates memory and propagates dimensions between stages. Understanding that broader execution context helps you reason about *why* stage order matters, not just *what* order to use.

---

## Stage-Flow Diagram

The following diagram shows the six-stage cleaning chain and what each stage removes or transforms.

<svg viewBox="0 0 720 160" role="img" aria-label="PDAL data-cleaning stage flow: reader to range filter to outlier filter to assign to writer" xmlns="http://www.w3.org/2000/svg" style="width:100%;max-width:720px;display:block;margin:1.5rem auto;">
  <title>PDAL data-cleaning stage flow</title>
  <desc>Six sequential PDAL stages: readers.las, filters.range, filters.outlier, filters.assign, writers.las. Arrows show left-to-right buffer flow. Labels below each box note what each stage removes or modifies.</desc>
  <defs>
    <marker id="arr" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
      <path d="M0,0 L0,6 L8,3 z" fill="currentColor" opacity="0.55"/>
    </marker>
  </defs>
  <!-- Stage boxes -->
  <rect x="4" y="28" width="108" height="44" rx="6" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.7"/>
  <text x="58" y="47" text-anchor="middle" font-size="11" fill="currentColor" font-family="monospace">readers.las</text>
  <text x="58" y="62" text-anchor="middle" font-size="10" fill="currentColor" opacity="0.7">raw LAS/LAZ</text>
  <text x="58" y="104" text-anchor="middle" font-size="9" fill="currentColor" opacity="0.55">ingest + CRS</text>
  <rect x="136" y="28" width="108" height="44" rx="6" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.7"/>
  <text x="190" y="47" text-anchor="middle" font-size="11" fill="currentColor" font-family="monospace">filters.range</text>
  <text x="190" y="62" text-anchor="middle" font-size="10" fill="currentColor" opacity="0.7">Z / angle bounds</text>
  <text x="190" y="104" text-anchor="middle" font-size="9" fill="currentColor" opacity="0.55">drops OOB points</text>
  <rect x="268" y="28" width="120" height="44" rx="6" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.7"/>
  <text x="328" y="47" text-anchor="middle" font-size="11" fill="currentColor" font-family="monospace">filters.outlier</text>
  <text x="328" y="62" text-anchor="middle" font-size="10" fill="currentColor" opacity="0.7">statistical noise</text>
  <text x="328" y="104" text-anchor="middle" font-size="9" fill="currentColor" opacity="0.55">flags isolated pts</text>
  <rect x="408" y="28" width="112" height="44" rx="6" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.7"/>
  <text x="464" y="47" text-anchor="middle" font-size="11" fill="currentColor" font-family="monospace">filters.assign</text>
  <text x="464" y="62" text-anchor="middle" font-size="10" fill="currentColor" opacity="0.7">classification</text>
  <text x="464" y="104" text-anchor="middle" font-size="9" fill="currentColor" opacity="0.55">updates codes</text>
  <rect x="540" y="28" width="108" height="44" rx="6" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.7"/>
  <text x="594" y="47" text-anchor="middle" font-size="11" fill="currentColor" font-family="monospace">writers.las</text>
  <text x="594" y="62" text-anchor="middle" font-size="10" fill="currentColor" opacity="0.7">compressed LAZ</text>
  <text x="594" y="104" text-anchor="middle" font-size="9" fill="currentColor" opacity="0.55">serialise output</text>
  <!-- Arrows -->
  <line x1="113" y1="50" x2="133" y2="50" stroke="currentColor" stroke-width="1.5" opacity="0.55" marker-end="url(#arr)"/>
  <line x1="245" y1="50" x2="265" y2="50" stroke="currentColor" stroke-width="1.5" opacity="0.55" marker-end="url(#arr)"/>
  <line x1="389" y1="50" x2="406" y2="50" stroke="currentColor" stroke-width="1.5" opacity="0.55" marker-end="url(#arr)"/>
  <line x1="521" y1="50" x2="538" y2="50" stroke="currentColor" stroke-width="1.5" opacity="0.55" marker-end="url(#arr)"/>
  <!-- Buffer label -->
  <text x="360" y="148" text-anchor="middle" font-size="9" fill="currentColor" opacity="0.45">shared PointView buffer — no intermediate disk writes</text>
</svg>

---

## Prerequisites and Assumptions

- **PDAL 2.5 or later** with Python bindings installed (`pip install pdal`)
- **Python 3.10+** with `numpy` available
- **Input LAS/LAZ** file with at least `X`, `Y`, `Z`, `ScanAngleRank`, and `Classification` dimensions
- **Known input CRS** — set `spatialreference` in the reader rather than relying on embedded VLR data, which is sometimes absent in older files
- Test dataset recommendation: any USGS 3DEP tile from [usgs.gov/3dep](https://www.usgs.gov/3d-elevation-program) or the PDAL test dataset at `https://github.com/PDAL/data`

---

## Step-by-Step Implementation

### Step 1 — Declare the reader with a CRS anchor

```json
{
  "type": "readers.las",
  "filename": "raw_survey.las",
  "spatialreference": "EPSG:32618"
}
```

Setting `spatialreference` here overrides any embedded projection record and prevents silent datum mismatches when a downstream [spatial reprojection](/pdal-pipeline-architecture-execution/spatial-reprojection/) stage or range-based spatial filter assumes a specific unit system.

### Step 2 — Clamp to physically valid bounds with `filters.range`

```json
{
  "type": "filters.range",
  "limits": "Z[10:450],ScanAngleRank[-20:20]"
}
```

The `limits` string is a comma-separated list of `Dimension[min:max]` expressions. Place `filters.range` *before* `filters.outlier` so the statistical algorithm only sees points that are geometrically plausible — running outlier detection on atmospheric noise wastes CPU and skews the neighbourhood statistics. The [Pipeline Filtering Logic](/pdal-pipeline-architecture-execution/pipeline-filtering-logic/) cluster covers filter ordering rules in depth.

### Step 3 — Remove statistical noise with `filters.outlier`

```json
{
  "type": "filters.outlier",
  "method": "statistical",
  "mean_k": 12,
  "multiplier": 2.5
}
```

`filters.outlier` marks isolated points as noise (Classification 7) rather than dropping them immediately, giving downstream stages a chance to inspect or preserve them. Set `mean_k` to roughly 10–16 for airborne surveys and 6–10 for terrestrial scans where point density is higher but spatial extent is smaller. See the dedicated [Applying Statistical Outlier Filters in PDAL](/pdal-pipeline-architecture-execution/pipeline-filtering-logic/applying-statistical-outlier-filters-in-pdal/) guide for `multiplier` tuning guidance.

### Step 4 — Assign or correct classification codes with `filters.assign`

```json
{
  "type": "filters.assign",
  "value": "Classification = 2 WHERE Classification == 0"
}
```

The `value` parameter is a PDAL expression string. The `WHERE` clause restricts the assignment to unclassified points (code 0), leaving ground (2), vegetation (3–5), and building (6) labels from the original data intact. Classification codes follow the [ASPRS classification scheme](/point-cloud-data-standards-fundamentals/asprs-classification-codes/); check that reference when you need to preserve or recategorise specific return types.

### Step 5 — Write compressed output

```json
{
  "type": "writers.las",
  "filename": "cleaned_survey.laz",
  "compression": "true",
  "extra_dims": "all"
}
```

`extra_dims: all` forwards any non-standard dimensions (HAG, NDVI-derived bands, custom sensor fields) that earlier stages may have added, preventing data loss when chaining this pipeline into a larger workflow.

---

## Complete Working Example

The following self-contained script wires all five stages together, validates the pipeline before execution, and extracts metadata for audit logging.

```python
import pdal
import json
import sys
from pathlib import Path


def build_cleaning_pipeline(input_file: str, output_file: str) -> list[dict]:
    """Return a PDAL stage list for LiDAR data cleaning."""
    return [
        {
            "type": "readers.las",
            "filename": input_file,
            "spatialreference": "EPSG:32618"
        },
        {
            "type": "filters.range",
            "limits": "Z[10:450],ScanAngleRank[-20:20]"
        },
        {
            "type": "filters.outlier",
            "method": "statistical",
            "mean_k": 12,
            "multiplier": 2.5
        },
        {
            "type": "filters.assign",
            "value": "Classification = 2 WHERE Classification == 0"
        },
        {
            "type": "writers.las",
            "filename": output_file,
            "compression": "true",
            "extra_dims": "all"
        }
    ]


def run_cleaning_pipeline(input_file: str, output_file: str) -> dict:
    """Execute the cleaning pipeline and return audit metadata."""
    if not Path(input_file).exists():
        return {"status": "error", "message": f"Input file not found: {input_file}"}

    stages = build_cleaning_pipeline(input_file, output_file)

    try:
        pipeline = pdal.Pipeline(json.dumps(stages))
        point_count = pipeline.execute()
        meta = pipeline.metadata
        arrays = pipeline.arrays

        return {
            "status": "success",
            "points_out": point_count,
            "array_shape": arrays[0].shape if arrays else (0,),
            "stages_run": len(meta.get("metadata", {}).get("pipeline", {}).get("readers", [])),
            "bounds": meta.get("metadata", {}).get("filters.range", {}).get("bbox", {}),
        }

    except RuntimeError as exc:
        print(f"[pdal] RuntimeError: {exc}", file=sys.stderr)
        return {"status": "error", "message": str(exc)}
    except Exception as exc:
        print(f"[pdal] Unexpected error: {exc}", file=sys.stderr)
        return {"status": "error", "message": str(exc)}


if __name__ == "__main__":
    INPUT_LAS = "raw_survey.las"
    OUTPUT_LAZ = "cleaned_survey.laz"

    result = run_cleaning_pipeline(INPUT_LAS, OUTPUT_LAZ)

    if result["status"] == "success":
        print(f"Points written: {result['points_out']}")
        print(f"Array shape:    {result['array_shape']}")
    else:
        print(f"Pipeline failed: {result['message']}", file=sys.stderr)
        sys.exit(1)
```

---

## Key Parameter Table

| Stage | Parameter | Type | Default | Tuning guidance |
|---|---|---|---|---|
| `readers.las` | `spatialreference` | string | none | Always set explicitly; do not rely on embedded VLR |
| `filters.range` | `limits` | string | — | Match Z bounds to sensor ceiling; tighten ScanAngleRank for nadir-only surveys |
| `filters.outlier` | `method` | string | `statistical` | Use `radius` for very sparse or terrestrial clouds |
| `filters.outlier` | `mean_k` | int | 8 | 10–16 for airborne; 6–10 for TLS/MLS |
| `filters.outlier` | `multiplier` | float | 2.0 | Lower values (1.5) flag more points as noise; higher (3.5) are more permissive |
| `filters.assign` | `value` | string | — | Must be a valid PDAL expression; `WHERE` clause prevents overwriting existing labels |
| `writers.las` | `compression` | string | `"false"` | Set to `"true"` for LAZ output; reduces file size ~75 % |
| `writers.las` | `extra_dims` | string | none | Set to `"all"` to preserve non-standard dimensions |

---

## Verification

After execution, confirm the pipeline produced a valid, complete output:

```python
import pdal, json

# Re-read the output and check point count and dimension names
verify_pipeline = [
    {"type": "readers.las", "filename": "cleaned_survey.laz"}
]
pipe = pdal.Pipeline(json.dumps(verify_pipeline))
count = pipe.execute()
schema = pipe.schema

dim_names = [d["name"] for d in schema["schema"]["dimensions"]]
assert "Classification" in dim_names, "Classification dimension missing"
assert count > 0, "Output file is empty"

print(f"Verified: {count} points, dimensions: {dim_names}")
```

Also inspect bounding boxes and classification histograms in the metadata to catch silent data loss from over-aggressive range clamps:

```python
import json

meta = pipe.metadata
bbox = meta["metadata"]["readers.las"]["bbox"]
print(f"Output bounds: Z {bbox['minz']:.2f} – {bbox['maxz']:.2f} m")
```

If `minz` equals your lower `filters.range` bound, you may have clipped valid ground returns — raise the lower Z limit and re-run. The [memory management](/pdal-pipeline-architecture-execution/memory-management/) page explains how to verify buffer allocation and detect truncation from OOM conditions during execution.

---

## Gotchas and Edge Cases

**1. `filters.outlier` flags valid thin-vegetation returns.**
In sparse forests or low-shrub areas, isolated single returns from sub-metre vegetation look statistically identical to noise. Lower `multiplier` to 1.8 and inspect a sample tile with `pdal info --stats` before applying fleet-wide. Alternatively, run `filters.outlier` only on ground-classified subsets.

**2. `filters.range` on `ScanAngleRank` vs `ScanAngle`.**
PDAL 2.5+ uses `ScanAngle` (float, degrees) in LAS 1.4 files and `ScanAngleRank` (int8, 1/10-degree units scaled −128 to +127) in LAS 1.2/1.3. Applying a `ScanAngleRank[-20:20]` limit to a LAS 1.4 file that stores `ScanAngle` will silently pass all points because the dimension name does not match. Run `pdal info --schema raw_survey.las | grep -i scan` to confirm which dimension is present.

**3. `filters.assign` without a `WHERE` clause overwrites existing labels.**
Omitting the `WHERE Classification == 0` guard sets every point to code 2, destroying building, vegetation, and water classifications that the sensor vendor may have pre-computed. Always scope assignment expressions with a `WHERE` predicate.

**4. `compression: "true"` requires a `.laz` file extension.**
If you set `compression: "true"` but write to a `.las` filename, `writers.las` raises a `RuntimeError` at execution time. The filename extension and the compression flag must agree.

---

## Related

- [PDAL Stage Chaining](/pdal-pipeline-architecture-execution/pdal-stage-chaining/) — parent guide covering the full buffer-passing execution model
- [Applying Statistical Outlier Filters in PDAL](/pdal-pipeline-architecture-execution/pipeline-filtering-logic/applying-statistical-outlier-filters-in-pdal/) — deep dive on `mean_k` and `multiplier` calibration
- [Pipeline Filtering Logic](/pdal-pipeline-architecture-execution/pipeline-filtering-logic/) — filter ordering rules and dimension propagation
- [Spatial Reprojection](/pdal-pipeline-architecture-execution/spatial-reprojection/) — inserting CRS transformation before geometric filters
- [PDAL Pipeline Architecture & Execution](/pdal-pipeline-architecture-execution/) — top-level guide to the DAG execution model
