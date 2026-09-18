---
title: "Dask vs ProcessPoolExecutor for PDAL"
description: "When a standard-library process pool is enough for PDAL tile batches and when Dask distributed pays off: scale beyond one machine, retries and memory limits, observability, operational cost, and a migration path that keeps the per-tile function unchanged."
slug: "dask-vs-processpoolexecutor-for-pdal"
type: "howto"
breadcrumb: "Dask vs Process Pool"
datePublished: "2026-09-18"
dateModified: "2026-09-18"
---

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Article",
      "headline": "Dask vs ProcessPoolExecutor for PDAL",
      "description": "When a standard-library process pool is enough for PDAL tile batches and when Dask distributed pays off: scale beyond one machine, retries and memory limits, observability, operational cost, and a migration path that keeps the per-tile function unchanged.",
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
        },
        {
          "@type": "ListItem",
          "position": 4,
          "name": "Dask vs Process Pool",
          "item": "https://www.pythonlidar.com/batch-automation-cloud-integration/dask-distributed-processing/dask-vs-processpoolexecutor-for-pdal/"
        }
      ]
    },
    {
      "@type": "HowTo",
      "name": "Decide between Dask and ProcessPoolExecutor for PDAL batches",
      "step": [
        {
          "@type": "HowToStep",
          "name": "Estimate single-machine wall time",
          "text": "Multiply tile count by median tile time and divide by the number of workers that fit in memory. If that is overnight or less, one machine may be enough."
        },
        {
          "@type": "HowToStep",
          "name": "List the operational needs",
          "text": "Retries on transient errors, restarts when a tile blows memory, progress visibility, per-task timing \u2014 note which you need."
        },
        {
          "@type": "HowToStep",
          "name": "Price the alternatives",
          "text": "A process pool costs nothing to operate. Dask costs a scheduler, a shared image and network configuration \u2014 small, but not zero."
        },
        {
          "@type": "HowToStep",
          "name": "Write executor-agnostic code",
          "text": "Keep the per-tile function pure (path in, summary out) and pass the executor in, so the same driver works with both."
        },
        {
          "@type": "HowToStep",
          "name": "Migrate when a threshold is crossed",
          "text": "Switch when a batch no longer fits a working day on one machine, or when the hand-written retry and memory logic starts to grow."
        }
      ]
    },
    {
      "@type": "FAQPage",
      "mainEntity": [
        {
          "@type": "Question",
          "name": "Is Dask faster than ProcessPoolExecutor on one machine?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Not meaningfully for PDAL tile work. Both run one process per tile, and per-task overhead is negligible compared with minutes of processing. Dask's advantages are scaling out and operational features, not single-machine speed."
          }
        },
        {
          "@type": "Question",
          "name": "What happens when a PDAL worker runs out of memory?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "In a process pool, the kernel kills the worker and the pool breaks, failing pending tasks. In Dask, the worker's nanny restarts it, and the task is retried or marked failed while other tasks continue."
          }
        },
        {
          "@type": "Question",
          "name": "Can I switch from a process pool to Dask later?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Yes, if the per-tile function takes a path and returns a small summary. The driver changes from pool.submit to client.map; the task code stays the same."
          }
        },
        {
          "@type": "Question",
          "name": "Do I need Dask for Airflow or AWS Batch?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "No. Those systems distribute tiles themselves, one task or container per tile. Dask is an alternative orchestration layer, most useful when you want Python-native control and interactive visibility."
          }
        }
      ]
    }
  ]
}
</script>

**TL;DR:** Stay with `concurrent.futures.ProcessPoolExecutor` while a batch finishes in acceptable time on one machine and you can live with hand-written retries and progress logging. Move to Dask distributed when you need more than one machine, automatic memory-based worker restarts, retries, a live dashboard, or elastic cloud scaling. Write the per-tile function so it works unchanged with both, and the switch is a few lines.

## Context and Motivation

This guide is part of [Dask Distributed Processing for LiDAR](https://www.pythonlidar.com/batch-automation-cloud-integration/dask-distributed-processing/). Teams often adopt a distributed framework before they need one, and pay for it in operational complexity; others stretch a single machine far past sensible limits. The decision is not about PDAL — both run PDAL identically, one process per tile — but about scale, failure handling and visibility. Framing it as a few concrete questions makes the answer clear for most projects.

<svg viewBox="0 0 740 220" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Decision tree for choosing between a process pool and Dask" style="width:100%;max-width:740px;display:block;margin:1.6rem auto">
  <title>Three questions</title>
  <desc>A decision tree. Does the batch finish in acceptable time on one machine? If no, use Dask. If yes: do you need automatic retries, memory-based restarts or a live dashboard? If no, use ProcessPoolExecutor. If yes: will you run this regularly or scale it later? If yes, use Dask; if no, add the features you need to the process pool by hand.</desc>
  <defs><marker id="dvp-arw" markerWidth="9" markerHeight="7" refX="9" refY="3.5" orient="auto"><path d="M0,0 L0,7 L9,3.5 z" fill="var(--dg-line)"/></marker></defs>
  <rect x="0" y="0" width="740" height="220" fill="var(--dg-bg)" rx="10"/>
  <rect x="20" y="20" width="240" height="44" rx="8" fill="var(--dg-surface)" stroke="var(--dg-line)" stroke-width="1.3"/>
  <text x="140" y="47" text-anchor="middle" font-size="10.5" fill="var(--dg-text)">fits on one machine in time?</text>
  <rect x="20" y="150" width="160" height="44" rx="8" fill="var(--dg-a-soft)" stroke="var(--dg-a)" stroke-width="1.3"/>
  <text x="100" y="177" text-anchor="middle" font-size="11" fill="var(--dg-text)">Dask</text>
  <rect x="300" y="84" width="240" height="44" rx="8" fill="var(--dg-surface)" stroke="var(--dg-line)" stroke-width="1.3"/>
  <text x="420" y="111" text-anchor="middle" font-size="10.5" fill="var(--dg-text)">need retries, restarts, dashboard?</text>
  <rect x="220" y="160" width="200" height="44" rx="8" fill="var(--dg-d-soft)" stroke="var(--dg-d)" stroke-width="1.3"/>
  <text x="320" y="187" text-anchor="middle" font-size="11" fill="var(--dg-text)">ProcessPoolExecutor</text>
  <rect x="460" y="160" width="260" height="44" rx="8" fill="var(--dg-surface)" stroke="var(--dg-line)" stroke-width="1.3"/>
  <text x="590" y="182" text-anchor="middle" font-size="10.5" fill="var(--dg-text)">recurring or growing? → Dask</text>
  <text x="590" y="197" text-anchor="middle" font-size="10" fill="var(--dg-muted)">one-off → add by hand</text>
  <path d="M60 64 L60 146" fill="none" stroke="var(--dg-line)" stroke-width="1.3" marker-end="url(#dvp-arw)"/>
  <path d="M260 42 L420 42 L420 80" fill="none" stroke="var(--dg-line)" stroke-width="1.3" marker-end="url(#dvp-arw)"/>
  <path d="M360 128 L360 156" fill="none" stroke="var(--dg-line)" stroke-width="1.3" marker-end="url(#dvp-arw)"/>
  <path d="M500 128 L500 156" fill="none" stroke="var(--dg-line)" stroke-width="1.3" marker-end="url(#dvp-arw)"/>
  <text x="68" y="110" font-size="10" fill="var(--dg-muted)">no</text>
  <text x="330" y="36" font-size="10" fill="var(--dg-muted)">yes</text>
  <text x="368" y="146" font-size="10" fill="var(--dg-muted)">no</text>
  <text x="508" y="146" font-size="10" fill="var(--dg-muted)">yes</text>
</svg>

## Prerequisites and Assumptions

- A per-tile function that takes a path and returns a small summary, with outputs written to storage.
- An estimate of total work: tile count × median time per tile ÷ cores available.
- An honest view of how often the batch will run and who will operate it.

## Step-by-Step Implementation

### Step 1 — Estimate single-machine wall time

Multiply tile count by median tile time and divide by the number of workers that fit in memory. If that is overnight or less, one machine may be enough.

### Step 2 — List the operational needs

Retries on transient errors, restarts when a tile blows memory, progress visibility, per-task timing — note which you need.

### Step 3 — Price the alternatives

A process pool costs nothing to operate. Dask costs a scheduler, a shared image and network configuration — small, but not zero.

### Step 4 — Write executor-agnostic code

Keep the per-tile function pure (path in, summary out) and pass the executor in, so the same driver works with both.

### Step 5 — Migrate when a threshold is crossed

Switch when a batch no longer fits a working day on one machine, or when the hand-written retry and memory logic starts to grow.

## Complete Working Example

A driver that runs the same task with either executor:

```python
"""One driver, two executors: ProcessPoolExecutor locally, Dask when scaled out."""
from __future__ import annotations

import os
from concurrent.futures import ProcessPoolExecutor, as_completed as cf_as_completed
from pathlib import Path

from lidar_tasks import process_tile          # path in, summary dict out


def run_local(keys: list[str], workers: int | None = None) -> list[dict]:
    results = []
    with ProcessPoolExecutor(max_workers=workers or os.cpu_count()) as pool:
        futs = {pool.submit(process_tile, k): k for k in keys}
        for f in cf_as_completed(futs):
            try:
                results.append(f.result())
            except Exception as exc:              # noqa: BLE001 — record and continue
                results.append({"tile": Path(futs[f]).stem, "error": repr(exc)})
    return results


def run_dask(keys: list[str], address: str) -> list[dict]:
    from dask.distributed import Client, as_completed
    client = Client(address)
    futs = client.map(process_tile, keys, retries=2, pure=False)
    results = []
    for f in as_completed(futs):
        results.append({"tile": f.key, "error": repr(f.exception())} if f.status == "error"
                       else f.result())
    client.close()
    return results


if __name__ == "__main__":
    keys = [k.strip() for k in Path("tile_list.txt").read_text().splitlines() if k.strip()]
    address = os.environ.get("DASK_SCHEDULER_ADDRESS")
    out = run_dask(keys, address) if address else run_local(keys)
    print(f"{sum('error' not in r for r in out)} ok, {sum('error' in r for r in out)} failed")
```

The process-pool branch records failures but does not retry or restart on memory exhaustion — a worker killed by the kernel raises `BrokenProcessPool` and ends the pool. Dask handles both.

<svg viewBox="32 -6 584 208" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Feature comparison between ProcessPoolExecutor and Dask distributed" style="width:100%;max-width:740px;display:block;margin:1.6rem auto">
  <title>What you get for the extra machinery</title>
  <desc>A two-column checklist. ProcessPoolExecutor: single machine, no automatic retries, a worker killed by out-of-memory breaks the pool, no dashboard, zero setup. Dask distributed: many machines, automatic retries, workers restarted at a memory limit with tasks rescheduled, live dashboard and performance reports, requires a scheduler and shared image.</desc>
  <rect x="32" y="-6" width="584" height="208" fill="var(--dg-bg)" rx="10"/>
  <text x="200" y="26" text-anchor="middle" font-size="11.5" font-weight="600" fill="var(--dg-text)">ProcessPoolExecutor</text>
  <text x="540" y="26" text-anchor="middle" font-size="11.5" font-weight="600" fill="var(--dg-text)">Dask distributed</text>
  <g font-size="10.5" fill="var(--dg-text)">
    <text x="60" y="56">one machine</text><text x="400" y="56">many machines</text>
    <text x="60" y="84">retries: write your own</text><text x="400" y="84">retries: built in</text>
    <text x="60" y="112">OOM kill breaks the pool</text><text x="400" y="112">worker restarted, task rescheduled</text>
    <text x="60" y="140">progress: your logging</text><text x="400" y="140">dashboard, performance report</text>
    <text x="60" y="168">setup: none</text><text x="400" y="168">scheduler, shared image, network</text>
  </g>
  <line x1="370" y1="40" x2="370" y2="180" stroke="var(--dg-line-soft)" stroke-width="1"/>
</svg>

## A Middle Path

There is a useful halfway house between the two: Dask's `LocalCluster` on a single machine. It gives the operational features — memory limits with restarts, retries, the dashboard — without any multi-host setup, and the same code later points at a remote scheduler unchanged. For teams that expect to grow, starting with `LocalCluster` instead of a raw process pool costs one extra dependency and avoids rewriting the driver later. For teams that do not, the standard library remains the simplest thing that works.

Whichever you choose, keep the per-tile function free of executor-specific code: no Dask imports inside it, no assumptions about which process it runs in, and all outputs written to storage by the function itself. That discipline is what makes the executor a configuration choice rather than an architecture.

## Key Parameter Table

| Criterion | ProcessPoolExecutor | Dask distributed |
|---|---|---|
| Machines | 1 | many |
| Setup | none | scheduler + workers + image |
| Retries | manual | `retries=` |
| Memory limit per worker | none (kernel OOM) | `memory_limit`, pause and restart |
| Observability | logs | dashboard, reports |
| Elastic scaling | no | adaptive clusters |
| Best for | one-off and small batches | recurring, large or interactive work |

## Verification

- **Same results.** Run twenty tiles with both executors and compare outputs; they must be identical, because the task is the same.
- **Failure behaviour.** Feed one tile that exceeds memory. The process pool should fail the batch or the task visibly; Dask should restart the worker and eventually mark the task failed after retries.
- **Throughput.** On one machine, throughput should be nearly identical; Dask's overhead per multi-minute task is negligible.

## Gotchas and Edge Cases

**BrokenProcessPool.** When the kernel kills a pool worker, every pending future in that pool fails. Resubmitting the rest requires a new pool — code you now own. This is often the moment teams move to Dask.

**Memory contention on one machine.** Neither executor prevents too many large tiles running at once, unless you add a semaphore (pool) or resources (Dask).

**Pickling.** Both pickle the function and its arguments. Pass paths, not open file handles or pipeline objects.

<svg viewBox="0 0 740 170" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="What happens when one worker is killed for memory in each executor" style="width:100%;max-width:740px;display:block;margin:1.6rem auto">
  <title>One out-of-memory kill, two outcomes</title>
  <desc>Left: in a process pool, one worker killed by the kernel raises BrokenProcessPool, and all queued and running tasks in the pool fail. Right: in Dask, the nanny process restarts the killed worker, its task is retried elsewhere, and the rest of the batch continues.</desc>
  <rect x="0" y="0" width="740" height="170" fill="var(--dg-bg)" rx="10"/>
  <rect x="20" y="24" width="330" height="120" rx="10" fill="var(--dg-e-soft)" stroke="var(--dg-e)" stroke-width="1.3"/>
  <text x="185" y="52" text-anchor="middle" font-size="11.5" font-weight="600" fill="var(--dg-text)">process pool</text>
  <text x="185" y="80" text-anchor="middle" font-size="10.5" fill="var(--dg-text)">worker OOM-killed</text>
  <text x="185" y="100" text-anchor="middle" font-size="10.5" fill="var(--dg-text)">→ BrokenProcessPool</text>
  <text x="185" y="120" text-anchor="middle" font-size="10.5" fill="var(--dg-text)">→ pending tasks fail</text>
  <rect x="390" y="24" width="330" height="120" rx="10" fill="var(--dg-d-soft)" stroke="var(--dg-d)" stroke-width="1.3"/>
  <text x="555" y="52" text-anchor="middle" font-size="11.5" font-weight="600" fill="var(--dg-text)">Dask</text>
  <text x="555" y="80" text-anchor="middle" font-size="10.5" fill="var(--dg-text)">worker restarted by nanny</text>
  <text x="555" y="100" text-anchor="middle" font-size="10.5" fill="var(--dg-text)">→ task retried elsewhere</text>
  <text x="555" y="120" text-anchor="middle" font-size="10.5" fill="var(--dg-text)">→ batch continues</text>
</svg>

**Premature distribution.** A Dask cluster for a 200-tile batch that finishes in an hour on a laptop adds failure modes without adding value. Start simple.

## Frequently Asked Questions

**Is Dask faster than ProcessPoolExecutor on one machine?**

Not meaningfully for PDAL tile work. Both run one process per tile, and per-task overhead is negligible compared with minutes of processing. Dask's advantages are scaling out and operational features, not single-machine speed.

**What happens when a PDAL worker runs out of memory?**

In a process pool, the kernel kills the worker and the pool breaks, failing pending tasks. In Dask, the worker's nanny restarts it, and the task is retried or marked failed while other tasks continue.

**Can I switch from a process pool to Dask later?**

Yes, if the per-tile function takes a path and returns a small summary. The driver changes from pool.submit to client.map; the task code stays the same.

**Do I need Dask for Airflow or AWS Batch?**

No. Those systems distribute tiles themselves, one task or container per tile. Dask is an alternative orchestration layer, most useful when you want Python-native control and interactive visibility.

## Related

- [Dask Distributed Processing for LiDAR](https://www.pythonlidar.com/batch-automation-cloud-integration/dask-distributed-processing/) — Dask for PDAL in depth
- [Parallel Tile Processing with ProcessPoolExecutor](https://www.pythonlidar.com/pdal-pipeline-architecture-execution/parallel-execution/parallel-tile-processing-with-processpoolexecutor/) — the single-machine baseline
- [Threads vs Processes for PDAL Workloads](https://www.pythonlidar.com/pdal-pipeline-architecture-execution/parallel-execution/threads-vs-processes-for-pdal-workloads/) — why processes
- [Processing LiDAR Tiles with Dask Distributed](https://www.pythonlidar.com/batch-automation-cloud-integration/dask-distributed-processing/processing-lidar-tiles-with-dask-distributed/) — first multi-host deployment
- [Scaling PDAL Tile Processing with AWS Batch](https://www.pythonlidar.com/batch-automation-cloud-integration/aws-batch-processing/scaling-pdal-tile-processing-with-aws-batch/) — the managed-queue alternative
