---
title: "Reading COPC in Python with laspy"
description: "Query Cloud Optimized Point Cloud files from Python without PDAL: laspy's CopcReader over local files and HTTPS, bounds and resolution queries, octree levels, converting results to NumPy, and how many bytes a query actually fetches."
slug: "reading-copc-in-python-with-laspy"
type: "howto"
breadcrumb: "Reading COPC with laspy"
datePublished: "2026-09-18"
dateModified: "2026-09-18"
---

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Article",
      "headline": "Reading COPC in Python with laspy",
      "description": "Query Cloud Optimized Point Cloud files from Python without PDAL: laspy's CopcReader over local files and HTTPS, bounds and resolution queries, octree levels, converting results to NumPy, and how many bytes a query actually fetches.",
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
          "name": "Point Cloud Data Standards & Fundamentals",
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
          "name": "Reading COPC with laspy",
          "item": "https://www.pythonlidar.com/point-cloud-data-standards-fundamentals/copc-and-cloud-native-formats/reading-copc-in-python-with-laspy/"
        }
      ]
    },
    {
      "@type": "HowTo",
      "name": "Query a COPC file from Python with laspy",
      "step": [
        {
          "@type": "HowToStep",
          "name": "Open the reader",
          "text": "laspy.CopcReader.open(path_or_url) reads the header, the COPC info VLR and the root hierarchy page \u2014 a few kilobytes."
        },
        {
          "@type": "HowToStep",
          "name": "Inspect the header",
          "text": "reader.header exposes bounds, point count, scales and CRS just like a LAS header; reader.copc_info gives the octree's centre, half-size and root spacing."
        },
        {
          "@type": "HowToStep",
          "name": "Query by bounds",
          "text": "reader.query(bounds=laspy.Bounds(mins=..., maxs=...)) returns every point in the box at full resolution."
        },
        {
          "@type": "HowToStep",
          "name": "Limit resolution for overviews",
          "text": "Add resolution= (metres). laspy stops descending the octree once a level's spacing is at or below the requested value \u2014 ideal for previews and coarse DEMs."
        },
        {
          "@type": "HowToStep",
          "name": "Use the result like any point record",
          "text": "Access scaled coordinates and fields, stack into arrays, or write to LAS with the reader's header."
        }
      ]
    },
    {
      "@type": "FAQPage",
      "mainEntity": [
        {
          "@type": "Question",
          "name": "Can laspy read COPC files over HTTP?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Yes. With the requests package installed, CopcReader opens https URLs and fetches only the byte ranges it needs for the header, hierarchy and the octree nodes your query touches."
          }
        },
        {
          "@type": "Question",
          "name": "What does the resolution argument do?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "It tells laspy how far down the octree to go. Each level has roughly half the point spacing of the one above; the query stops at the first level whose spacing is at or below the requested resolution, returning a thinned but evenly distributed sample."
          }
        },
        {
          "@type": "Question",
          "name": "Should I use laspy or PDAL for COPC?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "laspy for lightweight access from Python with minimal dependencies, such as notebooks and web services. PDAL for pipelines that go on to filter, reproject or rasterize, or that need credential-aware cloud access."
          }
        },
        {
          "@type": "Question",
          "name": "How do I save a COPC query result as LAZ?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Create a LasData with the reader's header, assign the returned points, and write it to a .laz path. The header's counts and bounds are recomputed on write."
          }
        }
      ]
    }
  ]
}
</script>

**TL;DR:** `with laspy.CopcReader.open("https://…/tile.copc.laz") as r: pts = r.query(bounds=laspy.Bounds(mins=np.array([x0, y0]), maxs=np.array([x1, y1])), resolution=1.0)` fetches only the octree nodes intersecting the box, down to the level whose point spacing is about the requested resolution. Install `laspy[lazrs]` and `requests` for HTTP. The result is a point record with the usual `x`, `y`, `z`, `classification` fields.

## Context and Motivation

This guide is part of [COPC and Cloud-Native Point Cloud Formats](https://www.pythonlidar.com/point-cloud-data-standards-fundamentals/copc-and-cloud-native-formats/). COPC's value is that a client can read a small area, or a coarse overview, of a huge file by fetching a few byte ranges. PDAL's `readers.copc` is the full-featured way to do that inside pipelines. laspy's `CopcReader` is the lightweight alternative: pure pip install, no GDAL or PROJ, NumPy arrays out — ideal for notebooks, web services, serverless functions and quick checks against a remote dataset.

<svg viewBox="0 0 740 220" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="A bounds query selecting octree nodes at levels up to the requested resolution" style="width:100%;max-width:740px;display:block;margin:1.6rem auto">
  <title>Which nodes a query fetches</title>
  <desc>An octree drawn as four levels of nodes from coarse at the top to fine at the bottom. A query box covers a small part of the area. Nodes at each level that intersect the box are highlighted, but only down to level 2, because the requested resolution is met there. Finer nodes and nodes outside the box are never fetched.</desc>
  <rect x="0" y="0" width="740" height="220" fill="var(--dg-bg)" rx="10"/>
  <g font-size="10" fill="var(--dg-muted)"><text x="20" y="42">level 0</text><text x="20" y="92">level 1</text><text x="20" y="142">level 2</text><text x="20" y="192">level 3</text></g>
  <rect x="100" y="28" width="560" height="24" rx="4" fill="var(--dg-a-soft)" stroke="var(--dg-a)" stroke-width="1.2"/>
  <g stroke="var(--dg-line)" stroke-width="1"><rect x="100" y="78" width="140" height="24" fill="var(--dg-surface)"/><rect x="240" y="78" width="140" height="24" fill="var(--dg-a-soft)"/><rect x="380" y="78" width="140" height="24" fill="var(--dg-surface)"/><rect x="520" y="78" width="140" height="24" fill="var(--dg-surface)"/></g>
  <g stroke="var(--dg-line)" stroke-width="1" fill="var(--dg-surface)"><rect x="100" y="128" width="70" height="24"/><rect x="170" y="128" width="70" height="24"/><rect x="240" y="128" width="70" height="24"/><rect x="380" y="128" width="70" height="24"/><rect x="450" y="128" width="70" height="24"/><rect x="520" y="128" width="70" height="24"/><rect x="590" y="128" width="70" height="24"/></g>
  <rect x="310" y="128" width="70" height="24" fill="var(--dg-a-soft)" stroke="var(--dg-a)" stroke-width="1.2"/>
  <g stroke="var(--dg-line-soft)" stroke-width="1" fill="var(--dg-surface-2)"><rect x="100" y="178" width="35" height="24"/><rect x="135" y="178" width="35" height="24"/><rect x="170" y="178" width="35" height="24"/><rect x="205" y="178" width="35" height="24"/><rect x="240" y="178" width="35" height="24"/><rect x="275" y="178" width="35" height="24"/><rect x="310" y="178" width="35" height="24"/><rect x="345" y="178" width="35" height="24"/><rect x="380" y="178" width="35" height="24"/><rect x="415" y="178" width="35" height="24"/><rect x="450" y="178" width="35" height="24"/><rect x="485" y="178" width="35" height="24"/><rect x="520" y="178" width="35" height="24"/><rect x="555" y="178" width="35" height="24"/><rect x="590" y="178" width="35" height="24"/><rect x="625" y="178" width="35" height="24"/></g>
  <text x="680" y="44" font-size="10" fill="var(--dg-text)">fetched</text>
  <text x="680" y="94" font-size="10" fill="var(--dg-text)">1 of 4</text>
  <text x="680" y="144" font-size="10" fill="var(--dg-text)">1 of 8</text>
  <text x="680" y="194" font-size="10" fill="var(--dg-muted)">none</text>
</svg>

## Prerequisites and Assumptions

- laspy 2.4+ installed with `pip install "laspy[lazrs]" requests`.
- A COPC file, local or served over HTTP(S) with range-request support — which includes S3, Azure Blob and most static hosting.
- Coordinates of the area you want in the file's CRS; `reader.header.parse_crs()` tells you what that is.

## Step-by-Step Implementation

### Step 1 — Open the reader

`laspy.CopcReader.open(path_or_url)` reads the header, the COPC info VLR and the root hierarchy page — a few kilobytes.

### Step 2 — Inspect the header

`reader.header` exposes bounds, point count, scales and CRS just like a LAS header; `reader.copc_info` gives the octree's centre, half-size and root spacing.

### Step 3 — Query by bounds

`reader.query(bounds=laspy.Bounds(mins=..., maxs=...))` returns every point in the box at full resolution.

### Step 4 — Limit resolution for overviews

Add `resolution=` (metres). laspy stops descending the octree once a level's spacing is at or below the requested value — ideal for previews and coarse DEMs.

### Step 5 — Use the result like any point record

Access scaled coordinates and fields, stack into arrays, or write to LAS with the reader's header.

## Complete Working Example

```python
"""Query a remote COPC file by bounds and resolution with laspy."""
from __future__ import annotations

import time

import laspy
import numpy as np

URL = "https://data.example.org/lidar/county_block_7.copc.laz"

with laspy.CopcReader.open(URL) as reader:
    h = reader.header
    print(f"{h.point_count:,} points, CRS: {h.parse_crs().name}")
    print("bounds:", np.round(h.mins, 1), np.round(h.maxs, 1))

    cx, cy = (h.mins[0] + h.maxs[0]) / 2, (h.mins[1] + h.maxs[1]) / 2
    box = laspy.Bounds(mins=np.array([cx - 250, cy - 250]), maxs=np.array([cx + 250, cy + 250]))

    for res in (8.0, 2.0, None):                       # coarse overview → full detail
        t0 = time.perf_counter()
        pts = reader.query(bounds=box, resolution=res) if res else reader.query(bounds=box)
        dt = time.perf_counter() - t0
        label = f"{res} m" if res else "full"
        print(f"{label:>6}: {len(pts):>10,} points in {dt:5.1f} s")

    ground = pts[pts.classification == 2]
    xyz = np.vstack((ground.x, ground.y, ground.z)).T
    print("ground points in the box:", xyz.shape[0])

    out = laspy.LasData(reader.header)
    out.points = pts
    out.write("out/block7_center_500m.laz")
```

Illustrative output for a 500 m box on a statewide COPC file:

```text
142,318,907 points, CRS: NAD83(2011) / UTM zone 15N + NAVD88 height
bounds: [ 402000. 4461000.  180.3] [ 462000. 4521000.  512.8]
   8.0 m:      8,112 points in   0.6 s
   2.0 m:    121,740 points in   1.4 s
  full:    3,904,221 points in   6.2 s
ground points in the box: 1,702,558
```

<svg viewBox="120 0 610 200" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Points and bytes fetched per query resolution compared with downloading the whole file" style="width:100%;max-width:740px;display:block;margin:1.6rem auto">
  <title>Bytes fetched versus the whole file</title>
  <desc>Horizontal bars on a log scale of data transferred. An 8 metre overview of a 500 metre box fetches about 0.3 megabytes. A 2 metre query fetches about 2 megabytes. A full-resolution query fetches about 38 megabytes. Downloading the whole 1.3 gigabyte file would be over thirty times more than even the full-resolution query.</desc>
  <rect x="120" y="0" width="610" height="200" fill="var(--dg-bg)" rx="10"/>
  <g font-size="11" fill="var(--dg-text)"><text text-anchor="end" x="220" y="42">8 m overview</text><text text-anchor="end" x="220" y="82">2 m</text><text text-anchor="end" x="220" y="122">full resolution</text><text text-anchor="end" x="220" y="162">whole file</text></g>
  <rect x="230" y="28" width="40" height="20" fill="var(--dg-d)"/>
  <rect x="230" y="68" width="110" height="20" fill="var(--dg-d)"/>
  <rect x="230" y="108" width="250" height="20" fill="var(--dg-b)"/>
  <rect x="230" y="148" width="460" height="20" fill="var(--dg-e)"/>
  <g font-size="10.5" fill="var(--dg-muted)"><text x="278" y="43">0.3 MB</text><text x="348" y="83">2 MB</text><text x="488" y="123">38 MB</text></g>
  <text x="682" y="186" text-anchor="end" font-size="10.5" fill="var(--dg-muted)">1.3 GB · log scale, illustrative</text>
</svg>

## Choosing Query Sizes for Interactive Work

The most useful habit with `CopcReader` is to query coarse first and refine only where needed. An 8 m overview of a whole county returns a few hundred thousand points in seconds — enough to see coverage, spot gaps, check classification colours and choose where to look closer. Only then do full-resolution queries on the handful of boxes that matter, each small enough to return in a few seconds.

Box size matters as much as resolution. Octree nodes near the root cover large areas, so a query that barely crosses a node boundary pulls in that whole node's points at coarse levels. Aligning query boxes to round coordinates — multiples of 100 or 250 m — and keeping them compact rather than long and thin keeps the number of touched nodes down. For systematic work over a large area, tile the area into boxes of a few hundred metres and query them in turn; each query is independent, so a thread pool can overlap the network waits.

Finally, remember that every query re-reads hierarchy pages it needs. Keep one reader open for a session of queries rather than reopening the URL each time; the reader caches what it has already fetched.

## Key Parameter Table

| Argument | Type | Meaning |
|---|---|---|
| `bounds` | `laspy.Bounds` | 2D or 3D box in file coordinates; omit for the whole file |
| `resolution` | float, m | Stop at the octree level whose spacing reaches this |
| `level` | int or range | Query specific octree levels directly |
| `reader.copc_info.spacing` | float | Root node point spacing |
| `reader.header` | `LasHeader` | Standard LAS header with CRS |
| HTTP support | `requests` installed | Enables `https://` sources |

## Verification

- **Points inside the box.** All returned x and y should lie within the requested bounds.
- **Monotonic counts.** Finer resolutions return more points, and a full query returns the most.
- **Match PDAL.** On one box, `readers.copc` with the same bounds should return the same count at full resolution.

```python
assert (pts.x >= box.mins[0]).all() and (pts.x <= box.maxs[0]).all()
assert (pts.y >= box.mins[1]).all() and (pts.y <= box.maxs[1]).all()
```

## Gotchas and Edge Cases

**Bounds in the file's CRS.** A box in longitude and latitude against a UTM file returns nothing. Transform your area of interest with pyproj first.

**Resolution is approximate.** Octree levels halve spacing at each step, so the achieved density is at the first level at or finer than the request — somewhere between the requested value and half of it.

**Servers without range requests.** Some web servers ignore `Range` headers and return the whole file. The query then still works but downloads everything; check timings and server configuration.

<svg viewBox="0 0 740 170" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Octree level spacing halving at each level against a requested resolution" style="width:100%;max-width:740px;display:block;margin:1.6rem auto">
  <title>How resolution maps to levels</title>
  <desc>A row of octree levels with spacing halving at each step: 16, 8, 4, 2 and 1 metres. A requested resolution of 3 metres is drawn between the 4 and 2 metre levels. The query descends to the 2 metre level, the first one at or below the request, so the returned spacing is finer than asked for.</desc>
  <rect x="0" y="0" width="740" height="170" fill="var(--dg-bg)" rx="10"/>
  <line x1="60" y1="80" x2="700" y2="80" stroke="var(--dg-line)" stroke-width="1.3"/>
  <g fill="var(--dg-a)"><circle cx="100" cy="80" r="6"/><circle cx="240" cy="80" r="6"/><circle cx="380" cy="80" r="6"/><circle cx="520" cy="80" r="6"/><circle cx="660" cy="80" r="6"/></g>
  <g font-size="10.5" fill="var(--dg-text)"><text text-anchor="middle" x="100" y="110">16 m</text><text text-anchor="middle" x="240" y="110">8 m</text><text text-anchor="middle" x="380" y="110">4 m</text><text text-anchor="middle" x="520" y="110">2 m</text><text text-anchor="middle" x="660" y="110">1 m</text></g>
  <line x1="450" y1="44" x2="450" y2="80" stroke="var(--dg-e)" stroke-width="1.6" stroke-dasharray="4 3"/>
  <text x="450" y="36" text-anchor="middle" font-size="10.5" fill="var(--dg-e)">requested 3 m</text>
  <text x="520" y="140" text-anchor="middle" font-size="10.5" fill="var(--dg-d)">query stops here</text>
</svg>

**Authentication.** Private buckets need signed URLs or credentials. laspy's HTTP source reads URLs as given; generate a pre-signed URL for S3 objects, or use PDAL with `/vsis3/` for credential-chain access.

## Frequently Asked Questions

**Can laspy read COPC files over HTTP?**

Yes. With the requests package installed, CopcReader opens https URLs and fetches only the byte ranges it needs for the header, hierarchy and the octree nodes your query touches.

**What does the resolution argument do?**

It tells laspy how far down the octree to go. Each level has roughly half the point spacing of the one above; the query stops at the first level whose spacing is at or below the requested resolution, returning a thinned but evenly distributed sample.

**Should I use laspy or PDAL for COPC?**

laspy for lightweight access from Python with minimal dependencies, such as notebooks and web services. PDAL for pipelines that go on to filter, reproject or rasterize, or that need credential-aware cloud access.

**How do I save a COPC query result as LAZ?**

Create a LasData with the reader's header, assign the returned points, and write it to a .laz path. The header's counts and bounds are recomputed on write.

## Related

- [COPC and Cloud-Native Point Cloud Formats](https://www.pythonlidar.com/point-cloud-data-standards-fundamentals/copc-and-cloud-native-formats/) — how COPC works
- [Querying a COPC File by Bounds and Resolution](https://www.pythonlidar.com/point-cloud-data-standards-fundamentals/copc-and-cloud-native-formats/querying-a-copc-file-by-bounds-and-resolution/) — the PDAL route
- [Converting LAZ Tiles to COPC with PDAL](https://www.pythonlidar.com/point-cloud-data-standards-fundamentals/copc-and-cloud-native-formats/converting-laz-tiles-to-copc-with-pdal/) — producing COPC files
- [laspy and NumPy Workflows for LAS Data](https://www.pythonlidar.com/point-cloud-data-standards-fundamentals/laspy-numpy-workflows/) — laspy in general
- [Reading USGS 3DEP LiDAR from Public Cloud Storage](https://www.pythonlidar.com/batch-automation-cloud-integration/s3-cloud-storage-io/reading-usgs-3dep-lidar-from-public-cloud-storage/) — public cloud-native data
