---
title: "Estimating PDAL Memory from Point Layout"
description: "Predict how much RAM a PDAL pipeline needs before running it: read the point count from the header, measure bytes per point from the dimension layout, add the cost of dimensions that filters create, and apply a safety factor for spatial indexes."
slug: "estimating-pdal-memory-from-point-layout"
type: "howto"
breadcrumb: "Estimating Memory from Layout"
datePublished: "2026-09-18"
dateModified: "2026-09-18"
---

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Article",
      "headline": "Estimating PDAL Memory from Point Layout",
      "description": "Predict how much RAM a PDAL pipeline needs before running it: read the point count from the header, measure bytes per point from the dimension layout, add the cost of dimensions that filters create, and apply a safety factor for spatial indexes.",
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
          "name": "PDAL Pipeline Architecture and Execution",
          "item": "https://www.pythonlidar.com/pdal-pipeline-architecture-execution/"
        },
        {
          "@type": "ListItem",
          "position": 3,
          "name": "Memory Management",
          "item": "https://www.pythonlidar.com/pdal-pipeline-architecture-execution/memory-management/"
        },
        {
          "@type": "ListItem",
          "position": 4,
          "name": "Estimating Memory from Layout",
          "item": "https://www.pythonlidar.com/pdal-pipeline-architecture-execution/memory-management/estimating-pdal-memory-from-point-layout/"
        }
      ]
    },
    {
      "@type": "HowTo",
      "name": "Estimate PDAL pipeline memory from the point layout",
      "step": [
        {
          "@type": "HowToStep",
          "name": "Read the point count without loading points",
          "text": "pdal info --summary tile.laz reads only the header and returns summary.num_points. It is instant even for multi-gigabyte files."
        },
        {
          "@type": "HowToStep",
          "name": "Measure bytes per point empirically",
          "text": "Run the pipeline's own stages on the first point only, using filters.head with count: 1, and read arrays[0].dtype.itemsize. This counts every dimension the reader produces and every dimension the filters add \u2014 no guessing about extra bytes or PDRF layouts."
        },
        {
          "@type": "HowToStep",
          "name": "Add stage overhead",
          "text": "Neighbourhood stages (filters.smrf, filters.outlier, filters.hag_nn, filters.covariancefeatures) build a spatial index: budget roughly 0.5 to 1\u00d7 the point table again. writers.gdal holds its raster buffers: rows \u00d7 columns \u00d7 8 bytes \u00d7 number of output types."
        },
        {
          "@type": "HowToStep",
          "name": "Add the Python copy",
          "text": "pipeline.arrays returns NumPy arrays that share or copy PDAL's data depending on version and usage. If your code touches arrays, budget one extra copy of the table."
        },
        {
          "@type": "HowToStep",
          "name": "Apply a safety factor and decide",
          "text": "Multiply by 1.2 for allocator slack and compare against the worker's memory, leaving room for the OS and anything else on the machine."
        }
      ]
    },
    {
      "@type": "FAQPage",
      "mainEntity": [
        {
          "@type": "Question",
          "name": "How many bytes per point does PDAL use in memory?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "It depends on the dimensions present. A typical point format 6 tile uses around 48 bytes per point in PDAL's table before any filters add dimensions, because coordinates are stored as 8-byte doubles. Measure it for your data with a one-point probe."
          }
        },
        {
          "@type": "Question",
          "name": "Why is PDAL's memory use much larger than the LAZ file size?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "LAZ compresses points to a few bytes each, and even uncompressed LAS stores coordinates as scaled 4-byte integers. In memory, PDAL expands coordinates to doubles and adds any computed dimensions, so the table is often five to ten times the LAZ size."
          }
        },
        {
          "@type": "Question",
          "name": "How much extra memory does SMRF or outlier filtering need?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Neighbourhood filters build a spatial index over all points, which typically costs half to one times the point table again for the duration of the stage. Budget for it whenever such a stage is present."
          }
        },
        {
          "@type": "Question",
          "name": "Can I avoid the Python copy of the points?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Yes, by not accessing pipeline.arrays when you only need the pipeline to write files. Execute and let the writer produce the output; read the result later only if you need it."
          }
        }
      ]
    }
  ]
}
</script>

**TL;DR:** Memory in standard mode ≈ point count × bytes per point × safety factor. Get the count from the header (`pdal info --summary`), get bytes per point by reading one point through the pipeline's own stages and checking `arrays[0].dtype.itemsize`, add 8 bytes for every double a later filter creates, and multiply by 1.5–2 for neighbourhood stages that build a k-d tree.

## Context and Motivation

This guide is part of [Memory Management in PDAL](https://www.pythonlidar.com/pdal-pipeline-architecture-execution/memory-management/). Out-of-memory failures are the most common way PDAL batch jobs die, and they are expensive: a job killed by the kernel after forty minutes of SMRF has wasted forty minutes and gives no Python traceback. The fix is to know, before launching, how much memory each tile needs — then choose instance sizes, tile sizes and concurrency to fit.

PDAL makes this predictable. In standard mode it holds every point in a table whose row width is the sum of the dimension sizes, so memory scales linearly with point count and with the number of dimensions. Everything else — spatial indexes, raster buffers, Python copies — is a multiple on top of that base.

<svg viewBox="0 0 740 210" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Bytes per point built up from the dimensions in a PDAL point table" style="width:100%;max-width:740px;display:block;margin:1.6rem auto">
  <title>Where the bytes per point go</title>
  <desc>A horizontal stacked bar of bytes per point for a typical PDRF 6 tile in PDAL's table. X, Y and Z as doubles take 24 bytes. GpsTime takes 8. Standard small dimensions — intensity, returns, flags, classification, scan angle, user data, point source ID — take about 16. HeightAboveGround added by a filter takes another 8. The total is about 56 bytes, roughly twice the 30-byte LAS record on disk.</desc>
  <rect x="0" y="0" width="740" height="210" fill="var(--dg-bg)" rx="10"/>
  <rect x="40" y="60" width="264" height="44" fill="var(--dg-a-soft)" stroke="var(--dg-a)" stroke-width="1.2"/>
  <text x="172" y="87" text-anchor="middle" font-size="11" fill="var(--dg-text)">X, Y, Z doubles: 24 B</text>
  <rect x="304" y="60" width="88" height="44" fill="var(--dg-b-soft)" stroke="var(--dg-b)" stroke-width="1.2"/>
  <text x="348" y="87" text-anchor="middle" font-size="11" fill="var(--dg-text)">GpsTime 8</text>
  <rect x="392" y="60" width="176" height="44" fill="var(--dg-surface-2)" stroke="var(--dg-line)" stroke-width="1.2"/>
  <text x="480" y="87" text-anchor="middle" font-size="11" fill="var(--dg-text)">small dims ≈ 16</text>
  <rect x="568" y="60" width="88" height="44" fill="var(--dg-c-soft)" stroke="var(--dg-c)" stroke-width="1.2"/>
  <text x="612" y="87" text-anchor="middle" font-size="11" fill="var(--dg-text)">HAG 8</text>
  <rect x="40" y="140" width="330" height="26" fill="var(--dg-d-soft)" stroke="var(--dg-d)" stroke-width="1.2"/>
  <text x="205" y="158" text-anchor="middle" font-size="10.5" fill="var(--dg-text)">PDRF 6 record on disk: 30 B</text>
  <text x="40" y="40" font-size="10.5" fill="var(--dg-muted)">in PDAL's point table, about 56 bytes per point after one added dimension</text>
  <text x="40" y="190" font-size="10.5" fill="var(--dg-muted)">LAZ on disk is smaller still — typically 5–10 bytes per point</text>
</svg>

## Prerequisites and Assumptions

- PDAL 2.x and the Python bindings.
- The pipeline you intend to run, and one representative input tile.
- Standard (non-streaming) execution. Streaming mode bounds memory by chunk size instead, which is covered in [running a PDAL pipeline in streaming mode](https://www.pythonlidar.com/pdal-pipeline-architecture-execution/streaming-mode-execution/running-a-pdal-pipeline-in-streaming-mode/).

## Step-by-Step Implementation

### Step 1 — Read the point count without loading points

`pdal info --summary tile.laz` reads only the header and returns `summary.num_points`. It is instant even for multi-gigabyte files.

### Step 2 — Measure bytes per point empirically

Run the pipeline's own stages on the first point only, using `filters.head` with `count: 1`, and read `arrays[0].dtype.itemsize`. This counts every dimension the reader produces and every dimension the filters add — no guessing about extra bytes or PDRF layouts.

### Step 3 — Add stage overhead

Neighbourhood stages (`filters.smrf`, `filters.outlier`, `filters.hag_nn`, `filters.covariancefeatures`) build a spatial index: budget roughly 0.5 to 1× the point table again. `writers.gdal` holds its raster buffers: rows × columns × 8 bytes × number of output types.

### Step 4 — Add the Python copy

`pipeline.arrays` returns NumPy arrays that share or copy PDAL's data depending on version and usage. If your code touches `arrays`, budget one extra copy of the table.

### Step 5 — Apply a safety factor and decide

Multiply by 1.2 for allocator slack and compare against the worker's memory, leaving room for the OS and anything else on the machine.

## Complete Working Example

```python
"""Estimate peak memory for a PDAL pipeline on a given tile."""
from __future__ import annotations

import copy
import json
import subprocess
from pathlib import Path

import pdal

NEIGHBOURHOOD = {"filters.smrf", "filters.pmf", "filters.outlier", "filters.hag_nn",
                 "filters.hag_delaunay", "filters.covariancefeatures", "filters.normal",
                 "filters.cluster", "filters.dbscan", "filters.csf"}


def point_count(path: Path) -> int:
    out = subprocess.run(["pdal", "info", "--summary", str(path)],
                         capture_output=True, text=True, check=True).stdout
    return int(json.loads(out)["summary"]["num_points"])


def bytes_per_point(spec: dict) -> int:
    probe = copy.deepcopy(spec)
    stages = [s for s in probe["pipeline"] if not str(s.get("type", "")).startswith("writers.")]
    stages.insert(1, {"type": "filters.head", "count": 1})
    p = pdal.Pipeline(json.dumps({"pipeline": stages}))
    p.execute()
    return p.arrays[0].dtype.itemsize


def raster_bytes(spec: dict, extent_m: float = 1000.0) -> int:
    total = 0
    for s in spec["pipeline"]:
        if s.get("type") == "writers.gdal":
            cells = (extent_m / float(s.get("resolution", 1.0))) ** 2
            kinds = len(str(s.get("output_type", "all")).split(","))
            total += int(cells * 8 * (6 if s.get("output_type", "all") == "all" else kinds))
    return total


def estimate(spec: dict, tile: Path, python_copy: bool = True) -> dict:
    n = point_count(tile)
    bpp = bytes_per_point(spec)
    table = n * bpp
    types = {s.get("type") for s in spec["pipeline"] if isinstance(s, dict)}
    index = table * (1.0 if types & NEIGHBOURHOOD else 0.0)
    extra = table if python_copy else 0
    peak = 1.2 * (table + index + extra + raster_bytes(spec))
    return {"points": n, "bytes_per_point": bpp,
            "table_gb": round(table / 1e9, 2), "peak_gb": round(peak / 1e9, 2)}


if __name__ == "__main__":
    spec = json.loads(Path("dtm.json").read_text())
    print(estimate(spec, Path("tiles/t_0431.laz")))
```

For a 1 km² tile with 42 million points, a PDRF 6 input and a pipeline that adds `HeightAboveGround`, the output looks like:

```text
{'points': 42000000, 'bytes_per_point': 56, 'table_gb': 2.35, 'peak_gb': 8.54}
```

<svg viewBox="0 0 740 200" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Components of the peak memory estimate for one tile" style="width:100%;max-width:740px;display:block;margin:1.6rem auto">
  <title>From point table to peak</title>
  <desc>A waterfall of memory components for a 42 million point tile. The point table is 2.35 gigabytes. The spatial index for SMRF adds 2.35. The Python array copy adds 2.35. Raster buffers add 0.05. A 1.2 safety factor brings the peak estimate to about 8.5 gigabytes.</desc>
  <rect x="0" y="0" width="740" height="200" fill="var(--dg-bg)" rx="10"/>
  <line x1="60" y1="170" x2="700" y2="170" stroke="var(--dg-line)" stroke-width="1.3"/>
  <rect x="80" y="130" width="100" height="40" fill="var(--dg-a-soft)" stroke="var(--dg-a)" stroke-width="1.2"/>
  <rect x="200" y="90" width="100" height="40" fill="var(--dg-b-soft)" stroke="var(--dg-b)" stroke-width="1.2"/>
  <rect x="320" y="50" width="100" height="40" fill="var(--dg-c-soft)" stroke="var(--dg-c)" stroke-width="1.2"/>
  <rect x="440" y="48" width="100" height="2" fill="var(--dg-line)"/>
  <rect x="560" y="26" width="100" height="144" fill="var(--dg-e-soft)" stroke="var(--dg-e)" stroke-width="1.2"/>
  <g font-size="10.5" fill="var(--dg-text)"><text text-anchor="middle" x="130" y="188">table 2.35</text><text text-anchor="middle" x="250" y="188">+ index 2.35</text><text text-anchor="middle" x="370" y="188">+ copy 2.35</text><text text-anchor="middle" x="490" y="188">+ raster 0.05</text><text text-anchor="middle" x="610" y="188">peak ≈ 8.5 GB</text></g>
  <text x="610" y="100" text-anchor="middle" font-size="10.5" fill="var(--dg-text)">× 1.2</text>
</svg>

## Key Parameter Table

| Component | Estimate | Notes |
|---|---|---|
| Point table | count × itemsize | Measured, not assumed |
| Added doubles | 8 B per new dimension per point | HAG, covariance features, normals |
| Spatial index | 0.5–1 × table | Any neighbourhood filter |
| Python copy | 1 × table | Only if `pipeline.arrays` is accessed |
| `writers.gdal` buffers | cells × 8 B × output types | `output_type: "all"` is six buffers |
| Safety factor | 1.2 | Allocator slack and fragmentation |

## Verification

The estimate is only useful if it matches reality. Measure peak memory for a few tiles with the method in [measuring peak memory of a PDAL pipeline](https://www.pythonlidar.com/pdal-pipeline-architecture-execution/memory-management/measuring-peak-memory-of-a-pdal-pipeline/) and compare: a good estimate is within 20 percent and errs high. If measured peaks are consistently lower, reduce the index factor; if higher, look for a stage the estimate does not know about.

## Gotchas and Edge Cases

**Point density varies across tiles.** Tiles over forest or with flightline overlap can hold twice the points of tiles over fields. Estimate from the largest tile in the batch, not the median, or size workers per tile.

**Extra bytes dimensions.** A vendor file with ten extra-byte dimensions carries them into PDAL's table. The empirical itemsize catches this; an estimate from the PDRF alone would not.

**Merged inputs.** Pipelines that merge neighbours hold all of them at once; sum the counts of every reader.

<svg viewBox="0 0 740 180" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Point counts across a batch of tiles with the maximum highlighted" style="width:100%;max-width:740px;display:block;margin:1.6rem auto">
  <title>Size for the biggest tile, not the average</title>
  <desc>A row of twelve bars showing point counts for tiles in a batch. Most are between 30 and 45 million. Two forest tiles with overlap reach 78 and 84 million. A dashed line at the median sits far below the maximum, illustrating that a worker sized for the median would fail on the largest tiles.</desc>
  <rect x="0" y="0" width="740" height="180" fill="var(--dg-bg)" rx="10"/>
  <line x1="40" y1="150" x2="700" y2="150" stroke="var(--dg-line)" stroke-width="1.3"/>
  <g fill="var(--dg-b)"><rect x="60" y="92" width="36" height="58"/><rect x="110" y="84" width="36" height="66"/><rect x="160" y="96" width="36" height="54"/><rect x="210" y="80" width="36" height="70"/><rect x="310" y="90" width="36" height="60"/><rect x="360" y="86" width="36" height="64"/><rect x="460" y="94" width="36" height="56"/><rect x="510" y="82" width="36" height="68"/><rect x="560" y="88" width="36" height="62"/><rect x="610" y="90" width="36" height="60"/></g>
  <g fill="var(--dg-e)"><rect x="260" y="26" width="36" height="124"/><rect x="410" y="20" width="36" height="130"/></g>
  <line x1="40" y1="88" x2="700" y2="88" stroke="var(--dg-line-soft)" stroke-width="1.2" stroke-dasharray="5 4"/>
  <text x="696" y="80" text-anchor="end" font-size="10.5" fill="var(--dg-muted)">median ≈ 38 M</text>
  <text x="428" y="14" text-anchor="middle" font-size="10.5" fill="var(--dg-e)">84 M</text>
  <text x="370" y="170" text-anchor="middle" font-size="10.5" fill="var(--dg-muted)">tiles in one batch, points per tile</text>
</svg>

**Streaming changes everything.** If every stage streams, memory is bounded by `chunk_size` × bytes per point, independent of tile size. Check `pipeline.streamable` before sizing for standard mode.

## Frequently Asked Questions

**How many bytes per point does PDAL use in memory?**

It depends on the dimensions present. A typical point format 6 tile uses around 48 bytes per point in PDAL's table before any filters add dimensions, because coordinates are stored as 8-byte doubles. Measure it for your data with a one-point probe.

**Why is PDAL's memory use much larger than the LAZ file size?**

LAZ compresses points to a few bytes each, and even uncompressed LAS stores coordinates as scaled 4-byte integers. In memory, PDAL expands coordinates to doubles and adds any computed dimensions, so the table is often five to ten times the LAZ size.

**How much extra memory does SMRF or outlier filtering need?**

Neighbourhood filters build a spatial index over all points, which typically costs half to one times the point table again for the duration of the stage. Budget for it whenever such a stage is present.

**Can I avoid the Python copy of the points?**

Yes, by not accessing pipeline.arrays when you only need the pipeline to write files. Execute and let the writer produce the output; read the result later only if you need it.

## Related

- [Memory Management in PDAL](https://www.pythonlidar.com/pdal-pipeline-architecture-execution/memory-management/) — the execution model behind these numbers
- [Measuring Peak Memory of a PDAL Pipeline](https://www.pythonlidar.com/pdal-pipeline-architecture-execution/memory-management/measuring-peak-memory-of-a-pdal-pipeline/) — checking the estimate
- [Diagnosing PDAL Out-of-Memory Failures](https://www.pythonlidar.com/pdal-pipeline-architecture-execution/memory-management/diagnosing-pdal-out-of-memory-failures/) — when the estimate was wrong
- [LAZ vs Uncompressed LAS for Iterative Processing](https://www.pythonlidar.com/pdal-pipeline-architecture-execution/memory-management/laz-vs-uncompressed-las-for-iterative-processing/) — on-disk versus in-memory size
- [Understanding LAS Point Data Record Formats](https://www.pythonlidar.com/point-cloud-data-standards-fundamentals/laslaz-file-structure/understanding-las-point-data-record-formats/) — the formats being expanded
