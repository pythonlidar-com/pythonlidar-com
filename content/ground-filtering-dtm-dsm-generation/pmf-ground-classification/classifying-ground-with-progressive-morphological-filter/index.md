---
title: "Classifying Ground with the Progressive Morphological Filter"
description: "Step-by-step PDAL recipe to classify bare-earth ground points with filters.pmf: from a raw LAZ tile through outlier removal to a ground-only output, with parameter choices explained."
slug: "classifying-ground-with-progressive-morphological-filter"
type: "long_tail"
breadcrumb: "Classifying Ground with PMF"
datePublished: "2024-06-24"
dateModified: "2026-07-12"
---

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Article",
      "headline": "Classifying Ground with the Progressive Morphological Filter",
      "description": "Step-by-step PDAL recipe to classify bare-earth ground points with filters.pmf: from a raw LAZ tile through outlier removal to a ground-only output, with parameter choices explained.",
      "datePublished": "2024-06-24",
      "dateModified": "2026-07-12",
      "author": {"@type": "Organization", "name": "pythonlidar.com"}
    },
    {
      "@type": "BreadcrumbList",
      "itemListElement": [
        {"@type": "ListItem", "position": 1, "name": "Home", "item": "https://pythonlidar.com/"},
        {"@type": "ListItem", "position": 2, "name": "Ground Filtering & Terrain Models", "item": "https://pythonlidar.com/ground-filtering-dtm-dsm-generation/"},
        {"@type": "ListItem", "position": 3, "name": "PMF Ground Classification", "item": "https://pythonlidar.com/ground-filtering-dtm-dsm-generation/pmf-ground-classification/"},
        {"@type": "ListItem", "position": 4, "name": "Classifying Ground with PMF", "item": "https://pythonlidar.com/ground-filtering-dtm-dsm-generation/pmf-ground-classification/classifying-ground-with-progressive-morphological-filter/"}
      ]
    },
    {
      "@type": "HowTo",
      "name": "Classify bare-earth ground with filters.pmf",
      "step": [
        {"@type": "HowToStep", "position": 1, "name": "Inspect the tile", "text": "Run pdal info to confirm CRS, point count, and Z range before building the pipeline."},
        {"@type": "HowToStep", "position": 2, "name": "Remove outliers", "text": "Add filters.outlier and drop Classification 7 so noise cannot anchor the morphological surface."},
        {"@type": "HowToStep", "position": 3, "name": "Run filters.pmf", "text": "Set max_window_size, slope, initial_distance, max_distance, and cell_size, then classify ground as code 2."},
        {"@type": "HowToStep", "position": 4, "name": "Extract ground-only", "text": "Use filters.range with Classification[2:2] to isolate bare earth for the writer."},
        {"@type": "HowToStep", "position": 5, "name": "Verify", "text": "Count Classification 2 points and confirm the ground fraction is plausible for the terrain."}
      ]
    },
    {
      "@type": "FAQPage",
      "mainEntity": [
        {
          "@type": "Question",
          "name": "Do I need to remove noise before running filters.pmf?",
          "acceptedAnswer": {"@type": "Answer", "text": "Almost always. Morphological erosion takes the minimum elevation inside each window, so one low blunder point drags the ground surface down and causes real ground nearby to be rejected. A statistical outlier pass before PMF removes those anchors and stabilises the result."}
        },
        {
          "@type": "Question",
          "name": "How do I get a ground-only file instead of a labelled full cloud?",
          "acceptedAnswer": {"@type": "Answer", "text": "filters.pmf only re-labels ground as Classification 2; it does not delete other points. Chain a filters.range stage with limits Classification[2:2] after PMF to keep only the bare-earth returns, then write that branch to a separate file."}
        },
        {
          "@type": "Question",
          "name": "Why are my rooftops classified as ground?",
          "acceptedAnswer": {"@type": "Answer", "text": "The largest window never spanned the roof, so no opening removed it. Increase max_window_size until it exceeds the widest building footprint in cells, or lower cell_size so the same metre count covers more cells."}
        },
        {
          "@type": "Question",
          "name": "Can I run this recipe on a whole directory of tiles?",
          "acceptedAnswer": {"@type": "Answer", "text": "Yes. Wrap the pipeline function in a loop or a parallel map over the tile list. Add an overlapping buffer to each tile so windows near the edge see neighbouring ground, then merge the ground-only outputs."}
        }
      ]
    }
  ]
}
</script>

**TL;DR:** Chain `filters.outlier` → `filters.pmf` → `filters.range (Classification[2:2])` in a PDAL pipeline; PMF stamps bare-earth returns with Classification 2 via a growing-window morphological opening, and the range stage keeps only those points for a clean ground-only output.

## Context and Motivation

This recipe is part of [PMF Ground Classification in PDAL](/ground-filtering-dtm-dsm-generation/pmf-ground-classification/), the reference for how the Progressive Morphological Filter turns a mixed point cloud into labelled bare earth. Where the parent page explains the algorithm's window and threshold schedules, this page is the hands-on walkthrough: take one raw LAZ tile off disk and end with a ground-only LAS you can hand to a DTM stage.

The task sounds simple — "keep the ground points" — but a naive single-threshold height cut fails the moment terrain has any relief. A hillside 40 m tall would erase a 3 m building only by also erasing the hill. PMF sidesteps this by never comparing points to an absolute height; it compares them to a *locally opened* surface whose tolerance widens with the window. That is what lets a single set of parameters handle a scene containing both a tall grain silo and a gentle valley. The steps below build that pipeline one stage at a time, then assemble a complete runnable script.

## Prerequisites and Assumptions

| Requirement | Detail |
|---|---|
| PDAL | 2.4+ with `filters.pmf` compiled in (conda-forge build recommended) |
| Python `pdal` bindings | `pip install pdal` or `conda install -c conda-forge python-pdal` |
| Input tile | LAS 1.2–1.4 or LAZ with a **projected** CRS in metres |
| Known source EPSG | e.g. `EPSG:32610` (WGS84 / UTM 10N) for a US West Coast tile |
| `numpy` | for the verification step |

Assume a single airborne tile of roughly 1–8 pts/m². If your tile is in a geographic CRS, reproject it to a metric UTM zone first — PMF thresholds are meaningless in degrees.

## Step-by-Step Implementation

### Step 1 — Inspect the tile

Read the header before deciding any parameter. You need the CRS, the point count, and a rough Z range.

```bash
pdal info tile_utm10n.laz --stats | python -m json.tool | grep -iE "count|minimum|maximum|srs"
```

If the Z spread is a few metres you have flat terrain; if it is tens of metres you have relief that will need a higher `slope`. Note the CRS — if it reports `EPSG:0` or a geographic code, stop and reproject.

### Step 2 — Strip noise so it cannot anchor the surface

A single low return corrupts the morphological minimum around it. Add a statistical outlier pass and then drop the points it flags as Classification 7 so they never enter the surface:

```json
{
  "type": "filters.outlier",
  "method": "statistical",
  "mean_k": 12,
  "multiplier": 2.5
},
{
  "type": "filters.range",
  "limits": "Classification![7:7]"
}
```

The [statistical outlier filter guide](/pdal-pipeline-architecture-execution/pipeline-filtering-logic/applying-statistical-outlier-filters-in-pdal/) explains `mean_k` and `multiplier` in detail; the defaults above suit typical airborne data.

### Step 3 — Run filters.pmf

Now the core stage. For a suburban tile with buildings up to ~25 m across, 1 m cells, and modest relief:

```json
{
  "type": "filters.pmf",
  "max_window_size": 27,
  "slope": 0.7,
  "initial_distance": 0.2,
  "max_distance": 2.5,
  "cell_size": 1.0,
  "exponential": true
}
```

`max_window_size: 27` at a 1 m `cell_size` spans ~27 m, comfortably larger than the widest roof. `slope: 0.7` gives moderate height tolerance as the window grows; `initial_distance: 0.2` keeps low shrubs out of ground on the tightest window; `max_distance: 2.5` stops tall structures leaking through wide windows. PMF now writes Classification 2 on every point that survives the full opening sequence.

### Step 4 — Isolate the ground returns

PMF labels but does not delete. To emit a bare-earth-only cloud, keep just Classification 2:

```json
{
  "type": "filters.range",
  "limits": "Classification[2:2]"
}
```

This is the same [range-based filtering logic](/pdal-pipeline-architecture-execution/pipeline-filtering-logic/) used throughout PDAL — the buffer simply drops every point outside the `[2:2]` inclusive band.

### Step 5 — Write and confirm

Finish with a writer that forwards all dimensions so the Classification survives:

```json
{
  "type": "writers.las",
  "filename": "tile_ground_only.las",
  "forward": "all"
}
```

## Complete Working Example

Save as `pmf_classify.py` and run against any projected LAZ tile.

```python
#!/usr/bin/env python3
"""
pmf_classify.py
Classify bare-earth ground with filters.pmf and write a ground-only LAS.

Usage:
    python pmf_classify.py tile_utm10n.laz tile_ground_only.las 32610

Requires:
    pip install pdal numpy   (PDAL 2.4+ with filters.pmf)
"""

import json
import sys

import numpy as np
import pdal


def classify_ground_pmf(
    input_path: str,
    output_path: str,
    source_epsg: int,
    max_window_size: int = 27,
    slope: float = 0.7,
    initial_distance: float = 0.2,
    max_distance: float = 2.5,
    cell_size: float = 1.0,
) -> dict:
    """
    Run PMF ground classification and write a ground-only file.

    Returns a dict with total input points and retained ground points.
    """
    pipeline = {
        "pipeline": [
            {
                "type": "readers.las",
                "filename": input_path,
                "spatialreference": f"EPSG:{source_epsg}",
            },
            {
                "type": "filters.outlier",
                "method": "statistical",
                "mean_k": 12,
                "multiplier": 2.5,
            },
            {"type": "filters.range", "limits": "Classification![7:7]"},
            {
                "type": "filters.pmf",
                "max_window_size": max_window_size,
                "slope": slope,
                "initial_distance": initial_distance,
                "max_distance": max_distance,
                "cell_size": cell_size,
                "exponential": True,
            },
            {"type": "filters.range", "limits": "Classification[2:2]"},
            {
                "type": "writers.las",
                "filename": output_path,
                "forward": "all",
            },
        ]
    }

    p = pdal.Pipeline(json.dumps(pipeline))
    p.validate()
    ground = p.execute()          # points surviving the final range stage
    arr = p.arrays[0]

    if ground == 0:
        raise RuntimeError(
            "PMF retained 0 ground points. max_window_size may be too small "
            "or initial_distance too tight — see the tuning guide."
        )

    return {"ground": ground, "z_min": float(arr["Z"].min()), "z_max": float(arr["Z"].max())}


def main() -> None:
    if len(sys.argv) != 4:
        print("Usage: python pmf_classify.py <input.laz> <ground_out.las> <source_epsg>")
        sys.exit(1)

    src, dst, epsg = sys.argv[1], sys.argv[2], int(sys.argv[3])
    print(f"Classifying ground in {src} (EPSG:{epsg}) with filters.pmf...")
    result = classify_ground_pmf(src, dst, epsg)
    print(
        f"Ground points: {result['ground']:,}  "
        f"Z range: {result['z_min']:.2f}..{result['z_max']:.2f} m  -> {dst}"
    )


if __name__ == "__main__":
    main()
```

Because the final stage keeps only Classification 2, `p.execute()` returns the ground count directly, and `p.arrays[0]` holds just the bare-earth returns — convenient for an immediate Z-range sanity check.

## Key Parameter Table

| Parameter | Stage | Type | Value here | Note |
|---|---|---|---|---|
| `spatialreference` | `readers.las` | string | `EPSG:32610` | Pin the projected CRS so thresholds are metres |
| `mean_k` | `filters.outlier` | int | 12 | Neighbourhood size for statistical noise detection |
| `multiplier` | `filters.outlier` | float | 2.5 | Standard-deviation cut for noise |
| `max_window_size` | `filters.pmf` | int | 27 | Widest window (cells); must exceed largest object |
| `slope` | `filters.pmf` | float | 0.7 | Height tolerance growth per window step |
| `initial_distance` | `filters.pmf` | float | 0.2 | Height tolerance (m) on the smallest window |
| `max_distance` | `filters.pmf` | float | 2.5 | Clamp (m) on the height threshold |
| `cell_size` | `filters.pmf` | float | 1.0 | Surface grid resolution (m) |
| `limits` | `filters.range` | string | `Classification[2:2]` | Keep only ground for the output |

## Verification

Confirm the run before the file moves downstream.

**Ground fraction, from the labelled cloud.** Rerun without the final range stage and count:

```python
import json, pdal, numpy as np

p = pdal.Pipeline(json.dumps({"pipeline": [
    {"type": "readers.las", "filename": "tile_utm10n.laz", "spatialreference": "EPSG:32610"},
    {"type": "filters.outlier", "method": "statistical", "mean_k": 12, "multiplier": 2.5},
    {"type": "filters.range", "limits": "Classification![7:7]"},
    {"type": "filters.pmf", "max_window_size": 27, "slope": 0.7,
     "initial_distance": 0.2, "max_distance": 2.5, "cell_size": 1.0, "exponential": True},
]}))
p.execute()
a = p.arrays[0]
frac = np.count_nonzero(a["Classification"] == 2) / len(a)
print(f"Ground fraction: {frac:.1%}")
```

For a suburban tile expect roughly 30–55 %. Well outside that band points to a parameter problem.

**Header check on the output:**

```bash
pdal info tile_ground_only.las --metadata | python -m json.tool | grep -i count
```

The reported count should match the ground total printed by the script.

## Gotchas and Edge Cases

**1. A geographic CRS silently ruins every threshold.** If `spatialreference` is `EPSG:4326`, one "cell" is a degree wide and `initial_distance: 0.2` means 0.2 of a degree of height, which is nonsense. Reproject to a metric UTM zone first and only then classify.

**2. Tile edges lose ground near buildings.** A window that reaches the tile boundary sees no neighbouring ground, so edge points near large objects may be misclassified. When batching a directory, read each tile with a buffer of at least `max_window_size` metres of overlap, classify, then keep only the core extent.

**3. PMF does not remove points on its own.** A frequent surprise: after PMF the file is the same size as the input. That is correct — PMF only writes labels. The `filters.range` stage is what produces a smaller ground-only file.

**4. Over-tight `initial_distance` eats micro-relief.** On ploughed fields or dune faces a 0.05 m tolerance rejects real ground undulation. If the ground fraction is implausibly low on open terrain, relax `initial_distance` toward 0.3–0.5 m before touching anything else.

## Frequently Asked Questions

**Do I need to remove noise before running filters.pmf?**

Almost always. Morphological erosion takes the minimum elevation inside each window, so one low blunder point drags the ground surface down and causes real ground nearby to be rejected. A statistical outlier pass before PMF removes those anchors and stabilises the result.

**How do I get a ground-only file instead of a labelled full cloud?**

`filters.pmf` only re-labels ground as Classification 2; it does not delete other points. Chain a `filters.range` stage with `limits: "Classification[2:2]"` after PMF to keep only the bare-earth returns, then write that branch to a separate file.

**Why are my rooftops classified as ground?**

The largest window never spanned the roof, so no opening removed it. Increase `max_window_size` until it exceeds the widest building footprint in cells, or lower `cell_size` so the same metre count covers more cells. The [tuning guide](/ground-filtering-dtm-dsm-generation/pmf-ground-classification/tuning-pmf-window-and-slope/) works through this by terrain type.

**Can I run this recipe on a whole directory of tiles?**

Yes. Wrap the pipeline function in a loop or a parallel map over the tile list. Add an overlapping buffer to each tile so windows near the edge see neighbouring ground, then merge the ground-only outputs.

---

## Related

- [PMF Ground Classification in PDAL](/ground-filtering-dtm-dsm-generation/pmf-ground-classification/) — parent guide to the algorithm and its full parameter set
- [Tuning PMF Window and Slope Parameters](/ground-filtering-dtm-dsm-generation/pmf-ground-classification/tuning-pmf-window-and-slope/) — sibling guide for choosing parameters by terrain
- [Applying Statistical Outlier Filters in PDAL](/pdal-pipeline-architecture-execution/pipeline-filtering-logic/applying-statistical-outlier-filters-in-pdal/) — the noise pre-pass this recipe depends on
- [Pipeline Filtering Logic](/pdal-pipeline-architecture-execution/pipeline-filtering-logic/) — how `filters.range` selects and drops points in the buffer
- [Ground Filtering and DTM/DSM Generation with PDAL](/ground-filtering-dtm-dsm-generation/) — where ground classification fits in the terrain-model workflow
