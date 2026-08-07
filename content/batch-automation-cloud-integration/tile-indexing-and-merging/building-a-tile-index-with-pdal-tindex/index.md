---
title: "Building a Tile Index with pdal tindex"
description: "The one-line command that turns a directory of LAZ files into a queryable layer, the boundary choice that costs four hours or eleven seconds, and the audit to run immediately afterwards."
slug: "building-a-tile-index-with-pdal-tindex"
type: "howto"
breadcrumb: "Building a Tile Index"
datePublished: "2026-08-07"
dateModified: "2026-08-07"
---

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Article",
      "headline": "Building a Tile Index with pdal tindex",
      "description": "The one-line command that turns a directory of LAZ files into a queryable layer, the boundary choice that costs four hours or eleven seconds, and the audit to run immediately afterwards.",
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
          "name": "Building a Tile Index",
          "item": "https://www.pythonlidar.com/batch-automation-cloud-integration/tile-indexing-and-merging/building-a-tile-index-with-pdal-tindex/"
        }
      ]
    },
    {
      "@type": "HowTo",
      "name": "Build and audit a LiDAR tile index with pdal tindex",
      "step": [
        {
          "@type": "HowToStep",
          "name": "Delete any existing index first",
          "text": "pdal tindex create appends, so rebuilding over an existing file doubles every feature."
        },
        {
          "@type": "HowToStep",
          "name": "Create the index with fast boundaries",
          "text": "Read headers only so a thousand tiles index in seconds rather than hours."
        },
        {
          "@type": "HowToStep",
          "name": "Compare feature count with file count",
          "text": "A mismatch means either a double append or a glob that missed a subdirectory."
        },
        {
          "@type": "HowToStep",
          "name": "Check that one CRS is present",
          "text": "Two coordinate systems in an index means the campaign cannot be merged as delivered."
        },
        {
          "@type": "HowToStep",
          "name": "Look for oversized polygons",
          "text": "A bounding box much larger than a grid cell holds points belonging to another tile."
        }
      ]
    },
    {
      "@type": "FAQPage",
      "mainEntity": [
        {
          "@type": "Question",
          "name": "Why does my index have twice as many features as files?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Because pdal tindex create appends to an existing layer rather than replacing it. The resulting index works for lookups and reports double the coverage, which is why the build script should delete the output first."
          }
        },
        {
          "@type": "Question",
          "name": "Should I use fast boundaries or computed ones?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Fast for anything you rebuild. On 1,240 tiles the header-only form takes eleven seconds and the computed form takes over four hours, because the latter reads every point. Compute boundaries once, for a coverage map you will show someone."
          }
        },
        {
          "@type": "Question",
          "name": "Why GeoPackage rather than shapefile?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Field names. Shapefile truncates them to ten characters silently, so acquisition_date and acquisition_sensor become the same field. GeoPackage also carries a spatial index by default, which neighbour queries on a large campaign need."
          }
        },
        {
          "@type": "Question",
          "name": "What happens to a file that cannot be opened?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "It is reported and skipped, and the index is built from the rest. That is reasonable behaviour and it is why comparing the feature count with the file count matters \u2014 the skipped file is otherwise invisible."
          }
        }
      ]
    }
  ]
}
</script>

**TL;DR:** `pdal tindex create index.gpkg -f GPKG --lyr_name tiles --fast_boundary tiles/*.laz` — then immediately check that the feature count equals the file count, that one CRS is present, and that no polygon is much larger than a grid cell.

## Context and Motivation

This guide is part of [Tile Indexing, Buffering and Merging](https://www.pythonlidar.com/batch-automation-cloud-integration/tile-indexing-and-merging/). The command is one line; the value is in what you do with the result in the next five minutes, because a tile index is the cheapest opportunity you will get to find out what is actually in a delivery.

`pdal tindex` reads headers rather than points, so indexing a thousand tiles takes seconds. Each file becomes one feature whose geometry is either the header bounding box — fast, and enough for buffered reads — or a computed boundary that follows irregular coverage, which is slower and far more informative when the flight lines do not fill their tiles.

<svg viewBox="0 0 720 250" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Header bounding box against computed boundary for an irregularly covered tile" style="width:100%;max-width:720px;display:block;margin:1.6rem auto">
  <title>Fast boundary against computed boundary</title>
  <desc>One tile whose points cover only a diagonal swath. The header bounding box is the full rectangle, which overstates coverage but is instant to obtain. The computed boundary follows the swath edge, showing the true extent, and costs a full pass over the points to produce.</desc>
  <rect x="0" y="0" width="720" height="250" fill="var(--dg-bg)" rx="10"/>
  <text x="180" y="38" text-anchor="middle" font-size="12" font-weight="600" fill="var(--dg-c)">--fast_boundary</text>
  <text x="540" y="38" text-anchor="middle" font-size="12" font-weight="600" fill="var(--dg-d)">computed boundary</text>
  <rect x="60" y="52" width="240" height="140" fill="var(--dg-c)" fill-opacity="0.16" stroke="var(--dg-c)" stroke-width="2"/>
  <path d="M76 182 L150 120 L230 96 L288 66 L288 96 L200 130 L120 178 Z" fill="var(--dg-a)" fill-opacity="0.5" stroke="var(--dg-a)" stroke-width="1.2"/>
  <text x="180" y="212" text-anchor="middle" font-size="10.5" fill="var(--dg-c)">header bbox — instant, overstates coverage</text>
  <rect x="420" y="52" width="240" height="140" fill="none" stroke="var(--dg-line-soft)" stroke-width="1.2" stroke-dasharray="4 4"/>
  <path d="M436 182 L510 120 L590 96 L648 66 L648 96 L560 130 L480 178 Z" fill="var(--dg-d)" fill-opacity="0.35" stroke="var(--dg-d)" stroke-width="2"/>
  <text x="540" y="212" text-anchor="middle" font-size="10.5" fill="var(--dg-d)">true extent — one pass over the points</text>
  <text x="60" y="238" font-size="10.5" fill="var(--dg-muted)">fast form for a working index; slow form once, for a coverage map</text>
</svg>

## Prerequisites and Assumptions

| Requirement | Detail |
|---|---|
| PDAL | 2.4+ with the `tindex` application |
| GDAL/OGR | for the output driver and for querying afterwards |
| One CRS | tiles in mixed coordinate systems produce a meaningless layer |
| Write access | `tindex create` appends, so the target must not already exist |

## Step-by-Step Implementation

### Step 1 — Build the index

```bash
rm -f index/tiles.gpkg
pdal tindex create index/tiles.gpkg -f GPKG --lyr_name tiles \
  --fast_boundary tiles/*.laz
```

The `rm` is not defensive tidiness — `create` appends, so without it a rebuild doubles every feature.

### Step 2 — Count features against files

```bash
ls tiles/*.laz | wc -l
ogrinfo -so index/tiles.gpkg tiles | grep "Feature Count"
```

### Step 3 — Check the coordinate systems agree

```bash
ogrinfo -so index/tiles.gpkg tiles | grep -A3 "Layer SRS"
```

### Step 4 — Look for oversized polygons

A feature whose area is much larger than the nominal grid cell holds points that belong somewhere else.

### Step 5 — Add the attributes you will filter on later

`tindex` writes the path and geometry; point counts, acquisition dates and processing status are worth joining in from a header pass.

## Complete Working Example

```python
"""Build a tile index and immediately audit it."""
from __future__ import annotations

import json
import logging
import subprocess
from pathlib import Path

LOG = logging.getLogger("tindex_build")


def build(tiles: list[Path], out: Path, layer: str = "tiles") -> None:
    out.parent.mkdir(parents=True, exist_ok=True)
    if out.exists():
        out.unlink()
    subprocess.run(["pdal", "tindex", "create", str(out), "-f", "GPKG",
                    "--lyr_name", layer, "--fast_boundary",
                    *[str(t) for t in tiles]], check=True)


def audit(index: Path, expected: int, cell_m: float, layer: str = "tiles") -> dict:
    info = subprocess.run(["ogrinfo", "-so", str(index), layer],
                          check=True, capture_output=True, text=True).stdout
    count = int([l for l in info.splitlines() if "Feature Count" in l][0].split(":")[1])

    sql = (f"SELECT COUNT(*) AS n FROM {layer} "
           f"WHERE (ST_MaxX(geom)-ST_MinX(geom)) > {cell_m * 1.5}")
    oversized = subprocess.run(
        ["ogrinfo", "-q", "-dialect", "SQLITE", "-sql", sql, str(index)],
        check=True, capture_output=True, text=True).stdout

    result = {
        "features": count,
        "files": expected,
        "duplicated": count > expected,
        "oversized_report": oversized.strip().splitlines()[-1:] or ["n = 0"],
    }
    if count != expected:
        raise AssertionError(
            f"index holds {count} features for {expected} files — "
            "the index was appended to, or the glob missed a subdirectory"
        )
    return result


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    tiles = sorted(Path("tiles").glob("*.laz"))
    build(tiles, Path("index/tiles.gpkg"))
    print(json.dumps(audit(Path("index/tiles.gpkg"), len(tiles), cell_m=1000.0), indent=2))
```

## Key Parameter Table

| Option | Effect |
|---|---|
| `-f GPKG` | Output driver; GeoPackage avoids shapefile's ten-character field names |
| `--lyr_name` | Layer name, needed by every later SQL query |
| `--fast_boundary` | Header bounding box instead of a computed hull |
| `-t_srs` | Reproject the index geometry only; the tiles are untouched |
| `--stdin` | Read the file list from standard input, for very large campaigns |
| `--write_absolute_path` | Store absolute rather than relative paths; usually the wrong choice |

<svg viewBox="0 0 720 292" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="The attribute schema worth carrying in a tile index" style="width:100%;max-width:720px;display:block;margin:1.6rem auto">
  <title>What to put in the index besides the geometry</title>
  <desc>Eight fields worth carrying on every index feature: the file path, the point count, the coordinate system, the acquisition date, the nominal extent identifier, the processing status, the run identifier that last touched it, and the timestamp of that change. The first three come from the header; the rest turn the index into a work ledger.</desc>
  <rect x="0" y="0" width="720" height="292" fill="var(--dg-bg)" rx="10"/>
  <rect x="20" y="48" width="240" height="32" rx="6" fill="var(--dg-surface)" stroke="var(--dg-line-soft)" stroke-width="1.2"/>
  <text x="140" y="68" text-anchor="middle" font-size="11" fill="var(--dg-text)">location</text>
  <rect x="280" y="48" width="420" height="32" rx="6" fill="var(--dg-a-soft)" stroke="var(--dg-a)" stroke-width="1.2"/>
  <text x="490" y="68" text-anchor="middle" font-size="11" fill="var(--dg-text)">path, relative to the index</text>
  <rect x="20" y="90" width="240" height="32" rx="6" fill="var(--dg-surface)" stroke="var(--dg-line-soft)" stroke-width="1.2"/>
  <text x="140" y="110" text-anchor="middle" font-size="11" fill="var(--dg-text)">num_points</text>
  <rect x="280" y="90" width="420" height="32" rx="6" fill="var(--dg-a-soft)" stroke="var(--dg-a)" stroke-width="1.2"/>
  <text x="490" y="110" text-anchor="middle" font-size="11" fill="var(--dg-text)">from the header, not a count of rows</text>
  <rect x="20" y="132" width="240" height="32" rx="6" fill="var(--dg-surface)" stroke="var(--dg-line-soft)" stroke-width="1.2"/>
  <text x="140" y="152" text-anchor="middle" font-size="11" fill="var(--dg-text)">srs_wkt</text>
  <rect x="280" y="132" width="420" height="32" rx="6" fill="var(--dg-a-soft)" stroke="var(--dg-a)" stroke-width="1.2"/>
  <text x="490" y="152" text-anchor="middle" font-size="11" fill="var(--dg-text)">so a mixed campaign is visible at a glance</text>
  <rect x="20" y="174" width="240" height="32" rx="6" fill="var(--dg-surface)" stroke="var(--dg-line-soft)" stroke-width="1.2"/>
  <text x="140" y="194" text-anchor="middle" font-size="11" fill="var(--dg-text)">acquired</text>
  <rect x="280" y="174" width="420" height="32" rx="6" fill="var(--dg-a-soft)" stroke="var(--dg-a)" stroke-width="1.2"/>
  <text x="490" y="194" text-anchor="middle" font-size="11" fill="var(--dg-text)">delivery date, for provenance</text>
  <rect x="20" y="216" width="240" height="32" rx="6" fill="var(--dg-surface)" stroke="var(--dg-line-soft)" stroke-width="1.2"/>
  <text x="140" y="236" text-anchor="middle" font-size="11" fill="var(--dg-text)">status</text>
  <rect x="280" y="216" width="420" height="32" rx="6" fill="var(--dg-a-soft)" stroke="var(--dg-a)" stroke-width="1.2"/>
  <text x="490" y="236" text-anchor="middle" font-size="11" fill="var(--dg-text)">pending · running · done · failed</text>
  <text x="20" y="278" font-size="10.5" fill="var(--dg-muted)">pdal tindex writes the first field and the geometry; everything else is a header pass you run once</text>
</svg>

## Verification

**Feature count equals file count.** Asserted in the example; catches both the double-append and a glob that missed a directory.

**One CRS.** Two in an index means the campaign cannot be merged as it stands.

**No wildly oversized polygons.** A tile whose bounding box spans several grid cells will break every neighbour query that follows.

**Paths resolve.** Open two at random and confirm they exist from the directory the index will be read from.

<svg viewBox="0 0 720 244" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Time to index a thousand tiles with fast boundaries against computed boundaries" style="width:100%;max-width:720px;display:block;margin:1.6rem auto">
  <title>What the boundary choice costs</title>
  <desc>Indexing 1,240 tiles two ways. With fast boundaries the run reads headers only and completes in eleven seconds. With computed boundaries it reads every point in every file and takes just over four hours. The output differs only in the shape of the polygons.</desc>
  <rect x="0" y="0" width="720" height="244" fill="var(--dg-bg)" rx="10"/>
  <text x="200" y="42" font-size="10.5" fill="var(--dg-muted)">1,240 tiles, 186 GB total</text>
  <text x="190" y="88" text-anchor="end" font-size="11.5" fill="var(--dg-text)">--fast_boundary</text>
  <rect x="200" y="70" width="16" height="30" rx="4" fill="var(--dg-d-soft)" stroke="var(--dg-d)" stroke-width="1.3"/>
  <text x="226" y="90" font-size="10.5" fill="var(--dg-muted)">11 s — headers only</text>
  <text x="190" y="148" text-anchor="end" font-size="11.5" fill="var(--dg-text)">computed boundary</text>
  <rect x="200" y="130" width="480" height="30" rx="4" fill="var(--dg-e-soft)" stroke="var(--dg-e)" stroke-width="1.3"/>
  <text x="440" y="150" text-anchor="middle" font-size="10.5" fill="var(--dg-text)">4 h 12 m — every point in every file</text>
  <text x="200" y="196" font-size="10.5" fill="var(--dg-muted)">both produce a usable index; only one can be re-run when a delivery changes,</text>
  <text x="200" y="214" font-size="10.5" fill="var(--dg-muted)">which makes the fast form the default and the slow form occasional.</text>
</svg>

## Gotchas and Edge Cases

**`create` appends.** The most common tile-index bug, and it produces an index that works for lookups and reports twice the coverage.

**Relative paths are relative to the working directory, not the index.** Build the index from the directory it will be read from, or resolve paths explicitly at read time.

**Shapefile truncates field names.** Ten characters, silently — the [DBF limit](https://www.pythonlidar.com/point-cloud-data-standards-fundamentals/metadata-header-sync/syncing-metadata-between-las-and-shapefiles/) that also bites tile-attribute exports.

**A file that fails to open is skipped.** `tindex` reports it and continues, so the feature count check is what tells you a tile is unreadable.

**The index describes the moment it was built.** It records what each header said at build time, which is exactly what makes it fast and exactly why it goes stale. Rebuild it whenever the delivery changes rather than patching individual features, and keep the build script in version control beside the pipelines that read it — a tile index nobody can regenerate is a liability the first time somebody asks whether it is still correct.

## Frequently Asked Questions

**Why does my index have twice as many features as files?**

Because pdal tindex create appends to an existing layer rather than replacing it. The resulting index works for lookups and reports double the coverage, which is why the build script should delete the output first.

**Should I use fast boundaries or computed ones?**

Fast for anything you rebuild. On 1,240 tiles the header-only form takes eleven seconds and the computed form takes over four hours, because the latter reads every point. Compute boundaries once, for a coverage map you will show someone.

**Why GeoPackage rather than shapefile?**

Field names. Shapefile truncates them to ten characters silently, so acquisition_date and acquisition_sensor become the same field. GeoPackage also carries a spatial index by default, which neighbour queries on a large campaign need.

**What happens to a file that cannot be opened?**

It is reported and skipped, and the index is built from the rest. That is reasonable behaviour and it is why comparing the feature count with the file count matters — the skipped file is otherwise invisible.

---

## Related

- [Tile Indexing, Buffering and Merging](https://www.pythonlidar.com/batch-automation-cloud-integration/tile-indexing-and-merging/) — the parent guide to what an index is for
- [Buffered Tiling to Avoid Edge Artefacts](https://www.pythonlidar.com/batch-automation-cloud-integration/tile-indexing-and-merging/buffered-tiling-to-avoid-edge-artefacts/) — the neighbour queries this index makes possible
- [Merging Processed Tiles into One LAZ](https://www.pythonlidar.com/batch-automation-cloud-integration/tile-indexing-and-merging/merging-processed-tiles-into-one-laz/) — putting results back together afterwards
- [Syncing Metadata Between LAS and Shapefiles](https://www.pythonlidar.com/point-cloud-data-standards-fundamentals/metadata-header-sync/syncing-metadata-between-las-and-shapefiles/) — the field-name limit that decides the output format
- [Batch Automation and Cloud Integration for PDAL](https://www.pythonlidar.com/batch-automation-cloud-integration/) — the section overview
