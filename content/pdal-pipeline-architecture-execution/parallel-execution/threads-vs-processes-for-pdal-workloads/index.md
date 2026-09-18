---
title: "Threads vs Processes for PDAL Workloads"
description: "Decide between thread pools, process pools and PDAL's internal OpenMP threads for LiDAR batch work: what the GIL does and does not block, why process isolation wins for most tile jobs, and how to benchmark the choice on your own hardware."
slug: "threads-vs-processes-for-pdal-workloads"
type: "howto"
breadcrumb: "Threads vs Processes"
datePublished: "2026-09-18"
dateModified: "2026-09-18"
---

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Article",
      "headline": "Threads vs Processes for PDAL Workloads",
      "description": "Decide between thread pools, process pools and PDAL's internal OpenMP threads for LiDAR batch work: what the GIL does and does not block, why process isolation wins for most tile jobs, and how to benchmark the choice on your own hardware.",
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
          "name": "Threads vs Processes",
          "item": "https://www.pythonlidar.com/pdal-pipeline-architecture-execution/parallel-execution/threads-vs-processes-for-pdal-workloads/"
        }
      ]
    },
    {
      "@type": "HowTo",
      "name": "Choose between threads and processes for parallel PDAL workloads",
      "step": [
        {
          "@type": "HowToStep",
          "name": "Fix the per-process thread count",
          "text": "Set OMP_NUM_THREADS=1 (and GDAL_NUM_THREADS=1 if writers compress with multiple threads) in the environment of every worker. Otherwise each process starts one OpenMP thread per core and N processes oversubscribe the machine N-fold."
        },
        {
          "@type": "HowToStep",
          "name": "Write the per-tile function at module level",
          "text": "Process pools pickle the function and its arguments. Define the worker at module top level, take a path and return a small result \u2014 never the point arrays."
        },
        {
          "@type": "HowToStep",
          "name": "Benchmark three configurations",
          "text": "Run the same set of tiles with a thread pool, a process pool, and a single process with OpenMP threads enabled, keeping total cores constant."
        },
        {
          "@type": "HowToStep",
          "name": "Read the results together with memory",
          "text": "Wall time alone is not the decision; peak memory per configuration decides how many workers fit."
        },
        {
          "@type": "HowToStep",
          "name": "Choose and document",
          "text": "Record the choice, the worker count and the thread settings in the batch configuration so the next person does not re-derive them."
        }
      ]
    },
    {
      "@type": "FAQPage",
      "mainEntity": [
        {
          "@type": "Question",
          "name": "Does the GIL stop PDAL from running in parallel threads?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "PDAL's work runs in C++, so the GIL matters only for whether other Python threads can run during it, which depends on the bindings. Regardless, threads share one process's memory and library state, so processes are the more robust choice for tile-level parallelism."
          }
        },
        {
          "@type": "Question",
          "name": "How many worker processes should I use?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "The smaller of the core count and the number of tiles that fit in memory at once. Memory is usually the tighter limit for PDAL; measure peak memory for your largest tile and divide available RAM by it."
          }
        },
        {
          "@type": "Question",
          "name": "Should I set OMP_NUM_THREADS to 1?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Yes, when running several PDAL processes at once. Each process would otherwise start one OpenMP thread per core, oversubscribing the machine. Raise it only when running one large tile at a time."
          }
        },
        {
          "@type": "Question",
          "name": "When are threads the right choice?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "For I/O-bound work around PDAL: downloading inputs, uploading outputs, polling APIs. Those tasks spend their time waiting, and threads let many waits overlap cheaply."
          }
        }
      ]
    }
  ]
}
</script>

**TL;DR:** Use a `ProcessPoolExecutor` (or separate `pdal pipeline` subprocesses) for tile-level parallelism — one tile per worker, `OMP_NUM_THREADS=1` in each — because processes isolate memory, crashes and global library state. Reach for threads only for I/O-bound orchestration such as uploads, and measure: the right answer depends on your stages, your storage and your core count.

## Context and Motivation

This guide is part of [Parallel Execution in PDAL](https://www.pythonlidar.com/pdal-pipeline-architecture-execution/parallel-execution/). When a batch of tiles is too slow on one core, Python offers three levers: threads within one process, a pool of processes, and the threads that some PDAL stages start themselves through OpenMP. They interact, and choosing badly either wastes cores or oversubscribes them until the machine thrashes.

The usual intuition from pure-Python work — "threads are useless because of the GIL" — is only half true for PDAL. The heavy work happens in C++, and whether other Python threads can run during it depends on whether the bindings release the GIL during execution, which has varied between binding versions. More importantly, even when threads can run in parallel, they share one process: one tile's out-of-memory failure kills every tile in flight, and global state in GDAL and PROJ is shared. Processes avoid both problems at a modest start-up cost.

<svg viewBox="0 0 740 220" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Thread pool and process pool isolation compared" style="width:100%;max-width:740px;display:block;margin:1.6rem auto">
  <title>Shared fate versus isolation</title>
  <desc>Left: one process holding four threads, each processing a tile, all sharing one address space; a single out-of-memory event on tile 3 kills the process and all four tiles. Right: four processes, each with one tile and its own memory; an out-of-memory failure on tile 3 kills only that worker, and the pool restarts it or records the failure.</desc>
  <rect x="0" y="0" width="740" height="220" fill="var(--dg-bg)" rx="10"/>
  <text x="185" y="26" text-anchor="middle" font-size="11.5" font-weight="600" fill="var(--dg-text)">thread pool: one process</text>
  <text x="555" y="26" text-anchor="middle" font-size="11.5" font-weight="600" fill="var(--dg-text)">process pool: four processes</text>
  <rect x="30" y="40" width="310" height="150" rx="10" fill="var(--dg-e-soft)" stroke="var(--dg-e)" stroke-width="1.4"/>
  <g font-size="10.5" fill="var(--dg-text)">
    <rect x="50" y="60" width="120" height="30" rx="6" fill="var(--dg-surface)" stroke="var(--dg-line)"/><text text-anchor="middle" x="110" y="79">tile 1</text>
    <rect x="200" y="60" width="120" height="30" rx="6" fill="var(--dg-surface)" stroke="var(--dg-line)"/><text text-anchor="middle" x="260" y="79">tile 2</text>
    <rect x="50" y="110" width="120" height="30" rx="6" fill="var(--dg-surface)" stroke="var(--dg-e)"/><text text-anchor="middle" x="110" y="129">tile 3: OOM</text>
    <rect x="200" y="110" width="120" height="30" rx="6" fill="var(--dg-surface)" stroke="var(--dg-line)"/><text text-anchor="middle" x="260" y="129">tile 4</text>
  </g>
  <text x="185" y="174" text-anchor="middle" font-size="10.5" fill="var(--dg-e)">process killed: all four tiles lost</text>
  <g font-size="10.5" fill="var(--dg-text)">
    <rect x="400" y="50" width="140" height="56" rx="8" fill="var(--dg-d-soft)" stroke="var(--dg-d)"/><text text-anchor="middle" x="470" y="82">tile 1</text>
    <rect x="570" y="50" width="140" height="56" rx="8" fill="var(--dg-d-soft)" stroke="var(--dg-d)"/><text text-anchor="middle" x="640" y="82">tile 2</text>
    <rect x="400" y="120" width="140" height="56" rx="8" fill="var(--dg-e-soft)" stroke="var(--dg-e)"/><text text-anchor="middle" x="470" y="152">tile 3: OOM</text>
    <rect x="570" y="120" width="140" height="56" rx="8" fill="var(--dg-d-soft)" stroke="var(--dg-d)"/><text text-anchor="middle" x="640" y="152">tile 4</text>
  </g>
  <text x="555" y="204" text-anchor="middle" font-size="10.5" fill="var(--dg-d)">one worker lost, three tiles finish</text>
</svg>

## Prerequisites and Assumptions

- PDAL 2.x with Python bindings, on a multi-core Linux machine or VM.
- A batch of independent tiles — the usual case for LiDAR production.
- Enough memory for N simultaneous tiles, where N is the number of workers; see [estimating PDAL memory from point layout](https://www.pythonlidar.com/pdal-pipeline-architecture-execution/memory-management/estimating-pdal-memory-from-point-layout/).

## Step-by-Step Implementation

### Step 1 — Fix the per-process thread count

Set `OMP_NUM_THREADS=1` (and `GDAL_NUM_THREADS=1` if writers compress with multiple threads) in the environment of every worker. Otherwise each process starts one OpenMP thread per core and N processes oversubscribe the machine N-fold.

### Step 2 — Write the per-tile function at module level

Process pools pickle the function and its arguments. Define the worker at module top level, take a path and return a small result — never the point arrays.

### Step 3 — Benchmark three configurations

Run the same set of tiles with a thread pool, a process pool, and a single process with OpenMP threads enabled, keeping total cores constant.

### Step 4 — Read the results together with memory

Wall time alone is not the decision; peak memory per configuration decides how many workers fit.

### Step 5 — Choose and document

Record the choice, the worker count and the thread settings in the batch configuration so the next person does not re-derive them.

## Complete Working Example

```python
"""Benchmark thread pool, process pool and OpenMP-only execution for PDAL tiles."""
from __future__ import annotations

import json
import os
import time
from concurrent.futures import ProcessPoolExecutor, ThreadPoolExecutor
from pathlib import Path

TILES = sorted(Path("tiles").glob("*.laz"))[:16]
CORES = os.cpu_count() or 8


def pipeline_for(tile: Path) -> str:
    return json.dumps({"pipeline": [
        str(tile),
        {"type": "filters.range", "limits": "Classification![7:7],Classification![18:18]"},
        {"type": "filters.smrf", "slope": 0.15, "window": 18, "threshold": 0.5},
        {"type": "filters.range", "limits": "Classification[2:2]"},
        {"type": "writers.gdal", "filename": f"out/{tile.stem}_dtm.tif", "resolution": 1.0,
         "output_type": "idw", "data_type": "float32"},
    ]})


def run_tile(tile: str) -> int:
    import pdal                      # import inside the worker: fresh library state per process
    return pdal.Pipeline(pipeline_for(Path(tile))).execute()


def init_single_thread() -> None:
    os.environ["OMP_NUM_THREADS"] = "1"
    os.environ["GDAL_NUM_THREADS"] = "1"


def bench(name: str, fn) -> None:
    t0 = time.perf_counter()
    fn()
    print(f"{name:<28} {time.perf_counter() - t0:7.1f} s")


if __name__ == "__main__":
    Path("out").mkdir(exist_ok=True)
    tiles = [str(t) for t in TILES]

    os.environ["OMP_NUM_THREADS"] = "1"
    bench(f"threads x{CORES}", lambda: list(ThreadPoolExecutor(CORES).map(run_tile, tiles)))
    bench(f"processes x{CORES}", lambda: list(
        ProcessPoolExecutor(CORES, initializer=init_single_thread).map(run_tile, tiles)))

    os.environ["OMP_NUM_THREADS"] = str(CORES)
    bench(f"serial, OMP x{CORES}", lambda: [run_tile(t) for t in tiles])
```

Illustrative results for 16 tiles of about 20 million points on a 16-core worker:

```text
threads x16                    412.6 s
processes x16                  188.3 s
serial, OMP x16                905.9 s
```

The ordering, not the numbers, is the lesson: on this workload processes win comfortably, and relying on in-stage OpenMP alone leaves most cores idle because only some stages parallelize internally.

<svg viewBox="0 0 740 200" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Wall time for three parallelism strategies on the same tiles" style="width:100%;max-width:740px;display:block;margin:1.6rem auto">
  <title>The same sixteen tiles, three ways</title>
  <desc>Horizontal bars of wall time. A process pool of 16 finishes in 188 seconds. A thread pool of 16 takes 413 seconds. Serial execution with 16 OpenMP threads takes 906 seconds, because only parts of the pipeline use OpenMP.</desc>
  <rect x="0" y="0" width="740" height="200" fill="var(--dg-bg)" rx="10"/>
  <text x="190" y="50" text-anchor="end" font-size="11" fill="var(--dg-text)">process pool ×16</text>
  <rect x="200" y="34" width="104" height="24" fill="var(--dg-d)"/>
  <text x="312" y="51" font-size="10.5" fill="var(--dg-muted)">188 s</text>
  <text x="190" y="100" text-anchor="end" font-size="11" fill="var(--dg-text)">thread pool ×16</text>
  <rect x="200" y="84" width="228" height="24" fill="var(--dg-c)"/>
  <text x="436" y="101" font-size="10.5" fill="var(--dg-muted)">413 s</text>
  <text x="190" y="150" text-anchor="end" font-size="11" fill="var(--dg-text)">serial, OpenMP ×16</text>
  <rect x="200" y="134" width="500" height="24" fill="var(--dg-e)"/>
  <text x="690" y="178" text-anchor="end" font-size="10.5" fill="var(--dg-muted)">906 s</text>
  <text x="200" y="22" font-size="10.5" fill="var(--dg-muted)">illustrative: 16 tiles × 20 M points, SMRF + DTM, 16 cores</text>
</svg>

## Key Parameter Table

| Setting | Recommended | Why |
|---|---|---|
| Pool type for tiles | `ProcessPoolExecutor` | Memory and failure isolation, independent library state |
| Workers | min(cores, memory ÷ peak per tile) | Memory is usually the binding limit |
| `OMP_NUM_THREADS` | 1 per process | Avoids N × cores oversubscription |
| `GDAL_NUM_THREADS` | 1 per process | Same, for multithreaded compression in writers |
| `max_tasks_per_child` | 10–50 (Python 3.11+) | Recycles workers to release fragmented memory |
| Thread pools | I/O only | Uploads, downloads, API calls around PDAL work |

## Verification

- **CPU utilization.** `htop` during a process-pool run should show all cores near 100 percent and load average near the core count. A load average far above it means oversubscription.
- **Output equality.** Rasters from the three configurations should be byte-identical or identical after reading; parallelism must not change results.
- **Failure isolation.** Deliberately feed one corrupt tile; the process pool should report one failure and finish the rest.

## Gotchas and Edge Cases

**Oversubscription is silent.** Sixteen processes each starting sixteen OpenMP threads run 256 threads on 16 cores. Everything still works, just slower than serial in some stages, and nothing in the logs says why.

**Fork and library state.** On Linux, `ProcessPoolExecutor` forks by default, and a parent that has already initialized GDAL or PDAL passes that state to children. Import `pdal` inside the worker function, or use the `spawn` start method, to give each worker a clean start.

**Returning arrays is expensive.** Results cross process boundaries by pickling. Return counts, paths and small summaries; write point data to files from inside the worker.

<svg viewBox="0 0 740 170" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Threads per core with and without OMP_NUM_THREADS set" style="width:100%;max-width:740px;display:block;margin:1.6rem auto">
  <title>Sixteen processes times sixteen threads</title>
  <desc>Two bars comparing runnable threads against 16 cores. With OMP_NUM_THREADS unset, 16 processes each start 16 OpenMP threads, totalling 256 threads contending for 16 cores. With OMP_NUM_THREADS set to 1, there are 16 threads for 16 cores.</desc>
  <rect x="0" y="0" width="740" height="170" fill="var(--dg-bg)" rx="10"/>
  <text x="200" y="52" text-anchor="end" font-size="11" fill="var(--dg-text)">OMP unset</text>
  <rect x="210" y="36" width="480" height="24" fill="var(--dg-e-soft)" stroke="var(--dg-e)" stroke-width="1.2"/>
  <text x="450" y="53" text-anchor="middle" font-size="10.5" fill="var(--dg-text)">256 threads</text>
  <text x="200" y="102" text-anchor="end" font-size="11" fill="var(--dg-text)">OMP_NUM_THREADS=1</text>
  <rect x="210" y="86" width="30" height="24" fill="var(--dg-d-soft)" stroke="var(--dg-d)" stroke-width="1.2"/>
  <text x="248" y="103" font-size="10.5" fill="var(--dg-text)">16 threads</text>
  <line x1="240" y1="24" x2="240" y2="130" stroke="var(--dg-line)" stroke-width="1.4" stroke-dasharray="5 4"/>
  <text x="246" y="146" font-size="10.5" fill="var(--dg-muted)">16 cores</text>
</svg>

**Threads for orchestration are fine.** A thread pool that uploads finished rasters to S3 while the process pool computes the next tiles is a good use of threads — the work is I/O-bound and releases the GIL.

## Frequently Asked Questions

**Does the GIL stop PDAL from running in parallel threads?**

PDAL's work runs in C++, so the GIL matters only for whether other Python threads can run during it, which depends on the bindings. Regardless, threads share one process's memory and library state, so processes are the more robust choice for tile-level parallelism.

**How many worker processes should I use?**

The smaller of the core count and the number of tiles that fit in memory at once. Memory is usually the tighter limit for PDAL; measure peak memory for your largest tile and divide available RAM by it.

**Should I set OMP_NUM_THREADS to 1?**

Yes, when running several PDAL processes at once. Each process would otherwise start one OpenMP thread per core, oversubscribing the machine. Raise it only when running one large tile at a time.

**When are threads the right choice?**

For I/O-bound work around PDAL: downloading inputs, uploading outputs, polling APIs. Those tasks spend their time waiting, and threads let many waits overlap cheaply.

## Related

- [Parallel Execution in PDAL](https://www.pythonlidar.com/pdal-pipeline-architecture-execution/parallel-execution/) — file-level versus stage-level parallelism
- [Parallel Tile Processing with ProcessPoolExecutor](https://www.pythonlidar.com/pdal-pipeline-architecture-execution/parallel-execution/parallel-tile-processing-with-processpoolexecutor/) — the production pattern
- [Load Balancing Uneven LiDAR Tiles](https://www.pythonlidar.com/pdal-pipeline-architecture-execution/parallel-execution/load-balancing-uneven-lidar-tiles/) — keeping every worker busy
- [Optimizing PDAL for Multi-Core Processing](https://www.pythonlidar.com/pdal-pipeline-architecture-execution/parallel-execution/optimizing-pdal-for-multi-core-processing/) — OpenMP and chunk tuning
- [Dask vs ProcessPoolExecutor for PDAL](https://www.pythonlidar.com/batch-automation-cloud-integration/dask-distributed-processing/dask-vs-processpoolexecutor-for-pdal/) — when to go beyond one machine
