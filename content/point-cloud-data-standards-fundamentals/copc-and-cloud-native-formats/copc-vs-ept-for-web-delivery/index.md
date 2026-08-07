---
title: "COPC vs EPT for Web Delivery"
description: "The same octree stored as one file or as thousands, what that costs in round trips over a real network, and the read-to-revision ratio that decides which format a dataset wants."
slug: "copc-vs-ept-for-web-delivery"
type: "howto"
breadcrumb: "COPC vs EPT for Web Delivery"
datePublished: "2026-08-07"
dateModified: "2026-08-07"
---

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Article",
      "headline": "COPC vs EPT for Web Delivery",
      "description": "The same octree stored as one file or as thousands, what that costs in round trips over a real network, and the read-to-revision ratio that decides which format a dataset wants.",
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
          "name": "COPC vs EPT for Web Delivery",
          "item": "https://www.pythonlidar.com/point-cloud-data-standards-fundamentals/copc-and-cloud-native-formats/copc-vs-ept-for-web-delivery/"
        }
      ]
    },
    {
      "@type": "HowTo",
      "name": "Choose between COPC and EPT for serving a point cloud",
      "step": [
        {
          "@type": "HowToStep",
          "name": "Characterise the access pattern",
          "text": "Count reads per month against revisions per month; the ratio picks the format more reliably than a feature list."
        },
        {
          "@type": "HowToStep",
          "name": "Count requests, not just bytes",
          "text": "Each round trip costs tens of milliseconds regardless of size, so two hundred requests is seconds of pure latency."
        },
        {
          "@type": "HowToStep",
          "name": "Check what your clients support",
          "text": "Browser viewers increasingly read COPC directly over HTTPS with no server component; confirm before committing."
        },
        {
          "@type": "HowToStep",
          "name": "Benchmark both on a real query",
          "text": "Run the same window and resolution against each and compare points, time and request count."
        },
        {
          "@type": "HowToStep",
          "name": "Keep the source tiles either way",
          "text": "Both formats are derived products; the conversion is reproducible and the acquisition is not."
        }
      ]
    },
    {
      "@type": "FAQPage",
      "mainEntity": [
        {
          "@type": "Question",
          "name": "Do COPC and EPT transfer different amounts of data?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Not meaningfully. They store the same octree with the same node sampling, so a given query pulls a similar number of bytes from either. The difference is that EPT needs one request per node \u2014 often two or three hundred \u2014 while COPC needs a handful of range requests against one object."
          }
        },
        {
          "@type": "Question",
          "name": "When is EPT still the better choice?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "When the dataset is revised in pieces. Because each node is its own file, updating a region rewrites a few small objects rather than a multi-gigabyte file. If your data changes more often than it is read, that outweighs the request-count penalty."
          }
        },
        {
          "@type": "Question",
          "name": "Can a browser read COPC without a server?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Yes, provided the host honours HTTP range requests. The client fetches the header, reads the index from a variable length record, and then requests the byte ranges it needs. That is the property that has made COPC the common choice for web delivery."
          }
        },
        {
          "@type": "Question",
          "name": "Should either format replace my archive?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "No. Both are derived products optimised for reading. Keep the original tiles: the conversion to COPC or EPT is reproducible from them, and nothing reproduces the acquisition."
          }
        }
      ]
    }
  ]
}
</script>

**TL;DR:** Both move about the same bytes for the same query. COPC does it in a handful of range requests against one object; EPT does it in hundreds of requests against thousands of files. Choose COPC for publication and interactive reading, EPT when the dataset is revised in pieces by a system that owns its own storage.

## Context and Motivation

This guide is part of [COPC and Cloud-Native Point Cloud Formats](https://www.pythonlidar.com/point-cloud-data-standards-fundamentals/copc-and-cloud-native-formats/). Both formats solve the same problem — answering a spatial, level-of-detail query without downloading everything — and they solve it with the same data structure, an octree whose nodes each hold a spatially even sample of their subtree. The difference is entirely in how that octree is stored, and every practical consequence follows from that one choice.

EPT stores each node as its own file, with a JSON manifest describing the tree. COPC stores every node as a byte range inside one LAZ file, with the tree in a variable length record at the front. The first is a directory; the second is a file.

<svg viewBox="0 0 720 258" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="The same octree stored as a directory of files and as byte ranges within one file" style="width:100%;max-width:720px;display:block;margin:1.6rem auto">
  <title>One octree, two ways to store it</title>
  <desc>The same octree drawn twice. As EPT it becomes a directory containing a JSON manifest and one LAZ file per node, thousands of objects in total. As COPC it becomes a single LAZ file in which each node occupies a contiguous byte range, with the tree recorded in a header record.</desc>
  <rect x="0" y="0" width="720" height="258" fill="var(--dg-bg)" rx="10"/>
  <text x="180" y="38" text-anchor="middle" font-size="12" font-weight="600" fill="var(--dg-c)">EPT — a directory</text>
  <text x="540" y="38" text-anchor="middle" font-size="12" font-weight="600" fill="var(--dg-d)">COPC — a file</text>
  <rect x="20" y="50" width="320" height="30" rx="5" fill="var(--dg-c-soft)" stroke="var(--dg-c)" stroke-width="1.2"/>
  <text x="180" y="70" text-anchor="middle" font-size="10.5" fill="var(--dg-text)">ept.json — the manifest</text>
  <rect x="20" y="86" width="320" height="30" rx="5" fill="var(--dg-surface)" stroke="var(--dg-line-soft)" stroke-width="1"/>
  <text x="180" y="106" text-anchor="middle" font-size="10.5" fill="var(--dg-text)">ept-data/0-0-0-0.laz</text>
  <rect x="20" y="122" width="320" height="30" rx="5" fill="var(--dg-surface)" stroke="var(--dg-line-soft)" stroke-width="1"/>
  <text x="180" y="142" text-anchor="middle" font-size="10.5" fill="var(--dg-text)">ept-data/1-0-0-0.laz</text>
  <rect x="20" y="158" width="320" height="30" rx="5" fill="var(--dg-surface)" stroke="var(--dg-line-soft)" stroke-width="1"/>
  <text x="180" y="178" text-anchor="middle" font-size="10.5" fill="var(--dg-text)">… 4,812 more node files</text>
  <rect x="20" y="194" width="320" height="30" rx="5" fill="var(--dg-surface)" stroke="var(--dg-line-soft)" stroke-width="1"/>
  <text x="180" y="214" text-anchor="middle" font-size="10.5" fill="var(--dg-text)">ept-hierarchy/*.json</text>
  <rect x="380" y="50" width="320" height="46" rx="5" fill="var(--dg-d-soft)" stroke="var(--dg-d)" stroke-width="1.4"/>
  <text x="540" y="70" text-anchor="middle" font-size="10.5" fill="var(--dg-text)">block.copc.laz</text>
  <text x="540" y="88" text-anchor="middle" font-size="9.5" fill="var(--dg-muted)">header · copc info VLR · chunks</text>
  <rect x="380" y="102" width="320" height="122" rx="5" fill="var(--dg-surface)" stroke="var(--dg-line-soft)" stroke-width="1"/>
  <text x="540" y="150" text-anchor="middle" font-size="10.5" fill="var(--dg-muted)">every node is a byte range</text>
  <text x="540" y="172" text-anchor="middle" font-size="10.5" fill="var(--dg-muted)">inside that one object</text>
  <text x="20" y="248" font-size="10.5" fill="var(--dg-muted)">every operational difference below follows from this single storage choice</text>
</svg>

## Prerequisites and Assumptions

| Requirement | Detail |
|---|---|
| PDAL | 2.4+ — `readers.ept` and `readers.copc` both ship in the standard build |
| A hosting target | object storage or a static web server that honours range requests |
| An access pattern | how often the data is read, and how often it changes |
| A client inventory | which viewers and libraries your consumers already use |

## Step-by-Step Implementation

### Step 1 — Characterise the access pattern

Two numbers decide this: reads per month and revisions per month. Their ratio picks the format more reliably than any feature comparison.

### Step 2 — Count the requests, not just the bytes

Over a wide-area network a request costs 30–80 ms of latency regardless of size. Two hundred requests is fifteen seconds of latency before a single byte of useful work.

### Step 3 — Check what your clients speak

Browser viewers increasingly read COPC natively over HTTPS with no server component. Desktop GIS support is broader for both. Legacy tooling reads neither and needs plain LAS.

### Step 4 — Test both against a real query

The comparison script below runs the same window and resolution against each and reports points, time and request count.

## Complete Working Example

```python
"""Time the same spatial query against an EPT dataset and a COPC file."""
from __future__ import annotations

import json
import time

import pdal

WINDOW = "([512000, 513000], [4783000, 4784000])"
RESOLUTION = 2.0


def run(reader_type: str, filename: str) -> dict:
    spec = json.dumps({"pipeline": [{
        "type": reader_type,
        "filename": filename,
        "bounds": WINDOW,
        "resolution": RESOLUTION,
    }]})
    started = time.perf_counter()
    pipeline = pdal.Pipeline(spec)
    n = pipeline.execute()
    return {
        "reader": reader_type,
        "points": n,
        "seconds": round(time.perf_counter() - started, 2),
    }


def compare(ept_url: str, copc_url: str) -> dict:
    ept = run("readers.ept", ept_url)
    copc = run("readers.copc", copc_url)

    # The two formats sample the octree the same way, so the point counts should
    # be close. A large divergence means the two datasets were built differently.
    ratio = copc["points"] / max(ept["points"], 1)
    if not 0.8 < ratio < 1.25:
        raise AssertionError(
            f"point counts diverge too far to compare fairly: {ept['points']} vs {copc['points']}"
        )
    return {"ept": ept, "copc": copc,
            "speedup": round(ept["seconds"] / max(copc["seconds"], 1e-6), 2)}


if __name__ == "__main__":
    print(json.dumps(compare(
        ept_url="https://example.org/data/region/ept.json",
        copc_url="https://example.org/data/region.copc.laz",
    ), indent=2))
```

## Key Parameter Table

| Dimension | EPT | COPC |
|---|---|---|
| Storage unit | directory of thousands of files | one file |
| Index | `ept.json` plus hierarchy files | a VLR inside the file |
| Requests for one query | 100–300 | 4–8 |
| Bytes for one query | comparable | comparable |
| Partial update | rewrite affected node files | rewrite the whole file |
| Copy or checksum | directory sync | one object |
| Signed URL or expiry | per file, or a prefix policy | one URL |
| Read by plain LAS tools | no | yes |

<svg viewBox="-2 32 724 235" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Format choice by how often the data is read against how often it changes" style="width:100%;max-width:720px;display:block;margin:1.6rem auto">
  <title>One ratio decides it</title>
  <desc>Four situations placed by reads against revisions. A published archive read constantly and revised yearly wants COPC. A working dataset revised daily and read occasionally wants EPT. A dataset both read and revised often needs EPT and a caching layer. A dataset neither read interactively nor revised should stay as plain tiles.</desc>
  <rect x="-2" y="32" width="724" height="235" fill="var(--dg-bg)" rx="10"/>
  <rect x="20" y="54" width="300" height="36" rx="6" fill="var(--dg-surface)" stroke="var(--dg-line-soft)" stroke-width="1.2"/>
  <text x="170" y="76" text-anchor="middle" font-size="11" fill="var(--dg-text)">read often, revised rarely</text>
  <rect x="340" y="54" width="360" height="36" rx="6" fill="var(--dg-a-soft)" stroke="var(--dg-a)" stroke-width="1.2"/>
  <text x="520" y="76" text-anchor="middle" font-size="11" fill="var(--dg-text)">COPC — one object, range reads</text>
  <rect x="20" y="100" width="300" height="36" rx="6" fill="var(--dg-surface)" stroke="var(--dg-line-soft)" stroke-width="1.2"/>
  <text x="170" y="122" text-anchor="middle" font-size="11" fill="var(--dg-text)">revised often, read rarely</text>
  <rect x="340" y="100" width="360" height="36" rx="6" fill="var(--dg-a-soft)" stroke="var(--dg-a)" stroke-width="1.2"/>
  <text x="520" y="122" text-anchor="middle" font-size="11" fill="var(--dg-text)">EPT — rewrite a few node files</text>
  <rect x="20" y="146" width="300" height="36" rx="6" fill="var(--dg-surface)" stroke="var(--dg-line-soft)" stroke-width="1.2"/>
  <text x="170" y="168" text-anchor="middle" font-size="11" fill="var(--dg-text)">both often</text>
  <rect x="340" y="146" width="360" height="36" rx="6" fill="var(--dg-a-soft)" stroke="var(--dg-a)" stroke-width="1.2"/>
  <text x="520" y="168" text-anchor="middle" font-size="11" fill="var(--dg-text)">EPT plus a cache in front</text>
  <rect x="20" y="192" width="300" height="36" rx="6" fill="var(--dg-surface)" stroke="var(--dg-line-soft)" stroke-width="1.2"/>
  <text x="170" y="214" text-anchor="middle" font-size="11" fill="var(--dg-text)">neither</text>
  <rect x="340" y="192" width="360" height="36" rx="6" fill="var(--dg-a-soft)" stroke="var(--dg-a)" stroke-width="1.2"/>
  <text x="520" y="214" text-anchor="middle" font-size="11" fill="var(--dg-text)">leave it as tiles</text>
  <text x="20" y="242" font-size="10.5" fill="var(--dg-muted)">the last row is the one people skip, and it is the cheapest answer whenever it applies</text>
</svg>

## Verification

**Both return comparable point counts.** Asserted in the example. A large divergence means the two datasets were built with different octree parameters, and any timing comparison between them is meaningless.

**Request counts match expectation.** Capture them at the proxy or with the object store's access log. If COPC is issuing hundreds of requests, `resolution` was probably not set.

**The client actually works.** A format that your viewer cannot open is not a candidate however good the numbers are.

<svg viewBox="0 0 720 250" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Latency breakdown for the same query answered by EPT and by COPC" style="width:100%;max-width:720px;display:block;margin:1.6rem auto">
  <title>Where the time goes on a remote query</title>
  <desc>Time to answer one query over a wide-area network, split into request latency and transfer. EPT spends 5.9 seconds on 212 round trips and 0.5 seconds transferring. COPC spends 0.3 seconds on 5 round trips and 1.5 seconds transferring. The byte totals are similar; the round trips are not.</desc>
  <rect x="0" y="0" width="720" height="250" fill="var(--dg-bg)" rx="10"/>
  <rect x="200" y="36" width="14" height="12" rx="2" fill="var(--dg-e-soft)" stroke="var(--dg-e)" stroke-width="1.2"/>
  <text x="220" y="46" font-size="10.5" fill="var(--dg-muted)">round-trip latency</text>
  <rect x="360" y="36" width="14" height="12" rx="2" fill="var(--dg-b-soft)" stroke="var(--dg-b)" stroke-width="1.2"/>
  <text x="380" y="46" font-size="10.5" fill="var(--dg-muted)">transfer</text>
  <text x="190" y="90" text-anchor="end" font-size="11.5" fill="var(--dg-text)">EPT · 212 requests</text>
  <rect x="200" y="70" width="413" height="30" rx="4" fill="var(--dg-e-soft)" stroke="var(--dg-e)" stroke-width="1.2"/>
  <text x="406" y="90" text-anchor="middle" font-size="10.5" fill="var(--dg-text)">5.9 s waiting</text>
  <rect x="613" y="70" width="35" height="30" rx="4" fill="var(--dg-b-soft)" stroke="var(--dg-b)" stroke-width="1.2"/>
  <text x="656" y="90" font-size="10.5" fill="var(--dg-muted)">0.5 s</text>
  <text x="190" y="150" text-anchor="end" font-size="11.5" fill="var(--dg-text)">COPC · 5 requests</text>
  <rect x="200" y="130" width="21" height="30" rx="4" fill="var(--dg-e-soft)" stroke="var(--dg-e)" stroke-width="1.2"/>
  <rect x="221" y="130" width="105" height="30" rx="4" fill="var(--dg-b-soft)" stroke="var(--dg-b)" stroke-width="1.2"/>
  <text x="273" y="150" text-anchor="middle" font-size="10.5" fill="var(--dg-text)">1.5 s</text>
  <text x="336" y="150" font-size="10.5" fill="var(--dg-muted)">1.8 s total against 6.4 s</text>
  <text x="200" y="196" font-size="10.5" fill="var(--dg-muted)">on a local disk the two are within a few percent of each other — the gap is a network effect,</text>
  <text x="200" y="214" font-size="10.5" fill="var(--dg-muted)">so benchmark over the link your users will actually have.</text>
  <text x="200" y="236" font-size="10.5" fill="var(--dg-muted)">Both formats gain from HTTP/2 connection reuse; neither gains enough to close a 200-request gap.</text>
</svg>

## Gotchas and Edge Cases

**A COPC file cannot be updated in place.** The octree ordering is the file layout, so revising one region means rebuilding the object. For a dataset under continuous revision that is the argument for EPT, and it is a strong one.

**EPT's file count is an operational cost.** Thousands of objects per dataset makes lifecycle policies, replication and cost attribution harder, and some object stores charge per request in a way that shows up.

**Neither is an archival format.** Both are derived products. Keep the source tiles — the conversion is reproducible, the original acquisition is not.

**Do not benchmark over localhost.** On a local disk the two formats are within a few percent. The entire difference is round trips, so measure over the link your users will use.

## Frequently Asked Questions

**Do COPC and EPT transfer different amounts of data?**

Not meaningfully. They store the same octree with the same node sampling, so a given query pulls a similar number of bytes from either. The difference is that EPT needs one request per node — often two or three hundred — while COPC needs a handful of range requests against one object.

**When is EPT still the better choice?**

When the dataset is revised in pieces. Because each node is its own file, updating a region rewrites a few small objects rather than a multi-gigabyte file. If your data changes more often than it is read, that outweighs the request-count penalty.

**Can a browser read COPC without a server?**

Yes, provided the host honours HTTP range requests. The client fetches the header, reads the index from a variable length record, and then requests the byte ranges it needs. That is the property that has made COPC the common choice for web delivery.

**Should either format replace my archive?**

No. Both are derived products optimised for reading. Keep the original tiles: the conversion to COPC or EPT is reproducible from them, and nothing reproduces the acquisition.

---

## Related

- [COPC and Cloud-Native Point Cloud Formats](https://www.pythonlidar.com/point-cloud-data-standards-fundamentals/copc-and-cloud-native-formats/) — the parent guide to the octree both formats use
- [Converting LAZ Tiles to COPC with PDAL](https://www.pythonlidar.com/point-cloud-data-standards-fundamentals/copc-and-cloud-native-formats/converting-laz-tiles-to-copc-with-pdal/) — producing the COPC side of this comparison
- [Querying a COPC File by Bounds and Resolution](https://www.pythonlidar.com/point-cloud-data-standards-fundamentals/copc-and-cloud-native-formats/querying-a-copc-file-by-bounds-and-resolution/) — the options that make either format fast
- [Writing Cloud Optimized GeoTIFFs to S3](https://www.pythonlidar.com/batch-automation-cloud-integration/s3-cloud-storage-io/writing-cloud-optimized-geotiffs-to-s3/) — the same idea applied to rasters
- [Point Cloud Data Standards and Fundamentals](https://www.pythonlidar.com/point-cloud-data-standards-fundamentals/) — the section overview
