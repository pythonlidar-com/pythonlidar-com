---
title: "Load Balancing Uneven LiDAR Tiles"
description: "Keep every core busy when tile sizes vary tenfold: sort tiles largest-first by point count, submit one tile per task, stream results with as_completed, and cap concurrency by memory so the biggest tiles cannot run all at once."
slug: "load-balancing-uneven-lidar-tiles"
type: "howto"
breadcrumb: "Load Balancing Uneven Tiles"
datePublished: "2026-09-18"
dateModified: "2026-09-18"
---

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Article",
      "headline": "Load Balancing Uneven LiDAR Tiles",
      "description": "Keep every core busy when tile sizes vary tenfold: sort tiles largest-first by point count, submit one tile per task, stream results with as_completed, and cap concurrency by memory so the biggest tiles cannot run all at once.",
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
          "name": "Parallel Execution",
          "item": "https://www.pythonlidar.com/pdal-pipeline-architecture-execution/parallel-execution/"
        },
        {
          "@type": "ListItem",
          "position": 4,
          "name": "Load Balancing Uneven Tiles",
          "item": "https://www.pythonlidar.com/pdal-pipeline-architecture-execution/parallel-execution/load-balancing-uneven-lidar-tiles/"
        }
      ]
    },
    {
      "@type": "HowTo",
      "name": "Load-balance parallel PDAL processing of uneven LiDAR tiles",
      "step": [
        {
          "@type": "HowToStep",
          "name": "Read point counts from headers",
          "text": "laspy.open(path).header.point_count reads only the header \u2014 milliseconds per file even over a network mount."
        },
        {
          "@type": "HowToStep",
          "name": "Sort largest first",
          "text": "Order tiles by descending point count. That is the entire algorithm."
        },
        {
          "@type": "HowToStep",
          "name": "Submit one tile per task",
          "text": "Use executor.submit per tile, or map with chunksize=1. Larger chunk sizes bundle tiles into fixed groups and undo the balancing."
        },
        {
          "@type": "HowToStep",
          "name": "Cap concurrent big tiles by memory",
          "text": "If the three largest tiles cannot run simultaneously, run them in a smaller dedicated pool first, or use a semaphore keyed on estimated memory."
        },
        {
          "@type": "HowToStep",
          "name": "Collect as they complete",
          "text": "as_completed yields futures as they finish, so progress reporting and error handling do not wait for the slowest tile."
        }
      ]
    },
    {
      "@type": "FAQPage",
      "mainEntity": [
        {
          "@type": "Question",
          "name": "Why process the largest tiles first?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Because a large tile started late becomes a tail that runs alone after every other worker has finished. Starting the largest tiles first lets the many small tiles fill the remaining gaps, so all workers finish at about the same time."
          }
        },
        {
          "@type": "Question",
          "name": "Does Pool.map balance work automatically?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Only if each task is one tile. With a larger chunksize, tiles are bundled into fixed groups in submission order, and a group containing a large tile becomes the tail. Use a chunksize of one or submit tiles individually."
          }
        },
        {
          "@type": "Question",
          "name": "How do I get point counts without reading the points?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Read the LAS header, which stores the count. laspy's open function or pdal info with the summary flag return it in milliseconds per file."
          }
        },
        {
          "@type": "Question",
          "name": "What if the biggest tiles do not fit in memory together?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Run them first in a smaller pool sized so their combined peak memory fits, then process the remaining tiles with every worker."
          }
        }
      ]
    }
  ]
}
</script>

**TL;DR:** Read each tile's point count from its header, sort tiles largest first, submit them one per task to a process pool (no batching with `chunksize`), and collect with `as_completed`. Largest-first scheduling avoids the classic tail where one huge tile starts last and runs alone for twenty minutes while every other core sits idle.

## Context and Motivation

This guide is part of [Parallel Execution in PDAL](https://www.pythonlidar.com/pdal-pipeline-architecture-execution/parallel-execution/). Real LiDAR tiles are not equal. A 1 km² tile over farmland may hold 15 million points; the tile next to it, over forest with three overlapping flightlines, may hold 90 million and take eight times as long through SMRF and HAG. Parallel pools that hand out tiles in file-name order routinely end a batch with a long tail: the big tiles happen to come last, and wall time is set by the slowest one rather than by the average.

The fix is decades old — longest-processing-time-first scheduling — and costs one header read per tile. On typical LiDAR batches it cuts wall time by 20 to 40 percent without any change to the pipeline.

<svg viewBox="0 0 740 230" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Gantt chart of four workers with file-order versus largest-first scheduling" style="width:100%;max-width:740px;display:block;margin:1.6rem auto">
  <title>The tail that largest-first removes</title>
  <desc>Two Gantt charts of four workers processing the same tiles. In file order, three workers finish around minute 30 while the fourth starts a huge tile late and runs until minute 52. Largest first, the two huge tiles start immediately on two workers, small tiles fill the gaps, and all four workers finish around minute 36.</desc>
  <rect x="0" y="0" width="740" height="230" fill="var(--dg-bg)" rx="10"/>
  <text x="20" y="24" font-size="11" font-weight="600" fill="var(--dg-text)">file order</text>
  <g stroke="var(--dg-line)" stroke-width="0.8">
    <rect x="60" y="34" width="120" height="14" fill="var(--dg-b-soft)"/><rect x="180" y="34" width="130" height="14" fill="var(--dg-b-soft)"/><rect x="310" y="34" width="80" height="14" fill="var(--dg-b-soft)"/>
    <rect x="60" y="52" width="160" height="14" fill="var(--dg-b-soft)"/><rect x="220" y="52" width="170" height="14" fill="var(--dg-b-soft)"/>
    <rect x="60" y="70" width="100" height="14" fill="var(--dg-b-soft)"/><rect x="160" y="70" width="220" height="14" fill="var(--dg-c-soft)"/>
    <rect x="60" y="88" width="140" height="14" fill="var(--dg-b-soft)"/><rect x="200" y="88" width="110" height="14" fill="var(--dg-b-soft)"/><rect x="310" y="88" width="370" height="14" fill="var(--dg-e-soft)"/>
  </g>
  <text x="686" y="100" font-size="10" fill="var(--dg-e)">52 min</text>
  <text x="20" y="134" font-size="11" font-weight="600" fill="var(--dg-text)">largest first</text>
  <g stroke="var(--dg-line)" stroke-width="0.8">
    <rect x="60" y="144" width="370" height="14" fill="var(--dg-e-soft)"/><rect x="430" y="144" width="60" height="14" fill="var(--dg-b-soft)"/>
    <rect x="60" y="162" width="220" height="14" fill="var(--dg-c-soft)"/><rect x="280" y="162" width="130" height="14" fill="var(--dg-b-soft)"/><rect x="410" y="162" width="80" height="14" fill="var(--dg-b-soft)"/>
    <rect x="60" y="180" width="170" height="14" fill="var(--dg-b-soft)"/><rect x="230" y="180" width="160" height="14" fill="var(--dg-b-soft)"/><rect x="390" y="180" width="100" height="14" fill="var(--dg-b-soft)"/>
    <rect x="60" y="198" width="140" height="14" fill="var(--dg-b-soft)"/><rect x="200" y="198" width="120" height="14" fill="var(--dg-b-soft)"/><rect x="320" y="198" width="110" height="14" fill="var(--dg-b-soft)"/><rect x="430" y="198" width="56" height="14" fill="var(--dg-b-soft)"/>
  </g>
  <text x="498" y="210" font-size="10" fill="var(--dg-d)">36 min</text>
</svg>

## Prerequisites and Assumptions

- A batch of tiles processed independently with a process pool, as in [parallel tile processing with ProcessPoolExecutor](https://www.pythonlidar.com/pdal-pipeline-architecture-execution/parallel-execution/parallel-tile-processing-with-processpoolexecutor/).
- Run time roughly proportional to point count, which holds for most PDAL pipelines. If one stage is dominated by area instead (fine-resolution `writers.gdal`), use a blend of count and area.
- Python 3.10+; `laspy` or PDAL to read header counts quickly.

## Step-by-Step Implementation

### Step 1 — Read point counts from headers

`laspy.open(path).header.point_count` reads only the header — milliseconds per file even over a network mount.

### Step 2 — Sort largest first

Order tiles by descending point count. That is the entire algorithm.

### Step 3 — Submit one tile per task

Use `executor.submit` per tile, or `map` with `chunksize=1`. Larger chunk sizes bundle tiles into fixed groups and undo the balancing.

### Step 4 — Cap concurrent big tiles by memory

If the three largest tiles cannot run simultaneously, run them in a smaller dedicated pool first, or use a semaphore keyed on estimated memory.

### Step 5 — Collect as they complete

`as_completed` yields futures as they finish, so progress reporting and error handling do not wait for the slowest tile.

## Complete Working Example

```python
"""Largest-first scheduling of PDAL tiles with a memory-aware cap on big tiles."""
from __future__ import annotations

import json
import os
from concurrent.futures import ProcessPoolExecutor, as_completed
from pathlib import Path

import laspy

WORKERS = int(os.environ.get("WORKERS", os.cpu_count() or 8))
MEM_GB = float(os.environ.get("MEM_GB", 64))
BYTES_PER_POINT_PEAK = 180        # measured peak bytes per point for this pipeline


def count(path: Path) -> int:
    with laspy.open(path) as f:
        return f.header.point_count


def process(tile: str) -> tuple[str, int]:
    os.environ["OMP_NUM_THREADS"] = "1"
    import pdal
    spec = {"pipeline": [
        tile,
        {"type": "filters.range", "limits": "Classification![7:7],Classification![18:18]"},
        {"type": "filters.smrf", "slope": 0.15, "window": 18, "threshold": 0.5},
        {"type": "filters.hag_nn", "count": 2},
        {"type": "writers.las", "filename": f"out/{Path(tile).stem}_hag.laz",
         "extra_dims": "HeightAboveGround=float", "minor_version": 4, "dataformat_id": 6},
    ]}
    return tile, pdal.Pipeline(json.dumps(spec)).execute()


def schedule(tiles: list[Path]) -> None:
    sized = sorted(((count(t), t) for t in tiles), reverse=True)
    peak_gb = [n * BYTES_PER_POINT_PEAK / 1e9 for n, _ in sized]
    big = [t for (n, t), gb in zip(sized, peak_gb) if gb > MEM_GB / WORKERS]
    small = [t for (n, t), gb in zip(sized, peak_gb) if gb <= MEM_GB / WORKERS]
    big_workers = max(1, int(MEM_GB // max(peak_gb[0], 1e-9)))
    print(f"{len(big)} big tiles on {big_workers} workers, {len(small)} on {WORKERS}")

    Path("out").mkdir(exist_ok=True)
    for group, n_workers in ((big, big_workers), (small, WORKERS)):
        if not group:
            continue
        with ProcessPoolExecutor(n_workers) as pool:
            futures = {pool.submit(process, str(t)): t for t in group}   # largest first
            for fut in as_completed(futures):
                try:
                    tile, n = fut.result()
                    print(f"done {Path(tile).name}: {n:,} points")
                except Exception as exc:                                 # noqa: BLE001
                    print(f"FAILED {futures[fut].name}: {exc}")


if __name__ == "__main__":
    schedule(sorted(Path("tiles").glob("*.laz")))
```

Big tiles run first on as many workers as memory allows; the small ones then fill every core. Within each group, submission order is largest first, and the pool hands the next tile to whichever worker frees up.

<svg viewBox="0 0 740 200" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Point count per tile sorted descending, split into big and small groups" style="width:100%;max-width:740px;display:block;margin:1.6rem auto">
  <title>Sorting reveals the split</title>
  <desc>A descending bar chart of point counts for 20 tiles. The first three bars, between 70 and 90 million points, exceed the per-worker memory threshold drawn as a dashed line and form the big group. The remaining 17 bars, between 12 and 40 million, form the small group.</desc>
  <rect x="0" y="0" width="740" height="200" fill="var(--dg-bg)" rx="10"/>
  <line x1="40" y1="170" x2="700" y2="170" stroke="var(--dg-line)" stroke-width="1.3"/>
  <g fill="var(--dg-e)"><rect x="50" y="26" width="24" height="144"/><rect x="82" y="36" width="24" height="134"/><rect x="114" y="54" width="24" height="116"/></g>
  <g fill="var(--dg-b)"><rect x="146" y="106" width="24" height="64"/><rect x="178" y="110" width="24" height="60"/><rect x="210" y="114" width="24" height="56"/><rect x="242" y="118" width="24" height="52"/><rect x="274" y="120" width="24" height="50"/><rect x="306" y="124" width="24" height="46"/><rect x="338" y="126" width="24" height="44"/><rect x="370" y="130" width="24" height="40"/><rect x="402" y="132" width="24" height="38"/><rect x="434" y="136" width="24" height="34"/><rect x="466" y="138" width="24" height="32"/><rect x="498" y="140" width="24" height="30"/><rect x="530" y="144" width="24" height="26"/><rect x="562" y="146" width="24" height="24"/><rect x="594" y="148" width="24" height="22"/><rect x="626" y="150" width="24" height="20"/><rect x="658" y="152" width="24" height="18"/></g>
  <line x1="40" y1="90" x2="700" y2="90" stroke="var(--dg-line)" stroke-width="1.3" stroke-dasharray="6 4"/>
  <text x="696" y="82" text-anchor="end" font-size="10.5" fill="var(--dg-muted)">memory per worker ÷ peak bytes per point</text>
  <text x="94" y="190" text-anchor="middle" font-size="10.5" fill="var(--dg-e)">big group</text>
  <text x="414" y="190" text-anchor="middle" font-size="10.5" fill="var(--dg-b)">small group, all cores</text>
</svg>

## Key Parameter Table

| Setting | Value | Why |
|---|---|---|
| sort key | point count, descending | Proxy for run time; free from headers |
| `chunksize` / tasks | 1 tile per task | Keeps the scheduler able to balance |
| `BYTES_PER_POINT_PEAK` | measured, e.g. 180 | Converts counts to memory for the big-tile cap |
| big-tile workers | memory ÷ largest peak | Prevents several giants running at once |
| result collection | `as_completed` | Progress and failures reported immediately |

## Verification

- **Worker idle time.** Log start and end times per tile and plot a Gantt chart like the one above. The last quarter of the batch should still show all workers busy.
- **Wall time against the lower bound.** The best possible wall time is max(total work ÷ workers, longest single tile). Largest-first typically lands within 10–15 percent of it.
- **No OOM kills.** The kernel log (`dmesg`) should be clean; if not, lower the big-tile worker count.

## Gotchas and Edge Cases

**Point count is only a proxy.** Pipelines dominated by raster writing at fine resolution scale with area rather than points. Measure a few tiles and fit time ≈ a × points + b × area if needed.

**Network storage skews early timings.** The first tiles read from cold object storage may be slower than later ones. Balancing by count still helps; just do not calibrate from the first few timings.

**Very large tiles may need a different plan.** A tile that alone exceeds a worker's memory will never succeed in the pool. Split it with [filters.splitter or chipper](https://www.pythonlidar.com/batch-automation-cloud-integration/tile-indexing-and-merging/retiling-flightline-files-into-a-grid/) or run it in streaming mode instead.

<svg viewBox="0 0 740 170" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Wall time relative to the theoretical lower bound for two scheduling orders" style="width:100%;max-width:740px;display:block;margin:1.6rem auto">
  <title>How close to the best possible</title>
  <desc>Two bars against a dashed lower-bound line at 33 minutes. File-order scheduling finishes at 52 minutes, 58 percent above the bound. Largest-first finishes at 36 minutes, 9 percent above it.</desc>
  <rect x="0" y="0" width="740" height="170" fill="var(--dg-bg)" rx="10"/>
  <text x="170" y="56" text-anchor="end" font-size="11" fill="var(--dg-text)">file order</text>
  <rect x="180" y="40" width="468" height="24" fill="var(--dg-e-soft)" stroke="var(--dg-e)" stroke-width="1.2"/>
  <text x="656" y="57" font-size="10.5" fill="var(--dg-muted)">52 min</text>
  <text x="170" y="106" text-anchor="end" font-size="11" fill="var(--dg-text)">largest first</text>
  <rect x="180" y="90" width="324" height="24" fill="var(--dg-d-soft)" stroke="var(--dg-d)" stroke-width="1.2"/>
  <text x="512" y="107" font-size="10.5" fill="var(--dg-muted)">36 min</text>
  <line x1="477" y1="24" x2="477" y2="130" stroke="var(--dg-line)" stroke-width="1.4" stroke-dasharray="5 4"/>
  <text x="477" y="150" text-anchor="middle" font-size="10.5" fill="var(--dg-muted)">lower bound 33 min</text>
</svg>

## Frequently Asked Questions

**Why process the largest tiles first?**

Because a large tile started late becomes a tail that runs alone after every other worker has finished. Starting the largest tiles first lets the many small tiles fill the remaining gaps, so all workers finish at about the same time.

**Does Pool.map balance work automatically?**

Only if each task is one tile. With a larger chunksize, tiles are bundled into fixed groups in submission order, and a group containing a large tile becomes the tail. Use a chunksize of one or submit tiles individually.

**How do I get point counts without reading the points?**

Read the LAS header, which stores the count. laspy's open function or pdal info with the summary flag return it in milliseconds per file.

**What if the biggest tiles do not fit in memory together?**

Run them first in a smaller pool sized so their combined peak memory fits, then process the remaining tiles with every worker.

## Related

- [Parallel Execution in PDAL](https://www.pythonlidar.com/pdal-pipeline-architecture-execution/parallel-execution/) — the parallelism model
- [Threads vs Processes for PDAL Workloads](https://www.pythonlidar.com/pdal-pipeline-architecture-execution/parallel-execution/threads-vs-processes-for-pdal-workloads/) — choosing the pool type
- [Parallel Tile Processing with ProcessPoolExecutor](https://www.pythonlidar.com/pdal-pipeline-architecture-execution/parallel-execution/parallel-tile-processing-with-processpoolexecutor/) — the base pattern extended here
- [Estimating PDAL Memory from Point Layout](https://www.pythonlidar.com/pdal-pipeline-architecture-execution/memory-management/estimating-pdal-memory-from-point-layout/) — the bytes-per-point figure
- [Tracking Tile Progress and Failures in Dask](https://www.pythonlidar.com/batch-automation-cloud-integration/dask-distributed-processing/tracking-tile-progress-and-failures-in-dask/) — the same ideas across many machines
