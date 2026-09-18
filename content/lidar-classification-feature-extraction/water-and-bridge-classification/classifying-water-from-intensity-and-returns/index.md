---
title: "Classifying Water from Intensity and Returns"
description: "Detect water in topographic LiDAR without supplied polygons: return-density dropouts, low intensity, single returns and flatness combined into a per-cell water score, polygonized and burned into points as ASPRS class 9."
slug: "classifying-water-from-intensity-and-returns"
type: "howto"
breadcrumb: "Water from Intensity and Returns"
datePublished: "2026-09-18"
dateModified: "2026-09-18"
---

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Article",
      "headline": "Classifying Water from Intensity and Returns",
      "description": "Detect water in topographic LiDAR without supplied polygons: return-density dropouts, low intensity, single returns and flatness combined into a per-cell water score, polygonized and burned into points as ASPRS class 9.",
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
          "name": "Classification & Feature Extraction",
          "item": "https://www.pythonlidar.com/lidar-classification-feature-extraction/"
        },
        {
          "@type": "ListItem",
          "position": 3,
          "name": "Water and Bridge Classification",
          "item": "https://www.pythonlidar.com/lidar-classification-feature-extraction/water-and-bridge-classification/"
        },
        {
          "@type": "ListItem",
          "position": 4,
          "name": "Water from Intensity and Returns",
          "item": "https://www.pythonlidar.com/lidar-classification-feature-extraction/water-and-bridge-classification/classifying-water-from-intensity-and-returns/"
        }
      ]
    },
    {
      "@type": "HowTo",
      "name": "Classify water points from LiDAR intensity and return characteristics",
      "step": [
        {
          "@type": "HowToStep",
          "name": "Grid the cues",
          "text": "For every 2 m cell, compute the return count, median intensity, share of single returns (NumberOfReturns == 1), and the elevation range of ground-or-unclassified points."
        },
        {
          "@type": "HowToStep",
          "name": "Score each cell",
          "text": "Convert each cue to a 0\u20131 score and average them. Empty cells \u2014 the strongest water evidence \u2014 get a density score of 1 and neutral scores for the cues they cannot measure."
        },
        {
          "@type": "HowToStep",
          "name": "Threshold and clean",
          "text": "Keep cells with a score above 0.7, then open to remove specks and close to fill scattered surface returns."
        },
        {
          "@type": "HowToStep",
          "name": "Keep only regions at ground level",
          "text": "Require that each region's boundary cells sit within about 1 m of the ground surface around it, which rejects flat roofs."
        },
        {
          "@type": "HowToStep",
          "name": "Burn into points",
          "text": "Polygonize the regions, drop those below the minimum area, and assign class 9 to ground and unclassified points inside."
        }
      ]
    },
    {
      "@type": "FAQPage",
      "mainEntity": [
        {
          "@type": "Question",
          "name": "Why not rely on intensity alone to find water?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Intensity depends on range, incidence angle and sensor calibration, and many dry surfaces such as fresh asphalt and dark roofing are just as dark. It helps as one cue among several but produces too many false positives alone."
          }
        },
        {
          "@type": "Question",
          "name": "What does it mean when water has dense bright returns?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Near nadir, calm water reflects the pulse straight back like a mirror, producing strong returns in a narrow stripe under the flight path. Everywhere else the pulse is reflected away or absorbed, so returns are sparse."
          }
        },
        {
          "@type": "Question",
          "name": "Which points should be set to class 9?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Ground and unclassified returns inside the water polygon. Returns from boats, docks and overhanging vegetation should keep their classes. Specifications differ, so confirm the rule for your project."
          }
        },
        {
          "@type": "Question",
          "name": "Can this detect narrow rivers?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Rivers wider than a few cells at the chosen resolution, if they are open to the sky. Tree-lined streams retain canopy returns and rarely look like water from above; they need breaklines or centreline data."
          }
        }
      ]
    }
  ]
}
</script>

**TL;DR:** Grid the tile at 2 m and compute four per-cell cues — return density relative to the tile median, median intensity, share of single returns, and elevation range — combine them into a water score, keep large low-score-free regions adjacent to ground, polygonize them, and set class 9 on ground and unclassified points inside with `filters.overlay` and `filters.assign`.

## Context and Motivation

This guide is part of [Water and Bridge Classification in LiDAR](https://www.pythonlidar.com/lidar-classification-feature-extraction/water-and-bridge-classification/). The parent workflow uses return density alone, which works for large calm lakes but struggles with small ponds, rivers flown at low sun angle, and wind-roughened water that scatters more returns. Combining several weak cues produces a far more reliable detector, because each false positive fails a different test: dark asphalt has low intensity but normal density; shadow behind a building has low density but is not flat; a flat roof is flat and single-return but is elevated.

This matters most where no reliable hydrography exists — new reservoirs, gravel pits, seasonal ponds, or projects in regions where national water layers are coarse or out of date.

<svg viewBox="0 0 740 220" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Four water cues and the false positives each one rejects" style="width:100%;max-width:740px;display:block;margin:1.6rem auto">
  <title>Four weak cues, one strong detector</title>
  <desc>A table-like diagram with four cue columns: low return density, low intensity, single returns, and flat surface. Rows show water passing all four, dark asphalt failing density, building shadow failing flatness, and a flat roof failing because it is elevated above the local ground. Pass and fail marks fill the cells.</desc>
  <rect x="0" y="0" width="740" height="220" fill="var(--dg-bg)" rx="10"/>
  <g font-size="10.5" fill="var(--dg-text)"><text text-anchor="middle" x="270" y="30">low density</text><text text-anchor="middle" x="390" y="30">low intensity</text><text text-anchor="middle" x="510" y="30">single returns</text><text text-anchor="middle" x="630" y="30">flat, at ground</text></g>
  <g font-size="11" fill="var(--dg-text)"><text text-anchor="end" x="190" y="66">open water</text><text text-anchor="end" x="190" y="106">dark asphalt</text><text text-anchor="end" x="190" y="146">building shadow</text><text text-anchor="end" x="190" y="186">flat roof</text></g>
  <g stroke="var(--dg-line-soft)" stroke-width="1" fill="var(--dg-surface)"><rect x="210" y="44" width="120" height="36"/><rect x="330" y="44" width="120" height="36"/><rect x="450" y="44" width="120" height="36"/><rect x="570" y="44" width="120" height="36"/><rect x="210" y="84" width="120" height="36"/><rect x="330" y="84" width="120" height="36"/><rect x="450" y="84" width="120" height="36"/><rect x="570" y="84" width="120" height="36"/><rect x="210" y="124" width="120" height="36"/><rect x="330" y="124" width="120" height="36"/><rect x="450" y="124" width="120" height="36"/><rect x="570" y="124" width="120" height="36"/><rect x="210" y="164" width="120" height="36"/><rect x="330" y="164" width="120" height="36"/><rect x="450" y="164" width="120" height="36"/><rect x="570" y="164" width="120" height="36"/></g>
  <g font-size="11">
    <text text-anchor="middle" x="270" y="67" fill="var(--dg-d)">yes</text><text text-anchor="middle" x="390" y="67" fill="var(--dg-d)">yes</text><text text-anchor="middle" x="510" y="67" fill="var(--dg-d)">yes</text><text text-anchor="middle" x="630" y="67" fill="var(--dg-d)">yes</text>
    <text text-anchor="middle" x="270" y="107" fill="var(--dg-e)">no</text><text text-anchor="middle" x="390" y="107" fill="var(--dg-d)">yes</text><text text-anchor="middle" x="510" y="107" fill="var(--dg-d)">yes</text><text text-anchor="middle" x="630" y="107" fill="var(--dg-d)">yes</text>
    <text text-anchor="middle" x="270" y="147" fill="var(--dg-d)">yes</text><text text-anchor="middle" x="390" y="147" fill="var(--dg-d)">yes</text><text text-anchor="middle" x="510" y="147" fill="var(--dg-e)">mixed</text><text text-anchor="middle" x="630" y="147" fill="var(--dg-e)">no</text>
    <text text-anchor="middle" x="270" y="187" fill="var(--dg-e)">no</text><text text-anchor="middle" x="390" y="187" fill="var(--dg-d)">yes</text><text text-anchor="middle" x="510" y="187" fill="var(--dg-d)">yes</text><text text-anchor="middle" x="630" y="187" fill="var(--dg-e)">elevated</text>
  </g>
</svg>

## Prerequisites and Assumptions

- A tile with ground classified and noise removed; intensity populated and roughly consistent across flightlines (see [normalizing intensity across flightlines](https://www.pythonlidar.com/pdal-pipeline-architecture-execution/attribute-mapping/normalizing-intensity-across-flightlines/)).
- Python with NumPy, SciPy, rasterio, GeoPandas and PDAL bindings.
- A minimum water body size from the project specification.

## Step-by-Step Implementation

### Step 1 — Grid the cues

For every 2 m cell, compute the return count, median intensity, share of single returns (`NumberOfReturns == 1`), and the elevation range of ground-or-unclassified points.

### Step 2 — Score each cell

Convert each cue to a 0–1 score and average them. Empty cells — the strongest water evidence — get a density score of 1 and neutral scores for the cues they cannot measure.

### Step 3 — Threshold and clean

Keep cells with a score above 0.7, then open to remove specks and close to fill scattered surface returns.

### Step 4 — Keep only regions at ground level

Require that each region's boundary cells sit within about 1 m of the ground surface around it, which rejects flat roofs.

### Step 5 — Burn into points

Polygonize the regions, drop those below the minimum area, and assign class 9 to ground and unclassified points inside.

## Complete Working Example

```python
"""Multi-cue water detection on a 2 m grid, burned back into points as class 9."""
from __future__ import annotations

import json
from pathlib import Path

import geopandas as gpd
import numpy as np
import pdal
import rasterio.features
from rasterio.transform import from_origin
from scipy import ndimage as ndi
from shapely.geometry import shape

CELL = 2.0


def grid_cues(a: np.ndarray) -> tuple[dict[str, np.ndarray], tuple[float, float, int, int]]:
    x0, y1 = np.floor(a["X"].min()), np.ceil(a["Y"].max())
    cols = int(np.ceil((a["X"].max() - x0) / CELL))
    rows = int(np.ceil((y1 - a["Y"].min()) / CELL))
    c = np.clip(((a["X"] - x0) / CELL).astype(int), 0, cols - 1)
    r = np.clip(((y1 - a["Y"]) / CELL).astype(int), 0, rows - 1)
    idx = r * cols + c
    n = np.bincount(idx, minlength=rows * cols)
    single = np.bincount(idx, weights=(a["NumberOfReturns"] == 1), minlength=rows * cols)
    inten = np.bincount(idx, weights=a["Intensity"], minlength=rows * cols)
    low = np.isin(a["Classification"], [1, 2])
    zmin = np.full(rows * cols, np.inf); zmax = np.full(rows * cols, -np.inf)
    np.minimum.at(zmin, idx[low], a["Z"][low]); np.maximum.at(zmax, idx[low], a["Z"][low])
    with np.errstate(invalid="ignore", divide="ignore"):
        cues = {"n": n, "single": single / n, "intensity": inten / n, "zrange": zmax - zmin,
                "zmin": zmin}
    return {k: v.reshape(rows, cols) for k, v in cues.items()}, (x0, y1, rows, cols)


def water_score(cues: dict[str, np.ndarray]) -> np.ndarray:
    med_n = np.median(cues["n"][cues["n"] > 0])
    med_i = np.nanmedian(cues["intensity"])
    s_density = np.clip(1.0 - cues["n"] / (0.3 * med_n), 0, 1)
    s_int = np.where(np.isnan(cues["intensity"]), 0.5, np.clip(1 - cues["intensity"] / med_i, 0, 1))
    s_single = np.where(np.isnan(cues["single"]), 0.5, cues["single"])
    s_flat = np.where(np.isfinite(cues["zrange"]), np.clip(1 - cues["zrange"] / 0.5, 0, 1), 0.5)
    return (2 * s_density + s_int + s_single + s_flat) / 5.0     # density weighted double


def water_polygons(src: Path, crs: str, min_area: float = 8000.0) -> gpd.GeoDataFrame:
    p = pdal.Pipeline(json.dumps({"pipeline": [str(src)]}))
    p.execute()
    cues, (x0, y1, rows, cols) = grid_cues(p.arrays[0])
    mask = water_score(cues) > 0.7
    mask = ndi.binary_closing(ndi.binary_opening(mask, iterations=1), iterations=3)
    labels, n = ndi.label(mask)
    ground = np.where(np.isfinite(cues["zmin"]), cues["zmin"], np.nan)
    keep = np.zeros_like(mask)
    for lab in range(1, n + 1):
        region = labels == lab
        ring = ndi.binary_dilation(region, iterations=3) & ~region
        inner_edge = region & ~ndi.binary_erosion(region)
        if np.nanmedian(ground[ring]) - np.nanmedian(ground[inner_edge]) > -1.0:
            keep |= region                                  # sits at ground level
    transform = from_origin(x0, y1, CELL, CELL)
    polys = [shape(g) for g, v in rasterio.features.shapes(keep.astype("uint8"), mask=keep,
                                                           transform=transform)]
    gdf = gpd.GeoDataFrame({"geometry": polys}, crs=crs)
    gdf = gdf[gdf.area >= min_area].reset_index(drop=True)
    gdf["WaterId"] = np.arange(1, len(gdf) + 1)
    return gdf


def burn(src: Path, dst: Path, water: gpd.GeoDataFrame) -> None:
    gpkg = dst.with_suffix(".water.gpkg")
    water.to_file(gpkg, layer="water", driver="GPKG")
    pdal.Pipeline(json.dumps({"pipeline": [
        str(src),
        {"type": "filters.ferry", "dimensions": "=>WaterId"},
        {"type": "filters.overlay", "dimension": "WaterId", "datasource": str(gpkg),
         "layer": "water", "column": "WaterId"},
        {"type": "filters.assign", "value": [
            "Classification = 9 WHERE WaterId > 0 && (Classification == 1 || Classification == 2)"]},
        {"type": "writers.las", "filename": str(dst), "minor_version": 4,
         "dataformat_id": 6, "forward": "all"},
    ]})).execute()


if __name__ == "__main__":
    src = Path("valley_0310.laz")
    water = water_polygons(src, "EPSG:6341")
    print(f"{len(water)} water bodies, {water.area.sum() / 1e4:.1f} ha")
    burn(src, Path("valley_0310_water.laz"), water)
```

## Key Parameter Table

| Parameter | Type | Default | Guidance |
|---|---|---|---|
| `CELL` | float, m | 2.0 | 1 m for narrow channels at high density; 3–5 m for sparse data |
| density reference | fraction | 0.3 × median | Cells above 30 % of normal density score zero for this cue |
| flatness range | float, m | 0.5 | Elevation range at which a cell stops counting as flat |
| density weight | int | 2 | The most reliable cue counts double |
| score threshold | float | 0.7 | Lower finds more small ponds and more false positives |
| ground-level tolerance | float, m | 1.0 | Region edge must sit within this of surrounding ground |

<svg viewBox="0 0 740 200" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Score histogram for water and land cells with the threshold" style="width:100%;max-width:740px;display:block;margin:1.6rem auto">
  <title>Where the score separates water from land</title>
  <desc>Two overlapping distributions of per-cell water score. Land cells cluster between 0.1 and 0.5. Water cells cluster between 0.75 and 0.95. A small overlap between 0.55 and 0.75 contains shadows and dark roofs. The threshold at 0.7 sits near the right edge of the overlap.</desc>
  <rect x="0" y="0" width="740" height="200" fill="var(--dg-bg)" rx="10"/>
  <line x1="60" y1="160" x2="700" y2="160" stroke="var(--dg-line)" stroke-width="1.3"/>
  <path d="M60 160 C120 158 150 40 240 36 C330 40 360 150 460 158 L500 160 Z" fill="var(--dg-surface-2)" stroke="var(--dg-line)" stroke-width="1.4"/>
  <path d="M430 160 C500 156 540 60 600 56 C650 58 670 140 700 160 Z" fill="var(--dg-b-soft)" stroke="var(--dg-b)" stroke-width="1.4"/>
  <line x1="508" y1="24" x2="508" y2="160" stroke="var(--dg-e)" stroke-width="1.6" stroke-dasharray="5 4"/>
  <text x="514" y="34" font-size="10.5" fill="var(--dg-e)">0.7</text>
  <text x="240" y="28" text-anchor="middle" font-size="10.5" fill="var(--dg-text)">land cells</text>
  <text x="620" y="48" text-anchor="middle" font-size="10.5" fill="var(--dg-text)">water cells</text>
  <text x="60" y="178" font-size="10" fill="var(--dg-muted)">0</text>
  <text x="700" y="178" text-anchor="end" font-size="10" fill="var(--dg-muted)">1</text>
  <text x="380" y="194" text-anchor="middle" font-size="10.5" fill="var(--dg-muted)">per-cell water score</text>
</svg>

## Verification

- **Against imagery.** Overlay polygons on an orthophoto; every large detected region should be visibly water.
- **Against hydrography.** Where national or client water layers exist, compute the share of their area covered by detections, and the share of detected area outside them.
- **No elevated water.** Class 9 points should have near-zero height above surrounding ground. Any class 9 point more than a metre above its neighbours' ground indicates a roof region slipped through.

```python
w = gpd.read_file("valley_0310_water.water.gpkg", layer="water")
assert (w.area >= 8000).all()
print(w.area.describe())
```

## Gotchas and Edge Cases

**Specular returns at nadir.** Directly below the aircraft, calm water can reflect strongly, producing a stripe of dense, bright returns down the middle of a lake. The closing step fills it when the stripe is narrow; for wide stripes, use per-flightline processing or accept the stripe as water because it is surrounded by water.

**Uncalibrated intensity.** If intensity differs strongly between flightlines, the intensity cue becomes a flightline detector. Normalize first or drop the cue.

**Wetlands and saturated ground.** Marshes return weakly and are flat; they will score as water. Whether that is right depends on the specification — decide explicitly and document it.

<svg viewBox="0 0 740 190" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="A lake with a bright nadir stripe filled by morphological closing" style="width:100%;max-width:740px;display:block;margin:1.6rem auto">
  <title>The nadir stripe and how closing handles it</title>
  <desc>Left: a lake mask with a narrow vertical stripe of non-water cells down the middle, where specular returns made cells look like land. Right: after closing with three iterations, the stripe is filled and the lake is one region. A note says stripes wider than the closing size need per-flightline handling.</desc>
  <rect x="0" y="0" width="740" height="190" fill="var(--dg-bg)" rx="10"/>
  <text x="185" y="24" text-anchor="middle" font-size="11.5" font-weight="600" fill="var(--dg-text)">before closing</text>
  <text x="555" y="24" text-anchor="middle" font-size="11.5" font-weight="600" fill="var(--dg-text)">after closing</text>
  <path d="M60 60 C100 36 170 40 176 44 L176 160 C130 170 80 160 60 130 Z" fill="var(--dg-b-soft)" stroke="var(--dg-b)" stroke-width="1.4"/>
  <path d="M194 44 C230 40 300 44 314 80 C320 120 300 160 194 162 Z" fill="var(--dg-b-soft)" stroke="var(--dg-b)" stroke-width="1.4"/>
  <text x="185" y="182" text-anchor="middle" font-size="10.5" fill="var(--dg-e)">bright stripe splits the lake</text>
  <path d="M430 60 C470 36 540 40 564 44 C600 40 670 44 684 80 C690 120 670 160 564 162 C500 170 450 160 430 130 Z" fill="var(--dg-b-soft)" stroke="var(--dg-b)" stroke-width="1.4"/>
  <text x="555" y="182" text-anchor="middle" font-size="10.5" fill="var(--dg-d)">one region</text>
</svg>

**Tile edges.** A lake cut by a tile edge may fall below the minimum area on each side. Detect on a mosaic of grids, or merge polygons across tiles before applying the area filter.

## Frequently Asked Questions

**Why not rely on intensity alone to find water?**

Intensity depends on range, incidence angle and sensor calibration, and many dry surfaces such as fresh asphalt and dark roofing are just as dark. It helps as one cue among several but produces too many false positives alone.

**What does it mean when water has dense bright returns?**

Near nadir, calm water reflects the pulse straight back like a mirror, producing strong returns in a narrow stripe under the flight path. Everywhere else the pulse is reflected away or absorbed, so returns are sparse.

**Which points should be set to class 9?**

Ground and unclassified returns inside the water polygon. Returns from boats, docks and overhanging vegetation should keep their classes. Specifications differ, so confirm the rule for your project.

**Can this detect narrow rivers?**

Rivers wider than a few cells at the chosen resolution, if they are open to the sky. Tree-lined streams retain canopy returns and rarely look like water from above; they need breaklines or centreline data.

## Related

- [Water and Bridge Classification](https://www.pythonlidar.com/lidar-classification-feature-extraction/water-and-bridge-classification/) — the overall workflow
- [Hydro-Flattening Water Bodies in a DTM](https://www.pythonlidar.com/lidar-classification-feature-extraction/water-and-bridge-classification/hydro-flattening-water-bodies-in-a-dtm/) — what to do with the polygons
- [Classifying Bridge Decks](https://www.pythonlidar.com/lidar-classification-feature-extraction/water-and-bridge-classification/classifying-bridge-decks/) — the other hydrologic class
- [Normalizing Intensity Across Flightlines](https://www.pythonlidar.com/pdal-pipeline-architecture-execution/attribute-mapping/normalizing-intensity-across-flightlines/) — making the intensity cue trustworthy
- [Building a Point Density Raster with PDAL](https://www.pythonlidar.com/point-cloud-data-standards-fundamentals/point-density-metrics/building-a-point-density-raster-with-pdal/) — the density grid as a raster
