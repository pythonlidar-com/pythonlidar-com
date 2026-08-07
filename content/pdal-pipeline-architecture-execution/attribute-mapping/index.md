---
title: "Attribute Mapping in PDAL: Translate, Compute & Persist Point Cloud Dimensions"
description: "How to translate, derive, and persist point cloud dimensions in PDAL pipelines using filters.assign and extra_dims — covering schema auditing, type casting, validation checks, and common errors."
slug: "attribute-mapping"
type: "topic"
breadcrumb: "Attribute Mapping"
datePublished: "2024-03-15"
dateModified: "2026-06-24"
---

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Article",
      "headline": "Attribute Mapping in PDAL: Translate, Compute & Persist Point Cloud Dimensions",
      "description": "How to translate, derive, and persist point cloud dimensions in PDAL pipelines using filters.assign and extra_dims — covering schema auditing, type casting, validation checks, and common errors.",
      "datePublished": "2024-03-15",
      "dateModified": "2026-06-24",
      "author": {"@type": "Organization", "name": "pythonlidar.com"}
    },
    {
      "@type": "BreadcrumbList",
      "itemListElement": [
        {"@type": "ListItem", "position": 1, "name": "Home", "item": "https://www.pythonlidar.com/"},
        {"@type": "ListItem", "position": 2, "name": "PDAL Pipeline Architecture & Execution", "item": "https://www.pythonlidar.com/pdal-pipeline-architecture-execution/"},
        {"@type": "ListItem", "position": 3, "name": "Attribute Mapping", "item": "https://www.pythonlidar.com/pdal-pipeline-architecture-execution/attribute-mapping/"}
      ]
    },
    {
      "@type": "HowTo",
      "name": "Map and persist custom point cloud dimensions in a PDAL pipeline",
      "step": [
        {"@type": "HowToStep", "name": "Audit the input schema", "text": "Run pdal info --schema on the input file to list every dimension name, type, and value range before writing any pipeline JSON."},
        {"@type": "HowToStep", "name": "Declare extra_dims in the reader", "text": "Add extra_dims to readers.las so PDAL allocates buffer space for any non-standard inbound dimension before filters run."},
        {"@type": "HowToStep", "name": "Add filters.assign stages for each mapping rule", "text": "Chain one filters.assign per logical group of transformations — static flags, unit conversions, and derived metrics — in execution order."},
        {"@type": "HowToStep", "name": "Declare extra_dims in the writer", "text": "Mirror every custom dimension in writers.las extra_dims with its target type so PDAL persists it to disk rather than silently dropping it."},
        {"@type": "HowToStep", "name": "Validate output dimensions and value ranges", "text": "After execute(), inspect pipeline.arrays[0].dtype.names and assert value ranges to confirm the schema contract was met."}
      ]
    },
    {
      "@type": "FAQPage",
      "mainEntity": [
        {
          "@type": "Question",
          "name": "Why do custom dimensions disappear from the output LAS file even though filters.assign ran without errors?",
          "acceptedAnswer": {"@type": "Answer", "text": "The most common cause is a missing extra_dims declaration in the writer stage. PDAL computes the dimension correctly in the in-memory buffer but writers.las only persists dimensions that are explicitly listed in its extra_dims parameter. Add the dimension name and type (e.g. intensity_norm=float) to the writer's extra_dims and the output will include it."}
        },
        {
          "@type": "Question",
          "name": "Can I reference a dimension computed in one filters.assign stage inside a later filters.assign expression?",
          "acceptedAnswer": {"@type": "Answer", "text": "Yes. PDAL evaluates filters.assign stages in the order they appear in the pipeline array, and each stage writes its results back into the shared PointView buffer before the next stage reads from it. A dimension assigned in stage N is therefore available to expressions in stage N+1 and beyond."}
        },
        {
          "@type": "Question",
          "name": "What types can I use in extra_dims for LAS 1.4 output?",
          "acceptedAnswer": {"@type": "Answer", "text": "PDAL supports uint8, uint16, uint32, uint64, int8, int16, int32, int64, float, and double as extra_dims types for writers.las. Choose the narrowest type that fits your value range to minimize file size — uint8 for flags (0/1), float for normalized ratios, double for high-precision measurements."}
        }
      ]
    }
  ]
}
</script>

Raw LiDAR sensor output almost never matches the dimensional schema your downstream analysis expects. Intensity values arrive as raw 16-bit integers when your terrain classifier wants a normalized float; classification codes are absent when your vegetation filter requires them; vendor-specific extra bytes carry reflectance data that standard `writers.las` will silently discard. Attribute mapping is the systematic process of translating, computing, and persisting point cloud dimensions so that every downstream stage in the processing graph receives exactly the schema it needs. It is a foundational concern within the broader [PDAL Pipeline Architecture & Execution](https://www.pythonlidar.com/pdal-pipeline-architecture-execution/) framework — without explicit dimension contracts, silent schema violations propagate undetected through multi-stage pipelines and corrupt analytical outputs.

---

<svg viewBox="-12 -12 780 216" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Attribute mapping data-flow: raw LAS input flows through schema inspection, filters.assign transformation, and validated output with custom dimensions" style="width:100%;max-width:760px;display:block;margin:1.5rem auto;">
  <title>Attribute Mapping Pipeline Data-Flow</title>
  <desc>Four-stage left-to-right flow diagram. Stage 1: readers.las reads raw input and declares extra_dims. Stage 2: Schema inspect audits dtype names, type and range. Stage 3: filters.assign computes static and derived dimensions with type casting. Stage 4: writers.las persists extra_dims to validated output. Numbered arrows connect each stage.</desc>
  <rect x="-12" y="-12" width="780" height="216" fill="var(--dg-bg)" rx="10"/>
  <defs>
    <marker id="am-arrow" markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto">
      <polygon points="0 0, 8 3, 0 6" fill="currentColor" opacity="0.6"/>
    </marker>
  </defs>
  <!-- Top label -->
  <text x="380" y="24" text-anchor="middle" font-size="13" fill="currentColor" font-weight="600" opacity="0.85">Attribute Mapping Pipeline Data-Flow</text>
  <text x="380" y="44" text-anchor="middle" font-size="10" fill="currentColor" opacity="0.5">extra_dims must be declared at both reader and writer; assignment order matters</text>
  <!-- Stage 1: readers.las -->
  <rect x="10" y="70" width="148" height="90" rx="6" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.4"/>
  <text x="84" y="97" text-anchor="middle" font-size="12" fill="currentColor" font-family="ui-monospace,monospace" font-weight="600">readers.las</text>
  <text x="84" y="115" text-anchor="middle" font-size="10" fill="currentColor" opacity="0.7">Raw sensor input</text>
  <text x="84" y="131" text-anchor="middle" font-size="10" fill="currentColor" opacity="0.7">extra_dims declared</text>
  <text x="84" y="147" text-anchor="middle" font-size="10" fill="currentColor" opacity="0.7">buffer allocated</text>
  <!-- Stage 2: Schema inspect -->
  <rect x="193" y="70" width="148" height="90" rx="6" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.4"/>
  <text x="267" y="97" text-anchor="middle" font-size="12" fill="currentColor" font-family="ui-monospace,monospace" font-weight="600">Schema inspect</text>
  <text x="267" y="115" text-anchor="middle" font-size="10" fill="currentColor" opacity="0.7">dtype.names audit</text>
  <text x="267" y="131" text-anchor="middle" font-size="10" fill="currentColor" opacity="0.7">type + range check</text>
  <text x="267" y="147" text-anchor="middle" font-size="10" fill="currentColor" opacity="0.7">rule definition</text>
  <!-- Stage 3: filters.assign -->
  <rect x="376" y="70" width="155" height="90" rx="6" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.4"/>
  <text x="453" y="97" text-anchor="middle" font-size="12" fill="currentColor" font-family="ui-monospace,monospace" font-weight="600">filters.assign</text>
  <text x="453" y="115" text-anchor="middle" font-size="10" fill="currentColor" opacity="0.7">unit conversions</text>
  <text x="453" y="131" text-anchor="middle" font-size="10" fill="currentColor" opacity="0.7">derived dimensions</text>
  <text x="453" y="147" text-anchor="middle" font-size="10" fill="currentColor" opacity="0.7">type casting</text>
  <!-- Stage 4: writers.las -->
  <rect x="566" y="70" width="180" height="90" rx="6" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.4"/>
  <text x="656" y="97" text-anchor="middle" font-size="12" fill="currentColor" font-family="ui-monospace,monospace" font-weight="600">writers.las</text>
  <text x="656" y="115" text-anchor="middle" font-size="10" fill="currentColor" opacity="0.7">extra_dims persisted</text>
  <text x="656" y="131" text-anchor="middle" font-size="10" fill="currentColor" opacity="0.7">LAS 1.4 format pinned</text>
  <text x="656" y="147" text-anchor="middle" font-size="10" fill="currentColor" opacity="0.7">validated output</text>
  <!-- Arrows -->
  <line x1="158" y1="115" x2="191" y2="115" stroke="currentColor" stroke-width="1.5" opacity="0.6" marker-end="url(#am-arrow)"/>
  <line x1="341" y1="115" x2="374" y2="115" stroke="currentColor" stroke-width="1.5" opacity="0.6" marker-end="url(#am-arrow)"/>
  <line x1="531" y1="115" x2="564" y2="115" stroke="currentColor" stroke-width="1.5" opacity="0.6" marker-end="url(#am-arrow)"/>
  <!-- Stage labels -->
  <text x="84" y="180" text-anchor="middle" font-size="9" fill="currentColor" opacity="0.5">① read</text>
  <text x="267" y="180" text-anchor="middle" font-size="9" fill="currentColor" opacity="0.5">② inspect</text>
  <text x="453" y="180" text-anchor="middle" font-size="9" fill="currentColor" opacity="0.5">③ transform</text>
  <text x="656" y="180" text-anchor="middle" font-size="9" fill="currentColor" opacity="0.5">④ write</text>
  <!-- Step numbers in corners -->
  <text x="18" y="86" font-size="9" fill="currentColor" opacity="0.4">①</text>
  <text x="201" y="86" font-size="9" fill="currentColor" opacity="0.4">②</text>
  <text x="384" y="86" font-size="9" fill="currentColor" opacity="0.4">③</text>
  <text x="574" y="86" font-size="9" fill="currentColor" opacity="0.4">④</text>
</svg>

## Prerequisites

Before implementing attribute mapping, confirm your environment and input data meet these requirements:

- **PDAL 2.5+** compiled with LAS/LAZ, GeoTIFF, and Python bindings (`pip install pdal` or `conda install -c conda-forge python-pdal`)
- **Python 3.10+** with `numpy`, `pyproj`, and `logging` available in the active environment
- **Input file** conforming to LAS 1.2–1.4 or LAZ; vendor-specific formats (E57, PLY) require an additional reader stage
- **Known input dimensions**: the workflow below assumes `X`, `Y`, `Z`, `Intensity` (uint16), `ReturnNumber`, `NumberOfReturns`, and `Classification` are present — verify with `pdal info --schema input.laz` before starting
- **CRS metadata** present in the input file's VLR records; if missing, handle it at the reader level with an explicit `spatialreference` parameter before combining it with [spatial reprojection](https://www.pythonlidar.com/pdal-pipeline-architecture-execution/spatial-reprojection/) stages
- **Test dataset**: a USGS 3DEP tile or any LAZ tile from OpenTopography works well; the examples below use a 2 million-point urban scan

## Core Workflow Architecture

Attribute mapping follows a five-phase execution lifecycle inside every PDAL pipeline:

1. **Reader declaration with `extra_dims`**: the reader stage must name any non-standard incoming dimensions so PDAL allocates buffer space for them. Omitting `extra_dims` here causes custom bytes to be ignored before any filter sees them.
2. **Schema audit**: after an initial `execute()` call, inspect `pipeline.arrays[0].dtype.names` to confirm which dimensions exist, their NumPy types, and their value ranges. This audit drives the mapping rule definition in phase 3.
3. **Rule definition**: document static assignments (provenance flags, CRS identifiers), unit conversions (intensity normalization, elevation offsets), derived attributes (return ratio, height-above-ground proxy), and type casts in a version-controlled JSON configuration before writing any pipeline JSON.
4. **Transformation pipeline construction**: translate each rule into a `filters.assign` expression. Chain multiple `filters.assign` stages when expressions are logically independent — PDAL evaluates them in declaration order, so dimensions computed in an earlier stage are available to later ones. Understanding [PDAL stage chaining](https://www.pythonlidar.com/pdal-pipeline-architecture-execution/pdal-stage-chaining/) semantics is critical here: transformation stages that compute derived dimensions must appear *before* any filter that consumes those dimensions.
5. **Writer declaration with `extra_dims`**: the writer must re-declare every custom dimension with its target type. Without this declaration, `writers.las` drops custom dimensions silently even when upstream filters have correctly computed them.

## Full Implementation

The function below encapsulates the complete attribute mapping lifecycle with typed signatures, structured logging, and validation:

```python
import json
import logging
from pathlib import Path

import numpy as np
import pdal

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
log = logging.getLogger("attribute_mapping")


def inspect_schema(input_path: str) -> dict[str, str]:
    """Return a dict mapping dimension name -> numpy dtype string for input_path."""
    pipeline_def = [{"type": "readers.las", "filename": input_path}]
    pipeline = pdal.Pipeline(json.dumps(pipeline_def))
    pipeline.execute()
    arr = pipeline.arrays[0]
    schema = {name: str(arr.dtype[name]) for name in arr.dtype.names}
    log.info("Schema audit: %d dimensions found in %s", len(schema), input_path)
    return schema


def build_mapping_pipeline(
    input_path: str,
    output_path: str,
    mapping_rules: list[dict],
    input_extra_dims: str = "custom_flag=uint8",
    output_extra_dims: str = "intensity_norm=float,custom_flag=uint8",
) -> list[dict]:
    """
    Construct a PDAL pipeline list from mapping_rules.

    Each rule in mapping_rules must be a dict with:
        {"type": "filters.assign", "value": "<expression>"}
    """
    reader = {
        "type": "readers.las",
        "filename": input_path,
        "extra_dims": input_extra_dims,
    }
    writer = {
        "type": "writers.las",
        "filename": output_path,
        "compression": "laszip",
        "minor_version": 4,
        "dataformat_id": 6,
        "extra_dims": output_extra_dims,
    }
    return [reader] + mapping_rules + [writer]


def run_attribute_mapping(
    input_path: str,
    output_path: str,
    mapping_rules: list[dict],
    input_extra_dims: str = "custom_flag=uint8",
    output_extra_dims: str = "intensity_norm=float,custom_flag=uint8",
    expected_dims: list[str] | None = None,
) -> dict:
    """
    Execute attribute mapping and return a structured result report.

    Args:
        input_path: Absolute path to the source LAZ/LAS file.
        output_path: Absolute path for the mapped output file.
        mapping_rules: List of PDAL filter stage dicts in execution order.
        input_extra_dims: Extra dimension declarations for readers.las.
        output_extra_dims: Extra dimension declarations for writers.las.
        expected_dims: Dimension names that must be present in the output array.

    Returns:
        dict with keys: status, points, dims, metadata, errors
    """
    Path(output_path).parent.mkdir(parents=True, exist_ok=True)

    pipeline_def = build_mapping_pipeline(
        input_path=input_path,
        output_path=output_path,
        mapping_rules=mapping_rules,
        input_extra_dims=input_extra_dims,
        output_extra_dims=output_extra_dims,
    )

    log.info("Executing attribute mapping pipeline (%d stages)", len(pipeline_def))
    log.debug("Pipeline JSON: %s", json.dumps(pipeline_def, indent=2))

    try:
        pipeline = pdal.Pipeline(json.dumps(pipeline_def))
        count = pipeline.execute()
    except RuntimeError as exc:
        log.error("Pipeline execution failed: %s", exc)
        return {"status": "failed", "points": 0, "dims": [], "metadata": {}, "errors": [str(exc)]}

    if count == 0:
        msg = "Pipeline returned zero points — check input path and stage configuration."
        log.error(msg)
        return {"status": "failed", "points": 0, "dims": [], "metadata": {}, "errors": [msg]}

    arr = pipeline.arrays[0]
    out_dims = list(arr.dtype.names)
    errors: list[str] = []

    # Validate that expected dimensions were produced
    if expected_dims:
        for dim in expected_dims:
            if dim not in out_dims:
                errors.append(f"Expected dimension '{dim}' missing from output array.")

    # Validate intensity_norm bounds if present
    if "intensity_norm" in out_dims:
        min_val = float(arr["intensity_norm"].min())
        max_val = float(arr["intensity_norm"].max())
        if min_val < 0.0 or max_val > 1.0:
            errors.append(
                f"intensity_norm out of bounds: min={min_val:.4f}, max={max_val:.4f} (expected [0.0, 1.0])"
            )

    if errors:
        log.warning("Validation completed with %d error(s): %s", len(errors), errors)
    else:
        log.info("Mapping succeeded: %d points, %d dimensions", count, len(out_dims))

    return {
        "status": "success" if not errors else "warning",
        "points": count,
        "dims": out_dims,
        "metadata": json.loads(pipeline.metadata),
        "errors": errors,
    }


# ── Example invocation ──────────────────────────────────────────────────────
if __name__ == "__main__":
    rules = [
        # Normalize 16-bit raw intensity to [0.0, 1.0]
        {"type": "filters.assign", "value": "intensity_norm = Intensity / 65535.0"},
        # Compute return ratio as a provenance metric
        {"type": "filters.assign", "value": "return_ratio = ReturnNumber / NumberOfReturns"},
        # Mark every point with a processing-pass flag
        {"type": "filters.assign", "value": "custom_flag = 1"},
    ]

    result = run_attribute_mapping(
        input_path="/data/lidar/urban_scan.laz",
        output_path="/data/lidar/urban_scan_mapped.laz",
        mapping_rules=rules,
        input_extra_dims="custom_flag=uint8",
        output_extra_dims="intensity_norm=float,return_ratio=float,custom_flag=uint8",
        expected_dims=["intensity_norm", "return_ratio", "custom_flag"],
    )
    print(json.dumps(result, indent=2, default=str))
```

<svg viewBox="0 0 720 250" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="The dimensions a point carries through a pipeline, with type and width" style="width:100%;max-width:720px;display:block;margin:1.6rem auto">
  <title>What one point actually weighs</title>
  <desc>Each block is one dimension in the point layout: the three coordinates as doubles, intensity as a sixteen-bit integer, classification and return number as single bytes, GPS time as a double, and one custom float added by a filter. The widths add up to the per-point memory cost, and a custom dimension is exactly as expensive as its type.</desc>
  <rect x="0" y="0" width="720" height="250" fill="var(--dg-bg)" rx="10"/>
  <rect x="24" y="70" width="94" height="60" rx="5" fill="var(--dg-b-soft)" stroke="var(--dg-b)" stroke-width="1.3"/>
  <text x="71" y="96" text-anchor="middle" font-size="10" fill="var(--dg-text)">X</text>
  <text x="71" y="114" text-anchor="middle" font-size="9.5" fill="var(--dg-muted)">double</text>
  <text x="71" y="148" text-anchor="middle" font-size="10" fill="var(--dg-muted)">8 B</text>
  <rect x="125" y="70" width="94" height="60" rx="5" fill="var(--dg-b-soft)" stroke="var(--dg-b)" stroke-width="1.3"/>
  <text x="172" y="96" text-anchor="middle" font-size="10" fill="var(--dg-text)">Y</text>
  <text x="172" y="114" text-anchor="middle" font-size="9.5" fill="var(--dg-muted)">double</text>
  <text x="172" y="148" text-anchor="middle" font-size="10" fill="var(--dg-muted)">8 B</text>
  <rect x="226" y="70" width="94" height="60" rx="5" fill="var(--dg-b-soft)" stroke="var(--dg-b)" stroke-width="1.3"/>
  <text x="273" y="96" text-anchor="middle" font-size="10" fill="var(--dg-text)">Z</text>
  <text x="273" y="114" text-anchor="middle" font-size="9.5" fill="var(--dg-muted)">double</text>
  <text x="273" y="148" text-anchor="middle" font-size="10" fill="var(--dg-muted)">8 B</text>
  <rect x="327" y="70" width="58" height="60" rx="5" fill="var(--dg-a-soft)" stroke="var(--dg-a)" stroke-width="1.3"/>
  <text x="356" y="96" text-anchor="middle" font-size="10" fill="var(--dg-text)">Intens</text>
  <text x="356" y="114" text-anchor="middle" font-size="9.5" fill="var(--dg-muted)">uint16</text>
  <text x="356" y="148" text-anchor="middle" font-size="10" fill="var(--dg-muted)">2 B</text>
  <rect x="392" y="70" width="58" height="60" rx="5" fill="var(--dg-a-soft)" stroke="var(--dg-a)" stroke-width="1.3"/>
  <text x="421" y="96" text-anchor="middle" font-size="10" fill="var(--dg-text)">Class</text>
  <text x="421" y="114" text-anchor="middle" font-size="9.5" fill="var(--dg-muted)">uint8</text>
  <text x="421" y="148" text-anchor="middle" font-size="10" fill="var(--dg-muted)">1 B</text>
  <rect x="457" y="70" width="58" height="60" rx="5" fill="var(--dg-a-soft)" stroke="var(--dg-a)" stroke-width="1.3"/>
  <text x="486" y="96" text-anchor="middle" font-size="10" fill="var(--dg-text)">Return</text>
  <text x="486" y="114" text-anchor="middle" font-size="9.5" fill="var(--dg-muted)">uint8</text>
  <text x="486" y="148" text-anchor="middle" font-size="10" fill="var(--dg-muted)">1 B</text>
  <rect x="522" y="70" width="94" height="60" rx="5" fill="var(--dg-c-soft)" stroke="var(--dg-c)" stroke-width="1.3"/>
  <text x="569" y="96" text-anchor="middle" font-size="10" fill="var(--dg-text)">GpsTime</text>
  <text x="569" y="114" text-anchor="middle" font-size="9.5" fill="var(--dg-muted)">double</text>
  <text x="569" y="148" text-anchor="middle" font-size="10" fill="var(--dg-muted)">8 B</text>
  <rect x="623" y="70" width="62" height="60" rx="5" fill="var(--dg-d-soft)" stroke="var(--dg-d)" stroke-width="1.3"/>
  <text x="654" y="96" text-anchor="middle" font-size="10" fill="var(--dg-text)">Amplitude</text>
  <text x="654" y="114" text-anchor="middle" font-size="9.5" fill="var(--dg-muted)">float</text>
  <text x="654" y="148" text-anchor="middle" font-size="10" fill="var(--dg-muted)">4 B</text>
  <text x="24" y="48" font-size="10.5" fill="var(--dg-muted)">one point’s layout — PDAL keeps every dimension for every point in the view</text>
  <line x1="24" y1="176" x2="685" y2="176" stroke="var(--dg-line)" stroke-width="1.4"/>
  <text x="24" y="200" font-size="11" fill="var(--dg-text)">40 bytes per point · 18.4 M points · 736 MB before a single filter allocates its own view</text>
  <text x="24" y="226" font-size="10.5" fill="var(--dg-muted)">dropping dimensions you do not need is the cheapest memory saving in a PDAL pipeline</text>
</svg>

## Code Breakdown

### Reader with `extra_dims`

The reader stage uses `"extra_dims": "custom_flag=uint8"` to tell PDAL to allocate a `uint8` field named `custom_flag` in the point buffer before any filter runs. Without this declaration, `filters.assign` would successfully write `custom_flag` into its internal buffer but the writer would have no corresponding column to persist it to, and the dimension would be silently dropped.

### `inspect_schema` for baseline auditing

Running a minimal read-only pipeline before the transformation pipeline catches problems early: missing dimensions, unexpected types (e.g., intensity stored as `float32` instead of `uint16`), or out-of-range coordinate values. Feed this information back into your mapping rule definition phase — do not guess the input schema.

### `filters.assign` expression ordering

PDAL evaluates `filters.assign` stages sequentially. In the example above, `intensity_norm` is computed before `return_ratio`. If your pipeline had a conditional `filters.range` stage that thresholds on `intensity_norm`, it must come *after* the `filters.assign` that defines it. This ordering constraint is the most common source of silent errors in attribute mapping workflows. The [pipeline filtering logic](https://www.pythonlidar.com/pdal-pipeline-architecture-execution/pipeline-filtering-logic/) section explains how PDAL evaluates expressions and propagates dimension metadata between stages.

### Writer with compression and format pins

Setting `"compression": "laszip"`, `"minor_version": 4`, and `"dataformat_id": 6` in the writer is a deliberate choice. LAS 1.4 point format 6 supports GPS time and extended return counts out of the box, accommodating most aerial LiDAR sensors. Pinning these values prevents PDAL from inferring a lower format that might drop return attributes. Always pin the output format in production; PDAL's defaults vary between versions.

### Structured result report

The function returns a dict with `status`, `points`, `dims`, `metadata`, and `errors` rather than raising exceptions. This contract makes it safe to consume from batch orchestration code that loops over hundreds of tiles — the caller inspects `result["errors"]` and decides whether to retry, skip, or halt rather than catching bare exceptions in a tight loop.

### Output directory creation

The implementation calls `Path(output_path).parent.mkdir(parents=True, exist_ok=True)` before executing the pipeline. PDAL will not create missing directories, so adding this guard prevents a silent failure mode in batch jobs that write to a new directory structure.

## Parameter Reference Table

| Parameter | Stage | Type | Default | Valid range / notes |
|---|---|---|---|---|
| `extra_dims` (reader) | `readers.las` | string | `""` (none) | Comma-separated `name=type` pairs. Must declare every non-standard inbound dimension. |
| `extra_dims` (writer) | `writers.las` | string | `""` (none) | Must re-declare every custom dimension you want persisted. Omission silently drops the dimension. |
| `value` | `filters.assign` | string or array | — | PDAL expression string; supports arithmetic, comparison operators, and ternary syntax. Array form available in PDAL 2.5+ for combining independent assignments in one buffer pass. |
| `where` | `filters.assign` | string | `""` | Optional condition expression; limits assignments to matching points only. |
| `compression` | `writers.las` | string | `"none"` | `"laszip"` for LAZ output; `"none"` for uncompressed LAS. Use LAZ for archival; raw LAS for iterative processing. |
| `minor_version` | `writers.las` | int | `2` | LAS spec minor version (2 or 4). LAS 1.4 is required for point formats 6–10 and extended return counts. |
| `dataformat_id` | `writers.las` | int | `0` | Point data record format (0–10). Format 6 is the baseline for LAS 1.4 with GPS time. |
| `spatialreference` | `readers.las` | string | `""` | WKT or EPSG string to override embedded CRS. Use when the input VLR is missing or incorrect. |

For a complete list of `readers.las` and `writers.las` parameters, see the [PDAL documentation](https://pdal.io/en/latest/stages/readers.las.html).

## Validation and Data Integrity Checks

Never treat a non-zero `pipeline.execute()` return value as proof of correctness. Implement these post-execution assertions after every mapping run:

**1. Point count parity**

```python
import subprocess, json

def get_point_count(path: str) -> int:
    result = subprocess.run(
        ["pdal", "info", "--summary", path],
        capture_output=True, text=True, check=True,
    )
    return json.loads(result.stdout)["summary"]["num_points"]

source_n = get_point_count("/data/lidar/urban_scan.laz")
output_n = get_point_count("/data/lidar/urban_scan_mapped.laz")
assert source_n == output_n, f"Point count mismatch: {source_n} in, {output_n} out"
```

**2. Dimension name verification**

```python
arr = pipeline.arrays[0]
required = {"intensity_norm", "return_ratio", "custom_flag"}
missing = required - set(arr.dtype.names)
assert not missing, f"Missing dimensions: {missing}"
```

**3. Statistical range assertions**

```python
assert arr["intensity_norm"].min() >= 0.0, "intensity_norm below 0"
assert arr["intensity_norm"].max() <= 1.0, "intensity_norm above 1"
assert set(np.unique(arr["custom_flag"])).issubset({0, 1}), "custom_flag out of range"
```

**4. CRS round-trip check**

After mapping, verify the output CRS matches the expected EPSG code — especially important when the input lacks VLR metadata and you have injected a `spatialreference` parameter. Pair this with [spatial reprojection](https://www.pythonlidar.com/pdal-pipeline-architecture-execution/spatial-reprojection/) checks if the mapping stage also changes the coordinate system:

```python
import subprocess, json

def get_crs_wkt(path: str) -> str:
    result = subprocess.run(
        ["pdal", "info", "--metadata", path],
        capture_output=True, text=True, check=True,
    )
    return json.loads(result.stdout)["metadata"]["srs"]["wkt"]

assert "EPSG:32610" in get_crs_wkt("/data/lidar/urban_scan_mapped.laz")
```

<svg viewBox="0 0 720 240" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Output file size as extra dimensions are added to a LAS writer" style="width:100%;max-width:720px;display:block;margin:1.6rem auto">
  <title>What each extra dimension costs on disk</title>
  <desc>Output size for one 18.4 million point tile as extra dimensions are appended. The base LAS 1.4 point record is 34 bytes; every four-byte float added through extra_dims adds about 74 megabytes to the file, so eight of them nearly double it.</desc>
  <rect x="0" y="0" width="720" height="240" fill="var(--dg-bg)" rx="10"/>
  <rect x="190" y="56" width="245" height="26" rx="4" fill="var(--dg-a-soft)" stroke="var(--dg-a)" stroke-width="1.3"/>
  <text x="180" y="74" text-anchor="end" font-size="11" fill="var(--dg-text)">none</text>
  <text x="443" y="74" font-size="10.5" fill="var(--dg-muted)">626 MB</text>
  <rect x="190" y="90" width="269" height="26" rx="4" fill="var(--dg-a-soft)" stroke="var(--dg-a)" stroke-width="1.3"/>
  <text x="180" y="108" text-anchor="end" font-size="11" fill="var(--dg-text)">+ Amplitude</text>
  <text x="467" y="108" font-size="10.5" fill="var(--dg-muted)">700 MB</text>
  <rect x="190" y="124" width="294" height="26" rx="4" fill="var(--dg-a-soft)" stroke="var(--dg-a)" stroke-width="1.3"/>
  <text x="180" y="142" text-anchor="end" font-size="11" fill="var(--dg-text)">+ Deviation</text>
  <text x="492" y="142" font-size="10.5" fill="var(--dg-muted)">774 MB</text>
  <rect x="190" y="158" width="343" height="26" rx="4" fill="var(--dg-a-soft)" stroke="var(--dg-a)" stroke-width="1.3"/>
  <text x="180" y="176" text-anchor="end" font-size="11" fill="var(--dg-text)">+ 4 floats</text>
  <text x="541" y="176" font-size="10.5" fill="var(--dg-muted)">922 MB</text>
  <rect x="190" y="192" width="441" height="26" rx="4" fill="var(--dg-a-soft)" stroke="var(--dg-a)" stroke-width="1.3"/>
  <text x="180" y="210" text-anchor="end" font-size="11" fill="var(--dg-text)">+ 8 floats</text>
  <text x="639" y="210" font-size="10.5" fill="var(--dg-muted)">1218 MB</text>
  <text x="190" y="38" font-size="10.5" fill="var(--dg-muted)">LAS 1.4 output, 18.4 M points, uncompressed</text>
  <text x="60" y="234" font-size="10.5" fill="var(--dg-muted)">"extra_dims": "all" is convenient and expensive — name the dimensions you actually need downstream</text>
</svg>

## Performance Tuning

Attribute mapping is primarily I/O-bound and memory-constrained, not compute-bound. Target these bottlenecks:

**Compression strategy for iterative runs**

LAZ compression reduces file size by 5–8× but adds decompression overhead on each pipeline pass. When running repeated mapping experiments on the same tile, keep an uncompressed LAS intermediate and only compress the final output:

| Format | File size (2M pts) | Read time | Write time | Use case |
|---|---|---|---|---|
| `.laz` (LASzip) | ~18 MB | ~0.9 s | ~1.4 s | Archival, final output |
| `.las` (uncompressed) | ~140 MB | ~0.3 s | ~0.4 s | Iterative development |

**Multiple `filters.assign` vs. combined array form**

Each `filters.assign` stage traverses the full point buffer once. Chaining ten separate stages for ten dimensions costs ten full buffer passes. When dimensions are independent (no expression depends on another from this same batch), combine them using the `value` array syntax available in PDAL 2.5+:

```json
{
  "type": "filters.assign",
  "value": [
    "intensity_norm = Intensity / 65535.0",
    "custom_flag = 1"
  ]
}
```

This collapses two buffer passes into one. Verify your PDAL version supports array-style `value` with `pdal --version` before deploying.

**Memory footprint for large tiles**

Attribute mapping loads the entire point buffer into RAM. For tiles exceeding 50 million points, combine attribute mapping with [parallel execution](https://www.pythonlidar.com/pdal-pipeline-architecture-execution/parallel-execution/) by splitting tiles spatially with `filters.splitter` before mapping, then merging the mapped outputs. A `uint8` dimension adds 1 byte per point; a `float32` dimension adds 4 bytes. For 100 million points, adding five `float32` custom dimensions increases RAM consumption by approximately 2 GB.

## Common Errors and Troubleshooting

**Error: `Dimension 'intensity_norm' not found in point view`**

Cause: `intensity_norm` is declared in `extra_dims` of `writers.las` but not computed by any prior `filters.assign`. The writer expects the dimension to exist in the buffer; when it does not, PDAL raises a dimension-not-found error.

Fix: ensure a `filters.assign` stage with `"value": "intensity_norm = Intensity / 65535.0"` appears between the reader and writer, and that the stage is actually present in the pipeline array (not just in a comment).

---

**Error: `writers.las: Extra dimension 'custom_flag' specified but not found in the point buffer`**

Cause: `extra_dims` in `writers.las` references a dimension name that neither the reader nor any filter has created. This happens when the reader's `extra_dims` declaration is missing but the writer's is present — the buffer never contained the dimension.

Fix: add `"extra_dims": "custom_flag=uint8"` to `readers.las` so PDAL allocates the field at read time.

---

**Silent truncation: custom dimensions missing from output file but no error raised**

Cause: `extra_dims` is declared in `readers.las` and `filters.assign` computes the value, but `extra_dims` is absent from `writers.las`. PDAL successfully writes the file but omits all non-standard dimensions without raising an error.

Fix: always mirror every custom dimension in both the reader and the writer `extra_dims` declarations.

---

**Error: `Expression evaluation error: unknown variable 'ReturnNumber'`**

Cause: the dimension name in the `filters.assign` expression does not match the LAS dimension name exactly. PDAL dimension names are case-sensitive and follow the LAS specification (`ReturnNumber`, not `return_number` or `returnNumber`).

Fix: run `pdal info --schema input.laz` to list the exact dimension names, then copy them verbatim into your expression strings. Cross-reference standard dimension names against the [ASPRS classification codes](https://www.pythonlidar.com/point-cloud-data-standards-fundamentals/asprs-classification-codes/) and LAS header conventions if you are unsure whether a dimension is standard or vendor-specific.

---

**Error: `Unable to open file for writing: /data/lidar/output.laz`**

Cause: the output directory does not exist or the process lacks write permissions. PDAL will not create directories automatically.

Fix: call `Path(output_path).parent.mkdir(parents=True, exist_ok=True)` before executing the pipeline. In batch jobs, check directory permissions at startup before processing any tiles.

---

For vendor-specific edge cases — arbitrary extra byte offsets, dynamic schema expansion for machine-learning feature vectors, and reflectance normalization for full-waveform sensors — see [Mapping Custom Attributes in PDAL Pipelines](https://www.pythonlidar.com/pdal-pipeline-architecture-execution/attribute-mapping/mapping-custom-attributes-in-pdal-pipelines/).

## Related

- [Mapping Custom Attributes in PDAL Pipelines](https://www.pythonlidar.com/pdal-pipeline-architecture-execution/attribute-mapping/mapping-custom-attributes-in-pdal-pipelines/) — vendor extra bytes, ML feature dimensions, and dynamic schema expansion
- [PDAL Stage Chaining](https://www.pythonlidar.com/pdal-pipeline-architecture-execution/pdal-stage-chaining/) — how PDAL passes buffers between stages and what ordering constraints affect dimension availability
- [Pipeline Filtering Logic](https://www.pythonlidar.com/pdal-pipeline-architecture-execution/pipeline-filtering-logic/) — conditional dimension filtering and expression evaluation that complements attribute assignment
- [Spatial Reprojection](https://www.pythonlidar.com/pdal-pipeline-architecture-execution/spatial-reprojection/) — coordinate transformations that often accompany schema normalization in multi-source ingestion workflows
- [Pipeline Validation](https://www.pythonlidar.com/pdal-pipeline-architecture-execution/pipeline-validation/) — pre-execution validation strategies to catch schema errors before running against large datasets
- [PDAL Pipeline Architecture & Execution](https://www.pythonlidar.com/pdal-pipeline-architecture-execution/) — parent guide covering the full execution model, stage categories, and production deployment patterns
