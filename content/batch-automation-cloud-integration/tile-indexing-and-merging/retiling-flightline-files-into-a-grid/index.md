---
title: "Retiling Flightline Files into a Grid"
description: "Convert LiDAR delivered as long flightline swaths into a regular square tile grid with pdal tile or filters.splitter: choose tile size and origin, stream large swaths with little memory, merge overlapping flightlines into each tile, and name tiles by their grid coordinates."
slug: "retiling-flightline-files-into-a-grid"
type: "howto"
breadcrumb: "Retiling Flightlines"
datePublished: "2026-09-18"
dateModified: "2026-09-18"
---

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Article",
      "headline": "Retiling Flightline Files into a Grid",
      "description": "Convert LiDAR delivered as long flightline swaths into a regular square tile grid with pdal tile or filters.splitter: choose tile size and origin, stream large swaths with little memory, merge overlapping flightlines into each tile, and name tiles by their grid coordinates.",
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
          "name": "Batch & Cloud Automation",
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
          "name": "Retiling Flightlines",
          "item": "https://www.pythonlidar.com/batch-automation-cloud-integration/tile-indexing-and-merging/retiling-flightline-files-into-a-grid/"
        }
      ]
    },
    {
      "@type": "HowTo",
      "name": "Retile LiDAR flightline files into a regular grid",
      "step": [
        {
          "@type": "HowToStep",
          "name": "Choose tile size",
          "text": "Pick a length that keeps a tile at a comfortable point count for your processing, typically 500 m to 1.5 km for 8\u201320 points per square metre."
        },
        {
          "@type": "HowToStep",
          "name": "Fix the grid origin",
          "text": "Set --origin_x and --origin_y to round coordinates (0, 0 works for a grid aligned to multiples of the tile length), so tile edges fall on round numbers and future deliveries share the same grid."
        },
        {
          "@type": "HowToStep",
          "name": "Run pdal tile",
          "text": "Give an input glob and an output pattern containing #; PDAL replaces # with the tile's column and row."
        },
        {
          "@type": "HowToStep",
          "name": "Rename to coordinates if needed",
          "text": "Convert index-based names to lower-left coordinate names such as 571000_4190000.laz, which read more clearly and survive re-origining."
        },
        {
          "@type": "HowToStep",
          "name": "Index the result",
          "text": "Build a tile index of the new tiles with pdal tindex for later queries."
        }
      ]
    },
    {
      "@type": "FAQPage",
      "mainEntity": [
        {
          "@type": "Question",
          "name": "How do I split LiDAR flightlines into square tiles?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Use the pdal tile application with an input glob, an output pattern containing a hash sign, and a tile length. It streams the input, so large deliveries need little memory, and overlapping swaths are merged into shared tiles."
          }
        },
        {
          "@type": "Question",
          "name": "What tile size should I use for LiDAR?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "A size that keeps tiles at a manageable point count for your processing, often 500 metres to 1.5 kilometres for typical aerial densities. Denser data suits smaller tiles."
          }
        },
        {
          "@type": "Question",
          "name": "Why set a tile origin?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "An origin of zero aligns tile edges to round multiples of the tile length, so names map to coordinates and future deliveries in the same area fall onto the same grid."
          }
        },
        {
          "@type": "Question",
          "name": "Does retiling lose which flightline a point came from?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "No, as long as PointSourceId is populated. It travels with each point and can be used later to separate flightlines within a tile."
          }
        }
      ]
    }
  ]
}
</script>

**TL;DR:** Run `pdal tile "swaths/*.laz" "tiles/tile_#.laz" --length 1000 --origin_x 0 --origin_y 0` to stream every flightline into 1 km tiles aligned to round coordinates. Points from overlapping swaths land in the same tile automatically, tiles are named by grid index, and memory stays low because the tile application streams. For custom logic inside a pipeline, `filters.splitter` does the same split in memory.

## Context and Motivation

This guide is part of [Tile Indexing and Merging](https://www.pythonlidar.com/batch-automation-cloud-integration/tile-indexing-and-merging/). Raw or lightly processed LiDAR often arrives as flightlines: long, narrow swaths, one file per pass, each overlapping its neighbours. Swaths are awkward for everything downstream. A single swath may be tens of kilometres long and too big to process in one job; any location is split across two or three files; and neither a DTM grid nor a tile index lines up with swath boundaries.

Retiling into a regular grid solves this once: each tile contains every point from every swath inside its square, tiles are of predictable size, and tile names encode their location. Every later stage — ground classification, rasterising, array jobs — then works per tile.

<svg viewBox="0 0 740 220" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Diagonal flightline swaths cut into a square tile grid" style="width:100%;max-width:740px;display:block;margin:1.6rem auto">
  <title>From swaths to tiles</title>
  <desc>On the left, two long diagonal flightline swaths overlap each other, with the centreline of a third pass dashed between them. On the right, the same area is cut into a regular grid of square tiles; each tile contains points from whichever swaths cross it, and overlap areas are merged into the same tile.</desc>
  <rect x="0" y="0" width="740" height="220" fill="var(--dg-bg)" rx="10"/>
  <g opacity="0.8">
    <path d="M30 170 L250 30 L290 60 L70 200 Z" fill="var(--dg-a-soft)" stroke="var(--dg-a)" stroke-width="1.2"/>
    <path d="M60 190 L280 50" fill="none" stroke="var(--dg-line)" stroke-width="0.8" stroke-dasharray="4 3"/>
    <path d="M20 130 L220 20 L250 40 L40 160 Z" fill="var(--dg-d-soft)" stroke="var(--dg-d)" stroke-width="1.2"/>
  </g>
  <text x="170" y="214" text-anchor="middle" font-size="10.5" fill="var(--dg-text)">overlapping flightlines</text>
  <path d="M320 110 L380 110" stroke="var(--dg-line)" stroke-width="1.6"/>
  <path d="M372 104 L382 110 L372 116" fill="none" stroke="var(--dg-line)" stroke-width="1.6"/>
  <g stroke="var(--dg-line)" stroke-width="1" fill="var(--dg-surface-2)">
    <rect x="420" y="20" width="75" height="60"/><rect x="495" y="20" width="75" height="60"/><rect x="570" y="20" width="75" height="60"/><rect x="645" y="20" width="75" height="60"/>
    <rect x="420" y="80" width="75" height="60"/><rect x="495" y="80" width="75" height="60"/><rect x="570" y="80" width="75" height="60"/><rect x="645" y="80" width="75" height="60"/>
    <rect x="420" y="140" width="75" height="60"/><rect x="495" y="140" width="75" height="60"/><rect x="570" y="140" width="75" height="60"/><rect x="645" y="140" width="75" height="60"/>
  </g>
  <g font-size="9.5" fill="var(--dg-text)">
    <text text-anchor="middle" x="457" y="54">0_2</text><text text-anchor="middle" x="532" y="54">1_2</text><text text-anchor="middle" x="607" y="54">2_2</text><text text-anchor="middle" x="682" y="54">3_2</text>
    <text text-anchor="middle" x="457" y="114">0_1</text><text text-anchor="middle" x="532" y="114">1_1</text><text text-anchor="middle" x="607" y="114">2_1</text><text text-anchor="middle" x="682" y="114">3_1</text>
    <text text-anchor="middle" x="457" y="174">0_0</text><text text-anchor="middle" x="532" y="174">1_0</text><text text-anchor="middle" x="607" y="174">2_0</text><text text-anchor="middle" x="682" y="174">3_0</text>
  </g>
  <text x="570" y="214" text-anchor="middle" font-size="10.5" fill="var(--dg-text)">square tiles named by grid index</text>
</svg>

## Prerequisites and Assumptions

- PDAL 2.x with the `tile` application.
- Flightlines in a projected CRS with metre or foot units; reproject first if they are in geographic coordinates.
- Enough disk for the output, roughly the size of the input.

## Step-by-Step Implementation

### Step 1 — Choose tile size

Pick a length that keeps a tile at a comfortable point count for your processing, typically 500 m to 1.5 km for 8–20 points per square metre.

### Step 2 — Fix the grid origin

Set `--origin_x` and `--origin_y` to round coordinates (0, 0 works for a grid aligned to multiples of the tile length), so tile edges fall on round numbers and future deliveries share the same grid.

### Step 3 — Run pdal tile

Give an input glob and an output pattern containing `#`; PDAL replaces `#` with the tile's column and row.

### Step 4 — Rename to coordinates if needed

Convert index-based names to lower-left coordinate names such as `571000_4190000.laz`, which read more clearly and survive re-origining.

### Step 5 — Index the result

Build a tile index of the new tiles with `pdal tindex` for later queries.

## Complete Working Example

Command line, streaming all swaths:

```bash
mkdir -p tiles
pdal tile "swaths/*.laz" "tiles/tile_#.laz" \
  --length 1000 --origin_x 0 --origin_y 0 \
  --buffer 0
ls tiles | head        # tile_571_4190.laz  tile_571_4191.laz ...
```

With origin 0 and a 1,000 m length, grid index equals the lower-left coordinate divided by 1,000, so `tile_571_4190.laz` covers x 571,000–572,000 and y 4,190,000–4,191,000.

The same split inside a Python pipeline, with coordinate names and a point-count report:

```python
import glob
import json

import pdal

LENGTH = 1000.0
readers = [{"type": "readers.las", "filename": f, "tag": f"r{i}"}
           for i, f in enumerate(sorted(glob.glob("swaths/*.laz")))]
spec = {"pipeline": readers + [
    {"type": "filters.merge", "inputs": [r["tag"] for r in readers]},
    {"type": "filters.splitter", "length": LENGTH, "origin_x": 0, "origin_y": 0},
]}
p = pdal.Pipeline(json.dumps(spec))
p.execute()

for arr in p.arrays:                     # one array per tile
    x0 = int(arr["X"].min() // LENGTH * LENGTH)
    y0 = int(arr["Y"].min() // LENGTH * LENGTH)
    out = f"tiles/{x0}_{y0}.laz"
    w = pdal.Pipeline(json.dumps([{"type": "writers.las", "filename": out,
                                    "compression": "laszip", "forward": "all",
                                    "extra_dims": "all"}]), arrays=[arr])
    w.execute()
    print(out, len(arr))
```

The Python version holds all points in memory, so reserve it for modest areas; the `pdal tile` application streams and is the right tool for full deliveries.

<svg viewBox="0 0 740 190" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Streaming retiling with few open files" style="width:100%;max-width:740px;display:block;margin:1.6rem auto">
  <title>Streaming, not loading</title>
  <desc>Swath files are read point by point in chunks. Each point's tile index is computed from its X and Y, and the point is appended to the open writer for that tile. Memory holds only one chunk plus the open writers, not the whole delivery.</desc>
  <defs><marker id="rtl-arw" markerWidth="9" markerHeight="7" refX="9" refY="3.5" orient="auto"><path d="M0,0 L0,7 L9,3.5 z" fill="var(--dg-line)"/></marker></defs>
  <rect x="0" y="0" width="740" height="190" fill="var(--dg-bg)" rx="10"/>
  <g font-size="10.5" fill="var(--dg-text)">
    <rect x="20" y="60" width="150" height="60" rx="8" fill="var(--dg-surface-2)" stroke="var(--dg-line)"/><text text-anchor="middle" x="95" y="86">swath chunk</text><text text-anchor="middle" x="95" y="104">(e.g. 10k points)</text>
    <rect x="240" y="60" width="200" height="60" rx="8" fill="var(--dg-a-soft)" stroke="var(--dg-a)"/><text text-anchor="middle" x="340" y="86">col = ⌊(x − x₀) / L⌋</text><text text-anchor="middle" x="340" y="104">row = ⌊(y − y₀) / L⌋</text>
    <rect x="520" y="20" width="200" height="36" rx="6" fill="var(--dg-d-soft)" stroke="var(--dg-d)"/><text text-anchor="middle" x="620" y="43">writer tile_571_4190</text>
    <rect x="520" y="72" width="200" height="36" rx="6" fill="var(--dg-d-soft)" stroke="var(--dg-d)"/><text text-anchor="middle" x="620" y="95">writer tile_571_4191</text>
    <rect x="520" y="124" width="200" height="36" rx="6" fill="var(--dg-d-soft)" stroke="var(--dg-d)"/><text text-anchor="middle" x="620" y="147">writer tile_572_4190</text>
  </g>
  <line x1="170" y1="90" x2="236" y2="90" stroke="var(--dg-line)" stroke-width="1.4" marker-end="url(#rtl-arw)"/>
  <path d="M440 90 L480 90 L480 38 L516 38" fill="none" stroke="var(--dg-line)" stroke-width="1.3" marker-end="url(#rtl-arw)"/>
  <line x1="480" y1="90" x2="516" y2="90" stroke="var(--dg-line)" stroke-width="1.3" marker-end="url(#rtl-arw)"/>
  <path d="M480 90 L480 142 L516 142" fill="none" stroke="var(--dg-line)" stroke-width="1.3" marker-end="url(#rtl-arw)"/>
  <text x="340" y="178" text-anchor="middle" font-size="10.5" fill="var(--dg-muted)">memory: one chunk plus open writers</text>
</svg>

## Keeping Flightline Identity

Merging swaths into tiles loses the file boundary, but not necessarily the information. The `PointSourceId` field, set by most acquisition software to the flightline number, travels with every point, so a tile can still be split back by flightline for swath-to-swath accuracy checks or intensity normalisation, as in [normalizing intensity across flightlines](https://www.pythonlidar.com/pdal-pipeline-architecture-execution/attribute-mapping/normalizing-intensity-across-flightlines/). Check before retiling that `PointSourceId` is populated and distinct per swath; if it is not, assign it from the file order with `filters.assign` on each reader before merging, because it cannot be recovered afterwards. The same applies to the overlap flag and `GpsTime`, which later tools use to identify overlapping returns.

Tile edges also create a small classic problem: ground filters and rasterisers behave poorly at tile boundaries. Retile without a buffer for storage, and add buffers at processing time as in [buffered tiling to avoid edge artefacts](https://www.pythonlidar.com/batch-automation-cloud-integration/tile-indexing-and-merging/buffered-tiling-to-avoid-edge-artefacts/).

## Key Parameter Table

| Option | Typical | Notes |
|---|---|---|
| `--length` | 500–1500 m | Tile side in CRS units |
| `--origin_x`, `--origin_y` | 0, 0 | Aligns tiles to round coordinates |
| `--buffer` | 0 for storage | Add buffers at processing time instead |
| `--out_srs` | optional | Reproject while tiling |
| output pattern | `tiles/tile_#.laz` | `#` becomes column_row |
| `filters.splitter` `length` | same as above | In-pipeline, in-memory alternative |

## Verification

- **Point conservation.** The sum of points across tiles equals the sum across swaths; compare with `pdal info --summary` totals.
- **Bounds on the grid.** Each tile's bounds fall within its named square, with minima at or above the tile corner.
- **No slivers.** Tiles along the edge of the delivery may be partly empty; a very small tile at a corner is normal, but many tiny tiles suggest a wrong origin.

## Gotchas and Edge Cases

**Too many open files.** Streaming retiling keeps a writer open per active tile. A delivery spanning thousands of tiles in one swath can hit the operating system's file limit; raise it with `ulimit -n`, or tile in bands.

**Feet and metres.** In a State Plane CRS in US survey feet, `--length 1000` makes 1,000-foot tiles. Choose lengths in the CRS's own units.

<svg viewBox="90 0 520 180" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Tile length in feet versus metres" style="width:100%;max-width:740px;display:block;margin:1.6rem auto">
  <title>Length is in CRS units</title>
  <desc>Two squares compare a 1,000-unit tile in a metre-based CRS, one kilometre on a side, with a 1,000-unit tile in a US survey foot CRS, about 305 metres on a side and roughly one eleventh of the area. The same length option gives very different tiles.</desc>
  <rect x="90" y="0" width="520" height="180" fill="var(--dg-bg)" rx="10"/>
  <rect x="120" y="20" width="140" height="140" fill="var(--dg-a-soft)" stroke="var(--dg-a)" stroke-width="1.4"/>
  <text x="190" y="94" text-anchor="middle" font-size="10.5" fill="var(--dg-text)">1,000 m</text>
  <rect x="330" y="118" width="42" height="42" fill="var(--dg-d-soft)" stroke="var(--dg-d)" stroke-width="1.4"/>
  <g font-size="10.5" fill="var(--dg-text)">
    <text x="390" y="136" text-anchor="start">1,000 US ft ≈ 305 m</text>
    <text x="390" y="154" text-anchor="start">about 1/11 of the area</text>
    <text x="390" y="60" text-anchor="start">--length is read in the CRS's own units:</text>
    <text x="390" y="80" text-anchor="start">check the axis unit before tiling</text>
  </g>
</svg>

**Header CRS mismatch.** All swaths must share a CRS. A single swath in a different zone lands in wildly wrong tiles; check every input's CRS first.

## Frequently Asked Questions

**How do I split LiDAR flightlines into square tiles?**

Use the pdal tile application with an input glob, an output pattern containing a hash sign, and a tile length. It streams the input, so large deliveries need little memory, and overlapping swaths are merged into shared tiles.

**What tile size should I use for LiDAR?**

A size that keeps tiles at a manageable point count for your processing, often 500 metres to 1.5 kilometres for typical aerial densities. Denser data suits smaller tiles.

**Why set a tile origin?**

An origin of zero aligns tile edges to round multiples of the tile length, so names map to coordinates and future deliveries in the same area fall onto the same grid.

**Does retiling lose which flightline a point came from?**

No, as long as PointSourceId is populated. It travels with each point and can be used later to separate flightlines within a tile.

## Related

- [Tile Indexing and Merging](https://www.pythonlidar.com/batch-automation-cloud-integration/tile-indexing-and-merging/) — tiling strategies
- [Buffered Tiling to Avoid Edge Artefacts](https://www.pythonlidar.com/batch-automation-cloud-integration/tile-indexing-and-merging/buffered-tiling-to-avoid-edge-artefacts/) — buffers at processing time
- [Building a Tile Index with pdal tindex](https://www.pythonlidar.com/batch-automation-cloud-integration/tile-indexing-and-merging/building-a-tile-index-with-pdal-tindex/) — indexing the new tiles
- [Making Tile Outputs Idempotent](https://www.pythonlidar.com/batch-automation-cloud-integration/tile-indexing-and-merging/making-tile-outputs-idempotent/) — safe reruns per tile
- [Measuring Swath-to-Swath Relative Accuracy](https://www.pythonlidar.com/point-cloud-data-standards-fundamentals/vertical-accuracy-assessment/measuring-swath-to-swath-relative-accuracy/) — why flightline identity matters
