---
title: "Reading USGS 3DEP LiDAR from Public Cloud Storage"
description: "Pull USGS 3DEP LiDAR for an area of interest straight from public cloud storage with PDAL: find the right Entwine Point Tile dataset from the boundaries index, read only your bounds with readers.ept, control density with resolution, and reproject to a local CRS."
slug: "reading-usgs-3dep-lidar-from-public-cloud-storage"
type: "howto"
breadcrumb: "Reading 3DEP from Cloud"
datePublished: "2026-09-18"
dateModified: "2026-09-18"
---

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Article",
      "headline": "Reading USGS 3DEP LiDAR from Public Cloud Storage",
      "description": "Pull USGS 3DEP LiDAR for an area of interest straight from public cloud storage with PDAL: find the right Entwine Point Tile dataset from the boundaries index, read only your bounds with readers.ept, control density with resolution, and reproject to a local CRS.",
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
          "name": "S3 Cloud Storage I/O",
          "item": "https://www.pythonlidar.com/batch-automation-cloud-integration/s3-cloud-storage-io/"
        },
        {
          "@type": "ListItem",
          "position": 4,
          "name": "Reading 3DEP from Cloud",
          "item": "https://www.pythonlidar.com/batch-automation-cloud-integration/s3-cloud-storage-io/reading-usgs-3dep-lidar-from-public-cloud-storage/"
        }
      ]
    },
    {
      "@type": "HowTo",
      "name": "Read USGS 3DEP LiDAR from public cloud storage with PDAL",
      "step": [
        {
          "@type": "HowToStep",
          "name": "Find datasets that cover your area",
          "text": "Load the public resources.geojson boundaries index, maintained alongside the collection, and intersect it with your area of interest. Each feature has a name and an url pointing at its ept.json."
        },
        {
          "@type": "HowToStep",
          "name": "Express the area in the dataset's CRS",
          "text": "The EPT copies are stored in Web Mercator (EPSG:3857). Either reproject your polygon to 3857 or append the CRS to the bounds string, for example ([xmin, xmax], [ymin, ymax])/EPSG:4326."
        },
        {
          "@type": "HowToStep",
          "name": "Read with readers.ept",
          "text": "Pass filename, bounds or polygon, and optionally resolution to stop at a coarser octree level for previews."
        },
        {
          "@type": "HowToStep",
          "name": "Reproject and filter",
          "text": "Add filters.reprojection to a local projected CRS, and filters.range to drop noise classes 7 and 18."
        },
        {
          "@type": "HowToStep",
          "name": "Write locally or to your own bucket",
          "text": "Write LAZ or COPC for reuse, or go straight to a DTM with writers.gdal."
        }
      ]
    },
    {
      "@type": "FAQPage",
      "mainEntity": [
        {
          "@type": "Question",
          "name": "Do I need AWS credentials to read 3DEP EPT data?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "No. The Entwine Point Tile copies of 3DEP are in a public bucket and are read over HTTPS, so readers.ept works without an AWS account or credentials."
          }
        },
        {
          "@type": "Question",
          "name": "How do I find which 3DEP project covers my area?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Load the public boundaries GeoJSON that lists every EPT dataset with its footprint and URL, and intersect it with your area of interest. Several projects may overlap."
          }
        },
        {
          "@type": "Question",
          "name": "What CRS are the 3DEP EPT datasets in?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Web Mercator, EPSG:3857. Transform your query polygon to that CRS, or append the CRS to the bounds string, and reproject the output to a local projected CRS for analysis."
          }
        },
        {
          "@type": "Question",
          "name": "How can I get a quick low-density preview?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Set the resolution option on readers.ept to a few metres. PDAL then stops at a coarser octree level and downloads far fewer nodes."
          }
        },
        {
          "@type": "Question",
          "name": "Can I process 3DEP tiles in batch without downloading the whole project?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Yes. Split your area into tiles, and have each batch job read its own tile bounds, plus a small buffer, from the EPT dataset. Each job downloads only the octree nodes for its tile."
          }
        }
      ]
    }
  ]
}
</script>

**TL;DR:** The USGS 3DEP LiDAR collection is published on AWS as Entwine Point Tile (EPT) datasets, one per project, in the public `usgs-lidar-public` bucket. Look up which datasets cover your area in the public boundaries index, then point `readers.ept` at `https://s3-us-west-2.amazonaws.com/usgs-lidar-public/<project>/ept.json` with a `bounds` or `polygon` for your area. PDAL fetches only the octree nodes that intersect it, so you can read a few square kilometres from a project of billions of points in seconds.

## Context and Motivation

This guide is part of [S3 Cloud Storage I/O](https://www.pythonlidar.com/batch-automation-cloud-integration/s3-cloud-storage-io/). Downloading 3DEP data used to mean finding the right project, downloading whole tiles through a web map, and clipping locally. The EPT copies on AWS change that: each project is an octree of LAZ files on S3, indexed by a small `ept.json`, and PDAL's `readers.ept` can query it by area and level of detail. No account or credentials are needed for these public datasets, and nothing outside your area is downloaded.

That makes 3DEP a practical input for batch jobs — a site-suitability screen over hundreds of parcels, a flood model needing a fresh DTM for one catchment — without keeping a local copy of the national collection.

<svg viewBox="0 0 740 220" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Querying an EPT octree by area" style="width:100%;max-width:740px;display:block;margin:1.6rem auto">
  <title>Only the nodes you need</title>
  <desc>An EPT dataset is drawn as a grid of octree nodes over a whole project. A small area of interest overlaps four nodes, which are highlighted. readers.ept downloads only those nodes and their coarser parents, leaving the rest of the project untouched on S3.</desc>
  <rect x="0" y="0" width="740" height="220" fill="var(--dg-bg)" rx="10"/>
  <g stroke="var(--dg-line)" stroke-width="1" fill="var(--dg-surface-2)">
    <rect x="30" y="20" width="60" height="45"/><rect x="90" y="20" width="60" height="45"/><rect x="150" y="20" width="60" height="45"/><rect x="210" y="20" width="60" height="45"/><rect x="270" y="20" width="60" height="45"/><rect x="330" y="20" width="60" height="45"/>
    <rect x="30" y="65" width="60" height="45"/><rect x="90" y="65" width="60" height="45"/><rect x="150" y="65" width="60" height="45"/><rect x="210" y="65" width="60" height="45"/><rect x="270" y="65" width="60" height="45"/><rect x="330" y="65" width="60" height="45"/>
    <rect x="30" y="110" width="60" height="45"/><rect x="90" y="110" width="60" height="45"/><rect x="150" y="110" width="60" height="45"/><rect x="210" y="110" width="60" height="45"/><rect x="270" y="110" width="60" height="45"/><rect x="330" y="110" width="60" height="45"/>
    <rect x="30" y="155" width="60" height="45"/><rect x="90" y="155" width="60" height="45"/><rect x="150" y="155" width="60" height="45"/><rect x="210" y="155" width="60" height="45"/><rect x="270" y="155" width="60" height="45"/><rect x="330" y="155" width="60" height="45"/>
  </g>
  <g stroke="var(--dg-a)" stroke-width="1.4" fill="var(--dg-a-soft)">
    <rect x="150" y="65" width="60" height="45"/><rect x="210" y="65" width="60" height="45"/>
    <rect x="150" y="110" width="60" height="45"/><rect x="210" y="110" width="60" height="45"/>
  </g>
  <path d="M175 82 L250 78 L258 132 L182 140 Z" fill="none" stroke="var(--dg-d)" stroke-width="2"/>
  <g font-size="10.5" fill="var(--dg-text)">
    <text x="430" y="60" text-anchor="start">whole project on S3: billions of points</text>
    <text x="430" y="100" text-anchor="start">area of interest (polygon)</text>
    <text x="430" y="140" text-anchor="start">4 intersecting nodes downloaded</text>
  </g>
  <line x1="392" y1="56" x2="424" y2="56" stroke="var(--dg-line)" stroke-width="1.2"/>
  <line x1="262" y1="96" x2="424" y2="96" stroke="var(--dg-d)" stroke-width="1.2"/>
  <line x1="272" y1="136" x2="424" y2="136" stroke="var(--dg-a)" stroke-width="1.2"/>
</svg>

## Prerequisites and Assumptions

- PDAL 2.4 or newer with `readers.ept` (standard in conda-forge builds) and python-pdal.
- GeoPandas and Shapely to query the boundaries index.
- Internet access to `s3-us-west-2.amazonaws.com`; compute in AWS `us-west-2` is fastest.

## Step-by-Step Implementation

### Step 1 — Find datasets that cover your area

Load the public `resources.geojson` boundaries index, maintained alongside the collection, and intersect it with your area of interest. Each feature has a `name` and an `url` pointing at its `ept.json`.

### Step 2 — Express the area in the dataset's CRS

The EPT copies are stored in Web Mercator (EPSG:3857). Either reproject your polygon to 3857 or append the CRS to the bounds string, for example `([xmin, xmax], [ymin, ymax])/EPSG:4326`.

### Step 3 — Read with readers.ept

Pass `filename`, `bounds` or `polygon`, and optionally `resolution` to stop at a coarser octree level for previews.

### Step 4 — Reproject and filter

Add `filters.reprojection` to a local projected CRS, and `filters.range` to drop noise classes 7 and 18.

### Step 5 — Write locally or to your own bucket

Write LAZ or COPC for reuse, or go straight to a DTM with `writers.gdal`.

## Complete Working Example

```python
"""Fetch 3DEP points for a polygon from public EPT and write a local COPC."""
import json

import geopandas as gpd
import pdal
from shapely.geometry import box

INDEX = "https://raw.githubusercontent.com/hobuinc/usgs-lidar/master/boundaries/resources.geojson"
aoi = gpd.GeoDataFrame(geometry=[box(-105.29, 40.00, -105.26, 40.02)], crs="EPSG:4326")

# 1. which projects cover the area?
index = gpd.read_file(INDEX).to_crs(4326)
hits = index[index.intersects(aoi.geometry.iloc[0])]
print(hits[["name", "count"]].to_string(index=False))
ept_url = hits.iloc[0]["url"]                      # pick the most recent or densest

# 2. polygon in the dataset's CRS (EPSG:3857)
poly_3857 = aoi.to_crs(3857).geometry.iloc[0].wkt

# 3-5. read, clean, reproject, write
spec = {"pipeline": [
    {"type": "readers.ept", "filename": ept_url, "polygon": poly_3857, "threads": 8},
    {"type": "filters.range", "limits": "Classification![7:7],Classification![18:18]"},
    {"type": "filters.reprojection", "out_srs": "EPSG:26913+5703"},
    {"type": "writers.copc", "filename": "boulder_aoi.copc.laz", "forward": "all"},
]}
p = pdal.Pipeline(json.dumps(spec))
n = p.execute()
print(f"{n:,} points written")
```

A quick preview at reduced density uses `resolution`, in the dataset's units (metres in EPSG:3857):

```bash
pdal translate https://s3-us-west-2.amazonaws.com/usgs-lidar-public/<project>/ept.json preview.laz \
  --readers.ept.bounds="([-11722000, -11718000], [4865000, 4869000])" \
  --readers.ept.resolution=5
```

<svg viewBox="0 0 740 190" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Octree resolution levels and point density" style="width:100%;max-width:740px;display:block;margin:1.6rem auto">
  <title>Resolution picks the octree depth</title>
  <desc>Three panels show the same area read at resolution 10, 2 and full depth. At resolution 10 the points are sparse and the download is tiny, suitable for a preview. At 2 the terrain shape is clear. At full depth every point is read and the download is largest.</desc>
  <rect x="0" y="0" width="740" height="190" fill="var(--dg-bg)" rx="10"/>
  <g stroke="var(--dg-line)" stroke-width="1.2" fill="var(--dg-surface)">
    <rect x="20" y="20" width="220" height="120" rx="8"/>
    <rect x="260" y="20" width="220" height="120" rx="8"/>
    <rect x="500" y="20" width="220" height="120" rx="8"/>
  </g>
  <g fill="var(--dg-a)">
    <circle cx="60" cy="50" r="2.5"/><circle cx="120" cy="70" r="2.5"/><circle cx="180" cy="55" r="2.5"/><circle cx="90" cy="110" r="2.5"/><circle cx="200" cy="115" r="2.5"/><circle cx="150" cy="95" r="2.5"/>
  </g>
  <g fill="var(--dg-a)">
    <circle cx="280" cy="40" r="2"/><circle cx="300" cy="60" r="2"/><circle cx="320" cy="45" r="2"/><circle cx="340" cy="75" r="2"/><circle cx="360" cy="50" r="2"/><circle cx="380" cy="90" r="2"/><circle cx="400" cy="65" r="2"/><circle cx="420" cy="110" r="2"/><circle cx="440" cy="80" r="2"/><circle cx="460" cy="120" r="2"/><circle cx="290" cy="100" r="2"/><circle cx="310" cy="120" r="2"/><circle cx="350" cy="110" r="2"/><circle cx="390" cy="125" r="2"/><circle cx="430" cy="40" r="2"/><circle cx="455" cy="55" r="2"/>
  </g>
  <rect x="512" y="32" width="196" height="96" rx="4" fill="var(--dg-a-soft)" stroke="var(--dg-a)"/>
  <g font-size="10.5" fill="var(--dg-text)">
    <text text-anchor="middle" x="130" y="162">resolution 10: preview</text>
    <text text-anchor="middle" x="370" y="162">resolution 2: shape</text>
    <text text-anchor="middle" x="610" y="162">full depth: every point</text>
  </g>
  <text x="370" y="182" text-anchor="middle" font-size="10" fill="var(--dg-muted)">coarser levels download far fewer nodes</text>
</svg>

## Choosing Between Overlapping Projects

Many places are covered by several 3DEP projects: an older county collection, a newer statewide one, sometimes a specialised survey. The boundaries index lists them all, and the choice matters. Prefer the most recent project unless you need a specific date for change analysis, and check its point count against the area to estimate density — a Quality Level 1 project has several times the density of an older QL2 one. Project names usually carry a year, and the metadata linked from the USGS project pages gives the collection dates, accuracy reports and classification scheme, which you should read before trusting a classification for anything important. Reading two projects over the same area and differencing their DTMs is also an easy first change-detection experiment.

Remember that project boundaries are approximate footprints, not exact coverage; gaps and irregular edges inside a boundary are normal, so check point counts after reading.

## Key Parameter Table

| Option | Example | Effect |
|---|---|---|
| `filename` | `.../usgs-lidar-public/<project>/ept.json` | Dataset to read |
| `bounds` | `([x0,x1],[y0,y1])` or `/EPSG:4326` suffix | Box query |
| `polygon` | WKT in EPSG:3857 | Exact area query |
| `resolution` | 1–10 (m) | Stop at a coarser octree level |
| `threads` | 4–16 | Parallel node downloads |
| `filters.reprojection` `out_srs` | local UTM + vertical | Work in metres locally |

## Verification

- **Point count.** Compare the count with the project's approximate density times your area; a much smaller number usually means the polygon was in the wrong CRS.
- **Bounds.** `pdal info --summary` on the output shows bounds inside your area after reprojection.
- **Classification.** `pdal info --stats` shows the classes present; some older projects lack a full ASPRS classification.

## Gotchas and Edge Cases

**Wrong CRS for the query.** Passing a longitude and latitude box without a CRS suffix is interpreted in Web Mercator and selects a tiny area near the null island. Always reproject or append the CRS.

**Mixed vertical datums.** Projects differ in vertical datum and geoid; when combining two, reproject both to the same compound CRS before comparing heights.

**Service changes.** The public index location and bucket layout are maintained by the community project behind the collection; if a URL moves, check the project's repository for the current index.

<svg viewBox="0 0 740 170" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Effect of querying with the wrong CRS" style="width:100%;max-width:740px;display:block;margin:1.6rem auto">
  <title>Degrees read as metres</title>
  <desc>A correct query with the bounds transformed into EPSG:3857 selects the intended area. The same numbers passed without a CRS are read as Web Mercator metres, selecting a box a few hundred metres wide near 0,0 in the ocean, which returns no points.</desc>
  <rect x="0" y="0" width="740" height="170" fill="var(--dg-bg)" rx="10"/>
  <rect x="20" y="30" width="330" height="100" rx="10" fill="var(--dg-d-soft)" stroke="var(--dg-d)" stroke-width="1.3"/>
  <text x="185" y="62" text-anchor="middle" font-size="11.5" font-weight="600" fill="var(--dg-text)">bounds …/EPSG:4326</text>
  <text x="185" y="88" text-anchor="middle" font-size="10.5" fill="var(--dg-text)">transformed to 3857</text>
  <text x="185" y="108" text-anchor="middle" font-size="10.5" fill="var(--dg-text)">millions of points</text>
  <rect x="390" y="30" width="330" height="100" rx="10" fill="var(--dg-e-soft)" stroke="var(--dg-e)" stroke-width="1.3"/>
  <text x="555" y="62" text-anchor="middle" font-size="11.5" font-weight="600" fill="var(--dg-text)">bounds with no CRS</text>
  <text x="555" y="88" text-anchor="middle" font-size="10.5" fill="var(--dg-text)">read as metres near 0,0</text>
  <text x="555" y="108" text-anchor="middle" font-size="10.5" fill="var(--dg-text)">zero points</text>
  <text x="370" y="156" text-anchor="middle" font-size="10.5" fill="var(--dg-muted)">EPT data is stored in EPSG:3857</text>
</svg>

## Frequently Asked Questions

**Do I need AWS credentials to read 3DEP EPT data?**

No. The Entwine Point Tile copies of 3DEP are in a public bucket and are read over HTTPS, so readers.ept works without an AWS account or credentials.

**How do I find which 3DEP project covers my area?**

Load the public boundaries GeoJSON that lists every EPT dataset with its footprint and URL, and intersect it with your area of interest. Several projects may overlap.

**What CRS are the 3DEP EPT datasets in?**

Web Mercator, EPSG:3857. Transform your query polygon to that CRS, or append the CRS to the bounds string, and reproject the output to a local projected CRS for analysis.

**How can I get a quick low-density preview?**

Set the resolution option on readers.ept to a few metres. PDAL then stops at a coarser octree level and downloads far fewer nodes.

**Can I process 3DEP tiles in batch without downloading the whole project?**

Yes. Split your area into tiles, and have each batch job read its own tile bounds, plus a small buffer, from the EPT dataset. Each job downloads only the octree nodes for its tile.

## Related

- [S3 Cloud Storage I/O](https://www.pythonlidar.com/batch-automation-cloud-integration/s3-cloud-storage-io/) — reading and writing LiDAR in object storage
- [Streaming LAZ from S3 with PDAL](https://www.pythonlidar.com/batch-automation-cloud-integration/s3-cloud-storage-io/streaming-laz-from-s3-with-pdal/) — reading individual LAZ tiles
- [Reading COPC in Python with laspy](https://www.pythonlidar.com/point-cloud-data-standards-fundamentals/copc-and-cloud-native-formats/reading-copc-in-python-with-laspy/) — the single-file cloud format
- [Choosing a Projected CRS for a LiDAR Project](https://www.pythonlidar.com/point-cloud-data-standards-fundamentals/coordinate-reference-systems/choosing-a-projected-crs-for-a-lidar-project/) — picking out_srs
