---
title: "Cropping a Point Cloud to a Polygon Boundary"
description: "Clip LiDAR to a project boundary, parcel or corridor with PDAL filters.crop: loading polygons from a GeoPackage into WKT, matching CRSs with a_srs, cropping many polygons at once, outside mode, and faster alternatives for COPC sources."
slug: "cropping-a-point-cloud-to-a-polygon-boundary"
type: "howto"
breadcrumb: "Cropping to a Polygon"
datePublished: "2026-09-18"
dateModified: "2026-09-18"
---

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Article",
      "headline": "Cropping a Point Cloud to a Polygon Boundary",
      "description": "Clip LiDAR to a project boundary, parcel or corridor with PDAL filters.crop: loading polygons from a GeoPackage into WKT, matching CRSs with a_srs, cropping many polygons at once, outside mode, and faster alternatives for COPC sources.",
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
          "name": "PDAL Pipeline Architecture and Execution",
          "item": "https://www.pythonlidar.com/pdal-pipeline-architecture-execution/"
        },
        {
          "@type": "ListItem",
          "position": 3,
          "name": "Pipeline Filtering Logic",
          "item": "https://www.pythonlidar.com/pdal-pipeline-architecture-execution/pipeline-filtering-logic/"
        },
        {
          "@type": "ListItem",
          "position": 4,
          "name": "Cropping to a Polygon",
          "item": "https://www.pythonlidar.com/pdal-pipeline-architecture-execution/pipeline-filtering-logic/cropping-a-point-cloud-to-a-polygon-boundary/"
        }
      ]
    },
    {
      "@type": "HowTo",
      "name": "Crop a point cloud to a polygon boundary with PDAL",
      "step": [
        {
          "@type": "HowToStep",
          "name": "Load and validate the boundary",
          "text": "Read the layer, make geometries valid, and dissolve to one geometry if you want a single output."
        },
        {
          "@type": "HowToStep",
          "name": "Reproject the polygon, not the points",
          "text": "Transforming a polygon is instant; transforming millions of points to match a polygon's CRS is not. Reproject the boundary to the point cloud's CRS with to_crs."
        },
        {
          "@type": "HowToStep",
          "name": "Simplify if the boundary is very detailed",
          "text": "A coastline with a hundred thousand vertices makes every point test slow. Simplify to a tolerance well below the point spacing \u2014 0.1 m is usually invisible in results."
        },
        {
          "@type": "HowToStep",
          "name": "Crop",
          "text": "Pass the WKT to filters.crop's polygon option with a_srs set to the same CRS as the points, so PDAL does not guess."
        },
        {
          "@type": "HowToStep",
          "name": "Crop many polygons in one pass",
          "text": "A list of polygons produces one output view per polygon; a writer with # in its filename writes each to its own file."
        }
      ]
    },
    {
      "@type": "FAQPage",
      "mainEntity": [
        {
          "@type": "Question",
          "name": "How do I crop a LAS file to a shapefile polygon with PDAL?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Read the shapefile with GeoPandas, reproject it to the LAS file's CRS, and pass the polygon's WKT to filters.crop with the polygon option and a matching a_srs. Write the result with writers.las."
          }
        },
        {
          "@type": "Question",
          "name": "Why is my cropped output empty?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Almost always a CRS mismatch: the polygon's coordinates are in a different system from the points. Reproject the polygon to the point cloud's CRS and set a_srs explicitly."
          }
        },
        {
          "@type": "Question",
          "name": "Can I crop to many polygons at once?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Yes. Pass a list of WKT polygons to filters.crop. Each polygon produces its own output view, and a writer with a # in its filename writes each view to a separate file."
          }
        },
        {
          "@type": "Question",
          "name": "How do I keep points outside the polygon instead?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Set outside to true on filters.crop. The filter then keeps everything except the points inside the polygon."
          }
        }
      ]
    }
  ]
}
</script>

**TL;DR:** Read the boundary with GeoPandas, reproject it to the point cloud's CRS, pass its WKT to `filters.crop` as `"polygon"` with a matching `"a_srs"`, and write the result. For many polygons in one pass, pass a list of WKT strings; each produces its own output view. For COPC inputs, give the polygon to `readers.copc` instead so only intersecting nodes are fetched.

## Context and Motivation

This guide is part of [Pipeline Filtering Logic](https://www.pythonlidar.com/pdal-pipeline-architecture-execution/pipeline-filtering-logic/). Clipping to a boundary is one of the most frequent LiDAR operations: deliver only the client's project area, extract a corridor around a road or pipeline, cut out a parcel for a site survey, or remove a neighbouring jurisdiction's data before publishing. PDAL's `filters.crop` does it in a streaming, per-point test, so it works on files of any size. What goes wrong is almost never the crop itself; it is the polygon — in the wrong CRS, invalid, multipart when a single part was expected, or so detailed that the test is slow.

<svg viewBox="0 0 740 220" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="A tile with a project boundary polygon and the cropped result" style="width:100%;max-width:740px;display:block;margin:1.6rem auto">
  <title>Inside the boundary, and nothing else</title>
  <desc>Left: a square tile of scattered points with an irregular project boundary polygon crossing it. Right: the same tile after cropping, with only the points inside the polygon remaining. A note says the per-point test streams, so file size does not matter.</desc>
  <rect x="0" y="0" width="740" height="220" fill="var(--dg-bg)" rx="10"/>
  <rect x="40" y="30" width="260" height="170" fill="var(--dg-surface)" stroke="var(--dg-line)" stroke-width="1.2"/>
  <g fill="var(--dg-line-soft)"><circle cx="60" cy="50" r="2.5"/><circle cx="100" cy="70" r="2.5"/><circle cx="140" cy="45" r="2.5"/><circle cx="180" cy="80" r="2.5"/><circle cx="220" cy="55" r="2.5"/><circle cx="270" cy="75" r="2.5"/><circle cx="70" cy="120" r="2.5"/><circle cx="120" cy="140" r="2.5"/><circle cx="170" cy="120" r="2.5"/><circle cx="210" cy="150" r="2.5"/><circle cx="260" cy="130" r="2.5"/><circle cx="90" cy="180" r="2.5"/><circle cx="150" cy="175" r="2.5"/><circle cx="230" cy="185" r="2.5"/><circle cx="280" cy="170" r="2.5"/><circle cx="130" cy="100" r="2.5"/><circle cx="200" cy="105" r="2.5"/></g>
  <path d="M90 60 L240 50 L280 140 L200 190 L80 160 Z" fill="none" stroke="var(--dg-a)" stroke-width="2"/>
  <rect x="440" y="30" width="260" height="170" fill="var(--dg-surface)" stroke="var(--dg-line)" stroke-width="1.2"/>
  <path d="M490 60 L640 50 L680 140 L600 190 L480 160 Z" fill="var(--dg-a-soft)" stroke="var(--dg-a)" stroke-width="2"/>
  <g fill="var(--dg-a)"><circle cx="580" cy="80" r="2.5"/><circle cx="620" cy="55" r="2.5"/><circle cx="570" cy="120" r="2.5"/><circle cx="610" cy="150" r="2.5"/><circle cx="660" cy="130" r="2.5"/><circle cx="520" cy="140" r="2.5"/><circle cx="530" cy="100" r="2.5"/><circle cx="600" cy="105" r="2.5"/></g>
  <text x="370" y="120" text-anchor="middle" font-size="18" fill="var(--dg-muted)">→</text>
  <text x="170" y="20" text-anchor="middle" font-size="10.5" fill="var(--dg-muted)">tile + boundary</text>
  <text x="570" y="20" text-anchor="middle" font-size="10.5" fill="var(--dg-muted)">filters.crop output</text>
</svg>

## Prerequisites and Assumptions

- PDAL 2.x; GeoPandas and Shapely 2.x for reading and preparing polygons.
- A boundary layer (GeoPackage, Shapefile, GeoJSON) and the point cloud's CRS, known from `pdal info --metadata`.
- Valid polygons. Self-intersections make point-in-polygon tests undefined; fix them with `shapely.make_valid` first.

## Step-by-Step Implementation

### Step 1 — Load and validate the boundary

Read the layer, make geometries valid, and dissolve to one geometry if you want a single output.

### Step 2 — Reproject the polygon, not the points

Transforming a polygon is instant; transforming millions of points to match a polygon's CRS is not. Reproject the boundary to the point cloud's CRS with `to_crs`.

### Step 3 — Simplify if the boundary is very detailed

A coastline with a hundred thousand vertices makes every point test slow. Simplify to a tolerance well below the point spacing — 0.1 m is usually invisible in results.

### Step 4 — Crop

Pass the WKT to `filters.crop`'s `polygon` option with `a_srs` set to the same CRS as the points, so PDAL does not guess.

### Step 5 — Crop many polygons in one pass

A list of polygons produces one output view per polygon; a writer with `#` in its filename writes each to its own file.

## Complete Working Example

```python
"""Crop a LAZ tile to each parcel in a GeoPackage, one output per parcel."""
from __future__ import annotations

import json
from pathlib import Path

import geopandas as gpd
import pdal
import shapely

SRC = Path("tiles/t_0431.laz")
CLOUD_CRS = "EPSG:6347"


def parcels_wkt(gpkg: Path, layer: str, simplify_m: float = 0.1) -> list[tuple[str, str]]:
    gdf = gpd.read_file(gpkg, layer=layer).to_crs(CLOUD_CRS)
    gdf["geometry"] = shapely.make_valid(gdf.geometry.values).simplify(simplify_m)
    info = pdal.Pipeline(json.dumps({"pipeline": [str(SRC)]})).quickinfo["readers.las"]["bounds"]
    tile = shapely.box(info["minx"], info["miny"], info["maxx"], info["maxy"])
    gdf = gdf[gdf.intersects(tile)]
    return [(str(r.parcel_id), r.geometry.wkt) for r in gdf.itertuples()]


def crop(parcels: list[tuple[str, str]], out_dir: Path) -> int:
    out_dir.mkdir(parents=True, exist_ok=True)
    total = 0
    for pid, wkt in parcels:
        spec = {"pipeline": [
            str(SRC),
            {"type": "filters.crop", "polygon": wkt, "a_srs": CLOUD_CRS},
            {"type": "writers.las", "filename": str(out_dir / f"parcel_{pid}.laz"),
             "minor_version": 4, "dataformat_id": 6, "forward": "all"},
        ]}
        n = pdal.Pipeline(json.dumps(spec)).execute()
        print(f"parcel {pid}: {n:,} points")
        total += n
    return total


if __name__ == "__main__":
    crop(parcels_wkt(Path("parcels.gpkg"), "parcels"), Path("out/parcels"))
```

When the parcels are many and small, one pipeline with a list of polygons avoids reading the tile once per parcel:

```json
{
  "pipeline": [
    "tiles/t_0431.laz",
    { "type": "filters.crop", "a_srs": "EPSG:6347",
      "polygon": ["POLYGON ((431120 4471200, 431180 4471200, 431180 4471260, 431120 4471260, 431120 4471200))",
                  "POLYGON ((431300 4471420, 431370 4471420, 431370 4471490, 431300 4471490, 431300 4471420))"] },
    { "type": "writers.las", "filename": "out/parcels/parcel_#.laz" }
  ]
}
```

<svg viewBox="0 0 740 200" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Crop time against polygon vertex count before and after simplification" style="width:100%;max-width:740px;display:block;margin:1.6rem auto">
  <title>Vertices cost time</title>
  <desc>Bars of crop time for a 40 million point tile. A 120,000-vertex coastline polygon takes 96 seconds. Simplified at 0.1 metres to 9,000 vertices it takes 11 seconds. Simplified at 1 metre to 1,200 vertices it takes 5 seconds, with results differing only within a metre of the shore.</desc>
  <rect x="0" y="0" width="740" height="200" fill="var(--dg-bg)" rx="10"/>
  <text x="200" y="50" text-anchor="end" font-size="11" fill="var(--dg-text)">120,000 vertices</text>
  <rect x="210" y="34" width="480" height="24" fill="var(--dg-e-soft)" stroke="var(--dg-e)" stroke-width="1.1"/>
  <text x="680" y="51" text-anchor="end" font-size="10.5" fill="var(--dg-text)">96 s</text>
  <text x="200" y="100" text-anchor="end" font-size="11" fill="var(--dg-text)">9,000 (0.1 m)</text>
  <rect x="210" y="84" width="55" height="24" fill="var(--dg-d-soft)" stroke="var(--dg-d)" stroke-width="1.1"/>
  <text x="273" y="101" font-size="10.5" fill="var(--dg-muted)">11 s</text>
  <text x="200" y="150" text-anchor="end" font-size="11" fill="var(--dg-text)">1,200 (1 m)</text>
  <rect x="210" y="134" width="25" height="24" fill="var(--dg-d-soft)" stroke="var(--dg-d)" stroke-width="1.1"/>
  <text x="243" y="151" font-size="10.5" fill="var(--dg-muted)">5 s</text>
  <text x="210" y="186" font-size="10.5" fill="var(--dg-muted)">illustrative 40 M point tile; simplification tolerance in brackets</text>
</svg>

## Key Parameter Table

| Option | Type | Example | Notes |
|---|---|---|---|
| `polygon` | WKT or list of WKT | `"POLYGON ((...))"` | Each list entry yields a separate output view |
| `bounds` | string | `"([xmin, xmax], [ymin, ymax])"` | Faster for rectangles |
| `a_srs` | CRS | `"EPSG:6347"` | CRS of the polygon or bounds; set it explicitly |
| `outside` | bool | `false` | `true` keeps points outside the polygon instead |
| `point` + `distance` | WKT + float | `"POINT (431200 4471300)"`, `50` | Circular crop around a point |
| writer `#` | filename | `parcel_#.laz` | One file per output view |

## Verification

- **Every point inside.** Test output points against the polygon with Shapely on a sample: all should be contained or on the boundary.
- **No points lost inside.** Crop with `outside: true` too; the two outputs' counts should sum to the input count.
- **Bounds shrink.** The header bounds of the output should fit within the polygon's bounds.

```python
import numpy as np
from shapely import points, contains_xy

p = pdal.Pipeline(json.dumps({"pipeline": ["out/parcels/parcel_1042.laz"]})); p.execute()
a = p.arrays[0]
poly = shapely.from_wkt(dict(parcels_wkt(Path("parcels.gpkg"), "parcels"))["1042"])
inside = contains_xy(poly.buffer(0.01), a["X"], a["Y"])
assert inside.all(), f"{(~inside).sum()} points outside the parcel"
```

## Gotchas and Edge Cases

**CRS mismatch produces empty output.** A polygon in EPSG:4326 degrees tested against UTM metres selects nothing, and PDAL may not warn. Always reproject the polygon and set `a_srs`.

**Multipart and holes.** `MULTIPOLYGON` and polygons with interior rings work; points inside holes are excluded. Dissolving a layer can create holes where parcels do not touch — check that is intended.

**COPC and EPT sources.** Cropping after a full read of a remote COPC file downloads everything. Put the polygon on `readers.copc` (`"polygon": wkt`) so only intersecting octree nodes are fetched; see [querying a COPC file by bounds and resolution](https://www.pythonlidar.com/point-cloud-data-standards-fundamentals/copc-and-cloud-native-formats/querying-a-copc-file-by-bounds-and-resolution/).

<svg viewBox="0 0 740 180" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Crop at the reader versus after a full read for a remote COPC file" style="width:100%;max-width:740px;display:block;margin:1.6rem auto">
  <title>Crop early for remote sources</title>
  <desc>Two flows for a 6 gigabyte remote COPC file. Cropping after the reader downloads all 6 gigabytes and then discards most of it. Passing the polygon to readers.copc fetches only the octree nodes intersecting the polygon, about 180 megabytes.</desc>
  <defs><marker id="crp-arw" markerWidth="9" markerHeight="7" refX="9" refY="3.5" orient="auto"><path d="M0,0 L0,7 L9,3.5 z" fill="var(--dg-line)"/></marker></defs>
  <rect x="0" y="0" width="740" height="180" fill="var(--dg-bg)" rx="10"/>
  <rect x="20" y="24" width="190" height="40" rx="7" fill="var(--dg-surface)" stroke="var(--dg-line)" stroke-width="1.2"/>
  <text x="115" y="48" text-anchor="middle" font-size="10.5" fill="var(--dg-text)">readers.copc (no polygon)</text>
  <rect x="280" y="24" width="160" height="40" rx="7" fill="var(--dg-e-soft)" stroke="var(--dg-e)" stroke-width="1.2"/>
  <text x="360" y="48" text-anchor="middle" font-size="10.5" fill="var(--dg-text)">download 6 GB</text>
  <rect x="510" y="24" width="200" height="40" rx="7" fill="var(--dg-surface)" stroke="var(--dg-line)" stroke-width="1.2"/>
  <text x="610" y="48" text-anchor="middle" font-size="10.5" fill="var(--dg-text)">filters.crop keeps 3 %</text>
  <line x1="210" y1="44" x2="276" y2="44" stroke="var(--dg-line)" stroke-width="1.3" marker-end="url(#crp-arw)"/>
  <line x1="440" y1="44" x2="506" y2="44" stroke="var(--dg-line)" stroke-width="1.3" marker-end="url(#crp-arw)"/>
  <rect x="20" y="104" width="190" height="40" rx="7" fill="var(--dg-surface)" stroke="var(--dg-line)" stroke-width="1.2"/>
  <text x="115" y="128" text-anchor="middle" font-size="10.5" fill="var(--dg-text)">readers.copc + polygon</text>
  <rect x="280" y="104" width="160" height="40" rx="7" fill="var(--dg-d-soft)" stroke="var(--dg-d)" stroke-width="1.2"/>
  <text x="360" y="128" text-anchor="middle" font-size="10.5" fill="var(--dg-text)">fetch 180 MB</text>
  <line x1="210" y1="124" x2="276" y2="124" stroke="var(--dg-line)" stroke-width="1.3" marker-end="url(#crp-arw)"/>
  <text x="510" y="128" font-size="10.5" fill="var(--dg-muted)">only intersecting nodes</text>
</svg>

**Boundary points.** Points exactly on the polygon edge may fall either way. When adjacent parcels must not share or lose points, crop with one polygon layer that tiles the area exactly and check that per-parcel counts sum to the total.

## Frequently Asked Questions

**How do I crop a LAS file to a shapefile polygon with PDAL?**

Read the shapefile with GeoPandas, reproject it to the LAS file's CRS, and pass the polygon's WKT to filters.crop with the polygon option and a matching a_srs. Write the result with writers.las.

**Why is my cropped output empty?**

Almost always a CRS mismatch: the polygon's coordinates are in a different system from the points. Reproject the polygon to the point cloud's CRS and set a_srs explicitly.

**Can I crop to many polygons at once?**

Yes. Pass a list of WKT polygons to filters.crop. Each polygon produces its own output view, and a writer with a # in its filename writes each view to a separate file.

**How do I keep points outside the polygon instead?**

Set outside to true on filters.crop. The filter then keeps everything except the points inside the polygon.

## Related

- [Pipeline Filtering Logic](https://www.pythonlidar.com/pdal-pipeline-architecture-execution/pipeline-filtering-logic/) — filtering in general
- [Filtering Points with filters.expression](https://www.pythonlidar.com/pdal-pipeline-architecture-execution/pipeline-filtering-logic/filtering-points-with-filters-expression/) — attribute filters
- [Querying a COPC File by Bounds and Resolution](https://www.pythonlidar.com/point-cloud-data-standards-fundamentals/copc-and-cloud-native-formats/querying-a-copc-file-by-bounds-and-resolution/) — spatial queries on cloud-native data
- [Buffered Tiling to Avoid Edge Artefacts](https://www.pythonlidar.com/batch-automation-cloud-integration/tile-indexing-and-merging/buffered-tiling-to-avoid-edge-artefacts/) — cropping back after buffered processing
- [Fixing CRS Mismatches in Point Clouds](https://www.pythonlidar.com/point-cloud-data-standards-fundamentals/coordinate-reference-systems/fixing-crs-mismatches-in-point-clouds/) — the usual cause of empty crops
