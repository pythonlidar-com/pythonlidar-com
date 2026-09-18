---
title: "Chunked Reading of Large LAS Files with laspy"
description: "Process LAS and LAZ files larger than memory with laspy's chunk_iterator: streaming statistics, filtering to a new file, splitting by attribute, choosing chunk sizes, and parallel LAZ decompression with the lazrs backend."
slug: "chunked-reading-of-large-las-files-with-laspy"
type: "howto"
breadcrumb: "Chunked Reading with laspy"
datePublished: "2026-09-18"
dateModified: "2026-09-18"
---

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Article",
      "headline": "Chunked Reading of Large LAS Files with laspy",
      "description": "Process LAS and LAZ files larger than memory with laspy's chunk_iterator: streaming statistics, filtering to a new file, splitting by attribute, choosing chunk sizes, and parallel LAZ decompression with the lazrs backend.",
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
          "name": "laspy and NumPy Workflows",
          "item": "https://www.pythonlidar.com/point-cloud-data-standards-fundamentals/laspy-numpy-workflows/"
        },
        {
          "@type": "ListItem",
          "position": 4,
          "name": "Chunked Reading with laspy",
          "item": "https://www.pythonlidar.com/point-cloud-data-standards-fundamentals/laspy-numpy-workflows/chunked-reading-of-large-las-files-with-laspy/"
        }
      ]
    },
    {
      "@type": "HowTo",
      "name": "Process large LAS files in chunks with laspy",
      "step": [
        {
          "@type": "HowToStep",
          "name": "Open and read the header",
          "text": "laspy.open(path) returns a reader; its header gives count, format and bounds for sizing accumulators."
        },
        {
          "@type": "HowToStep",
          "name": "Choose a chunk size",
          "text": "One to five million points is a good range: large enough that per-chunk Python overhead is negligible, small enough to keep memory to a few hundred megabytes."
        },
        {
          "@type": "HowToStep",
          "name": "Accumulate, do not collect",
          "text": "Update counters, histograms and grids inside the loop. Appending chunks to a list rebuilds the whole file in memory and defeats the purpose."
        },
        {
          "@type": "HowToStep",
          "name": "Write as you go",
          "text": "For outputs, open one writer before the loop with the header you want and call write_points per chunk."
        },
        {
          "@type": "HowToStep",
          "name": "Split with several writers",
          "text": "To split by an attribute (flightline, class), keep a dictionary of writers keyed by value and route each chunk's subsets to the right one."
        }
      ]
    },
    {
      "@type": "FAQPage",
      "mainEntity": [
        {
          "@type": "Question",
          "name": "How do I read a huge LAS file with laspy?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Open it with laspy.open and loop over chunk_iterator with a chunk size of a few million points. Each chunk behaves like a small point record with the usual fields, and memory stays bounded by the chunk size."
          }
        },
        {
          "@type": "Question",
          "name": "Can I write a filtered file while iterating?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Yes. Open a writer before the loop with the header you want, and call write_points with the filtered subset of each chunk. laspy updates the header counts and bounds when the writer closes."
          }
        },
        {
          "@type": "Question",
          "name": "What chunk size should I use?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "One to five million points works well. Smaller chunks increase overhead from Python and decompression calls; larger chunks increase memory without much speed gain."
          }
        },
        {
          "@type": "Question",
          "name": "How do I speed up reading LAZ?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Use the parallel lazrs backend, which decompresses on multiple cores. For repeated reads of the same data, convert once to uncompressed LAS on fast local disk, or to COPC if you need spatial queries."
          }
        }
      ]
    }
  ]
}
</script>

**TL;DR:** `with laspy.open(path) as f: for chunk in f.chunk_iterator(2_000_000): ...` yields point records of at most two million points each, with the same fields and scaled accessors as a full read. Accumulate statistics across chunks, or write filtered chunks to an open `laspy.open(out, mode="w", header=...)` writer. Memory stays at roughly one chunk regardless of file size.

## Context and Motivation

This guide is part of [laspy and NumPy Workflows for LAS Data](https://www.pythonlidar.com/point-cloud-data-standards-fundamentals/laspy-numpy-workflows/). Statewide deliveries, merged project files and dense corridor surveys routinely produce single LAZ files of hundreds of millions of points — far more than a laptop, and often more than a batch worker, can hold. `laspy.read` on such a file fails with a memory error or, worse, slows the machine to a crawl as it swaps. The chunk iterator keeps the convenience of laspy's NumPy fields while bounding memory, which covers most "look at every point once" jobs: class histograms, extent and density checks, filtering to a smaller file, splitting by flightline or class, and fixing an attribute in place.

<svg viewBox="0 0 740 210" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Memory use of a full read versus chunked iteration as file size grows" style="width:100%;max-width:740px;display:block;margin:1.6rem auto">
  <title>Memory that does not grow with the file</title>
  <desc>A chart of peak memory against file size in millions of points. A full read with laspy.read rises linearly, from about 1 gigabyte at 30 million points to about 10 gigabytes at 300 million, crossing a 16 gigabyte worker limit shortly after. Chunked iteration with 2 million points per chunk stays flat at about 150 megabytes at every size.</desc>
  <rect x="0" y="0" width="740" height="210" fill="var(--dg-bg)" rx="10"/>
  <line x1="80" y1="170" x2="690" y2="170" stroke="var(--dg-line)" stroke-width="1.3"/>
  <line x1="80" y1="170" x2="80" y2="20" stroke="var(--dg-line)" stroke-width="1.3"/>
  <line x1="80" y1="164" x2="690" y2="30" stroke="var(--dg-e)" stroke-width="2"/>
  <line x1="80" y1="166" x2="690" y2="166" stroke="var(--dg-d)" stroke-width="2"/>
  <line x1="80" y1="60" x2="690" y2="60" stroke="var(--dg-line-soft)" stroke-width="1.2" stroke-dasharray="6 4"/>
  <text x="686" y="54" text-anchor="end" font-size="10.5" fill="var(--dg-muted)">16 GB worker</text>
  <text x="420" y="80" font-size="10.5" fill="var(--dg-e)">laspy.read</text>
  <text x="420" y="160" font-size="10.5" fill="var(--dg-d)">chunk_iterator(2_000_000)</text>
  <text x="385" y="192" text-anchor="middle" font-size="10.5" fill="var(--dg-muted)">file size, 0–500 million points (illustrative, PDRF 6)</text>
  <text x="44" y="96" font-size="10.5" fill="var(--dg-muted)" transform="rotate(-90 44 96)" text-anchor="middle">peak memory</text>
</svg>

## Prerequisites and Assumptions

- laspy 2.x with `lazrs` for LAZ (`pip install "laspy[lazrs]"`).
- Work that visits each point once and does not need neighbours across chunk boundaries.
- Enough disk for outputs, since results are written as you go.

## Step-by-Step Implementation

### Step 1 — Open and read the header

`laspy.open(path)` returns a reader; its `header` gives count, format and bounds for sizing accumulators.

### Step 2 — Choose a chunk size

One to five million points is a good range: large enough that per-chunk Python overhead is negligible, small enough to keep memory to a few hundred megabytes.

### Step 3 — Accumulate, do not collect

Update counters, histograms and grids inside the loop. Appending chunks to a list rebuilds the whole file in memory and defeats the purpose.

### Step 4 — Write as you go

For outputs, open one writer before the loop with the header you want and call `write_points` per chunk.

### Step 5 — Split with several writers

To split by an attribute (flightline, class), keep a dictionary of writers keyed by value and route each chunk's subsets to the right one.

## Complete Working Example

Three jobs in one pass over a large file — a class histogram, a 10 m density grid, and a split into one file per flightline — all in bounded memory:

```python
"""One pass over a large LAZ: class histogram, density grid, split by PointSourceId."""
from __future__ import annotations

from contextlib import ExitStack
from pathlib import Path

import laspy
import numpy as np

SRC = Path("big/county_block_7.laz")
OUT = Path("out/by_line")
CHUNK = 2_000_000
CELL = 10.0

OUT.mkdir(parents=True, exist_ok=True)

with laspy.open(SRC, laz_backend=laspy.LazBackend.LazrsParallel) as reader, ExitStack() as stack:
    h = reader.header
    x0, y0 = h.mins[0], h.mins[1]
    cols = int(np.ceil((h.maxs[0] - x0) / CELL)) + 1
    rows = int(np.ceil((h.maxs[1] - y0) / CELL)) + 1
    density = np.zeros((rows, cols), dtype=np.int32)
    classes = np.zeros(256, dtype=np.int64)
    writers: dict[int, laspy.LasWriter] = {}

    for i, chunk in enumerate(reader.chunk_iterator(CHUNK)):
        classes += np.bincount(chunk.classification, minlength=256)
        c = ((np.asarray(chunk.x) - x0) // CELL).astype(int)
        r = ((np.asarray(chunk.y) - y0) // CELL).astype(int)
        np.add.at(density, (r, c), 1)

        for psid in np.unique(chunk.point_source_id):
            if psid not in writers:
                writers[psid] = stack.enter_context(
                    laspy.open(OUT / f"line_{psid}.laz", mode="w", header=h))
            writers[psid].write_points(chunk[chunk.point_source_id == psid])

        if i % 20 == 0:
            print(f"chunk {i}: {(i + 1) * CHUNK:,} points processed")

print({int(k): int(v) for k, v in enumerate(classes) if v})
print(f"density: median {np.median(density[density > 0]) / CELL**2:.1f} pts/m²")
print(f"{len(writers)} flightline files written")
```

`ExitStack` closes every flightline writer when the block ends, which is when laspy finalizes each file's header counts and bounds.

<svg viewBox="0 0 740 210" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Chunks routed to per-flightline writers" style="width:100%;max-width:740px;display:block;margin:1.6rem auto">
  <title>Routing chunks to several outputs</title>
  <desc>A stream of chunks on the left. Each chunk is split by PointSourceId, and the subsets are sent to one of three open writers, for lines 1101, 1102 and 1103. Writers are created the first time a line appears and closed together at the end, when each file's header is finalized.</desc>
  <defs><marker id="ck-arw" markerWidth="9" markerHeight="7" refX="9" refY="3.5" orient="auto"><path d="M0,0 L0,7 L9,3.5 z" fill="var(--dg-line)"/></marker></defs>
  <rect x="0" y="0" width="740" height="210" fill="var(--dg-bg)" rx="10"/>
  <g font-size="10.5" fill="var(--dg-text)">
    <rect x="20" y="30" width="130" height="34" rx="6" fill="var(--dg-surface)" stroke="var(--dg-line)"/><text text-anchor="middle" x="85" y="51">chunk 0</text>
    <rect x="20" y="88" width="130" height="34" rx="6" fill="var(--dg-surface)" stroke="var(--dg-line)"/><text text-anchor="middle" x="85" y="109">chunk 1</text>
    <rect x="20" y="146" width="130" height="34" rx="6" fill="var(--dg-surface)" stroke="var(--dg-line)"/><text text-anchor="middle" x="85" y="167">chunk n</text>
    <rect x="260" y="80" width="170" height="50" rx="8" fill="var(--dg-a-soft)" stroke="var(--dg-a)"/><text text-anchor="middle" x="345" y="102">split by</text><text text-anchor="middle" x="345" y="118">point_source_id</text>
    <rect x="540" y="24" width="180" height="40" rx="7" fill="var(--dg-d-soft)" stroke="var(--dg-d)"/><text text-anchor="middle" x="630" y="48">line_1101.laz</text>
    <rect x="540" y="85" width="180" height="40" rx="7" fill="var(--dg-d-soft)" stroke="var(--dg-d)"/><text text-anchor="middle" x="630" y="109">line_1102.laz</text>
    <rect x="540" y="146" width="180" height="40" rx="7" fill="var(--dg-d-soft)" stroke="var(--dg-d)"/><text text-anchor="middle" x="630" y="170">line_1103.laz</text>
  </g>
  <line x1="150" y1="47" x2="256" y2="95" stroke="var(--dg-line)" stroke-width="1.3" marker-end="url(#ck-arw)"/>
  <line x1="150" y1="105" x2="256" y2="105" stroke="var(--dg-line)" stroke-width="1.3" marker-end="url(#ck-arw)"/>
  <line x1="150" y1="163" x2="256" y2="115" stroke="var(--dg-line)" stroke-width="1.3" marker-end="url(#ck-arw)"/>
  <line x1="430" y1="95" x2="536" y2="44" stroke="var(--dg-line)" stroke-width="1.3" marker-end="url(#ck-arw)"/>
  <line x1="430" y1="105" x2="536" y2="105" stroke="var(--dg-line)" stroke-width="1.3" marker-end="url(#ck-arw)"/>
  <line x1="430" y1="115" x2="536" y2="166" stroke="var(--dg-line)" stroke-width="1.3" marker-end="url(#ck-arw)"/>
</svg>

## Key Parameter Table

| Setting | Typical value | Effect |
|---|---|---|
| chunk size | 1–5 million | Memory ≈ chunk × record size × 2–3 for derived arrays |
| `laz_backend` | `LazrsParallel` | Multi-core LAZ decompression for large files |
| writer header | source header | Same format, scales, offsets; counts fixed on close |
| grid cell | 1–10 m | Accumulator size; rows × cols × 4 bytes |
| progress interval | every 10–20 chunks | Visibility on long runs without log spam |

## Verification

- **Counts add up.** The class histogram's total must equal `header.point_count`, and the per-flightline files' counts must sum to it too.
- **Headers valid.** Open each output with `laspy.open` and check `point_count` and bounds are non-zero and plausible; a writer that was never closed leaves an invalid header.
- **Flat memory.** Watch RSS during a run; it should plateau after the first few chunks.

```python
total = sum(laspy.open(p).header.point_count for p in OUT.glob("line_*.laz"))
assert total == laspy.open(SRC).header.point_count
```

## Gotchas and Edge Cases

**Chunks are not spatial.** Points arrive in file order, which usually follows acquisition time. A chunk is a stripe of scan lines, not a tile; anything that needs neighbours must be done with a spatial tool, not per chunk.

**Many writers, many open files.** Splitting by an attribute with thousands of values opens thousands of files. Group values, or write to intermediate files per group and merge later.

**Append mode and LAZ.** `mode="a"` appends to uncompressed LAS but is not available for LAZ. Keep one writer open across the loop rather than reopening per chunk.

<svg viewBox="0 0 740 170" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Throughput of LAZ decompression with single and parallel backends" style="width:100%;max-width:740px;display:block;margin:1.6rem auto">
  <title>Decompression is the bottleneck</title>
  <desc>Bars of points per second read from a large LAZ file. The single-threaded lazrs backend reads about 9 million points per second. The parallel lazrs backend on 8 cores reads about 45 million points per second. Reading uncompressed LAS is faster still but costs five to ten times the disk.</desc>
  <rect x="0" y="0" width="740" height="170" fill="var(--dg-bg)" rx="10"/>
  <text x="200" y="46" text-anchor="end" font-size="11" fill="var(--dg-text)">lazrs, 1 thread</text>
  <rect x="210" y="32" width="88" height="22" fill="var(--dg-c)"/>
  <text x="306" y="48" font-size="10.5" fill="var(--dg-muted)">≈ 9 M pts/s</text>
  <text x="200" y="96" text-anchor="end" font-size="11" fill="var(--dg-text)">lazrs parallel, 8 cores</text>
  <rect x="210" y="82" width="440" height="22" fill="var(--dg-d)"/>
  <text x="646" y="126" text-anchor="end" font-size="10.5" fill="var(--dg-muted)">≈ 45 M pts/s (illustrative)</text>
  <text x="210" y="156" font-size="10.5" fill="var(--dg-muted)">measure on your hardware; disk and CPU both matter</text>
</svg>

**Modifying fields in place.** Chunks are copies; assigning to `chunk.classification` does not change the source file. To fix an attribute, write corrected chunks to a new file.

## Frequently Asked Questions

**How do I read a huge LAS file with laspy?**

Open it with laspy.open and loop over chunk_iterator with a chunk size of a few million points. Each chunk behaves like a small point record with the usual fields, and memory stays bounded by the chunk size.

**Can I write a filtered file while iterating?**

Yes. Open a writer before the loop with the header you want, and call write_points with the filtered subset of each chunk. laspy updates the header counts and bounds when the writer closes.

**What chunk size should I use?**

One to five million points works well. Smaller chunks increase overhead from Python and decompression calls; larger chunks increase memory without much speed gain.

**How do I speed up reading LAZ?**

Use the parallel lazrs backend, which decompresses on multiple cores. For repeated reads of the same data, convert once to uncompressed LAS on fast local disk, or to COPC if you need spatial queries.

## Related

- [laspy and NumPy Workflows for LAS Data](https://www.pythonlidar.com/point-cloud-data-standards-fundamentals/laspy-numpy-workflows/) — the library and its data model
- [Reading LAS into NumPy with laspy](https://www.pythonlidar.com/point-cloud-data-standards-fundamentals/laspy-numpy-workflows/reading-las-into-numpy-with-laspy/) — the whole-file version
- [Writing a LAS File from NumPy Arrays](https://www.pythonlidar.com/point-cloud-data-standards-fundamentals/laspy-numpy-workflows/writing-a-las-file-from-numpy-arrays/) — headers for new files
- [Iterating PDAL Arrays in Chunks from Python](https://www.pythonlidar.com/pdal-pipeline-architecture-execution/streaming-mode-execution/iterating-pdal-arrays-in-chunks-from-python/) — the PDAL equivalent
- [LAZ vs Uncompressed LAS for Iterative Processing](https://www.pythonlidar.com/pdal-pipeline-architecture-execution/memory-management/laz-vs-uncompressed-las-for-iterative-processing/) — when decompression cost matters
