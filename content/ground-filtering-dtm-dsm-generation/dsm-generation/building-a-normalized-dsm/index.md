---
title: "Building a Normalized DSM"
description: "Create a normalized digital surface model (nDSM) — object heights above the terrain — by subtracting an aligned DTM from a DSM with rasterio, or by rasterizing height above ground directly with PDAL, and use it to map buildings, vegetation and change."
slug: "building-a-normalized-dsm"
type: "howto"
breadcrumb: "Normalized DSM"
datePublished: "2026-09-18"
dateModified: "2026-09-18"
---

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Article",
      "headline": "Building a Normalized DSM",
      "description": "Create a normalized digital surface model (nDSM) \u2014 object heights above the terrain \u2014 by subtracting an aligned DTM from a DSM with rasterio, or by rasterizing height above ground directly with PDAL, and use it to map buildings, vegetation and change.",
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
          "name": "DSM Generation",
          "item": "https://www.pythonlidar.com/ground-filtering-dtm-dsm-generation/dsm-generation/"
        },
        {
          "@type": "ListItem",
          "position": 4,
          "name": "Normalized DSM",
          "item": "https://www.pythonlidar.com/ground-filtering-dtm-dsm-generation/dsm-generation/building-a-normalized-dsm/"
        }
      ]
    },
    {
      "@type": "HowTo",
      "name": "Build a normalized DSM from LiDAR",
      "step": [
        {
          "@type": "HowToStep",
          "name": "Define one grid",
          "text": "Compute an origin and size from the tile bounds, rounded to the resolution, and use them for every raster."
        },
        {
          "@type": "HowToStep",
          "name": "Write DSM and DTM on that grid",
          "text": "DSM: maximum Z of first returns. DTM: IDW of ground returns."
        },
        {
          "@type": "HowToStep",
          "name": "Subtract",
          "text": "Read both with rasterio, subtract where both are valid, and set NoData elsewhere."
        },
        {
          "@type": "HowToStep",
          "name": "Clean small negatives",
          "text": "Values slightly below zero come from interpolation differences between the two surfaces; clamp values between \u22120.5 m and 0 to zero, and treat larger negatives as errors to inspect."
        },
        {
          "@type": "HowToStep",
          "name": "Alternative: rasterize HAG directly",
          "text": "filters.hag_nn followed by writers.gdal with dimension: \"HeightAboveGround\" and output_type: \"max\" yields an nDSM in one pipeline, without a separate DTM."
        }
      ]
    },
    {
      "@type": "FAQPage",
      "mainEntity": [
        {
          "@type": "Question",
          "name": "What is a normalized DSM?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "A raster of heights above the terrain, computed as the digital surface model minus the digital terrain model. Buildings and trees appear with their actual heights regardless of the ground elevation beneath them."
          }
        },
        {
          "@type": "Question",
          "name": "How do I make sure the DSM and DTM align?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Write both with writers.gdal using the same origin_x, origin_y, width, height and resolution, and assert that the transforms and shapes match before subtracting."
          }
        },
        {
          "@type": "Question",
          "name": "Why does my nDSM have negative values?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Small negatives come from differences in how the two surfaces are interpolated and are usually clamped to zero. Large negatives indicate a problem, such as a DSM pit or a ground point misclassified above the true terrain."
          }
        },
        {
          "@type": "Question",
          "name": "Is an nDSM the same as a canopy height model?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Over vegetation, effectively yes. A canopy height model is typically built from vegetation returns only, while an nDSM includes buildings and other objects too."
          }
        }
      ]
    }
  ]
}
</script>

**TL;DR:** nDSM = DSM − DTM on identical grids. Either write both rasters with the same `origin_x`, `origin_y`, `width`, `height` and `resolution` in `writers.gdal` and subtract them with rasterio, or skip the subtraction by computing `HeightAboveGround` with `filters.hag_nn` and rasterizing its per-cell maximum. Clamp small negative values to zero and keep NoData where either input is missing.

## Context and Motivation

This guide is part of [DSM Generation](https://www.pythonlidar.com/ground-filtering-dtm-dsm-generation/dsm-generation/). A DSM describes the top of everything — roofs, canopy, bridges — in absolute elevation, which makes it awkward for asking "how tall is that?". A 12 m building on a hill and a 12 m building in a valley have very different DSM values. Subtracting the terrain gives heights above ground everywhere, and that normalized surface is what building-height maps, canopy analysis, urban morphology and change detection actually need. Over vegetation, the nDSM is essentially a [canopy height model](https://www.pythonlidar.com/ground-filtering-dtm-dsm-generation/canopy-height-models/); over built areas, it is a building-height map.

Getting it right is mostly about alignment: two rasters that differ by half a cell produce ghost edges along every wall.

<svg viewBox="0 0 740 220" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="DSM minus DTM producing heights above ground" style="width:100%;max-width:740px;display:block;margin:1.6rem auto">
  <title>DSM − DTM = heights</title>
  <desc>Three stacked profiles. The DSM traces roofs and tree tops on a sloping hillside. The DTM traces the sloping ground alone. Their difference, the nDSM, shows the building and tree as heights on a flat zero baseline, so a 12 metre building reads as 12 metres whatever the terrain beneath it.</desc>
  <rect x="0" y="0" width="740" height="220" fill="var(--dg-bg)" rx="10"/>
  <text x="20" y="40" font-size="10.5" fill="var(--dg-muted)">DSM</text>
  <path d="M80 70 L200 60 L200 30 L260 30 L260 55 L400 45 C430 20 470 20 500 42 L700 30" fill="none" stroke="var(--dg-a)" stroke-width="2"/>
  <text x="20" y="110" font-size="10.5" fill="var(--dg-muted)">DTM</text>
  <path d="M80 118 L700 88" fill="none" stroke="var(--dg-d)" stroke-width="2"/>
  <text x="20" y="176" font-size="10.5" fill="var(--dg-muted)">nDSM</text>
  <path d="M80 190 L200 190 L200 150 L260 150 L260 190 L420 190 C440 164 480 164 500 190 L700 190" fill="none" stroke="var(--dg-c)" stroke-width="2"/>
  <text x="230" y="144" text-anchor="middle" font-size="10.5" fill="var(--dg-text)">12 m</text>
  <text x="460" y="158" text-anchor="middle" font-size="10.5" fill="var(--dg-text)">9 m</text>
  <text x="700" y="210" text-anchor="end" font-size="10" fill="var(--dg-muted)">zero baseline everywhere</text>
</svg>

## Prerequisites and Assumptions

- A classified point cloud, or an existing DSM and DTM of the same area.
- PDAL, rasterio and NumPy.
- The same CRS for both rasters, and both built at the same resolution.

## Step-by-Step Implementation

### Step 1 — Define one grid

Compute an origin and size from the tile bounds, rounded to the resolution, and use them for every raster.

### Step 2 — Write DSM and DTM on that grid

DSM: maximum Z of first returns. DTM: IDW of ground returns. Both with the shared `origin_x`, `origin_y`, `width`, `height`.

### Step 3 — Subtract

Read both with rasterio, subtract where both are valid, and set NoData elsewhere.

### Step 4 — Clean small negatives

Values slightly below zero come from interpolation differences between the two surfaces; clamp values between −0.5 m and 0 to zero, and treat larger negatives as errors to inspect.

### Step 5 — Alternative: rasterize HAG directly

`filters.hag_nn` followed by `writers.gdal` with `dimension: "HeightAboveGround"` and `output_type: "max"` yields an nDSM in one pipeline, without a separate DTM.

## Complete Working Example

```python
"""nDSM from aligned DSM and DTM rasters, plus the one-pipeline HAG alternative."""
from __future__ import annotations

import json
import math

import numpy as np
import pdal
import rasterio

SRC, RES = "tiles/t_0431.laz", 0.5


def grid(src: str, res: float) -> dict:
    b = pdal.Pipeline(json.dumps({"pipeline": [src]})).quickinfo["readers.las"]["bounds"]
    ox, oy = math.floor(b["minx"] / res) * res, math.floor(b["miny"] / res) * res
    return {"origin_x": ox, "origin_y": oy,
            "width": math.ceil((b["maxx"] - ox) / res), "height": math.ceil((b["maxy"] - oy) / res)}


def rasters(src: str, res: float) -> None:
    g = grid(src, res)
    common = {"resolution": res, "data_type": "float32", "nodata": -9999, **g}
    pdal.Pipeline(json.dumps({"pipeline": [
        src,
        {"type": "filters.range", "limits": "Classification![7:7],Classification![18:18]", "tag": "clean"},
        {"type": "filters.range", "inputs": ["clean"], "limits": "ReturnNumber[1:1]", "tag": "first"},
        {"type": "writers.gdal", "inputs": ["first"], "filename": "out/dsm.tif",
         "output_type": "max", "radius": res * 0.71, **common},
        {"type": "filters.range", "inputs": ["clean"], "limits": "Classification[2:2]", "tag": "ground"},
        {"type": "writers.gdal", "inputs": ["ground"], "filename": "out/dtm.tif",
         "output_type": "idw", "window_size": 6, **common},
    ]})).execute()


def ndsm(dsm: str, dtm: str, dst: str) -> None:
    with rasterio.open(dsm) as a, rasterio.open(dtm) as b:
        assert a.transform == b.transform and a.shape == b.shape, "grids differ"
        s, t = a.read(1, masked=True), b.read(1, masked=True)
        profile = a.profile
    h = s - t
    h = np.ma.where((h < 0) & (h > -0.5), 0.0, h)
    with rasterio.open(dst, "w", **profile) as out:
        out.write(h.filled(-9999).astype("float32"), 1)
    print(f"nDSM: max {h.max():.1f} m, cells < −0.5 m: {(h < -0.5).sum()}")


def ndsm_from_hag(src: str, dst: str, res: float) -> None:
    pdal.Pipeline(json.dumps({"pipeline": [
        src,
        {"type": "filters.range", "limits": "Classification![7:7],Classification![18:18]"},
        {"type": "filters.hag_nn", "count": 2},
        {"type": "writers.gdal", "filename": dst, "dimension": "HeightAboveGround",
         "output_type": "max", "resolution": res, "radius": res * 0.71,
         "data_type": "float32", "nodata": -9999, **grid(src, res)},
    ]})).execute()


if __name__ == "__main__":
    rasters(SRC, RES)
    ndsm("out/dsm.tif", "out/dtm.tif", "out/ndsm.tif")
    ndsm_from_hag(SRC, "out/ndsm_hag.tif", RES)
```

<svg viewBox="0 0 740 200" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Ghost edges from misaligned rasters" style="width:100%;max-width:740px;display:block;margin:1.6rem auto">
  <title>Half a cell of misalignment</title>
  <desc>Left: DSM and DTM grids offset by half a cell. Subtracting them produces thin false spikes and trenches along a building's walls, visible as bright and dark lines in the nDSM. Right: with a shared origin and size, the subtraction is clean and the building has sharp, correct edges.</desc>
  <rect x="0" y="0" width="740" height="200" fill="var(--dg-bg)" rx="10"/>
  <text x="185" y="24" text-anchor="middle" font-size="11.5" font-weight="600" fill="var(--dg-text)">grids offset by ½ cell</text>
  <text x="555" y="24" text-anchor="middle" font-size="11.5" font-weight="600" fill="var(--dg-text)">shared origin and size</text>
  <rect x="100" y="60" width="170" height="100" fill="var(--dg-a-soft)" stroke="var(--dg-a)" stroke-width="1.2"/>
  <line x1="96" y1="60" x2="96" y2="160" stroke="var(--dg-e)" stroke-width="4"/>
  <line x1="274" y1="60" x2="274" y2="160" stroke="var(--dg-e)" stroke-width="4"/>
  <text x="185" y="186" text-anchor="middle" font-size="10.5" fill="var(--dg-e)">ghost spikes and trenches at walls</text>
  <rect x="470" y="60" width="170" height="100" fill="var(--dg-a-soft)" stroke="var(--dg-a)" stroke-width="1.2"/>
  <text x="555" y="186" text-anchor="middle" font-size="10.5" fill="var(--dg-d)">clean edges</text>
</svg>

## Key Parameter Table

| Setting | DSM | DTM | Why |
|---|---|---|---|
| input | first returns | class 2 | Top surface versus terrain |
| `output_type` | `max` | `idw` | Highest return; smooth terrain |
| `radius` | 0.71 × res | — | Covers each cell |
| `window_size` | — | 6 | Fills small ground gaps |
| grid | shared | shared | Identical origin, width, height |
| `nodata` | −9999 | −9999 | Masked in the subtraction |

## Verification

- **Grids identical.** The transform and shape assertion in `ndsm` must pass.
- **Ground near zero.** On open ground and roads, nDSM values should be within ±0.2 m of zero.
- **Known heights.** A few buildings of known height should read correctly to within a few decimetres.
- **Two methods agree.** The subtraction and the HAG route should agree closely except at object edges.

## Gotchas and Edge Cases

**Water and bridges.** Bridges appear as tall objects over rivers; water surfaces may show small positive or negative values from sparse returns. Mask both if the nDSM feeds building or vegetation statistics.

**DTM errors become heights.** Where ground classification failed — a building accepted as ground — the nDSM shows zero height there. nDSM quality is bounded by DTM quality.

**Pits in the DSM.** Laser pulses that penetrate gaps in canopy leave low DSM cells, producing pits in the nDSM. Clean the DSM first; see [removing pits and spikes from a DSM](https://www.pythonlidar.com/ground-filtering-dtm-dsm-generation/dsm-generation/removing-pits-and-spikes-from-a-dsm/).

<svg viewBox="0 0 740 170" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Histogram of nDSM values with ground, vegetation and building modes" style="width:100%;max-width:740px;display:block;margin:1.6rem auto">
  <title>What an nDSM histogram shows</title>
  <desc>A histogram of nDSM cell values on a log count axis. A tall spike at zero represents open ground and roads. A broad hump from 2 to 25 metres represents vegetation. A smaller cluster between 3 and 12 metres represents buildings. A thin tail below zero represents interpolation mismatch and should stay small.</desc>
  <rect x="0" y="0" width="740" height="170" fill="var(--dg-bg)" rx="10"/>
  <line x1="60" y1="140" x2="700" y2="140" stroke="var(--dg-line)" stroke-width="1.3"/>
  <rect x="96" y="20" width="16" height="120" fill="var(--dg-line-soft)"/>
  <path d="M130 140 C200 110 300 70 420 90 C500 104 580 128 690 138 L690 140 Z" fill="var(--dg-d-soft)" stroke="var(--dg-d)" stroke-width="1.2"/>
  <path d="M150 140 C180 120 220 100 260 112 C290 124 300 134 320 140 Z" fill="var(--dg-a-soft)" stroke="var(--dg-a)" stroke-width="1.2"/>
  <rect x="76" y="134" width="16" height="6" fill="var(--dg-e)"/>
  <text x="104" y="16" text-anchor="middle" font-size="10" fill="var(--dg-muted)">0 m: ground</text>
  <text x="230" y="96" text-anchor="middle" font-size="10" fill="var(--dg-text)">buildings</text>
  <text x="440" y="80" text-anchor="middle" font-size="10" fill="var(--dg-text)">vegetation</text>
  <text x="60" y="160" font-size="10" fill="var(--dg-e)">negatives: keep small</text>
</svg>

**Resolution mismatch.** Resampling a 1 m DTM to 0.5 m before subtraction is fine; resampling a 0.5 m DSM down to 1 m loses roof edges. Build both at the target resolution where possible.

## Frequently Asked Questions

**What is a normalized DSM?**

A raster of heights above the terrain, computed as the digital surface model minus the digital terrain model. Buildings and trees appear with their actual heights regardless of the ground elevation beneath them.

**How do I make sure the DSM and DTM align?**

Write both with writers.gdal using the same origin_x, origin_y, width, height and resolution, and assert that the transforms and shapes match before subtracting.

**Why does my nDSM have negative values?**

Small negatives come from differences in how the two surfaces are interpolated and are usually clamped to zero. Large negatives indicate a problem, such as a DSM pit or a ground point misclassified above the true terrain.

**Is an nDSM the same as a canopy height model?**

Over vegetation, effectively yes. A canopy height model is typically built from vegetation returns only, while an nDSM includes buildings and other objects too.

## Related

- [DSM Generation](https://www.pythonlidar.com/ground-filtering-dtm-dsm-generation/dsm-generation/) — surface models in general
- [Building a DSM from First Returns](https://www.pythonlidar.com/ground-filtering-dtm-dsm-generation/dsm-generation/building-a-dsm-from-first-returns/) — the DSM input
- [DTM vs DSM: Which Surface Model?](https://www.pythonlidar.com/ground-filtering-dtm-dsm-generation/dsm-generation/dtm-vs-dsm-which-surface-model/) — choosing between surfaces
- [Rasterizing a Canopy Height Model from HAG](https://www.pythonlidar.com/ground-filtering-dtm-dsm-generation/canopy-height-models/rasterizing-a-canopy-height-model-from-hag/) — the vegetation-only version
- [Building Extraction from LiDAR](https://www.pythonlidar.com/lidar-classification-feature-extraction/building-extraction/) — using heights to find buildings
