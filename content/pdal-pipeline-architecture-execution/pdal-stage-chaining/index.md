---
title: "PDAL Stage Chaining: Build Multi-Step Point Cloud Pipelines in Python"
description: "How to chain PDAL readers, filters, and writers into reliable Python pipelines — covering buffer-passing semantics, parameter tables, schema validation, performance tuning, and common errors."
slug: "pdal-stage-chaining"
type: "topic"
breadcrumb: "PDAL Stage Chaining"
datePublished: "2024-03-15"
dateModified: "2026-06-24"
---

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Article",
      "headline": "PDAL Stage Chaining: Build Multi-Step Point Cloud Pipelines in Python",
      "description": "How to chain PDAL readers, filters, and writers into reliable Python pipelines — covering buffer-passing semantics, parameter tables, schema validation, performance tuning, and common errors.",
      "datePublished": "2024-03-15",
      "dateModified": "2026-06-24",
      "author": {"@type": "Organization", "name": "pythonlidar.com"}
    },
    {
      "@type": "BreadcrumbList",
      "itemListElement": [
        {"@type": "ListItem", "position": 1, "name": "Home", "item": "https://www.pythonlidar.com/"},
        {"@type": "ListItem", "position": 2, "name": "PDAL Pipeline Architecture & Execution", "item": "https://www.pythonlidar.com/pdal-pipeline-architecture-execution/"},
        {"@type": "ListItem", "position": 3, "name": "PDAL Stage Chaining", "item": "https://www.pythonlidar.com/pdal-pipeline-architecture-execution/pdal-stage-chaining/"}
      ]
    },
    {
      "@type": "HowTo",
      "name": "Chain PDAL stages into a multi-step point cloud pipeline",
      "step": [
        {"@type": "HowToStep", "name": "Declare reader stage with source CRS", "text": "Set type to readers.las and spatialreference to the input EPSG code."},
        {"@type": "HowToStep", "name": "Insert filter stages in execution order", "text": "Add outlier removal, reprojection, and classification filters sequentially."},
        {"@type": "HowToStep", "name": "Append writer stage", "text": "Set type to writers.las with forward: all to preserve dimensions."},
        {"@type": "HowToStep", "name": "Validate the pipeline before execution", "text": "Call pipeline.validate() to catch schema mismatches before processing starts."},
        {"@type": "HowToStep", "name": "Execute and extract metadata", "text": "Call pipeline.execute() and inspect pipeline.metadata for point counts and stage logs."}
      ]
    },
    {
      "@type": "FAQPage",
      "mainEntity": [
        {
          "@type": "Question",
          "name": "What order must PDAL stages appear in a chained pipeline?",
          "acceptedAnswer": {"@type": "Answer", "text": "Readers come first, then transformation filters (reprojection, assign), then analytical filters (outlier, SMRF, range), then writers last. Spatial operations that depend on a target CRS must appear after filters.reprojection. Classification-dependent filters require ground labels to exist, so SMRF must precede filters.hag_nn."}
        },
        {
          "@type": "Question",
          "name": "How does PDAL pass data between chained stages?",
          "acceptedAnswer": {"@type": "Answer", "text": "PDAL allocates a PointView buffer in memory and passes a reference to it through each stage in sequence. Stages mutate the buffer in place rather than copying data. This pull-based model means the writer requests chunks from its upstream filter, which in turn requests them from the reader, so only one chunk is materialised at a time."}
        },
        {
          "@type": "Question",
          "name": "Can PDAL pipelines branch into multiple outputs?",
          "acceptedAnswer": {"@type": "Answer", "text": "Yes. PDAL supports multiple writers at the end of a pipeline or the use of filters.ferry and filters.splitter to route data to different outputs in a single execution. Declare each writer as a separate element in the pipeline array and PDAL will fan the final PointView out to each one."}
        }
      ]
    }
  ]
}
</script>

Production LiDAR workflows are rarely a single operation. Surveying teams and Python GIS developers routinely need to ingest compressed LAZ tiles, strip acquisition noise, normalize coordinate systems, classify ground returns, and export clean LAS files — all in one reproducible pass. PDAL stage chaining is the mechanism that connects these discrete operations into a directed execution graph, letting engineers express complex multi-step transformations as a single JSON-declared pipeline. This page is part of the broader [PDAL Pipeline Architecture & Execution](https://www.pythonlidar.com/pdal-pipeline-architecture-execution/) guide.

<svg viewBox="0 0 740 180" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="PDAL stage chaining data-flow diagram" style="width:100%;max-width:740px;display:block;margin:1.5rem auto">
  <title>PDAL Stage Chaining Data Flow</title>
  <desc>A left-to-right flow diagram showing a LAZ reader feeding into an outlier filter, then a reprojection filter, then an SMRF ground classifier, and finally a LAS writer. Arrows connect each stage in sequence.</desc>
  <defs>
    <marker id="arr-chain" markerWidth="8" markerHeight="8" refX="7" refY="3" orient="auto">
      <path d="M0,0 L0,6 L8,3 z" fill="currentColor" opacity="0.55"/>
    </marker>
  </defs>
  <!-- stage boxes -->
  <rect x="8"   y="55" width="120" height="58" rx="6" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.7"/>
  <text x="68"  y="80" text-anchor="middle" font-size="11" fill="currentColor" font-family="monospace">readers.las</text>
  <text x="68"  y="97" text-anchor="middle" font-size="10" fill="currentColor" opacity="0.65">LAZ / LAS source</text>
  <rect x="156" y="55" width="132" height="58" rx="6" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.7"/>
  <text x="222" y="80" text-anchor="middle" font-size="11" fill="currentColor" font-family="monospace">filters.outlier</text>
  <text x="222" y="97" text-anchor="middle" font-size="10" fill="currentColor" opacity="0.65">noise removal</text>
  <rect x="316" y="55" width="150" height="58" rx="6" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.7"/>
  <text x="391" y="80" text-anchor="middle" font-size="11" fill="currentColor" font-family="monospace">filters.reprojection</text>
  <text x="391" y="97" text-anchor="middle" font-size="10" fill="currentColor" opacity="0.65">CRS transform</text>
  <rect x="484" y="55" width="114" height="58" rx="6" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.7"/>
  <text x="541" y="80" text-anchor="middle" font-size="11" fill="currentColor" font-family="monospace">filters.smrf</text>
  <text x="541" y="97" text-anchor="middle" font-size="10" fill="currentColor" opacity="0.65">ground classify</text>
  <rect x="616" y="55" width="116" height="58" rx="6" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.7"/>
  <text x="674" y="80" text-anchor="middle" font-size="11" fill="currentColor" font-family="monospace">writers.las</text>
  <text x="674" y="97" text-anchor="middle" font-size="10" fill="currentColor" opacity="0.65">LAS / LAZ out</text>
  <!-- arrows -->
  <line x1="128" y1="84" x2="152" y2="84" stroke="currentColor" stroke-width="1.5" opacity="0.55" marker-end="url(#arr-chain)"/>
  <line x1="288" y1="84" x2="312" y2="84" stroke="currentColor" stroke-width="1.5" opacity="0.55" marker-end="url(#arr-chain)"/>
  <line x1="466" y1="84" x2="480" y2="84" stroke="currentColor" stroke-width="1.5" opacity="0.55" marker-end="url(#arr-chain)"/>
  <line x1="598" y1="84" x2="612" y2="84" stroke="currentColor" stroke-width="1.5" opacity="0.55" marker-end="url(#arr-chain)"/>
  <!-- label row -->
  <text x="370" y="148" text-anchor="middle" font-size="10" fill="currentColor" opacity="0.5">PointView buffer passes through each stage in declaration order</text>
</svg>

## Prerequisites

Confirm these requirements before implementing chained pipelines:

- **PDAL 2.5 or later** — compiled with Python bindings (`python-pdal`)
- **Python 3.10 or later** with `numpy` and `json` available in the environment
- **Test LiDAR dataset** — USGS 3DEP, OpenTopography, or a locally collected TLS/UAV scan works well
- **CRS awareness** — know both the source EPSG code and the target projection before writing any stage
- **Familiarity with LAS dimension names** — `X`, `Y`, `Z`, `Intensity`, `ReturnNumber`, `Classification`, `NumberOfReturns`, `ScanAngleRank`
- **Basic JSON syntax proficiency** — pipeline definitions are JSON arrays of stage objects

Install the Python bindings with `pip install pdal`. For workflows that require custom GDAL or OGR drivers, compile from source following the [python-pdal build guide](https://github.com/PDAL/python).

## Core Workflow Architecture

Stage chaining follows a strict buffer-passing model. PDAL allocates a single `PointView` in memory, threads it through each declared stage, and serialises the final state to disk or to a NumPy array. The execution lifecycle has six deterministic phases:

1. **Pipeline declaration** — express the stage sequence as a Python list of dicts or as a JSON string passed to `pdal.Pipeline()`.
2. **Anchor configuration** — declare a `readers.*` stage (I/O source) and a `writers.*` stage (I/O sink) to bound the chain.
3. **Intermediate insertion** — place transformation, filtering, and computation stages between the reader and writer in execution order.
4. **Schema validation** — call `pipeline.validate()` to verify that each stage's required input dimensions exist in the buffer before execution starts. See [pipeline validation](https://www.pythonlidar.com/pdal-pipeline-architecture-execution/pipeline-validation/) for the full set of checks this performs.
5. **Execution and buffer management** — call `pipeline.execute()`, which streams data through each node in declaration order and returns the final point count.
6. **Metadata extraction** — read `pipeline.metadata` for per-stage statistics, point counts, and transformation logs.

Stage order is not flexible. CRS transformations handled by [spatial reprojection](https://www.pythonlidar.com/pdal-pipeline-architecture-execution/spatial-reprojection/) must precede any spatial indexing or ground classification. Outlier removal should occur before classification so that statistical distributions used by `filters.outlier` are not contaminated by noise labels. When [pipeline filtering logic](https://www.pythonlidar.com/pdal-pipeline-architecture-execution/pipeline-filtering-logic/) depends on attributes computed by an earlier filter — such as Height Above Ground from `filters.hag_nn` — that earlier filter must appear first in the array.

## Full Implementation

The following Python module demonstrates a production-ready chained pipeline. It ingests a compressed LAZ file, removes statistical outliers, reprojects coordinates, classifies ground points using SMRF, and exports a cleaned LAS file.

```python
import json
import pdal
import logging
from pathlib import Path

logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")


def build_cleaning_pipeline(
    input_path: str,
    output_path: str,
    source_crs: str = "EPSG:6347",
    target_crs: str = "EPSG:32618",
    mean_k: int = 10,
    multiplier: float = 3.0,
    smrf_slope: float = 0.15,
    smrf_window: float = 18.0,
) -> pdal.Pipeline:
    """
    Construct a PDAL pipeline for LAZ ingestion, outlier removal,
    CRS reprojection, ground classification, and LAS export.

    Parameters
    ----------
    input_path  : path to source LAZ / LAS file
    output_path : path for the cleaned LAS output
    source_crs  : EPSG code of the input data (e.g. EPSG:6347 for NAD83(2011)/UTM 18N)
    target_crs  : EPSG code of the output CRS (e.g. EPSG:32618 for WGS84/UTM 18N)
    mean_k      : neighbourhood size for statistical outlier filter (default 10)
    multiplier  : standard-deviation multiplier for outlier threshold (default 3.0)
    smrf_slope  : maximum terrain slope accepted by SMRF (radians, default 0.15)
    smrf_window : SMRF search window diameter in metres (default 18.0)
    """
    pipeline_def = [
        {
            "type": "readers.las",
            "filename": str(input_path),
            "spatialreference": source_crs
        },
        {
            # Statistical outlier removal — applied before reprojection so point
            # distances are evaluated in the original projected coordinate space.
            "type": "filters.outlier",
            "method": "statistical",
            "mean_k": mean_k,
            "multiplier": multiplier
        },
        {
            # Reproject after noise removal; transforming noisy data wastes CPU
            # and can shift outlier centroids unpredictably.
            "type": "filters.reprojection",
            "out_srs": target_crs
        },
        {
            # Simple Morphological Filter for ground classification.
            # slope=0.15 suits gently rolling terrain; raise to 0.2-0.3 for
            # steep hillsides.  window=18.0 m works for typical UAV point density
            # of 50-200 pts/m^2; halve it for TLS datasets (>500 pts/m^2).
            "type": "filters.smrf",
            "slope": smrf_slope,
            "threshold": 0.5,
            "window": smrf_window,
            "elevation": 2.0
        },
        {
            "type": "writers.las",
            "filename": str(output_path),
            "forward": "all",
            "extra_dims": "all"
        }
    ]
    return pdal.Pipeline(json.dumps({"pipeline": pipeline_def}))


def execute_pipeline(pipeline: pdal.Pipeline) -> dict:
    """Validate, execute, and return execution metadata."""
    try:
        pipeline.validate()
    except RuntimeError as e:
        logging.error("Pipeline validation failed: %s", e)
        raise

    count = pipeline.execute()
    logging.info("Processed %d points.", count)
    meta = pipeline.metadata
    logging.info("Stage metadata keys: %s", list(meta.get("metadata", {}).keys()))
    return meta


if __name__ == "__main__":
    INPUT_LAZ  = Path("raw_survey_tile.laz")
    OUTPUT_LAS = Path("processed_survey_tile.las")

    if not INPUT_LAZ.exists():
        raise FileNotFoundError(f"Input file not found: {INPUT_LAZ}")

    pipe = build_cleaning_pipeline(str(INPUT_LAZ), str(OUTPUT_LAS))
    metadata = execute_pipeline(pipe)

    # Verify output dimensions
    dims = pipe.arrays[0].dtype.names
    required = {"X", "Y", "Z", "Intensity", "Classification", "ReturnNumber"}
    missing = required - set(dims)
    if missing:
        logging.warning("Missing expected dimensions after pipeline: %s", missing)
    else:
        logging.info("All required dimensions present: %s", sorted(required))
```

## Code Breakdown

### Reader stage: anchoring the source CRS

Declaring `spatialreference` on `readers.las` embeds the coordinate system into the `PointView` from the moment the first point is ingested. Omitting it forces PDAL to infer the CRS from the LAS VLR header, which may be absent in older files. An incorrect or missing CRS at this stage will silently corrupt any downstream [spatial reprojection](https://www.pythonlidar.com/pdal-pipeline-architecture-execution/spatial-reprojection/) result. If the input data was collected in NAD83(2011)/UTM 18N (`EPSG:6347`) but the VLR is blank, every reprojected coordinate will be wrong without raising an error.

### Outlier filter: why it runs before reprojection

`filters.outlier` in statistical mode computes the mean distance to the nearest `mean_k` neighbours for each point. Running this in the source CRS — metres from a UTM projection in this example — gives geometrically meaningful distances. After reprojection the coordinate values change, but the noise points remain; filtering first is therefore slightly cheaper and avoids a second pass. For radius-mode outlier removal the `radius` parameter is in the same units as the active CRS, so reprojection order matters even more. See [applying statistical outlier filters in PDAL](https://www.pythonlidar.com/pdal-pipeline-architecture-execution/pipeline-filtering-logic/applying-statistical-outlier-filters-in-pdal/) for a full parameter guide.

### Reprojection filter: datum and vertical handling

`filters.reprojection` wraps PROJ under the hood. Specifying `out_srs` with a full authority:code string (`EPSG:32618`) triggers PROJ's authority database, which includes datum shift grids. If your source data carries a vertical CRS (e.g. NAVD88), use the compound CRS form `EPSG:6347+5703` in `source_crs` to prevent silent ellipsoidal height substitution. The [spatial reprojection](https://www.pythonlidar.com/pdal-pipeline-architecture-execution/spatial-reprojection/) guide covers PROJ grid installation and compound CRS syntax in detail.

### SMRF ground classifier: parameter rationale

| Parameter | Value used | When to change |
|-----------|-----------|----------------|
| `slope`   | 0.15      | Increase to 0.2–0.3 for steep terrain; lower for flat coastal areas |
| `threshold` | 0.5 m   | Height above the morphological surface to still be classified ground; raise for rough terrain |
| `window`  | 18.0 m    | Max structure diameter assumed to be non-ground; reduce to 8–10 m for TLS in urban canyons |
| `elevation` | 2.0 m   | Max elevation difference across one window step |

### Writer stage: dimension preservation

`forward: "all"` instructs `writers.las` to re-emit every LAS dimension received from the pipeline — including the `Classification` codes 1 and 2 that SMRF writes. `extra_dims: "all"` preserves any non-standard dimensions added by earlier filters, such as `HAG` from `filters.hag_nn`. Omitting these options strips custom dimensions from the output file silently. For workflows that use [attribute mapping](https://www.pythonlidar.com/pdal-pipeline-architecture-execution/attribute-mapping/) to attach custom metadata, `extra_dims: "all"` is mandatory to avoid losing those fields at write time.

## Parameter Reference Table

| Stage | Parameter | Type | Default | Valid range | Effect |
|-------|-----------|------|---------|-------------|--------|
| `readers.las` | `spatialreference` | string | (from VLR) | any EPSG/WKT | Sets CRS on ingested PointView |
| `filters.outlier` | `method` | string | `statistical` | `statistical`, `radius` | Algorithm used to identify noise |
| `filters.outlier` | `mean_k` | int | 8 | 4–30 | Neighbourhood size; larger values are more conservative |
| `filters.outlier` | `multiplier` | float | 2.0 | 1.0–6.0 | SD multiplier; lower = more aggressive removal |
| `filters.reprojection` | `out_srs` | string | — | any EPSG/WKT | Target CRS |
| `filters.reprojection` | `in_srs` | string | (from reader) | any EPSG/WKT | Override source CRS |
| `filters.smrf` | `slope` | float | 0.15 | 0.05–0.6 | Max terrain slope (radians) |
| `filters.smrf` | `threshold` | float | 0.5 | 0.1–2.0 m | Max height above morphological surface |
| `filters.smrf` | `window` | float | 18.0 | 2.0–50.0 m | Max expected non-ground structure width |
| `writers.las` | `forward` | string | `none` | `all`, `header`, dimension list | Which source dimensions to propagate |
| `writers.las` | `extra_dims` | string | — | `all` or dim:type pairs | Non-standard dimensions to include |

## Validation and Data Integrity Checks

Always call `pipeline.validate()` before `pipeline.execute()`. Validation parses the stage graph, checks that required dimensions exist, and catches JSON syntax errors without spending time on actual I/O. The dedicated [pipeline validation](https://www.pythonlidar.com/pdal-pipeline-architecture-execution/pipeline-validation/) page covers the full set of checks PDAL performs and how to surface them as structured errors.

```python
try:
    pipeline.validate()
except RuntimeError as e:
    print(f"Pipeline validation failed: {e}")
    raise
```

After execution, inspect the output buffer to verify that critical dimensions survived every stage in the chain:

```python
dims = set(pipeline.arrays[0].dtype.names)
required = {"X", "Y", "Z", "Classification", "ReturnNumber", "NumberOfReturns"}
assert required.issubset(dims), f"Missing dimensions: {required - dims}"
```

Check point counts before and after filtering to detect over-aggressive parameter choices:

```python
import numpy as np

arr = pipeline.arrays[0]
total   = len(arr)
ground  = int(np.sum(arr["Classification"] == 2))
noise   = int(np.sum(arr["Classification"] == 7))

print(f"Total: {total:,}  Ground: {ground:,} ({ground/total:.1%})  Noise: {noise:,}")
```

Healthy airborne LiDAR datasets typically yield 20–60 % ground returns depending on vegetation density. A ground fraction below 5 % usually indicates that SMRF parameters need adjustment, or that the [pipeline filtering logic](https://www.pythonlidar.com/pdal-pipeline-architecture-execution/pipeline-filtering-logic/) upstream discarded too many low-return points.

For a deeper guide on structuring data cleaning sequences, see [Chaining PDAL Stages for Data Cleaning](https://www.pythonlidar.com/pdal-pipeline-architecture-execution/pdal-stage-chaining/chaining-pdal-stages-for-data-cleaning/).

## Performance Tuning

Pipeline throughput depends on three independent variables: chunk size, compression overhead, and thread allocation. The table below shows representative timings for a 500 M-point regional tile measured on a 16-core workstation with NVMe storage:

| Configuration | `chunk_size` | `OMP_NUM_THREADS` | Time (s) | Peak RAM (GB) |
|---------------|-------------|-------------------|-----------|---------------|
| Baseline (LAZ in/out) | 50 000 | 4 | 218 | 3.1 |
| Uncompressed LAS in, LAZ out | 50 000 | 4 | 171 | 3.4 |
| Uncompressed LAS in/out | 50 000 | 4 | 143 | 3.6 |
| Uncompressed LAS in/out | 50 000 | 16 | 97  | 3.6 |
| Uncompressed LAS in/out | 10 000 | 16 | 108 | 2.2 |

Key takeaways:

- **LAZ decompression costs 20–35 % of total wall time.** Store raw archives as LAZ, but convert to uncompressed LAS before running iterative algorithm tests. Convert back to LAZ for long-term storage.
- **`chunk_size` on the reader stage trades RAM for throughput.** The default of 50 000 points per chunk is a reasonable starting point for machines with 8+ GB RAM. For machines with under 8 GB, set `chunk_size: 10000` and accept the ~10 % throughput penalty. Chunk size does not affect output correctness — only peak memory footprint.
- **`OMP_NUM_THREADS` affects SMRF significantly.** SMRF's window-based morphological operations parallelise well; `filters.outlier` benefits less. Set `OMP_NUM_THREADS` to the number of physical cores, not logical threads — hyperthreading does not help for memory-bandwidth-bound filters.

For memory-constrained environments or very large tiles, see [Memory Management in PDAL Pipelines](https://www.pythonlidar.com/pdal-pipeline-architecture-execution/memory-management/) for techniques including tile splitting and streaming writers. For CPU-bound workloads that process many files in parallel, see [parallel execution in PDAL](https://www.pythonlidar.com/pdal-pipeline-architecture-execution/parallel-execution/).

## Common Errors and Troubleshooting

**`RuntimeError: Unable to open file 'input.laz' for reading`**
Root cause: the `filename` value is a relative path and the process working directory does not match expectations. Fix: always resolve paths to absolute strings before passing them into the pipeline definition — `str(Path(p).resolve())`.

**`RuntimeError: Dimension 'Classification' not found`**
Root cause: a downstream filter (e.g. `filters.range` or `filters.hag_nn`) requires `Classification` but the reader stage is a format that does not carry that dimension (e.g. plain XYZ CSV). Fix: insert `filters.assign` before the offending stage and initialise the dimension — `"value": "Classification = 0"`. The [attribute mapping](https://www.pythonlidar.com/pdal-pipeline-architecture-execution/attribute-mapping/) guide covers `filters.assign` syntax in detail.

**`RuntimeError: PROJ: no suitable transformation found`**
Root cause: `filters.reprojection` cannot find a datum shift grid between the declared source and target CRS, typically because the PROJ data directory is missing grid files. Fix: install the `proj-data` package (`conda install -c conda-forge proj-data`), or switch to a transformation that does not require a grid shift (e.g. use `EPSG:4326` as an intermediate).

**Silent truncation to 0 points**
Root cause: `filters.range` or `filters.outlier` parameters are too strict and eliminate the entire dataset. This manifests as `pipeline.execute()` returning `0` without raising an exception. Fix: run the pipeline in two stages — first with only the reader and writer to confirm point count, then incrementally add filters and check the count after each one.

**`RuntimeError: Pipeline contains no stages`**
Root cause: passing a Python list directly as a bare array to `pdal.Pipeline()` when the PDAL version expects a JSON-encoded string wrapping a `{"pipeline": [...]}` object. Fix: use `json.dumps({"pipeline": stage_list})` as the argument, or pass the raw list only if your `python-pdal` version explicitly documents list support.

## Related

- [PDAL Pipeline Architecture & Execution](https://www.pythonlidar.com/pdal-pipeline-architecture-execution/) — parent overview of the PDAL execution model
- [Chaining PDAL Stages for Data Cleaning](https://www.pythonlidar.com/pdal-pipeline-architecture-execution/pdal-stage-chaining/chaining-pdal-stages-for-data-cleaning/) — detailed patterns for noise removal, intensity normalisation, and classification refinement
- [Pipeline Filtering Logic](https://www.pythonlidar.com/pdal-pipeline-architecture-execution/pipeline-filtering-logic/) — how `filters.range`, `filters.expression`, and conditional logic interact with the stage buffer
- [Pipeline Validation](https://www.pythonlidar.com/pdal-pipeline-architecture-execution/pipeline-validation/) — how to surface schema errors, dimension mismatches, and CRS conflicts before execution
- [Spatial Reprojection](https://www.pythonlidar.com/pdal-pipeline-architecture-execution/spatial-reprojection/) — CRS transformation, datum shift grids, and vertical offset handling
- [Memory Management in PDAL Pipelines](https://www.pythonlidar.com/pdal-pipeline-architecture-execution/memory-management/) — chunk-size tuning, streaming writers, and tile-splitting for large regional datasets
- [Attribute Mapping in PDAL Pipelines](https://www.pythonlidar.com/pdal-pipeline-architecture-execution/attribute-mapping/) — adding, renaming, and forwarding dimensions through a chained pipeline
