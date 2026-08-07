---
title: "Parallel Tile Processing with ProcessPoolExecutor"
description: "The file-level parallelism pattern for PDAL: one process per tile, threads pinned to one, a pool sized to physical cores, and small result records instead of point arrays."
slug: "parallel-tile-processing-with-processpoolexecutor"
type: "howto"
breadcrumb: "Parallel Tiles with ProcessPoolExecutor"
datePublished: "2026-08-07"
dateModified: "2026-08-07"
---

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Article",
      "headline": "Parallel Tile Processing with ProcessPoolExecutor",
      "description": "The file-level parallelism pattern for PDAL: one process per tile, threads pinned to one, a pool sized to physical cores, and small result records instead of point arrays.",
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
          "name": "Parallel Tiles with ProcessPoolExecutor",
          "item": "https://www.pythonlidar.com/pdal-pipeline-architecture-execution/parallel-execution/parallel-tile-processing-with-processpoolexecutor/"
        }
      ]
    },
    {
      "@type": "HowTo",
      "name": "Process a LiDAR tile manifest in parallel with ProcessPoolExecutor",
      "step": [
        {
          "@type": "HowToStep",
          "name": "Pin OpenMP threads before importing PDAL",
          "text": "Set OMP_NUM_THREADS to 1 in the environment before the pdal import so each worker uses one core."
        },
        {
          "@type": "HowToStep",
          "name": "Write the worker as a function of a path",
          "text": "Take an input path and return a small dictionary describing the result, with no shared state."
        },
        {
          "@type": "HowToStep",
          "name": "Size the pool to physical cores",
          "text": "Start at the physical core count rather than the logical count reported by os.cpu_count."
        },
        {
          "@type": "HowToStep",
          "name": "Consume futures as they complete",
          "text": "Use as_completed so progress and failures are recorded during the run rather than at the end."
        },
        {
          "@type": "HowToStep",
          "name": "Record failures instead of raising",
          "text": "Catch per-tile exceptions, log them, and report the list at the end so one bad tile cannot end the run."
        }
      ]
    },
    {
      "@type": "FAQPage",
      "mainEntity": [
        {
          "@type": "Question",
          "name": "Why processes rather than threads?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Isolation. Each tile has its own memory peak and its own failure mode, and a process boundary contains both. PDAL stages also use OpenMP internally, so processes with threads pinned to one give predictable core usage where threads inside one process would fight over the same cores."
          }
        },
        {
          "@type": "Question",
          "name": "What should the worker return?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "A small dictionary: tile name, point count, elapsed time, output path. Returning pipeline.arrays pickles the entire point cloud back to the parent for every tile, which recreates exactly the whole-campaign memory footprint the design exists to avoid."
          }
        },
        {
          "@type": "Question",
          "name": "How many workers is too many?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "When the speedup stops improving, which is usually at the physical core count and sometimes earlier if the disk saturates first. Multiply the per-tile memory peak by the worker count and check it against the machine before raising the number."
          }
        },
        {
          "@type": "Question",
          "name": "Why set OMP_NUM_THREADS before importing pdal?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "OpenMP reads its configuration when the library loads. Setting the variable after the import has no effect, so each worker claims every core and eight workers on an eight-core machine ask for sixty-four threads."
          }
        }
      ]
    }
  ]
}
</script>

**TL;DR:** One process per tile, `OMP_NUM_THREADS=1` in every worker, a pool sized to the physical cores, and results returned as small dictionaries rather than point arrays — that combination scales close to linearly to the core count and then flattens as the disk saturates.

## Context and Motivation

This guide is part of [Parallel Execution in PDAL](https://www.pythonlidar.com/pdal-pipeline-architecture-execution/parallel-execution/), which explains the two axes of parallelism available. This page is the concrete pattern for the axis that scales best in practice: file-level parallelism with Python's `ProcessPoolExecutor`.

The reason processes beat threads here has nothing to do with the GIL and everything to do with isolation. Each tile is an independent unit of work with its own memory peak, its own failure mode and its own output. A worker that dies on a corrupt tile takes one tile with it. A worker that needs 1.5 GB does not affect its siblings' allocation. And because PDAL's own stages already use OpenMP internally, giving each process a single thread avoids the oversubscription that makes a sixty-four-thread request on an eight-core machine slower than doing nothing at all.

<svg viewBox="0 0 720 262" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="A manifest of tiles fanned out to a pool of worker processes and collected as small result records" style="width:100%;max-width:720px;display:block;margin:1.6rem auto">
  <title>Fan out tiles, collect records</title>
  <desc>A tile manifest feeds a pool of four worker processes. Each worker runs the whole pipeline for one tile and returns a small dictionary — tile identifier, point count, elapsed seconds, output path — rather than the point data itself. The parent collects those records into a run summary, so the memory held by the parent never grows with the number of tiles.</desc>
  <defs><marker id="pp-arw" markerWidth="9" markerHeight="7" refX="9" refY="3.5" orient="auto"><path d="M0,0 L0,7 L9,3.5 z" fill="var(--dg-line)"/></marker></defs>
  <rect x="0" y="0" width="720" height="262" fill="var(--dg-bg)" rx="10"/>
  <rect x="20" y="88" width="150" height="76" rx="8" fill="var(--dg-b-soft)" stroke="var(--dg-b)" stroke-width="1.4"/>
  <text x="95" y="118" text-anchor="middle" font-size="11.5" font-weight="600" fill="var(--dg-text)">tile manifest</text>
  <text x="95" y="138" text-anchor="middle" font-size="10.5" fill="var(--dg-muted)">1,240 paths</text>
  <text x="95" y="154" text-anchor="middle" font-size="10.5" fill="var(--dg-muted)">read once, in order</text>
  <rect x="250" y="42" width="200" height="42" rx="7" fill="var(--dg-a-soft)" stroke="var(--dg-a)" stroke-width="1.3"/>
  <text x="350" y="68" text-anchor="middle" font-size="11" fill="var(--dg-text)">worker 1 · OMP=1</text>
  <rect x="250" y="94" width="200" height="42" rx="7" fill="var(--dg-a-soft)" stroke="var(--dg-a)" stroke-width="1.3"/>
  <text x="350" y="120" text-anchor="middle" font-size="11" fill="var(--dg-text)">worker 2 · OMP=1</text>
  <rect x="250" y="146" width="200" height="42" rx="7" fill="var(--dg-a-soft)" stroke="var(--dg-a)" stroke-width="1.3"/>
  <text x="350" y="172" text-anchor="middle" font-size="11" fill="var(--dg-text)">worker 3 · OMP=1</text>
  <rect x="250" y="198" width="200" height="42" rx="7" fill="var(--dg-a-soft)" stroke="var(--dg-a)" stroke-width="1.3"/>
  <text x="350" y="224" text-anchor="middle" font-size="11" fill="var(--dg-text)">worker 4 · OMP=1</text>
  <line x1="170" y1="112" x2="244" y2="66" stroke="var(--dg-line)" stroke-width="1.4" marker-end="url(#pp-arw)"/>
  <line x1="170" y1="122" x2="244" y2="115" stroke="var(--dg-line)" stroke-width="1.4" marker-end="url(#pp-arw)"/>
  <line x1="170" y1="132" x2="244" y2="167" stroke="var(--dg-line)" stroke-width="1.4" marker-end="url(#pp-arw)"/>
  <line x1="170" y1="142" x2="244" y2="219" stroke="var(--dg-line)" stroke-width="1.4" marker-end="url(#pp-arw)"/>
  <rect x="530" y="88" width="170" height="76" rx="8" fill="var(--dg-d-soft)" stroke="var(--dg-d)" stroke-width="1.4"/>
  <text x="615" y="114" text-anchor="middle" font-size="11.5" font-weight="600" fill="var(--dg-text)">run summary</text>
  <text x="615" y="134" text-anchor="middle" font-size="10.5" fill="var(--dg-muted)">one small record</text>
  <text x="615" y="150" text-anchor="middle" font-size="10.5" fill="var(--dg-muted)">per tile, not points</text>
  <line x1="450" y1="66" x2="524" y2="112" stroke="var(--dg-line)" stroke-width="1.4" marker-end="url(#pp-arw)"/>
  <line x1="450" y1="115" x2="524" y2="122" stroke="var(--dg-line)" stroke-width="1.4" marker-end="url(#pp-arw)"/>
  <line x1="450" y1="167" x2="524" y2="132" stroke="var(--dg-line)" stroke-width="1.4" marker-end="url(#pp-arw)"/>
  <line x1="450" y1="219" x2="524" y2="142" stroke="var(--dg-line)" stroke-width="1.4" marker-end="url(#pp-arw)"/>
  <text x="20" y="252" font-size="10.5" fill="var(--dg-muted)">returning arrays instead of records would pickle gigabytes through the pool and undo the whole design</text>
</svg>

## Prerequisites and Assumptions

| Requirement | Detail |
|---|---|
| Python | 3.9+, `concurrent.futures` from the standard library |
| PDAL | 2.4+ with the Python bindings importable in the worker |
| A tile manifest | one line per input path, frozen before the run |
| Memory budget | workers × per-tile peak must fit; see [diagnosing OOM failures](https://www.pythonlidar.com/pdal-pipeline-architecture-execution/memory-management/diagnosing-pdal-out-of-memory-failures/) |
| Start method | `spawn` on macOS and Windows, `fork` on Linux — both work, `spawn` re-imports the module |

## Step-by-Step Implementation

### Step 1 — Pin threads before importing PDAL

OpenMP reads its environment when the library loads, so setting the variable after `import pdal` in the worker is too late.

```python
import os
os.environ.setdefault("OMP_NUM_THREADS", "1")
import pdal  # noqa: E402 — must come after the env var
```

### Step 2 — Make the worker a plain function of a path

No shared state, no globals holding pipelines, no partially-applied closures over large objects. The worker takes a path and returns a dictionary.

### Step 3 — Size the pool to physical cores

`os.cpu_count()` reports logical processors, which on a hyperthreaded machine is twice the useful number for CPU-bound geometry work. Start at physical cores and measure before going higher.

### Step 4 — Submit, then consume as futures complete

`as_completed` lets you record failures and progress as they happen rather than at the end, which matters when a run takes hours.

### Step 5 — Treat a failed tile as data, not as an exception

One corrupt tile in twelve hundred should not end the run. Catch, record, continue, and report the failures at the end.

## Complete Working Example

```python
"""Process a tile manifest with one PDAL pipeline per worker process."""
from __future__ import annotations

import os

os.environ.setdefault("OMP_NUM_THREADS", "1")

import json  # noqa: E402
import logging  # noqa: E402
import time  # noqa: E402
from concurrent.futures import ProcessPoolExecutor, as_completed  # noqa: E402
from pathlib import Path  # noqa: E402

import pdal  # noqa: E402

LOG = logging.getLogger("tilepool")


def process_tile(src: str, out_dir: str, out_srs: str = "EPSG:6318") -> dict:
    """Run the pipeline for one tile. Returns a small record, never point data."""
    src_path = Path(src)
    dst = Path(out_dir) / f"{src_path.stem}_ground.laz"
    spec = json.dumps({"pipeline": [
        {"type": "readers.las", "filename": str(src_path)},
        {"type": "filters.range", "limits": "Z[-30:5000]"},
        {"type": "filters.reprojection", "out_srs": out_srs},
        {"type": "filters.smrf", "window": 18, "slope": 0.15, "threshold": 0.5, "cell": 1.0},
        {"type": "filters.range", "limits": "Classification[2:2]"},
        {"type": "writers.las", "filename": str(dst),
         "compression": "laszip", "forward": "all"},
    ]})
    started = time.perf_counter()
    kept = pdal.Pipeline(spec).execute()
    return {
        "tile": src_path.name,
        "ground_points": kept,
        "seconds": round(time.perf_counter() - started, 2),
        "output": str(dst),
    }


def run(manifest: Path, out_dir: Path, workers: int) -> dict:
    out_dir.mkdir(parents=True, exist_ok=True)
    tiles = [line.strip() for line in manifest.read_text().splitlines() if line.strip()]
    done, failed = [], []

    with ProcessPoolExecutor(max_workers=workers) as pool:
        futures = {pool.submit(process_tile, t, str(out_dir)): t for t in tiles}
        for i, future in enumerate(as_completed(futures), start=1):
            tile = futures[future]
            try:
                record = future.result()
                done.append(record)
                LOG.info("[%d/%d] %s — %d ground points in %.1fs",
                         i, len(tiles), record["tile"], record["ground_points"],
                         record["seconds"])
            except Exception as exc:  # one bad tile must not end the run
                failed.append({"tile": tile, "error": repr(exc)})
                LOG.error("[%d/%d] %s FAILED: %r", i, len(tiles), tile, exc)

    return {"completed": len(done), "failed": failed,
            "total_seconds": round(sum(r["seconds"] for r in done), 1)}


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(message)s")
    summary = run(Path("tiles.txt"), Path("out"), workers=8)
    print(json.dumps(summary, indent=2))
```

<svg viewBox="0 0 720 252" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Four worker processes chewing through a tile manifest over time" style="width:100%;max-width:720px;display:block;margin:1.6rem auto">
  <title>What a healthy pool looks like</title>
  <desc>Four worker lanes with tile jobs drawn as blocks over time. The blocks vary in length because tiles vary in density, and each worker picks up the next tile the moment it finishes rather than waiting for its siblings. The tail at the end is one unusually dense tile finishing alone, which is why the last few percent of a run is always the slowest.</desc>
  <rect x="0" y="0" width="720" height="252" fill="var(--dg-bg)" rx="10"/>
  <text x="20" y="38" font-size="10.5" fill="var(--dg-muted)">four workers, 21 tiles, no barrier between them</text>
  <text x="60" y="70" text-anchor="end" font-size="10.5" fill="var(--dg-muted)">w1</text>
  <rect x="70" y="56" width="92" height="20" rx="3" fill="var(--dg-a-soft)" stroke="var(--dg-a)" stroke-width="1"/>
  <rect x="166" y="56" width="130" height="20" rx="3" fill="var(--dg-a-soft)" stroke="var(--dg-a)" stroke-width="1"/>
  <rect x="300" y="56" width="76" height="20" rx="3" fill="var(--dg-a-soft)" stroke="var(--dg-a)" stroke-width="1"/>
  <rect x="380" y="56" width="150" height="20" rx="3" fill="var(--dg-a-soft)" stroke="var(--dg-a)" stroke-width="1"/>
  <rect x="534" y="56" width="88" height="20" rx="3" fill="var(--dg-a-soft)" stroke="var(--dg-a)" stroke-width="1"/>
  <text x="60" y="106" text-anchor="end" font-size="10.5" fill="var(--dg-muted)">w2</text>
  <rect x="70" y="92" width="140" height="20" rx="3" fill="var(--dg-a-soft)" stroke="var(--dg-a)" stroke-width="1"/>
  <rect x="214" y="92" width="86" height="20" rx="3" fill="var(--dg-a-soft)" stroke="var(--dg-a)" stroke-width="1"/>
  <rect x="304" y="92" width="164" height="20" rx="3" fill="var(--dg-a-soft)" stroke="var(--dg-a)" stroke-width="1"/>
  <rect x="472" y="92" width="120" height="20" rx="3" fill="var(--dg-a-soft)" stroke="var(--dg-a)" stroke-width="1"/>
  <text x="60" y="142" text-anchor="end" font-size="10.5" fill="var(--dg-muted)">w3</text>
  <rect x="70" y="128" width="108" height="20" rx="3" fill="var(--dg-a-soft)" stroke="var(--dg-a)" stroke-width="1"/>
  <rect x="182" y="128" width="112" height="20" rx="3" fill="var(--dg-a-soft)" stroke="var(--dg-a)" stroke-width="1"/>
  <rect x="298" y="128" width="96" height="20" rx="3" fill="var(--dg-a-soft)" stroke="var(--dg-a)" stroke-width="1"/>
  <rect x="398" y="128" width="132" height="20" rx="3" fill="var(--dg-a-soft)" stroke="var(--dg-a)" stroke-width="1"/>
  <rect x="534" y="128" width="94" height="20" rx="3" fill="var(--dg-a-soft)" stroke="var(--dg-a)" stroke-width="1"/>
  <text x="60" y="178" text-anchor="end" font-size="10.5" fill="var(--dg-muted)">w4</text>
  <rect x="70" y="164" width="120" height="20" rx="3" fill="var(--dg-a-soft)" stroke="var(--dg-a)" stroke-width="1"/>
  <rect x="194" y="164" width="98" height="20" rx="3" fill="var(--dg-a-soft)" stroke="var(--dg-a)" stroke-width="1"/>
  <rect x="296" y="164" width="140" height="20" rx="3" fill="var(--dg-a-soft)" stroke="var(--dg-a)" stroke-width="1"/>
  <rect x="440" y="164" width="242" height="20" rx="3" fill="var(--dg-c-soft)" stroke="var(--dg-c)" stroke-width="1.3"/>
  <text x="561" y="178" text-anchor="middle" font-size="9.5" fill="var(--dg-text)">one very dense tile</text>
  <line x1="622" y1="50" x2="622" y2="192" stroke="var(--dg-line-soft)" stroke-width="1.2" stroke-dasharray="4 4"/>
  <text x="614" y="206" text-anchor="end" font-size="10" fill="var(--dg-muted)">three workers idle from here</text>
  <text x="20" y="234" font-size="10.5" fill="var(--dg-muted)">submitting the largest tiles first shortens this tail, which is worth doing when tile sizes vary by more than about 3×</text>
</svg>

## Key Parameter Table

| Setting | Value | Why |
|---|---|---|
| `OMP_NUM_THREADS` | `1` | Prevents each worker from claiming every core for itself |
| `max_workers` | physical cores | Logical cores over-subscribe on hyperthreaded machines |
| Return type | small dict | Anything larger is pickled through the pool on every tile |
| Failure policy | catch and record | One corrupt tile in a thousand should not end a twelve-hour run |
| Start method | `spawn` or `fork` | `spawn` is safer with native libraries; `fork` starts faster |

## Verification

**Every tile is accounted for.** `len(done) + len(failed)` must equal the manifest length. A shortfall means a worker died without raising, which usually means the kernel killed it for memory.

**Speedup is close to the worker count until it is not.** Time the run at one, two, four and eight workers. Near-linear scaling up to the core count, then flat, is healthy; a curve that peaks at three workers on an eight-core box means the threads were never pinned.

**Outputs are independent.** Two workers must never write the same path. Deriving the output name from the input stem, as above, guarantees it.

<svg viewBox="0 0 720 232" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Memory held by the parent process when workers return records against when they return arrays" style="width:100%;max-width:720px;display:block;margin:1.6rem auto">
  <title>What the parent ends up holding</title>
  <desc>Two traces of the parent process memory across a 1,240-tile run. Returning small dictionaries keeps the parent flat at about 40 megabytes for the whole run. Returning point arrays makes the parent grow with every completed tile, passing eight gigabytes before the run is halfway through.</desc>
  <rect x="0" y="0" width="720" height="232" fill="var(--dg-bg)" rx="10"/>
  <line x1="80" y1="40" x2="80" y2="176" stroke="var(--dg-line)" stroke-width="1.5"/>
  <line x1="80" y1="176" x2="690" y2="176" stroke="var(--dg-line)" stroke-width="1.5"/>
  <polyline points="80,174 200,140 320,104 440,72 560,48 690,42" fill="none" stroke="var(--dg-e)" stroke-width="2.6"/>
  <polyline points="80,174 200,172 320,173 440,172 560,173 690,172" fill="none" stroke="var(--dg-d)" stroke-width="2.6"/>
  <text x="300" y="90" font-size="11" fill="var(--dg-e)">returning pipeline.arrays — grows with every tile</text>
  <text x="300" y="164" font-size="11" fill="var(--dg-d)">returning a dict — flat at 40 MB</text>
  <text x="72" y="180" text-anchor="end" font-size="10.5" fill="var(--dg-muted)">0</text>
  <text x="72" y="44" text-anchor="end" font-size="10.5" fill="var(--dg-muted)">8 GB</text>
  <text x="385" y="198" text-anchor="middle" font-size="11.5" fill="var(--dg-text)">tiles completed</text>
  <text x="80" y="222" font-size="10.5" fill="var(--dg-muted)">the workers were memory-safe in both runs — it is the parent that fails, several hours in</text>
</svg>

## Gotchas and Edge Cases

**Setting `OMP_NUM_THREADS` in the parent only.** With `fork` the child inherits it, with `spawn` it does not unless it is in the environment before the interpreter starts. Set it in both places.

**Returning `pipeline.arrays` from the worker.** It pickles the whole tile back to the parent, which then holds every tile's points at once. This single mistake converts a memory-safe design into the original problem.

**A pool larger than the disk can feed.** Eight workers reading eight LAZ files saturate a spinning disk long before the CPUs. Watch the read throughput, not just the core utilisation.

## Frequently Asked Questions

**Why processes rather than threads?**

Isolation. Each tile has its own memory peak and its own failure mode, and a process boundary contains both. PDAL stages also use OpenMP internally, so processes with threads pinned to one give predictable core usage where threads inside one process would fight over the same cores.

**What should the worker return?**

A small dictionary: tile name, point count, elapsed time, output path. Returning pipeline.arrays pickles the entire point cloud back to the parent for every tile, which recreates exactly the whole-campaign memory footprint the design exists to avoid.

**How many workers is too many?**

When the speedup stops improving, which is usually at the physical core count and sometimes earlier if the disk saturates first. Multiply the per-tile memory peak by the worker count and check it against the machine before raising the number.

**Why set OMP_NUM_THREADS before importing pdal?**

OpenMP reads its configuration when the library loads. Setting the variable after the import has no effect, so each worker claims every core and eight workers on an eight-core machine ask for sixty-four threads.

---

## Related

- [Parallel Execution](https://www.pythonlidar.com/pdal-pipeline-architecture-execution/parallel-execution/) — the parent guide to the two axes of PDAL parallelism
- [Optimizing PDAL for Multi-Core Processing](https://www.pythonlidar.com/pdal-pipeline-architecture-execution/parallel-execution/optimizing-pdal-for-multi-core-processing/) — thread pinning and the oversubscription arithmetic
- [Diagnosing PDAL Out-of-Memory Failures](https://www.pythonlidar.com/pdal-pipeline-architecture-execution/memory-management/diagnosing-pdal-out-of-memory-failures/) — sizing a pool so the workers fit in memory together
- [Scaling PDAL Tile Processing with AWS Batch](https://www.pythonlidar.com/batch-automation-cloud-integration/aws-batch-processing/scaling-pdal-tile-processing-with-aws-batch/) — the same fan-out pattern across machines rather than cores
- [PDAL Pipeline Architecture and Execution](https://www.pythonlidar.com/pdal-pipeline-architecture-execution/) — the section overview
