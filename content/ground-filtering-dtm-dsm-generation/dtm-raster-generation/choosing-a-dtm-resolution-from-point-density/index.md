---
title: "Choosing a DTM Resolution from Point Density"
description: "Pick a DTM cell size the ground returns can support: ground point spacing from density, the share of cells containing real returns, void fraction by land cover, specification defaults such as USGS 1 m DEMs, and a script that reports support per candidate resolution."
slug: "choosing-a-dtm-resolution-from-point-density"
type: "howto"
breadcrumb: "Choosing DTM Resolution"
datePublished: "2026-09-18"
dateModified: "2026-09-18"
---

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Article",
      "headline": "Choosing a DTM Resolution from Point Density",
      "description": "Pick a DTM cell size the ground returns can support: ground point spacing from density, the share of cells containing real returns, void fraction by land cover, specification defaults such as USGS 1 m DEMs, and a script that reports support per candidate resolution.",
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
          "name": "DTM Raster Generation",
          "item": "https://www.pythonlidar.com/ground-filtering-dtm-dsm-generation/dtm-raster-generation/"
        },
        {
          "@type": "ListItem",
          "position": 4,
          "name": "Choosing DTM Resolution",
          "item": "https://www.pythonlidar.com/ground-filtering-dtm-dsm-generation/dtm-raster-generation/choosing-a-dtm-resolution-from-point-density/"
        }
      ]
    },
    {
      "@type": "HowTo",
      "name": "Choose a DTM resolution supported by ground point density",
      "step": [
        {
          "@type": "HowToStep",
          "name": "Measure ground density",
          "text": "Count class 2 returns over the tile's land area. Ground point spacing \u2248 1/\u221adensity."
        },
        {
          "@type": "HowToStep",
          "name": "Grid ground returns at candidate resolutions",
          "text": "For each candidate cell size (0.25, 0.5, 1, 2 m), compute the share of cells with at least one ground return."
        },
        {
          "@type": "HowToStep",
          "name": "Break down by land cover",
          "text": "Compute the same share in open areas and under canopy separately. Open-ground support decides the resolution; canopy support tells you how much of the DTM will be interpolated."
        },
        {
          "@type": "HowToStep",
          "name": "Apply a support threshold",
          "text": "Choose the finest resolution where open-ground support is at least about 90 percent."
        },
        {
          "@type": "HowToStep",
          "name": "Record the choice",
          "text": "Store the resolution, the support figures and the void fraction in the DTM metadata or delivery report."
        }
      ]
    },
    {
      "@type": "FAQPage",
      "mainEntity": [
        {
          "@type": "Question",
          "name": "What DTM resolution should I use for LiDAR?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "The finest resolution at which most open-ground cells contain at least one real ground return, which is roughly the nominal ground point spacing. For typical QL2 airborne data that is about 1 metre; dense drone LiDAR can support 0.25 to 0.5 metres."
          }
        },
        {
          "@type": "Question",
          "name": "How do I calculate ground point spacing?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Divide the number of ground-classified returns by the land area to get ground density, then take one over its square root. Measure it separately under canopy, where it is usually much lower."
          }
        },
        {
          "@type": "Question",
          "name": "Is a finer DTM always better?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "No. Below the ground point spacing, most cells are interpolated, so the raster looks detailed without containing more information, while storage and processing grow four-fold with each halving of the cell size."
          }
        },
        {
          "@type": "Question",
          "name": "Why does the USGS require 1 metre DEMs?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "The Lidar Base Specification pairs DEM cell size with the quality level's point density: QL1 and QL2 data support a 1 metre bare-earth DEM across most land cover. Check the edition your project follows for exact requirements."
          }
        }
      ]
    }
  ]
}
</script>

**TL;DR:** A DTM cell should be no smaller than about the nominal ground point spacing, 1/√(ground density). Measure it: for each candidate resolution, count the share of cells containing at least one class 2 return, overall and under canopy. Choose the finest resolution at which most open-ground cells are supported (typically 90 % or more) and interpolated voids stay acceptable in vegetated areas — usually 0.5 m for dense drone data, 1 m for QL1/QL2 airborne data, 2 m or coarser for sparse legacy collections.

## Context and Motivation

This guide is part of [DTM Raster Generation](https://www.pythonlidar.com/ground-filtering-dtm-dsm-generation/dtm-raster-generation/). Cell size is the most consequential number in a DTM. Too coarse and the terrain model smooths away ditches, kerbs and small channels. Too fine and most cells contain no ground return at all, so their values are interpolated from neighbours several cells away: the raster looks detailed but the detail is invented, and file size grows with the square of the refinement. The right answer depends on how many ground returns there are, not on how many points the dataset has overall — and ground density under canopy can be a small fraction of the headline density.

Measuring support per candidate resolution takes one pass over the ground points and turns the choice into an evidence-based decision.

<svg viewBox="0 0 740 220" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="The same ground points on grids of three cell sizes" style="width:100%;max-width:740px;display:block;margin:1.6rem auto">
  <title>How many cells have a real measurement?</title>
  <desc>Three panels show the same scattered ground returns overlaid on grids of 2 metre, 1 metre and 0.5 metre cells. At 2 metres every cell contains several returns. At 1 metre nearly every cell contains at least one. At 0.5 metres many cells are empty and would be filled by interpolation.</desc>
  <rect x="0" y="0" width="740" height="220" fill="var(--dg-bg)" rx="10"/>
  <g font-size="11" font-weight="600" fill="var(--dg-text)"><text text-anchor="middle" x="130" y="24">2 m cells</text><text text-anchor="middle" x="370" y="24">1 m cells</text><text text-anchor="middle" x="610" y="24">0.5 m cells</text></g>
  <g stroke="var(--dg-line-soft)" stroke-width="1" fill="none">
    <path d="M40 40 h180 v150 h-180 Z M130 40 v150 M40 115 h180"/>
    <path d="M280 40 h180 v150 h-180 Z M325 40 v150 M370 40 v150 M415 40 v150 M280 77 h180 M280 115 h180 M280 152 h180"/>
    <path d="M520 40 h180 v150 h-180 Z M542 40 v150 M565 40 v150 M587 40 v150 M610 40 v150 M632 40 v150 M655 40 v150 M677 40 v150 M520 59 h180 M520 77 h180 M520 96 h180 M520 115 h180 M520 134 h180 M520 152 h180 M520 171 h180"/>
  </g>
  <g fill="var(--dg-d)">
    <circle cx="60" cy="60" r="2.5"/><circle cx="100" cy="90" r="2.5"/><circle cx="150" cy="55" r="2.5"/><circle cx="200" cy="100" r="2.5"/><circle cx="70" cy="140" r="2.5"/><circle cx="110" cy="175" r="2.5"/><circle cx="160" cy="130" r="2.5"/><circle cx="205" cy="170" r="2.5"/>
    <circle cx="300" cy="60" r="2.5"/><circle cx="340" cy="90" r="2.5"/><circle cx="390" cy="55" r="2.5"/><circle cx="440" cy="100" r="2.5"/><circle cx="310" cy="140" r="2.5"/><circle cx="350" cy="175" r="2.5"/><circle cx="400" cy="130" r="2.5"/><circle cx="445" cy="170" r="2.5"/>
    <circle cx="540" cy="60" r="2.5"/><circle cx="580" cy="90" r="2.5"/><circle cx="630" cy="55" r="2.5"/><circle cx="680" cy="100" r="2.5"/><circle cx="550" cy="140" r="2.5"/><circle cx="590" cy="175" r="2.5"/><circle cx="640" cy="130" r="2.5"/><circle cx="685" cy="170" r="2.5"/>
  </g>
  <g font-size="10.5" fill="var(--dg-muted)"><text text-anchor="middle" x="130" y="208">100 % supported</text><text text-anchor="middle" x="370" y="208">about half supported</text><text text-anchor="middle" x="610" y="208">mostly interpolated</text></g>
</svg>

## Prerequisites and Assumptions

- Ground-classified tiles (class 2) representative of the project's land cover.
- PDAL and NumPy.
- A land-cover or canopy mask if you want the support broken down by vegetation.
- The specification's DEM requirements; the USGS Lidar Base Specification, for example, sets DEM cell sizes by quality level (1 m for QL1 and QL2 bare-earth DEMs).

## Step-by-Step Implementation

### Step 1 — Measure ground density

Count class 2 returns over the tile's land area. Ground point spacing ≈ 1/√density.

### Step 2 — Grid ground returns at candidate resolutions

For each candidate cell size (0.25, 0.5, 1, 2 m), compute the share of cells with at least one ground return.

### Step 3 — Break down by land cover

Compute the same share in open areas and under canopy separately. Open-ground support decides the resolution; canopy support tells you how much of the DTM will be interpolated.

### Step 4 — Apply a support threshold

Choose the finest resolution where open-ground support is at least about 90 percent.

### Step 5 — Record the choice

Store the resolution, the support figures and the void fraction in the DTM metadata or delivery report.

## Complete Working Example

```python
"""Ground support per candidate DTM resolution, open ground versus canopy."""
from __future__ import annotations

import json

import numpy as np
import pdal

TILE = "tiles/t_0431.laz"
CANDIDATES = (0.25, 0.5, 1.0, 2.0)

p = pdal.Pipeline(json.dumps({"pipeline": [
    TILE,
    {"type": "filters.range", "limits": "Classification![7:7],Classification![18:18]"},
    {"type": "filters.hag_nn", "count": 2},
]}))
p.execute()
a = p.arrays[0]
ground = a[a["Classification"] == 2]
x0, y0 = a["X"].min(), a["Y"].min()
w, h = a["X"].max() - x0, a["Y"].max() - y0

# Canopy mask at 2 m: any return higher than 2 m above ground in the cell.
tall = a[a["HeightAboveGround"] > 2.0]
cm = np.zeros((int(h // 2) + 1, int(w // 2) + 1), bool)
cm[((tall["Y"] - y0) // 2).astype(int), ((tall["X"] - x0) // 2).astype(int)] = True

density = len(ground) / (w * h)
print(f"ground density {density:.2f} /m², nominal ground spacing {1 / np.sqrt(density):.2f} m")
print(f"{'res':>5} {'open':>7} {'canopy':>7} {'overall':>8}")
for res in CANDIDATES:
    rows, cols = int(h // res) + 1, int(w // res) + 1
    hit = np.zeros((rows, cols), bool)
    hit[((ground["Y"] - y0) // res).astype(int), ((ground["X"] - x0) // res).astype(int)] = True
    yy, xx = np.meshgrid(np.arange(rows) * res + res / 2, np.arange(cols) * res + res / 2, indexing="ij")
    canopy = cm[(yy // 2).astype(int).clip(0, cm.shape[0] - 1), (xx // 2).astype(int).clip(0, cm.shape[1] - 1)]
    print(f"{res:>5} {hit[~canopy].mean():>7.1%} {hit[canopy].mean():>7.1%} {hit.mean():>8.1%}")
```

Illustrative output for a mixed tile flown at about 12 pts/m²:

```text
ground density 5.40 /m², nominal ground spacing 0.43 m
  res    open  canopy  overall
 0.25   38.2%   11.9%    31.0%
  0.5   78.6%   31.4%    65.7%
  1.0   97.9%   62.8%    88.3%
  2.0  100.0%   91.0%    97.5%
```

At 1 m, 98 percent of open cells hold a real ground return — a well-supported DTM. At 0.5 m, a fifth of open cells would be interpolated.

<svg viewBox="0 0 740 210" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Supported cell share against resolution for open and canopy cells" style="width:100%;max-width:740px;display:block;margin:1.6rem auto">
  <title>Support by resolution and cover</title>
  <desc>Two curves of the share of cells containing a ground return against cell size from 0.25 to 2 metres. Open ground rises from 38 percent to 98 percent at 1 metre and 100 percent at 2 metres. Canopy rises more slowly, from 12 percent to 63 percent at 1 metre and 91 percent at 2 metres. A dashed line at 90 percent marks the support threshold, crossed by open ground between 0.5 and 1 metre.</desc>
  <rect x="0" y="0" width="740" height="210" fill="var(--dg-bg)" rx="10"/>
  <line x1="80" y1="170" x2="680" y2="170" stroke="var(--dg-line)" stroke-width="1.3"/>
  <line x1="80" y1="170" x2="80" y2="20" stroke="var(--dg-line)" stroke-width="1.3"/>
  <line x1="80" y1="38" x2="680" y2="38" stroke="var(--dg-line-soft)" stroke-width="1.2" stroke-dasharray="5 4"/>
  <polyline points="100,113 260,52 460,23 660,20" fill="none" stroke="var(--dg-a)" stroke-width="2"/>
  <polyline points="100,152 260,123 460,76 660,34" fill="none" stroke="var(--dg-d)" stroke-width="2"/>
  <g fill="var(--dg-a)"><circle cx="100" cy="113" r="3.5"/><circle cx="260" cy="52" r="3.5"/><circle cx="460" cy="23" r="3.5"/><circle cx="660" cy="20" r="3.5"/></g>
  <g fill="var(--dg-d)"><circle cx="100" cy="152" r="3.5"/><circle cx="260" cy="123" r="3.5"/><circle cx="460" cy="76" r="3.5"/><circle cx="660" cy="34" r="3.5"/></g>
  <text x="470" y="96" font-size="10.5" fill="var(--dg-d)">under canopy</text>
  <text x="270" y="68" font-size="10.5" fill="var(--dg-a)">open ground</text>
  <text x="84" y="34" font-size="10" fill="var(--dg-muted)">90 %</text>
  <g font-size="10" fill="var(--dg-muted)"><text text-anchor="middle" x="100" y="188">0.25 m</text><text text-anchor="middle" x="260" y="188">0.5 m</text><text text-anchor="middle" x="460" y="188">1 m</text><text text-anchor="middle" x="660" y="188">2 m</text></g>
</svg>

## Key Parameter Table

| Ground density (pts/m²) | Ground spacing | Typical DTM resolution | Notes |
|---|---|---|---|
| 0.5 | 1.4 m | 2 m | Sparse legacy or QL3 collections |
| 2 | 0.7 m | 1 m | QL2 open ground |
| 5–8 | 0.35–0.45 m | 0.5–1 m | QL1, dense airborne |
| 20+ | 0.2 m | 0.25 m | Drone LiDAR, open sites |
| canopy share | — | same grid | Report interpolated fraction separately |

## Verification

- **Support threshold met** on open ground for the chosen resolution.
- **Void and interpolation map.** Write a companion raster flagging cells without a ground return; it documents where values are interpolated.
- **Detail check.** Compare hillshades at the chosen and next-finer resolution; if the finer one shows only texture, not new landforms, the choice is right.

## Gotchas and Edge Cases

**Headline density is not ground density.** A 20 pts/m² forest flight may deliver 2 pts/m² of ground. Always measure class 2 only.

**Specification versus physics.** A contract may demand 0.5 m DTMs from data that supports 1 m. Deliver what is asked, but report support so users know how much is interpolated.

**Overlap stripes.** Sidelap doubles ground density in stripes, so support varies across a tile. Evaluate outside overlap too, or accept that the finest resolution is only supported in stripes.

<svg viewBox="0 0 740 170" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="File size and cell count growing with finer resolution" style="width:100%;max-width:740px;display:block;margin:1.6rem auto">
  <title>Every halving quadruples the raster</title>
  <desc>Bars of uncompressed float32 raster size for a 1 square kilometre tile. At 2 metres, 1 megabyte. At 1 metre, 4 megabytes. At 0.5 metres, 16 megabytes. At 0.25 metres, 64 megabytes. Halving the cell size quadruples the cells, the storage and the processing time of every downstream derivative.</desc>
  <rect x="0" y="0" width="740" height="170" fill="var(--dg-bg)" rx="10"/>
  <g font-size="11" fill="var(--dg-text)"><text text-anchor="end" x="160" y="38">2 m</text><text text-anchor="end" x="160" y="72">1 m</text><text text-anchor="end" x="160" y="106">0.5 m</text><text text-anchor="end" x="160" y="140">0.25 m</text></g>
  <rect x="170" y="24" width="8" height="18" fill="var(--dg-b)"/>
  <rect x="170" y="58" width="32" height="18" fill="var(--dg-b)"/>
  <rect x="170" y="92" width="128" height="18" fill="var(--dg-b)"/>
  <rect x="170" y="126" width="512" height="18" fill="var(--dg-b)"/>
  <g font-size="10.5" fill="var(--dg-muted)"><text x="186" y="38">1 MB</text><text x="210" y="72">4 MB</text><text x="306" y="106">16 MB</text><text x="674" y="160" text-anchor="end">64 MB per km²</text></g>
</svg>

**Rasterization radius.** With `writers.gdal`, a larger `radius` or `window_size` fills more empty cells from neighbours. That is interpolation by another name; it does not change what the data supports.

## Frequently Asked Questions

**What DTM resolution should I use for LiDAR?**

The finest resolution at which most open-ground cells contain at least one real ground return, which is roughly the nominal ground point spacing. For typical QL2 airborne data that is about 1 metre; dense drone LiDAR can support 0.25 to 0.5 metres.

**How do I calculate ground point spacing?**

Divide the number of ground-classified returns by the land area to get ground density, then take one over its square root. Measure it separately under canopy, where it is usually much lower.

**Is a finer DTM always better?**

No. Below the ground point spacing, most cells are interpolated, so the raster looks detailed without containing more information, while storage and processing grow four-fold with each halving of the cell size.

**Why does the USGS require 1 metre DEMs?**

The Lidar Base Specification pairs DEM cell size with the quality level's point density: QL1 and QL2 data support a 1 metre bare-earth DEM across most land cover. Check the edition your project follows for exact requirements.

## Related

- [DTM Raster Generation](https://www.pythonlidar.com/ground-filtering-dtm-dsm-generation/dtm-raster-generation/) — building the raster
- [Generating a DTM GeoTIFF with writers.gdal](https://www.pythonlidar.com/ground-filtering-dtm-dsm-generation/dtm-raster-generation/generating-a-dtm-geotiff-with-writers-gdal/) — the writer settings
- [Filling NoData Voids in DTM Rasters](https://www.pythonlidar.com/ground-filtering-dtm-dsm-generation/dtm-raster-generation/filling-nodata-voids-in-dtm-rasters/) — what happens to unsupported cells
- [Measuring Ground Point Density Under Canopy](https://www.pythonlidar.com/point-cloud-data-standards-fundamentals/point-density-metrics/measuring-ground-point-density-under-canopy/) — the density that decides
- [Building a Point Density Raster with PDAL](https://www.pythonlidar.com/point-cloud-data-standards-fundamentals/point-density-metrics/building-a-point-density-raster-with-pdal/) — mapping support spatially
