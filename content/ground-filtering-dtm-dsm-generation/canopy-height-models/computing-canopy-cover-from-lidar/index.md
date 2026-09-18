---
title: "Computing Canopy Cover from LiDAR"
description: "Estimate canopy cover per grid cell or stand from LiDAR: first-return cover above a height threshold, all-return and CHM-based alternatives, choosing cell size and threshold, and producing a cover raster and stand summaries with PDAL and NumPy."
slug: "computing-canopy-cover-from-lidar"
type: "howto"
breadcrumb: "Canopy Cover"
datePublished: "2026-09-18"
dateModified: "2026-09-18"
---

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Article",
      "headline": "Computing Canopy Cover from LiDAR",
      "description": "Estimate canopy cover per grid cell or stand from LiDAR: first-return cover above a height threshold, all-return and CHM-based alternatives, choosing cell size and threshold, and producing a cover raster and stand summaries with PDAL and NumPy.",
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
          "name": "Ground Filtering & Terrain Models",
          "item": "https://www.pythonlidar.com/ground-filtering-dtm-dsm-generation/"
        },
        {
          "@type": "ListItem",
          "position": 3,
          "name": "Canopy Height Models",
          "item": "https://www.pythonlidar.com/ground-filtering-dtm-dsm-generation/canopy-height-models/"
        },
        {
          "@type": "ListItem",
          "position": 4,
          "name": "Canopy Cover",
          "item": "https://www.pythonlidar.com/ground-filtering-dtm-dsm-generation/canopy-height-models/computing-canopy-cover-from-lidar/"
        }
      ]
    },
    {
      "@type": "HowTo",
      "name": "Compute canopy cover from LiDAR returns",
      "step": [
        {
          "@type": "HowToStep",
          "name": "Normalize heights",
          "text": "Compute HeightAboveGround and ferry it into Z for rasterization."
        },
        {
          "@type": "HowToStep",
          "name": "Keep first returns",
          "text": "First returns sample what a vertical view sees; later returns come from inside or below the canopy and would inflate cover."
        },
        {
          "@type": "HowToStep",
          "name": "Count per cell twice",
          "text": "Rasterize the count of all first returns, and the count of first returns above the threshold, on the same grid."
        },
        {
          "@type": "HowToStep",
          "name": "Divide",
          "text": "Cover = above \u00f7 all, where all is at least a minimum count (for example 20) to avoid noisy ratios in sparse cells."
        },
        {
          "@type": "HowToStep",
          "name": "Summarize per stand",
          "text": "Aggregate counts (not ratios) within stand polygons and divide once, so large and small cells are weighted correctly."
        }
      ]
    },
    {
      "@type": "FAQPage",
      "mainEntity": [
        {
          "@type": "Question",
          "name": "How is canopy cover calculated from LiDAR?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Typically as the number of first returns above a height threshold divided by the total number of first returns within a cell or area. It approximates the fraction of the ground covered by the vertical projection of the canopy."
          }
        },
        {
          "@type": "Question",
          "name": "What height threshold should I use?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Two metres is common in forestry research; 1.3 metres is sometimes used to align with breast height, and some national forest definitions use 5 metres. Choose one that matches your definition and report it."
          }
        },
        {
          "@type": "Question",
          "name": "Why use first returns only?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "First returns represent what is seen from above. Later returns come from inside or below the canopy, so including them makes the ratio depend on penetration rather than cover."
          }
        },
        {
          "@type": "Question",
          "name": "Can I compute cover from a CHM instead?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Yes: the fraction of CHM cells above the threshold. It works well at fine resolution but depends on CHM gap filling and pits; the return-ratio method is more robust at coarser cells."
          }
        }
      ]
    }
  ]
}
</script>

**TL;DR:** Canopy cover in a cell ≈ first returns above a height threshold (commonly 2 m) ÷ all first returns in the cell. Compute it at 10–30 m cells by rasterizing two counts with `writers.gdal` (first returns above 2 m, and all first returns) and dividing, or bin both counts in NumPy. Report the threshold and cell size with every figure: cover estimates are only comparable when both match.

## Context and Motivation

This guide is part of [Canopy Height Models](https://www.pythonlidar.com/ground-filtering-dtm-dsm-generation/canopy-height-models/). Canopy cover — the fraction of ground area covered by the vertical projection of tree crowns — is one of the most used forest structure variables: in habitat models, fire behaviour, carbon estimation, urban tree-cover targets and forest definitions themselves. LiDAR estimates it well because a first return from above the threshold is, very nearly, a pulse intercepted by canopy. Counting such returns per cell gives a physically meaningful cover fraction without segmenting a single tree.

The details that change the answer are the height threshold, which returns are counted, and the cell size. None of them is standardized, so a cover map without them stated is not reproducible.

<svg viewBox="0 0 740 220" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="First returns above and below the threshold in one cell" style="width:100%;max-width:740px;display:block;margin:1.6rem auto">
  <title>Cover as a ratio of first returns</title>
  <desc>A side view of one grid cell with trees and gaps. Ten vertical pulses fall across the cell. Seven produce first returns in crowns above the 2 metre threshold line; three reach low vegetation or the ground first. Canopy cover for the cell is seven over ten, or 70 percent.</desc>
  <rect x="0" y="0" width="740" height="220" fill="var(--dg-bg)" rx="10"/>
  <line x1="60" y1="190" x2="680" y2="190" stroke="var(--dg-line)" stroke-width="1.4"/>
  <line x1="60" y1="160" x2="680" y2="160" stroke="var(--dg-c)" stroke-width="1.2" stroke-dasharray="5 4"/>
  <text x="676" y="154" text-anchor="end" font-size="10.5" fill="var(--dg-c)">2 m threshold</text>
  <ellipse cx="180" cy="80" rx="100" ry="40" fill="var(--dg-d-soft)" stroke="var(--dg-d)" stroke-width="1.2"/>
  <ellipse cx="480" cy="90" rx="90" ry="38" fill="var(--dg-d-soft)" stroke="var(--dg-d)" stroke-width="1.2"/>
  <g stroke="var(--dg-line-soft)" stroke-width="1"><line x1="100" y1="20" x2="100" y2="70"/><line x1="150" y1="20" x2="150" y2="52"/><line x1="200" y1="20" x2="200" y2="44"/><line x1="250" y1="20" x2="250" y2="62"/><line x1="320" y1="20" x2="320" y2="186"/><line x1="380" y1="20" x2="380" y2="186"/><line x1="430" y1="20" x2="430" y2="64"/><line x1="480" y1="20" x2="480" y2="54"/><line x1="530" y1="20" x2="530" y2="60"/><line x1="610" y1="20" x2="610" y2="186"/></g>
  <g fill="var(--dg-d)"><circle cx="100" cy="72" r="4"/><circle cx="150" cy="54" r="4"/><circle cx="200" cy="46" r="4"/><circle cx="250" cy="64" r="4"/><circle cx="430" cy="66" r="4"/><circle cx="480" cy="56" r="4"/><circle cx="530" cy="62" r="4"/></g>
  <g fill="var(--dg-c)"><circle cx="320" cy="188" r="4"/><circle cx="380" cy="188" r="4"/><circle cx="610" cy="188" r="4"/></g>
  <text x="370" y="212" text-anchor="middle" font-size="10.5" fill="var(--dg-text)">cover = 7 canopy first returns ÷ 10 first returns = 70 %</text>
</svg>

## Prerequisites and Assumptions

- A ground-classified tile for height normalization; noise removed.
- PDAL with `writers.gdal`; NumPy and rasterio.
- A definition to follow: the height threshold (2 m is common; some national forest definitions use 5 m) and the reporting cell or stand boundaries.

## Step-by-Step Implementation

### Step 1 — Normalize heights

Compute `HeightAboveGround` and ferry it into `Z` for rasterization.

### Step 2 — Keep first returns

First returns sample what a vertical view sees; later returns come from inside or below the canopy and would inflate cover.

### Step 3 — Count per cell twice

Rasterize the count of all first returns, and the count of first returns above the threshold, on the same grid.

### Step 4 — Divide

Cover = above ÷ all, where all is at least a minimum count (for example 20) to avoid noisy ratios in sparse cells.

### Step 5 — Summarize per stand

Aggregate counts (not ratios) within stand polygons and divide once, so large and small cells are weighted correctly.

## Complete Working Example

```python
"""Canopy cover raster from first returns above 2 m, plus a stand summary."""
from __future__ import annotations

import json
import math

import geopandas as gpd
import numpy as np
import pdal
import rasterio
from rasterio.features import geometry_mask

SRC, RES, THRESH, MIN_COUNT = "tiles/forest_0822.laz", 20.0, 2.0, 20


def grid(src: str) -> dict:
    b = pdal.Pipeline(json.dumps({"pipeline": [src]})).quickinfo["readers.las"]["bounds"]
    ox, oy = math.floor(b["minx"] / RES) * RES, math.floor(b["miny"] / RES) * RES
    return {"origin_x": ox, "origin_y": oy,
            "width": math.ceil((b["maxx"] - ox) / RES), "height": math.ceil((b["maxy"] - oy) / RES)}


g = grid(SRC)
common = {"resolution": RES, "radius": RES * 0.71, "output_type": "count",
          "data_type": "uint32", "nodata": 0, **g}
pdal.Pipeline(json.dumps({"pipeline": [
    SRC,
    {"type": "filters.range", "limits": "Classification![7:7],Classification![18:18]"},
    {"type": "filters.hag_nn", "count": 2},
    {"type": "filters.range", "limits": "ReturnNumber[1:1]", "tag": "first"},
    {"type": "writers.gdal", "inputs": ["first"], "filename": "out/first_all.tif", **common},
    {"type": "filters.range", "inputs": ["first"], "limits": f"HeightAboveGround[{THRESH}:]", "tag": "canopy"},
    {"type": "writers.gdal", "inputs": ["canopy"], "filename": "out/first_canopy.tif", **common},
]})).execute()

with rasterio.open("out/first_all.tif") as a, rasterio.open("out/first_canopy.tif") as c:
    all_n, can_n = a.read(1).astype(float), c.read(1).astype(float)
    profile, transform = a.profile, a.transform
cover = np.where(all_n >= MIN_COUNT, can_n / np.maximum(all_n, 1), np.nan)
profile.update(dtype="float32", nodata=-1)
with rasterio.open("out/canopy_cover_20m.tif", "w", **profile) as out:
    out.write(np.nan_to_num(cover, nan=-1).astype("float32"), 1)

stands = gpd.read_file("stands.gpkg").to_crs(profile["crs"])
for s in stands.itertuples():
    m = geometry_mask([s.geometry], all_n.shape, transform, invert=True)
    pct = can_n[m].sum() / max(all_n[m].sum(), 1)
    print(f"stand {s.stand_id}: canopy cover {pct:.0%}")
```

With a 20 m cell, `radius` of 0.71 × resolution counts returns in circles that overlap slightly; counts are then approximate but the ratio is unaffected, because numerator and denominator share the same windows.

<svg viewBox="0 0 740 200" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="How the height threshold changes estimated canopy cover" style="width:100%;max-width:740px;display:block;margin:1.6rem auto">
  <title>The threshold changes the answer</title>
  <desc>Bars of canopy cover for one stand computed with three height thresholds. At 1.3 metres, 81 percent, including tall shrubs. At 2 metres, 74 percent. At 5 metres, 62 percent, counting only tree canopy. The same data yields a 19 point range depending on the definition, so the threshold must always be reported.</desc>
  <rect x="0" y="0" width="740" height="200" fill="var(--dg-bg)" rx="10"/>
  <line x1="80" y1="160" x2="680" y2="160" stroke="var(--dg-line)" stroke-width="1.3"/>
  <rect x="150" y="38" width="100" height="122" fill="var(--dg-d-soft)" stroke="var(--dg-d)"/>
  <rect x="320" y="49" width="100" height="111" fill="var(--dg-d-soft)" stroke="var(--dg-d)"/>
  <rect x="490" y="67" width="100" height="93" fill="var(--dg-d-soft)" stroke="var(--dg-d)"/>
  <g font-size="10.5" fill="var(--dg-text)"><text text-anchor="middle" x="200" y="30">81 %</text><text text-anchor="middle" x="370" y="41">74 %</text><text text-anchor="middle" x="540" y="59">62 %</text></g>
  <g font-size="10.5" fill="var(--dg-muted)"><text text-anchor="middle" x="200" y="180">1.3 m</text><text text-anchor="middle" x="370" y="180">2 m</text><text text-anchor="middle" x="540" y="180">5 m</text></g>
  <text x="380" y="196" text-anchor="middle" font-size="10.5" fill="var(--dg-muted)">height threshold (illustrative stand)</text>
</svg>

## Key Parameter Table

| Setting | Common value | Effect |
|---|---|---|
| height threshold | 2 m (1.3 m, 5 m) | What counts as canopy; state it always |
| returns counted | first | Vertical-view interception |
| cell size | 10–30 m | Enough first returns per cell for a stable ratio |
| `MIN_COUNT` | 20 | Cells with fewer returns left undefined |
| stand summary | sum counts, divide once | Correct weighting across cells |

## Verification

- **Bounds.** Cover values lie between 0 and 1; open fields near 0, closed forest near 0.9 or higher.
- **Compare with imagery.** Crown cover digitized from orthophotos on a few plots should agree within about 10 percentage points; LiDAR usually reads slightly higher because it sees small gaps as covered at coarse cells.
- **Threshold sensitivity.** Report cover at two thresholds for a few stands so users see how much the definition matters.

## Gotchas and Edge Cases

**All returns instead of first.** Counting all returns above the threshold divided by all returns measures something closer to vegetation density, not cover, and depends on sensor and penetration. Keep first returns for cover.

**Scan angle.** At large off-nadir angles, pulses travel through more canopy and are intercepted more often, inflating cover at swath edges. Restrict to near-nadir first returns where overlap allows.

**Leaf-off data.** Deciduous canopy measured leaf-off gives far lower cover than leaf-on. Say which season the data represents.

<svg viewBox="0 0 740 170" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Off-nadir pulses crossing more canopy than nadir pulses" style="width:100%;max-width:740px;display:block;margin:1.6rem auto">
  <title>Why scan angle inflates cover</title>
  <desc>Two pulses through a crown with gaps. The vertical pulse at nadir passes through a gap and reaches the ground. The slanted off-nadir pulse crosses the crown diagonally, traverses more foliage and is intercepted, even though it aims at the same gap. At swath edges more pulses are intercepted, raising apparent cover.</desc>
  <rect x="0" y="0" width="740" height="170" fill="var(--dg-bg)" rx="10"/>
  <line x1="40" y1="150" x2="700" y2="150" stroke="var(--dg-line)" stroke-width="1.4"/>
  <ellipse cx="260" cy="80" rx="80" ry="36" fill="var(--dg-d-soft)" stroke="var(--dg-d)" stroke-width="1.2"/>
  <ellipse cx="460" cy="80" rx="80" ry="36" fill="var(--dg-d-soft)" stroke="var(--dg-d)" stroke-width="1.2"/>
  <line x1="360" y1="14" x2="360" y2="148" stroke="var(--dg-a)" stroke-width="1.8"/>
  <line x1="600" y1="14" x2="420" y2="70" stroke="var(--dg-e)" stroke-width="1.8"/>
  <circle cx="420" cy="70" r="4" fill="var(--dg-e)"/>
  <text x="352" y="36" text-anchor="end" font-size="10.5" fill="var(--dg-a)">nadir: through the gap</text>
  <text x="600" y="30" text-anchor="end" font-size="10.5" fill="var(--dg-e)">off-nadir: intercepted</text>
</svg>

**Tiny cells.** At 1 m cells a ratio is built from a handful of returns and is nearly binary. Use a CHM thresholded at the canopy height for fine-grained cover maps instead.

## Frequently Asked Questions

**How is canopy cover calculated from LiDAR?**

Typically as the number of first returns above a height threshold divided by the total number of first returns within a cell or area. It approximates the fraction of the ground covered by the vertical projection of the canopy.

**What height threshold should I use?**

Two metres is common in forestry research; 1.3 metres is sometimes used to align with breast height, and some national forest definitions use 5 metres. Choose one that matches your definition and report it.

**Why use first returns only?**

First returns represent what is seen from above. Later returns come from inside or below the canopy, so including them makes the ratio depend on penetration rather than cover.

**Can I compute cover from a CHM instead?**

Yes: the fraction of CHM cells above the threshold. It works well at fine resolution but depends on CHM gap filling and pits; the return-ratio method is more robust at coarser cells.

## Related

- [Canopy Height Models](https://www.pythonlidar.com/ground-filtering-dtm-dsm-generation/canopy-height-models/) — the height rasters behind cover
- [Computing Height Above Ground with filters.hag_nn](https://www.pythonlidar.com/ground-filtering-dtm-dsm-generation/canopy-height-models/computing-height-above-ground-with-filters-hag-nn/) — the normalization step
- [Building a Pit-Free Canopy Height Model](https://www.pythonlidar.com/ground-filtering-dtm-dsm-generation/canopy-height-models/building-a-pit-free-canopy-height-model/) — CHM-based cover
- [Computing Crown Metrics per Tree](https://www.pythonlidar.com/lidar-classification-feature-extraction/individual-tree-segmentation/computing-crown-metrics-per-tree/) — per-tree rather than per-area structure
- [Building a Point Density Raster with PDAL](https://www.pythonlidar.com/point-cloud-data-standards-fundamentals/point-density-metrics/building-a-point-density-raster-with-pdal/) — count rasters in general
