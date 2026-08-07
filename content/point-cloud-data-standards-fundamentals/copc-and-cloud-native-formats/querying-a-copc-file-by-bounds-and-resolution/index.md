---
title: "Querying a COPC File by Bounds and Resolution"
description: "The two independent options that make a COPC read cheap, why a bounded query returns more points than the window contains, and when a coarse read is the wrong input."
slug: "querying-a-copc-file-by-bounds-and-resolution"
type: "howto"
breadcrumb: "Querying COPC by Bounds and Resolution"
datePublished: "2026-08-07"
dateModified: "2026-08-07"
---

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Article",
      "headline": "Querying a COPC File by Bounds and Resolution",
      "description": "The two independent options that make a COPC read cheap, why a bounded query returns more points than the window contains, and when a coarse read is the wrong input.",
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
          "name": "Querying COPC by Bounds and Resolution",
          "item": "https://www.pythonlidar.com/point-cloud-data-standards-fundamentals/copc-and-cloud-native-formats/querying-a-copc-file-by-bounds-and-resolution/"
        }
      ]
    },
    {
      "@type": "HowTo",
      "name": "Query a COPC file by spatial window and level of detail",
      "step": [
        {
          "@type": "HowToStep",
          "name": "Read the file extent first",
          "text": "Get the bounds and CRS from pdal info so the query window is expressed in the right units."
        },
        {
          "@type": "HowToStep",
          "name": "Set bounds to select nodes",
          "text": "Pass a window as ([xmin,xmax],[ymin,ymax]) in the file coordinate system to restrict which octree nodes are fetched."
        },
        {
          "@type": "HowToStep",
          "name": "Set resolution to select depth",
          "text": "Give a node size in CRS units so levels below it are never fetched at all."
        },
        {
          "@type": "HowToStep",
          "name": "Crop afterwards for an exact clip",
          "text": "Add filters.crop with the same window, because the reader returns whole nodes that overhang the boundary."
        },
        {
          "@type": "HowToStep",
          "name": "Assert the result",
          "text": "Check that a coarser resolution returns fewer points and that the cropped result lies inside the requested window."
        }
      ]
    },
    {
      "@type": "FAQPage",
      "mainEntity": [
        {
          "@type": "Question",
          "name": "Why does my bounded query return points outside the window?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Because the reader fetches whole octree nodes, and a node that intersects your window brings all of its points with it. That is the design \u2014 it is what keeps the number of range requests small. Add filters.crop with the same bounds after the reader for an exact clip, which costs nothing because the points are already local."
          }
        },
        {
          "@type": "Question",
          "name": "What does the resolution value actually mean?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "It is a node size in CRS units, not a point spacing. The reader descends the octree until node size falls below the value and stops, so a resolution of two metres over a one-kilometre window returns a spatially even sample suitable for display. Leave it unset when the result will be measured."
          }
        },
        {
          "@type": "Question",
          "name": "Why did my query return zero points with no error?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Almost always because the bounds were expressed in a different coordinate system from the file. The option does not reproject its argument, so a latitude and longitude window against a UTM file matches no nodes and returns an empty result without complaint."
          }
        },
        {
          "@type": "Question",
          "name": "Is a coarse read good enough to build a DTM?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "No. The octree sample is spatially even but statistically incomplete, so the lowest returns in each cell \u2014 exactly the ones a bare-earth surface needs \u2014 are missing. A DTM built from a coarse read sits systematically above the true ground."
          }
        }
      ]
    }
  ]
}
</script>

**TL;DR:** Set both `bounds` and `resolution` on `readers.copc`. `bounds` decides which octree nodes are fetched, `resolution` decides how deep into the tree the reader goes, and omitting either one turns an indexed query back into a whole-file read.

## Context and Motivation

This guide is part of [COPC and Cloud-Native Point Cloud Formats](https://www.pythonlidar.com/point-cloud-data-standards-fundamentals/copc-and-cloud-native-formats/). Conversion is the easy half; the value only arrives when something reads the file the way it was built to be read.

Two options do all the work, and they are independent. `bounds` restricts the query in space: the reader consults the octree index, works out which nodes intersect the window, and fetches only those byte ranges. `resolution` restricts it in detail: nodes below the requested level are never fetched at all, because each level already holds a spatially even sample of everything beneath it. A query that sets neither reads the whole file, and — this is the part that surprises people — it reads it slightly more slowly than the equivalent plain LAZ would, because the index is overhead when you are going to read everything anyway.

<svg viewBox="0 0 720 268" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Which octree nodes are fetched under four combinations of bounds and resolution" style="width:100%;max-width:720px;display:block;margin:1.6rem auto">
  <title>Two independent dials, four outcomes</title>
  <desc>A two by two grid. With neither bounds nor resolution set, every node is fetched — the whole file. With resolution only, shallow nodes across the whole extent are fetched, which is a coarse overview. With bounds only, every level within one window is fetched. With both, only the nodes that intersect the window down to the requested level, which is a handful of range requests.</desc>
  <rect x="0" y="0" width="720" height="268" fill="var(--dg-bg)" rx="10"/>
  <text x="220" y="40" text-anchor="middle" font-size="11" fill="var(--dg-muted)">no bounds</text>
  <text x="530" y="40" text-anchor="middle" font-size="11" fill="var(--dg-muted)">bounds set</text>
  <text x="100" y="90" text-anchor="end" font-size="11" fill="var(--dg-muted)">no resolution</text>
  <text x="100" y="200" text-anchor="end" font-size="11" fill="var(--dg-muted)">resolution set</text>
  <rect x="112" y="52" width="236" height="86" rx="8" fill="var(--dg-e-soft)" stroke="var(--dg-e)" stroke-width="1.3"/>
  <text x="220" y="86" text-anchor="middle" font-size="11.5" font-weight="600" fill="var(--dg-text)">every node</text>
  <text x="220" y="106" text-anchor="middle" font-size="10.5" fill="var(--dg-muted)">2.6 GB — the whole file,</text>
  <text x="220" y="122" text-anchor="middle" font-size="10.5" fill="var(--dg-muted)">plus index overhead</text>
  <rect x="412" y="52" width="236" height="86" rx="8" fill="var(--dg-c-soft)" stroke="var(--dg-c)" stroke-width="1.3"/>
  <text x="530" y="86" text-anchor="middle" font-size="11.5" font-weight="600" fill="var(--dg-text)">every level, one window</text>
  <text x="530" y="106" text-anchor="middle" font-size="10.5" fill="var(--dg-muted)">172 MB — right for a</text>
  <text x="530" y="122" text-anchor="middle" font-size="10.5" fill="var(--dg-muted)">measurement over a small area</text>
  <rect x="112" y="150" width="236" height="86" rx="8" fill="var(--dg-c-soft)" stroke="var(--dg-c)" stroke-width="1.3"/>
  <text x="220" y="184" text-anchor="middle" font-size="11.5" font-weight="600" fill="var(--dg-text)">shallow levels, everywhere</text>
  <text x="220" y="204" text-anchor="middle" font-size="10.5" fill="var(--dg-muted)">41 MB — right for an</text>
  <text x="220" y="220" text-anchor="middle" font-size="10.5" fill="var(--dg-muted)">overview of the whole region</text>
  <rect x="412" y="150" width="236" height="86" rx="8" fill="var(--dg-d-soft)" stroke="var(--dg-d)" stroke-width="1.6"/>
  <text x="530" y="184" text-anchor="middle" font-size="11.5" font-weight="600" fill="var(--dg-text)">intersecting nodes only</text>
  <text x="530" y="204" text-anchor="middle" font-size="10.5" fill="var(--dg-muted)">4.1 MB in 5 requests —</text>
  <text x="530" y="220" text-anchor="middle" font-size="10.5" fill="var(--dg-muted)">what the format was built for</text>
  <text x="20" y="258" font-size="10.5" fill="var(--dg-muted)">the two options are independent, and the bottom-right cell is the only one that is cheap in both dimensions</text>
</svg>

## Prerequisites and Assumptions

| Requirement | Detail |
|---|---|
| PDAL | 2.4+ with `readers.copc` |
| A COPC file | local, over HTTPS, or on `/vsis3/` |
| Bounds in the file's CRS | the option does not reproject its argument |
| Range-request support | required for anything but a local file |

The CRS row is the one that costs an afternoon. `bounds` is interpreted in the file's own coordinate system, so a window in latitude and longitude against a file in UTM matches nothing and returns zero points without an error.

## Step-by-Step Implementation

### Step 1 — Read the file's extent first

```bash
pdal info block_04.copc.laz --summary | python -m json.tool | grep -A8 bounds
```

Anything you pass to `bounds` has to live inside that box, in those units.

### Step 2 — Ask for a window

```json
{"type": "readers.copc", "filename": "block_04.copc.laz",
 "bounds": "([512000, 513000], [4783000, 4784000])"}
```

The syntax is `([xmin, xmax], [ymin, ymax])`, optionally with a third pair for Z.

### Step 3 — Ask for a level of detail

```json
{"type": "readers.copc", "filename": "block_04.copc.laz",
 "bounds": "([512000, 513000], [4783000, 4784000])",
 "resolution": 2.0}
```

The value is a node size in CRS units. Two metres over a one-kilometre window is a good interactive default; leave it unset when the answer will be measured rather than looked at.

### Step 4 — Use a polygon when the area is not a rectangle

```json
{"type": "readers.copc", "filename": "block_04.copc.laz",
 "polygon": "POLYGON((512000 4783000, 512800 4783100, 512600 4783900, 512000 4783000))"}
```

Node granularity still applies: you get whole nodes that intersect the polygon, so follow with `filters.crop` for an exact clip.

## Complete Working Example

```python
"""Query a COPC file by window and level of detail, and report what it cost."""
from __future__ import annotations

import json
import time
from pathlib import Path

import pdal


def query(src: str, bounds: tuple[tuple[float, float], tuple[float, float]],
          resolution: float | None = None, exact: bool = False) -> dict:
    (xmin, xmax), (ymin, ymax) = bounds
    reader = {
        "type": "readers.copc",
        "filename": src,
        "bounds": f"([{xmin}, {xmax}], [{ymin}, {ymax}])",
    }
    if resolution is not None:
        reader["resolution"] = resolution

    stages: list = [reader]
    if exact:
        # Node granularity means points just outside the window arrive too.
        stages.append({
            "type": "filters.crop",
            "bounds": f"([{xmin}, {xmax}], [{ymin}, {ymax}])",
        })

    started = time.perf_counter()
    pipeline = pdal.Pipeline(json.dumps({"pipeline": stages}))
    n = pipeline.execute()
    elapsed = time.perf_counter() - started

    arr = pipeline.arrays[0]
    return {
        "points": n,
        "seconds": round(elapsed, 2),
        "resolution": resolution,
        "exact": exact,
        "x_range": [float(arr["X"].min()), float(arr["X"].max())] if n else None,
        "y_range": [float(arr["Y"].min()), float(arr["Y"].max())] if n else None,
    }


if __name__ == "__main__":
    src = "block_04.copc.laz"
    window = ((512000.0, 513000.0), (4783000.0, 4784000.0))

    overview = query(src, window, resolution=10.0)
    detailed = query(src, window, resolution=0.5)
    clipped = query(src, window, resolution=0.5, exact=True)

    print(json.dumps({"overview": overview, "detailed": detailed,
                      "clipped": clipped}, indent=2))

    assert overview["points"] < detailed["points"], "coarser must return fewer points"
    assert clipped["points"] <= detailed["points"], "cropping cannot add points"
    assert clipped["x_range"][0] >= window[0][0] - 1e-6, "crop did not enforce the window"
```

<svg viewBox="0 0 720 238" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="The five requests a bounded COPC query issues, in order" style="width:100%;max-width:720px;display:block;margin:1.6rem auto">
  <title>Five requests, in this order, every time</title>
  <desc>The request sequence for a bounded query. The reader fetches the file header, then the COPC info record holding the octree, then works out which nodes intersect the window at the requested level, then fetches those node ranges. Only the last step scales with how much data you asked for; the first three are fixed.</desc>
  <rect x="0" y="0" width="720" height="238" fill="var(--dg-bg)" rx="10"/>
  <text x="220" y="68" text-anchor="end" font-size="11" fill="var(--dg-text)">1 · header</text>
  <rect x="230" y="48" width="8" height="30" rx="4" fill="var(--dg-b-soft)" stroke="var(--dg-b)" stroke-width="1.2"/>
  <text x="246" y="68" font-size="10.5" fill="var(--dg-muted)">4 KB — fixed</text>
  <text x="220" y="110" text-anchor="end" font-size="11" fill="var(--dg-text)">2 · copc info VLR</text>
  <rect x="230" y="90" width="14" height="30" rx="4" fill="var(--dg-b-soft)" stroke="var(--dg-b)" stroke-width="1.2"/>
  <text x="252" y="110" font-size="10.5" fill="var(--dg-muted)">160 KB — fixed</text>
  <text x="220" y="152" text-anchor="end" font-size="11" fill="var(--dg-text)">3 · hierarchy page</text>
  <rect x="230" y="132" width="24" height="30" rx="4" fill="var(--dg-c-soft)" stroke="var(--dg-c)" stroke-width="1.2"/>
  <text x="262" y="152" font-size="10.5" fill="var(--dg-muted)">380 KB — fixed</text>
  <text x="220" y="194" text-anchor="end" font-size="11" fill="var(--dg-text)">4 · node ranges</text>
  <rect x="230" y="174" width="236" height="30" rx="4" fill="var(--dg-d-soft)" stroke="var(--dg-d)" stroke-width="1.2"/>
  <text x="474" y="194" font-size="10.5" fill="var(--dg-muted)">3.6 MB — scales with the query</text>
  <text x="240" y="32" font-size="10.5" fill="var(--dg-muted)">a 1 km² window at 2 m resolution</text>
  <text x="60" y="222" font-size="10.5" fill="var(--dg-muted)">the three fixed requests are why the cache matters on a loop of queries against one object</text>
</svg>

## Key Parameter Table

| Option | Type | Default | Effect |
|---|---|---|---|
| `bounds` | string | whole file | `([xmin,xmax],[ymin,ymax])` in the file's CRS; selects nodes, not points |
| `polygon` | WKT | — | Non-rectangular window; same node granularity |
| `resolution` | float | 0 (all) | Coarsest node size to read, in CRS units |
| `count` | int | all | Hard cap on points returned; useful for a smoke test |
| `header` / `vlr` | bool | false | Return only metadata, without fetching point chunks |

## Verification

**Coarser returns fewer.** Asserted above — if it does not, `resolution` is being ignored, which usually means an option name typo.

**The window was honoured.** The X and Y ranges of the result must lie inside the requested bounds once `filters.crop` is applied. Without the crop they will overshoot by up to one node, which is expected rather than wrong.

**A far-away window returns nothing.** Query a box outside the file's extent and confirm zero points and no exception. That is also the symptom of a CRS mismatch, so pair it with a query you know should succeed.

<svg viewBox="0 0 720 256" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="A requested window against the octree nodes actually returned" style="width:100%;max-width:720px;display:block;margin:1.6rem auto">
  <title>You get whole nodes, not exactly your window</title>
  <desc>A requested rectangular window drawn over an octree node grid. The nodes that intersect the window are shaded, and they extend beyond it on every side because the reader fetches whole nodes. A crop filter after the reader trims the result to the requested rectangle, at no network cost since the points are already local.</desc>
  <rect x="0" y="0" width="720" height="256" fill="var(--dg-bg)" rx="10"/>
  <text x="20" y="36" font-size="10.5" fill="var(--dg-muted)">octree nodes at the requested level, with the query window drawn over them</text>
  <rect x="60" y="52" width="88" height="52" fill="var(--dg-surface)" stroke="var(--dg-line-soft)" stroke-width="1"/>
  <rect x="148" y="52" width="88" height="52" fill="var(--dg-a)" fill-opacity="0.22" stroke="var(--dg-line-soft)" stroke-width="1"/>
  <rect x="236" y="52" width="88" height="52" fill="var(--dg-a)" fill-opacity="0.22" stroke="var(--dg-line-soft)" stroke-width="1"/>
  <rect x="324" y="52" width="88" height="52" fill="var(--dg-surface)" stroke="var(--dg-line-soft)" stroke-width="1"/>
  <rect x="60" y="104" width="88" height="52" fill="var(--dg-a)" fill-opacity="0.22" stroke="var(--dg-line-soft)" stroke-width="1"/>
  <rect x="148" y="104" width="88" height="52" fill="var(--dg-a)" fill-opacity="0.4" stroke="var(--dg-line-soft)" stroke-width="1"/>
  <rect x="236" y="104" width="88" height="52" fill="var(--dg-a)" fill-opacity="0.4" stroke="var(--dg-line-soft)" stroke-width="1"/>
  <rect x="324" y="104" width="88" height="52" fill="var(--dg-a)" fill-opacity="0.22" stroke="var(--dg-line-soft)" stroke-width="1"/>
  <rect x="60" y="156" width="88" height="52" fill="var(--dg-surface)" stroke="var(--dg-line-soft)" stroke-width="1"/>
  <rect x="148" y="156" width="88" height="52" fill="var(--dg-a)" fill-opacity="0.22" stroke="var(--dg-line-soft)" stroke-width="1"/>
  <rect x="236" y="156" width="88" height="52" fill="var(--dg-a)" fill-opacity="0.22" stroke="var(--dg-line-soft)" stroke-width="1"/>
  <rect x="324" y="156" width="88" height="52" fill="var(--dg-surface)" stroke="var(--dg-line-soft)" stroke-width="1"/>
  <rect x="176" y="86" width="176" height="120" fill="none" stroke="var(--dg-e)" stroke-width="2.4" stroke-dasharray="6 4"/>
  <text x="440" y="96" font-size="11" fill="var(--dg-e)">the window you asked for</text>
  <text x="440" y="128" font-size="11" fill="var(--dg-a)">the nodes you are sent</text>
  <text x="440" y="160" font-size="11" fill="var(--dg-muted)">filters.crop trims the difference,</text>
  <text x="440" y="178" font-size="11" fill="var(--dg-muted)">locally and for free</text>
  <text x="20" y="238" font-size="10.5" fill="var(--dg-muted)">this is why a bounded read returns more points than the window contains, and why that is not a bug</text>
</svg>

## Gotchas and Edge Cases

**Bounds in the wrong CRS return zero points silently.** No exception, no warning, no data. Read the file's extent first and check your window overlaps it before blaming anything else.

**A coarse read is not a valid input to a measurement.** The octree sample is spatially even but statistically incomplete — minimum elevations are missing, so a DTM built from it sits above the true surface. Use `resolution` for display and exploration only; the [DTM raster generation](https://www.pythonlidar.com/ground-filtering-dtm-dsm-generation/dtm-raster-generation/) guide assumes a full read.

**Reading over HTTPS needs a server that honours ranges.** Test with `curl -r 0-1023` against the URL. If the whole object comes back, no client setting will fix it.

**A pipeline that forgot `resolution` looks like a slow format.** It is the commonest complaint about COPC and it is a missing option, not the format.

## Frequently Asked Questions

**Why does my bounded query return points outside the window?**

Because the reader fetches whole octree nodes, and a node that intersects your window brings all of its points with it. That is the design — it is what keeps the number of range requests small. Add filters.crop with the same bounds after the reader for an exact clip, which costs nothing because the points are already local.

**What does the resolution value actually mean?**

It is a node size in CRS units, not a point spacing. The reader descends the octree until node size falls below the value and stops, so a resolution of two metres over a one-kilometre window returns a spatially even sample suitable for display. Leave it unset when the result will be measured.

**Why did my query return zero points with no error?**

Almost always because the bounds were expressed in a different coordinate system from the file. The option does not reproject its argument, so a latitude and longitude window against a UTM file matches no nodes and returns an empty result without complaint.

**Is a coarse read good enough to build a DTM?**

No. The octree sample is spatially even but statistically incomplete, so the lowest returns in each cell — exactly the ones a bare-earth surface needs — are missing. A DTM built from a coarse read sits systematically above the true ground.

---

## Related

- [COPC and Cloud-Native Point Cloud Formats](https://www.pythonlidar.com/point-cloud-data-standards-fundamentals/copc-and-cloud-native-formats/) — the parent guide to the octree these options traverse
- [Converting LAZ Tiles to COPC with PDAL](https://www.pythonlidar.com/point-cloud-data-standards-fundamentals/copc-and-cloud-native-formats/converting-laz-tiles-to-copc-with-pdal/) — producing the files this guide reads
- [COPC vs EPT for Web Delivery](https://www.pythonlidar.com/point-cloud-data-standards-fundamentals/copc-and-cloud-native-formats/copc-vs-ept-for-web-delivery/) — how the two formats answer the same query
- [Streaming LAZ from S3 with PDAL](https://www.pythonlidar.com/batch-automation-cloud-integration/s3-cloud-storage-io/streaming-laz-from-s3-with-pdal/) — the range-request mechanics underneath a remote query
- [Point Cloud Data Standards and Fundamentals](https://www.pythonlidar.com/point-cloud-data-standards-fundamentals/) — the section overview
