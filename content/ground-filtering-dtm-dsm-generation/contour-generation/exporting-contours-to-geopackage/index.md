---
title: "Exporting Contours to GeoPackage"
description: "Deliver LiDAR contours as a clean, well-documented GeoPackage: 3D line geometry with Z, elevation and index attributes, removing spurious loops, merging lines split at tile edges, layer metadata, a spatial index, and a DXF copy for CAD users."
slug: "exporting-contours-to-geopackage"
type: "howto"
breadcrumb: "Contours to GeoPackage"
datePublished: "2026-09-18"
dateModified: "2026-09-18"
---

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Article",
      "headline": "Exporting Contours to GeoPackage",
      "description": "Deliver LiDAR contours as a clean, well-documented GeoPackage: 3D line geometry with Z, elevation and index attributes, removing spurious loops, merging lines split at tile edges, layer metadata, a spatial index, and a DXF copy for CAD users.",
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
          "name": "Contour Generation",
          "item": "https://www.pythonlidar.com/ground-filtering-dtm-dsm-generation/contour-generation/"
        },
        {
          "@type": "ListItem",
          "position": 4,
          "name": "Contours to GeoPackage",
          "item": "https://www.pythonlidar.com/ground-filtering-dtm-dsm-generation/contour-generation/exporting-contours-to-geopackage/"
        }
      ]
    },
    {
      "@type": "HowTo",
      "name": "Export cleaned contours to a GeoPackage for delivery",
      "step": [
        {
          "@type": "HowToStep",
          "name": "Normalize elevations",
          "text": "Round elev to the interval's precision, which removes floating-point noise and makes grouping by elevation reliable."
        },
        {
          "@type": "HowToStep",
          "name": "Remove short closed loops",
          "text": "Drop rings shorter than a threshold (for example 40 m at 0.5 m interval); they are micro-relief, not landform."
        },
        {
          "@type": "HowToStep",
          "name": "Merge pieces",
          "text": "Group by elevation and merge touching segments with shapely.line_merge so each contour becomes as few features as possible."
        },
        {
          "@type": "HowToStep",
          "name": "Attribute and add Z",
          "text": "Add index (every fifth level), type (\"index\" or \"intermediate\"), and set each vertex's Z to the elevation for 3D-aware consumers."
        },
        {
          "@type": "HowToStep",
          "name": "Write with metadata",
          "text": "Write the GeoPackage layer with a clear name, set the layer description to the interval, datum and source DTM, and optionally export DXF."
        }
      ]
    },
    {
      "@type": "FAQPage",
      "mainEntity": [
        {
          "@type": "Question",
          "name": "Why deliver contours in GeoPackage?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "It is a single, open, well-supported file that stores the CRS properly, supports long field names and 3D geometry, and carries a spatial index. Almost every GIS reads it, and GDAL converts it to other formats when needed."
          }
        },
        {
          "@type": "Question",
          "name": "Should contour lines have Z values?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "It helps. Setting each vertex's Z to the contour elevation lets CAD and 3D tools use the lines directly, and it costs little. Keep the elevation attribute as well for GIS styling and labelling."
          }
        },
        {
          "@type": "Question",
          "name": "How do I merge contour pieces split at tile edges?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Group lines by elevation and merge touching segments with Shapely's line_merge after a union. This joins pieces that share end points; for pieces that do not meet, contour a mosaic instead of individual tiles."
          }
        },
        {
          "@type": "Question",
          "name": "How do I export contours for CAD?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Write the same GeoDataFrame with GDAL's DXF driver, using a Layer field to separate index and intermediate contours and 3D line geometry to carry elevation."
          }
        }
      ]
    }
  ]
}
</script>

**TL;DR:** Load raw contours into GeoPandas, drop closed loops shorter than a threshold, merge line pieces with the same elevation that touch (`shapely.line_merge` per elevation), add `elev`, `index` and `type` attributes, give each line a Z coordinate equal to its elevation, and write a GeoPackage layer with the project CRS and a descriptive layer name. Export the same frame to DXF for CAD users.

## Context and Motivation

This guide is part of [Contour Generation from LiDAR DTMs](https://www.pythonlidar.com/ground-filtering-dtm-dsm-generation/contour-generation/). Raw contour output is a technical intermediate: lines broken at every block boundary, thousands of trivial loops, floating-point elevations like 212.49999999, no distinction between index and intermediate contours, no Z coordinates. A client opening that in GIS or CAD sees clutter and wonders about quality. A delivery-ready contour layer needs a small, repeatable cleaning step, sensible attributes and self-describing metadata. GeoPackage is the natural container: a single file, open standard, CRS stored properly, readable by every GIS and by GDAL-based converters to anything else.

<svg viewBox="0 40 740 150" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Cleaning steps from raw contours to a delivery layer" style="width:100%;max-width:740px;display:block;margin:1.6rem auto">
  <title>From raw output to delivery</title>
  <desc>Four steps left to right. Raw contours with 184,000 features, many tiny loops and split lines. After removing short loops, 61,000 features. After merging pieces of the same elevation, 18,500 features. After attributing elevation, index flag and Z, the delivery layer in a GeoPackage.</desc>
  <defs><marker id="gp-arw" markerWidth="9" markerHeight="7" refX="9" refY="3.5" orient="auto"><path d="M0,0 L0,7 L9,3.5 z" fill="var(--dg-line)"/></marker></defs>
  <rect x="0" y="40" width="740" height="150" fill="var(--dg-bg)" rx="10"/>
  <g font-size="10.5" fill="var(--dg-text)">
    <rect x="16" y="60" width="150" height="70" rx="8" fill="var(--dg-surface)" stroke="var(--dg-line)"/><text text-anchor="middle" x="91" y="90">raw</text><text text-anchor="middle" x="91" y="110">184,000 features</text>
    <rect x="200" y="60" width="150" height="70" rx="8" fill="var(--dg-a-soft)" stroke="var(--dg-a)"/><text text-anchor="middle" x="275" y="90">drop short loops</text><text text-anchor="middle" x="275" y="110">61,000</text>
    <rect x="384" y="60" width="150" height="70" rx="8" fill="var(--dg-b-soft)" stroke="var(--dg-b)"/><text text-anchor="middle" x="459" y="90">merge pieces</text><text text-anchor="middle" x="459" y="110">18,500</text>
    <rect x="568" y="60" width="156" height="70" rx="8" fill="var(--dg-d-soft)" stroke="var(--dg-d)"/><text text-anchor="middle" x="646" y="90">attribute + Z</text><text text-anchor="middle" x="646" y="110">GeoPackage</text>
  </g>
  <g stroke="var(--dg-line)" stroke-width="1.3"><line x1="166" y1="95" x2="196" y2="95" marker-end="url(#gp-arw)"/><line x1="350" y1="95" x2="380" y2="95" marker-end="url(#gp-arw)"/><line x1="534" y1="95" x2="564" y2="95" marker-end="url(#gp-arw)"/></g>
  <text x="370" y="170" text-anchor="middle" font-size="10.5" fill="var(--dg-muted)">illustrative counts for a 400 km² mosaic at 0.5 m interval</text>
</svg>

## Prerequisites and Assumptions

- Raw contours with an elevation attribute, from [generating contours with gdal_contour](https://www.pythonlidar.com/ground-filtering-dtm-dsm-generation/contour-generation/generating-contours-from-a-dtm-with-gdal-contour/) or the topic's Python route.
- GeoPandas 0.14+ with Shapely 2.x, and GDAL's GPKG and DXF drivers.
- The contour interval, index spacing and the client's naming conventions.

## Step-by-Step Implementation

### Step 1 — Normalize elevations

Round `elev` to the interval's precision, which removes floating-point noise and makes grouping by elevation reliable.

### Step 2 — Remove short closed loops

Drop rings shorter than a threshold (for example 40 m at 0.5 m interval); they are micro-relief, not landform.

### Step 3 — Merge pieces

Group by elevation and merge touching segments with `shapely.line_merge` so each contour becomes as few features as possible.

### Step 4 — Attribute and add Z

Add `index` (every fifth level), `type` ("index" or "intermediate"), and set each vertex's Z to the elevation for 3D-aware consumers.

### Step 5 — Write with metadata

Write the GeoPackage layer with a clear name, set the layer description to the interval, datum and source DTM, and optionally export DXF.

## Complete Working Example

```python
"""Clean raw contours and write a delivery GeoPackage plus a DXF copy."""
from __future__ import annotations

from pathlib import Path

import geopandas as gpd
import numpy as np
import shapely
from shapely.geometry import LineString

INTERVAL = 0.5
INDEX_EVERY = 5
MIN_LOOP_M = 40.0


def to_3d(line: LineString, z: float) -> LineString:
    xy = np.asarray(line.coords)[:, :2]
    return LineString(np.column_stack([xy, np.full(len(xy), z)]))


def clean(raw: gpd.GeoDataFrame) -> gpd.GeoDataFrame:
    g = raw.explode(index_parts=False).reset_index(drop=True)
    g["elev"] = (np.round(g["elev"] / INTERVAL) * INTERVAL).round(3)
    rings = shapely.is_ring(g.geometry.values)
    g = g[~(rings & (g.length < MIN_LOOP_M))]
    merged = []
    for elev, grp in g.groupby("elev"):
        m = shapely.line_merge(shapely.union_all(grp.geometry.values))
        parts = list(m.geoms) if hasattr(m, "geoms") else [m]
        merged += [{"elev": elev, "geometry": p} for p in parts]
    out = gpd.GeoDataFrame(merged, crs=raw.crs)
    step = np.round(out["elev"] / INTERVAL).astype(int)
    out["index"] = (step % INDEX_EVERY == 0).astype(int)
    out["type"] = np.where(out["index"] == 1, "index", "intermediate")
    out["geometry"] = [to_3d(geom, z) for geom, z in zip(out.geometry, out["elev"])]
    return out[["elev", "index", "type", "geometry"]]


def deliver(raw_gpkg: Path, out_gpkg: Path, dxf: Path | None = None) -> gpd.GeoDataFrame:
    raw = gpd.read_file(raw_gpkg, layer="contours")
    final = clean(raw)
    layer = f"contours_{int(INTERVAL * 100):03d}cm"
    final.to_file(out_gpkg, layer=layer, driver="GPKG",
                  layer_options={"DESCRIPTION": f"{INTERVAL} m contours from 1 m LiDAR DTM; "
                                                f"elev in metres, NAVD88 (GEOID18); index every "
                                                f"{INDEX_EVERY * INTERVAL} m",
                                 "SPATIAL_INDEX": "YES"})
    if dxf is not None:
        final.rename(columns={"type": "Layer"})[["Layer", "elev", "geometry"]].to_file(dxf, driver="DXF")
    print(f"{len(raw):,} raw -> {len(final):,} delivered features in layer {layer}")
    return final


if __name__ == "__main__":
    deliver(Path("out/contours_raw.gpkg"), Path("delivery/contours.gpkg"), Path("delivery/contours.dxf"))
```

The DXF export uses the `Layer` field to put index and intermediate contours on separate CAD layers — the convention CAD users expect. The DXF driver writes only geometry and a few standard fields, which is why elevation is carried as Z.

<svg viewBox="0 0 740 200" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Attribute table of the delivered contour layer" style="width:100%;max-width:740px;display:block;margin:1.6rem auto">
  <title>What each delivered feature carries</title>
  <desc>A small attribute table with four columns — elev, index, type and geometry — and three example rows: 215.0 index, 215.5 intermediate and 216.0 intermediate, each with a LineString Z geometry whose Z equals the elevation.</desc>
  <rect x="0" y="0" width="740" height="200" fill="var(--dg-bg)" rx="10"/>
  <g font-size="10.5" fill="var(--dg-text)">
    <rect x="40" y="24" width="660" height="32" fill="var(--dg-surface-2)"/><text x="60" y="45">elev</text><text x="180" y="45">index</text><text x="290" y="45">type</text><text x="450" y="45">geometry</text>
    <rect x="40" y="60" width="660" height="32" fill="var(--dg-surface)"/><text x="60" y="81">215.0</text><text x="180" y="81">1</text><text x="290" y="81">index</text><text x="450" y="81">LineString Z (… 215.0)</text>
    <rect x="40" y="96" width="660" height="32" fill="var(--dg-surface-2)"/><text x="60" y="117">215.5</text><text x="180" y="117">0</text><text x="290" y="117">intermediate</text><text x="450" y="117">LineString Z (… 215.5)</text>
    <rect x="40" y="132" width="660" height="32" fill="var(--dg-surface)"/><text x="60" y="153">216.0</text><text x="180" y="153">0</text><text x="290" y="153">intermediate</text><text x="450" y="153">LineString Z (… 216.0)</text>
  </g>
  <text x="40" y="188" font-size="10.5" fill="var(--dg-muted)">layer description records interval, units, vertical datum and geoid model</text>
</svg>

## Key Parameter Table

| Setting | Value | Purpose |
|---|---|---|
| `INTERVAL` | 0.5 m | Rounding and index computation |
| `INDEX_EVERY` | 5 | Index contour spacing (every 2.5 m here) |
| `MIN_LOOP_M` | 40 m | Shortest closed contour kept |
| layer name | `contours_050cm` | Self-describing interval |
| `DESCRIPTION` | free text | Units, datum, geoid, source |
| `SPATIAL_INDEX` | YES | Fast display and queries |
| DXF `Layer` | index / intermediate | CAD layer separation |

## Verification

- **Feature counts** before and after each step, as printed, so reviewers see what cleaning removed.
- **Elevations on the series** and no crossings between different elevations.
- **Open in two consumers.** Load the GeoPackage in a GIS and the DXF in a CAD viewer; confirm CRS, Z values and layers appear as intended.

```python
final = gpd.read_file("delivery/contours.gpkg", layer="contours_050cm")
assert final.has_z.all()
assert np.allclose((final.elev / 0.5) - np.round(final.elev / 0.5), 0)
print(final.groupby("type").size())
```

## Gotchas and Edge Cases

**Merging too aggressively.** `line_merge` joins only lines that share end points; it will not join pieces separated by a gap. That is correct — gaps usually mean NoData — but check that tile-edge breaks from separate contouring runs actually share vertices; if not, contour the mosaic instead.

**Loop threshold on steep terrain.** Real hilltops and depressions can be small closed contours. On steep ground, a 40 m threshold may remove genuine summits; lower it in hilly areas or keep loops that contain a local maximum in the DTM.

**Z and 2D consumers.** Some older tools reject 3D geometries. Keep a 2D version (`shapely.force_2d`) available if the client's software is old.

<svg viewBox="50 26 610 144" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Spurious loops on flat ground versus a real small summit" style="width:100%;max-width:740px;display:block;margin:1.6rem auto">
  <title>Not every small loop is noise</title>
  <desc>Left: a flat field with several tiny closed contours from micro-relief, removed by the length threshold. Right: a small rocky knoll with two nested closed contours around a real summit, kept because the DTM shows a local maximum inside them.</desc>
  <rect x="50" y="26" width="610" height="144" fill="var(--dg-bg)" rx="10"/>
  <g fill="none" stroke="var(--dg-e)" stroke-width="1.4"><ellipse cx="90" cy="80" rx="12" ry="7"/><ellipse cx="160" cy="100" rx="9" ry="6"/><ellipse cx="230" cy="70" rx="11" ry="6"/><ellipse cx="290" cy="110" rx="8" ry="5"/></g>
  <text x="190" y="150" text-anchor="middle" font-size="10.5" fill="var(--dg-e)">flat field: micro-relief loops, removed</text>
  <g fill="none" stroke="var(--dg-a)" stroke-width="1.6"><ellipse cx="560" cy="85" rx="60" ry="38"/><ellipse cx="560" cy="85" rx="30" ry="18"/></g>
  <circle cx="560" cy="85" r="3" fill="var(--dg-a)"/>
  <text x="560" y="150" text-anchor="middle" font-size="10.5" fill="var(--dg-d)">knoll with a real summit: kept</text>
</svg>

**Attribute names.** Shapefile limits field names to ten characters; GeoPackage does not. If the client also wants Shapefiles, keep names short from the start.

## Frequently Asked Questions

**Why deliver contours in GeoPackage?**

It is a single, open, well-supported file that stores the CRS properly, supports long field names and 3D geometry, and carries a spatial index. Almost every GIS reads it, and GDAL converts it to other formats when needed.

**Should contour lines have Z values?**

It helps. Setting each vertex's Z to the contour elevation lets CAD and 3D tools use the lines directly, and it costs little. Keep the elevation attribute as well for GIS styling and labelling.

**How do I merge contour pieces split at tile edges?**

Group lines by elevation and merge touching segments with Shapely's line_merge after a union. This joins pieces that share end points; for pieces that do not meet, contour a mosaic instead of individual tiles.

**How do I export contours for CAD?**

Write the same GeoDataFrame with GDAL's DXF driver, using a Layer field to separate index and intermediate contours and 3D line geometry to carry elevation.

## Related

- [Contour Generation from LiDAR DTMs](https://www.pythonlidar.com/ground-filtering-dtm-dsm-generation/contour-generation/) — the full workflow
- [Generating Contours from a DTM with gdal_contour](https://www.pythonlidar.com/ground-filtering-dtm-dsm-generation/contour-generation/generating-contours-from-a-dtm-with-gdal-contour/) — producing the raw lines
- [Smoothing a LiDAR DTM Before Contouring](https://www.pythonlidar.com/ground-filtering-dtm-dsm-generation/contour-generation/smoothing-a-lidar-dtm-before-contouring/) — fewer loops to remove
- [Extracting Building Footprints from LiDAR](https://www.pythonlidar.com/lidar-classification-feature-extraction/building-extraction/extracting-building-footprints-from-lidar/) — another vector deliverable from LiDAR
- [Building a Tile Index with pdal tindex](https://www.pythonlidar.com/batch-automation-cloud-integration/tile-indexing-and-merging/building-a-tile-index-with-pdal-tindex/) — GeoPackage for coverage layers
