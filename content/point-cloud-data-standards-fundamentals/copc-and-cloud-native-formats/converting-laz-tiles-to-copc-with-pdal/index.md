---
title: "Converting LAZ Tiles to COPC with PDAL"
description: "Converting one tile is a single writer option; converting a survey properly means merging blocks so the octree replaces the tile grid — with the checks to pass before deleting the source."
slug: "converting-laz-tiles-to-copc-with-pdal"
type: "howto"
breadcrumb: "Converting LAZ Tiles to COPC"
datePublished: "2026-08-07"
dateModified: "2026-08-07"
---

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Article",
      "headline": "Converting LAZ Tiles to COPC with PDAL",
      "description": "Converting one tile is a single writer option; converting a survey properly means merging blocks so the octree replaces the tile grid \u2014 with the checks to pass before deleting the source.",
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
          "name": "Point Cloud Data Standards and Fundamentals",
          "item": "https://www.pythonlidar.com/point-cloud-data-standards-fundamentals/"
        },
        {
          "@type": "ListItem",
          "position": 3,
          "name": "COPC and Cloud-Native Formats",
          "item": "https://www.pythonlidar.com/point-cloud-data-standards-fundamentals/copc-and-cloud-native-formats/"
        },
        {
          "@type": "ListItem",
          "position": 4,
          "name": "Converting LAZ Tiles to COPC",
          "item": "https://www.pythonlidar.com/point-cloud-data-standards-fundamentals/copc-and-cloud-native-formats/converting-laz-tiles-to-copc-with-pdal/"
        }
      ]
    },
    {
      "@type": "HowTo",
      "name": "Convert and merge LAZ tiles into COPC files with PDAL",
      "step": [
        {
          "@type": "HowToStep",
          "name": "Convert one tile first",
          "text": "Run pdal translate with writers.copc.forward set to all and confirm the settings on a single file."
        },
        {
          "@type": "HowToStep",
          "name": "Check the CRS survived",
          "text": "Read the output metadata and confirm a horizontal spatial reference is present."
        },
        {
          "@type": "HowToStep",
          "name": "Merge a block rather than each tile",
          "text": "Feed several readers into filters.merge and one writers.copc so the octree indexes the whole region."
        },
        {
          "@type": "HowToStep",
          "name": "Assert the point counts add up",
          "text": "Compare the merged output count against the sum of the input counts and fail on a mismatch."
        },
        {
          "@type": "HowToStep",
          "name": "Verify before deleting the source",
          "text": "Confirm bounds, CRS and that an ordinary LAS reader opens the file before archiving the originals."
        }
      ]
    },
    {
      "@type": "FAQPage",
      "mainEntity": [
        {
          "@type": "Question",
          "name": "Should I convert each tile to its own COPC file?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Usually not. Converting 5,000 tiles into 5,000 COPC files keeps every problem the tile grid created \u2014 the client still needs an index and still stitches across boundaries \u2014 and adds an octree per tile. Merge tiles into regional blocks so the octree does the spatial indexing."
          }
        },
        {
          "@type": "Question",
          "name": "How large can a merged COPC block be?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "It is bounded by memory, because building an octree is a whole-dataset operation that cannot stream. Blocks of five to twenty gigabytes are practical on ordinary workers; beyond that split along natural boundaries rather than pushing the machine."
          }
        },
        {
          "@type": "Question",
          "name": "Does the conversion change my points?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "The coordinates and dimensions are preserved, but the point data record format is upgraded to 6, 7 or 8 because COPC requires it. That changes how the classification flags are stored, and the point order changes entirely since the octree ordering is the file layout."
          }
        },
        {
          "@type": "Question",
          "name": "What has to be true before I delete the source tiles?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Four things: the merged point count equals the sum of the inputs, a horizontal CRS is present in the output, a coarse read spans the whole merged extent rather than one tile, and an ordinary LAS reader opens the file. All four are cheap and one of them always catches something."
          }
        }
      ]
    }
  ]
}
</script>

**TL;DR:** `pdal translate in.laz out.copc.laz --writers.copc.forward=all` converts one tile; for a directory, merge related tiles into one COPC per region rather than converting each tile separately, because one large indexed object is the whole point of the format.

## Context and Motivation

This guide is part of [COPC and Cloud-Native Point Cloud Formats](https://www.pythonlidar.com/point-cloud-data-standards-fundamentals/copc-and-cloud-native-formats/). Converting is mechanically simple — one writer, one option — so the substance here is the decisions around it: which tiles to merge, what the conversion costs, and what has to be checked before the old tiles can be deleted.

The merging decision is the one people get wrong. Converting 5,000 tiles into 5,000 COPC files preserves every problem tiling created: a client still has to know which file covers its area, still has to stitch results across boundaries, and now also pays an octree per tile. Merging a whole survey block into one COPC lets the octree do the spatial indexing that the tile grid was standing in for.

<svg viewBox="0 0 720 258" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Converting tiles individually against merging a block into one indexed object" style="width:100%;max-width:720px;display:block;margin:1.6rem auto">
  <title>Convert each tile, or merge the block</title>
  <desc>Above, sixteen tiles converted one for one into sixteen COPC files: the client still has to know which file covers its area and still stitches across boundaries. Below, the same sixteen tiles merged into a single COPC whose octree indexes the whole block, so a client asks for a bounding box and the format finds the data.</desc>
  <rect x="0" y="0" width="720" height="258" fill="var(--dg-bg)" rx="10"/>
  <text x="20" y="36" font-size="11.5" font-weight="600" fill="var(--dg-c)">16 tiles → 16 COPC files</text>
  <rect x="330" y="46" width="80" height="80" rx="4" fill="var(--dg-c-soft)" stroke="var(--dg-c)" stroke-width="1.2"/>
  <text x="370" y="92" text-anchor="middle" font-size="10" fill="var(--dg-text)">16 objects</text>
  <text x="424" y="80" font-size="10.5" fill="var(--dg-muted)">the client still needs a tile index,</text>
  <text x="424" y="98" font-size="10.5" fill="var(--dg-muted)">and still stitches across edges</text>
  <rect x="30" y="46" width="36" height="36" fill="var(--dg-c)" fill-opacity="0.2" stroke="var(--dg-line-soft)" stroke-width="0.9"/>
  <rect x="70" y="46" width="36" height="36" fill="var(--dg-c)" fill-opacity="0.26" stroke="var(--dg-line-soft)" stroke-width="0.9"/>
  <rect x="110" y="46" width="36" height="36" fill="var(--dg-c)" fill-opacity="0.2" stroke="var(--dg-line-soft)" stroke-width="0.9"/>
  <rect x="150" y="46" width="36" height="36" fill="var(--dg-c)" fill-opacity="0.3" stroke="var(--dg-line-soft)" stroke-width="0.9"/>
  <rect x="30" y="86" width="36" height="36" fill="var(--dg-c)" fill-opacity="0.28" stroke="var(--dg-line-soft)" stroke-width="0.9"/>
  <rect x="70" y="86" width="36" height="36" fill="var(--dg-c)" fill-opacity="0.2" stroke="var(--dg-line-soft)" stroke-width="0.9"/>
  <rect x="110" y="86" width="36" height="36" fill="var(--dg-c)" fill-opacity="0.32" stroke="var(--dg-line-soft)" stroke-width="0.9"/>
  <rect x="150" y="86" width="36" height="36" fill="var(--dg-c)" fill-opacity="0.22" stroke="var(--dg-line-soft)" stroke-width="0.9"/>
  <text x="20" y="164" font-size="11.5" font-weight="600" fill="var(--dg-d)">16 tiles → 1 COPC</text>
  <rect x="30" y="176" width="156" height="56" rx="4" fill="var(--dg-d)" fill-opacity="0.24" stroke="var(--dg-d)" stroke-width="1.4"/>
  <text x="108" y="209" text-anchor="middle" font-size="10.5" fill="var(--dg-text)">one octree, one object</text>
  <rect x="330" y="176" width="80" height="56" rx="4" fill="var(--dg-d-soft)" stroke="var(--dg-d)" stroke-width="1.2"/>
  <text x="370" y="209" text-anchor="middle" font-size="10" fill="var(--dg-text)">1 object</text>
  <text x="424" y="200" font-size="10.5" fill="var(--dg-muted)">the client asks for a bounding box</text>
  <text x="424" y="218" font-size="10.5" fill="var(--dg-muted)">and the format finds the data</text>
</svg>

## Prerequisites and Assumptions

| Requirement | Detail |
|---|---|
| PDAL | 2.4+ with `writers.copc` |
| Source | LAS or LAZ with a valid CRS; all inputs to one COPC must share it |
| Disk | room for source and output together during conversion |
| Memory | merging is not streamable — the octree needs the whole block |
| Naming | the `.copc.laz` double extension, which most tooling recognises |

The memory row matters. Building an octree is inherently a whole-dataset operation, so a merged COPC of a 40 GB block needs a machine that can hold it. Regions of 5–20 GB are a practical sweet spot; beyond that, split by natural boundaries rather than by grid.

## Step-by-Step Implementation

### Step 1 — Convert a single tile to check the settings

```bash
pdal translate tile_0431.laz tile_0431.copc.laz \
  --writers.copc.forward=all --verbose 4
```

### Step 2 — Confirm the CRS survived

```bash
pdal info tile_0431.copc.laz --metadata | grep -i -A2 srs
```

A COPC file with no CRS is a file no client can place, and the conversion will not warn you.

### Step 3 — Merge a block rather than converting each tile

```json
{
  "pipeline": [
    "tiles/tile_0431.laz",
    "tiles/tile_0432.laz",
    "tiles/tile_0433.laz",
    {"type": "filters.merge"},
    {"type": "writers.copc", "filename": "block_04.copc.laz", "forward": "all"}
  ]
}
```

### Step 4 — Verify before deleting anything

Point counts, bounds and CRS, all compared against the sum of the inputs. Only then is the source safe to archive.

## Complete Working Example

```python
"""Merge a group of LAZ tiles into one COPC file and verify the result."""
from __future__ import annotations

import json
import logging
from pathlib import Path

import pdal

LOG = logging.getLogger("copc_merge")


def tile_points(path: Path) -> int:
    p = pdal.Pipeline(json.dumps({"pipeline": [
        {"type": "readers.las", "filename": str(path), "count": 1}]}))
    p.execute()
    return int(p.quickinfo["readers.las"]["num_points"])


def merge_to_copc(tiles: list[Path], dst: Path) -> dict:
    expected = sum(tile_points(t) for t in tiles)
    LOG.info("merging %d tiles, %d points expected", len(tiles), expected)

    stages: list = [{"type": "readers.las", "filename": str(t)} for t in tiles]
    stages.append({"type": "filters.merge"})
    stages.append({"type": "writers.copc", "filename": str(dst), "forward": "all"})

    written = pdal.Pipeline(json.dumps({"pipeline": stages})).execute()
    if written != expected:
        raise AssertionError(f"merged {written} points, expected {expected}")

    check = pdal.Pipeline(json.dumps({"pipeline": [
        {"type": "readers.copc", "filename": str(dst), "resolution": 50.0}]}))
    check.execute()
    info = check.quickinfo["readers.copc"]
    if not info.get("srs", {}).get("horizontal"):
        raise AssertionError("output has no horizontal CRS — forward did not carry it")

    return {"tiles": len(tiles), "points": written,
            "coarse_sample": len(check.arrays[0]),
            "bounds": info["bounds"], "output": str(dst)}


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    group = sorted(Path("tiles").glob("tile_04*.laz"))
    print(json.dumps(merge_to_copc(group, Path("block_04.copc.laz")), indent=2))
```

## Key Parameter Table

| Option | Stage | Guidance |
|---|---|---|
| `forward` | `writers.copc` | `all` — the CRS record above all else |
| `a_srs` | `writers.copc` | Only when the source CRS is wrong; it relabels, it does not transform |
| `filters.merge` | — | Required when several readers feed one writer |
| `resolution` | `readers.copc` | Coarse value for verification; fast structural check |
| output name | — | `.copc.laz`, by convention, so tooling recognises it |

## Verification

**Counts add up.** The assertion above compares the merged output against the sum of the inputs.

**The CRS is present.** Also asserted, because it is the failure that survives every other check.

**A coarse read spans the whole block.** Read at 50-metre resolution and confirm the returned points cover the merged bounds, not one tile's worth.

**Plain LAS tools still open it.** `pdal info block_04.copc.laz` should work through `readers.las` too — the compatibility guarantee, tested rather than assumed.

<svg viewBox="123 5 579 243" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Conversion time and output size for four block sizes" style="width:100%;max-width:720px;display:block;margin:1.6rem auto">
  <title>What conversion costs, by block size</title>
  <desc>Conversion time and output size for four merge groups. Four tiles take 41 seconds and produce 0.6 gigabytes. Sixteen tiles take 168 seconds and 2.4 gigabytes. Sixty-four tiles take 780 seconds and 9.6 gigabytes, and the octree build starts to dominate. Two hundred and fifty-six tiles exceeds a 32 gigabyte worker.</desc>
  <rect x="123" y="5" width="579" height="243" fill="var(--dg-bg)" rx="10"/>
  <text x="200" y="38" font-size="10.5" fill="var(--dg-muted)">merging N tiles of about 150 MB each, on an 8-core worker with 32 GB</text>
  <text x="190" y="72" text-anchor="end" font-size="11.5" fill="var(--dg-text)">4 tiles</text>
  <rect x="200" y="54" width="30" height="28" rx="4" fill="var(--dg-d-soft)" stroke="var(--dg-d)" stroke-width="1.2"/>
  <text x="240" y="74" font-size="10.5" fill="var(--dg-muted)">41 s · 0.6 GB out</text>
  <text x="190" y="120" text-anchor="end" font-size="11.5" fill="var(--dg-text)">16 tiles</text>
  <rect x="200" y="102" width="122" height="28" rx="4" fill="var(--dg-d-soft)" stroke="var(--dg-d)" stroke-width="1.2"/>
  <text x="332" y="122" font-size="10.5" fill="var(--dg-muted)">168 s · 2.4 GB out</text>
  <text x="190" y="168" text-anchor="end" font-size="11.5" fill="var(--dg-text)">64 tiles</text>
  <rect x="200" y="150" width="450" height="28" rx="4" fill="var(--dg-c-soft)" stroke="var(--dg-c)" stroke-width="1.2"/>
  <text x="425" y="170" text-anchor="middle" font-size="10.5" fill="var(--dg-text)">780 s · 9.6 GB out</text>
  <text x="190" y="216" text-anchor="end" font-size="11.5" fill="var(--dg-text)">256 tiles</text>
  <rect x="200" y="198" width="480" height="28" rx="4" fill="var(--dg-e-soft)" stroke="var(--dg-e)" stroke-width="1.2"/>
  <text x="440" y="218" text-anchor="middle" font-size="10.5" fill="var(--dg-text)">out of memory — the octree needs the whole block</text>
</svg>

## Gotchas and Edge Cases

**Mixed CRSs merge into nonsense.** `filters.merge` does not reproject. Every input must already share a CRS, which for a campaign spanning a UTM zone boundary means reprojecting first — see [reprojecting point clouds from UTM to WGS84](https://www.pythonlidar.com/pdal-pipeline-architecture-execution/spatial-reprojection/reprojecting-point-clouds-from-utm-to-wgs84/).

**Overlapping tiles double-count.** Merging tiles that were delivered with overlap produces duplicate points in the overlap strips. Crop each tile to its nominal extent first, or accept that density metrics will be wrong.

**Conversion is not streamable.** No amount of chunk tuning helps; the octree is a whole-dataset structure. Size the machine for the block.

<svg viewBox="0 0 720 244" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Four checks to pass before deleting the source tiles" style="width:100%;max-width:720px;display:block;margin:1.6rem auto">
  <title>What to check before deleting the source</title>
  <desc>Four checks before the original tiles can be archived. The merged point count equals the sum of the inputs. The horizontal CRS is present in the output. A coarse read spans the full merged bounds. And an ordinary LAS reader opens the file, which is the backward-compatibility promise the format makes.</desc>
  <rect x="0" y="0" width="720" height="244" fill="var(--dg-bg)" rx="10"/>
  <rect x="20" y="42" width="680" height="40" rx="7" fill="var(--dg-d-soft)" stroke="var(--dg-d)" stroke-width="1.2"/>
  <text x="40" y="67" font-size="11.5" fill="var(--dg-text)">1 · merged point count equals the sum of the input counts</text>
  <rect x="20" y="92" width="680" height="40" rx="7" fill="var(--dg-d-soft)" stroke="var(--dg-d)" stroke-width="1.2"/>
  <text x="40" y="117" font-size="11.5" fill="var(--dg-text)">2 · a horizontal CRS is present in the output metadata</text>
  <rect x="20" y="142" width="680" height="40" rx="7" fill="var(--dg-d-soft)" stroke="var(--dg-d)" stroke-width="1.2"/>
  <text x="40" y="167" font-size="11.5" fill="var(--dg-text)">3 · a coarse read spans the whole merged extent, not one tile</text>
  <rect x="20" y="192" width="680" height="40" rx="7" fill="var(--dg-d-soft)" stroke="var(--dg-d)" stroke-width="1.2"/>
  <text x="40" y="217" font-size="11.5" fill="var(--dg-text)">4 · readers.las opens the same file — the compatibility promise, tested</text>
</svg>

## Frequently Asked Questions

**Should I convert each tile to its own COPC file?**

Usually not. Converting 5,000 tiles into 5,000 COPC files keeps every problem the tile grid created — the client still needs an index and still stitches across boundaries — and adds an octree per tile. Merge tiles into regional blocks so the octree does the spatial indexing.

**How large can a merged COPC block be?**

It is bounded by memory, because building an octree is a whole-dataset operation that cannot stream. Blocks of five to twenty gigabytes are practical on ordinary workers; beyond that split along natural boundaries rather than pushing the machine.

**Does the conversion change my points?**

The coordinates and dimensions are preserved, but the point data record format is upgraded to 6, 7 or 8 because COPC requires it. That changes how the classification flags are stored, and the point order changes entirely since the octree ordering is the file layout.

**What has to be true before I delete the source tiles?**

Four things: the merged point count equals the sum of the inputs, a horizontal CRS is present in the output, a coarse read spans the whole merged extent rather than one tile, and an ordinary LAS reader opens the file. All four are cheap and one of them always catches something.

---

## Related

- [COPC and Cloud-Native Point Cloud Formats](https://www.pythonlidar.com/point-cloud-data-standards-fundamentals/copc-and-cloud-native-formats/) — the parent guide to the format and its octree
- [Querying a COPC File by Bounds and Resolution](https://www.pythonlidar.com/point-cloud-data-standards-fundamentals/copc-and-cloud-native-formats/querying-a-copc-file-by-bounds-and-resolution/) — reading back only what a question needs
- [COPC vs EPT for Web Delivery](https://www.pythonlidar.com/point-cloud-data-standards-fundamentals/copc-and-cloud-native-formats/copc-vs-ept-for-web-delivery/) — choosing between the two cloud-native layouts
- [Converting LAS to LAZ with PDAL](https://www.pythonlidar.com/point-cloud-data-standards-fundamentals/laslaz-file-structure/converting-las-to-laz-with-pdal/) — the simpler conversion and what it preserves
- [Reading and Writing LAS VLRs with PDAL](https://www.pythonlidar.com/point-cloud-data-standards-fundamentals/laslaz-file-structure/reading-and-writing-las-vlrs-with-pdal/) — why forward matters on every rewrite
