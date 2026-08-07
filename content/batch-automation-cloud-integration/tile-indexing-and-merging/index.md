---
title: "Tile Indexing, Buffering and Merging"
description: "Building a queryable tile index from LiDAR headers, using it to find neighbours for buffered processing, and the four defects it exposes before any point is processed."
slug: "tile-indexing-and-merging"
type: "topic"
breadcrumb: "Tile Indexing and Merging"
datePublished: "2026-08-07"
dateModified: "2026-08-07"
---

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Article",
      "headline": "Tile Indexing, Buffering and Merging",
      "description": "Building a queryable tile index from LiDAR headers, using it to find neighbours for buffered processing, and the four defects it exposes before any point is processed.",
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
        }
      ]
    },
    {
      "@type": "HowTo",
      "name": "Build and query a LiDAR tile index for batch processing",
      "step": [
        {
          "@type": "HowToStep",
          "name": "Freeze the file list",
          "text": "Enumerate the delivery once so the index describes a fixed set rather than a moving one."
        },
        {
          "@type": "HowToStep",
          "name": "Read headers only",
          "text": "Use pdal tindex with fast boundaries so a thousand tiles index in seconds rather than hours."
        },
        {
          "@type": "HowToStep",
          "name": "Attach the attributes queries will need",
          "text": "Carry path, point count, CRS and status so later filtering never has to open a file."
        },
        {
          "@type": "HowToStep",
          "name": "Write GeoPackage rather than shapefile",
          "text": "Avoid the ten-character field-name limit and get a spatial index by default."
        },
        {
          "@type": "HowToStep",
          "name": "Query for neighbours",
          "text": "Buffer the target polygon and intersect it against the layer to find the tiles a buffered read needs."
        }
      ]
    },
    {
      "@type": "FAQPage",
      "mainEntity": [
        {
          "@type": "Question",
          "name": "Why build a tile index instead of globbing the directory?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Because the questions are spatial. Which tiles cover this corridor, which tiles neighbour this one, which tiles are missing from the coverage \u2014 none of them can be answered by a filename pattern, and answering them by opening headers each time turns a one-second query into a several-minute one."
          }
        },
        {
          "@type": "Question",
          "name": "Why does my index have every tile twice?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Because pdal tindex create appends to an existing layer. Re-running it against a file that already exists silently doubles every polygon, which is why the index-building script should delete the output first and be idempotent by construction."
          }
        },
        {
          "@type": "Question",
          "name": "What is the difference between nominal and actual tile extent?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "The nominal extent is the rectangle the tile owns in the delivery grid; the actual extent is the bounding box of the points inside it. They differ because of flight-line overlap, and a tile whose actual extent is far larger than its nominal one usually holds points belonging to a neighbour."
          }
        },
        {
          "@type": "Question",
          "name": "Should the index store absolute or relative paths?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Relative to the index, resolved at read time. Absolute paths break when storage moves, which it always does; relative paths break only when someone separates the index from the data, which is a mistake worth making visible."
          }
        }
      ]
    }
  ]
}
</script>

A LiDAR campaign arrives as thousands of files and no map. Somewhere in that directory are the four tiles covering the road corridor a client asked about, and finding them by opening headers one at a time is the kind of task that quietly consumes an afternoon and then has to be repeated next week. A tile index solves it once: a vector layer with one polygon per file, carrying the file path and whatever else is worth knowing, queryable by any GIS or by `ogr2ogr` in a shell script. Every workflow in this section — buffered processing, spatial fan-out, merging — starts by asking the index a question. This topic belongs to [Batch Automation and Cloud Integration for PDAL](https://www.pythonlidar.com/batch-automation-cloud-integration/).

The index is also where two things that are easy to conflate get separated. A tile's *nominal* extent is the rectangle it owns in the delivery grid. Its *actual* extent is the bounding box of the points inside it, which is usually a little larger because of flight-line overlap and sometimes a lot larger because someone merged two tiles and forgot. Buffered processing needs the first; correctness checks need the second; and a delivery in which they differ systematically is telling you something before you have processed a single point.

<svg viewBox="0 0 720 268" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="A tile index over a survey block, with a query returning the tiles a corridor touches" style="width:100%;max-width:720px;display:block;margin:1.6rem auto">
  <title>One polygon per file, and a query that returns paths</title>
  <desc>A survey block drawn as a grid of tile polygons. A road corridor crosses it diagonally. A spatial query against the index returns the five tiles the corridor intersects, together with their file paths and point counts, without opening any of the files themselves.</desc>
  <rect x="0" y="0" width="720" height="268" fill="var(--dg-bg)" rx="10"/>
  <text x="20" y="34" font-size="10.5" fill="var(--dg-muted)">tile index over a 5 × 4 block, with a corridor query drawn over it</text>
  <rect x="40" y="46" width="76" height="46" fill="var(--dg-b)" fill-opacity="0.12" stroke="var(--dg-b)" stroke-width="1"/>
  <rect x="118" y="46" width="76" height="46" fill="var(--dg-b)" fill-opacity="0.12" stroke="var(--dg-b)" stroke-width="1"/>
  <rect x="196" y="46" width="76" height="46" fill="var(--dg-c)" fill-opacity="0.3" stroke="var(--dg-c)" stroke-width="1.4"/>
  <rect x="274" y="46" width="76" height="46" fill="var(--dg-c)" fill-opacity="0.3" stroke="var(--dg-c)" stroke-width="1.4"/>
  <rect x="352" y="46" width="76" height="46" fill="var(--dg-b)" fill-opacity="0.12" stroke="var(--dg-b)" stroke-width="1"/>
  <rect x="40" y="94" width="76" height="46" fill="var(--dg-b)" fill-opacity="0.12" stroke="var(--dg-b)" stroke-width="1"/>
  <rect x="118" y="94" width="76" height="46" fill="var(--dg-c)" fill-opacity="0.3" stroke="var(--dg-c)" stroke-width="1.4"/>
  <rect x="196" y="94" width="76" height="46" fill="var(--dg-c)" fill-opacity="0.3" stroke="var(--dg-c)" stroke-width="1.4"/>
  <rect x="274" y="94" width="76" height="46" fill="var(--dg-b)" fill-opacity="0.12" stroke="var(--dg-b)" stroke-width="1"/>
  <rect x="352" y="94" width="76" height="46" fill="var(--dg-b)" fill-opacity="0.12" stroke="var(--dg-b)" stroke-width="1"/>
  <rect x="40" y="142" width="76" height="46" fill="var(--dg-c)" fill-opacity="0.3" stroke="var(--dg-c)" stroke-width="1.4"/>
  <rect x="118" y="142" width="76" height="46" fill="var(--dg-b)" fill-opacity="0.12" stroke="var(--dg-b)" stroke-width="1"/>
  <rect x="196" y="142" width="76" height="46" fill="var(--dg-b)" fill-opacity="0.12" stroke="var(--dg-b)" stroke-width="1"/>
  <rect x="274" y="142" width="76" height="46" fill="var(--dg-b)" fill-opacity="0.12" stroke="var(--dg-b)" stroke-width="1"/>
  <rect x="352" y="142" width="76" height="46" fill="var(--dg-b)" fill-opacity="0.12" stroke="var(--dg-b)" stroke-width="1"/>
  <path d="M50 180 L160 130 L250 112 L340 62" fill="none" stroke="var(--dg-e)" stroke-width="3"/>
  <text x="60" y="206" font-size="10.5" fill="var(--dg-e)">the corridor</text>
  <rect x="452" y="46" width="248" height="142" rx="8" fill="var(--dg-surface)" stroke="var(--dg-line-soft)" stroke-width="1.2"/>
  <text x="468" y="70" font-size="10.5" fill="var(--dg-text)">tile_0212.laz · 4.1 M pts</text>
  <text x="468" y="94" font-size="10.5" fill="var(--dg-text)">tile_0213.laz · 3.8 M pts</text>
  <text x="468" y="118" font-size="10.5" fill="var(--dg-text)">tile_0302.laz · 4.4 M pts</text>
  <text x="468" y="142" font-size="10.5" fill="var(--dg-text)">tile_0303.laz · 4.0 M pts</text>
  <text x="468" y="166" font-size="10.5" fill="var(--dg-text)">tile_0401.laz · 3.6 M pts</text>
  <text x="452" y="212" font-size="10.5" fill="var(--dg-muted)">returned by one ogr2ogr query,</text>
  <text x="452" y="230" font-size="10.5" fill="var(--dg-muted)">without opening a single LAZ file</text>
  <text x="20" y="256" font-size="10.5" fill="var(--dg-muted)">the index is small enough to commit, and rebuilding it is cheaper than trusting a stale one</text>
</svg>

## Prerequisites

| Requirement | Detail |
|---|---|
| PDAL | 2.4+ for the `tindex` application |
| GDAL/OGR | for querying and for writing GeoPackage |
| A consistent CRS | every tile in one index must share one, or the polygons are meaningless |
| Read access to headers | `tindex` reads headers, not points, so it is fast |
| An output format | GeoPackage; shapefile truncates field names, as [syncing metadata](https://www.pythonlidar.com/point-cloud-data-standards-fundamentals/metadata-header-sync/syncing-metadata-between-las-and-shapefiles/) describes |

## Core Workflow Architecture

1. **Enumerate the files.** A glob, a manifest, or an object listing. Freeze it — an index built while files are still arriving describes a moment that has passed.
2. **Read each header.** `pdal tindex` opens the header only: bounds, point count, CRS, version. On a thousand tiles this is seconds, not minutes.
3. **Build a polygon per file.** By default the header bounding box, which is the *actual* extent. The nominal grid extent, if you have it, is worth carrying as separate fields.
4. **Attach attributes.** Path, point count, CRS, acquisition date, processing status — whatever later queries will filter on.
5. **Write a vector layer.** GeoPackage for anything with more than a handful of fields.
6. **Query it.** Spatial queries for coverage, attribute queries for status, and self-joins for neighbour lookup.

## Full Implementation

```python
"""Build a tile index with attributes, and query it for neighbours."""
from __future__ import annotations

import json
import logging
import subprocess
from pathlib import Path

import pdal

LOG = logging.getLogger("tindex")


def header_info(path: Path) -> dict:
    """Header-only read: bounds, count and CRS without touching the points."""
    p = pdal.Pipeline(json.dumps({"pipeline": [
        {"type": "readers.las", "filename": str(path), "count": 1}]}))
    p.execute()
    qi = p.quickinfo["readers.las"]
    b = qi["bounds"]
    return {
        "path": str(path),
        "points": int(qi["num_points"]),
        "minx": b["minx"], "maxx": b["maxx"],
        "miny": b["miny"], "maxy": b["maxy"],
        "srs": (qi.get("srs") or {}).get("horizontal", "")[:64],
    }


def build_index(tiles: list[Path], out: Path, layer: str = "tiles") -> int:
    """Write a GeoPackage tile index using pdal tindex."""
    out.parent.mkdir(parents=True, exist_ok=True)
    if out.exists():
        out.unlink()  # tindex appends; a stale index is worse than none

    cmd = ["pdal", "tindex", "create", str(out),
           "--lyr_name", layer, "-f", "GPKG", "--fast_boundary"]
    cmd += [str(t) for t in tiles]
    subprocess.run(cmd, check=True)
    LOG.info("indexed %d tiles into %s", len(tiles), out)
    return len(tiles)


def neighbours(index: Path, tile_name: str, buffer_m: float = 10.0,
               layer: str = "tiles") -> list[str]:
    """Every tile whose polygon intersects a buffered target tile."""
    sql = (
        f"SELECT b.location FROM {layer} a, {layer} b "
        f"WHERE a.location LIKE '%{tile_name}%' "
        f"AND ST_Intersects(ST_Buffer(a.geom, {buffer_m}), b.geom) "
        f"AND b.location <> a.location"
    )
    out = subprocess.run(
        ["ogr2ogr", "-f", "CSV", "/vsistdout/", str(index), "-dialect", "SQLITE", "-sql", sql],
        check=True, capture_output=True, text=True).stdout
    return [line.strip() for line in out.splitlines()[1:] if line.strip()]


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    tiles = sorted(Path("tiles").glob("*.laz"))
    build_index(tiles, Path("index/tiles.gpkg"))
    LOG.info("neighbours of tile_0431: %s", neighbours(Path("index/tiles.gpkg"), "tile_0431"))
```

## Code Breakdown

**The index is deleted before rebuilding.** `pdal tindex create` appends to an existing layer, so re-running it against a stale file silently doubles every polygon. Deleting first makes the operation idempotent, which matters more than it sounds when the command sits inside a nightly job.

**`--fast_boundary` uses the header bounding box.** The alternative computes a concave hull from the points, which is far more informative for irregular coverage and far slower. Use the fast form for a working index and the slow form once, for a coverage map.

**The neighbour query buffers the *target*, not every tile.** Buffering one polygon and testing intersection is a single spatial predicate. Buffering all of them first would be correct and much slower on a large index.

**`quickinfo` never reads points.** The `count: 1` reader plus `quickinfo` is a header read; it is what makes indexing a thousand tiles take seconds.

**Paths go in as given.** Absolute paths break when storage moves; relative paths break when the working directory changes. Pick one, write it down, and make the index-building script the only thing that decides.

## Parameter Reference Table

| Option | Command | Effect |
|---|---|---|
| `--lyr_name` | `pdal tindex create` | Layer name inside the output; needed for SQL queries |
| `-f` | `pdal tindex create` | OGR driver; `GPKG` unless something insists on shapefile |
| `--fast_boundary` | `pdal tindex create` | Header bounding box instead of a computed hull |
| `--filters.hexbin.edge_size` | `pdal tindex create` | Hull resolution when not using the fast form |
| `-t_srs` | `pdal tindex create` | Reproject the index geometry; leaves the tiles untouched |
| `--stdin` | `pdal tindex create` | Read the file list from standard input, for very large campaigns |

## Validation and Integrity Checks

**Every file appears exactly once.** A count of index features against a count of input files catches both the double-append and a glob that missed a subdirectory.

**Every tile has a CRS, and they agree.** A campaign whose index contains two coordinate systems has a real problem that will otherwise surface at merge time — see [fixing CRS mismatches](https://www.pythonlidar.com/point-cloud-data-standards-fundamentals/coordinate-reference-systems/fixing-crs-mismatches-in-point-clouds/).

**Coverage has no holes.** Dissolve the polygons and compare the result against the project boundary. A hole is a missing delivery.

**Actual extents do not wildly exceed nominal ones.** A tile whose bounding box is twice its grid cell usually contains points that belong to a different tile, and every downstream buffered read will be wrong about what it needs.

<svg viewBox="0 0 720 258" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Four defects a tile index reveals before any point is processed" style="width:100%;max-width:720px;display:block;margin:1.6rem auto">
  <title>What the index catches before processing starts</title>
  <desc>Four checks on a freshly built index. Duplicate features mean the index was appended to rather than rebuilt. A missing polygon in the coverage means an undelivered tile. Two coordinate systems in one index means the campaign cannot be merged as it stands. An oversized bounding box means a tile holds points belonging elsewhere.</desc>
  <rect x="0" y="0" width="720" height="258" fill="var(--dg-bg)" rx="10"/>
  <rect x="20" y="44" width="330" height="44" rx="7" fill="var(--dg-e-soft)" stroke="var(--dg-e)" stroke-width="1.2"/>
  <text x="185" y="71" text-anchor="middle" font-size="11" fill="var(--dg-text)">2,480 features, 1,240 files</text>
  <rect x="380" y="44" width="320" height="44" rx="7" fill="var(--dg-d-soft)" stroke="var(--dg-d)" stroke-width="1.2"/>
  <text x="540" y="71" text-anchor="middle" font-size="11" fill="var(--dg-text)">the index was appended to, not rebuilt</text>
  <rect x="20" y="96" width="330" height="44" rx="7" fill="var(--dg-e-soft)" stroke="var(--dg-e)" stroke-width="1.2"/>
  <text x="185" y="123" text-anchor="middle" font-size="11" fill="var(--dg-text)">a hole in the dissolved coverage</text>
  <rect x="380" y="96" width="320" height="44" rx="7" fill="var(--dg-d-soft)" stroke="var(--dg-d)" stroke-width="1.2"/>
  <text x="540" y="123" text-anchor="middle" font-size="11" fill="var(--dg-text)">a tile was never delivered</text>
  <rect x="20" y="148" width="330" height="44" rx="7" fill="var(--dg-e-soft)" stroke="var(--dg-e)" stroke-width="1.2"/>
  <text x="185" y="175" text-anchor="middle" font-size="11" fill="var(--dg-text)">two distinct CRS values present</text>
  <rect x="380" y="148" width="320" height="44" rx="7" fill="var(--dg-d-soft)" stroke="var(--dg-d)" stroke-width="1.2"/>
  <text x="540" y="175" text-anchor="middle" font-size="11" fill="var(--dg-text)">reproject before anything is merged</text>
  <rect x="20" y="200" width="330" height="44" rx="7" fill="var(--dg-e-soft)" stroke="var(--dg-e)" stroke-width="1.2"/>
  <text x="185" y="227" text-anchor="middle" font-size="11" fill="var(--dg-text)">a bbox twice the grid cell</text>
  <rect x="380" y="200" width="320" height="44" rx="7" fill="var(--dg-d-soft)" stroke="var(--dg-d)" stroke-width="1.2"/>
  <text x="540" y="227" text-anchor="middle" font-size="11" fill="var(--dg-text)">the tile holds points from its neighbour</text>
</svg>

## The Index as a Job Ledger

The obvious use of a tile index is spatial lookup. The more valuable one, on a campaign that takes days to process, is as the record of what has been done.

Add three attributes and the index becomes a work queue: `status`, `run_id` and `updated_at`. A worker claims a tile by writing `running` with its own run identifier, writes `done` when the output object is durable, and leaves `failed` with the error when it is not. Restarting a job then becomes a query — every tile whose status is not `done` — rather than a decision about which files to reprocess, and the answer is the same whether the interruption was one crashed worker or a whole cluster going away.

This is the same idempotency argument that appears in [scaling PDAL tile processing with AWS Batch](https://www.pythonlidar.com/batch-automation-cloud-integration/aws-batch-processing/scaling-pdal-tile-processing-with-aws-batch/), with the state in a queryable layer instead of in marker objects. The two are complements rather than alternatives: the marker object is the authoritative per-tile fact, because it sits next to the output and cannot disagree with it, while the index is the aggregate view that answers "how far through are we" without listing a bucket. Where they disagree, the marker wins and the index is stale.

Two cautions. A GeoPackage is a SQLite file and does not tolerate many concurrent writers, so on a large fan-out the workers should write markers and a single collector should update the index, rather than every worker opening it. And the index must never become the only record of the run: it is a convenience built from things that are true elsewhere, and rebuilding it from the outputs should always be possible.

## Nominal Grids and Delivery Reality

A delivery grid is a promise about where tiles begin and end, and the point cloud inside a tile is only approximately bound by it. Three discrepancies show up often enough to plan for.

**Overlap.** Adjacent tiles frequently share a strip of points, either because the delivery was cut on flight lines rather than on the grid, or because the supplier buffered them deliberately. Merging tiles that overlap double-counts every point in the strip, which inflates density metrics and produces duplicate returns in any classification that follows. Cropping each tile to its nominal extent before merging costs one stage and removes the problem entirely.

**Undershoot.** A coastal or boundary tile may contain points across only part of its nominal cell, with the rest genuinely outside the project. Treating the nominal extent as the processing extent then produces a large NoData region that looks like a failure and is not. Carrying both extents in the index lets a report distinguish "no data was collected here" from "processing lost it".

**Gross mismatch.** A tile whose bounding box is several times its grid cell almost always holds points that belong to other tiles, usually because two deliveries were concatenated. This is worth catching at index time, because every buffered read afterwards will fetch the wrong neighbours — the tile's own bounding box already covers them, so the neighbour query returns nothing and the edge effects reappear silently.

The general rule is to store both extents, use the nominal one for partitioning work and the actual one for validation, and treat a systematic difference between them as information about the delivery rather than as noise to be normalised away.

## Performance Tuning

**Index headers, not points.** `--fast_boundary` is the difference between seconds and hours on a large campaign, and for the buffered-read use case the bounding box is all that is needed.

**Build once per delivery, not per job.** The index is an artefact with a lifetime. Rebuild when files change; otherwise read it.

**Use a spatial index on the layer.** GeoPackage creates one by default; a shapefile needs `ogrinfo -sql "CREATE SPATIAL INDEX ON tiles"`. Without it a neighbour query on 20,000 tiles is a full scan per lookup.

**Keep the index next to the data.** An index in one bucket and tiles in another produces path fields that are correct for exactly one consumer.

<svg viewBox="-2 30 724 235" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="The status values that turn a tile index into a work ledger" style="width:100%;max-width:720px;display:block;margin:1.6rem auto">
  <title>Four status values and what each one licenses</title>
  <desc>Four values the status field takes. Pending means the tile is available to claim. Running means a worker holds it, with its run identifier recorded. Done means the output object is durable and the tile can be skipped. Failed carries the error and is the queue a re-run starts from, together with pending.</desc>
  <rect x="-2" y="30" width="724" height="235" fill="var(--dg-bg)" rx="10"/>
  <rect x="20" y="52" width="240" height="36" rx="6" fill="var(--dg-surface)" stroke="var(--dg-line-soft)" stroke-width="1.2"/>
  <text x="140" y="74" text-anchor="middle" font-size="11" fill="var(--dg-text)">pending</text>
  <rect x="280" y="52" width="420" height="36" rx="6" fill="var(--dg-a-soft)" stroke="var(--dg-a)" stroke-width="1.2"/>
  <text x="490" y="74" text-anchor="middle" font-size="11" fill="var(--dg-text)">available to claim</text>
  <rect x="20" y="98" width="240" height="36" rx="6" fill="var(--dg-surface)" stroke="var(--dg-line-soft)" stroke-width="1.2"/>
  <text x="140" y="120" text-anchor="middle" font-size="11" fill="var(--dg-text)">running · run_id</text>
  <rect x="280" y="98" width="420" height="36" rx="6" fill="var(--dg-a-soft)" stroke="var(--dg-a)" stroke-width="1.2"/>
  <text x="490" y="120" text-anchor="middle" font-size="11" fill="var(--dg-text)">a worker holds it; stale after a timeout</text>
  <rect x="20" y="144" width="240" height="36" rx="6" fill="var(--dg-surface)" stroke="var(--dg-line-soft)" stroke-width="1.2"/>
  <text x="140" y="166" text-anchor="middle" font-size="11" fill="var(--dg-text)">done</text>
  <rect x="280" y="144" width="420" height="36" rx="6" fill="var(--dg-a-soft)" stroke="var(--dg-a)" stroke-width="1.2"/>
  <text x="490" y="166" text-anchor="middle" font-size="11" fill="var(--dg-text)">output durable — skip on re-run</text>
  <rect x="20" y="190" width="240" height="36" rx="6" fill="var(--dg-surface)" stroke="var(--dg-line-soft)" stroke-width="1.2"/>
  <text x="140" y="212" text-anchor="middle" font-size="11" fill="var(--dg-text)">failed · error</text>
  <rect x="280" y="190" width="420" height="36" rx="6" fill="var(--dg-a-soft)" stroke="var(--dg-a)" stroke-width="1.2"/>
  <text x="490" y="212" text-anchor="middle" font-size="11" fill="var(--dg-text)">re-run picks this up with pending</text>
  <text x="20" y="240" font-size="10.5" fill="var(--dg-muted)">where the ledger and the per-tile marker object disagree, the marker wins — it sits next to the output</text>
</svg>

## Common Errors and Troubleshooting

**Every tile appears twice.** `tindex create` appended to an existing file. Delete before rebuilding.

**Neighbour queries return nothing.** Either the layer has no spatial index and the SQL dialect fell back, or the buffer distance is in different units from the geometry — a lat/long index buffered by 10 "metres" buffers by ten degrees.

**Field names are truncated.** Shapefile's ten-character limit. Write GeoPackage.

**Paths in the index do not resolve.** Absolute paths from a machine that no longer exists. Store paths relative to the index and resolve them at read time.

**A tile is in the index but unreadable.** The index records what the header said at build time. Add a `readable` attribute set by a periodic verification pass rather than assuming.

## Frequently Asked Questions

**Why build a tile index instead of globbing the directory?**

Because the questions are spatial. Which tiles cover this corridor, which tiles neighbour this one, which tiles are missing from the coverage — none of them can be answered by a filename pattern, and answering them by opening headers each time turns a one-second query into a several-minute one.

**Why does my index have every tile twice?**

Because pdal tindex create appends to an existing layer. Re-running it against a file that already exists silently doubles every polygon, which is why the index-building script should delete the output first and be idempotent by construction.

**What is the difference between nominal and actual tile extent?**

The nominal extent is the rectangle the tile owns in the delivery grid; the actual extent is the bounding box of the points inside it. They differ because of flight-line overlap, and a tile whose actual extent is far larger than its nominal one usually holds points belonging to a neighbour.

**Should the index store absolute or relative paths?**

Relative to the index, resolved at read time. Absolute paths break when storage moves, which it always does; relative paths break only when someone separates the index from the data, which is a mistake worth making visible.

---

## Related

- [Batch Automation and Cloud Integration for PDAL](https://www.pythonlidar.com/batch-automation-cloud-integration/) — the section this workflow belongs to
- [Building a Tile Index with pdal tindex](https://www.pythonlidar.com/batch-automation-cloud-integration/tile-indexing-and-merging/building-a-tile-index-with-pdal-tindex/) — the command, its options and the checks to run on the result
- [Buffered Tiling to Avoid Edge Artefacts](https://www.pythonlidar.com/batch-automation-cloud-integration/tile-indexing-and-merging/buffered-tiling-to-avoid-edge-artefacts/) — using the index to give every tile its neighbours
- [Merging Processed Tiles into One LAZ](https://www.pythonlidar.com/batch-automation-cloud-integration/tile-indexing-and-merging/merging-processed-tiles-into-one-laz/) — putting the results back together without duplicating the overlaps
- [Building a Seamless DTM Mosaic from Tiles](https://www.pythonlidar.com/ground-filtering-dtm-dsm-generation/dtm-raster-generation/building-a-seamless-dtm-mosaic-from-tiles/) — the raster-side equivalent of the same problem
- [Scaling PDAL Tile Processing with AWS Batch](https://www.pythonlidar.com/batch-automation-cloud-integration/aws-batch-processing/scaling-pdal-tile-processing-with-aws-batch/) — the fan-out that consumes this index
