---
title: "Applying Statistical Outlier Filters in PDAL"
description: "Step-by-step guide to applying PDAL's filters.outlier stage with statistical method in Python: parameter tuning, pipeline placement, verification, and edge cases."
slug: "applying-statistical-outlier-filters-in-pdal"
type: "long_tail"
breadcrumb: "Applying Statistical Outlier Filters"
datePublished: "2024-11-15"
dateModified: "2026-06-24"
---

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Article",
      "headline": "Applying Statistical Outlier Filters in PDAL",
      "description": "Step-by-step guide to applying PDAL's filters.outlier stage with statistical method in Python: parameter tuning, pipeline placement, verification, and edge cases.",
      "datePublished": "2024-11-15",
      "dateModified": "2026-06-24",
      "author": {"@type": "Organization", "name": "pythonlidar.com"}
    },
    {
      "@type": "BreadcrumbList",
      "itemListElement": [
        {"@type": "ListItem", "position": 1, "name": "Home", "item": "https://pythonlidar.com/"},
        {"@type": "ListItem", "position": 2, "name": "PDAL Pipeline Architecture & Execution", "item": "https://pythonlidar.com/pdal-pipeline-architecture-execution/"},
        {"@type": "ListItem", "position": 3, "name": "Pipeline Filtering Logic", "item": "https://pythonlidar.com/pdal-pipeline-architecture-execution/pipeline-filtering-logic/"},
        {"@type": "ListItem", "position": 4, "name": "Applying Statistical Outlier Filters", "item": "https://pythonlidar.com/pdal-pipeline-architecture-execution/pipeline-filtering-logic/applying-statistical-outlier-filters-in-pdal/"}
      ]
    },
    {
      "@type": "HowTo",
      "name": "Apply Statistical Outlier Filters in PDAL",
      "description": "Remove noise points from LAS/LAZ point clouds using PDAL's filters.outlier stage with statistical method.",
      "step": [
        {"@type": "HowToStep", "position": 1, "name": "Install PDAL Python bindings", "text": "Install pdal via conda-forge or pip and verify with pdal --version."},
        {"@type": "HowToStep", "position": 2, "name": "Place the filter stage", "text": "Insert filters.outlier after readers.las and before any classification or rasterization stage."},
        {"@type": "HowToStep", "position": 3, "name": "Set mean_k and multiplier", "text": "Choose mean_k between 10–30 for airborne data and multiplier between 2.0–3.0 as the sigma threshold."},
        {"@type": "HowToStep", "position": 4, "name": "Execute the pipeline", "text": "Call pipeline.execute() and capture the returned point count."},
        {"@type": "HowToStep", "position": 5, "name": "Verify results", "text": "Assert the output point count is lower than the input and inspect pipeline.metadata for CRS and dimension integrity."}
      ]
    },
    {
      "@type": "FAQPage",
      "mainEntity": [
        {
          "@type": "Question",
          "name": "What is the correct PDAL stage name for statistical outlier removal?",
          "acceptedAnswer": {"@type": "Answer", "text": "The stage is filters.outlier with \"method\": \"statistical\". There is no filters.statistical stage in PDAL."}
        },
        {
          "@type": "Question",
          "name": "Where should filters.outlier sit in a PDAL pipeline?",
          "acceptedAnswer": {"@type": "Answer", "text": "Place it immediately after the reader (and after any CRS assignment) but before ground classification, rasterization, or feature extraction stages."}
        },
        {
          "@type": "Question",
          "name": "How do I prevent over-filtering with the statistical outlier stage?",
          "acceptedAnswer": {"@type": "Answer", "text": "Raise the multiplier value (try 3.0–4.0) or increase mean_k so the neighborhood estimate is more stable. Always validate on a small representative tile first."}
        },
        {
          "@type": "Question",
          "name": "Can filters.outlier handle datasets larger than 50 million points?",
          "acceptedAnswer": {"@type": "Answer", "text": "Yes, but the in-memory k-d tree grows non-linearly. Use filters.splitter to tile the input first, or pre-tile externally with entwine, then process each tile independently."}
        }
      ]
    }
  ]
}
</script>

# Applying Statistical Outlier Filters in PDAL

**TL;DR:** Insert `filters.outlier` with `"method": "statistical"` into your PDAL pipeline immediately after the reader to remove noise points; set `mean_k` between 10 and 30 and `multiplier` between 2.0 and 3.0 for typical airborne LiDAR.

This guide is part of [Pipeline Filtering Logic](/pdal-pipeline-architecture-execution/pipeline-filtering-logic/), the parent reference for sequencing and combining filter stages. Statistical outlier removal (SOR) is the most common first cleaning pass applied to raw LiDAR returns—before ground classification, rasterization, or any measurement that depends on surface continuity.

## Context and Motivation

Raw LiDAR acquisitions contain returns that no classification code can meaningfully represent: atmospheric scatter at apogee, bird strikes crossing the scan plane, multipath reflections off glass facades, and solar noise in single-photon systems. These isolated points have no spatial neighbors that resemble them; they appear as lone spikes well above or below the true surface.

Fixed-threshold Z-range filters catch gross spikes but miss noise at mid-elevation because they have no knowledge of local point density. Statistical outlier removal solves this by measuring each point's relationship to its *k* nearest neighbors rather than checking an absolute bound. A point is an outlier only if it is unusually far from its local neighborhood—not because it exceeds a fixed threshold. This density-awareness makes SOR essential for mixed-resolution datasets where a single Z cutoff would destroy valid sparse returns in rural areas while leaving dense urban noise untouched.

Within a broader [PDAL Pipeline Architecture & Execution](/pdal-pipeline-architecture-execution/) workflow, SOR sits at the boundary between raw acquisition data and analytically meaningful point clouds. Everything downstream—ground models, tree height extraction, building footprints—benefits from a clean input.

<svg viewBox="0 0 640 160" role="img" aria-label="Statistical outlier removal pipeline stage diagram" xmlns="http://www.w3.org/2000/svg" style="width:100%;max-width:640px;display:block;margin:1.5rem auto;">
  <title>SOR pipeline placement: reader → filters.outlier → downstream stages</title>
  <desc>Diagram showing filters.outlier positioned between the LAS reader and downstream classification or rasterization stages in a PDAL pipeline.</desc>
  <defs>
    <marker id="arr" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto">
      <polygon points="0 0,8 3,0 6" fill="currentColor" opacity="0.6"/>
    </marker>
  </defs>
  <!-- Reader box -->
  <rect x="10" y="50" width="120" height="60" rx="6" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.35"/>
  <text x="70" y="76" text-anchor="middle" font-size="12" fill="currentColor" font-family="monospace">readers.las</text>
  <text x="70" y="94" text-anchor="middle" font-size="10" fill="currentColor" opacity="0.7">raw returns</text>
  <!-- Arrow 1 -->
  <line x1="130" y1="80" x2="178" y2="80" stroke="currentColor" stroke-width="1.5" opacity="0.5" marker-end="url(#arr)"/>
  <!-- Filter box (highlighted) -->
  <rect x="180" y="44" width="140" height="72" rx="6" fill="none" stroke="currentColor" stroke-width="2" opacity="0.8"/>
  <text x="250" y="72" text-anchor="middle" font-size="12" fill="currentColor" font-family="monospace">filters.outlier</text>
  <text x="250" y="90" text-anchor="middle" font-size="10" fill="currentColor" opacity="0.7">method: statistical</text>
  <text x="250" y="106" text-anchor="middle" font-size="10" fill="currentColor" opacity="0.7">mean_k · multiplier</text>
  <!-- Arrow 2 -->
  <line x1="320" y1="80" x2="368" y2="80" stroke="currentColor" stroke-width="1.5" opacity="0.5" marker-end="url(#arr)"/>
  <!-- Downstream box -->
  <rect x="370" y="50" width="130" height="60" rx="6" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.35"/>
  <text x="435" y="76" text-anchor="middle" font-size="12" fill="currentColor" font-family="monospace">classification /</text>
  <text x="435" y="94" text-anchor="middle" font-size="12" fill="currentColor" font-family="monospace">writers.las</text>
  <!-- Label below filter -->
  <text x="250" y="132" text-anchor="middle" font-size="10" fill="currentColor" opacity="0.55">k-d tree neighborhood · sigma threshold</text>
</svg>

## Prerequisites and Assumptions

- **PDAL 2.4 or later** — earlier releases have different parameter defaults for `filters.outlier`.
- **Python 3.10+** with `pdal` bindings installed via `conda install -c conda-forge python-pdal` or `pip install pdal`.
- **Input file format**: LAS 1.2–1.4 or LAZ. The stage reads the `X`, `Y`, `Z` dimensions; it does not require `Classification` or any custom dimension.
- **numpy** for in-memory array access after execution.
- A test tile of 5–20 million points is recommended for initial parameter calibration before processing full flight lines.

Verify the setup:

```python
import pdal
print(pdal.__version__)   # should be 2.4.x or higher
```

## Step-by-Step Implementation

### Step 1 — Build the minimal pipeline

The bare-minimum pipeline to apply statistical outlier removal reads a file, filters it, and writes a cleaned output:

```json
{
  "pipeline": [
    {
      "type": "readers.las",
      "filename": "input_raw.laz"
    },
    {
      "type": "filters.outlier",
      "method": "statistical",
      "mean_k": 20,
      "multiplier": 3.0
    },
    {
      "type": "writers.las",
      "filename": "output_clean.laz",
      "forward": "all"
    }
  ]
}
```

`"forward": "all"` on the writer preserves every original point attribute (intensity, return number, scan angle, any custom dimensions) that the filter stage did not modify. Omitting it drops non-standard dimensions silently.

### Step 2 — Choose parameters for your acquisition type

The two parameters that control how aggressively points are removed:

| Parameter | Type | Default | Airborne range | Terrestrial / mobile range | Effect |
|---|---|---|---|---|---|
| `mean_k` | `int` | `8` | `10`–`30` | `30`–`60` | Neighborhood size for the k-d tree query. Too low → noisy local mean; too high → smooths genuine edges. |
| `multiplier` | `float` | `2.0` | `2.5`–`3.5` | `2.0`–`3.0` | Sigma threshold. Values below `1.5` will prune valid sparse features; above `4.0` rarely removes meaningful noise. |

For a first pass on an unknown airborne dataset, `mean_k=20` and `multiplier=3.0` are safe starting values. Validate on a representative 5 km² tile before committing to full-project parameters.

### Step 3 — Integrate into a Python workflow

```python
import pdal
import numpy as np
import sys
from typing import Optional, Dict, Any


def apply_statistical_filter(
    input_path: str,
    output_path: Optional[str] = None,
    mean_k: int = 20,
    multiplier: float = 3.0,
) -> Dict[str, Any]:
    """
    Apply PDAL's statistical outlier filter to a LAS/LAZ file.

    Args:
        input_path:  Path to source LAS/LAZ file.
        output_path: Optional path for the cleaned output. If None, results
                     are only available as an in-memory NumPy array.
        mean_k:      Number of nearest neighbours for the local mean distance.
        multiplier:  Standard-deviation threshold; points beyond this multiple
                     of the global mean distance are removed.

    Returns:
        Dict with 'points_kept' (int) and 'metadata' (dict).
    """
    pipeline_def: list = [
        {"type": "readers.las", "filename": input_path},
        {
            "type": "filters.outlier",
            "method": "statistical",
            "mean_k": mean_k,
            "multiplier": multiplier,
        },
    ]

    if output_path:
        pipeline_def.append(
            {
                "type": "writers.las",
                "filename": output_path,
                "forward": "all",
            }
        )

    pipeline = pdal.Pipeline(pipeline_def)

    try:
        count = pipeline.execute()
    except RuntimeError as exc:
        print(f"Pipeline failed: {exc}", file=sys.stderr)
        sys.exit(1)

    return {"points_kept": count, "metadata": pipeline.metadata}


def get_filtered_array(
    input_path: str,
    mean_k: int = 20,
    multiplier: float = 3.0,
) -> np.ndarray:
    """Return the filtered cloud as a NumPy structured array (no disk write)."""
    pipeline = pdal.Pipeline(
        [
            {"type": "readers.las", "filename": input_path},
            {
                "type": "filters.outlier",
                "method": "statistical",
                "mean_k": mean_k,
                "multiplier": multiplier,
            },
        ]
    )
    pipeline.execute()
    return pipeline.arrays[0]


if __name__ == "__main__":
    result = apply_statistical_filter(
        "input_raw.laz",
        "output_clean.laz",
        mean_k=20,
        multiplier=3.0,
    )
    print(f"Points retained: {result['points_kept']}")
```

### Step 4 — Position the stage correctly in a real pipeline

In any production pipeline that continues to [PDAL Stage Chaining](/pdal-pipeline-architecture-execution/pdal-stage-chaining/) for classification or surface modelling, place `filters.outlier` immediately after the reader and any CRS-setting step, but before any classification or rasterization stage:

```python
pipeline_def = [
    {"type": "readers.las", "filename": "survey.laz"},
    # Assign CRS if not already embedded in the header
    {"type": "filters.reprojection", "in_srs": "EPSG:32618", "out_srs": "EPSG:32618"},
    # Statistical outlier removal first — before SMRF or any feature extractor
    {"type": "filters.outlier", "method": "statistical", "mean_k": 20, "multiplier": 3.0},
    # Ground classification after cleaning
    {"type": "filters.smrf", "slope": 0.15, "window": 18.0, "threshold": 0.5, "scalar": 1.2},
    {"type": "writers.las", "filename": "classified_clean.laz", "forward": "all"},
]
```

Running SOR *after* `filters.smrf` risks removing valid ground points that SMRF has already classified as class 2, which corrupts DTM generation downstream.

## Verification

After execution, confirm three things:

**1. Point count decreased:**
```python
result = apply_statistical_filter("raw.laz", "clean.laz")
assert result["points_kept"] > 0, "Pipeline produced empty output"
# For typical airborne data, noise removal removes 0.1–2 % of points
print(f"Retained {result['points_kept']} points")
```

**2. Output dimensions are intact:**
```python
arr = get_filtered_array("raw.laz")
expected_dims = {"X", "Y", "Z", "Intensity", "ReturnNumber", "Classification"}
actual_dims = set(arr.dtype.names)
assert expected_dims.issubset(actual_dims), f"Missing dims: {expected_dims - actual_dims}"
```

**3. CRS is preserved:**
```python
import json
meta = json.loads(result["metadata"])
# Navigate to the reader's metadata to confirm SRS is not None
reader_meta = meta["metadata"]["readers.las"][0]
print(reader_meta.get("srs", {}).get("wkt", "No CRS embedded"))
```

You can also run `pdal info --stats output_clean.laz` and compare the Z range and point count against the raw file to spot gross over-filtering.

## Gotchas and Edge Cases

**Stage name confusion.** The correct PDAL stage is `filters.outlier` with `"method": "statistical"`. There is no `filters.statistical` stage; using that name silently fails with a `RuntimeError: Couldn't create stage`.

**Applying SOR after classification removes valid sparse classes.** Transmission towers, isolated trees, and bridge decks have far fewer neighbors than the surrounding ground; SOR sees them as outliers. If your project requires preserving classified returns, run SOR on the raw, unclassified cloud first, or apply it selectively via `filters.expression` to subset only unclassified points before the cleaning pass.

**Tile-edge artifacts.** The k-d tree is built per pipeline invocation. Points at tile boundaries have artificially truncated neighborhoods because their true neighbors are in the adjacent tile. Apply a 5–10 m overlap buffer when tiling with `filters.splitter`, then strip the buffer after SOR and before merging outputs. Alternatively, use [Memory Management](/pdal-pipeline-architecture-execution/memory-management/) strategies to process larger in-memory chunks that span tile boundaries.

**k-d tree memory scaling.** Memory consumption for the neighborhood index grows with point count at roughly O(n log n). For datasets above 50 million points per tile, monitor peak RAM with `tracemalloc` during development and budget at least 16 GB for 100 M-point tiles. If processing fails with an `std::bad_alloc` error, reduce tile size before changing filter parameters.

**Pre-filtered sensor data.** Some survey-grade scanners apply their own noise rejection before writing LAS. Running SOR on already-clean data with a low multiplier can strip valid but sparse features. Check `pdal info --metadata input.laz` for manufacturer-provided noise flags or pre-existing classification values before adding a redundant filter stage.

---

## Related

- [Pipeline Filtering Logic](/pdal-pipeline-architecture-execution/pipeline-filtering-logic/) — parent reference covering filter sequencing, predicate evaluation, and spatial constraints
- [PDAL Stage Chaining](/pdal-pipeline-architecture-execution/pdal-stage-chaining/) — how buffers propagate between stages and how to chain SOR with classification stages
- [Chaining PDAL Stages for Data Cleaning](/pdal-pipeline-architecture-execution/pdal-stage-chaining/chaining-pdal-stages-for-data-cleaning/) — worked example combining outlier removal, range filtering, and ground classification
- [Memory Management](/pdal-pipeline-architecture-execution/memory-management/) — tiling strategies and RAM budgeting for large airborne datasets
- [PDAL Pipeline Architecture & Execution](/pdal-pipeline-architecture-execution/) — top-level reference for the full pipeline execution model
