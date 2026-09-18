---
title: "Segmenting Trees with a Watershed on a CHM"
description: "Marker-controlled watershed segmentation of a canopy height model with scikit-image: a height-dependent search window for tree tops, masking to canopy, and exporting crowns as polygons with heights."
slug: "segmenting-trees-with-a-watershed-on-a-chm"
type: "howto"
breadcrumb: "Watershed on a CHM"
datePublished: "2026-09-18"
dateModified: "2026-09-18"
---

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Article",
      "headline": "Segmenting Trees with a Watershed on a CHM",
      "description": "Marker-controlled watershed segmentation of a canopy height model with scikit-image: a height-dependent search window for tree tops, masking to canopy, and exporting crowns as polygons with heights.",
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
          "name": "Individual Tree Segmentation",
          "item": "https://www.pythonlidar.com/lidar-classification-feature-extraction/individual-tree-segmentation/"
        },
        {
          "@type": "ListItem",
          "position": 4,
          "name": "Watershed on a CHM",
          "item": "https://www.pythonlidar.com/lidar-classification-feature-extraction/individual-tree-segmentation/segmenting-trees-with-a-watershed-on-a-chm/"
        }
      ]
    },
    {
      "@type": "HowTo",
      "name": "Segment individual tree crowns with a marker-controlled watershed on a CHM",
      "step": [
        {
          "@type": "HowToStep",
          "name": "Smooth lightly",
          "text": "A Gaussian with sigma of 0.5\u20131 m suppresses branch-level bumps. Keep the unsmoothed CHM for heights."
        },
        {
          "@type": "HowToStep",
          "name": "Detect tops with a variable window",
          "text": "For each candidate maximum, require that it is the highest cell within a radius that depends on its own height, for example r = 0.6 + 0.08\u00b7h metres. Implement it by testing candidates against a maximum filter per height band."
        },
        {
          "@type": "HowToStep",
          "name": "Mask the canopy",
          "text": "Build a mask of cells above a fixed height (such as 2 m) or a fraction of each top's height, so crowns do not grow over gaps and bare ground."
        },
        {
          "@type": "HowToStep",
          "name": "Run the watershed",
          "text": "Pass the negated smoothed CHM, the marker image and the mask to watershed. Setting compactness above zero produces more rounded crowns, useful in dense conifer stands."
        },
        {
          "@type": "HowToStep",
          "name": "Polygonize and attribute",
          "text": "Convert labels to polygons, then attach tree height (maximum of the raw CHM inside the crown), crown area and top location."
        }
      ]
    },
    {
      "@type": "FAQPage",
      "mainEntity": [
        {
          "@type": "Question",
          "name": "Why use a variable window instead of a fixed one?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Crown width grows with tree height, so a single window is either too small for large trees, splitting them, or too large for small ones, merging them. A height-dependent window adapts the separation to each tree."
          }
        },
        {
          "@type": "Question",
          "name": "What does compactness do in skimage watershed?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "It adds a penalty for distance from the marker, so regions grow more evenly in all directions. Small values give rounder crowns and help in dense stands where intensity valleys between crowns are weak."
          }
        },
        {
          "@type": "Question",
          "name": "Can I use the smoothed CHM for tree heights?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "No. Smoothing lowers peaks, often by tens of centimetres. Use the raw CHM maximum within each crown, or the maximum point height, for reported tree height."
          }
        },
        {
          "@type": "Question",
          "name": "Is watershed segmentation good for broadleaf forests?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "It works but less well than in conifers, because broadleaf crowns are wide, flat and interlocking. Expect lower detection rates and tune smoothing more aggressively, or consider point-based methods for dense broadleaf stands."
          }
        }
      ]
    }
  ]
}
</script>

**TL;DR:** Smooth the CHM lightly, find tree tops as local maxima with a search window that grows with height (a 20 m tree gets a wider window than a 6 m one), run `skimage.segmentation.watershed` on the negated CHM with those tops as markers and a canopy mask, and polygonize the labels into crowns carrying the maximum CHM height as tree height.

## Context and Motivation

This guide is part of [Individual Tree Segmentation from LiDAR](https://www.pythonlidar.com/lidar-classification-feature-extraction/individual-tree-segmentation/). A watershed treats the canopy height model as a landscape turned upside down: every tree top becomes the bottom of a basin, and crowns are the areas that drain into each basin. Left alone, a watershed floods from every local minimum and produces hundreds of fragments per hectare. Marker control fixes that by flooding only from the tops you nominate, which turns the problem into choosing good markers.

The refinement worth making over a fixed-window approach is a variable window. Small trees have small crowns and can stand close together; large trees have wide crowns, and two maxima five metres apart on a 30 m tree are usually the same crown. A window whose radius is a function of height captures that without separate runs for each stand type.

<svg viewBox="0 0 740 210" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="A canopy profile inverted into basins with markers at the tree tops" style="width:100%;max-width:740px;display:block;margin:1.6rem auto">
  <title>Crowns as basins</title>
  <desc>Upper strip: a canopy profile with three peaks. Lower strip: the same profile negated so the peaks become basins. Markers sit at the bottom of each basin. Water rising from each marker meets its neighbour at the ridges, which become crown boundaries.</desc>
  <rect x="0" y="0" width="740" height="210" fill="var(--dg-bg)" rx="10"/>
  <text x="20" y="28" font-size="10.5" fill="var(--dg-muted)">CHM</text>
  <path d="M60 90 Q140 20 220 70 Q300 30 380 80 Q480 14 580 60 Q640 80 680 90" fill="none" stroke="var(--dg-d)" stroke-width="2"/>
  <text x="20" y="130" font-size="10.5" fill="var(--dg-muted)">−CHM</text>
  <path d="M60 120 Q140 190 220 140 Q300 180 380 130 Q480 196 580 150 Q640 130 680 120" fill="var(--dg-b-soft)" stroke="var(--dg-b)" stroke-width="2"/>
  <g fill="var(--dg-c)"><circle cx="140" cy="155" r="5"/><circle cx="300" cy="160" r="5"/><circle cx="480" cy="163" r="5"/></g>
  <g stroke="var(--dg-line)" stroke-width="1.3" stroke-dasharray="4 3"><line x1="220" y1="112" x2="220" y2="176"/><line x1="380" y1="104" x2="380" y2="176"/></g>
  <text x="300" y="200" text-anchor="middle" font-size="10.5" fill="var(--dg-text)">markers at tops; boundaries where floods meet</text>
</svg>

## Prerequisites and Assumptions

- A canopy height model at 0.5 m, ideally [pit-free](https://www.pythonlidar.com/ground-filtering-dtm-dsm-generation/canopy-height-models/building-a-pit-free-canopy-height-model/), in a projected CRS in metres.
- Python with rasterio, NumPy, SciPy, scikit-image 0.19+ and GeoPandas.
- A minimum tree height of interest (commonly 2–5 m) and a rough crown-width to height relationship for the forest type.

## Step-by-Step Implementation

### Step 1 — Smooth lightly

A Gaussian with sigma of 0.5–1 m suppresses branch-level bumps. Keep the unsmoothed CHM for heights.

### Step 2 — Detect tops with a variable window

For each candidate maximum, require that it is the highest cell within a radius that depends on its own height, for example `r = 0.6 + 0.08·h` metres. Implement it by testing candidates against a maximum filter per height band.

### Step 3 — Mask the canopy

Build a mask of cells above a fixed height (such as 2 m) or a fraction of each top's height, so crowns do not grow over gaps and bare ground.

### Step 4 — Run the watershed

Pass the negated smoothed CHM, the marker image and the mask to `watershed`. Setting `compactness` above zero produces more rounded crowns, useful in dense conifer stands.

### Step 5 — Polygonize and attribute

Convert labels to polygons, then attach tree height (maximum of the raw CHM inside the crown), crown area and top location.

## Complete Working Example

```python
"""Variable-window marker-controlled watershed on a canopy height model."""
from __future__ import annotations

from pathlib import Path

import geopandas as gpd
import numpy as np
import rasterio
import rasterio.features
from scipy import ndimage as ndi
from shapely.geometry import shape
from skimage.segmentation import watershed


def window_radius(h: np.ndarray) -> np.ndarray:
    """Search radius in metres as a function of height (tune per forest type)."""
    return 0.6 + 0.08 * h


def variable_window_tops(smooth: np.ndarray, res: float, min_h: float) -> np.ndarray:
    tops = np.zeros(smooth.shape, dtype=bool)
    bands = np.arange(min_h, np.nanmax(smooth) + 5.0, 5.0)
    for lo in bands:
        hi = lo + 5.0
        r_cells = max(1, int(round(window_radius(np.array(hi)) / res)))
        size = 2 * r_cells + 1
        yy, xx = np.ogrid[-r_cells:r_cells + 1, -r_cells:r_cells + 1]
        disk = (xx ** 2 + yy ** 2) <= r_cells ** 2
        local_max = ndi.maximum_filter(smooth, footprint=disk, mode="nearest")
        in_band = (smooth >= lo) & (smooth < hi)
        tops |= in_band & (smooth == local_max)
    return tops


def segment(chm_path: Path, out_gpkg: Path, min_h: float = 3.0, sigma_m: float = 0.6,
            compactness: float = 0.0) -> gpd.GeoDataFrame:
    with rasterio.open(chm_path) as ds:
        chm = ds.read(1, masked=True).filled(0.0).astype("float32")
        transform, crs, res = ds.transform, ds.crs, ds.res[0]
    chm[chm < 0] = 0.0
    smooth = ndi.gaussian_filter(chm, sigma=sigma_m / res)

    tops = variable_window_tops(smooth, res, min_h)
    markers, n = ndi.label(tops)
    mask = smooth > max(2.0, 0.5 * min_h)
    labels = watershed(-smooth, markers=markers, mask=mask, compactness=compactness)

    ids = np.arange(1, labels.max() + 1)
    heights = ndi.maximum(chm, labels, ids)
    records = []
    for geom, lab in rasterio.features.shapes(labels.astype("int32"), mask=labels > 0,
                                              transform=transform):
        poly = shape(geom)
        h = float(heights[int(lab) - 1])
        if h < min_h or poly.area < 1.0:
            continue
        records.append({"tree_id": int(lab), "height_m": round(h, 2),
                        "crown_area_m2": round(poly.area, 1), "geometry": poly})
    crowns = gpd.GeoDataFrame(records, crs=crs)
    crowns.to_file(out_gpkg, layer="crowns", driver="GPKG")
    print(f"{n} tops, {len(crowns)} crowns written to {out_gpkg.name}")
    return crowns


if __name__ == "__main__":
    segment(Path("out/stand_12/chm.tif"), Path("out/stand_12/crowns.gpkg"))
```

<svg viewBox="0 0 740 210" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Search window radius growing linearly with tree height" style="width:100%;max-width:740px;display:block;margin:1.6rem auto">
  <title>A window that grows with the tree</title>
  <desc>A straight line of window radius against tree height, from 0.84 metres at 3 metres height to 3.0 metres at 30 metres height. Three example trees are drawn beneath the line with circles of the corresponding radius: a small tree with a tight window, a medium tree, and a tall tree with a wide window.</desc>
  <rect x="0" y="0" width="740" height="210" fill="var(--dg-bg)" rx="10"/>
  <line x1="80" y1="170" x2="680" y2="170" stroke="var(--dg-line)" stroke-width="1.3"/>
  <line x1="80" y1="170" x2="80" y2="24" stroke="var(--dg-line)" stroke-width="1.3"/>
  <line x1="140" y1="148" x2="680" y2="36" stroke="var(--dg-a)" stroke-width="2"/>
  <circle cx="140" cy="148" r="4" fill="var(--dg-a)"/><circle cx="380" cy="98" r="4" fill="var(--dg-a)"/><circle cx="680" cy="36" r="4" fill="var(--dg-a)"/>
  <text x="150" y="140" font-size="10.5" fill="var(--dg-text)">3 m tree: r 0.8 m</text>
  <text x="390" y="92" font-size="10.5" fill="var(--dg-text)">15 m tree: r 1.8 m</text>
  <text x="672" y="58" text-anchor="end" font-size="10.5" fill="var(--dg-text)">30 m tree: r 3.0 m</text>
  <text x="380" y="192" text-anchor="middle" font-size="10.5" fill="var(--dg-muted)">tree height (m)</text>
  <text x="40" y="100" font-size="10.5" fill="var(--dg-muted)" transform="rotate(-90 40 100)" text-anchor="middle">window radius</text>
  <text x="380" y="206" text-anchor="middle" font-size="10" fill="var(--dg-muted)">r = 0.6 + 0.08 h — a starting point, tuned against plots</text>
</svg>

## Key Parameter Table

| Parameter | Type | Default | Guidance |
|---|---|---|---|
| `sigma_m` | float, m | 0.6 | 0.4 for young dense stands, 1.0+ for broad crowns |
| window intercept | float, m | 0.6 | Minimum radius; stops adjacent cells both being tops |
| window slope | float | 0.08 | Radius growth per metre of height; from a crown-width model if you have one |
| `min_h` | float, m | 3.0 | Smallest tree reported |
| mask height | float, m | max(2, 0.5·`min_h`) | Crown edge; lower lets crowns spread across gaps |
| `compactness` | float | 0.0 | 0.001–0.01 rounds crowns in dense conifers |

## Verification

- **Tops per hectare.** Compare against stand records or plots. A number far above expected density means the window is too small or smoothing too weak.
- **Heights against raw points.** For a sample of crowns, the tree height should match the maximum `HeightAboveGround` of points inside the crown within one CHM cell's error.
- **Crown shapes.** Overlay crowns on a hillshade of the CHM. Boundaries should follow the valleys between crowns; straight boundaries through a crown mean two markers in one tree.

```python
crowns = gpd.read_file("out/stand_12/crowns.gpkg", layer="crowns")
ha = crowns.total_bounds
area_ha = (ha[2] - ha[0]) * (ha[3] - ha[1]) / 10_000
print(f"{len(crowns) / area_ha:.0f} trees/ha, median height {crowns.height_m.median():.1f} m")
```

## Gotchas and Edge Cases

**Flat-topped crowns produce plateaus.** When several adjacent cells share the exact maximum, the equality test marks all of them. `ndi.label` merges touching top cells into one marker, which is why the code labels the boolean top image rather than using the cells directly.

**Border trees are truncated.** Crowns cut by the tile edge are smaller and their tops may be missing. Process with a buffer at least one crown diameter wide and keep only trees whose top lies inside the unbuffered tile.

**Deciduous leaf-off data.** Without leaves, crowns are open branch networks and the CHM is full of holes. Build the CHM with a larger radius, use a pit-free method, or segment from points instead.

<svg viewBox="0 0 740 190" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Crown boundaries with and without a canopy mask at a forest edge" style="width:100%;max-width:740px;display:block;margin:1.6rem auto">
  <title>What the canopy mask prevents</title>
  <desc>Two plan views of a forest edge next to a field. Without a mask, the outermost crown's watershed region spreads far into the open field, inflating its area. With a mask at two metres, the crown stops at the canopy edge and its area matches the visible crown.</desc>
  <rect x="0" y="0" width="740" height="190" fill="var(--dg-bg)" rx="10"/>
  <text x="185" y="24" text-anchor="middle" font-size="11.5" font-weight="600" fill="var(--dg-text)">no mask</text>
  <text x="555" y="24" text-anchor="middle" font-size="11.5" font-weight="600" fill="var(--dg-text)">mask at 2 m</text>
  <rect x="30" y="40" width="310" height="130" fill="var(--dg-surface)" stroke="var(--dg-line-soft)" stroke-width="1"/>
  <rect x="400" y="40" width="310" height="130" fill="var(--dg-surface)" stroke="var(--dg-line-soft)" stroke-width="1"/>
  <path d="M30 40 L150 40 L150 170 L30 170 Z" fill="var(--dg-d-soft)"/>
  <path d="M400 40 L520 40 L520 170 L400 170 Z" fill="var(--dg-d-soft)"/>
  <path d="M100 62 C160 50 300 58 336 70 C342 100 340 130 330 148 C260 158 160 156 100 148 C92 120 92 90 100 62 Z" fill="var(--dg-e-soft)" stroke="var(--dg-e)" stroke-width="1.4"/>
  <ellipse cx="490" cy="105" rx="30" ry="40" fill="var(--dg-a-soft)" stroke="var(--dg-a)" stroke-width="1.4"/>
  <text x="250" y="110" text-anchor="middle" font-size="10.5" fill="var(--dg-e)">crown leaks into field</text>
  <text x="615" y="110" text-anchor="middle" font-size="10.5" fill="var(--dg-muted)">open field</text>
</svg>

## Frequently Asked Questions

**Why use a variable window instead of a fixed one?**

Crown width grows with tree height, so a single window is either too small for large trees, splitting them, or too large for small ones, merging them. A height-dependent window adapts the separation to each tree.

**What does compactness do in skimage watershed?**

It adds a penalty for distance from the marker, so regions grow more evenly in all directions. Small values give rounder crowns and help in dense stands where intensity valleys between crowns are weak.

**Can I use the smoothed CHM for tree heights?**

No. Smoothing lowers peaks, often by tens of centimetres. Use the raw CHM maximum within each crown, or the maximum point height, for reported tree height.

**Is watershed segmentation good for broadleaf forests?**

It works but less well than in conifers, because broadleaf crowns are wide, flat and interlocking. Expect lower detection rates and tune smoothing more aggressively, or consider point-based methods for dense broadleaf stands.

## Related

- [Individual Tree Segmentation from LiDAR](https://www.pythonlidar.com/lidar-classification-feature-extraction/individual-tree-segmentation/) — the full workflow and evaluation against plots
- [Segmenting Trees Directly from Points](https://www.pythonlidar.com/lidar-classification-feature-extraction/individual-tree-segmentation/segmenting-trees-directly-from-points/) — the point-based alternative
- [Computing Crown Metrics per Tree](https://www.pythonlidar.com/lidar-classification-feature-extraction/individual-tree-segmentation/computing-crown-metrics-per-tree/) — what to measure once crowns exist
- [Extracting Individual Tree Heights from a CHM](https://www.pythonlidar.com/ground-filtering-dtm-dsm-generation/canopy-height-models/extracting-individual-tree-heights-from-a-chm/) — the simpler tops-only approach
- [Building a Pit-Free Canopy Height Model](https://www.pythonlidar.com/ground-filtering-dtm-dsm-generation/canopy-height-models/building-a-pit-free-canopy-height-model/) — a better input raster
