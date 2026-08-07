---
title: "Buffered Tiling to Avoid Edge Artefacts"
description: "Read the tile plus its neighbours, process the buffered extent, write only the nominal one — the general pattern behind every seamless tiled LiDAR product, and how wide the buffer has to be."
slug: "buffered-tiling-to-avoid-edge-artefacts"
type: "howto"
breadcrumb: "Buffered Tiling"
datePublished: "2026-08-07"
dateModified: "2026-08-07"
---

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Article",
      "headline": "Buffered Tiling to Avoid Edge Artefacts",
      "description": "Read the tile plus its neighbours, process the buffered extent, write only the nominal one \u2014 the general pattern behind every seamless tiled LiDAR product, and how wide the buffer has to be.",
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
          "name": "Batch Automation and Cloud Integration for PDAL",
          "item": "https://www.pythonlidar.com/batch-automation-cloud-integration/"
        },
        {
          "@type": "ListItem",
          "position": 3,
          "name": "Tile Indexing and Merging",
          "item": "https://www.pythonlidar.com/batch-automation-cloud-integration/tile-indexing-and-merging/"
        },
        {
          "@type": "ListItem",
          "position": 4,
          "name": "Buffered Tiling",
          "item": "https://www.pythonlidar.com/batch-automation-cloud-integration/tile-indexing-and-merging/buffered-tiling-to-avoid-edge-artefacts/"
        }
      ]
    },
    {
      "@type": "HowTo",
      "name": "Process a LiDAR tile with a neighbourhood buffer",
      "step": [
        {
          "@type": "HowToStep",
          "name": "Size the buffer from the pipeline",
          "text": "Take the largest neighbourhood reach in the chain \u2014 usually the ground filter window \u2014 and add a margin."
        },
        {
          "@type": "HowToStep",
          "name": "Query the index for neighbours",
          "text": "Buffer the target polygon and intersect it against the layer to get the files to read."
        },
        {
          "@type": "HowToStep",
          "name": "Read and merge tile plus neighbours",
          "text": "Feed every relevant file into filters.merge and crop to the buffered extent."
        },
        {
          "@type": "HowToStep",
          "name": "Process as normal",
          "text": "Classification, filtering and rasterization now see full neighbourhoods at the tile edge."
        },
        {
          "@type": "HowToStep",
          "name": "Crop back to the nominal extent before writing",
          "text": "Without this the buffer is written twice, once by each adjacent tile."
        }
      ]
    },
    {
      "@type": "FAQPage",
      "mainEntity": [
        {
          "@type": "Question",
          "name": "How wide should the buffer be?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "At least the largest neighbourhood reach in the pipeline \u2014 the rasterizer search radius, the ground filter window, the outlier neighbour distance, whichever is greatest. A 33 metre SMRF window makes 40 metres a safe choice, which costs about sixteen percent more points read on a one kilometre tile."
          }
        },
        {
          "@type": "Question",
          "name": "What happens if I forget the final crop?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Every point in the buffer is written twice, once by the tile that owns it and once by its neighbour. The merged campaign then has duplicate returns in every overlap strip, which inflates density metrics and produces doubled returns in anything computed downstream."
          }
        },
        {
          "@type": "Question",
          "name": "Is a wider buffer ever harmful?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Only to your read budget. Beyond the largest neighbourhood in the pipeline the seam error stops improving while the extra points keep costing time, so erring generous is the cheap mistake and erring narrow is the expensive one."
          }
        },
        {
          "@type": "Question",
          "name": "What about tiles at the edge of the campaign?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "They genuinely have no neighbours on one side, and that is not a defect. The seam test should exclude the outer boundary, and any coverage report should distinguish \"no data collected\" from \"processing lost it\"."
          }
        }
      ]
    }
  ]
}
</script>

**TL;DR:** Query the index for every tile intersecting the target buffered by the neighbourhood your processing needs, read them all, crop to the buffered extent, process, then crop back to the nominal extent before writing. The buffer exists to be discarded.

## Context and Motivation

This guide is part of [Tile Indexing, Buffering and Merging](https://www.pythonlidar.com/batch-automation-cloud-integration/tile-indexing-and-merging/). Any operation that looks at a point's neighbours — ground classification, outlier removal, height above ground, rasterization — behaves differently at a tile edge, because half the neighbourhood is in another file. Buffered tiling is the general fix, and the same pattern serves every one of those stages.

The width of the buffer is not a matter of taste. It is the reach of the widest neighbourhood operation in the pipeline: the search radius for a rasterizer, the window size for a morphological ground filter, the neighbour distance for an outlier filter. Take the largest, add a margin, and use that. Too narrow leaves a seam; too wide costs read time and nothing else, which makes erring generous the cheap mistake.

<svg viewBox="0 0 720 262" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="The read extent, the processing extent and the write extent of one buffered tile" style="width:100%;max-width:720px;display:block;margin:1.6rem auto">
  <title>Three extents, and only one of them is written</title>
  <desc>Concentric rectangles around one tile. The outer rectangle is what gets read — the tile plus its neighbours out to the buffer distance. The middle is what gets processed, so that edge cells have full neighbourhoods. The inner rectangle is the nominal tile extent, and it is the only part written to the output.</desc>
  <rect x="0" y="0" width="720" height="262" fill="var(--dg-bg)" rx="10"/>
  <rect x="60" y="40" width="330" height="190" fill="var(--dg-b)" fill-opacity="0.1" stroke="var(--dg-b)" stroke-width="1.6" stroke-dasharray="6 4"/>
  <rect x="96" y="66" width="258" height="138" fill="var(--dg-a)" fill-opacity="0.14" stroke="var(--dg-a)" stroke-width="1.6"/>
  <rect x="132" y="92" width="186" height="86" fill="var(--dg-d)" fill-opacity="0.25" stroke="var(--dg-d)" stroke-width="2"/>
  <text x="225" y="140" text-anchor="middle" font-size="11" font-weight="600" fill="var(--dg-text)">written</text>
  <text x="225" y="86" text-anchor="middle" font-size="10" fill="var(--dg-a)">processed</text>
  <text x="225" y="58" text-anchor="middle" font-size="10" fill="var(--dg-b)">read</text>
  <rect x="430" y="52" width="270" height="42" rx="7" fill="var(--dg-b-soft)" stroke="var(--dg-b)" stroke-width="1.3"/>
  <text x="565" y="78" text-anchor="middle" font-size="11" fill="var(--dg-text)">read: tile + neighbours</text>
  <rect x="430" y="104" width="270" height="42" rx="7" fill="var(--dg-a-soft)" stroke="var(--dg-a)" stroke-width="1.3"/>
  <text x="565" y="130" text-anchor="middle" font-size="11" fill="var(--dg-text)">process: nominal + buffer</text>
  <rect x="430" y="156" width="270" height="42" rx="7" fill="var(--dg-d-soft)" stroke="var(--dg-d)" stroke-width="1.3"/>
  <text x="565" y="182" text-anchor="middle" font-size="11" fill="var(--dg-text)">write: nominal extent only</text>
  <text x="60" y="252" font-size="10.5" fill="var(--dg-muted)">every buffer point is read, informs the edge, and is then discarded</text>
</svg>

## Prerequisites and Assumptions

| Requirement | Detail |
|---|---|
| A tile index | from [building a tile index](https://www.pythonlidar.com/batch-automation-cloud-integration/tile-indexing-and-merging/building-a-tile-index-with-pdal-tindex/) |
| PDAL | 2.4+ with `filters.merge` and `filters.crop` |
| Read access to neighbours | each worker must be able to open the tiles around its own |
| A known neighbourhood reach | the largest radius or window in the pipeline |

## Step-by-Step Implementation

### Step 1 — Determine the buffer from the pipeline

Rasterizer radius 1.4 m, SMRF window 33 m, outlier neighbour distance about 2 m — the largest is 33, so a buffer of 40 m is safe and cheap.

### Step 2 — Ask the index for neighbours

```sql
SELECT b.location FROM tiles a, tiles b
WHERE a.location LIKE '%tile_0431%'
  AND ST_Intersects(ST_Buffer(a.geom, 40), b.geom)
  AND b.location <> a.location
```

### Step 3 — Read the tile and its neighbours together

```json
{"pipeline": ["tile_0431.laz", "tile_0430.laz", "tile_0432.laz",
              {"type": "filters.merge"},
              {"type": "filters.crop", "bounds": "([511960, 513040], [4782960, 4784040])"}]}
```

### Step 4 — Process as usual

Classification, filtering and rasterization all now see full neighbourhoods at the tile edge.

### Step 5 — Crop back before writing

```json
{"type": "filters.crop", "bounds": "([512000, 513000], [4783000, 4784000])"}
```

Skip this and every point in the buffer is written twice — once by this tile and once by its neighbour.

## Complete Working Example

```python
"""Process one tile with a neighbourhood buffer, writing only its own extent."""
from __future__ import annotations

import json
import logging
import subprocess
from pathlib import Path

import pdal

LOG = logging.getLogger("buffered")


def neighbours(index: Path, tile: str, buffer_m: float, layer: str = "tiles") -> list[str]:
    sql = (f"SELECT b.location FROM {layer} a, {layer} b "
           f"WHERE a.location LIKE '%{tile}%' "
           f"AND ST_Intersects(ST_Buffer(a.geom, {buffer_m}), b.geom) "
           f"AND b.location <> a.location")
    out = subprocess.run(["ogr2ogr", "-f", "CSV", "/vsistdout/", str(index),
                          "-dialect", "SQLITE", "-sql", sql],
                         check=True, capture_output=True, text=True).stdout
    return [ln.strip() for ln in out.splitlines()[1:] if ln.strip()]


def process(tile: Path, index: Path, out: Path,
            bounds: tuple[float, float, float, float], buffer_m: float = 40.0) -> int:
    xmin, ymin, xmax, ymax = bounds
    bx0, by0, bx1, by1 = xmin - buffer_m, ymin - buffer_m, xmax + buffer_m, ymax + buffer_m

    others = neighbours(index, tile.stem, buffer_m)
    LOG.info("%s: reading %d neighbour(s)", tile.name, len(others))

    stages: list = [{"type": "readers.las", "filename": str(tile)}]
    stages += [{"type": "readers.las", "filename": p} for p in others]
    stages += [
        {"type": "filters.merge"},
        {"type": "filters.crop", "bounds": f"([{bx0}, {bx1}], [{by0}, {by1}])"},
        {"type": "filters.outlier", "method": "statistical", "mean_k": 12, "multiplier": 2.5},
        {"type": "filters.range", "limits": "Classification![7:7]"},
        {"type": "filters.smrf", "window": 33, "slope": 0.2, "threshold": 0.6, "cell": 1.0},
        # Crop back BEFORE writing, or the buffer is duplicated into the output.
        {"type": "filters.crop", "bounds": f"([{xmin}, {xmax}], [{ymin}, {ymax}])"},
        {"type": "writers.las", "filename": str(out), "compression": "laszip",
         "forward": "all"},
    ]
    return pdal.Pipeline(json.dumps({"pipeline": stages})).execute()


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    n = process(Path("tiles/tile_0431.laz"), Path("index/tiles.gpkg"),
                Path("out/tile_0431.laz"),
                bounds=(512000.0, 4783000.0, 513000.0, 4784000.0))
    LOG.info("wrote %d points", n)
```

<svg viewBox="0 0 720 250" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="The nine tiles a buffered read of one central tile requires" style="width:100%;max-width:720px;display:block;margin:1.6rem auto">
  <title>What the neighbour query returns</title>
  <desc>A three by three block with the target tile in the centre. A forty metre buffer around it intersects all eight surrounding tiles, so the read list is nine files rather than one. At a corner of the campaign the same query returns four, and the pipeline needs no special case for it.</desc>
  <rect x="0" y="0" width="720" height="250" fill="var(--dg-bg)" rx="10"/>
  <rect x="200" y="52" width="86" height="46" rx="4" fill="var(--dg-b)" fill-opacity="0.14" stroke="var(--dg-b)" stroke-width="1.2"/>
  <rect x="294" y="52" width="86" height="46" rx="4" fill="var(--dg-b)" fill-opacity="0.14" stroke="var(--dg-b)" stroke-width="1.2"/>
  <rect x="388" y="52" width="86" height="46" rx="4" fill="var(--dg-b)" fill-opacity="0.14" stroke="var(--dg-b)" stroke-width="1.2"/>
  <rect x="200" y="108" width="86" height="46" rx="4" fill="var(--dg-b)" fill-opacity="0.14" stroke="var(--dg-b)" stroke-width="1.2"/>
  <rect x="294" y="108" width="86" height="46" rx="4" fill="var(--dg-d)" fill-opacity="0.34" stroke="var(--dg-d)" stroke-width="2"/>
  <rect x="388" y="108" width="86" height="46" rx="4" fill="var(--dg-b)" fill-opacity="0.14" stroke="var(--dg-b)" stroke-width="1.2"/>
  <rect x="200" y="164" width="86" height="46" rx="4" fill="var(--dg-b)" fill-opacity="0.14" stroke="var(--dg-b)" stroke-width="1.2"/>
  <rect x="294" y="164" width="86" height="46" rx="4" fill="var(--dg-b)" fill-opacity="0.14" stroke="var(--dg-b)" stroke-width="1.2"/>
  <rect x="388" y="164" width="86" height="46" rx="4" fill="var(--dg-b)" fill-opacity="0.14" stroke="var(--dg-b)" stroke-width="1.2"/>
  <text x="337" y="132" text-anchor="middle" font-size="11" font-weight="600" fill="var(--dg-text)">target</text>
  <rect x="188" y="40" width="298" height="182" rx="6" fill="none" stroke="var(--dg-c)" stroke-width="2" stroke-dasharray="6 4"/>
  <text x="500" y="96" font-size="10.5" fill="var(--dg-c)">the 40 m buffer</text>
  <text x="500" y="128" font-size="10.5" fill="var(--dg-muted)">read list: 9 files</text>
  <text x="500" y="152" font-size="10.5" fill="var(--dg-muted)">write extent: 1 tile</text>
  <text x="20" y="242" font-size="10.5" fill="var(--dg-muted)">at a campaign corner the query returns four files, and the pipeline needs no special case</text>
</svg>

## Key Parameter Table

| Choice | Value | Why |
|---|---|---|
| buffer width | ≥ largest neighbourhood reach | Ground filter window usually dominates |
| first crop | buffered extent | Bounds the work; the neighbours may be much larger than needed |
| second crop | nominal extent | Prevents duplicate points across tile outputs |
| neighbour query | buffer the target only | One spatial predicate instead of thousands |
| read cost | buffer area ÷ tile area | A 40 m buffer on a 1 km tile is about 16% more points |

## Verification

**Output extent equals the nominal extent.** `pdal info --summary` on the result; a bounding box larger than the tile means the second crop is missing.

**Total output points equal total input points.** Summed across the campaign, with overlap removed. More means duplication; far fewer means a crop is too tight.

**Edges are seamless.** The seam test from [building a seamless DTM mosaic](https://www.pythonlidar.com/ground-filtering-dtm-dsm-generation/dtm-raster-generation/building-a-seamless-dtm-mosaic-from-tiles/) applies to the raster products.

<svg viewBox="0 0 720 250" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Extra points read against seam error for four buffer widths" style="width:100%;max-width:720px;display:block;margin:1.6rem auto">
  <title>Choosing the buffer width</title>
  <desc>Four buffer widths on a one kilometre tile. With no buffer the seam error is eleven centimetres and no extra points are read. At ten metres the error falls to two centimetres for four percent more points. At forty metres it is below a millimetre for sixteen percent more. At a hundred metres nothing further is gained and the read cost is forty-four percent.</desc>
  <rect x="0" y="0" width="720" height="250" fill="var(--dg-bg)" rx="10"/>
  <text x="200" y="40" font-size="10.5" fill="var(--dg-muted)">1 km tile, SMRF window 33 m</text>
  <text x="190" y="74" text-anchor="end" font-size="11.5" fill="var(--dg-text)">no buffer</text>
  <rect x="200" y="58" width="6" height="26" rx="3" fill="var(--dg-surface-2)" stroke="var(--dg-line-soft)" stroke-width="1.1"/>
  <text x="216" y="76" font-size="10.5" fill="var(--dg-e)">seam error 11 cm</text>
  <text x="190" y="118" text-anchor="end" font-size="11.5" fill="var(--dg-text)">10 m</text>
  <rect x="200" y="102" width="34" height="26" rx="3" fill="var(--dg-c-soft)" stroke="var(--dg-c)" stroke-width="1.1"/>
  <text x="244" y="120" font-size="10.5" fill="var(--dg-c)">2 cm · 4% more points read</text>
  <text x="190" y="162" text-anchor="end" font-size="11.5" fill="var(--dg-text)">40 m</text>
  <rect x="200" y="146" width="132" height="26" rx="3" fill="var(--dg-d-soft)" stroke="var(--dg-d)" stroke-width="1.1"/>
  <text x="342" y="164" font-size="10.5" fill="var(--dg-d)">below 1 mm · 16% more points read</text>
  <text x="190" y="206" text-anchor="end" font-size="11.5" fill="var(--dg-text)">100 m</text>
  <rect x="200" y="190" width="360" height="26" rx="3" fill="var(--dg-a-soft)" stroke="var(--dg-a)" stroke-width="1.1"/>
  <text x="570" y="208" font-size="10.5" fill="var(--dg-muted)">no better · 44% more</text>
  <text x="200" y="238" font-size="10.5" fill="var(--dg-muted)">past the largest neighbourhood the curve flattens and you pay for nothing</text>
</svg>

## Gotchas and Edge Cases

**Forgetting the second crop.** Every buffered point is written twice, and the merged campaign has duplicate returns in every overlap strip.

**Buffering the crop without reading the neighbours.** Adds empty space, not context. The read list must include the neighbours.

**Edge tiles have no neighbours on one side.** Expected at the campaign boundary. The seam test should exclude the outer edge.

**Classification differing across the seam.** If each tile classifies independently, the ground surface can still disagree slightly in the overlap. Buffering the classification, as here, is what prevents it.

## Frequently Asked Questions

**How wide should the buffer be?**

At least the largest neighbourhood reach in the pipeline — the rasterizer search radius, the ground filter window, the outlier neighbour distance, whichever is greatest. A 33 metre SMRF window makes 40 metres a safe choice, which costs about sixteen percent more points read on a one kilometre tile.

**What happens if I forget the final crop?**

Every point in the buffer is written twice, once by the tile that owns it and once by its neighbour. The merged campaign then has duplicate returns in every overlap strip, which inflates density metrics and produces doubled returns in anything computed downstream.

**Is a wider buffer ever harmful?**

Only to your read budget. Beyond the largest neighbourhood in the pipeline the seam error stops improving while the extra points keep costing time, so erring generous is the cheap mistake and erring narrow is the expensive one.

**What about tiles at the edge of the campaign?**

They genuinely have no neighbours on one side, and that is not a defect. The seam test should exclude the outer boundary, and any coverage report should distinguish "no data collected" from "processing lost it".

---

## Related

- [Tile Indexing, Buffering and Merging](https://www.pythonlidar.com/batch-automation-cloud-integration/tile-indexing-and-merging/) — the parent guide to the index this depends on
- [Building a Tile Index with pdal tindex](https://www.pythonlidar.com/batch-automation-cloud-integration/tile-indexing-and-merging/building-a-tile-index-with-pdal-tindex/) — producing the layer the neighbour query runs against
- [Merging Processed Tiles into One LAZ](https://www.pythonlidar.com/batch-automation-cloud-integration/tile-indexing-and-merging/merging-processed-tiles-into-one-laz/) — reassembling the results without duplicates
- [Building a Seamless DTM Mosaic from Tiles](https://www.pythonlidar.com/ground-filtering-dtm-dsm-generation/dtm-raster-generation/building-a-seamless-dtm-mosaic-from-tiles/) — the raster-side application of the same buffer
- [Batch Automation and Cloud Integration for PDAL](https://www.pythonlidar.com/batch-automation-cloud-integration/) — the section overview
