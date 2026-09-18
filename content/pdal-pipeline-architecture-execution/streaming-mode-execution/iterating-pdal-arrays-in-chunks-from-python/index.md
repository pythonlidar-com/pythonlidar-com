---
title: "Iterating PDAL Arrays in Chunks from Python"
description: "Process point clouds larger than memory in Python with pdal.Pipeline.iterator(chunk_size=...): streaming statistics, per-chunk NumPy work, choosing chunk sizes, and what happens when a stage cannot stream."
slug: "iterating-pdal-arrays-in-chunks-from-python"
type: "howto"
breadcrumb: "Iterating Arrays in Chunks"
datePublished: "2026-09-18"
dateModified: "2026-09-18"
---

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Article",
      "headline": "Iterating PDAL Arrays in Chunks from Python",
      "description": "Process point clouds larger than memory in Python with pdal.Pipeline.iterator(chunk_size=...): streaming statistics, per-chunk NumPy work, choosing chunk sizes, and what happens when a stage cannot stream.",
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
          "name": "Streaming Mode Execution",
          "item": "https://www.pythonlidar.com/pdal-pipeline-architecture-execution/streaming-mode-execution/"
        },
        {
          "@type": "ListItem",
          "position": 4,
          "name": "Iterating Arrays in Chunks",
          "item": "https://www.pythonlidar.com/pdal-pipeline-architecture-execution/streaming-mode-execution/iterating-pdal-arrays-in-chunks-from-python/"
        }
      ]
    },
    {
      "@type": "HowTo",
      "name": "Iterate PDAL point arrays in chunks from Python",
      "step": [
        {
          "@type": "HowToStep",
          "name": "Build a pipeline without a writer",
          "text": "The iterator returns points to Python, so a writer is optional. Keep only the streamable reading and filtering stages."
        },
        {
          "@type": "HowToStep",
          "name": "Confirm it streams",
          "text": "Construct the pipeline and assert pipeline.streamable. If false, the iterator still works but loads everything first."
        },
        {
          "@type": "HowToStep",
          "name": "Choose a chunk size",
          "text": "One million points is a sensible default: large enough to amortize Python overhead, small enough to keep memory around 50\u2013100 MB depending on dimensions."
        },
        {
          "@type": "HowToStep",
          "name": "Accumulate per chunk",
          "text": "Update running totals \u2014 counts, sums, histograms, grid cells \u2014 inside the loop. Never append whole chunks to a list; that rebuilds the full array in memory."
        },
        {
          "@type": "HowToStep",
          "name": "Finalize after the loop",
          "text": "Compute means, percentiles from histograms, or write accumulated grids once the iteration ends."
        }
      ]
    },
    {
      "@type": "FAQPage",
      "mainEntity": [
        {
          "@type": "Question",
          "name": "What does pdal.Pipeline.iterator return?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "A Python iterator that yields NumPy structured arrays, each holding up to chunk_size points with the pipeline's dimensions as named fields. Memory is bounded by the chunk rather than by the file."
          }
        },
        {
          "@type": "Question",
          "name": "Does the iterator work with non-streamable filters?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "It runs, but the pipeline executes in standard mode, loading all points before yielding the first chunk. Check the streamable property first if bounded memory is the goal."
          }
        },
        {
          "@type": "Question",
          "name": "How big should chunks be?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Around one million points balances Python loop overhead against memory. Smaller chunks increase overhead; much larger ones raise memory without speeding things up much."
          }
        },
        {
          "@type": "Question",
          "name": "Can I compute a median height with chunks?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Approximately, from a histogram accumulated over chunks, with error up to one bin width. Exact medians need all values at once or a two-pass approach."
          }
        }
      ]
    }
  ]
}
</script>

**TL;DR:** For a streamable pipeline, `for arr in pdal.Pipeline(spec).iterator(chunk_size=1_000_000): ...` yields NumPy structured arrays of up to a million points each, so Python code can compute statistics, histograms or per-point results over a tile of any size with memory bounded by the chunk. Check `pipeline.streamable` first; a non-streamable stage makes the whole run load everything.

## Context and Motivation

This guide is part of [Streaming Mode Execution in PDAL](https://www.pythonlidar.com/pdal-pipeline-architecture-execution/streaming-mode-execution/). Streaming on the command line bounds memory for pipelines that end in a writer. But much Python work does not end in a writer: you want a histogram of heights, a count per class, a per-cell density grid or a set of points to hand to a model. `pipeline.execute()` followed by `pipeline.arrays` loads everything, which is exactly what fails on a 3 GB tile on a 4 GB worker. The Python bindings' iterator gives you the points in chunks instead, driving PDAL's streaming engine from a Python loop.

<svg viewBox="0 0 740 200" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Memory over time for execute plus arrays versus a chunked iterator" style="width:100%;max-width:740px;display:block;margin:1.6rem auto">
  <title>All at once versus a chunk at a time</title>
  <desc>Two memory traces over time for the same 60 million point tile. execute followed by arrays climbs steadily to about 3.6 gigabytes before any Python work begins. The iterator trace rises to about 120 megabytes and stays flat, with small teeth as each million-point chunk is produced and released.</desc>
  <rect x="0" y="0" width="740" height="200" fill="var(--dg-bg)" rx="10"/>
  <line x1="60" y1="170" x2="700" y2="170" stroke="var(--dg-line)" stroke-width="1.3"/>
  <line x1="60" y1="170" x2="60" y2="24" stroke="var(--dg-line)" stroke-width="1.3"/>
  <polyline points="60,168 200,120 340,70 420,34 700,34" fill="none" stroke="var(--dg-e)" stroke-width="2"/>
  <polyline points="60,168 80,158 100,160 120,157 140,160 160,157 180,160 200,157 220,160 240,157 260,160 280,157 300,160 320,157 340,160 360,157 380,160 400,157 420,160 440,157 460,160 480,157 500,160 520,157 540,160 560,157 580,160 600,157 620,160" fill="none" stroke="var(--dg-d)" stroke-width="2"/>
  <text x="430" y="28" font-size="10.5" fill="var(--dg-e)">execute() + arrays: ≈ 3.6 GB</text>
  <text x="440" y="148" font-size="10.5" fill="var(--dg-d)">iterator(chunk_size=1e6): ≈ 120 MB</text>
  <text x="380" y="190" text-anchor="middle" font-size="10.5" fill="var(--dg-muted)">time (illustrative 60 M point tile)</text>
</svg>

## Prerequisites and Assumptions

- `python-pdal` 3.x, which provides `Pipeline.iterator()`.
- A pipeline in which every stage streams — readers, `filters.range`, `filters.expression`, `filters.assign`, `filters.reprojection`, `filters.crop` and similar. See [which PDAL filters break streaming mode](https://www.pythonlidar.com/pdal-pipeline-architecture-execution/streaming-mode-execution/which-pdal-filters-break-streaming-mode/).
- Python work that can be expressed as an accumulation over chunks: counts, sums, histograms, per-cell grids, filtered outputs written incrementally.

## Step-by-Step Implementation

### Step 1 — Build a pipeline without a writer

The iterator returns points to Python, so a writer is optional. Keep only the streamable reading and filtering stages.

### Step 2 — Confirm it streams

Construct the pipeline and assert `pipeline.streamable`. If false, the iterator still works but loads everything first.

### Step 3 — Choose a chunk size

One million points is a sensible default: large enough to amortize Python overhead, small enough to keep memory around 50–100 MB depending on dimensions.

### Step 4 — Accumulate per chunk

Update running totals — counts, sums, histograms, grid cells — inside the loop. Never append whole chunks to a list; that rebuilds the full array in memory.

### Step 5 — Finalize after the loop

Compute means, percentiles from histograms, or write accumulated grids once the iteration ends.

## Complete Working Example

A height histogram, class counts and a 10 m point-count grid over a large tile, in bounded memory:

```python
"""Chunked statistics over a large LAZ with pdal.Pipeline.iterator."""
from __future__ import annotations

import json

import numpy as np
import pdal

SRC = "big/t_0431_60M.laz"
CELL = 10.0

spec = {"pipeline": [
    {"type": "readers.las", "filename": SRC},
    {"type": "filters.range", "limits": "Classification![7:7],Classification![18:18]"},
]}
pipeline = pdal.Pipeline(json.dumps(spec))
assert pipeline.streamable, "a stage blocks streaming; the iterator would load everything"

# Grid extent from the header, read cheaply before iterating.
info = pdal.Pipeline(json.dumps({"pipeline": [SRC]})).quickinfo["readers.las"]
b = info["bounds"]
x0, y0 = b["minx"], b["miny"]
cols = int(np.ceil((b["maxx"] - x0) / CELL))
rows = int(np.ceil((b["maxy"] - y0) / CELL))

edges = np.arange(-50.0, 3000.0, 0.5)
z_hist = np.zeros(len(edges) - 1, dtype=np.int64)
class_counts = np.zeros(256, dtype=np.int64)
grid = np.zeros((rows, cols), dtype=np.int32)
total = 0

for chunk in pipeline.iterator(chunk_size=1_000_000):
    total += len(chunk)
    z_hist += np.histogram(chunk["Z"], bins=edges)[0]
    class_counts += np.bincount(chunk["Classification"], minlength=256)
    c = np.clip(((chunk["X"] - x0) / CELL).astype(int), 0, cols - 1)
    r = np.clip(((chunk["Y"] - y0) / CELL).astype(int), 0, rows - 1)
    np.add.at(grid, (r, c), 1)

cdf = np.cumsum(z_hist) / z_hist.sum()
median_z = edges[np.searchsorted(cdf, 0.5)]
print(f"{total:,} points, median Z ≈ {median_z:.1f} m")
print({k: int(v) for k, v in enumerate(class_counts) if v})
print(f"density: mean {grid.mean() / CELL**2:.1f} pts/m², max cell {grid.max() / CELL**2:.1f}")
```

`quickinfo` reads the header only, so the grid can be sized before any points move.

<svg viewBox="0 0 740 200" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Chunks flowing into running accumulators" style="width:100%;max-width:740px;display:block;margin:1.6rem auto">
  <title>Chunks in, accumulators out</title>
  <desc>A column of numbered chunks on the left flows into three accumulators: a histogram array, a class count array and a density grid. Each chunk updates all three and is then released. After the last chunk, the accumulators are finalized into a median height, class totals and a density raster.</desc>
  <defs><marker id="it-arw" markerWidth="9" markerHeight="7" refX="9" refY="3.5" orient="auto"><path d="M0,0 L0,7 L9,3.5 z" fill="var(--dg-line)"/></marker></defs>
  <rect x="0" y="0" width="740" height="200" fill="var(--dg-bg)" rx="10"/>
  <g font-size="10.5" fill="var(--dg-text)">
    <rect x="30" y="24" width="120" height="30" rx="6" fill="var(--dg-surface)" stroke="var(--dg-line)"/><text text-anchor="middle" x="90" y="43">chunk 1 · 1 M</text>
    <rect x="30" y="62" width="120" height="30" rx="6" fill="var(--dg-surface)" stroke="var(--dg-line)"/><text text-anchor="middle" x="90" y="81">chunk 2 · 1 M</text>
    <rect x="30" y="100" width="120" height="30" rx="6" fill="var(--dg-surface)" stroke="var(--dg-line)"/><text text-anchor="middle" x="90" y="119">…</text>
    <rect x="30" y="138" width="120" height="30" rx="6" fill="var(--dg-surface)" stroke="var(--dg-line)"/><text text-anchor="middle" x="90" y="157">chunk 60</text>
    <rect x="280" y="24" width="180" height="34" rx="7" fill="var(--dg-a-soft)" stroke="var(--dg-a)"/><text text-anchor="middle" x="370" y="45">Z histogram</text>
    <rect x="280" y="80" width="180" height="34" rx="7" fill="var(--dg-b-soft)" stroke="var(--dg-b)"/><text text-anchor="middle" x="370" y="101">class counts</text>
    <rect x="280" y="136" width="180" height="34" rx="7" fill="var(--dg-c-soft)" stroke="var(--dg-c)"/><text text-anchor="middle" x="370" y="157">density grid</text>
    <rect x="560" y="80" width="160" height="34" rx="7" fill="var(--dg-d-soft)" stroke="var(--dg-d)"/><text text-anchor="middle" x="640" y="101">finalize</text>
  </g>
  <line x1="150" y1="96" x2="276" y2="41" stroke="var(--dg-line)" stroke-width="1.3" marker-end="url(#it-arw)"/>
  <line x1="150" y1="96" x2="276" y2="97" stroke="var(--dg-line)" stroke-width="1.3" marker-end="url(#it-arw)"/>
  <line x1="150" y1="96" x2="276" y2="153" stroke="var(--dg-line)" stroke-width="1.3" marker-end="url(#it-arw)"/>
  <line x1="460" y1="97" x2="556" y2="97" stroke="var(--dg-line)" stroke-width="1.3" marker-end="url(#it-arw)"/>
  <text x="510" y="190" text-anchor="middle" font-size="10.5" fill="var(--dg-muted)">each chunk is dropped after updating the accumulators</text>
</svg>

## Writing a Filtered Subset as You Go

Sometimes the Python work decides which points to keep — a model score above a threshold, a custom geometric test — and the kept points must end up in a file. Collecting them in a list would rebuild the cloud in memory; writing them per chunk keeps memory flat. laspy's writer accepts point records chunk by chunk, so the pattern is to open one writer before the loop and append inside it.

```python
import laspy

header = laspy.LasHeader(point_format=6, version="1.4")
header.scales = [0.01, 0.01, 0.01]
header.offsets = [x0, y0, 0.0]
with laspy.open("out/high_points.laz", mode="w", header=header) as writer:
    for chunk in pdal.Pipeline(json.dumps(spec)).iterator(chunk_size=1_000_000):
        keep = chunk[chunk["Z"] > 250.0]
        if len(keep) == 0:
            continue
        rec = laspy.ScaleAwarePointRecord.zeros(len(keep), header=header)
        rec.x, rec.y, rec.z = keep["X"], keep["Y"], keep["Z"]
        rec.classification = keep["Classification"]
        writer.write_points(rec)
```

The writer updates the header's point count and bounds when it closes, so the output is a valid LAZ file however many chunks contributed to it.

## Key Parameter Table

| Setting | Typical value | Effect |
|---|---|---|
| `chunk_size` | 1,000,000 | Points per yielded array; memory ≈ chunk × bytes per point |
| `prefetch` | 0 (default) | Chunks prepared ahead of consumption; more trades memory for overlap |
| `pipeline.streamable` | must be `True` | Otherwise the iterator loads the whole cloud first |
| histogram bin width | 0.1–1 m | Resolution of percentiles computed from the histogram |
| grid cell | 1–10 m | Size of per-cell accumulators; memory is rows × cols |

## Verification

- **Totals match the header.** The sum of chunk lengths should equal the reader's point count minus points removed by filters. Compare with `pdal info --summary` and a class count.
- **Same answer as the in-memory path.** On a small tile, compute the statistics both ways — iterator and `execute()` plus `arrays` — and assert equality.
- **Flat memory.** Measure peak RSS while iterating; it should not grow with tile size. See [measuring peak memory of a PDAL pipeline](https://www.pythonlidar.com/pdal-pipeline-architecture-execution/memory-management/measuring-peak-memory-of-a-pdal-pipeline/).

```python
small = {"pipeline": ["tiles/t_small.laz"]}
p = pdal.Pipeline(json.dumps(small)); p.execute()
full = np.bincount(p.arrays[0]["Classification"], minlength=256)
chunked = sum(np.bincount(c["Classification"], minlength=256)
              for c in pdal.Pipeline(json.dumps(small)).iterator(chunk_size=100_000))
assert np.array_equal(full, chunked)
```

## Gotchas and Edge Cases

**Exact percentiles need all the data.** A median over chunks cannot be computed exactly without holding every value. Histograms give percentiles to within one bin width, which is usually enough; if you need exact values, write the one dimension you care about to a memory-mapped array.

**Neighbourhood work across chunk edges.** Chunks are arbitrary slices of the point stream, not spatial tiles. Anything that needs neighbours — local slope, outlier tests — cannot be done correctly per chunk. Use PDAL's blocking filters in a separate pass for that.

**Appending chunks defeats the purpose.** `all_points.append(chunk)` in the loop rebuilds the whole cloud in Python memory. If you need a filtered subset, write it incrementally with laspy or a PDAL writer rather than collecting it.

<svg viewBox="180 0 520 170" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Chunks are stream slices, not spatial tiles" style="width:100%;max-width:740px;display:block;margin:1.6rem auto">
  <title>Chunks are not tiles</title>
  <desc>A tile with points coloured by the chunk they arrive in. Because points arrive in file order, which follows scan lines, each chunk is a set of interleaved stripes across the tile rather than a compact block. A neighbourhood around one point includes points from three different chunks.</desc>
  <rect x="180" y="0" width="520" height="170" fill="var(--dg-bg)" rx="10"/>
  <rect x="200" y="16" width="340" height="140" fill="var(--dg-surface)" stroke="var(--dg-line)" stroke-width="1.2"/>
  <g stroke-width="10">
    <line x1="210" y1="30" x2="530" y2="40" stroke="var(--dg-a-soft)"/><line x1="210" y1="52" x2="530" y2="62" stroke="var(--dg-b-soft)"/><line x1="210" y1="74" x2="530" y2="84" stroke="var(--dg-c-soft)"/><line x1="210" y1="96" x2="530" y2="106" stroke="var(--dg-a-soft)"/><line x1="210" y1="118" x2="530" y2="128" stroke="var(--dg-b-soft)"/><line x1="210" y1="140" x2="530" y2="148" stroke="var(--dg-c-soft)"/>
  </g>
  <circle cx="370" cy="80" r="30" fill="none" stroke="var(--dg-e)" stroke-width="1.8"/>
  <text x="560" y="84" font-size="10.5" fill="var(--dg-e)">one neighbourhood,</text>
  <text x="560" y="100" font-size="10.5" fill="var(--dg-e)">three chunks</text>
</svg>

**Non-streamable readers.** A reader that must index or sort its source before yielding points, or a remote source read through an unindexed format, may block. LAZ, LAS and COPC stream.

## Frequently Asked Questions

**What does pdal.Pipeline.iterator return?**

A Python iterator that yields NumPy structured arrays, each holding up to chunk_size points with the pipeline's dimensions as named fields. Memory is bounded by the chunk rather than by the file.

**Does the iterator work with non-streamable filters?**

It runs, but the pipeline executes in standard mode, loading all points before yielding the first chunk. Check the streamable property first if bounded memory is the goal.

**How big should chunks be?**

Around one million points balances Python loop overhead against memory. Smaller chunks increase overhead; much larger ones raise memory without speeding things up much.

**Can I compute a median height with chunks?**

Approximately, from a histogram accumulated over chunks, with error up to one bin width. Exact medians need all values at once or a two-pass approach.

## Related

- [Streaming Mode Execution in PDAL](https://www.pythonlidar.com/pdal-pipeline-architecture-execution/streaming-mode-execution/) — the engine behind the iterator
- [Running a PDAL Pipeline in Streaming Mode](https://www.pythonlidar.com/pdal-pipeline-architecture-execution/streaming-mode-execution/running-a-pdal-pipeline-in-streaming-mode/) — streaming for writer-terminated pipelines
- [Which PDAL Filters Break Streaming Mode](https://www.pythonlidar.com/pdal-pipeline-architecture-execution/streaming-mode-execution/which-pdal-filters-break-streaming-mode/) — keeping the pipeline streamable
- [Chunked Reading of Large LAS Files with laspy](https://www.pythonlidar.com/point-cloud-data-standards-fundamentals/laspy-numpy-workflows/chunked-reading-of-large-las-files-with-laspy/) — the laspy equivalent
- [Counting Points per Class with PDAL](https://www.pythonlidar.com/point-cloud-data-standards-fundamentals/asprs-classification-codes/counting-points-per-class-with-pdal/) — one accumulation in detail
