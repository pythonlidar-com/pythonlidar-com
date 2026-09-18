---
title: "Dask Distributed Processing for LiDAR"
description: "Scale PDAL tile processing from one machine to many with Dask distributed: one task per tile, worker memory limits and resources, retries, progress, the dashboard, and running the same code locally, on a VM fleet or on Kubernetes."
slug: "dask-distributed-processing"
type: "topic"
breadcrumb: "Dask Distributed Processing"
datePublished: "2026-09-18"
dateModified: "2026-09-18"
---

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Article",
      "headline": "Dask Distributed Processing for LiDAR",
      "description": "Scale PDAL tile processing from one machine to many with Dask distributed: one task per tile, worker memory limits and resources, retries, progress, the dashboard, and running the same code locally, on a VM fleet or on Kubernetes.",
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
          "name": "Dask Distributed Processing",
          "item": "https://www.pythonlidar.com/batch-automation-cloud-integration/dask-distributed-processing/"
        }
      ]
    },
    {
      "@type": "HowTo",
      "name": "Process LiDAR tiles in parallel with Dask distributed",
      "step": [
        {
          "@type": "HowToStep",
          "name": "List work",
          "text": "Build the list of tile keys from a tile index or bucket listing; sort largest first for better balance."
        },
        {
          "@type": "HowToStep",
          "name": "Start a cluster",
          "text": "LocalCluster for one machine; a remote scheduler plus workers for many. Workers use one thread each and a memory limit sized to the largest tile."
        },
        {
          "@type": "HowToStep",
          "name": "Submit one task per tile",
          "text": "client.map(process_tile, tiles, retries=2, pure=False) returns one future per tile."
        },
        {
          "@type": "HowToStep",
          "name": "Stream results",
          "text": "as_completed yields futures as they finish, for progress logging and immediate failure handling."
        },
        {
          "@type": "HowToStep",
          "name": "Collect failures",
          "text": "Exceptions stay on their futures; gather them into a retry list rather than letting one bad tile stop the batch."
        },
        {
          "@type": "HowToStep",
          "name": "Shut down and record",
          "text": "Close the client, write a manifest of outputs and failures, and keep the dashboard's performance report if needed."
        }
      ]
    },
    {
      "@type": "FAQPage",
      "mainEntity": [
        {
          "@type": "Question",
          "name": "When should I use Dask instead of ProcessPoolExecutor?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "When one machine is not enough, or when you want retries, memory limits and a live dashboard without writing them yourself. The per-tile function is the same; only the executor changes."
          }
        },
        {
          "@type": "Question",
          "name": "How many Dask workers per machine?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Usually one worker per core with one thread each, limited by memory: divide available memory by the peak memory of your largest tiles, and use the smaller of that and the core count."
          }
        },
        {
          "@type": "Question",
          "name": "Can Dask split one large tile across workers?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Not usefully for PDAL neighbourhood filters, which need all points of a tile in one process. Split large tiles into smaller buffered tiles instead, and give each its own task."
          }
        },
        {
          "@type": "Question",
          "name": "Does Dask work with spot or preemptible instances?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Yes, and well. When a worker disappears, the scheduler reassigns its unfinished tasks to other workers, and with retries set each tile simply runs again. Because tile outputs are written with deterministic names, a rerun overwrites any partial output from the lost worker."
          }
        },
        {
          "@type": "Question",
          "name": "How do I watch a long batch?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Open the dashboard link printed by the client: the task stream shows every tile as it runs, the memory panel shows workers approaching their limits, and the progress bars show completion by task group. For unattended runs, log progress from the as_completed loop and keep the performance report."
          }
        },
        {
          "@type": "Question",
          "name": "How do I run the same code on Kubernetes?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Deploy a Dask cluster with the Dask Kubernetes operator or Helm chart using your PDAL image, set the scheduler address, and connect the client to it. The processing code does not change."
          }
        }
      ]
    }
  ]
}
</script>

A `ProcessPoolExecutor` is the right first step for parallel LiDAR processing, and it stops at the edge of one machine. When a statewide collection has twenty thousand tiles and each takes three minutes, a 32-core workstation needs more than a day; spreading the work over twenty machines brings it to about an hour. Dask's distributed scheduler is the most direct way to make that jump from Python. It keeps the programming model of futures and `map` that you already use with a process pool, adds a scheduler that spreads tasks over any number of workers on any number of machines, and brings retries, memory limits, resource constraints and a live dashboard for free. This topic in the [Batch Automation and Cloud Integration](https://www.pythonlidar.com/batch-automation-cloud-integration/) section covers how to structure PDAL work for Dask, how to size workers, and how to run the same code on a laptop, a VM fleet and Kubernetes.

<svg viewBox="0 0 740 230" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="A Dask client, scheduler and workers processing tiles from object storage" style="width:100%;max-width:740px;display:block;margin:1.6rem auto">
  <title>Client, scheduler, workers</title>
  <desc>A client script submits one task per tile to the Dask scheduler. The scheduler assigns tasks to worker processes spread over several machines. Each worker runs a PDAL pipeline on one tile, reading the input from object storage and writing outputs back. Only small results such as point counts and paths return to the client.</desc>
  <defs><marker id="dk-arw" markerWidth="9" markerHeight="7" refX="9" refY="3.5" orient="auto"><path d="M0,0 L0,7 L9,3.5 z" fill="var(--dg-line)"/></marker></defs>
  <rect x="0" y="0" width="740" height="230" fill="var(--dg-bg)" rx="10"/>
  <rect x="20" y="90" width="120" height="50" rx="8" fill="var(--dg-surface)" stroke="var(--dg-line)" stroke-width="1.3"/>
  <text x="80" y="112" text-anchor="middle" font-size="11" fill="var(--dg-text)">client</text>
  <text x="80" y="128" text-anchor="middle" font-size="10" fill="var(--dg-muted)">client.map(...)</text>
  <rect x="180" y="90" width="130" height="50" rx="8" fill="var(--dg-a-soft)" stroke="var(--dg-a)" stroke-width="1.3"/>
  <text x="245" y="119" text-anchor="middle" font-size="11" fill="var(--dg-text)">scheduler</text>
  <g font-size="10.5" fill="var(--dg-text)">
    <rect x="360" y="24" width="170" height="44" rx="7" fill="var(--dg-b-soft)" stroke="var(--dg-b)"/><text text-anchor="middle" x="445" y="50">machine 1: 8 workers</text>
    <rect x="360" y="93" width="170" height="44" rx="7" fill="var(--dg-b-soft)" stroke="var(--dg-b)"/><text text-anchor="middle" x="445" y="119">machine 2: 8 workers</text>
    <rect x="360" y="162" width="170" height="44" rx="7" fill="var(--dg-b-soft)" stroke="var(--dg-b)"/><text text-anchor="middle" x="445" y="188">machine n: 8 workers</text>
    <rect x="580" y="80" width="140" height="70" rx="8" fill="var(--dg-surface)" stroke="var(--dg-line)"/><text text-anchor="middle" x="650" y="110">object storage</text><text text-anchor="middle" x="650" y="128">tiles in, rasters out</text>
  </g>
  <line x1="140" y1="115" x2="176" y2="115" stroke="var(--dg-line)" stroke-width="1.4" marker-end="url(#dk-arw)"/>
  <path d="M310 108 L335 108 L335 46 L356 46" fill="none" stroke="var(--dg-line)" stroke-width="1.3" marker-end="url(#dk-arw)"/>
  <line x1="310" y1="115" x2="356" y2="115" stroke="var(--dg-line)" stroke-width="1.3" marker-end="url(#dk-arw)"/>
  <path d="M310 122 L335 122 L335 184 L356 184" fill="none" stroke="var(--dg-line)" stroke-width="1.3" marker-end="url(#dk-arw)"/>
  <line x1="530" y1="115" x2="576" y2="115" stroke="var(--dg-line)" stroke-width="1.3" marker-end="url(#dk-arw)"/>
  <text x="20" y="220" font-size="10.5" fill="var(--dg-muted)">points never travel through the scheduler or client — only tile paths in and small summaries out</text>
</svg>

## Prerequisites

- **Python 3.10+** with `dask[distributed]` (2024.x or later), the PDAL bindings, and the same versions on every worker — in practice, one container image.
- **Tiles in shared storage** that every worker can read: S3 or another object store via GDAL's `/vsis3/`, or a shared file system.
- **A per-tile function** that takes a path, runs PDAL, writes outputs to shared storage and returns a small summary. If it already works with `ProcessPoolExecutor`, it works with Dask.
- **Memory measurements** for the largest tiles, as in [measuring peak memory of a PDAL pipeline](https://www.pythonlidar.com/pdal-pipeline-architecture-execution/memory-management/measuring-peak-memory-of-a-pdal-pipeline/), to set worker memory limits.
- **Somewhere to run workers**: local processes for development, VMs over SSH, a cloud VM group, or Kubernetes via the Dask Kubernetes operator.

## Core Workflow Architecture

1. **List work.** Build the list of tile keys from a tile index or bucket listing; sort largest first for better balance.
2. **Start a cluster.** `LocalCluster` for one machine; a remote scheduler plus workers for many. Workers use one thread each and a memory limit sized to the largest tile.
3. **Submit one task per tile.** `client.map(process_tile, tiles, retries=2, pure=False)` returns one future per tile.
4. **Stream results.** `as_completed` yields futures as they finish, for progress logging and immediate failure handling.
5. **Collect failures.** Exceptions stay on their futures; gather them into a retry list rather than letting one bad tile stop the batch.
6. **Shut down and record.** Close the client, write a manifest of outputs and failures, and keep the dashboard's performance report if needed.

## Full Implementation

```python
"""Process LiDAR tiles with Dask distributed: one task per tile, retries, progress, manifest."""
from __future__ import annotations

import json
import logging
import os
import time
from pathlib import Path

from dask.distributed import Client, LocalCluster, as_completed, performance_report

log = logging.getLogger("dask-lidar")

PIPELINE = {
    "pipeline": [
        {"type": "readers.las", "filename": None},
        {"type": "filters.range", "limits": "Classification![7:7],Classification![18:18]"},
        {"type": "filters.smrf", "slope": 0.15, "window": 18, "threshold": 0.5},
        {"type": "filters.range", "limits": "Classification[2:2]"},
        {"type": "writers.gdal", "filename": None, "resolution": 1.0, "output_type": "idw",
         "window_size": 6, "data_type": "float32", "gdalopts": "COMPRESS=DEFLATE,TILED=YES"},
    ]
}


def process_tile(src: str, out_prefix: str) -> dict:
    """Runs on a worker. Returns a small summary, never point arrays."""
    os.environ.setdefault("OMP_NUM_THREADS", "1")
    import pdal
    spec = json.loads(json.dumps(PIPELINE))
    stem = Path(src).stem
    spec["pipeline"][0]["filename"] = src
    spec["pipeline"][-1]["filename"] = f"{out_prefix}/{stem}_dtm.tif"
    t0 = time.perf_counter()
    n = pdal.Pipeline(json.dumps(spec)).execute()
    return {"tile": stem, "ground_points": n, "seconds": round(time.perf_counter() - t0, 1),
            "output": spec["pipeline"][-1]["filename"]}


def run(tiles: list[str], out_prefix: str, scheduler: str | None = None) -> dict:
    if scheduler:
        client = Client(scheduler)
    else:
        cluster = LocalCluster(n_workers=os.cpu_count() // 2, threads_per_worker=1,
                               memory_limit="6GiB")
        client = Client(cluster)
    log.info("dashboard: %s", client.dashboard_link)

    done, failed = [], []
    with performance_report(filename="dask-report.html"):
        futures = client.map(process_tile, tiles, out_prefix=out_prefix,
                             retries=2, pure=False, key=[f"tile-{Path(t).stem}" for t in tiles])
        for i, fut in enumerate(as_completed(futures), 1):
            if fut.status == "error":
                failed.append({"key": fut.key, "error": repr(fut.exception())})
            else:
                done.append(fut.result())
            if i % 100 == 0 or i == len(futures):
                log.info("%d/%d finished, %d failed", i, len(futures), len(failed))
    client.close()
    manifest = {"done": done, "failed": failed}
    Path("manifest.json").write_text(json.dumps(manifest, indent=2))
    return manifest


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(message)s")
    keys = [l.strip() for l in Path("tile_list.txt").read_text().splitlines() if l.strip()]
    run([f"/vsis3/lidar-in/{k}" for k in keys], "/vsis3/lidar-out/dtm",
        scheduler=os.environ.get("DASK_SCHEDULER_ADDRESS"))
```

## Code Breakdown

**One task per tile.** Tiles are independent and large, so each task is minutes of work — ideal granularity for Dask. Splitting a tile into smaller tasks would require moving points between workers, which is exactly what to avoid.

**Summaries, not arrays.** `process_tile` writes outputs directly to storage and returns a few numbers. Returning point arrays would ship gigabytes through the network and pile them up in the client.

**`threads_per_worker=1` and `OMP_NUM_THREADS=1`.** PDAL work is CPU-bound and mostly single-threaded; one thread per worker process isolates memory and avoids oversubscription, the same reasoning as in [threads vs processes for PDAL workloads](https://www.pythonlidar.com/pdal-pipeline-architecture-execution/parallel-execution/threads-vs-processes-for-pdal-workloads/).

**`memory_limit`.** Dask pauses a worker at 80 percent of its limit and restarts it at 95 percent by default. Setting the limit just above the measured peak of the largest tile turns a runaway tile into a restarted worker and a retried task instead of a machine-wide out-of-memory kill.

**`retries=2, pure=False`.** Transient failures — a network blip, a spot instance reclaimed — are retried automatically. `pure=False` ensures tasks are not deduplicated by argument hash, which would matter if the same tile were deliberately resubmitted.

**Named keys.** `key=[f"tile-..."]` makes the dashboard and error reports show tile names instead of opaque hashes.

**`performance_report`.** Writes an HTML snapshot of the dashboard — task stream, worker memory, profiles — for the run, which is invaluable when a batch was slower than expected.

## Parameter Reference Table

| Setting | Where | Typical | Effect |
|---|---|---|---|
| `n_workers` | cluster | cores ÷ 1–2 | One PDAL process per worker |
| `threads_per_worker` | cluster | 1 | Avoids oversubscription |
| `memory_limit` | worker | peak of largest tile × 1.2 | Pause and restart thresholds |
| `retries` | `client.map` | 1–3 | Automatic retry of failed tasks |
| `pure` | `client.map` | False | Do not deduplicate identical calls |
| `resources` | worker and task | e.g. `{"MEM": 16}` | Reserve capacity for big tiles |
| `distributed.worker.memory.target` | config | 0.6 | Spill threshold (little effect for PDAL) |

<svg viewBox="0 0 740 210" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Wall time scaling from one machine to a Dask fleet" style="width:100%;max-width:740px;display:block;margin:1.6rem auto">
  <title>From a day to an hour</title>
  <desc>Bars of wall time for 20,000 tiles at about three minutes each. A 32-core workstation with a process pool needs about 31 hours. A Dask fleet of 10 machines with 16 workers each needs about 6.5 hours. A fleet of 40 machines needs about 1.7 hours, including scheduling overhead and the tail of the largest tiles.</desc>
  <rect x="0" y="0" width="740" height="210" fill="var(--dg-bg)" rx="10"/>
  <g font-size="11" fill="var(--dg-text)"><text text-anchor="end" x="250" y="48">1 workstation, 32 workers</text><text text-anchor="end" x="250" y="98">Dask, 10 × 16 workers</text><text text-anchor="end" x="250" y="148">Dask, 40 × 16 workers</text></g>
  <rect x="260" y="34" width="420" height="22" fill="var(--dg-e)"/>
  <rect x="260" y="84" width="88" height="22" fill="var(--dg-c)"/>
  <rect x="260" y="134" width="23" height="22" fill="var(--dg-d)"/>
  <g font-size="10.5" fill="var(--dg-muted)"><text x="672" y="74" text-anchor="end">≈ 31 h</text><text x="356" y="100">≈ 6.5 h</text><text x="291" y="150">≈ 1.7 h</text></g>
  <text x="260" y="190" font-size="10.5" fill="var(--dg-muted)">20,000 tiles × about 3 min each (illustrative)</text>
</svg>

## Costs and When Not to Use Dask

Dask is not free of overhead. A scheduler has to run somewhere, workers need a shared view of the data, and the whole setup has more moving parts than a single process pool. For a batch that finishes overnight on one machine, that overhead buys little. Dask earns its place when at least one of three things is true: the batch no longer fits in an acceptable time on one machine; the work is elastic, so paying for forty machines for two hours is better than one machine for three days; or the operational features — retries, memory-based restarts, a dashboard, performance reports — would otherwise have to be built by hand.

It is also worth comparing with managed batch services. A queue-based system such as AWS Batch runs one container per tile with no scheduler for you to operate, at the cost of a slower start-up per job and less interactive visibility. Dask is the better fit for iterative work — tune, rerun, inspect — and for teams already working in Python notebooks; a managed queue is often better for fixed, repeated production runs.

## Validation and Integrity Checks

- **Manifest completeness.** Every input tile appears exactly once in `done` or `failed`.
- **Outputs exist.** For each `done` entry, the output object exists and is non-empty; list the output prefix and compare.
- **Failure reasons.** Group failures by exception type; a single dominant reason (for example out-of-memory) indicates a sizing problem rather than bad tiles.
- **Idempotent reruns.** Resubmitting failed tiles must overwrite partial outputs cleanly, which depends on deterministic output names; see [making tile outputs idempotent](https://www.pythonlidar.com/batch-automation-cloud-integration/tile-indexing-and-merging/making-tile-outputs-idempotent/).

```python
m = json.loads(Path("manifest.json").read_text())
seen = {d["tile"] for d in m["done"]} | {f["key"].removeprefix("tile-") for f in m["failed"]}
assert seen == {Path(k).stem for k in keys}, "tiles missing from manifest"
```

## Deployment Options

The same client code runs against three kinds of cluster, and moving between them is mostly a matter of where the scheduler address comes from.

**Local.** `LocalCluster` starts a scheduler and workers as processes on the current machine. It is the right place to develop the per-tile function, measure memory, and run small batches — and it already gives you the dashboard, retries and memory limits.

**Fixed VMs.** Start `dask scheduler` on one host and `dask worker tcp://scheduler:8786 --nworkers 16 --nthreads 1 --memory-limit 6GiB` on each worker host, all from the same container image. This suits an on-premises rack or a set of long-lived cloud VMs, and needs nothing beyond SSH and Docker.

**Kubernetes or managed services.** The Dask Kubernetes operator creates a scheduler and worker pods from a custom resource, and supports adaptive scaling so worker pods appear and disappear with the task queue. Managed Dask offerings follow the same model. This is the most elastic option and the one that pairs naturally with spot or preemptible nodes, because Dask's retries absorb lost workers.

<svg viewBox="0 0 740 200" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Three deployment options for the same Dask client code" style="width:100%;max-width:740px;display:block;margin:1.6rem auto">
  <title>Same code, three clusters</title>
  <desc>Three columns. Local: LocalCluster processes on one machine, for development and small batches. Fixed VMs: a scheduler host and worker hosts started from one container image, for stable fleets. Kubernetes: operator-managed scheduler and worker pods with adaptive scaling, for elastic cloud batches. A shared bar underneath shows the unchanged client code.</desc>
  <rect x="0" y="0" width="740" height="200" fill="var(--dg-bg)" rx="10"/>
  <rect x="20" y="20" width="220" height="110" rx="10" fill="var(--dg-a-soft)" stroke="var(--dg-a)" stroke-width="1.3"/>
  <rect x="260" y="20" width="220" height="110" rx="10" fill="var(--dg-b-soft)" stroke="var(--dg-b)" stroke-width="1.3"/>
  <rect x="500" y="20" width="220" height="110" rx="10" fill="var(--dg-c-soft)" stroke="var(--dg-c)" stroke-width="1.3"/>
  <g font-size="12" font-weight="600" fill="var(--dg-text)"><text text-anchor="middle" x="130" y="46">local</text><text text-anchor="middle" x="370" y="46">fixed VMs</text><text text-anchor="middle" x="610" y="46">Kubernetes</text></g>
  <g font-size="10.5" fill="var(--dg-text)"><text text-anchor="middle" x="130" y="74">LocalCluster</text><text text-anchor="middle" x="130" y="94">develop, measure</text><text text-anchor="middle" x="370" y="74">dask scheduler / worker</text><text text-anchor="middle" x="370" y="94">stable fleets</text><text text-anchor="middle" x="610" y="74">operator, adaptive</text><text text-anchor="middle" x="610" y="94">elastic, spot-friendly</text></g>
  <rect x="20" y="150" width="700" height="34" rx="8" fill="var(--dg-surface)" stroke="var(--dg-line)" stroke-width="1.2"/>
  <text x="370" y="172" text-anchor="middle" font-size="10.5" fill="var(--dg-text)">client code unchanged: Client(address) · client.map(process_tile, tiles)</text>
</svg>

Whichever you choose, the image is the unit of reproducibility: client, scheduler and workers must run the same Python, PDAL, GDAL and PROJ versions, which is exactly what [pinning PDAL versions with conda-lock](https://www.pythonlidar.com/batch-automation-cloud-integration/pdal-docker-containers/pinning-pdal-versions-with-conda-lock/) provides.

## Performance Tuning

- **Largest tiles first.** Sort the task list by size descending, so the longest tasks start early and the batch does not end with one worker grinding through a giant tile; see [load balancing uneven LiDAR tiles](https://www.pythonlidar.com/pdal-pipeline-architecture-execution/parallel-execution/load-balancing-uneven-lidar-tiles/).
- **Resources for heavy tiles.** Give workers a resource such as `MEM=16` and submit big tiles with `resources={"MEM": 16}`, so at most one runs per worker slot sized for it.
- **Data locality.** Run workers in the same cloud region as the bucket; cross-region reads cost both time and egress fees.
- **Scheduler overhead.** Tens of thousands of multi-minute tasks are trivial for the scheduler. Millions of sub-second tasks are not — keep tasks coarse.
- **Adaptive scaling.** On cloud clusters, `cluster.adapt(minimum=0, maximum=40)` adds and removes workers with the queue length, so you pay only while tiles remain.

## Common Errors and Troubleshooting

**`KilledWorker`.** A task caused its worker to die repeatedly, usually by exceeding the memory limit. Raise the limit for big tiles with resources, or split the tile.

**Tasks pile up on one worker.** Work stealing moves queued tasks between workers, but tasks already running cannot move. Largest-first ordering reduces the effect.

**`ModuleNotFoundError` on workers.** Workers run a different environment from the client. Use one container image for client, scheduler and workers.

**Silent GDAL credential failures.** `/vsis3/` reads fail on workers that lack credentials. Rely on instance roles or service accounts rather than local credential files, and test with a single task first.

**Client runs out of memory.** Results are too large. Return summaries only, and write data to storage from the worker.

## Frequently Asked Questions

**When should I use Dask instead of ProcessPoolExecutor?**

When one machine is not enough, or when you want retries, memory limits and a live dashboard without writing them yourself. The per-tile function is the same; only the executor changes.

**How many Dask workers per machine?**

Usually one worker per core with one thread each, limited by memory: divide available memory by the peak memory of your largest tiles, and use the smaller of that and the core count.

**Can Dask split one large tile across workers?**

Not usefully for PDAL neighbourhood filters, which need all points of a tile in one process. Split large tiles into smaller buffered tiles instead, and give each its own task.

**Does Dask work with spot or preemptible instances?**

Yes, and well. When a worker disappears, the scheduler reassigns its unfinished tasks to other workers, and with retries set each tile simply runs again. Because tile outputs are written with deterministic names, a rerun overwrites any partial output from the lost worker.

**How do I watch a long batch?**

Open the dashboard link printed by the client: the task stream shows every tile as it runs, the memory panel shows workers approaching their limits, and the progress bars show completion by task group. For unattended runs, log progress from the as_completed loop and keep the performance report.

**How do I run the same code on Kubernetes?**

Deploy a Dask cluster with the Dask Kubernetes operator or Helm chart using your PDAL image, set the scheduler address, and connect the client to it. The processing code does not change.

## Related

- [Processing LiDAR Tiles with Dask Distributed](https://www.pythonlidar.com/batch-automation-cloud-integration/dask-distributed-processing/processing-lidar-tiles-with-dask-distributed/) — a step-by-step first deployment
- [Dask vs ProcessPoolExecutor for PDAL](https://www.pythonlidar.com/batch-automation-cloud-integration/dask-distributed-processing/dask-vs-processpoolexecutor-for-pdal/) — when the extra machinery pays off
- [Tracking Tile Progress and Failures in Dask](https://www.pythonlidar.com/batch-automation-cloud-integration/dask-distributed-processing/tracking-tile-progress-and-failures-in-dask/) — manifests, retries and reports
- [AWS Batch Processing](https://www.pythonlidar.com/batch-automation-cloud-integration/aws-batch-processing/) — the managed-queue alternative
- [PDAL Docker Containers](https://www.pythonlidar.com/batch-automation-cloud-integration/pdal-docker-containers/) — one image for client and workers
