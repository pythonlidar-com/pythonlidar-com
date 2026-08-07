---
title: "Configuring GDAL /vsis3/ for Fast Point Cloud Reads"
description: "The environment variables that decide what an S3 read costs — starting with the directory listing GDAL issues on every open, which on a large fan-out is worth a factor of three."
slug: "configuring-gdal-vsis3-for-fast-point-cloud-reads"
type: "howto"
breadcrumb: "Configuring GDAL vsis3"
datePublished: "2026-08-07"
dateModified: "2026-08-07"
---

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Article",
      "headline": "Configuring GDAL /vsis3/ for Fast Point Cloud Reads",
      "description": "The environment variables that decide what an S3 read costs \u2014 starting with the directory listing GDAL issues on every open, which on a large fan-out is worth a factor of three.",
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
          "name": "S3 and Cloud Storage I/O",
          "item": "https://www.pythonlidar.com/batch-automation-cloud-integration/s3-cloud-storage-io/"
        },
        {
          "@type": "ListItem",
          "position": 4,
          "name": "Configuring GDAL vsis3",
          "item": "https://www.pythonlidar.com/batch-automation-cloud-integration/s3-cloud-storage-io/configuring-gdal-vsis3-for-fast-point-cloud-reads/"
        }
      ]
    },
    {
      "@type": "HowTo",
      "name": "Tune the GDAL virtual filesystem for fast S3 point cloud reads",
      "step": [
        {
          "@type": "HowToStep",
          "name": "Disable the directory listing on open",
          "text": "Set GDAL_DISABLE_READDIR_ON_OPEN to EMPTY_DIR so opening an object does not first list its prefix."
        },
        {
          "@type": "HowToStep",
          "name": "Turn on the read cache",
          "text": "Enable VSI_CACHE and size the per-file and process-wide caches to hold headers and indexes."
        },
        {
          "@type": "HowToStep",
          "name": "Size the range requests",
          "text": "Set the curl chunk size to about one megabyte so per-request latency does not dominate."
        },
        {
          "@type": "HowToStep",
          "name": "Set the region and any bucket policy flags",
          "text": "Declare the region explicitly and add the requester-pays flag only where the bucket needs it."
        },
        {
          "@type": "HowToStep",
          "name": "Put the settings in the container environment",
          "text": "GDAL reads them at driver initialisation, so setting them after importing PDAL is too late."
        }
      ]
    },
    {
      "@type": "FAQPage",
      "mainEntity": [
        {
          "@type": "Question",
          "name": "Why is opening a small object from S3 so slow?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Because GDAL lists the containing prefix first, in case the dataset has sibling files. For a self-contained format such as LAZ there are none, and on a prefix holding twenty thousand objects that listing is paginated and repeated for every open. Setting GDAL_DISABLE_READDIR_ON_OPEN to EMPTY_DIR removes it."
          }
        },
        {
          "@type": "Question",
          "name": "Why did setting the variables in Python change nothing?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "GDAL reads most of them once, when the driver initialises, which happens as PDAL is imported. Set them in the container environment, or at the very top of the module before the import, and the same settings then apply to every tool in the image."
          }
        },
        {
          "@type": "Question",
          "name": "How large should the caches be?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "The per-file cache needs to hold whatever gets re-read \u2014 for COPC that is the header and the octree index, so around twenty-five megabytes is comfortable. The process-wide cache is real memory and must fit the container limit divided by the number of worker processes."
          }
        },
        {
          "@type": "Question",
          "name": "Is EMPTY_DIR ever wrong?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Yes, for formats with sidecar files. A shapefile needs its siblings and a raster may need an auxiliary XML, and disabling the listing hides them. Scope the setting to the pipelines that read self-contained formats such as LAZ, COPC and GeoTIFF."
          }
        }
      ]
    }
  ]
}
</script>

**TL;DR:** Set `GDAL_DISABLE_READDIR_ON_OPEN=EMPTY_DIR` before anything else — on a fan-out that opens thousands of objects it is usually worth a factor of three on its own — then `VSI_CACHE=TRUE`, a curl chunk size of 1 MB, and a cache large enough to hold the header and index of the object you are reading.

## Context and Motivation

This guide is part of [S3 and Cloud Storage I/O](https://www.pythonlidar.com/batch-automation-cloud-integration/s3-cloud-storage-io/). The pipeline is rarely the problem when a cloud read is slow. GDAL's virtual filesystem sits between PDAL and the object store, and its defaults are tuned for a desktop user opening one raster, not for a worker opening ten thousand LAZ objects.

The most expensive default is the one nobody expects. When GDAL opens `/vsis3/bucket/tiles/tile_0431.laz`, it lists the containing prefix first, because for many formats a dataset is several files — a shapefile's siblings, a world file, an auxiliary XML. For a LAZ tile there are no siblings, and on a prefix holding twenty thousand objects that listing is paginated, slow and repeated for every single open. Disabling it changes nothing about correctness for self-contained formats and removes an entire class of latency.

<svg viewBox="0 0 720 258" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Requests issued to open one LAZ object with and without directory listing disabled" style="width:100%;max-width:720px;display:block;margin:1.6rem auto">
  <title>What one open actually costs</title>
  <desc>Opening a single LAZ object from a prefix holding twenty thousand files. By default GDAL first lists the prefix, which takes twenty paginated LIST requests, before the two ranged GETs that read the header. With directory reads disabled the same open takes two requests and no listing at all.</desc>
  <rect x="0" y="0" width="720" height="258" fill="var(--dg-bg)" rx="10"/>
  <text x="20" y="38" font-size="11.5" font-weight="600" fill="var(--dg-e)">default</text>
  <rect x="150" y="24" width="420" height="28" rx="4" fill="var(--dg-e-soft)" stroke="var(--dg-e)" stroke-width="1.2"/>
  <text x="360" y="43" text-anchor="middle" font-size="10.5" fill="var(--dg-text)">20 LIST requests — paginating a 20,000-object prefix</text>
  <rect x="574" y="24" width="46" height="28" rx="4" fill="var(--dg-b-soft)" stroke="var(--dg-b)" stroke-width="1.2"/>
  <text x="632" y="43" font-size="10" fill="var(--dg-muted)">2 GETs</text>
  <text x="150" y="72" font-size="10.5" fill="var(--dg-e)">1.9 s per open, of which 1.8 s is listing</text>
  <text x="20" y="128" font-size="11.5" font-weight="600" fill="var(--dg-d)">GDAL_DISABLE_READDIR_ON_OPEN=EMPTY_DIR</text>
  <rect x="150" y="146" width="46" height="28" rx="4" fill="var(--dg-b-soft)" stroke="var(--dg-b)" stroke-width="1.2"/>
  <text x="208" y="165" font-size="10" fill="var(--dg-muted)">2 GETs</text>
  <text x="150" y="194" font-size="10.5" fill="var(--dg-d)">0.11 s per open — the listing is gone entirely</text>
  <text x="20" y="230" font-size="10.5" fill="var(--dg-muted)">on a 12,500-tile fan-out that single variable is about six hours of wall clock across the fleet,</text>
  <text x="20" y="248" font-size="10.5" fill="var(--dg-muted)">and it costs nothing for self-contained formats such as LAZ and COPC.</text>
</svg>

## Prerequisites and Assumptions

| Requirement | Detail |
|---|---|
| GDAL | 3.x, which PDAL links against |
| Credentials | environment, instance role or profile — resolved by GDAL, not by PDAL |
| Same region | reading across regions adds latency and egress charges |
| Self-contained inputs | LAZ, COPC, GeoTIFF; sidecar-based formats need the listing |
| A way to set environment variables | the container definition, not the Python process |

That last row matters more than it looks. GDAL reads most of these settings once, when the driver initialises, so exporting them from inside Python after `import pdal` is too late.

## Step-by-Step Implementation

### Step 1 — Disable the directory listing

```bash
export GDAL_DISABLE_READDIR_ON_OPEN=EMPTY_DIR
```

`EMPTY_DIR` rather than `YES`: it disables the listing while still allowing an explicit sibling open if something needs one.

### Step 2 — Turn on the read cache

```bash
export VSI_CACHE=TRUE
export VSI_CACHE_SIZE=25000000        # per-file, bytes
export CPL_VSIL_CURL_CACHE_SIZE=200000000   # process-wide, bytes
```

The per-file cache is what stops a COPC reader re-fetching the header and index for every query.

### Step 3 — Size the range requests

```bash
export CPL_VSIL_CURL_CHUNK_SIZE=1048576
```

One megabyte is a good default: small enough not to over-fetch, large enough that per-request latency does not dominate.

### Step 4 — Set the region and any bucket policy flags

```bash
export AWS_DEFAULT_REGION=us-east-1
export AWS_REQUEST_PAYER=requester    # only for requester-pays buckets
```

### Step 5 — Put them in the container definition

Environment, not code. The same settings then apply to `pdal`, `gdalinfo` and anything else in the image.

## Complete Working Example

```python
"""Read a LAZ object from S3 with the virtual filesystem tuned, and time it."""
from __future__ import annotations

import json
import os
import time

# Must be set before the GDAL driver initialises, which happens on import.
os.environ.setdefault("GDAL_DISABLE_READDIR_ON_OPEN", "EMPTY_DIR")
os.environ.setdefault("VSI_CACHE", "TRUE")
os.environ.setdefault("VSI_CACHE_SIZE", "25000000")
os.environ.setdefault("CPL_VSIL_CURL_CACHE_SIZE", "200000000")
os.environ.setdefault("CPL_VSIL_CURL_CHUNK_SIZE", "1048576")

import pdal  # noqa: E402


def timed_read(url: str, bounds: str | None = None) -> dict:
    reader: dict = {"type": "readers.las", "filename": url}
    if bounds:
        reader["bounds"] = bounds
    started = time.perf_counter()
    pipeline = pdal.Pipeline(json.dumps({"pipeline": [reader]}))
    n = pipeline.execute()
    return {
        "url": url,
        "points": n,
        "seconds": round(time.perf_counter() - started, 2),
    }


def settings_in_effect() -> dict:
    keys = ["GDAL_DISABLE_READDIR_ON_OPEN", "VSI_CACHE", "VSI_CACHE_SIZE",
            "CPL_VSIL_CURL_CACHE_SIZE", "CPL_VSIL_CURL_CHUNK_SIZE",
            "AWS_DEFAULT_REGION"]
    return {k: os.environ.get(k, "<unset>") for k in keys}


if __name__ == "__main__":
    print(json.dumps(settings_in_effect(), indent=2))
    result = timed_read("/vsis3/lidar-archive/tiles/tile_0431.laz")
    print(json.dumps(result, indent=2))
    # A second read of the same object should be much faster if the cache is on.
    again = timed_read("/vsis3/lidar-archive/tiles/tile_0431.laz")
    print(json.dumps({"first": result["seconds"], "second": again["seconds"]}, indent=2))
```

## Key Parameter Table

| Variable | Value | Effect |
|---|---|---|
| `GDAL_DISABLE_READDIR_ON_OPEN` | `EMPTY_DIR` | Removes a prefix listing per open; the single biggest win |
| `VSI_CACHE` | `TRUE` | Caches ranges in memory rather than re-fetching |
| `VSI_CACHE_SIZE` | 25 MB | Per-file cache; sized to hold a COPC header and index |
| `CPL_VSIL_CURL_CACHE_SIZE` | 200 MB | Process-wide cache across all objects |
| `CPL_VSIL_CURL_CHUNK_SIZE` | 1 MB | Bytes per range request |
| `AWS_REQUEST_PAYER` | `requester` | Required on requester-pays buckets, ignored elsewhere |

<svg viewBox="0 0 720 240" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Bytes fetched on a first and a repeated read of the same object" style="width:100%;max-width:720px;display:block;margin:1.6rem auto">
  <title>What the cache is actually saving</title>
  <desc>Reading the same COPC header and index twice. The first read fetches 2.4 megabytes over four range requests. With the cache enabled the second read fetches nothing and issues no requests at all. With the cache disabled it repeats the whole first read, which is what makes a query loop over one object several times slower than it needs to be.</desc>
  <rect x="0" y="0" width="720" height="240" fill="var(--dg-bg)" rx="10"/>
  <text x="230" y="80" text-anchor="end" font-size="11" fill="var(--dg-text)">first read</text>
  <rect x="240" y="60" width="242" height="30" rx="4" fill="var(--dg-b-soft)" stroke="var(--dg-b)" stroke-width="1.2"/>
  <text x="490" y="80" font-size="10.5" fill="var(--dg-muted)">2.4 MB · 4 requests</text>
  <text x="230" y="128" text-anchor="end" font-size="11" fill="var(--dg-text)">second read, VSI_CACHE=TRUE</text>
  <rect x="240" y="108" width="10" height="30" rx="4" fill="var(--dg-d-soft)" stroke="var(--dg-d)" stroke-width="1.2"/>
  <text x="258" y="128" font-size="10.5" fill="var(--dg-muted)">0 MB · 0 requests</text>
  <text x="230" y="176" text-anchor="end" font-size="11" fill="var(--dg-text)">second read, cache off</text>
  <rect x="240" y="156" width="242" height="30" rx="4" fill="var(--dg-e-soft)" stroke="var(--dg-e)" stroke-width="1.2"/>
  <text x="490" y="176" font-size="10.5" fill="var(--dg-muted)">2.4 MB · 4 requests again</text>
  <text x="270" y="44" font-size="10.5" fill="var(--dg-muted)">same object, two consecutive reads</text>
  <text x="60" y="222" font-size="10.5" fill="var(--dg-muted)">this is why the example prints both timings — identical numbers mean the cache is not in effect</text>
</svg>

## Verification

**The second read is much faster.** The example prints both. If they are the same, `VSI_CACHE` is not in effect — usually because it was set after `import pdal`.

**Request counts fall.** Check the bucket access log or a proxy. Opens should show ranged GETs and no LIST.

**Nothing broke.** The settings change performance, not semantics, for self-contained formats. Compare a point count against a local copy.

<svg viewBox="0 0 720 254" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Wall clock for a 500-tile read job under four environment configurations" style="width:100%;max-width:720px;display:block;margin:1.6rem auto">
  <title>What each setting is worth</title>
  <desc>Wall clock to open and read the headers of 500 tiles from S3. With defaults the job takes 940 seconds. Disabling directory reads on open brings it to 310. Adding the VSI cache brings it to 240. Tuning the curl chunk size brings it to 225, which is where the curve flattens.</desc>
  <rect x="0" y="0" width="720" height="254" fill="var(--dg-bg)" rx="10"/>
  <text x="230" y="40" font-size="10.5" fill="var(--dg-muted)">500 tiles, headers only, same region</text>
  <text x="220" y="76" text-anchor="end" font-size="11.5" fill="var(--dg-text)">defaults</text>
  <rect x="230" y="58" width="450" height="28" rx="4" fill="var(--dg-e-soft)" stroke="var(--dg-e)" stroke-width="1.2"/>
  <text x="455" y="77" text-anchor="middle" font-size="10.5" fill="var(--dg-text)">940 s</text>
  <text x="220" y="120" text-anchor="end" font-size="11.5" fill="var(--dg-text)">+ no readdir</text>
  <rect x="230" y="102" width="148" height="28" rx="4" fill="var(--dg-c-soft)" stroke="var(--dg-c)" stroke-width="1.2"/>
  <text x="388" y="121" font-size="10.5" fill="var(--dg-muted)">310 s</text>
  <text x="220" y="164" text-anchor="end" font-size="11.5" fill="var(--dg-text)">+ VSI cache</text>
  <rect x="230" y="146" width="115" height="28" rx="4" fill="var(--dg-d-soft)" stroke="var(--dg-d)" stroke-width="1.2"/>
  <text x="355" y="165" font-size="10.5" fill="var(--dg-muted)">240 s</text>
  <text x="220" y="208" text-anchor="end" font-size="11.5" fill="var(--dg-text)">+ chunk size 1 MB</text>
  <rect x="230" y="190" width="108" height="28" rx="4" fill="var(--dg-d-soft)" stroke="var(--dg-d)" stroke-width="1.2"/>
  <text x="348" y="209" font-size="10.5" fill="var(--dg-muted)">225 s</text>
  <text x="230" y="240" font-size="10.5" fill="var(--dg-muted)">the first row to the second is one environment variable; everything after it is refinement</text>
</svg>

## Gotchas and Edge Cases

**Setting the variables after importing PDAL.** GDAL reads most of them at driver initialisation. Set them in the container environment, or before the import if you must do it in Python.

**`EMPTY_DIR` with a sidecar format.** A shapefile or a raster with an auxiliary XML genuinely needs the listing. Scope the setting to the pipelines that read self-contained formats.

**Cross-region reads.** No environment tuning recovers the latency or the egress cost. Colocate the worker with the bucket.

**A cache larger than the container's memory limit.** `CPL_VSIL_CURL_CACHE_SIZE` is real memory. On a worker with a 2 GB limit running eight processes, a 200 MB cache each is most of the budget.

**Credentials resolved differently than you expect.** GDAL has its own resolution order and does not always agree with boto3. If a read fails with access denied while boto3 succeeds, that is why — and the [Docker containers](https://www.pythonlidar.com/batch-automation-cloud-integration/pdal-docker-containers/) guide covers pinning the whole environment so it stops varying.

## Frequently Asked Questions

**Why is opening a small object from S3 so slow?**

Because GDAL lists the containing prefix first, in case the dataset has sibling files. For a self-contained format such as LAZ there are none, and on a prefix holding twenty thousand objects that listing is paginated and repeated for every open. Setting GDAL_DISABLE_READDIR_ON_OPEN to EMPTY_DIR removes it.

**Why did setting the variables in Python change nothing?**

GDAL reads most of them once, when the driver initialises, which happens as PDAL is imported. Set them in the container environment, or at the very top of the module before the import, and the same settings then apply to every tool in the image.

**How large should the caches be?**

The per-file cache needs to hold whatever gets re-read — for COPC that is the header and the octree index, so around twenty-five megabytes is comfortable. The process-wide cache is real memory and must fit the container limit divided by the number of worker processes.

**Is EMPTY_DIR ever wrong?**

Yes, for formats with sidecar files. A shapefile needs its siblings and a raster may need an auxiliary XML, and disabling the listing hides them. Scope the setting to the pipelines that read self-contained formats such as LAZ, COPC and GeoTIFF.

---

## Related

- [S3 and Cloud Storage I/O](https://www.pythonlidar.com/batch-automation-cloud-integration/s3-cloud-storage-io/) — the parent guide to reading and writing through the virtual filesystem
- [Streaming LAZ from S3 with PDAL](https://www.pythonlidar.com/batch-automation-cloud-integration/s3-cloud-storage-io/streaming-laz-from-s3-with-pdal/) — the read pattern these settings make fast
- [Writing Cloud Optimized GeoTIFFs to S3](https://www.pythonlidar.com/batch-automation-cloud-integration/s3-cloud-storage-io/writing-cloud-optimized-geotiffs-to-s3/) — the same filesystem on the write path
- [Querying a COPC File by Bounds and Resolution](https://www.pythonlidar.com/point-cloud-data-standards-fundamentals/copc-and-cloud-native-formats/querying-a-copc-file-by-bounds-and-resolution/) — the query whose latency these settings dominate
- [PDAL Docker Containers](https://www.pythonlidar.com/batch-automation-cloud-integration/pdal-docker-containers/) — where the environment belongs so it stops varying
