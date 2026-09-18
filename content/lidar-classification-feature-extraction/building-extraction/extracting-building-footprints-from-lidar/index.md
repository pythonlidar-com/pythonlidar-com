---
title: "Extracting Building Footprints from LiDAR"
description: "Turn class-6 roof points into clean, rectilinear footprint polygons: rasterize, polygonize with rasterio, close gaps, regularize to a dominant orientation, and write a GeoPackage with heights."
slug: "extracting-building-footprints-from-lidar"
type: "howto"
breadcrumb: "Extracting Building Footprints"
datePublished: "2026-09-18"
dateModified: "2026-09-18"
---

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Article",
      "headline": "Extracting Building Footprints from LiDAR",
      "description": "Turn class-6 roof points into clean, rectilinear footprint polygons: rasterize, polygonize with rasterio, close gaps, regularize to a dominant orientation, and write a GeoPackage with heights.",
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
          "name": "Building Extraction",
          "item": "https://www.pythonlidar.com/lidar-classification-feature-extraction/building-extraction/"
        },
        {
          "@type": "ListItem",
          "position": 4,
          "name": "Extracting Building Footprints",
          "item": "https://www.pythonlidar.com/lidar-classification-feature-extraction/building-extraction/extracting-building-footprints-from-lidar/"
        }
      ]
    },
    {
      "@type": "HowTo",
      "name": "Extract building footprint polygons from classified LiDAR points",
      "step": [
        {
          "@type": "HowToStep",
          "name": "Read only the roof points",
          "text": "Reading class 6 alone keeps the arrays small and avoids masking later."
        },
        {
          "@type": "HowToStep",
          "name": "Rasterize to a binary mask",
          "text": "Choose a cell about equal to the point spacing, burn a 1 into every cell containing a roof return, and dilate by one cell so that single missing cells do not split a roof."
        },
        {
          "@type": "HowToStep",
          "name": "Label and polygonize",
          "text": "scipy.ndimage.label assigns an integer to each connected region; rasterio.features.shapes turns each labelled region into a polygon in map coordinates using the raster transform. Using labels rather than the binary mask directly means each polygon carries an ID you can join back to the points."
        },
        {
          "@type": "HowToStep",
          "name": "Close gaps and drop slivers",
          "text": "Buffer each polygon out by one cell with join_style=\"mitre\" and back in by the same amount. This fills notches narrower than two cells without rounding corners."
        },
        {
          "@type": "HowToStep",
          "name": "Regularize the outline",
          "text": "Find the polygon's dominant edge direction from the minimum rotated rectangle, rotate so that direction is horizontal, snap near-horizontal and near-vertical edges, then rotate back. Buildings with genuinely non-orthogonal walls should skip this step; flag them by how much area regularization changed."
        },
        {
          "@type": "HowToStep",
          "name": "Attach heights and write",
          "text": "Take eave height as the 10th percentile and ridge height as the 98th percentile of HeightAboveGround of the points inside each polygon, and write to a GeoPackage layer."
        }
      ]
    },
    {
      "@type": "FAQPage",
      "mainEntity": [
        {
          "@type": "Question",
          "name": "Should I use alpha shapes instead of a raster mask?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Alpha shapes can follow curved walls more closely, but they are sensitive to the alpha parameter and to density changes across a roof, and slow on large tiles. The raster route is faster and more predictable; use alpha shapes only for the minority of buildings that regularization flags as non-rectilinear."
          }
        },
        {
          "@type": "Question",
          "name": "What raster cell size gives the best footprints?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "About the average point spacing. Smaller cells leave empty cells inside roofs that closing must repair; larger cells round corners and merge buildings separated by narrow gaps."
          }
        },
        {
          "@type": "Question",
          "name": "How do I get wall lines instead of roof outlines?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "LiDAR sees roofs from above, so the outline is the eave line. Buffer inward by the typical overhang for the building stock, or use wall returns from oblique or mobile scans if they exist."
          }
        },
        {
          "@type": "Question",
          "name": "Can this produce 3D building models?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "It produces the footprint and two heights, which is enough for a block model at LOD1. Roof shapes need plane segmentation per building, covered in estimating roof pitch and aspect from normals."
          }
        }
      ]
    }
  ]
}
</script>

**TL;DR:** Rasterize class-6 points at roughly the point spacing, label connected roof regions, polygonize each with `rasterio.features.shapes`, close gaps with a mitred buffer out-and-in, snap each polygon to its dominant edge orientation, and write the result to a GeoPackage with eave and ridge heights taken from point percentiles.

## Context and Motivation

This guide is part of [Building Extraction from LiDAR](https://www.pythonlidar.com/lidar-classification-feature-extraction/building-extraction/), which covers classifying roofs to class 6. Classification is only half of what a planning department or insurer asks for; the other half is a polygon per building they can load into a GIS, measure and join to an address register. Turning points into polygons is where most footprint projects lose quality — jagged staircase edges, holes where a skylight absorbed the laser, two houses fused through a shared garage — and every one of those defects is visible the moment someone overlays the result on an orthophoto.

The approach here is deliberately raster-first. Alpha shapes and concave hulls work directly on points and look elegant, but they are sensitive to density variations along a roof and slow on thousands of buildings. A binary mask at the point spacing, cleaned with morphology and polygonized, is fast, predictable and easy to regularize afterwards.

<svg viewBox="0 0 740 220" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Four stages from roof points to a regularized footprint polygon" style="width:100%;max-width:740px;display:block;margin:1.6rem auto">
  <title>Points to polygon in four moves</title>
  <desc>Four panels left to right. First, scattered roof points in an L shape. Second, the same area as a grid of filled raster cells with a few empty cells. Third, a jagged polygon traced around the cells. Fourth, a clean L-shaped polygon with straight edges at right angles after gap closing and regularization.</desc>
  <rect x="0" y="0" width="740" height="220" fill="var(--dg-bg)" rx="10"/>
  <text x="95" y="26" text-anchor="middle" font-size="11.5" font-weight="600" fill="var(--dg-text)">1 roof points</text>
  <text x="275" y="26" text-anchor="middle" font-size="11.5" font-weight="600" fill="var(--dg-text)">2 raster mask</text>
  <text x="455" y="26" text-anchor="middle" font-size="11.5" font-weight="600" fill="var(--dg-text)">3 raw polygon</text>
  <text x="640" y="26" text-anchor="middle" font-size="11.5" font-weight="600" fill="var(--dg-text)">4 regularized</text>
  <g fill="var(--dg-a)"><circle cx="50" cy="60" r="2.6"/><circle cx="70" cy="64" r="2.6"/><circle cx="90" cy="58" r="2.6"/><circle cx="56" cy="84" r="2.6"/><circle cx="78" cy="88" r="2.6"/><circle cx="52" cy="110" r="2.6"/><circle cx="74" cy="106" r="2.6"/><circle cx="98" cy="112" r="2.6"/><circle cx="120" cy="108" r="2.6"/><circle cx="140" cy="114" r="2.6"/><circle cx="58" cy="134" r="2.6"/><circle cx="84" cy="138" r="2.6"/><circle cx="110" cy="132" r="2.6"/><circle cx="134" cy="138" r="2.6"/><circle cx="92" cy="80" r="2.6"/></g>
  <g fill="var(--dg-a-soft)" stroke="var(--dg-a)" stroke-width="0.8">
    <rect x="220" y="50" width="20" height="20"/><rect x="240" y="50" width="20" height="20"/><rect x="260" y="50" width="20" height="20"/>
    <rect x="220" y="70" width="20" height="20"/><rect x="260" y="70" width="20" height="20"/>
    <rect x="220" y="90" width="20" height="20"/><rect x="240" y="90" width="20" height="20"/><rect x="260" y="90" width="20" height="20"/><rect x="280" y="90" width="20" height="20"/><rect x="300" y="90" width="20" height="20"/>
    <rect x="220" y="110" width="20" height="20"/><rect x="240" y="110" width="20" height="20"/><rect x="260" y="110" width="20" height="20"/><rect x="280" y="110" width="20" height="20"/><rect x="300" y="110" width="20" height="20"/>
  </g>
  <rect x="240" y="70" width="20" height="20" fill="var(--dg-bg)" stroke="var(--dg-e)" stroke-width="1" stroke-dasharray="3 2"/>
  <path d="M400 50 L460 50 L460 90 L500 90 L500 110 L480 110 L480 130 L400 130 L400 110 L410 110 L410 90 L400 90 Z" fill="var(--dg-c-soft)" stroke="var(--dg-c)" stroke-width="1.4"/>
  <path d="M580 50 L640 50 L640 90 L700 90 L700 130 L580 130 Z" fill="var(--dg-d-soft)" stroke="var(--dg-d)" stroke-width="1.8"/>
  <text x="275" y="160" text-anchor="middle" font-size="10" fill="var(--dg-e)">dashed: gap from a skylight</text>
  <text x="455" y="160" text-anchor="middle" font-size="10" fill="var(--dg-muted)">staircase edges, notches</text>
  <text x="640" y="160" text-anchor="middle" font-size="10" fill="var(--dg-muted)">closed, snapped to 90°</text>
  <text x="370" y="200" text-anchor="middle" font-size="10.5" fill="var(--dg-muted)">each move is cheap; skipping any one of them is what makes footprints look machine-made</text>
</svg>

## Prerequisites and Assumptions

- A LAZ tile where buildings are class 6, produced by the parent workflow or by a vendor.
- PDAL 2.4+ and its Python bindings; rasterio, Shapely 2.x, GeoPandas and NumPy.
- A projected CRS in metres. The regularization step measures angles and lengths in map units.
- Average point spacing known to within a factor of two. At 10 pts/m² spacing is about 0.32 m; at 25 pts/m², 0.2 m.

## Step-by-Step Implementation

### Step 1 — Read only the roof points

Reading class 6 alone keeps the arrays small and avoids masking later.

```python
p = pdal.Pipeline(json.dumps({"pipeline": [
    {"type": "readers.las", "filename": "tile_5840_2710_bldg.laz"},
    {"type": "filters.range", "limits": "Classification[6:6]"},
    {"type": "filters.hag_nn", "count": 2},
]}))
```

`filters.hag_nn` needs ground points to compute heights, so place the range filter after it if your tile has ground in class 2 — the version in the complete example does exactly that.

### Step 2 — Rasterize to a binary mask

Choose a cell about equal to the point spacing, burn a 1 into every cell containing a roof return, and dilate by one cell so that single missing cells do not split a roof.

### Step 3 — Label and polygonize

`scipy.ndimage.label` assigns an integer to each connected region; `rasterio.features.shapes` turns each labelled region into a polygon in map coordinates using the raster transform. Using labels rather than the binary mask directly means each polygon carries an ID you can join back to the points.

### Step 4 — Close gaps and drop slivers

Buffer each polygon out by one cell with `join_style="mitre"` and back in by the same amount. This fills notches narrower than two cells without rounding corners. Drop polygons smaller than your minimum building area.

### Step 5 — Regularize the outline

Find the polygon's dominant edge direction from the minimum rotated rectangle, rotate so that direction is horizontal, snap near-horizontal and near-vertical edges, then rotate back. Buildings with genuinely non-orthogonal walls should skip this step; flag them by how much area regularization changed.

### Step 6 — Attach heights and write

Take eave height as the 10th percentile and ridge height as the 98th percentile of `HeightAboveGround` of the points inside each polygon, and write to a GeoPackage layer.

## Complete Working Example

```python
"""Class-6 points to regularized footprint polygons with heights."""
from __future__ import annotations

import json
import logging
from pathlib import Path

import geopandas as gpd
import numpy as np
import pdal
import rasterio.features
from rasterio.transform import from_origin
from scipy import ndimage as ndi
from shapely import affinity
from shapely.geometry import Polygon, shape

log = logging.getLogger("footprints")


def roof_points(src: Path) -> np.ndarray:
    p = pdal.Pipeline(json.dumps({"pipeline": [
        {"type": "readers.las", "filename": str(src)},
        {"type": "filters.hag_nn", "count": 2},
        {"type": "filters.range", "limits": "Classification[6:6]"},
    ]}))
    p.execute()
    return p.arrays[0]


def regularize(poly: Polygon, snap_deg: float = 12.0) -> Polygon:
    mrr = poly.minimum_rotated_rectangle
    x, y = mrr.exterior.coords.xy
    edges = [(x[i + 1] - x[i], y[i + 1] - y[i]) for i in range(2)]
    dx, dy = max(edges, key=lambda e: e[0] ** 2 + e[1] ** 2)
    angle = np.degrees(np.arctan2(dy, dx))
    rot = affinity.rotate(poly, -angle, origin="centroid")
    coords = np.asarray(rot.exterior.coords)
    snapped = [coords[0]]
    for pt in coords[1:]:
        prev = snapped[-1]
        seg = np.degrees(np.arctan2(pt[1] - prev[1], pt[0] - prev[0])) % 180
        if min(seg, 180 - seg) < snap_deg:          # near horizontal
            pt = np.array([pt[0], prev[1]])
        elif abs(seg - 90) < snap_deg:              # near vertical
            pt = np.array([prev[0], pt[1]])
        snapped.append(pt)
    out = Polygon(snapped).buffer(0)
    return affinity.rotate(out, angle, origin=poly.centroid) if out.is_valid else poly


def footprints(src: Path, dst: Path, crs: str = "EPSG:6347",
               cell: float = 0.5, min_area: float = 20.0) -> gpd.GeoDataFrame:
    pts = roof_points(src)
    x0, y1 = np.floor(pts["X"].min()) - cell, np.ceil(pts["Y"].max()) + cell
    cols = int(np.ceil((pts["X"].max() - x0) / cell)) + 2
    rows = int(np.ceil((y1 - pts["Y"].min()) / cell)) + 2
    mask = np.zeros((rows, cols), dtype=bool)
    mask[((y1 - pts["Y"]) / cell).astype(int), ((pts["X"] - x0) / cell).astype(int)] = True
    mask = ndi.binary_closing(mask, iterations=1)
    labels, n = ndi.label(mask)
    log.info("%d connected roof regions", n)

    transform = from_origin(x0, y1, cell, cell)
    col_of = ((pts["X"] - x0) / cell).astype(int)
    row_of = ((y1 - pts["Y"]) / cell).astype(int)
    point_label = labels[row_of, col_of]

    records = []
    for geom, lab in rasterio.features.shapes(labels.astype(np.int32), mask=labels > 0,
                                              transform=transform):
        poly = shape(geom).buffer(cell, join_style="mitre").buffer(-cell, join_style="mitre")
        if poly.is_empty or poly.area < min_area:
            continue
        reg = regularize(poly)
        hag = pts["HeightAboveGround"][point_label == int(lab)]
        records.append({
            "region": int(lab),
            "area_m2": round(reg.area, 1),
            "reg_change": round(abs(reg.area - poly.area) / poly.area, 3),
            "eave_m": round(float(np.percentile(hag, 10)), 2),
            "ridge_m": round(float(np.percentile(hag, 98)), 2),
            "geometry": reg,
        })
    gdf = gpd.GeoDataFrame(records, crs=crs)
    gdf.to_file(dst, layer="footprints", driver="GPKG")
    log.info("%s: %d footprints", dst.name, len(gdf))
    return gdf


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
    footprints(Path("tile_5840_2710_bldg.laz"), Path("tile_5840_2710_footprints.gpkg"))
```

## Key Parameter Table

| Parameter | Type | Default | Tuning guidance |
|---|---|---|---|
| `cell` | float, m | 0.5 | About the point spacing; finer leaves holes, coarser rounds corners |
| closing iterations | int | 1 | Raise to 2 on sparse data; higher starts merging neighbours |
| `min_area` | float, m² | 20 | Match the smallest structure the client counts as a building |
| `snap_deg` | float, ° | 12 | Edges within this of 0° or 90° are snapped; lower preserves angled walls |
| eave percentile | int | 10 | Lower picks up gutters and wall returns; higher reads the roof plane |
| ridge percentile | int | 98 | Below 100 so chimneys and antennas do not set the height |

<svg viewBox="0 0 740 200" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="How the snapping tolerance treats edges at different angles" style="width:100%;max-width:740px;display:block;margin:1.6rem auto">
  <title>What the snapping tolerance decides</title>
  <desc>A semicircular angle gauge from 0 to 180 degrees. Wedges of plus or minus 12 degrees around 0, 90 and 180 degrees are shaded as snap zones. An edge at 7 degrees falls inside a zone and is snapped to horizontal. An edge at 45 degrees, like a bay window, falls outside every zone and is kept as drawn.</desc>
  <rect x="0" y="0" width="740" height="200" fill="var(--dg-bg)" rx="10"/>
  <path d="M170 170 A140 140 0 0 1 450 170" fill="none" stroke="var(--dg-line)" stroke-width="1.3"/>
  <path d="M310 170 L450 170 A140 140 0 0 0 446.9 140.9 Z" fill="var(--dg-d-soft)" stroke="var(--dg-d)" stroke-width="1"/>
  <path d="M310 170 L339.1 33.1 A140 140 0 0 0 280.9 33.1 Z" fill="var(--dg-d-soft)" stroke="var(--dg-d)" stroke-width="1"/>
  <path d="M310 170 L170 170 A140 140 0 0 1 173.1 140.9 Z" fill="var(--dg-d-soft)" stroke="var(--dg-d)" stroke-width="1"/>
  <line x1="310" y1="170" x2="449" y2="152.9" stroke="var(--dg-a)" stroke-width="2.2"/>
  <line x1="310" y1="170" x2="409" y2="71" stroke="var(--dg-c)" stroke-width="2.2"/>
  <text x="458" y="150" font-size="10.5" fill="var(--dg-a)">7°: snapped</text>
  <text x="416" y="66" font-size="10.5" fill="var(--dg-c)">45°: kept</text>
  <text x="458" y="176" font-size="10" fill="var(--dg-muted)">0°</text>
  <text x="310" y="22" text-anchor="middle" font-size="10" fill="var(--dg-muted)">90°</text>
  <text x="140" y="176" font-size="10" fill="var(--dg-muted)">180°</text>
  <text x="530" y="100" font-size="10.5" fill="var(--dg-text)">shaded wedges: ±12° snap zones</text>
</svg>

## Verification

Check the output in three ways before handing it over.

1. **Count against classified regions.** The number of polygons should equal the number of labelled regions above the area threshold. A large difference means the buffer step is erasing thin buildings.
2. **Regularization change.** The `reg_change` column records how much area regularization moved. Values above 0.05 are worth a look; values above 0.15 usually indicate a curved or angled building that should keep its raw outline.
3. **Visual overlay.** Load the GeoPackage over an orthophoto or a [hillshaded DSM](https://www.pythonlidar.com/ground-filtering-dtm-dsm-generation/hillshade-slope-aspect/exporting-hillshade-from-a-lidar-dtm/) and inspect twenty buildings from different parts of the tile.

```python
gdf = gpd.read_file("tile_5840_2710_footprints.gpkg", layer="footprints")
assert gdf.is_valid.all(), "invalid geometries in output"
assert (gdf.ridge_m >= gdf.eave_m).all(), "ridge below eave"
print(gdf.reg_change.describe())
```

## Gotchas and Edge Cases

**LiDAR footprints are roof outlines, not wall lines.** Eaves overhang walls by 0.3 to 1 m. Cadastral footprints are usually wall lines, so a LiDAR layer will look systematically larger. If the client needs wall lines, buffer inward by a project-specific overhang and say so in the metadata.

**Shared walls fuse neighbours.** Semi-detached and terraced houses are one connected roof. Split them with a parcel layer, or with height discontinuities along the ridge line, rather than by eroding the mask, which damages every other building.

**Courtyards become filled.** Morphological closing fills holes smaller than the structuring element but leaves larger courtyards. Check `poly.interiors` if the client needs inner rings preserved, and never close with more than two iterations.

<svg viewBox="190 0 450 190" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Roof outline from LiDAR compared with the wall line of a cadastral footprint" style="width:100%;max-width:740px;display:block;margin:1.6rem auto">
  <title>Roof line versus wall line</title>
  <desc>A cross-section of a house showing the walls and a pitched roof whose eaves extend beyond the walls on both sides. Below, two horizontal bars compare widths: the LiDAR footprint spans from eave to eave, while the cadastral footprint spans only from wall to wall, about 0.6 metres narrower on each side.</desc>
  <rect x="190" y="0" width="450" height="190" fill="var(--dg-bg)" rx="10"/>
  <path d="M250 120 L250 70 L490 70 L490 120" fill="none" stroke="var(--dg-line)" stroke-width="2"/>
  <path d="M220 74 L370 22 L520 74" fill="none" stroke="var(--dg-a)" stroke-width="3"/>
  <line x1="220" y1="140" x2="520" y2="140" stroke="var(--dg-a)" stroke-width="8"/>
  <line x1="250" y1="160" x2="490" y2="160" stroke="var(--dg-c)" stroke-width="8"/>
  <text x="530" y="144" font-size="10.5" fill="var(--dg-text)">LiDAR roof outline</text>
  <text x="500" y="164" font-size="10.5" fill="var(--dg-text)">cadastral wall line</text>
  <text x="235" y="182" text-anchor="middle" font-size="10" fill="var(--dg-muted)">overhang</text>
  <text x="505" y="182" text-anchor="middle" font-size="10" fill="var(--dg-muted)">overhang</text>
</svg>

**Tile edges cut buildings.** A building on a tile boundary yields two partial polygons. Run on [buffered tiles](https://www.pythonlidar.com/batch-automation-cloud-integration/tile-indexing-and-merging/buffered-tiling-to-avoid-edge-artefacts/) and keep a polygon only if its centroid falls inside the tile's nominal extent.

## Frequently Asked Questions

**Should I use alpha shapes instead of a raster mask?**

Alpha shapes can follow curved walls more closely, but they are sensitive to the alpha parameter and to density changes across a roof, and slow on large tiles. The raster route is faster and more predictable; use alpha shapes only for the minority of buildings that regularization flags as non-rectilinear.

**What raster cell size gives the best footprints?**

About the average point spacing. Smaller cells leave empty cells inside roofs that closing must repair; larger cells round corners and merge buildings separated by narrow gaps.

**How do I get wall lines instead of roof outlines?**

LiDAR sees roofs from above, so the outline is the eave line. Buffer inward by the typical overhang for the building stock, or use wall returns from oblique or mobile scans if they exist.

**Can this produce 3D building models?**

It produces the footprint and two heights, which is enough for a block model at LOD1. Roof shapes need plane segmentation per building, covered in estimating roof pitch and aspect from normals.

## Related

- [Building Extraction from LiDAR](https://www.pythonlidar.com/lidar-classification-feature-extraction/building-extraction/) — the classification workflow that produces class 6
- [Detecting Planar Roofs with Covariance Features](https://www.pythonlidar.com/lidar-classification-feature-extraction/building-extraction/detecting-planar-roofs-with-covariance-features/) — improving the roof classification itself
- [Estimating Roof Pitch and Aspect from Normals](https://www.pythonlidar.com/lidar-classification-feature-extraction/building-extraction/estimating-roof-pitch-and-aspect-from-normals/) — per-plane geometry inside each footprint
- [Extracting Objects from Segment Labels](https://www.pythonlidar.com/lidar-classification-feature-extraction/point-cloud-segmentation/extracting-objects-from-segment-labels/) — the same object-table pattern for any class
- [LiDAR Classification and Feature Extraction](https://www.pythonlidar.com/lidar-classification-feature-extraction/) — the section overview
