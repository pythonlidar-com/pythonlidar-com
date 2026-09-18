---
title: "Measuring Swath-to-Swath Relative Accuracy"
description: "Check internal consistency between overlapping LiDAR flightlines without checkpoints: rasterize each swath's single returns by PointSourceId, difference them in the overlap on flat hard surfaces, and report RMSDz and maximum differences per swath pair."
slug: "measuring-swath-to-swath-relative-accuracy"
type: "howto"
breadcrumb: "Swath-to-Swath Accuracy"
datePublished: "2026-09-18"
dateModified: "2026-09-18"
---

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Article",
      "headline": "Measuring Swath-to-Swath Relative Accuracy",
      "description": "Check internal consistency between overlapping LiDAR flightlines without checkpoints: rasterize each swath's single returns by PointSourceId, difference them in the overlap on flat hard surfaces, and report RMSDz and maximum differences per swath pair.",
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
          "name": "Point Cloud Data Standards & Fundamentals",
          "item": "https://www.pythonlidar.com/point-cloud-data-standards-fundamentals/"
        },
        {
          "@type": "ListItem",
          "position": 3,
          "name": "Vertical Accuracy Assessment",
          "item": "https://www.pythonlidar.com/point-cloud-data-standards-fundamentals/vertical-accuracy-assessment/"
        },
        {
          "@type": "ListItem",
          "position": 4,
          "name": "Swath-to-Swath Accuracy",
          "item": "https://www.pythonlidar.com/point-cloud-data-standards-fundamentals/vertical-accuracy-assessment/measuring-swath-to-swath-relative-accuracy/"
        }
      ]
    },
    {
      "@type": "HowTo",
      "name": "Measure swath-to-swath relative vertical accuracy in LiDAR overlap",
      "step": [
        {
          "@type": "HowToStep",
          "name": "List the swaths in a tile",
          "text": "pdal info --stats --enumerate PointSourceId lists the flightline IDs present."
        },
        {
          "@type": "HowToStep",
          "name": "Rasterize each swath separately",
          "text": "For each ID, keep single returns (NumberOfReturns == 1), which are almost always hard surfaces, and write a mean-Z raster on a common grid with fixed origin_x, origin_y, width and height so cells align exactly."
        },
        {
          "@type": "HowToStep",
          "name": "Build a mask of usable cells",
          "text": "Keep cells where both swaths have data, both have at least a few returns, and terrain slope from a DTM is under about 10 degrees. Slopes turn small horizontal misalignment into large vertical differences that are not what you are measuring."
        },
        {
          "@type": "HowToStep",
          "name": "Difference and summarize",
          "text": "Compute \u0394Z = Z_A \u2212 Z_B over the mask, then RMSDz, mean difference and the largest absolute difference (or a high percentile, which is more robust)."
        },
        {
          "@type": "HowToStep",
          "name": "Map the differences",
          "text": "Write the difference raster. Spatial patterns \u2014 a gradient across the overlap, a step at one end \u2014 point to specific calibration problems."
        }
      ]
    },
    {
      "@type": "FAQPage",
      "mainEntity": [
        {
          "@type": "Question",
          "name": "What is swath-to-swath relative accuracy?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "The agreement between overlapping flightlines of the same LiDAR collection, measured as the vertical difference between their surfaces in the overlap. It reflects calibration and trajectory quality and needs no ground survey."
          }
        },
        {
          "@type": "Question",
          "name": "Why use only single returns?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Single returns come mostly from hard, opaque surfaces such as roads, roofs and bare ground, where both swaths should record the same elevation. Multiple returns from vegetation differ between swaths because of viewing geometry, not error."
          }
        },
        {
          "@type": "Question",
          "name": "What values are acceptable?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Specifications set thresholds by quality level; well-calibrated modern airborne systems typically show differences of a few centimetres on flat hard surfaces. Consult the specification your project follows for exact limits on RMSDz and maximum difference."
          }
        },
        {
          "@type": "Question",
          "name": "Can I measure relative accuracy on tiles instead of original swaths?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Yes, if PointSourceId still identifies the flightline of each point. Some processing chains overwrite it; check the values before relying on tiles."
          }
        }
      ]
    }
  ]
}
</script>

**TL;DR:** For each pair of overlapping flightlines, rasterize single returns of each line separately at 1 m (`filters.range` on `PointSourceId` and `NumberOfReturns[1:1]`, `writers.gdal` with `output_type: "mean"`), keep only cells that are flat and hard in both, difference the two rasters, and report the root-mean-square difference (RMSDz) and the largest absolute difference. Values of a few centimetres are typical of well-calibrated data.

## Context and Motivation

This guide is part of [Vertical Accuracy Assessment for LiDAR](https://www.pythonlidar.com/point-cloud-data-standards-fundamentals/vertical-accuracy-assessment/). Checkpoints measure absolute accuracy at a few dozen places. Relative accuracy — agreement between overlapping swaths — measures internal consistency across the whole project, needs no field survey, and is sensitive to exactly the problems checkpoints miss: a mis-calibrated boresight that tilts one line, a trajectory drift late in a flight, a line flown on a different day with a different GNSS solution. Where two swaths overlap, both measured the same ground, so any difference between them is error.

Delivery specifications such as the USGS Lidar Base Specification set limits on swath-to-swath differences per quality level. The measurement itself is straightforward with PDAL and NumPy once you restrict it to surfaces where differences mean something.

<svg viewBox="0 0 740 220" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Two overlapping swaths and their difference raster in the overlap" style="width:100%;max-width:740px;display:block;margin:1.6rem auto">
  <title>The overlap is a free accuracy test</title>
  <desc>Plan view of two parallel flightline swaths overlapping in a central strip. In the strip, cells on flat hard surfaces are shaded as usable; cells on slopes and vegetation are excluded. Beside it, a cross-section shows swath A slightly above swath B over the same road surface, with the vertical difference labelled.</desc>
  <rect x="0" y="0" width="740" height="220" fill="var(--dg-bg)" rx="10"/>
  <rect x="30" y="24" width="220" height="176" fill="var(--dg-a-soft)" stroke="var(--dg-a)" stroke-width="1.3"/>
  <path d="M170 24 h220 v176 h-220 Z" fill="none" stroke="var(--dg-c)" stroke-width="1.6"/>
  <text x="80" y="44" font-size="10.5" fill="var(--dg-text)">swath A</text>
  <text x="300" y="44" font-size="10.5" fill="var(--dg-text)">swath B</text>
  <g fill="var(--dg-d)"><rect x="180" y="70" width="14" height="14"/><rect x="198" y="70" width="14" height="14"/><rect x="216" y="70" width="14" height="14"/><rect x="180" y="120" width="14" height="14"/><rect x="198" y="120" width="14" height="14"/><rect x="216" y="140" width="14" height="14"/><rect x="234" y="140" width="14" height="14"/></g>
  <text x="210" y="190" text-anchor="middle" font-size="10" fill="var(--dg-text)">usable cells</text>
  <line x1="450" y1="130" x2="710" y2="130" stroke="var(--dg-line)" stroke-width="1.3"/>
  <line x1="460" y1="104" x2="700" y2="104" stroke="var(--dg-a)" stroke-width="2.2"/>
  <line x1="460" y1="112" x2="700" y2="112" stroke="var(--dg-c)" stroke-width="2.2"/>
  <line x1="580" y1="104" x2="580" y2="112" stroke="var(--dg-e)" stroke-width="2"/>
  <text x="588" y="96" font-size="10.5" fill="var(--dg-e)">ΔZ between swaths</text>
  <text x="460" y="150" font-size="10.5" fill="var(--dg-muted)">same road, two flightlines</text>
</svg>

## Prerequisites and Assumptions

- Point data with `PointSourceId` populated per flightline — the standard LAS convention. If IDs were lost when tiles were merged, relative accuracy cannot be measured from the tiles.
- Ground classified, for the slope mask.
- PDAL 2.x, Python with NumPy and rasterio.
- Knowledge of which lines overlap: from a flight plan, or computed from line footprints.

## Step-by-Step Implementation

### Step 1 — List the swaths in a tile

`pdal info --stats --enumerate PointSourceId` lists the flightline IDs present.

### Step 2 — Rasterize each swath separately

For each ID, keep single returns (`NumberOfReturns == 1`), which are almost always hard surfaces, and write a mean-Z raster on a common grid with fixed `origin_x`, `origin_y`, `width` and `height` so cells align exactly.

### Step 3 — Build a mask of usable cells

Keep cells where both swaths have data, both have at least a few returns, and terrain slope from a DTM is under about 10 degrees. Slopes turn small horizontal misalignment into large vertical differences that are not what you are measuring.

### Step 4 — Difference and summarize

Compute ΔZ = Z_A − Z_B over the mask, then RMSDz, mean difference and the largest absolute difference (or a high percentile, which is more robust).

### Step 5 — Map the differences

Write the difference raster. Spatial patterns — a gradient across the overlap, a step at one end — point to specific calibration problems.

## Complete Working Example

```python
"""Swath-to-swath relative accuracy for one tile and one pair of flightlines."""
from __future__ import annotations

import json
from pathlib import Path

import numpy as np
import pdal
import rasterio

RES = 1.0


def grid_spec(src: Path) -> dict:
    b = pdal.Pipeline(json.dumps({"pipeline": [str(src)]})).quickinfo["readers.las"]["bounds"]
    ox, oy = np.floor(b["minx"]), np.floor(b["miny"])
    return {"origin_x": ox, "origin_y": oy,
            "width": int(np.ceil((b["maxx"] - ox) / RES)),
            "height": int(np.ceil((b["maxy"] - oy) / RES))}


def swath_raster(src: Path, psid: int, out: Path, grid: dict) -> None:
    pdal.Pipeline(json.dumps({"pipeline": [
        str(src),
        {"type": "filters.expression",
         "expression": f"PointSourceId == {psid} && NumberOfReturns == 1 && Classification != 7 && Classification != 18"},
        {"type": "writers.gdal", "filename": str(out), "resolution": RES, "radius": RES * 0.71,
         "output_type": "mean,count", "data_type": "float32", "nodata": -9999, **grid},
    ]})).execute()


def slope_deg(dtm: Path) -> np.ndarray:
    with rasterio.open(dtm) as ds:
        z = ds.read(1, masked=True).filled(np.nan)
        gy, gx = np.gradient(z, ds.res[1], ds.res[0])
    return np.degrees(np.arctan(np.hypot(gx, gy)))


def relative_accuracy(src: Path, a: int, b: int, dtm: Path, max_slope: float = 10.0) -> dict:
    grid = grid_spec(src)
    ra, rb = Path(f"out/swath_{a}.tif"), Path(f"out/swath_{b}.tif")
    swath_raster(src, a, ra, grid)
    swath_raster(src, b, rb, grid)
    with rasterio.open(ra) as da, rasterio.open(rb) as db:
        za, ca = da.read(1).astype(float), da.read(2)
        zb, cb = db.read(1).astype(float), db.read(2)
        profile = da.profile
    slope = slope_deg(dtm)
    mask = (za > -9999) & (zb > -9999) & (ca >= 2) & (cb >= 2) & (slope < max_slope)
    dz = (za - zb)[mask]
    diff = np.where(mask, za - zb, -9999).astype("float32")
    profile.update(count=1)
    with rasterio.open(f"out/dz_{a}_{b}.tif", "w", **profile) as out:
        out.write(diff, 1)
    return {"pair": (a, b), "cells": int(mask.sum()),
            "mean_m": round(float(dz.mean()), 3),
            "rmsdz_m": round(float(np.sqrt(np.mean(dz ** 2))), 3),
            "p99_abs_m": round(float(np.percentile(np.abs(dz), 99)), 3),
            "max_abs_m": round(float(np.abs(dz).max()), 3)}


if __name__ == "__main__":
    Path("out").mkdir(exist_ok=True)
    print(relative_accuracy(Path("tiles/t_0431.laz"), 1102, 1103, Path("dtm/t_0431_dtm.tif")))
```

`output_type: "mean,count"` writes two bands; the count band enforces that each cell was actually measured by both swaths rather than filled by the writer's radius.

<svg viewBox="0 0 740 210" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Difference patterns across an overlap and the calibration problem each suggests" style="width:100%;max-width:740px;display:block;margin:1.6rem auto">
  <title>Reading the difference map</title>
  <desc>Three small difference maps of an overlap strip. A uniform offset across the strip suggests a vertical bias between lines, such as a GNSS solution difference. A gradient across the strip, from negative at one edge to positive at the other, suggests a roll or boresight error. A gradient along the strip suggests trajectory drift over time.</desc>
  <rect x="0" y="0" width="740" height="210" fill="var(--dg-bg)" rx="10"/>
  <rect x="40" y="30" width="180" height="120" fill="var(--dg-c-soft)" stroke="var(--dg-c)" stroke-width="1.2"/>
  <rect x="280" y="30" width="60" height="120" fill="var(--dg-b-soft)"/>
  <rect x="340" y="30" width="60" height="120" fill="var(--dg-surface-2)"/>
  <rect x="400" y="30" width="60" height="120" fill="var(--dg-c-soft)"/>
  <rect x="520" y="30" width="180" height="40" fill="var(--dg-b-soft)"/>
  <rect x="520" y="70" width="180" height="40" fill="var(--dg-surface-2)"/>
  <rect x="520" y="110" width="180" height="40" fill="var(--dg-c-soft)"/>
  <text x="130" y="176" text-anchor="middle" font-size="10.5" fill="var(--dg-text)">uniform offset</text>
  <text x="130" y="194" text-anchor="middle" font-size="10" fill="var(--dg-muted)">vertical bias between lines</text>
  <text x="370" y="176" text-anchor="middle" font-size="10.5" fill="var(--dg-text)">gradient across</text>
  <text x="370" y="194" text-anchor="middle" font-size="10" fill="var(--dg-muted)">roll or boresight</text>
  <text x="610" y="176" text-anchor="middle" font-size="10.5" fill="var(--dg-text)">gradient along</text>
  <text x="610" y="194" text-anchor="middle" font-size="10" fill="var(--dg-muted)">trajectory drift</text>
</svg>

## Key Parameter Table

| Parameter | Type | Default | Guidance |
|---|---|---|---|
| `RES` | float, m | 1.0 | Coarser averages more returns per cell; finer shows detail |
| returns used | expression | `NumberOfReturns == 1` | Single returns are mostly hard surfaces |
| minimum count per cell | int | 2 | Rejects cells filled by one stray return |
| `max_slope` | degrees | 10 | Slopes convert horizontal error into vertical difference |
| summary statistic | RMSDz, p99, max | all three | Max is fragile; p99 is steadier for reports |

## Verification

- **Self-difference is zero.** Running the function with the same ID twice must give zero differences — a check on grid alignment.
- **Overlap area plausible.** The count of usable cells should correspond to the expected overlap width times tile length, reduced by vegetation and slopes.
- **Pairs sum sensibly.** For three mutually overlapping lines A, B, C, mean(A−B) + mean(B−C) should approximate mean(A−C). Large inconsistencies mean the masks differ strongly between pairs.

## Gotchas and Edge Cases

**Merged or reset PointSourceId.** Some processing chains overwrite `PointSourceId` with a tile number. Check with an enumerate first; if every point in a tile has the same ID, relative accuracy must be measured from the original swath files.

**Vegetation and edges.** Even single returns include some canopy tops and roof edges. The slope mask removes many, but also mask by classification (ground and buildings only) if differences look noisy.

**Moving surfaces.** Water, vehicles, crops that were harvested between flights and construction sites differ between swaths for real reasons. Exclude them with the classification or known change areas.

<svg viewBox="30 20 690 160" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Horizontal misalignment producing vertical differences on a slope" style="width:100%;max-width:740px;display:block;margin:1.6rem auto">
  <title>Why slopes are masked</title>
  <desc>Two copies of a sloping surface offset horizontally by 0.2 metres. On a 30 degree slope, that horizontal shift produces a vertical difference of about 0.12 metres at the same map location, even though neither swath has any vertical error. On flat ground the same shift produces no vertical difference.</desc>
  <rect x="30" y="20" width="690" height="160" fill="var(--dg-bg)" rx="10"/>
  <line x1="60" y1="150" x2="360" y2="40" stroke="var(--dg-a)" stroke-width="2.2"/>
  <line x1="84" y1="150" x2="384" y2="40" stroke="var(--dg-c)" stroke-width="2.2"/>
  <line x1="220" y1="91" x2="220" y2="100" stroke="var(--dg-e)" stroke-width="2.2"/>
  <text x="230" y="120" font-size="10.5" fill="var(--dg-e)">0.12 m apparent ΔZ</text>
  <text x="60" y="170" font-size="10.5" fill="var(--dg-muted)">30° slope, 0.2 m horizontal shift</text>
  <line x1="440" y1="100" x2="700" y2="100" stroke="var(--dg-a)" stroke-width="2.2"/>
  <line x1="464" y1="100" x2="700" y2="100" stroke="var(--dg-c)" stroke-width="2.2" stroke-dasharray="8 6"/>
  <text x="440" y="130" font-size="10.5" fill="var(--dg-d)">flat ground: no apparent ΔZ</text>
  <text x="440" y="170" font-size="10.5" fill="var(--dg-muted)">same 0.2 m shift</text>
</svg>

**Grid alignment.** Letting `writers.gdal` choose its own origin for each swath misaligns cells by a fraction of a metre. Always pass the same `origin_x`, `origin_y`, `width` and `height` to every swath raster.

## Frequently Asked Questions

**What is swath-to-swath relative accuracy?**

The agreement between overlapping flightlines of the same LiDAR collection, measured as the vertical difference between their surfaces in the overlap. It reflects calibration and trajectory quality and needs no ground survey.

**Why use only single returns?**

Single returns come mostly from hard, opaque surfaces such as roads, roofs and bare ground, where both swaths should record the same elevation. Multiple returns from vegetation differ between swaths because of viewing geometry, not error.

**What values are acceptable?**

Specifications set thresholds by quality level; well-calibrated modern airborne systems typically show differences of a few centimetres on flat hard surfaces. Consult the specification your project follows for exact limits on RMSDz and maximum difference.

**Can I measure relative accuracy on tiles instead of original swaths?**

Yes, if PointSourceId still identifies the flightline of each point. Some processing chains overwrite it; check the values before relying on tiles.

## Related

- [Vertical Accuracy Assessment for LiDAR](https://www.pythonlidar.com/point-cloud-data-standards-fundamentals/vertical-accuracy-assessment/) — absolute accuracy with checkpoints
- [Reporting NVA and VVA Accuracy](https://www.pythonlidar.com/point-cloud-data-standards-fundamentals/vertical-accuracy-assessment/reporting-nva-and-vva-accuracy/) — the absolute statistics that accompany this
- [Normalizing Intensity Across Flightlines](https://www.pythonlidar.com/pdal-pipeline-architecture-execution/attribute-mapping/normalizing-intensity-across-flightlines/) — the radiometric counterpart of the same overlap analysis
- [Generating Slope and Aspect Rasters with gdaldem](https://www.pythonlidar.com/ground-filtering-dtm-dsm-generation/hillshade-slope-aspect/generating-slope-and-aspect-rasters-with-gdaldem/) — the slope mask
- [Point Density Metrics](https://www.pythonlidar.com/point-cloud-data-standards-fundamentals/point-density-metrics/) — overlap also doubles density
