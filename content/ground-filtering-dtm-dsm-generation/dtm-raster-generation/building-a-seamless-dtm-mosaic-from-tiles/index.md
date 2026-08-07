---
title: "Building a Seamless DTM Mosaic from Tiles"
description: "Why every DTM seam comes from an edge cell with half a neighbourhood, how to buffer and clip so it does not, and the shared-grid settings that let the tiles join at all."
slug: "building-a-seamless-dtm-mosaic-from-tiles"
type: "howto"
breadcrumb: "Building a Seamless DTM Mosaic"
datePublished: "2026-08-07"
dateModified: "2026-08-07"
---

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Article",
      "headline": "Building a Seamless DTM Mosaic from Tiles",
      "description": "Why every DTM seam comes from an edge cell with half a neighbourhood, how to buffer and clip so it does not, and the shared-grid settings that let the tiles join at all.",
      "datePublished": "2026-08-07",
      "dateModified": "2026-08-07",
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
          "name": "Ground Filtering and DTM/DSM Generation with PDAL",
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
          "name": "Building a Seamless DTM Mosaic",
          "item": "https://www.pythonlidar.com/ground-filtering-dtm-dsm-generation/dtm-raster-generation/building-a-seamless-dtm-mosaic-from-tiles/"
        }
      ]
    },
    {
      "@type": "HowTo",
      "name": "Build a seamless DTM mosaic from buffered tiles",
      "step": [
        {
          "@type": "HowToStep",
          "name": "Choose a buffer at least the search radius",
          "text": "Add the focal window in cells as well so edge cells have full neighbourhoods."
        },
        {
          "@type": "HowToStep",
          "name": "Read the tile and its neighbours",
          "text": "Merge the neighbouring tiles and crop to the buffered extent, not the nominal one."
        },
        {
          "@type": "HowToStep",
          "name": "Rasterize on an explicit shared grid",
          "text": "Set origin, width and height so every tile lands on the same cell alignment."
        },
        {
          "@type": "HowToStep",
          "name": "Clip back to the nominal extent",
          "text": "Trim the buffer away with gdal_translate before the tile joins the mosaic."
        },
        {
          "@type": "HowToStep",
          "name": "Join with gdalbuildvrt",
          "text": "Build a virtual mosaic, then translate to a single COG for anything that leaves your storage."
        }
      ]
    },
    {
      "@type": "FAQPage",
      "mainEntity": [
        {
          "@type": "Question",
          "name": "Why do seams appear in a tiled DTM at all?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Because rasterization is a neighbourhood operation and a tile boundary truncates the neighbourhood. An edge cell searches within its radius and finds points on one side only, so its estimate is biased toward them; the neighbouring tile has the mirror-image bias, and the two disagree by centimetres all the way down the boundary."
          }
        },
        {
          "@type": "Question",
          "name": "How wide should the buffer be?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "At least the search radius used by the writer, plus the focal window size in ground units if gap filling is enabled. For a one-metre DTM with a 1.4 metre radius and a four-cell window, ten metres is comfortable and costs almost nothing."
          }
        },
        {
          "@type": "Question",
          "name": "Why set origin, width and height explicitly?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "So every tile lands on the same grid. Two rasters whose origins differ by half a cell cannot be joined without resampling, and resampling reintroduces exactly the smoothing the buffer existed to prevent."
          }
        },
        {
          "@type": "Question",
          "name": "Is a VRT good enough to deliver?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "No. A VRT references its component tiles by path, so it breaks the moment the files move or the recipient does not have them. Use it as the working mosaic and translate to a single cloud-optimized GeoTIFF for delivery."
          }
        }
      ]
    }
  ]
}
</script>

**TL;DR:** Buffer each tile by at least the search radius before rasterizing, clip the result back to the nominal tile extent afterwards, then join with `gdalbuildvrt`. Every seam in a DTM mosaic comes from an edge cell that saw neighbours on one side only.

## Context and Motivation

This guide is part of [DTM Raster Generation](https://www.pythonlidar.com/ground-filtering-dtm-dsm-generation/dtm-raster-generation/). The single-tile recipe is straightforward; the seams appear when you put the tiles next to one another, and they appear because rasterization is a neighbourhood operation and a tile boundary is a place where the neighbourhood stops.

Consider a cell on the eastern edge of a tile. The interpolator searches within `radius` of the cell centre and finds points to the west, north and south — but nothing to the east, because those points are in the next file. The estimate is computed from half a neighbourhood. The neighbouring tile's western edge cell has the mirror-image problem, and the two disagree by a few centimetres. Repeated down a boundary, that becomes a visible line in a hillshade, and it becomes a step in any product derived from it. Nothing about the interpolation is wrong; the input was incomplete.

<svg viewBox="0 0 720 264" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="An edge cell's search neighbourhood truncated by a tile boundary, and the same cell with a buffer" style="width:100%;max-width:720px;display:block;margin:1.6rem auto">
  <title>The half-neighbourhood that makes a seam</title>
  <desc>Left: a cell on a tile edge with its search circle drawn. Half the circle falls outside the tile, so the interpolator sees only the points on its own side and the estimate is biased toward them. Right: the same cell after the tile has been buffered with points from its neighbour, so the search circle is fully populated and the estimate matches the one computed from the other side.</desc>
  <rect x="0" y="0" width="720" height="264" fill="var(--dg-bg)" rx="10"/>
  <text x="180" y="38" text-anchor="middle" font-size="12" font-weight="600" fill="var(--dg-e)">no buffer</text>
  <text x="540" y="38" text-anchor="middle" font-size="12" font-weight="600" fill="var(--dg-d)">buffered by the search radius</text>
  <rect x="40" y="52" width="200" height="160" fill="var(--dg-b)" fill-opacity="0.12" stroke="var(--dg-b)" stroke-width="1.4"/>
  <line x1="240" y1="46" x2="240" y2="218" stroke="var(--dg-e)" stroke-width="2.4"/>
  <text x="248" y="62" font-size="10" fill="var(--dg-e)">tile boundary</text>
  <circle cx="240" cy="132" r="46" fill="none" stroke="var(--dg-a)" stroke-width="1.8" stroke-dasharray="5 4"/>
  <circle cx="240" cy="132" r="3.5" fill="var(--dg-c)"/>
  <circle cx="206" cy="110" r="3" fill="var(--dg-d)"/>
  <circle cx="214" cy="150" r="3" fill="var(--dg-d)"/>
  <circle cx="228" cy="122" r="3" fill="var(--dg-d)"/>
  <circle cx="222" cy="164" r="3" fill="var(--dg-d)"/>
  <text x="140" y="238" text-anchor="middle" font-size="10.5" fill="var(--dg-e)">4 points, all on one side</text>
  <rect x="400" y="52" width="200" height="160" fill="var(--dg-b)" fill-opacity="0.12" stroke="var(--dg-b)" stroke-width="1.4"/>
  <rect x="600" y="52" width="52" height="160" fill="var(--dg-d)" fill-opacity="0.16" stroke="var(--dg-d)" stroke-width="1.2" stroke-dasharray="4 3"/>
  <text x="626" y="238" text-anchor="middle" font-size="10" fill="var(--dg-d)">buffer</text>
  <line x1="600" y1="46" x2="600" y2="218" stroke="var(--dg-line-soft)" stroke-width="1.6" stroke-dasharray="4 4"/>
  <circle cx="600" cy="132" r="46" fill="none" stroke="var(--dg-a)" stroke-width="1.8" stroke-dasharray="5 4"/>
  <circle cx="600" cy="132" r="3.5" fill="var(--dg-c)"/>
  <circle cx="566" cy="110" r="3" fill="var(--dg-d)"/>
  <circle cx="574" cy="150" r="3" fill="var(--dg-d)"/>
  <circle cx="588" cy="122" r="3" fill="var(--dg-d)"/>
  <circle cx="582" cy="164" r="3" fill="var(--dg-d)"/>
  <circle cx="618" cy="116" r="3" fill="var(--dg-d)"/>
  <circle cx="628" cy="146" r="3" fill="var(--dg-d)"/>
  <circle cx="612" cy="160" r="3" fill="var(--dg-d)"/>
  <text x="480" y="238" text-anchor="middle" font-size="10.5" fill="var(--dg-d)">7 points, a full neighbourhood</text>
  <text x="40" y="258" font-size="10.5" fill="var(--dg-muted)">the buffer is read and then discarded — it exists only so the edge cells have neighbours on both sides</text>
</svg>

## Prerequisites and Assumptions

| Requirement | Detail |
|---|---|
| PDAL | 2.4+ with `filters.crop` and `writers.gdal` |
| GDAL | `gdalbuildvrt`, and `gdal_translate` if a single file is wanted |
| A tile index | nominal extents, from [building a tile index](https://www.pythonlidar.com/batch-automation-cloud-integration/tile-indexing-and-merging/building-a-tile-index-with-pdal-tindex/) |
| Overlapping source access | each worker must be able to read its neighbours |
| A consistent grid | every tile rasterized on the same origin and cell size |

The grid row is easy to overlook and fatal. Two tiles rasterized on origins that differ by half a cell produce rasters that cannot be joined without resampling, and resampling reintroduces exactly the smoothing the buffer was there to avoid.

## Step-by-Step Implementation

### Step 1 — Choose the buffer

At least the `radius` used by `writers.gdal`, plus the `window_size` in cells if focal filling is enabled. For a 1 m DTM with a 1.4 m radius and a window of 4, a 10 m buffer is comfortable and cheap.

### Step 2 — Read the tile and its neighbours

```json
{"pipeline": [
  "tile_0431.laz", "tile_0430.laz", "tile_0432.laz",
  "tile_0331.laz", "tile_0531.laz",
  {"type": "filters.merge"},
  {"type": "filters.crop", "bounds": "([511990, 513010], [4782990, 4784010])"}
]}
```

The crop here is the *buffered* extent, not the nominal one.

### Step 3 — Rasterize on the shared grid

```json
{"type": "writers.gdal", "filename": "dtm_0431_buffered.tif",
 "output_type": "idw", "resolution": 1.0, "radius": 1.4,
 "window_size": 4, "nodata": -9999,
 "origin_x": 511990, "origin_y": 4782990, "width": 1020, "height": 1020}
```

Setting the origin and size explicitly is what keeps every tile on the same grid.

### Step 4 — Clip back to the nominal extent

```bash
gdal_translate -projwin 512000 4784000 513000 4783000 \
  dtm_0431_buffered.tif dtm_0431.tif
```

### Step 5 — Join

```bash
gdalbuildvrt dtm_mosaic.vrt tiles/dtm_*.tif
gdal_translate -of COG dtm_mosaic.vrt dtm_mosaic.tif
```

## Complete Working Example

```python
"""Rasterize one tile with a buffer, clip it back, and report the seam error."""
from __future__ import annotations

import json
import subprocess
from pathlib import Path

import numpy as np
import pdal
import rasterio


def rasterize_buffered(tile: Path, neighbours: list[Path], out: Path,
                       bounds: tuple[float, float, float, float],
                       buffer_m: float = 10.0, resolution: float = 1.0) -> None:
    xmin, ymin, xmax, ymax = bounds
    bx0, by0 = xmin - buffer_m, ymin - buffer_m
    bx1, by1 = xmax + buffer_m, ymax + buffer_m

    stages: list = [{"type": "readers.las", "filename": str(p)}
                    for p in [tile, *neighbours]]
    stages += [
        {"type": "filters.merge"},
        {"type": "filters.crop", "bounds": f"([{bx0}, {bx1}], [{by0}, {by1}])"},
        {"type": "filters.range", "limits": "Classification[2:2]"},
        {"type": "writers.gdal", "filename": str(out),
         "output_type": "idw", "resolution": resolution, "radius": 1.4,
         "window_size": 4, "nodata": -9999, "gdaldriver": "GTiff",
         "origin_x": bx0, "origin_y": by0,
         "width": int((bx1 - bx0) / resolution),
         "height": int((by1 - by0) / resolution)},
    ]
    pdal.Pipeline(json.dumps({"pipeline": stages})).execute()


def clip(src: Path, dst: Path, bounds: tuple[float, float, float, float]) -> None:
    xmin, ymin, xmax, ymax = bounds
    subprocess.run(["gdal_translate", "-q", "-projwin",
                    str(xmin), str(ymax), str(xmax), str(ymin),
                    str(src), str(dst)], check=True)


def seam_error(left: Path, right: Path) -> float:
    """Mean absolute difference along the shared column of two adjacent tiles."""
    with rasterio.open(left) as a, rasterio.open(right) as b:
        col_a = a.read(1)[:, -1].astype("float64")
        col_b = b.read(1)[:, 0].astype("float64")
    good = (col_a > -9998) & (col_b > -9998)
    if not good.any():
        return float("nan")
    return float(np.abs(col_a[good] - col_b[good]).mean())


if __name__ == "__main__":
    bounds = (512000.0, 4783000.0, 513000.0, 4784000.0)
    rasterize_buffered(Path("tile_0431.laz"),
                       [Path("tile_0430.laz"), Path("tile_0432.laz")],
                       Path("dtm_0431_buffered.tif"), bounds)
    clip(Path("dtm_0431_buffered.tif"), Path("dtm_0431.tif"), bounds)
    print(json.dumps({"seam_mae_m": round(seam_error(Path("dtm_0430.tif"),
                                                     Path("dtm_0431.tif")), 4)}, indent=2))
```

<svg viewBox="0 0 720 246" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Two neighbouring rasters on a shared grid and on grids offset by half a cell" style="width:100%;max-width:720px;display:block;margin:1.6rem auto">
  <title>Half a cell is the difference between joining and resampling</title>
  <desc>Two adjacent rasters drawn twice. On a shared grid the cell edges line up exactly and the tiles can be joined without touching a pixel. Offset by half a cell they cannot, and joining requires resampling — which smooths across the join and reintroduces exactly the artefact the buffer was there to prevent.</desc>
  <rect x="0" y="0" width="720" height="246" fill="var(--dg-bg)" rx="10"/>
  <text x="20" y="38" font-size="11.5" font-weight="600" fill="var(--dg-d)">shared origin</text>
  <rect x="180" y="26" width="30" height="30" fill="var(--dg-d)" fill-opacity="0.18" stroke="var(--dg-d)" stroke-width="1"/>
  <rect x="210" y="26" width="30" height="30" fill="var(--dg-d)" fill-opacity="0.18" stroke="var(--dg-d)" stroke-width="1"/>
  <rect x="240" y="26" width="30" height="30" fill="var(--dg-d)" fill-opacity="0.18" stroke="var(--dg-d)" stroke-width="1"/>
  <rect x="300" y="26" width="30" height="30" fill="var(--dg-b)" fill-opacity="0.18" stroke="var(--dg-b)" stroke-width="1"/>
  <rect x="330" y="26" width="30" height="30" fill="var(--dg-b)" fill-opacity="0.18" stroke="var(--dg-b)" stroke-width="1"/>
  <rect x="360" y="26" width="30" height="30" fill="var(--dg-b)" fill-opacity="0.18" stroke="var(--dg-b)" stroke-width="1"/>
  <line x1="285" y1="20" x2="285" y2="62" stroke="var(--dg-line-soft)" stroke-width="1.2" stroke-dasharray="3 3"/>
  <text x="420" y="46" font-size="10.5" fill="var(--dg-d)">cell edges align — gdalbuildvrt joins them untouched</text>
  <text x="20" y="118" font-size="11.5" font-weight="600" fill="var(--dg-e)">origins offset by 0.5 m</text>
  <rect x="180" y="106" width="30" height="30" fill="var(--dg-d)" fill-opacity="0.18" stroke="var(--dg-d)" stroke-width="1"/>
  <rect x="210" y="106" width="30" height="30" fill="var(--dg-d)" fill-opacity="0.18" stroke="var(--dg-d)" stroke-width="1"/>
  <rect x="240" y="106" width="30" height="30" fill="var(--dg-d)" fill-opacity="0.18" stroke="var(--dg-d)" stroke-width="1"/>
  <rect x="315" y="106" width="30" height="30" fill="var(--dg-e)" fill-opacity="0.22" stroke="var(--dg-e)" stroke-width="1"/>
  <rect x="345" y="106" width="30" height="30" fill="var(--dg-e)" fill-opacity="0.22" stroke="var(--dg-e)" stroke-width="1"/>
  <rect x="375" y="106" width="30" height="30" fill="var(--dg-e)" fill-opacity="0.22" stroke="var(--dg-e)" stroke-width="1"/>
  <line x1="285" y1="100" x2="285" y2="142" stroke="var(--dg-line-soft)" stroke-width="1.2" stroke-dasharray="3 3"/>
  <text x="420" y="126" font-size="10.5" fill="var(--dg-e)">nothing lines up — the join needs resampling</text>
  <rect x="20" y="166" width="680" height="36" rx="7" fill="var(--dg-surface)" stroke="var(--dg-line-soft)" stroke-width="1.2"/>
  <text x="360" y="190" text-anchor="middle" font-size="11" fill="var(--dg-text)">setting origin_x, origin_y, width and height explicitly is what guarantees the top case</text>
  <text x="20" y="228" font-size="10.5" fill="var(--dg-muted)">GDAL will happily infer a slightly different extent per tile if you let it, and the offset is invisible until the mosaic</text>
</svg>

## Key Parameter Table

| Setting | Value | Why |
|---|---|---|
| buffer | ≥ radius + window×cell | The edge cells need neighbours on both sides |
| `origin_x` / `origin_y` | explicit | Keeps every tile on one grid; half-cell offsets cannot be joined |
| `width` / `height` | explicit | Prevents GDAL from inferring a slightly different extent per tile |
| clip extent | the nominal tile | The buffer must not reach the mosaic |
| join | `gdalbuildvrt` | Virtual, instant, and lossless |

## Verification

**Seam error is at noise level.** The function above should report a mean absolute difference of a millimetre or two along a shared edge. Centimetres means the buffer is too small; a step of decimetres means it is missing.

**The mosaic has no NoData stripes.** A line of NoData down a boundary means the clip extents do not meet.

**Cell alignment is exact.** `gdalinfo` on two neighbours should report origins differing by exactly the tile width.

<svg viewBox="0 0 720 246" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Which pipeline stage contributes what to a residual seam" style="width:100%;max-width:720px;display:block;margin:1.6rem auto">
  <title>Where a residual seam is coming from</title>
  <desc>Four contributions to seam error, measured by fixing each stage in turn. An unbuffered rasterizer contributes eight centimetres. An unbuffered ground classifier contributes six. A half-cell grid offset contributes four. Independent void filling on each tile contributes one. Fixing them in that order is the fastest route to a seamless mosaic.</desc>
  <rect x="0" y="0" width="720" height="246" fill="var(--dg-bg)" rx="10"/>
  <text x="240" y="72" text-anchor="end" font-size="11" fill="var(--dg-text)">unbuffered rasterizer</text>
  <rect x="250" y="52" width="272" height="30" rx="4" fill="var(--dg-e-soft)" stroke="var(--dg-e)" stroke-width="1.2"/>
  <text x="530" y="72" font-size="10.5" fill="var(--dg-muted)">8 cm — buffer by the search radius</text>
  <text x="240" y="114" text-anchor="end" font-size="11" fill="var(--dg-text)">unbuffered classifier</text>
  <rect x="250" y="94" width="204" height="30" rx="4" fill="var(--dg-e-soft)" stroke="var(--dg-e)" stroke-width="1.2"/>
  <text x="462" y="114" font-size="10.5" fill="var(--dg-muted)">6 cm — buffer by the filter window</text>
  <text x="240" y="156" text-anchor="end" font-size="11" fill="var(--dg-text)">half-cell grid offset</text>
  <rect x="250" y="136" width="136" height="30" rx="4" fill="var(--dg-c-soft)" stroke="var(--dg-c)" stroke-width="1.2"/>
  <text x="394" y="156" font-size="10.5" fill="var(--dg-muted)">4 cm — set the origin explicitly</text>
  <text x="240" y="198" text-anchor="end" font-size="11" fill="var(--dg-text)">per-tile void filling</text>
  <rect x="250" y="178" width="34" height="30" rx="4" fill="var(--dg-d-soft)" stroke="var(--dg-d)" stroke-width="1.2"/>
  <text x="292" y="198" font-size="10.5" fill="var(--dg-muted)">1 cm — fill after the mosaic</text>
  <text x="250" y="36" font-size="10.5" fill="var(--dg-muted)">mean absolute difference along a shared edge, by cause</text>
  <text x="60" y="234" font-size="10.5" fill="var(--dg-muted)">fix them top-down; the first two account for most of what anyone can see in a hillshade</text>
</svg>

## Gotchas and Edge Cases

**Buffering the crop but not the read.** The buffer only helps if the neighbouring tiles are actually read. Cropping a single tile to a larger extent adds empty space, not neighbours.

**Classification inside the buffer must match.** If each tile is classified independently, the ground surface can disagree in the overlap. Classify before tiling where possible, or buffer the classification step too — the argument made in [splitting a blocking pipeline](https://www.pythonlidar.com/pdal-pipeline-architecture-execution/streaming-mode-execution/splitting-a-blocking-pipeline-into-two-passes/).

**A VRT is not a deliverable.** It references its tiles by path. Translate to a single COG for anything that leaves your storage.

## Frequently Asked Questions

**Why do seams appear in a tiled DTM at all?**

Because rasterization is a neighbourhood operation and a tile boundary truncates the neighbourhood. An edge cell searches within its radius and finds points on one side only, so its estimate is biased toward them; the neighbouring tile has the mirror-image bias, and the two disagree by centimetres all the way down the boundary.

**How wide should the buffer be?**

At least the search radius used by the writer, plus the focal window size in ground units if gap filling is enabled. For a one-metre DTM with a 1.4 metre radius and a four-cell window, ten metres is comfortable and costs almost nothing.

**Why set origin, width and height explicitly?**

So every tile lands on the same grid. Two rasters whose origins differ by half a cell cannot be joined without resampling, and resampling reintroduces exactly the smoothing the buffer existed to prevent.

**Is a VRT good enough to deliver?**

No. A VRT references its component tiles by path, so it breaks the moment the files move or the recipient does not have them. Use it as the working mosaic and translate to a single cloud-optimized GeoTIFF for delivery.

---

## Related

- [DTM Raster Generation](https://www.pythonlidar.com/ground-filtering-dtm-dsm-generation/dtm-raster-generation/) — the parent guide to rasterizing ground returns
- [Generating a DTM GeoTIFF with writers.gdal](https://www.pythonlidar.com/ground-filtering-dtm-dsm-generation/dtm-raster-generation/generating-a-dtm-geotiff-with-writers-gdal/) — the single-tile recipe this extends
- [IDW vs Mean Interpolation for DTM Gaps](https://www.pythonlidar.com/ground-filtering-dtm-dsm-generation/dtm-raster-generation/idw-vs-mean-interpolation-for-dtm-gaps/) — the reducer whose radius sets the buffer width
- [Building a Tile Index with pdal tindex](https://www.pythonlidar.com/batch-automation-cloud-integration/tile-indexing-and-merging/building-a-tile-index-with-pdal-tindex/) — finding which neighbours a tile needs
- [Ground Filtering and DTM/DSM Generation with PDAL](https://www.pythonlidar.com/ground-filtering-dtm-dsm-generation/) — the section overview
