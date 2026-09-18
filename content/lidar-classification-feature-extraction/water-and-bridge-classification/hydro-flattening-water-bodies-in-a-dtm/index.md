---
title: "Hydro-Flattening Water Bodies in a DTM"
description: "Flatten lakes to one elevation and rivers to a smooth downstream gradient in a LiDAR DTM: shoreline sampling, monotonic river profiles along a centreline, burning with rasterio, and checks that banks stay above water."
slug: "hydro-flattening-water-bodies-in-a-dtm"
type: "howto"
breadcrumb: "Hydro-Flattening a DTM"
datePublished: "2026-09-18"
dateModified: "2026-09-18"
---

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Article",
      "headline": "Hydro-Flattening Water Bodies in a DTM",
      "description": "Flatten lakes to one elevation and rivers to a smooth downstream gradient in a LiDAR DTM: shoreline sampling, monotonic river profiles along a centreline, burning with rasterio, and checks that banks stay above water.",
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
          "name": "Hydro-Flattening a DTM",
          "item": "https://www.pythonlidar.com/lidar-classification-feature-extraction/water-and-bridge-classification/hydro-flattening-water-bodies-in-a-dtm/"
        }
      ]
    },
    {
      "@type": "HowTo",
      "name": "Hydro-flatten lakes and rivers in a LiDAR-derived DTM",
      "step": [
        {
          "@type": "HowToStep",
          "name": "Build a shoreline ring per polygon",
          "text": "Buffer each polygon outward by 1.5 to 3 cells and subtract the polygon. The ring samples the banks, not the noisy water surface."
        },
        {
          "@type": "HowToStep",
          "name": "Flatten lakes",
          "text": "Take the 5th percentile of DTM values in the ring and assign it to every cell inside the polygon."
        },
        {
          "@type": "HowToStep",
          "name": "Build a river profile",
          "text": "Sample the centreline every 10 m. At each station, take a low percentile of ring cells within a short distance of the station \u2014 the local bank elevation."
        },
        {
          "@type": "HowToStep",
          "name": "Enforce downstream monotonicity",
          "text": "Apply a running minimum from upstream to downstream: each station's water elevation is the smaller of its own sample and the previous station's value."
        },
        {
          "@type": "HowToStep",
          "name": "Burn river cells",
          "text": "For each cell inside the river polygon, find its projected distance along the centreline and interpolate the water elevation from the station profile."
        },
        {
          "@type": "HowToStep",
          "name": "Verify banks",
          "text": "Check that ring cells are not lower than the water surface next to them by more than a few centimetres."
        }
      ]
    },
    {
      "@type": "FAQPage",
      "mainEntity": [
        {
          "@type": "Question",
          "name": "What elevation should a flattened lake have?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "At or just below the lowest part of its shoreline, so water never appears to sit above the land. A low percentile of bank cells achieves that while ignoring a few anomalously low cells."
          }
        },
        {
          "@type": "Question",
          "name": "Why can't rivers be flattened to a single elevation?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Because rivers flow downhill. A single level would either flood the upstream reach or leave a waterfall at the downstream end. Rivers need a surface that is flat across the channel and descends along it."
          }
        },
        {
          "@type": "Question",
          "name": "What size of water body needs hydro-flattening?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "It depends on the specification. The USGS Lidar Base Specification applies it to ponds and lakes of about two acres or more and to streams about 100 feet wide or more. Contracts often set their own thresholds."
          }
        },
        {
          "@type": "Question",
          "name": "Does hydro-flattening change the point cloud?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "No. It is applied to the raster DEM. The points are classified as water but keep their measured elevations."
          }
        }
      ]
    }
  ]
}
</script>

**TL;DR:** For each lake polygon, set every DTM cell inside to a low percentile of the elevations in a thin shoreline ring. For each river polygon, sample bank elevations along the centreline, force the profile to be non-increasing downstream with a running minimum, and interpolate each cell's water surface from its position along the centreline. Burn both with rasterio masks, then verify that no bank cell sits below the adjacent water.

## Context and Motivation

This guide is part of [Water and Bridge Classification in LiDAR](https://www.pythonlidar.com/lidar-classification-feature-extraction/water-and-bridge-classification/). A DTM interpolated across water is a mess: sparse returns from waves and specular stripes produce bumps and pits, and void-filling across empty areas draws arbitrary slopes. Hydro-flattening replaces all of that with a surface a hydrologist would recognize — lakes perfectly flat, rivers descending smoothly, and banks that meet the water cleanly. The USGS Lidar Base Specification requires it for delivered DEMs, and any flood or drainage model run on an un-flattened DTM will route water uphill somewhere.

The two cases need different treatment. A lake has one surface elevation. A river's surface falls downstream, so flattening it to one value would create a dam at the downstream end or a waterfall at the upstream end.

<svg viewBox="0 0 740 220" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Raw, lake-flattened and river-gradient water surfaces compared" style="width:100%;max-width:740px;display:block;margin:1.6rem auto">
  <title>Flat for lakes, descending for rivers</title>
  <desc>Three long profiles along a water body. The raw DTM surface is jagged with bumps and pits. A lake treatment replaces it with one horizontal line at the shoreline elevation. A river treatment replaces it with a line that steps down smoothly from upstream to downstream and never rises.</desc>
  <rect x="0" y="0" width="740" height="220" fill="var(--dg-bg)" rx="10"/>
  <text x="20" y="40" font-size="10.5" fill="var(--dg-muted)">raw</text>
  <polyline points="100,44 150,30 200,52 250,36 300,60 350,40 400,58 450,46 500,64 550,50 600,70 650,58 700,72" fill="none" stroke="var(--dg-e)" stroke-width="1.8"/>
  <text x="20" y="110" font-size="10.5" fill="var(--dg-muted)">lake</text>
  <line x1="100" y1="106" x2="700" y2="106" stroke="var(--dg-b)" stroke-width="2.2"/>
  <text x="700" y="96" text-anchor="end" font-size="10.5" fill="var(--dg-b)">one elevation</text>
  <text x="20" y="176" font-size="10.5" fill="var(--dg-muted)">river</text>
  <polyline points="100,150 220,154 300,160 380,162 460,170 560,174 700,186" fill="none" stroke="var(--dg-d)" stroke-width="2.2"/>
  <text x="700" y="206" text-anchor="end" font-size="10.5" fill="var(--dg-d)">monotonic downstream</text>
  <text x="100" y="206" font-size="10.5" fill="var(--dg-muted)">upstream</text>
</svg>

## Prerequisites and Assumptions

- A bare-earth DTM GeoTIFF built from class 2, e.g. with [writers.gdal](https://www.pythonlidar.com/ground-filtering-dtm-dsm-generation/dtm-raster-generation/generating-a-dtm-geotiff-with-writers-gdal/).
- Water polygons with a `kind` attribute (`lake` or `river`), from [water detection](https://www.pythonlidar.com/lidar-classification-feature-extraction/water-and-bridge-classification/classifying-water-from-intensity-and-returns/) or supplied breaklines.
- River centrelines as line strings digitized upstream to downstream, one per river polygon.
- Python with rasterio, NumPy, Shapely 2.x and GeoPandas.

## Step-by-Step Implementation

### Step 1 — Build a shoreline ring per polygon

Buffer each polygon outward by 1.5 to 3 cells and subtract the polygon. The ring samples the banks, not the noisy water surface.

### Step 2 — Flatten lakes

Take the 5th percentile of DTM values in the ring and assign it to every cell inside the polygon.

### Step 3 — Build a river profile

Sample the centreline every 10 m. At each station, take a low percentile of ring cells within a short distance of the station — the local bank elevation.

### Step 4 — Enforce downstream monotonicity

Apply a running minimum from upstream to downstream: each station's water elevation is the smaller of its own sample and the previous station's value.

### Step 5 — Burn river cells

For each cell inside the river polygon, find its projected distance along the centreline and interpolate the water elevation from the station profile.

### Step 6 — Verify banks

Check that ring cells are not lower than the water surface next to them by more than a few centimetres.

## Complete Working Example

```python
"""Hydro-flatten lakes (single level) and rivers (monotonic profile) in a DTM."""
from __future__ import annotations

from pathlib import Path

import geopandas as gpd
import numpy as np
import rasterio
from rasterio.features import geometry_mask
from shapely.geometry import LineString, Point


def ring_mask(poly, shape, transform, width):
    ring = poly.buffer(width).difference(poly)
    return geometry_mask([ring], shape, transform, invert=True)


def flatten_lake(dtm, poly, transform, width, pct=5.0):
    shore = ring_mask(poly, dtm.shape, transform, width)
    z = float(np.nanpercentile(dtm[shore], pct))
    inside = geometry_mask([poly], dtm.shape, transform, invert=True)
    dtm[inside] = z
    return z


def flatten_river(dtm, poly, centre: LineString, transform, width, step=10.0, pct=10.0):
    shore = ring_mask(poly, dtm.shape, transform, width)
    rows, cols = np.nonzero(shore)
    xs, ys = rasterio.transform.xy(transform, rows, cols)
    shore_xy = np.column_stack([xs, ys])
    shore_z = dtm[rows, cols]

    stations = np.arange(0.0, centre.length + step, step)
    levels = np.full(len(stations), np.nan)
    for i, s in enumerate(stations):
        p = centre.interpolate(s)
        near = np.hypot(shore_xy[:, 0] - p.x, shore_xy[:, 1] - p.y) < 2 * step
        if near.any():
            levels[i] = np.nanpercentile(shore_z[near], pct)
    good = ~np.isnan(levels)
    levels = np.interp(stations, stations[good], levels[good])
    levels = np.minimum.accumulate(levels)          # never rises downstream

    inside = geometry_mask([poly], dtm.shape, transform, invert=True)
    r, c = np.nonzero(inside)
    cx, cy = rasterio.transform.xy(transform, r, c)
    along = np.array([centre.project(Point(x, y)) for x, y in zip(cx, cy)])
    dtm[r, c] = np.interp(along, stations, levels)
    return levels


def hydro_flatten(dtm_in: Path, water_gpkg: Path, centre_gpkg: Path, dtm_out: Path) -> None:
    with rasterio.open(dtm_in) as ds:
        profile, transform = ds.profile, ds.transform
        dtm = ds.read(1, masked=True).filled(np.nan).astype("float64")
        width = 2.0 * ds.res[0]
    water = gpd.read_file(water_gpkg)
    centres = gpd.read_file(centre_gpkg).set_index("water_id")
    for row in water.itertuples():
        if row.kind == "lake":
            z = flatten_lake(dtm, row.geometry, transform, width)
            print(f"lake {row.water_id}: {z:.2f} m")
        else:
            lv = flatten_river(dtm, row.geometry, centres.loc[row.water_id].geometry,
                               transform, width)
            print(f"river {row.water_id}: {lv[0]:.2f} → {lv[-1]:.2f} m")
    profile.update(dtype="float32", nodata=-9999.0, compress="deflate")
    with rasterio.open(dtm_out, "w", **profile) as out:
        out.write(np.nan_to_num(dtm, nan=-9999.0).astype("float32"), 1)


if __name__ == "__main__":
    hydro_flatten(Path("dtm_valley.tif"), Path("water.gpkg"), Path("centrelines.gpkg"),
                  Path("dtm_valley_hydro.tif"))
```

<svg viewBox="0 0 740 210" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Raw bank samples and the running-minimum river profile" style="width:100%;max-width:740px;display:block;margin:1.6rem auto">
  <title>The running minimum removes uphill steps</title>
  <desc>Dots show bank elevation samples at stations along a river, generally falling downstream but with two upward bumps where a bank sample caught a levee or vegetation. A solid line shows the running minimum, which follows the samples down and stays flat across each bump instead of rising.</desc>
  <rect x="0" y="0" width="740" height="210" fill="var(--dg-bg)" rx="10"/>
  <line x1="70" y1="180" x2="700" y2="180" stroke="var(--dg-line)" stroke-width="1.3"/>
  <line x1="70" y1="180" x2="70" y2="20" stroke="var(--dg-line)" stroke-width="1.3"/>
  <g fill="var(--dg-c)"><circle cx="100" cy="40" r="3.5"/><circle cx="150" cy="48" r="3.5"/><circle cx="200" cy="56" r="3.5"/><circle cx="250" cy="40" r="3.5"/><circle cx="300" cy="66" r="3.5"/><circle cx="350" cy="74" r="3.5"/><circle cx="400" cy="84" r="3.5"/><circle cx="450" cy="70" r="3.5"/><circle cx="500" cy="98" r="3.5"/><circle cx="550" cy="110" r="3.5"/><circle cx="600" cy="122" r="3.5"/><circle cx="650" cy="138" r="3.5"/></g>
  <polyline points="100,40 150,48 200,56 250,56 300,66 350,74 400,84 450,84 500,98 550,110 600,122 650,138" fill="none" stroke="var(--dg-b)" stroke-width="2"/>
  <text x="258" y="32" font-size="10.5" fill="var(--dg-e)">levee sample ignored</text>
  <text x="458" y="62" font-size="10.5" fill="var(--dg-e)">vegetation sample ignored</text>
  <text x="380" y="200" text-anchor="middle" font-size="10.5" fill="var(--dg-muted)">distance downstream along centreline</text>
  <text x="36" y="100" font-size="10.5" fill="var(--dg-muted)" transform="rotate(-90 36 100)" text-anchor="middle">elevation</text>
</svg>

## Key Parameter Table

| Parameter | Type | Default | Guidance |
|---|---|---|---|
| ring width | cells | 2 | 1–3 cells; wider picks up bank slopes, narrower picks up water noise |
| lake percentile | float | 5 | Low enough to sit at or below every bank cell |
| river station spacing | float, m | 10 | 5–25 m depending on river size and gradient |
| river bank percentile | float | 10 | Slightly higher than lakes, since banks vary more along a river |
| station search radius | float, m | 2 × spacing | Must reach both banks on the widest reach |

## Verification

- **Banks above water.** For every ring cell, the bank should not be more than about 5 cm below the flattened water next to it. More than that creates a "moat" in hillshades.
- **Monotonic rivers.** Sample the burned DTM along each centreline and assert the profile never increases.
- **Lakes exactly flat.** The standard deviation of cells inside each lake polygon is zero.

```python
with rasterio.open("dtm_valley_hydro.tif") as ds:
    dtm = ds.read(1, masked=True)
    for row in water[water.kind == "lake"].itertuples():
        inside = geometry_mask([row.geometry], dtm.shape, ds.transform, invert=True)
        assert float(dtm[inside].std()) == 0.0, f"lake {row.water_id} not flat"
```

## Gotchas and Edge Cases

**Centreline direction.** The running minimum assumes the centreline is digitized upstream to downstream. Reversed lines produce a profile that is flat from the source to the mouth at the mouth's elevation. Check direction against the DTM before flattening.

**Lakes inside rivers.** A reservoir behind a dam is a lake; the river above and below it is not. Split the water polygon at the dam and treat each part appropriately.

**Tile boundaries.** Flattening tile by tile gives each tile its own lake level and its own river profile. Always flatten on a mosaic or on polygons processed as whole features across tiles.

<svg viewBox="140 0 460 180" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="A lake split by a tile boundary receiving two different levels" style="width:100%;max-width:740px;display:block;margin:1.6rem auto">
  <title>One lake, two tiles, two levels</title>
  <desc>A lake crosses a vertical tile boundary. Flattened per tile, the left half gets 212.4 metres and the right half 212.9 metres, producing a visible 0.5 metre step at the boundary. Flattened as one feature on a mosaic, both halves share 212.4 metres.</desc>
  <rect x="140" y="0" width="460" height="180" fill="var(--dg-bg)" rx="10"/>
  <line x1="370" y1="20" x2="370" y2="160" stroke="var(--dg-line)" stroke-width="1.4" stroke-dasharray="6 4"/>
  <path d="M170 60 C220 30 330 34 370 40 L370 150 C300 160 200 150 170 120 Z" fill="var(--dg-b-soft)" stroke="var(--dg-b)" stroke-width="1.4"/>
  <path d="M370 40 C420 36 520 40 560 70 C580 110 540 150 370 150 Z" fill="var(--dg-a-soft)" stroke="var(--dg-a)" stroke-width="1.4"/>
  <text x="270" y="100" text-anchor="middle" font-size="11" fill="var(--dg-text)">212.4 m</text>
  <text x="460" y="100" text-anchor="middle" font-size="11" fill="var(--dg-text)">212.9 m</text>
  <text x="370" y="176" text-anchor="middle" font-size="10.5" fill="var(--dg-e)">0.5 m step at the tile edge — flatten whole features instead</text>
</svg>

**Islands.** Water polygons with holes need the holes excluded from both the ring (they are banks) and the fill. `geometry_mask` honours interior rings, so pass the polygon with its holes intact.

## Frequently Asked Questions

**What elevation should a flattened lake have?**

At or just below the lowest part of its shoreline, so water never appears to sit above the land. A low percentile of bank cells achieves that while ignoring a few anomalously low cells.

**Why can't rivers be flattened to a single elevation?**

Because rivers flow downhill. A single level would either flood the upstream reach or leave a waterfall at the downstream end. Rivers need a surface that is flat across the channel and descends along it.

**What size of water body needs hydro-flattening?**

It depends on the specification. The USGS Lidar Base Specification applies it to ponds and lakes of about two acres or more and to streams about 100 feet wide or more. Contracts often set their own thresholds.

**Does hydro-flattening change the point cloud?**

No. It is applied to the raster DEM. The points are classified as water but keep their measured elevations.

## Related

- [Water and Bridge Classification](https://www.pythonlidar.com/lidar-classification-feature-extraction/water-and-bridge-classification/) — the full hydrologic workflow
- [Classifying Water from Intensity and Returns](https://www.pythonlidar.com/lidar-classification-feature-extraction/water-and-bridge-classification/classifying-water-from-intensity-and-returns/) — producing the water polygons
- [Classifying Bridge Decks](https://www.pythonlidar.com/lidar-classification-feature-extraction/water-and-bridge-classification/classifying-bridge-decks/) — removing decks before flattening rivers beneath them
- [Filling NoData Voids in DTM Rasters](https://www.pythonlidar.com/ground-filtering-dtm-dsm-generation/dtm-raster-generation/filling-nodata-voids-in-dtm-rasters/) — handling voids outside water
- [Building a Seamless DTM Mosaic from Tiles](https://www.pythonlidar.com/ground-filtering-dtm-dsm-generation/dtm-raster-generation/building-a-seamless-dtm-mosaic-from-tiles/) — flattening on the mosaic, not per tile
