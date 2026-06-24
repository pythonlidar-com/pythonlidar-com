---
title: "Pipeline Filtering Logic in PDAL: Attribute, Spatial, and Statistical Filters"
description: "Master PDAL pipeline filtering logic with Python: range filters, spatial crop, statistical outlier removal, dimension pruning, and production-grade validation patterns for LiDAR point clouds."
slug: "pipeline-filtering-logic"
type: "cluster"
breadcrumb: "Pipeline Filtering Logic"
datePublished: "2024-06-01"
dateModified: "2026-06-24"
---

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Article",
      "headline": "Pipeline Filtering Logic in PDAL: Attribute, Spatial, and Statistical Filters",
      "description": "Master PDAL pipeline filtering logic with Python: range filters, spatial crop, statistical outlier removal, dimension pruning, and production-grade validation patterns for LiDAR point clouds.",
      "datePublished": "2024-06-01",
      "dateModified": "2026-06-24",
      "author": { "@type": "Organization", "name": "pythonlidar.com" }
    },
    {
      "@type": "BreadcrumbList",
      "itemListElement": [
        { "@type": "ListItem", "position": 1, "name": "Home", "item": "https://pythonlidar.com/" },
        { "@type": "ListItem", "position": 2, "name": "PDAL Pipeline Architecture & Execution", "item": "https://pythonlidar.com/pdal-pipeline-architecture-execution/" },
        { "@type": "ListItem", "position": 3, "name": "Pipeline Filtering Logic", "item": "https://pythonlidar.com/pdal-pipeline-architecture-execution/pipeline-filtering-logic/" }
      ]
    },
    {
      "@type": "HowTo",
      "name": "How to Apply Pipeline Filtering Logic in PDAL with Python",
      "step": [
        { "@type": "HowToStep", "name": "Define filtering objectives", "text": "Identify spatial, attribute, and statistical reduction goals before writing pipeline JSON." },
        { "@type": "HowToStep", "name": "Construct the pipeline graph", "text": "Translate objectives into an ordered list of PDAL filter stages using Python dicts." },
        { "@type": "HowToStep", "name": "Implement spatial constraints", "text": "Apply filters.crop with bounds aligned to the input CRS after any reprojection stage." },
        { "@type": "HowToStep", "name": "Apply statistical cleaning", "text": "Use filters.outlier with method=statistical to remove sensor noise by k-nearest-neighbour density." },
        { "@type": "HowToStep", "name": "Validate and execute", "text": "Call pipeline.validate() then pipeline.execute() and assert output point counts and dimension names." }
      ]
    },
    {
      "@type": "FAQPage",
      "mainEntity": [
        {
          "@type": "Question",
          "name": "What is the difference between filters.range and filters.expression in PDAL?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "filters.range uses PDAL's compact interval syntax (e.g. Classification[2:2],Z[0.5:100.0]) and is fast for simple numeric bounds. filters.expression accepts a full C-style boolean expression (e.g. Classification == 2 && Z > 0.5 && Intensity > 100) and supports compound predicates that range cannot represent."
          }
        },
        {
          "@type": "Question",
          "name": "Why does filters.crop return zero points when my bounds look correct?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "The most common cause is a CRS mismatch: bounds defined in geographic degrees (EPSG:4326) applied to a point cloud in a projected CRS (e.g. EPSG:32632). Place a filters.reprojection stage before filters.crop to align coordinate systems, or restate bounds in the native CRS of the input file."
          }
        },
        {
          "@type": "Question",
          "name": "How do I preserve custom extra dimensions when chaining multiple filters?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Declare extra_dims=all in every writer stage, and use filters.assign to re-attach or forward dimensions that intermediate stages may drop. Some filters (filters.smrf, filters.pmf) emit only their computed dimensions; explicitly forward others with a downstream filters.merge or by checking the dimension list after each stage."
          }
        }
      ]
    }
  ]
}
</script>

Pipeline filtering logic determines which points survive each stage of a processing graph and which are discarded — making it the primary quality-control mechanism in any LiDAR workflow. In production environments that depend on the [PDAL Pipeline Architecture & Execution](/pdal-pipeline-architecture-execution/) model, filters run as discrete buffer-transforming stages arranged in a directed acyclic graph: each stage reads a structured point array from its predecessor, applies a predicate or transformation, and emits a reduced or annotated array downstream. Getting filter order, parameter values, and dimension contracts right separates deterministic, auditable pipelines from brittle scripts that silently drop valid data.

This guide targets LiDAR analysts, Python GIS developers, and surveying teams who need a rigorous, production-ready reference for attribute filtering, spatial subsetting, statistical cleaning, and dimension management inside PDAL pipelines.

---

<svg viewBox="0 0 820 220" role="img" aria-label="PDAL filtering pipeline data-flow diagram" xmlns="http://www.w3.org/2000/svg" style="width:100%;max-width:820px;height:auto;display:block;margin:1.5rem auto;">
  <title>PDAL Filtering Pipeline Data Flow</title>
  <desc>Diagram showing point data flowing from a LAS reader through range filter, crop filter, outlier filter, and dimension pruning before reaching a LAS writer.</desc>
  <defs>
    <marker id="arr" markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto">
      <path d="M0,0 L0,6 L8,3 Z" fill="currentColor" opacity="0.55"/>
    </marker>
  </defs>
  <!-- Stage boxes -->
  <rect x="10"  y="80" width="120" height="60" rx="8" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.8"/>
  <text x="70"  y="106" text-anchor="middle" font-size="12" fill="currentColor" font-family="monospace">readers.las</text>
  <text x="70"  y="122" text-anchor="middle" font-size="10" fill="currentColor" opacity="0.65">(all dims)</text>
  <rect x="165" y="80" width="130" height="60" rx="8" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.8"/>
  <text x="230" y="106" text-anchor="middle" font-size="12" fill="currentColor" font-family="monospace">filters.range</text>
  <text x="230" y="122" text-anchor="middle" font-size="10" fill="currentColor" opacity="0.65">class + Z bounds</text>
  <rect x="325" y="80" width="130" height="60" rx="8" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.8"/>
  <text x="390" y="106" text-anchor="middle" font-size="12" fill="currentColor" font-family="monospace">filters.crop</text>
  <text x="390" y="122" text-anchor="middle" font-size="10" fill="currentColor" opacity="0.65">spatial bbox / polygon</text>
  <rect x="485" y="80" width="140" height="60" rx="8" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.8"/>
  <text x="555" y="106" text-anchor="middle" font-size="12" fill="currentColor" font-family="monospace">filters.outlier</text>
  <text x="555" y="122" text-anchor="middle" font-size="10" fill="currentColor" opacity="0.65">statistical / radius</text>
  <rect x="655" y="80" width="120" height="60" rx="8" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.8"/>
  <text x="715" y="106" text-anchor="middle" font-size="12" fill="currentColor" font-family="monospace">writers.las</text>
  <text x="715" y="122" text-anchor="middle" font-size="10" fill="currentColor" opacity="0.65">extra_dims=all</text>
  <!-- Arrows -->
  <line x1="130" y1="110" x2="163" y2="110" stroke="currentColor" stroke-width="1.5" opacity="0.55" marker-end="url(#arr)"/>
  <line x1="295" y1="110" x2="323" y2="110" stroke="currentColor" stroke-width="1.5" opacity="0.55" marker-end="url(#arr)"/>
  <line x1="455" y1="110" x2="483" y2="110" stroke="currentColor" stroke-width="1.5" opacity="0.55" marker-end="url(#arr)"/>
  <line x1="625" y1="110" x2="653" y2="110" stroke="currentColor" stroke-width="1.5" opacity="0.55" marker-end="url(#arr)"/>
  <!-- Labels above arrows -->
  <text x="147" y="100" text-anchor="middle" font-size="9" fill="currentColor" opacity="0.5">buffer</text>
  <text x="309" y="100" text-anchor="middle" font-size="9" fill="currentColor" opacity="0.5">reduced</text>
  <text x="469" y="100" text-anchor="middle" font-size="9" fill="currentColor" opacity="0.5">cropped</text>
  <text x="639" y="100" text-anchor="middle" font-size="9" fill="currentColor" opacity="0.5">cleaned</text>
  <!-- Point count indicators below boxes -->
  <text x="70"  y="165" text-anchor="middle" font-size="9" fill="currentColor" opacity="0.45">N points</text>
  <text x="230" y="165" text-anchor="middle" font-size="9" fill="currentColor" opacity="0.45">class+Z subset</text>
  <text x="390" y="165" text-anchor="middle" font-size="9" fill="currentColor" opacity="0.45">spatial subset</text>
  <text x="555" y="165" text-anchor="middle" font-size="9" fill="currentColor" opacity="0.45">noise removed</text>
  <text x="715" y="165" text-anchor="middle" font-size="9" fill="currentColor" opacity="0.45">final output</text>
</svg>

## Prerequisites

Before implementing filtering stages, confirm your environment meets these requirements:

- **PDAL 2.5+** with the `filters.*` stage library compiled in (verify with `pdal --version`).
- **Python 3.10+** with `python-pdal` installed via `conda install -c conda-forge python-pdal` or `pip install pdal`.
- **NumPy** for post-execution buffer inspection; `pyproj` if you need to validate CRS alignment programmatically.
- **Input data**: LAS 1.2–1.4 or LAZ files with at minimum the `X`, `Y`, `Z`, `Classification`, and `ReturnNumber` dimensions populated. Statistical filters additionally require enough neighbouring points to form meaningful density statistics — sparse test tiles with fewer than 1,000 points per square metre may produce unreliable results.
- **CRS metadata present** in the file header. Spatial filters (`filters.crop`) silently return zero points when bounds are expressed in a different CRS than the input. Run `pdal info --metadata input.laz` to confirm `spatialreference` is populated before writing any spatial predicate.
- **Familiarity with [PDAL stage chaining](/pdal-pipeline-architecture-execution/pdal-stage-chaining/)** — filter stages obey the same dimension propagation and buffer-passing contracts as all other stages.

## Core Workflow Architecture

Filtering execution unfolds in five deterministic phases:

1. **Objective definition** — Specify the exact reduction goal: attribute bounds, spatial extent, noise threshold, or dimension set.
2. **Stage sequencing** — Order stages so that coordinate transformations (e.g., [spatial reprojection](/pdal-pipeline-architecture-execution/spatial-reprojection/)) precede spatial filters, and attribute filters precede computationally expensive statistical passes.
3. **Pipeline construction** — Encode the stage sequence as a Python list of dicts or a JSON string and instantiate `pdal.Pipeline`.
4. **Lazy execution** — Call `pipeline.execute()`; PDAL evaluates the full DAG synchronously, allocating new point buffers at each stage rather than modifying data in-place.
5. **Validation and audit** — Assert output point counts, inspect `pipeline.metadata` for dimension lists, and compare CRS round-trip values.

Stage order has hard dependencies. `filters.range` or `filters.expression` should run before `filters.outlier` to reduce the neighbour-search space. `filters.crop` must run after any reprojection stage. `filters.assign` for dimension injection must precede any stage that reads the injected dimension.

## Full Implementation

The following self-contained Python module applies a representative filtering sequence: classification and height bounding, spatial subsetting, statistical noise removal, and metadata capture.

```python
import logging
import pdal
from pathlib import Path

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(message)s",
)
log = logging.getLogger(__name__)


def run_filter_pipeline(
    input_path: str,
    output_path: str,
    classification: int = 2,
    z_min: float = 0.5,
    z_max: float = 200.0,
    bbox: tuple[float, float, float, float] | None = None,
    outlier_mean_k: int = 12,
    outlier_multiplier: float = 2.5,
) -> dict:
    """
    Apply attribute, spatial, and statistical filters to a LiDAR point cloud.

    Parameters
    ----------
    input_path        : Path to input LAS/LAZ file.
    output_path       : Destination LAS/LAZ path.
    classification    : ASPRS class code to retain (default 2 = ground).
    z_min / z_max     : Elevation bounds in the native CRS vertical unit.
    bbox              : Optional (xmin, ymin, xmax, ymax) crop in the input CRS.
    outlier_mean_k    : Neighbour count for statistical outlier evaluation.
    outlier_multiplier: Standard-deviation multiplier; lower = more aggressive.

    Returns
    -------
    dict with 'point_count', 'dimensions', and 'metadata' keys.
    """
    stages: list[dict] = [
        {
            "type": "readers.las",
            "filename": str(input_path),
        },
        # 1. Attribute filter: keep only the target classification within Z bounds.
        # filters.range is evaluated per-point before any spatial or statistical
        # stage, minimising the point set that expensive neighbour searches must handle.
        {
            "type": "filters.range",
            "limits": f"Classification[{classification}:{classification}],Z[{z_min}:{z_max}]",
        },
    ]

    if bbox is not None:
        xmin, ymin, xmax, ymax = bbox
        # 2. Spatial crop — applied after attribute filtering so the neighbour
        #    graph in the outlier stage is not polluted by out-of-area points.
        stages.append(
            {
                "type": "filters.crop",
                "bounds": f"([{xmin},{xmax}],[{ymin},{ymax}])",
            }
        )

    stages += [
        # 3. Statistical outlier removal — computes mean distance to the
        #    outlier_mean_k nearest neighbours for each point and discards those
        #    whose distance exceeds outlier_multiplier * stddev of the local mean.
        {
            "type": "filters.outlier",
            "method": "statistical",
            "mean_k": outlier_mean_k,
            "multiplier": outlier_multiplier,
        },
        # 4. Remove points flagged as noise by the outlier stage.
        {
            "type": "filters.range",
            "limits": "Classification![7:7]",
        },
        {
            "type": "writers.las",
            "filename": str(output_path),
            "extra_dims": "all",
            "compression": "laszip",
        },
    ]

    pipeline = pdal.Pipeline(stages)
    try:
        pipeline.validate()
    except Exception as exc:
        log.error("Pipeline validation failed: %s", exc)
        raise

    count = pipeline.execute()
    log.info("Filtered %d points → %s", count, output_path)

    arrays = pipeline.arrays
    dims = list(arrays[0].dtype.names) if arrays else []

    return {
        "point_count": count,
        "dimensions": dims,
        "metadata": pipeline.metadata,
    }


if __name__ == "__main__":
    result = run_filter_pipeline(
        input_path="survey_raw.laz",
        output_path="survey_ground_clean.laz",
        classification=2,
        z_min=0.5,
        z_max=150.0,
        bbox=(363000.0, 5621000.0, 364000.0, 5622000.0),
        outlier_mean_k=12,
        outlier_multiplier=2.5,
    )
    print(f"Output points : {result['point_count']:,}")
    print(f"Dimensions    : {result['dimensions']}")
```

## Code Breakdown

**Stage 1 — `filters.range` (attribute + height bound)**
`filters.range` uses PDAL's compact interval notation `Dimension[min:max]`. Chaining `Classification[2:2]` and `Z[0.5:200.0]` in a single `limits` string is equivalent to a logical AND: both conditions must hold. Placing this stage first reduces the point count that all downstream stages must process, which is especially important before the O(n log n) neighbour search in `filters.outlier`. Running range filtering last would not only be slower but would produce incorrect statistical baselines.

**Stage 2 — `filters.crop` (spatial subsetting)**
`filters.crop` evaluates bounds in the *current* coordinate reference system of the buffer — after any upstream reprojection. The bounds string `([xmin,xmax],[ymin,ymax])` uses projected metre values here; mixing these with degree-based coordinates causes silent empty output. If your pipeline includes a [spatial reprojection](/pdal-pipeline-architecture-execution/spatial-reprojection/) stage, place `filters.crop` after it.

**Stage 3 — `filters.outlier` (statistical noise removal)**
`method=statistical` computes the mean Euclidean distance to each point's `mean_k` nearest neighbours, then computes the global mean and standard deviation of those distances. Any point whose mean neighbour distance exceeds `mean_k_mean + multiplier * stddev` is assigned `Classification = 7` (noise per [ASPRS classification codes](/point-cloud-data-standards-fundamentals/asprs-classification-codes/)). It does not delete points — it labels them, which is why the next stage is needed.

**Stage 4 — `filters.range` (noise removal)**
The notation `Classification![7:7]` is PDAL's negation syntax: retain all points *not* in the range [7, 7]. This two-stage pattern (outlier detection → range exclusion) is preferred over in-place deletion because it preserves the full audit trail in the metadata and allows inspection of flagged points before final write.

**Stage 5 — `writers.las`**
`extra_dims=all` forwards every dimension in the buffer — including any custom attributes added by upstream [attribute mapping](/pdal-pipeline-architecture-execution/attribute-mapping/) stages — to the output file. `compression=laszip` halves typical file size with no point-data loss.

## Parameter Reference

| Parameter | Stage | Type | Default | Valid Range | Effect |
|---|---|---|---|---|---|
| `limits` | `filters.range` | string | — | `Dim[min:max]`, `Dim![min:max]` | Inclusive interval or negated interval per dimension; chain with comma for AND |
| `bounds` | `filters.crop` | string | — | `([xmin,xmax],[ymin,ymax],[zmin,zmax])` | Bounding box in current CRS; Z bounds optional |
| `method` | `filters.outlier` | string | `statistical` | `statistical`, `radius` | `radius` uses fixed distance; `statistical` adapts to local density |
| `mean_k` | `filters.outlier` | int | 8 | 4–64 | Neighbour count; lower = finer-grained but noisier in sparse data |
| `multiplier` | `filters.outlier` | float | 2.0 | 0.5–5.0 | Stddev threshold; 2.0–3.0 for typical LiDAR; lower for dense urban data |
| `radius` | `filters.outlier` | float | 1.0 | 0.1–50.0 | Used only with `method=radius`; expressed in the native CRS distance unit |
| `where` | any filter | string | — | C-style expression | Per-stage inline predicate; same syntax as `filters.expression` |
| `extra_dims` | `writers.las` | string | `""` | `all` or `name=type` list | Preserves non-standard dimensions in output; omitting drops custom attributes |

For compound predicates that exceed what `filters.range` can express — such as `(Classification == 2 OR Classification == 6) AND Intensity > 200` — replace it with `filters.expression`:

```python
{
    "type": "filters.expression",
    "expression": "(Classification == 2 || Classification == 6) && Intensity > 200"
}
```

## Validation and Data Integrity Checks

After every filter pipeline, run the following assertions before treating output as production-ready:

```python
import numpy as np

result = run_filter_pipeline("input.laz", "output.laz", classification=2)

# 1. Point count must be non-zero and less than input
assert result["point_count"] > 0, "Filter removed all points — check bounds and class code"

# 2. Verify the classification dimension survived
assert "Classification" in result["dimensions"], "Classification dimension missing from output"

# 3. No noise-class points should remain
arrays = pipeline.arrays  # re-use the pipeline object from run_filter_pipeline
if arrays:
    classes = arrays[0]["Classification"]
    assert 7 not in np.unique(classes), "Noise points (class 7) present in output"

# 4. CRS round-trip check via metadata
import json
meta = json.loads(result["metadata"])
srs = meta.get("metadata", {}).get("readers.las", [{}])[0].get("spatialreference", "")
assert srs, "No CRS in output metadata — verify input file has spatial reference set"
```

For pipeline structure validation before any point data is read, `pipeline.validate()` checks JSON syntax, stage compatibility, and dimension dependency graphs without loading the point cloud. Use it in CI/CD checks against pipeline configuration files before deploying to production.

## Performance Tuning

Filtering performance degrades predictably at known bottlenecks. The table below shows the primary factors and the remedies for each.

| Bottleneck | Symptom | Remedy |
|---|---|---|
| Large input before attribute filter | `filters.outlier` slow on full dataset | Move `filters.range` to the first stage after `readers.las` |
| Dense point clouds with high `mean_k` | CPU-bound neighbour search | Reduce `mean_k` to 8–12; use `filters.voxelgrid` to decimate before outlier pass |
| Repeated LAZ reads during iteration | High I/O overhead | Convert to uncompressed LAS for iteration; recompress final output only |
| Many tiles in serial loop | Sequential throughput limit | Dispatch tiles with `ProcessPoolExecutor`; set `OMP_NUM_THREADS=2` per worker to avoid thread contention (see [parallel execution](/pdal-pipeline-architecture-execution/parallel-execution/)) |
| `filters.crop` over polygon boundary | Slow point-in-polygon test | Pre-tile input with a bounding-box crop first; use polygon crop only on the reduced set |

For tile-parallel workloads, keep each worker's pipeline self-contained (no shared state) and bound `OMP_NUM_THREADS` so worker threads do not saturate the CPU:

```python
import os
from concurrent.futures import ProcessPoolExecutor
from pathlib import Path


def _worker(args: tuple) -> dict:
    tile, out_dir = args
    os.environ["OMP_NUM_THREADS"] = "2"
    return run_filter_pipeline(
        input_path=str(tile),
        output_path=str(Path(out_dir) / (tile.stem + "_clean.laz")),
    )


def filter_tiles(tile_dir: str, out_dir: str, workers: int = 4) -> list[dict]:
    tiles = list(Path(tile_dir).glob("*.laz"))
    with ProcessPoolExecutor(max_workers=workers) as pool:
        return list(pool.map(_worker, [(t, out_dir) for t in tiles]))
```

For memory management on very large single files, insert `filters.splitter` with `length=500` (500 m grid cells) before the filter chain and process each cell independently; see the dedicated [memory management](/pdal-pipeline-architecture-execution/memory-management/) guide for a full tiling strategy.

## Common Errors and Troubleshooting

**1. `filters.crop` returns 0 points**

Root cause: bounds expressed in a different CRS than the point cloud. Check with `pdal info --metadata input.laz | grep spatialreference`. Fix: restate bounds in the native CRS, or insert `filters.reprojection` with `out_srs=EPSG:32632` (or your target EPSG) before `filters.crop`. This is the single most common silent failure in spatial subsetting.

**2. `KeyError: 'Classification'` in post-execution array access**

Root cause: the output LAS file was written without `extra_dims=all` and the `Classification` dimension exceeded the standard LAS 1.2 byte-width constraint, causing it to be silently dropped. Fix: set `extra_dims=all` in the `writers.las` stage, or ensure the output format version is LAS 1.4 with Point Data Record Format 6 or higher.

**3. `filters.outlier` removes valid edge points in sparse datasets**

Root cause: `mean_k` set too low (e.g., 4) on tiles with low point density — edge points have fewer than `mean_k` neighbours available, so their distances are artificially high. Fix: increase `mean_k` to 12–16 for sparse data, or switch to `method=radius` with a radius matched to the average point spacing.

**4. `RuntimeError: schema violation: dimension 'ScanAngleRank' not found`**

Root cause: an intermediate filter (e.g., `filters.smrf` or `filters.pmf`) dropped `ScanAngleRank` from the buffer, but a downstream stage declared a dependency on it. Fix: add `filters.assign` after the offending stage to re-introduce the dimension with a default value, or remove the downstream dependency.

**5. `json.dumps` raises `TypeError` on pipeline serialization**

Root cause: a Python dict built from NumPy scalars (e.g., `np.float64(100.0)`) fails standard JSON serialization. Fix: cast all values to native Python types before constructing the pipeline list: `float(z_max)`, `int(classification)`, `str(output_path)`.

---

## Frequently Asked Questions

**What is the difference between `filters.range` and `filters.expression`?**

`filters.range` uses PDAL's compact interval syntax (`Dim[min:max]`) and is optimised for simple numeric bounds on one or more dimensions chained with AND. `filters.expression` accepts a full C-style boolean expression — including OR, parentheses, and arithmetic — and is the right choice when your predicate cannot be expressed as a flat list of intervals.

**Why does `filters.outlier` not delete points directly?**

PDAL filters operate on the buffer without shrinking it in-place; instead, `filters.outlier` marks noise points by setting `Classification = 7`. A subsequent `filters.range` with `limits=Classification![7:7]` performs the actual removal. This preserves reversibility: you can inspect flagged points before discarding them, which is essential for [pipeline validation](/pdal-pipeline-architecture-execution/pipeline-validation/) in production workflows.

**How do I keep custom attributes through a filter chain?**

Declare `extra_dims=all` in `writers.las` and verify the dimension list with `pipeline.arrays[0].dtype.names` after execution. If an intermediate filter drops a custom dimension, use `filters.assign` to re-inject it with a default value after the offending stage. The [attribute mapping](/pdal-pipeline-architecture-execution/attribute-mapping/) guide covers this pattern in depth.

---

## Related

- [Applying Statistical Outlier Filters in PDAL](/pdal-pipeline-architecture-execution/pipeline-filtering-logic/applying-statistical-outlier-filters-in-pdal/) — parameter tuning, radius vs statistical methods, and benchmark comparisons
- [PDAL Stage Chaining](/pdal-pipeline-architecture-execution/pdal-stage-chaining/) — buffer-passing model, dimension propagation, and stage ordering rules
- [Spatial Reprojection](/pdal-pipeline-architecture-execution/spatial-reprojection/) — CRS transformation before spatial filtering
- [Pipeline Validation](/pdal-pipeline-architecture-execution/pipeline-validation/) — schema checks, dry-run execution, and CI/CD integration
- [PDAL Pipeline Architecture & Execution](/pdal-pipeline-architecture-execution/) — parent overview: DAG execution model, stage categories, and production deployment
