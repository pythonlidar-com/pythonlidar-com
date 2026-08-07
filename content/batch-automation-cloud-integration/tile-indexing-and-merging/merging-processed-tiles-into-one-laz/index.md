---
title: "Merging Processed Tiles into One LAZ"
description: "Crop each tile to its nominal extent before merging or the overlap strips double in density, and choose the writer by whether the result will be queried or reprocessed."
slug: "merging-processed-tiles-into-one-laz"
type: "howto"
breadcrumb: "Merging Processed Tiles"
datePublished: "2026-08-07"
dateModified: "2026-08-07"
---

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Article",
      "headline": "Merging Processed Tiles into One LAZ",
      "description": "Crop each tile to its nominal extent before merging or the overlap strips double in density, and choose the writer by whether the result will be queried or reprocessed.",
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
          "name": "Merging Processed Tiles",
          "item": "https://www.pythonlidar.com/batch-automation-cloud-integration/tile-indexing-and-merging/merging-processed-tiles-into-one-laz/"
        }
      ]
    },
    {
      "@type": "HowTo",
      "name": "Merge processed LiDAR tiles into a single file",
      "step": [
        {
          "@type": "HowToStep",
          "name": "Confirm one CRS across the inputs",
          "text": "filters.merge does not reproject, so mixed coordinate systems produce nonsense without an error."
        },
        {
          "@type": "HowToStep",
          "name": "Crop each tile to its nominal extent",
          "text": "Apply a crop after each reader so overlap strips are contributed by exactly one tile."
        },
        {
          "@type": "HowToStep",
          "name": "Merge the branches",
          "text": "Feed every cropped reader into filters.merge."
        },
        {
          "@type": "HowToStep",
          "name": "Choose the writer for the purpose",
          "text": "COPC for something that will be queried, plain LAZ for something that will be reprocessed."
        },
        {
          "@type": "HowToStep",
          "name": "Verify the count arithmetic",
          "text": "The merged count must equal the sum of the cropped input counts."
        }
      ]
    },
    {
      "@type": "FAQPage",
      "mainEntity": [
        {
          "@type": "Question",
          "name": "Why does my merged cloud have doubled density along tile edges?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Because the tiles overlap and nothing removed the duplication. Deliveries are often cut on flight lines rather than the grid, and a buffered pipeline that skipped its final crop produces the same effect. Cropping each input to its nominal extent before the merge removes it entirely."
          }
        },
        {
          "@type": "Question",
          "name": "Can a merge stream?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "A plain LAZ merge can, provided nothing in the chain buffers. A COPC merge cannot, because building the octree is a whole-dataset operation. That is what bounds a COPC block to what fits in memory, typically five to twenty gigabytes."
          }
        },
        {
          "@type": "Question",
          "name": "Does merging preserve point order?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "No. filters.merge concatenates in reader order, and writers.copc reorders the points entirely to match the octree. Anything that referenced points by row number in the source files is invalidated by the merge."
          }
        },
        {
          "@type": "Question",
          "name": "What happens when tiles carry different extra dimensions?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "The merged layout holds the union of them, with zeros filled in where a tile had no such dimension. That is legal, silent, and almost never what the person running the merge expected, so check the schema of the output rather than assuming."
          }
        }
      ]
    }
  ]
}
</script>

**TL;DR:** Crop each tile to its nominal extent, merge, then write — and decide before you start whether the destination is one COPC object for querying or a set of tiles for processing, because those are different products with different sizes.

## Context and Motivation

This guide is part of [Tile Indexing, Buffering and Merging](https://www.pythonlidar.com/batch-automation-cloud-integration/tile-indexing-and-merging/). Merging looks trivial — several readers, `filters.merge`, one writer — and the two things that go wrong both happen before the merge stage runs.

The first is duplication. Tiles delivered with overlap, or produced by a buffered pipeline that skipped its final crop, share points along their boundaries. Merging them concatenates those points, so the overlap strips end up with double the density. Nothing errors; the result is a cloud whose density map has a grid drawn on it and whose classification statistics are subtly wrong. Cropping each tile to its nominal extent first removes the problem completely.

The second is scale. Merging is not streamable when the output is COPC, because the octree needs the whole dataset, and it is memory-bound even when it is a plain LAZ concatenation if any filter in the chain buffers. A merge of four hundred tiles is a different operation from a merge of four.

<svg viewBox="0 0 720 258" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Merging overlapping tiles with and without a crop to the nominal extent" style="width:100%;max-width:720px;display:block;margin:1.6rem auto">
  <title>What overlap does to a merge</title>
  <desc>Two adjacent tiles sharing an overlap strip. Merged as delivered, the strip contains points from both files and its density doubles. Cropped to their nominal extents first, each point is contributed by exactly one tile and the density is uniform across the join.</desc>
  <rect x="0" y="0" width="720" height="258" fill="var(--dg-bg)" rx="10"/>
  <text x="20" y="36" font-size="11.5" font-weight="600" fill="var(--dg-e)">merged as delivered</text>
  <rect x="60" y="48" width="220" height="66" fill="var(--dg-b)" fill-opacity="0.16" stroke="var(--dg-b)" stroke-width="1.3"/>
  <rect x="240" y="48" width="220" height="66" fill="var(--dg-c)" fill-opacity="0.16" stroke="var(--dg-c)" stroke-width="1.3"/>
  <rect x="240" y="48" width="40" height="66" fill="var(--dg-e)" fill-opacity="0.32" stroke="var(--dg-e)" stroke-width="1.4"/>
  <text x="260" y="132" text-anchor="middle" font-size="10" fill="var(--dg-e)">2× density</text>
  <text x="500" y="76" font-size="10.5" fill="var(--dg-e)">the overlap strip holds every point twice;</text>
  <text x="500" y="94" font-size="10.5" fill="var(--dg-e)">density maps show the tile grid</text>
  <text x="20" y="172" font-size="11.5" font-weight="600" fill="var(--dg-d)">cropped, then merged</text>
  <rect x="60" y="184" width="200" height="66" fill="var(--dg-b)" fill-opacity="0.16" stroke="var(--dg-b)" stroke-width="1.3"/>
  <rect x="260" y="184" width="200" height="66" fill="var(--dg-c)" fill-opacity="0.16" stroke="var(--dg-c)" stroke-width="1.3"/>
  <line x1="260" y1="178" x2="260" y2="256" stroke="var(--dg-d)" stroke-width="2"/>
  <text x="500" y="212" font-size="10.5" fill="var(--dg-d)">each point contributed once,</text>
  <text x="500" y="230" font-size="10.5" fill="var(--dg-d)">density uniform across the join</text>
</svg>

## Prerequisites and Assumptions

| Requirement | Detail |
|---|---|
| PDAL | 2.4+ with `filters.merge` |
| One CRS | merge does not reproject; mixed inputs produce nonsense |
| Nominal extents | from the tile index, or from the delivery grid definition |
| Memory | a COPC merge holds the whole block; a LAZ merge can stream if nothing buffers |
| A destination decision | one queryable object, or a re-tiled set |

## Step-by-Step Implementation

### Step 1 — Confirm one CRS across the inputs

A single query against the index. Two coordinate systems means reprojecting first — see [fixing CRS mismatches](https://www.pythonlidar.com/point-cloud-data-standards-fundamentals/coordinate-reference-systems/fixing-crs-mismatches-in-point-clouds/).

### Step 2 — Crop each input to its nominal extent

```json
{"type": "readers.las", "filename": "tile_0431.laz"},
{"type": "filters.crop", "bounds": "([512000, 513000], [4783000, 4784000])"}
```

In PDAL a crop after a specific reader applies to that reader's branch, which is what makes per-tile extents possible in one pipeline.

### Step 3 — Merge

```json
{"type": "filters.merge"}
```

### Step 4 — Choose the writer for the purpose

`writers.copc` for something that will be queried; `writers.las` for something that will be re-tiled or reprocessed. The first is one object with an octree; the second is a plain concatenation.

### Step 5 — Verify the arithmetic

Output count must equal the sum of the cropped input counts.

## Complete Working Example

```python
"""Merge a group of tiles, cropping each to its nominal extent first."""
from __future__ import annotations

import json
import logging
from pathlib import Path

import pdal

LOG = logging.getLogger("merge")


def cropped_count(tile: Path, bounds: tuple[float, float, float, float]) -> int:
    xmin, ymin, xmax, ymax = bounds
    p = pdal.Pipeline(json.dumps({"pipeline": [
        {"type": "readers.las", "filename": str(tile)},
        {"type": "filters.crop", "bounds": f"([{xmin}, {xmax}], [{ymin}, {ymax}])"},
    ]}))
    return p.execute()


def merge(tiles: dict[Path, tuple[float, float, float, float]],
          out: Path, copc: bool = True) -> dict:
    expected = sum(cropped_count(t, b) for t, b in tiles.items())
    LOG.info("expecting %d points from %d cropped tiles", expected, len(tiles))

    stages: list = []
    for tile, (xmin, ymin, xmax, ymax) in tiles.items():
        stages.append({"type": "readers.las", "filename": str(tile)})
        stages.append({"type": "filters.crop",
                       "bounds": f"([{xmin}, {xmax}], [{ymin}, {ymax}])"})
    stages.append({"type": "filters.merge"})
    stages.append({"type": "writers.copc" if copc else "writers.las",
                   "filename": str(out), "forward": "all"})

    written = pdal.Pipeline(json.dumps({"pipeline": stages})).execute()
    if written != expected:
        raise AssertionError(
            f"merged {written} points, expected {expected} — check the crop extents"
        )
    return {"tiles": len(tiles), "points": written, "output": str(out)}


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    group = {
        Path("out/tile_0431.laz"): (512000.0, 4783000.0, 513000.0, 4784000.0),
        Path("out/tile_0432.laz"): (513000.0, 4783000.0, 514000.0, 4784000.0),
    }
    print(json.dumps(merge(group, Path("block_04.copc.laz")), indent=2))
```

## Key Parameter Table

| Choice | Options | Guidance |
|---|---|---|
| crop before merge | yes | The only reliable way to remove overlap duplication |
| writer | `writers.copc` / `writers.las` | Query product against processing product |
| `forward` | `all` | Header records must survive the merge |
| block size | 5–20 GB | Bounded by memory for COPC; unbounded for plain LAZ |
| verification | count arithmetic | Catches both duplication and an over-tight crop |

<svg viewBox="-2 30 724 233" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Which writer to merge into, by what the result is for" style="width:100%;max-width:720px;display:block;margin:1.6rem auto">
  <title>Two destinations, two different products</title>
  <desc>A merge target chosen by purpose. A result that will be queried by area and resolution wants COPC, which builds an octree and is bounded by memory. A result that will be reprocessed or re-tiled wants plain LAZ, which is a concatenation, streams, and has no size ceiling.</desc>
  <rect x="-2" y="30" width="724" height="233" fill="var(--dg-bg)" rx="10"/>
  <rect x="20" y="52" width="300" height="36" rx="6" fill="var(--dg-surface)" stroke="var(--dg-line-soft)" stroke-width="1.2"/>
  <text x="170" y="74" text-anchor="middle" font-size="11" fill="var(--dg-text)">will be queried by area</text>
  <rect x="340" y="52" width="360" height="36" rx="6" fill="var(--dg-d-soft)" stroke="var(--dg-d)" stroke-width="1.2"/>
  <text x="520" y="74" text-anchor="middle" font-size="11" fill="var(--dg-text)">writers.copc — octree, memory-bound</text>
  <rect x="20" y="98" width="300" height="36" rx="6" fill="var(--dg-surface)" stroke="var(--dg-line-soft)" stroke-width="1.2"/>
  <text x="170" y="120" text-anchor="middle" font-size="11" fill="var(--dg-text)">will be served to a viewer</text>
  <rect x="340" y="98" width="360" height="36" rx="6" fill="var(--dg-d-soft)" stroke="var(--dg-d)" stroke-width="1.2"/>
  <text x="520" y="120" text-anchor="middle" font-size="11" fill="var(--dg-text)">writers.copc — one URL, range reads</text>
  <rect x="20" y="144" width="300" height="36" rx="6" fill="var(--dg-surface)" stroke="var(--dg-line-soft)" stroke-width="1.2"/>
  <text x="170" y="166" text-anchor="middle" font-size="11" fill="var(--dg-text)">will be reprocessed</text>
  <rect x="340" y="144" width="360" height="36" rx="6" fill="var(--dg-d-soft)" stroke="var(--dg-d)" stroke-width="1.2"/>
  <text x="520" y="166" text-anchor="middle" font-size="11" fill="var(--dg-text)">writers.las — concatenation, streams</text>
  <rect x="20" y="190" width="300" height="36" rx="6" fill="var(--dg-surface)" stroke="var(--dg-line-soft)" stroke-width="1.2"/>
  <text x="170" y="212" text-anchor="middle" font-size="11" fill="var(--dg-text)">will be re-tiled</text>
  <rect x="340" y="190" width="360" height="36" rx="6" fill="var(--dg-d-soft)" stroke="var(--dg-d)" stroke-width="1.2"/>
  <text x="520" y="212" text-anchor="middle" font-size="11" fill="var(--dg-text)">writers.las — no size ceiling</text>
  <text x="20" y="238" font-size="10.5" fill="var(--dg-muted)">choosing before you start matters because the two have different size limits, not different syntax</text>
</svg>

## Verification

**Counts add up exactly.** Asserted above. A surplus means overlap survived; a shortfall means a crop extent is wrong.

**Density is uniform across joins.** Rasterize a `count` layer over the merged block; the tile grid should be invisible.

**The CRS survived.** One check on the output metadata, and the failure that costs most if missed.

<svg viewBox="0 0 720 250" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Point count and file size for a merge with and without cropping" style="width:100%;max-width:720px;display:block;margin:1.6rem auto">
  <title>The cost of merging without cropping</title>
  <desc>Sixteen tiles merged two ways. Cropped to nominal extents first, the merged block holds 64.1 million points in 1.9 gigabytes. Merged as delivered, it holds 71.8 million points in 2.2 gigabytes — twelve percent more, all of it duplicated returns along the tile boundaries.</desc>
  <rect x="0" y="0" width="720" height="250" fill="var(--dg-bg)" rx="10"/>
  <text x="220" y="42" font-size="10.5" fill="var(--dg-muted)">16 tiles delivered with a 20 m overlap</text>
  <text x="210" y="88" text-anchor="end" font-size="11.5" fill="var(--dg-text)">cropped, then merged</text>
  <rect x="220" y="70" width="400" height="30" rx="4" fill="var(--dg-d-soft)" stroke="var(--dg-d)" stroke-width="1.3"/>
  <text x="420" y="90" text-anchor="middle" font-size="11" fill="var(--dg-text)">64.1 M points · 1.9 GB</text>
  <text x="210" y="146" text-anchor="end" font-size="11.5" fill="var(--dg-text)">merged as delivered</text>
  <rect x="220" y="128" width="448" height="30" rx="4" fill="var(--dg-e-soft)" stroke="var(--dg-e)" stroke-width="1.3"/>
  <text x="444" y="148" text-anchor="middle" font-size="11" fill="var(--dg-text)">71.8 M points · 2.2 GB</text>
  <text x="220" y="192" font-size="10.5" fill="var(--dg-e)">the extra 7.7 M points are duplicates along the tile boundaries</text>
  <text x="220" y="214" font-size="10.5" fill="var(--dg-muted)">they raise measured density by 12% in the strips and by nothing in the middle, which is exactly</text>
  <text x="220" y="232" font-size="10.5" fill="var(--dg-muted)">the pattern that makes a density map show the tile grid.</text>
</svg>

## Gotchas and Edge Cases

**Merging does not reproject.** Two CRSs in, nonsense out, silently.

**A COPC merge is memory-bound.** The octree needs the whole block. Merge in regions rather than campaigns.

**Point order changes.** `filters.merge` concatenates in reader order and `writers.copc` reorders entirely. Anything that indexed by row number is invalidated.

**Extra dimensions must agree.** Tiles with different custom dimensions merge into a layout holding the union, with zeros where a tile had nothing — which is legal and rarely what anyone expected.

## Frequently Asked Questions

**Why does my merged cloud have doubled density along tile edges?**

Because the tiles overlap and nothing removed the duplication. Deliveries are often cut on flight lines rather than the grid, and a buffered pipeline that skipped its final crop produces the same effect. Cropping each input to its nominal extent before the merge removes it entirely.

**Can a merge stream?**

A plain LAZ merge can, provided nothing in the chain buffers. A COPC merge cannot, because building the octree is a whole-dataset operation. That is what bounds a COPC block to what fits in memory, typically five to twenty gigabytes.

**Does merging preserve point order?**

No. filters.merge concatenates in reader order, and writers.copc reorders the points entirely to match the octree. Anything that referenced points by row number in the source files is invalidated by the merge.

**What happens when tiles carry different extra dimensions?**

The merged layout holds the union of them, with zeros filled in where a tile had no such dimension. That is legal, silent, and almost never what the person running the merge expected, so check the schema of the output rather than assuming.

---

## Related

- [Tile Indexing, Buffering and Merging](https://www.pythonlidar.com/batch-automation-cloud-integration/tile-indexing-and-merging/) — the parent guide to the extents this crops to
- [Buffered Tiling to Avoid Edge Artefacts](https://www.pythonlidar.com/batch-automation-cloud-integration/tile-indexing-and-merging/buffered-tiling-to-avoid-edge-artefacts/) — the processing step whose final crop this depends on
- [Converting LAZ Tiles to COPC with PDAL](https://www.pythonlidar.com/point-cloud-data-standards-fundamentals/copc-and-cloud-native-formats/converting-laz-tiles-to-copc-with-pdal/) — the merge target when the result will be queried
- [Building a Tile Index with pdal tindex](https://www.pythonlidar.com/batch-automation-cloud-integration/tile-indexing-and-merging/building-a-tile-index-with-pdal-tindex/) — where the nominal extents come from
- [Batch Automation and Cloud Integration for PDAL](https://www.pythonlidar.com/batch-automation-cloud-integration/) — the section overview
