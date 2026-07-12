---
title: "PMF Ground Classification in PDAL"
description: "Using the Progressive Morphological Filter (filters.pmf) in PDAL to classify ground returns — the growing-window morphological opening, max_window_size / slope / initial_distance / max_distance parameters, a runnable Python workflow, and validation."
slug: "pmf-ground-classification"
type: "cluster"
breadcrumb: "PMF Ground Classification"
datePublished: "2024-06-20"
dateModified: "2026-07-12"
---

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Article",
      "headline": "PMF Ground Classification in PDAL",
      "description": "Using the Progressive Morphological Filter (filters.pmf) in PDAL to classify ground returns — the growing-window morphological opening, max_window_size / slope / initial_distance / max_distance parameters, a runnable Python workflow, and validation.",
      "datePublished": "2024-06-20",
      "dateModified": "2026-07-12",
      "author": {"@type": "Organization", "name": "pythonlidar.com"}
    },
    {
      "@type": "BreadcrumbList",
      "itemListElement": [
        {"@type": "ListItem", "position": 1, "name": "Home", "item": "https://pythonlidar.com/"},
        {"@type": "ListItem", "position": 2, "name": "Ground Filtering & Terrain Models", "item": "https://pythonlidar.com/ground-filtering-dtm-dsm-generation/"},
        {"@type": "ListItem", "position": 3, "name": "PMF Ground Classification", "item": "https://pythonlidar.com/ground-filtering-dtm-dsm-generation/pmf-ground-classification/"}
      ]
    },
    {
      "@type": "HowTo",
      "name": "Classify ground returns with the Progressive Morphological Filter in PDAL",
      "step": [
        {"@type": "HowToStep", "name": "Read the tile and clip noise", "text": "Declare readers.las with the correct spatialreference and remove low/high outliers so morphological windows are not anchored to spurious minima."},
        {"@type": "HowToStep", "name": "Insert filters.pmf", "text": "Add filters.pmf and set max_window_size, slope, initial_distance, max_distance, and cell_size for the terrain and point density."},
        {"@type": "HowToStep", "name": "Run the growing-window opening", "text": "PDAL iterates a morphological opening across a linearly or exponentially growing window, marking points that exceed the elevation-difference threshold as non-ground."},
        {"@type": "HowToStep", "name": "Persist Classification code 2", "text": "PMF writes Classification 2 for ground; forward the dimension through writers.las with forward: all."},
        {"@type": "HowToStep", "name": "Validate the ground fraction", "text": "Count Classification==2 points and confirm the ratio matches expectations for the terrain type."}
      ]
    },
    {
      "@type": "FAQPage",
      "mainEntity": [
        {
          "@type": "Question",
          "name": "How does the PMF window grow between iterations?",
          "acceptedAnswer": {"@type": "Answer", "text": "PMF starts with a one-cell structuring element and enlarges it each pass until it reaches max_window_size. With exponential set to true the window side follows 2*base^k + 1 cells, so it doubles quickly; with exponential false it grows linearly as 2*k*cell_size + 1. Larger windows remove larger objects, so the sequence peels off cars, then trees, then whole buildings."}
        },
        {
          "@type": "Question",
          "name": "What do initial_distance and max_distance control in filters.pmf?",
          "acceptedAnswer": {"@type": "Answer", "text": "They bound the elevation-difference threshold that decides whether a point survives an iteration. initial_distance is the tolerance for the smallest window; as the window grows the allowed height difference increases by slope times the window growth, and max_distance caps that value so a steep true slope on a large window is not mistaken for a building edge."}
        },
        {
          "@type": "Question",
          "name": "Does filters.pmf write ASPRS Classification code 2?",
          "acceptedAnswer": {"@type": "Answer", "text": "Yes. Points that survive every morphological opening iteration keep Classification 2 (Ground); everything else is left at its prior class, typically 1 (Unclassified). Set the writer to forward: all so the Classification dimension reaches the output file intact."}
        },
        {
          "@type": "Question",
          "name": "When should I choose PMF over SMRF?",
          "acceptedAnswer": {"@type": "Answer", "text": "PMF is the older, more transparent algorithm from Zhang et al. 2003 and behaves predictably on flat-to-rolling bare earth where object sizes are well understood. SMRF tends to preserve more terrain detail on steep or forested ground. Because PMF exposes the window schedule directly, it is easier to reason about when you need to guarantee that objects up to a known footprint are removed."}
        }
      ]
    }
  ]
}
</script>

# PMF Ground Classification in PDAL

Separating bare-earth returns from everything a laser also struck — canopy, rooftops, parked vehicles, power lines — is the first analytical step in almost every terrain product. The Progressive Morphological Filter, introduced by Zhang, Chen, Zhang, Gong and Yan in 2003, solves this by treating the point cloud as an elevation surface and repeatedly opening it with a structuring element that grows a little larger on every pass. Small windows shave off cars and shrubs; larger windows strip away tree crowns and building blocks; a height-difference threshold that scales with the window prevents genuine hill slopes from being cut away with the objects. PDAL exposes this algorithm as `filters.pmf`, and this guide sits under [Ground Filtering and DTM/DSM Generation with PDAL](/ground-filtering-dtm-dsm-generation/) as the reference for driving it from Python.

<svg viewBox="0 0 780 300" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Progressive morphological filter growing-window opening across four iterations" style="width:100%;max-width:780px;display:block;margin:1.5rem auto">
  <title>PMF growing-window morphological opening</title>
  <desc>Four stacked iterations of the progressive morphological filter. Each row shows a widening structuring window on the left, the object it removes in the middle, and the elevation-difference threshold that grows with the window on the right. Iteration one removes a car, iteration two a shrub, iteration three a tree crown, and iteration four a building block, while true ground slope is preserved because the height threshold is clamped by max_distance.</desc>
  <defs>
    <marker id="pmf-arr" markerWidth="8" markerHeight="8" refX="7" refY="3" orient="auto">
      <path d="M0,0 L0,6 L8,3 z" fill="currentColor" opacity="0.6"/>
    </marker>
  </defs>
  <!-- column headers -->
  <text x="70"  y="24" text-anchor="middle" font-size="11" fill="currentColor" opacity="0.7" font-family="sans-serif">iteration</text>
  <text x="215" y="24" text-anchor="middle" font-size="11" fill="currentColor" opacity="0.7" font-family="sans-serif">window w(k)</text>
  <text x="380" y="24" text-anchor="middle" font-size="11" fill="currentColor" opacity="0.7" font-family="sans-serif">object removed</text>
  <text x="650" y="24" text-anchor="middle" font-size="11" fill="currentColor" opacity="0.7" font-family="sans-serif">height threshold dh(k)</text>
  <!-- growth arrow -->
  <line x1="120" y1="52" x2="120" y2="250" stroke="currentColor" stroke-width="1.2" opacity="0.45" marker-end="url(#pmf-arr)"/>
  <text x="105" y="150" text-anchor="middle" font-size="10" fill="currentColor" opacity="0.55" font-family="sans-serif" transform="rotate(-90 105 150)">window grows to max_window_size</text>
  <!-- row 1 -->
  <text x="70"  y="64" text-anchor="middle" font-size="12" fill="currentColor" font-family="monospace">k = 1</text>
  <rect x="160" y="49" width="22" height="22" rx="3" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.85"/>
  <text x="380" y="64" text-anchor="middle" font-size="11" fill="currentColor" opacity="0.7" font-family="sans-serif">3 cells — car</text>
  <text x="650" y="64" text-anchor="middle" font-size="11" fill="currentColor" opacity="0.7" font-family="sans-serif">= initial_distance</text>
  <!-- row 2 -->
  <text x="70"  y="116" text-anchor="middle" font-size="12" fill="currentColor" font-family="monospace">k = 2</text>
  <rect x="160" y="95" width="40" height="34" rx="3" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.8"/>
  <text x="380" y="116" text-anchor="middle" font-size="11" fill="currentColor" opacity="0.7" font-family="sans-serif">7 cells — shrub</text>
  <text x="650" y="116" text-anchor="middle" font-size="11" fill="currentColor" opacity="0.7" font-family="sans-serif">+= slope x growth</text>
  <!-- row 3 -->
  <text x="70"  y="172" text-anchor="middle" font-size="12" fill="currentColor" font-family="monospace">k = 3</text>
  <rect x="160" y="145" width="70" height="46" rx="3" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.75"/>
  <text x="380" y="172" text-anchor="middle" font-size="11" fill="currentColor" opacity="0.7" font-family="sans-serif">15 cells — tree</text>
  <text x="650" y="172" text-anchor="middle" font-size="11" fill="currentColor" opacity="0.7" font-family="sans-serif">+= slope x growth</text>
  <!-- row 4 -->
  <text x="70"  y="238" text-anchor="middle" font-size="12" fill="currentColor" font-family="monospace">k = 4</text>
  <rect x="160" y="204" width="110" height="60" rx="3" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.7"/>
  <text x="380" y="238" text-anchor="middle" font-size="11" fill="currentColor" opacity="0.7" font-family="sans-serif">33 cells — building</text>
  <text x="650" y="238" text-anchor="middle" font-size="11" fill="currentColor" opacity="0.7" font-family="sans-serif">clamped at max_distance</text>
  <!-- footnote -->
  <text x="390" y="292" text-anchor="middle" font-size="10" fill="currentColor" opacity="0.5" font-family="sans-serif">survivors of every opening keep Classification 2 (Ground); the rest are flagged non-ground</text>
</svg>

## Prerequisites

Have these in place before wiring up a PMF pipeline:

- **PDAL 2.4 or later** with the Python bindings (`pip install pdal` or `conda install -c conda-forge python-pdal`).
- **Python 3.10+** with `numpy` available for post-run inspection of the point buffer.
- **A test tile with a known CRS** — a USGS 3DEP or OpenTopography LAZ works. Confirm the projected coordinate system (metres, not degrees) because PMF thresholds are expressed in ground units.
- **An idea of the largest non-ground object** in the scene. If the biggest building footprint is ~30 m, `max_window_size` should be able to span it. This single decision drives most of the parameter set.
- **A noise-aware input.** A single spurious low point can anchor a whole window to a false minimum. Pair PMF with [statistical outlier removal](/pdal-pipeline-architecture-execution/pipeline-filtering-logic/applying-statistical-outlier-filters-in-pdal/) upstream.

## How the Progressive Morphological Filter Works

Morphological opening is erosion followed by dilation. Erosion replaces each cell's elevation with the minimum inside the structuring window; dilation replaces it with the maximum of that eroded surface. The net effect is that any positive feature narrower than the window is flattened down to the surrounding ground level, while broad surfaces survive. PMF's insight is that a *single* window is a blunt instrument — too small and it leaves buildings, too large and it planes off hills — so it runs a **sequence** of openings with a window that grows each pass.

Two schedules govern that sequence, and both are exposed as PDAL parameters:

1. **Window growth.** The structuring element starts near a single `cell_size` and expands until it reaches `max_window_size`. With `exponential: true` (the default) the window side length follows roughly `2 * base^k + 1` cells, doubling quickly so that only a few iterations are needed; with `exponential: false` it grows linearly as `2 * k * cell_size + 1`. Each iteration removes objects up to the current window footprint.

2. **Elevation-difference threshold.** After each opening PDAL compares every point to the opened surface. A point is flagged non-ground when its height above that surface exceeds the current threshold `dh`. For the smallest window `dh` equals `initial_distance`. As the window widens, `dh` increases by `slope` multiplied by the window growth (in ground units), so a real hillside — where elevation legitimately changes across a wide window — is not shaved off along with the buildings. The value is clamped at `max_distance` so a genuinely large object cannot slip through simply because the window got big.

The two schedules interact: `slope` and `max_distance` protect true terrain relief, while `max_window_size` and `cell_size` decide which object sizes get removed. A point that survives *every* iteration is bare earth and keeps ASPRS Classification code 2. Everything else retains its incoming class (usually 1, Unclassified). If you are new to those numeric codes, the [ASPRS classification codes reference](/point-cloud-data-standards-fundamentals/asprs-classification-codes/) explains what 1, 2, 7 and 9 mean and how downstream tools read them.

## Core Workflow Architecture

A production PMF run is a short, ordered [chain of PDAL stages](/pdal-pipeline-architecture-execution/pdal-stage-chaining/). The lifecycle has five deterministic phases:

1. **Ingest and CRS anchor** — `readers.las` loads the tile and pins its `spatialreference` so thresholds are interpreted in metres. If the tile arrives in a geographic CRS it must be reprojected first via [spatial reprojection](/pdal-pipeline-architecture-execution/spatial-reprojection/); running PMF on degrees produces nonsense thresholds.
2. **Pre-clean** — a `filters.outlier` pass in statistical mode strips isolated low points that would otherwise anchor a window to a false ground minimum, and optionally a `filters.range` to drop points already flagged as noise (Classification 7).
3. **Classify** — `filters.pmf` runs the growing-window opening and stamps Classification 2 on the survivors.
4. **Isolate or keep** — optionally a `filters.range` with `limits: "Classification[2:2]"` to emit a ground-only cloud, or leave the full cloud with ground labelled for later DTM work.
5. **Write** — `writers.las` with `forward: "all"` persists the Classification dimension so nothing is lost. See how the buffer threads through these stages under [pipeline filtering logic](/pdal-pipeline-architecture-execution/pipeline-filtering-logic/).

## Full Implementation

The module below reads a LAZ tile, removes noise, classifies ground with PMF, and writes a labelled LAS plus a ground-only companion file. Parameters are typed and documented so the function can be dropped into a batch harness.

```python
import json
import logging
from pathlib import Path

import numpy as np
import pdal

logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")


def build_pmf_pipeline(
    input_path: str,
    labelled_out: str,
    ground_out: str,
    source_crs: str = "EPSG:26918",
    max_window_size: int = 33,
    slope: float = 1.0,
    initial_distance: float = 0.15,
    max_distance: float = 2.5,
    cell_size: float = 1.0,
    exponential: bool = True,
) -> pdal.Pipeline:
    """
    Build a PMF ground-classification pipeline.

    Parameters
    ----------
    input_path       : source LAZ / LAS tile
    labelled_out     : output with Classification 2 written on ground points
    ground_out       : ground-only output (Classification == 2 extracted)
    source_crs       : EPSG of the input, e.g. EPSG:26918 (NAD83 / UTM 18N)
    max_window_size  : largest structuring window, in cells; must span the
                       widest non-ground object (33 cells at 1 m ~= 33 m)
    slope            : terrain slope factor scaling the height threshold
    initial_distance : height tolerance for the smallest window (m)
    max_distance     : hard cap on the height threshold (m)
    cell_size        : grid resolution used to build the morphological surface (m)
    exponential      : True for 2*base^k window growth, False for linear growth
    """
    stages = [
        {
            "type": "readers.las",
            "filename": str(input_path),
            "spatialreference": source_crs,
        },
        {
            # Drop isolated low/high returns before PMF so a single spurious
            # minimum cannot anchor a whole window to false ground.
            "type": "filters.outlier",
            "method": "statistical",
            "mean_k": 12,
            "multiplier": 2.5,
        },
        {
            # Remove the points the outlier filter just marked as noise (7)
            # so they never enter the morphological surface.
            "type": "filters.range",
            "limits": "Classification![7:7]",
        },
        {
            "type": "filters.pmf",
            "max_window_size": max_window_size,
            "slope": slope,
            "initial_distance": initial_distance,
            "max_distance": max_distance,
            "cell_size": cell_size,
            "exponential": exponential,
        },
        {
            # Full cloud with ground labelled.
            "type": "writers.las",
            "filename": str(labelled_out),
            "forward": "all",
            "extra_dims": "all",
        },
        {
            # Ground-only companion: keep just Classification 2.
            "type": "filters.range",
            "limits": "Classification[2:2]",
            "tag": "ground_only",
        },
        {
            "type": "writers.las",
            "filename": str(ground_out),
            "forward": "all",
            "inputs": ["ground_only"],
        },
    ]
    return pdal.Pipeline(json.dumps({"pipeline": stages}))


def run(pipeline: pdal.Pipeline) -> dict:
    """Validate, execute, and report the ground fraction."""
    try:
        pipeline.validate()
    except RuntimeError as exc:
        logging.error("PMF pipeline validation failed: %s", exc)
        raise

    total = pipeline.execute()
    arr = pipeline.arrays[0]
    ground = int(np.count_nonzero(arr["Classification"] == 2))
    logging.info(
        "Processed %d points; %d ground (%.1f%%).",
        total, ground, 100.0 * ground / max(total, 1),
    )
    return {"total": total, "ground": ground}


if __name__ == "__main__":
    tile = Path("tile_utm18n.laz")
    if not tile.exists():
        raise FileNotFoundError(tile)

    pipe = build_pmf_pipeline(
        str(tile),
        labelled_out="tile_pmf_labelled.las",
        ground_out="tile_pmf_ground.las",
    )
    stats = run(pipe)

    if stats["ground"] / max(stats["total"], 1) < 0.03:
        logging.warning(
            "Ground fraction under 3%% — max_window_size may be too small "
            "or initial_distance too tight for this terrain."
        )
```

## Code Breakdown

### Reader stage — thresholds live in ground units

`spatialreference` on `readers.las` pins the CRS at ingest. PMF's `initial_distance`, `max_distance`, and `cell_size` are all measured in the horizontal unit of that CRS. Feed it `EPSG:26918` (NAD83 / UTM 18N, metres) and a `cell_size` of `1.0` means one metre; feed it a geographic CRS and one "cell" spans a degree of longitude, which silently ruins every threshold. When in doubt, reproject first.

### Outlier pre-pass — protecting the morphological minimum

Morphological erosion takes the *minimum* elevation inside each window. A single multipath return five metres below true ground will therefore drag the opened surface down and cause real ground around it to be flagged as non-ground on the next dilation. Running `filters.outlier` in statistical mode (`mean_k: 12`, `multiplier: 2.5`) and then dropping Classification 7 with `filters.range` removes those anchors before PMF ever sees them. This is why the [statistical outlier filter](/pdal-pipeline-architecture-execution/pipeline-filtering-logic/applying-statistical-outlier-filters-in-pdal/) is almost always paired with PMF.

### filters.pmf — the parameter rationale

| Parameter | Value used | Why |
|-----------|-----------|-----|
| `max_window_size` | 33 | 33 cells at 1 m cell_size spans ~33 m, enough to erase mid-sized building blocks |
| `slope` | 1.0 | One metre of height tolerance per metre of window growth — a moderate terrain assumption |
| `initial_distance` | 0.15 | 15 cm tolerance on the smallest window keeps low vegetation out of ground |
| `max_distance` | 2.5 | Caps the threshold so tall objects cannot slip through wide windows |
| `cell_size` | 1.0 | Matches ~1–4 pts/m² airborne density; shrink for dense UAV data |
| `exponential` | true | Doubling windows reach 33 in a handful of passes; set false for finer control |

### Extracting ground with `filters.range`

PMF does not delete non-ground points; it only re-labels ground as Classification 2. To produce the bare-earth cloud a downstream [DTM raster](/ground-filtering-dtm-dsm-generation/dtm-raster-generation/) expects, a second `filters.range` with `limits: "Classification[2:2]"` keeps only the ground returns. Tagging that branch (`"tag": "ground_only"`) and referencing it from the second writer's `inputs` lets one pipeline emit both a labelled full cloud and a ground-only file in a single execution.

### Writer stage — do not drop the label

`forward: "all"` re-emits every source dimension, including the Classification codes PMF just wrote. Omit it and some writers reset Classification to zero, discarding the entire run's work silently.

## Parameter Reference Table

| Parameter | Type | Default | Typical range | Effect |
|-----------|------|---------|---------------|--------|
| `max_window_size` | int | 33 | 12–50 | Largest structuring window (cells); must exceed the widest non-ground object |
| `slope` | float | 1.0 | 0.1–2.0 | Scales how fast the height threshold grows with window size; raise for steeper terrain |
| `initial_distance` | float | 0.15 | 0.05–0.5 | Height tolerance (m) at the smallest window; lower removes more low vegetation |
| `max_distance` | float | 2.5 | 1.0–6.0 | Upper clamp (m) on the height threshold; raise for tall structures on flat ground |
| `cell_size` | float | 1.0 | 0.25–3.0 | Grid resolution (m) of the morphological surface; match to point density |
| `exponential` | bool | true | true / false | true: `2*base^k+1` window growth; false: linear `2*k*cell_size+1` |
| `ignore` | range | — | e.g. `Classification[7:7]` | Points matching the range are excluded from the surface entirely |
| `last` | bool | true | true / false | Consider only last returns when building the surface |

The `ignore` and `last` options are how PMF avoids canopy contamination without a separate stage: `last: true` prefers last-of-many returns (more likely to reach the ground), and `ignore` lets you exclude already-known noise. Choosing these values by terrain type is covered in depth in [tuning PMF window and slope parameters](/ground-filtering-dtm-dsm-generation/pmf-ground-classification/tuning-pmf-window-and-slope/).

## Validation and Integrity Checks

Always `validate()` before `execute()` to catch a malformed `limits` string or a missing dimension before any I/O happens. After execution, inspect the labelled buffer.

```python
import numpy as np

arr = pipeline.arrays[0]
total = len(arr)
ground = int(np.count_nonzero(arr["Classification"] == 2))
print(f"Ground fraction: {ground/total:.1%}  ({ground:,} / {total:,})")
```

Sanity ranges by terrain:

- **Open farmland / bare desert:** 70–95 % ground is normal.
- **Suburban mixed:** 30–55 %.
- **Dense forest canopy:** 10–30 %, and lower if `last` returns are sparse.

A ground fraction near zero almost always means `max_window_size` is too small (buildings were never removed, so their edges dominate) or `initial_distance` is so tight that gentle micro-relief is rejected. A ground fraction near 100 % on an urban tile means the threshold clamp `max_distance` is too generous and rooftops leaked into ground.

You can also confirm the surface is physically plausible by checking that ground elevations form a smooth field:

```python
g = arr[arr["Classification"] == 2]
z = g["Z"]
print(f"Ground Z: min={z.min():.2f} max={z.max():.2f} spread={z.max()-z.min():.2f} m")
```

An implausibly large spread on a flat site signals rooftop leakage; a suspiciously small spread on real relief signals over-aggressive removal.

## Performance Tuning

PMF cost is dominated by the morphological surface, which scales with `(extent / cell_size)^2` cells and the number of window iterations. The table shows representative timings for a 40 M-point tile on an 8-core workstation:

| `cell_size` | `max_window_size` | `exponential` | Iterations | Time (s) | Peak RAM (GB) |
|-------------|-------------------|---------------|-----------|----------|---------------|
| 1.0 | 33 | true | 6 | 41 | 2.4 |
| 1.0 | 33 | false | 17 | 96 | 2.4 |
| 0.5 | 33 | true | 6 | 118 | 6.1 |
| 2.0 | 33 | true | 6 | 19 | 1.3 |

Takeaways:

- **`exponential: true` is far cheaper.** Linear growth needs roughly three times the iterations to reach the same `max_window_size`. Use linear growth only when you need the finer object-size granularity described in the tuning guide.
- **`cell_size` dominates memory and time.** Halving it quadruples the grid. Match `cell_size` to point spacing — going finer than the data density buys nothing but cost.
- **Tile before you go dense.** For multi-hundred-million-point regional jobs, split into tiles with a buffer and run PMF per tile; see the buffering guidance in [pipeline filtering logic](/pdal-pipeline-architecture-execution/pipeline-filtering-logic/).

## Common Errors and Troubleshooting

**Buildings survive as ground blobs.**
Root cause: `max_window_size` is smaller than the building footprint, so no opening ever spans it. Fix: raise `max_window_size` until it exceeds the widest roof in cells (`footprint_metres / cell_size`), or reduce `cell_size` so the same metre count covers more cells.

**Hilltops and ridgelines are stripped away.**
Root cause: on wide windows the height threshold is too tight, so real relief is read as an object. Fix: increase `slope` (more height tolerance per window step) and/or `max_distance`. This is the classic flat-vs-steep trade-off detailed in [tuning PMF window and slope parameters](/ground-filtering-dtm-dsm-generation/pmf-ground-classification/tuning-pmf-window-and-slope/).

**Ground fraction collapses to a few percent.**
Root cause: an undetected low outlier anchored the surface, or `initial_distance` is far too small. Fix: confirm the outlier pre-pass ran, then relax `initial_distance` toward 0.3–0.5 m.

**`RuntimeError: Couldn't create filter stage of type 'filters.pmf'`.**
Root cause: the PDAL build lacks the filter, usually a stripped minimal container. Fix: install the full `pdal` package from conda-forge; the PyPI wheel occasionally omits optional filters.

**Classification is blank in the output file.**
Root cause: the writer dropped the dimension. Fix: set `forward: "all"` on `writers.las` and confirm the point format supports Classification (formats 0–10 all do).

## Frequently Asked Questions

**How does the PMF window grow between iterations?**

PMF starts with a one-cell structuring element and enlarges it each pass until it reaches `max_window_size`. With `exponential: true` the window side follows `2 * base^k + 1` cells, so it doubles quickly; with `exponential: false` it grows linearly as `2 * k * cell_size + 1`. Larger windows remove larger objects, so the sequence peels off cars, then trees, then whole buildings.

**What do `initial_distance` and `max_distance` control in filters.pmf?**

They bound the elevation-difference threshold that decides whether a point survives an iteration. `initial_distance` is the tolerance for the smallest window; as the window grows the allowed height difference increases by `slope` times the window growth, and `max_distance` caps that value so a steep true slope on a large window is not mistaken for a building edge.

**Does filters.pmf write ASPRS Classification code 2?**

Yes. Points that survive every morphological opening iteration keep Classification 2 (Ground); everything else is left at its prior class, typically 1 (Unclassified). Set the writer to `forward: "all"` so the Classification dimension reaches the output file intact. The [ASPRS classification codes guide](/point-cloud-data-standards-fundamentals/asprs-classification-codes/) covers the full code list.

**When should I choose PMF over SMRF?**

PMF is the older, more transparent algorithm from Zhang et al. 2003 and behaves predictably on flat-to-rolling bare earth where object sizes are well understood. [SMRF ground classification](/ground-filtering-dtm-dsm-generation/smrf-ground-classification/) tends to preserve more terrain detail on steep or forested ground. Because PMF exposes the window schedule directly, it is easier to reason about when you must guarantee that objects up to a known footprint are removed.

---

## Related

- [Ground Filtering and DTM/DSM Generation with PDAL](/ground-filtering-dtm-dsm-generation/) — parent overview of bare-earth extraction and terrain-model generation
- [Classifying Ground with the Progressive Morphological Filter](/ground-filtering-dtm-dsm-generation/pmf-ground-classification/classifying-ground-with-progressive-morphological-filter/) — the end-to-end recipe from raw LAZ to a ground-only file
- [Tuning PMF Window and Slope Parameters](/ground-filtering-dtm-dsm-generation/pmf-ground-classification/tuning-pmf-window-and-slope/) — terrain-specific parameter recipes and exponential vs linear growth
- [SMRF Ground Classification](/ground-filtering-dtm-dsm-generation/smrf-ground-classification/) — the sibling scalar/threshold ground filter and when to prefer it
- [Pipeline Filtering Logic](/pdal-pipeline-architecture-execution/pipeline-filtering-logic/) — how `filters.range` and buffer passing route ground and non-ground points
- [Applying Statistical Outlier Filters in PDAL](/pdal-pipeline-architecture-execution/pipeline-filtering-logic/applying-statistical-outlier-filters-in-pdal/) — the noise pre-pass that protects the morphological surface
- [ASPRS Classification Codes](/point-cloud-data-standards-fundamentals/asprs-classification-codes/) — what Classification 2 and the other numeric codes mean
