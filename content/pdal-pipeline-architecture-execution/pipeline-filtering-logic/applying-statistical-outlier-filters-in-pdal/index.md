---
title: "Applying Statistical Outlier Filters in PDAL"
description: "Step-by-step guide to applying PDAL's filters.outlier stage with statistical method in Python: parameter tuning, pipeline placement, complete working example, verification, and edge cases."
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
      "description": "Step-by-step guide to applying PDAL's filters.outlier stage with statistical method in Python: parameter tuning, pipeline placement, complete working example, verification, and edge cases.",
      "datePublished": "2024-11-15",
      "dateModified": "2026-06-24",
      "author": {"@type": "Organization", "name": "pythonlidar.com"},
      "publisher": {"@type": "Organization", "name": "pythonlidar.com"},
      "mainEntityOfPage": {
        "@type": "WebPage",
        "@id": "https://pythonlidar.com/pdal-pipeline-architecture-execution/pipeline-filtering-logic/applying-statistical-outlier-filters-in-pdal/"
      }
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
        {"@type": "HowToStep", "position": 3, "name": "Set mean_k and multiplier", "text": "Choose mean_k between 10-30 for airborne data and multiplier between 2.0-3.0 as the sigma threshold."},
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
          "acceptedAnswer": {"@type": "Answer", "text": "Raise the multiplier value (try 3.0-4.0) or increase mean_k so the neighborhood estimate is more stable. Always validate on a small representative tile first."}
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

This guide is part of [Pipeline Filtering Logic](/pdal-pipeline-architecture-execution/pipeline-filtering-logic/), the parent reference for sequencing and combining filter stages in a PDAL execution model. Statistical outlier removal (SOR) is the most common first cleaning pass applied to raw LiDAR returns—before ground classification, rasterization, or any measurement that depends on surface continuity.

## Context and Motivation

Raw LiDAR acquisitions contain returns that no classification code can meaningfully represent: atmospheric scatter at apogee, bird strikes crossing the scan plane, multipath reflections off glass facades, and solar noise in single-photon systems. These isolated points have no spatial neighbors that resemble them; they appear as lone spikes well above or below the true surface.

Fixed-threshold Z-range filters catch gross spikes but miss noise at mid-elevation because they have no knowledge of local point density. Statistical outlier removal solves this by measuring each point's relationship to its *k* nearest neighbors rather than checking an absolute bound. A point is an outlier only if it is unusually far from its local neighborhood—not because it exceeds a fixed threshold. This density-awareness makes SOR essential for mixed-resolution datasets where a single Z cutoff would destroy valid sparse returns in rural areas while leaving dense urban noise untouched.

Within a broader [PDAL Pipeline Architecture & Execution](/pdal-pipeline-architecture-execution/) workflow, SOR sits at the boundary between raw acquisition data and analytically meaningful point clouds. Everything downstream—ground models, tree height extraction, building footprints—benefits from a clean input. The [pipeline validation](/pdal-pipeline-architecture-execution/pipeline-validation/) stage you run before deployment will flag a missing or misnamed filter immediately, catching configuration errors before they propagate to expensive downstream steps.

<svg viewBox="0 0 700 260" role="img" aria-label="Statistical outlier removal: k-d tree neighborhood query diagram" xmlns="http://www.w3.org/2000/svg" style="width:100%;max-width:700px;display:block;margin:1.5rem auto;">
  <title>SOR algorithm: each point queries k nearest neighbours; outliers exceed mean+multiplier×stddev</title>
  <desc>Left panel: pipeline stage flow showing readers.las feeding into filters.outlier then into classification or writers.las. Right panel: scatter of points showing a normal point surrounded by neighbours within the sigma band, and an outlier point isolated far from its neighbours.</desc>
  <defs>
    <marker id="sorArr" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto">
      <polygon points="0 0,8 3,0 6" fill="currentColor" opacity="0.55"/>
    </marker>
    <marker id="sorArrFaint" markerWidth="7" markerHeight="5" refX="7" refY="2.5" orient="auto">
      <polygon points="0 0,7 2.5,0 5" fill="currentColor" opacity="0.3"/>
    </marker>
  </defs>
  <!-- ── LEFT: pipeline flow ── -->
  <!-- readers.las box -->
  <rect x="12" y="88" width="118" height="56" rx="6" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.35"/>
  <text x="71" y="113" text-anchor="middle" font-size="12" fill="currentColor" font-family="monospace" opacity="0.9">readers.las</text>
  <text x="71" y="131" text-anchor="middle" font-size="10" fill="currentColor" opacity="0.6">raw returns</text>
  <!-- arrow 1 -->
  <line x1="130" y1="116" x2="154" y2="116" stroke="currentColor" stroke-width="1.5" opacity="0.45" marker-end="url(#sorArr)"/>
  <!-- filters.outlier box (highlighted) -->
  <rect x="156" y="78" width="148" height="76" rx="6" fill="none" stroke="currentColor" stroke-width="2" opacity="0.85"/>
  <text x="230" y="106" text-anchor="middle" font-size="12" fill="currentColor" font-family="monospace">filters.outlier</text>
  <text x="230" y="124" text-anchor="middle" font-size="10" fill="currentColor" opacity="0.7">method: statistical</text>
  <text x="230" y="141" text-anchor="middle" font-size="10" fill="currentColor" opacity="0.6">mean_k · multiplier</text>
  <!-- arrow 2 -->
  <line x1="304" y1="116" x2="328" y2="116" stroke="currentColor" stroke-width="1.5" opacity="0.45" marker-end="url(#sorArr)"/>
  <!-- downstream box -->
  <rect x="330" y="88" width="124" height="56" rx="6" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.35"/>
  <text x="392" y="110" text-anchor="middle" font-size="11" fill="currentColor" font-family="monospace">classification /</text>
  <text x="392" y="128" text-anchor="middle" font-size="11" fill="currentColor" font-family="monospace">writers.las</text>
  <!-- pipeline label -->
  <text x="233" y="172" text-anchor="middle" font-size="10" fill="currentColor" opacity="0.45">pipeline stage order</text>
  <!-- divider -->
  <line x1="478" y1="20" x2="478" y2="240" stroke="currentColor" stroke-width="1" opacity="0.15" stroke-dasharray="4,4"/>
  <!-- ── RIGHT: k-d tree neighbourhood illustration ── -->
  <text x="590" y="28" text-anchor="middle" font-size="11" fill="currentColor" opacity="0.6">k-d tree query (k=5)</text>
  <!-- radius circle for normal point -->
  <circle cx="565" cy="120" r="52" fill="none" stroke="currentColor" stroke-width="1" opacity="0.2" stroke-dasharray="5,3"/>
  <!-- normal point (centre) -->
  <circle cx="565" cy="120" r="5" fill="currentColor" opacity="0.85"/>
  <text x="565" y="108" text-anchor="middle" font-size="9" fill="currentColor" opacity="0.7">query pt</text>
  <!-- 5 neighbours within radius — placed within the circle -->
  <circle cx="540" cy="100" r="3.5" fill="currentColor" opacity="0.45"/>
  <circle cx="585" cy="105" r="3.5" fill="currentColor" opacity="0.45"/>
  <circle cx="548" cy="140" r="3.5" fill="currentColor" opacity="0.45"/>
  <circle cx="590" cy="138" r="3.5" fill="currentColor" opacity="0.45"/>
  <circle cx="572" cy="95" r="3.5" fill="currentColor" opacity="0.45"/>
  <!-- dashed lines to neighbours -->
  <line x1="565" y1="120" x2="540" y2="100" stroke="currentColor" stroke-width="1" opacity="0.2" stroke-dasharray="3,3"/>
  <line x1="565" y1="120" x2="585" y2="105" stroke="currentColor" stroke-width="1" opacity="0.2" stroke-dasharray="3,3"/>
  <line x1="565" y1="120" x2="548" y2="140" stroke="currentColor" stroke-width="1" opacity="0.2" stroke-dasharray="3,3"/>
  <line x1="565" y1="120" x2="590" y2="138" stroke="currentColor" stroke-width="1" opacity="0.2" stroke-dasharray="3,3"/>
  <line x1="565" y1="120" x2="572" y2="95" stroke="currentColor" stroke-width="1" opacity="0.2" stroke-dasharray="3,3"/>
  <!-- mean distance label -->
  <text x="620" y="118" font-size="9" fill="currentColor" opacity="0.55">mean dist</text>
  <text x="620" y="129" font-size="9" fill="currentColor" opacity="0.55">within σ band</text>
  <text x="620" y="140" font-size="9" fill="currentColor" opacity="0.55">→ KEPT</text>
  <!-- outlier point (far away, isolated) -->
  <circle cx="535" cy="218" r="5" fill="none" stroke="currentColor" stroke-width="1.8" opacity="0.8"/>
  <text x="535" y="208" text-anchor="middle" font-size="9" fill="currentColor" opacity="0.7">outlier</text>
  <text x="535" y="233" text-anchor="middle" font-size="9" fill="currentColor" opacity="0.55">dist &gt; mean+n×σ</text>
  <text x="535" y="245" text-anchor="middle" font-size="9" fill="currentColor" opacity="0.55">→ REMOVED</text>
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

### Step 3 — Position the stage correctly in a real pipeline

In any production pipeline that continues to [PDAL stage chaining](/pdal-pipeline-architecture-execution/pdal-stage-chaining/) for classification or surface modelling, place `filters.outlier` immediately after the reader and any CRS-setting step, but before any classification or rasterization stage:

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

### Step 4 — Execute and capture results

```python
import pdal

pipeline = pdal.Pipeline(pipeline_def)
count = pipeline.execute()
print(f"Points retained: {count}")
```

`pipeline.execute()` returns the total number of points that passed through to the final stage. For typical airborne acquisitions you should see 0.1–2 % of points removed by SOR; more than 5 % warrants investigating whether `multiplier` is too aggressive for your data density.

## Complete Working Example

The following self-contained module can be copy-pasted and run against any LAS/LAZ file. It handles both file-output and in-memory array modes, logs progress, and validates results before returning:

```python
import json
import sys
from typing import Any, Dict, Optional

import numpy as np
import pdal


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
        Dict with 'points_kept' (int), 'points_removed' (int),
        and 'metadata' (dict).
    """
    # Count raw points before filtering for comparison
    count_pipeline = pdal.Pipeline(
        [{"type": "readers.las", "filename": input_path}]
    )
    raw_count = count_pipeline.execute()

    pipeline_stages: list = [
        {"type": "readers.las", "filename": input_path},
        {
            "type": "filters.outlier",
            "method": "statistical",
            "mean_k": mean_k,
            "multiplier": multiplier,
        },
    ]

    if output_path:
        pipeline_stages.append(
            {
                "type": "writers.las",
                "filename": output_path,
                "forward": "all",
            }
        )

    pipeline = pdal.Pipeline(pipeline_stages)

    try:
        kept = pipeline.execute()
    except RuntimeError as exc:
        print(f"Pipeline failed: {exc}", file=sys.stderr)
        sys.exit(1)

    removed = raw_count - kept
    pct_removed = (removed / raw_count * 100) if raw_count else 0
    print(f"Input points : {raw_count:,}")
    print(f"Points kept  : {kept:,}")
    print(f"Points removed: {removed:,} ({pct_removed:.2f}%)")

    if pct_removed > 5.0:
        print(
            "WARNING: >5% of points removed. Consider raising multiplier "
            "or increasing mean_k to reduce over-filtering.",
            file=sys.stderr,
        )

    return {
        "points_kept": kept,
        "points_removed": removed,
        "metadata": pipeline.metadata,
    }


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
    # Confirm CRS survived the filter pass
    meta = json.loads(result["metadata"])
    reader_meta = meta["metadata"]["readers.las"][0]
    srs_wkt = reader_meta.get("srs", {}).get("wkt", "No CRS embedded")
    print(f"Output CRS: {srs_wkt[:80]}...")
```

## Key Parameter Table

| Parameter | Type | Default | Recommended range | Tuning guidance |
|---|---|---|---|---|
| `mean_k` | `int` | `8` | `10`–`60` | Airborne: 10–30. Terrestrial/mobile: 30–60. Too low produces a noisy local mean; too high smooths genuine sharp edges like building corners. |
| `multiplier` | `float` | `2.0` | `1.5`–`4.5` | Below 1.5 removes valid sparse features. Above 4.0 rarely catches real noise. Start at 3.0 for airborne, 2.5 for terrestrial. |
| `method` | `string` | `"statistical"` | `"statistical"` or `"radius"` | `"statistical"` uses k-NN density globally. `"radius"` removes points with fewer than `min_k` neighbours within a fixed radius—useful for removing isolated specks in mobile scans. |
| `classify` | `bool` | `true` | — | When `true`, outliers are flagged as classification 7 (noise) rather than dropped, preserving the full point count while marking suspect returns for downstream inspection. |
| `extract` | `bool` | `false` | — | When `true`, *only* the outlier points are passed to the next stage—useful for auditing what the filter would remove before committing to a destructive run. |

## Verification

After execution, confirm three things:

**1. Point count decreased as expected:**

```python
result = apply_statistical_filter("raw.laz", "clean.laz")
assert result["points_kept"] > 0, "Pipeline produced empty output"
assert result["points_removed"] > 0, "No points were removed — check parameters"
# For typical airborne data, SOR removes 0.1–2% of points
assert result["points_kept"] / (result["points_kept"] + result["points_removed"]) > 0.95, \
    "More than 5% removed — likely over-filtering"
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
reader_meta = meta["metadata"]["readers.las"][0]
print(reader_meta.get("srs", {}).get("wkt", "No CRS embedded"))
```

You can also run `pdal info --stats output_clean.laz` from the command line and compare the Z range and point count against the raw file to spot gross over-filtering quickly.

## Gotchas and Edge Cases

**Stage name confusion.** The correct PDAL stage is `filters.outlier` with `"method": "statistical"`. There is no `filters.statistical` stage; using that name causes a `RuntimeError: Couldn't create stage 'filters.statistical'`. The [pipeline validation](/pdal-pipeline-architecture-execution/pipeline-validation/) workflow catches this before any data is read if you run `pdal --validate` on your JSON definition during CI.

**Applying SOR after classification removes valid sparse classes.** Transmission towers, isolated trees, and bridge decks have far fewer neighbors than the surrounding ground; SOR sees them as outliers. If your project requires preserving classified returns, run SOR on the raw, unclassified cloud first, or apply it selectively via `filters.expression` to subset only unclassified points before the cleaning pass.

**Tile-edge artifacts.** The k-d tree is built per pipeline invocation. Points at tile boundaries have artificially truncated neighborhoods because their true neighbors sit in the adjacent tile. Apply a 5–10 m overlap buffer when tiling with `filters.splitter`, then strip the buffer after SOR and before merging outputs. Alternatively, consult the [memory management](/pdal-pipeline-architecture-execution/memory-management/) strategies for processing larger in-memory chunks that span tile boundaries without splitting.

**k-d tree memory scaling.** Memory consumption for the neighborhood index grows with point count at roughly O(n log n). For datasets above 50 million points per tile, monitor peak RAM with `tracemalloc` during development and budget at least 16 GB for 100 M-point tiles. If processing fails with an `std::bad_alloc` error, reduce tile size before adjusting filter parameters.

**Pre-filtered sensor data.** Some survey-grade scanners apply their own noise rejection before writing LAS. Running SOR on already-clean data with a low `multiplier` can strip valid but sparse features. Check `pdal info --metadata input.laz` for manufacturer-provided noise flags or pre-existing classification values before adding a redundant filter stage.

---

## Related

- [Pipeline Filtering Logic](/pdal-pipeline-architecture-execution/pipeline-filtering-logic/) — parent reference covering filter sequencing, predicate evaluation, and spatial constraints
- [PDAL Stage Chaining](/pdal-pipeline-architecture-execution/pdal-stage-chaining/) — how buffers propagate between stages and how to chain SOR with classification stages
- [Chaining PDAL Stages for Data Cleaning](/pdal-pipeline-architecture-execution/pdal-stage-chaining/chaining-pdal-stages-for-data-cleaning/) — worked example combining outlier removal, range filtering, and ground classification
- [Memory Management](/pdal-pipeline-architecture-execution/memory-management/) — tiling strategies and RAM budgeting for large airborne datasets
- [Pipeline Validation](/pdal-pipeline-architecture-execution/pipeline-validation/) — catch stage name errors and schema violations before execution
