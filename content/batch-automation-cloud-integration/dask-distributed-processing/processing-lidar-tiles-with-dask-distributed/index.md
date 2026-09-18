---
title: "Processing LiDAR Tiles with Dask Distributed"
description: "A first Dask distributed deployment for PDAL: a container image, a scheduler and workers on two or more hosts, a per-tile task reading from and writing to S3, and a client that submits a tile list and collects a manifest."
slug: "processing-lidar-tiles-with-dask-distributed"
type: "howto"
breadcrumb: "Tiles with Dask"
datePublished: "2026-09-18"
dateModified: "2026-09-18"
---

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Article",
      "headline": "Processing LiDAR Tiles with Dask Distributed",
      "description": "A first Dask distributed deployment for PDAL: a container image, a scheduler and workers on two or more hosts, a per-tile task reading from and writing to S3, and a client that submits a tile list and collects a manifest.",
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
          "name": "Tiles with Dask",
          "item": "https://www.pythonlidar.com/batch-automation-cloud-integration/dask-distributed-processing/processing-lidar-tiles-with-dask-distributed/"
        }
      ]
    },
    {
      "@type": "HowTo",
      "name": "Process LiDAR tiles across machines with Dask distributed",
      "step": [
        {
          "@type": "HowToStep",
          "name": "Build one image",
          "text": "Start from a conda-forge PDAL environment, add dask[distributed], and copy in the module containing process_tile. Client, scheduler and workers all run this image."
        },
        {
          "@type": "HowToStep",
          "name": "Start the scheduler",
          "text": "docker run --network host lidar-dask:1.4 dask scheduler on the scheduler host."
        },
        {
          "@type": "HowToStep",
          "name": "Start workers",
          "text": "On each worker host: docker run --network host lidar-dask:1.4 dask worker tcp://10.0.1.10:8786 --nworkers 8 --nthreads 1 --memory-limit 6GiB."
        },
        {
          "@type": "HowToStep",
          "name": "Submit from the client",
          "text": "Connect with Client, map process_tile over the tile keys, and consume as_completed."
        },
        {
          "@type": "HowToStep",
          "name": "Watch and collect",
          "text": "Open the dashboard, then write the manifest of results and failures when the loop ends."
        }
      ]
    },
    {
      "@type": "FAQPage",
      "mainEntity": [
        {
          "@type": "Question",
          "name": "How do I start a Dask cluster across several machines?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Run dask scheduler on one host and dask worker with the scheduler's address on each other host, all from the same container image. Clients then connect to the scheduler address."
          }
        },
        {
          "@type": "Question",
          "name": "Where should the task function live?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "In a module installed in the image that workers use, so workers can import it by name. This avoids pickling surprises and guarantees workers run the same code as the client expects."
          }
        },
        {
          "@type": "Question",
          "name": "How do workers read tiles from S3?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Through GDAL's virtual file system: PDAL readers accept /vsis3/bucket/key paths and use the instance role or service account credentials available on each worker."
          }
        },
        {
          "@type": "Question",
          "name": "What should the task return?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "A small summary such as point counts, timings and output paths. Outputs themselves should be written to storage from the worker, never returned through Dask."
          }
        }
      ]
    }
  ]
}
</script>

**TL;DR:** Build one image with PDAL, Python and `dask[distributed]`; run `dask scheduler` on one host and `dask worker tcp://<scheduler>:8786 --nworkers 8 --nthreads 1 --memory-limit 6GiB` on each worker host; in the client, `Client("tcp://<scheduler>:8786")` then `client.map(process_tile, tile_keys, retries=2, pure=False)` and gather small results with `as_completed`. Tiles stream from S3 via `/vsis3/`, outputs go straight back to S3.

## Context and Motivation

This guide is part of [Dask Distributed Processing for LiDAR](https://www.pythonlidar.com/batch-automation-cloud-integration/dask-distributed-processing/). The topic explains the model; this page is the concrete first deployment — two or three cloud VMs or on-premises servers, the same container everywhere, and a client script run from a laptop or a CI job. It deliberately avoids Kubernetes so every piece is visible: a scheduler process, worker processes, and the network between them.

Once this works, moving to an operator-managed cluster changes how processes are started, not the code.

<svg viewBox="0 0 740 220" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Scheduler host, worker hosts and the client connected over ports 8786 and 8787" style="width:100%;max-width:740px;display:block;margin:1.6rem auto">
  <title>A minimal multi-host cluster</title>
  <desc>A scheduler host listening on port 8786 for workers and clients and serving the dashboard on port 8787. Two worker hosts each run eight single-threaded worker processes from the same container image and connect to the scheduler. A client on a laptop connects to port 8786 to submit tasks and views the dashboard on 8787. Workers read and write S3 directly.</desc>
  <rect x="0" y="0" width="740" height="220" fill="var(--dg-bg)" rx="10"/>
  <rect x="270" y="20" width="200" height="60" rx="8" fill="var(--dg-a-soft)" stroke="var(--dg-a)" stroke-width="1.3"/>
  <text x="370" y="44" text-anchor="middle" font-size="11" fill="var(--dg-text)">scheduler host</text>
  <text x="370" y="64" text-anchor="middle" font-size="10" fill="var(--dg-muted)">:8786 tasks · :8787 dashboard</text>
  <rect x="20" y="20" width="180" height="60" rx="8" fill="var(--dg-surface)" stroke="var(--dg-line)" stroke-width="1.3"/>
  <text x="110" y="44" text-anchor="middle" font-size="11" fill="var(--dg-text)">client (laptop, CI)</text>
  <text x="110" y="64" text-anchor="middle" font-size="10" fill="var(--dg-muted)">Client("tcp://…:8786")</text>
  <rect x="160" y="130" width="200" height="60" rx="8" fill="var(--dg-b-soft)" stroke="var(--dg-b)" stroke-width="1.3"/>
  <text x="260" y="154" text-anchor="middle" font-size="11" fill="var(--dg-text)">worker host 1</text>
  <text x="260" y="174" text-anchor="middle" font-size="10" fill="var(--dg-muted)">8 workers × 1 thread</text>
  <rect x="380" y="130" width="200" height="60" rx="8" fill="var(--dg-b-soft)" stroke="var(--dg-b)" stroke-width="1.3"/>
  <text x="480" y="154" text-anchor="middle" font-size="11" fill="var(--dg-text)">worker host 2</text>
  <text x="480" y="174" text-anchor="middle" font-size="10" fill="var(--dg-muted)">8 workers × 1 thread</text>
  <rect x="600" y="130" width="120" height="60" rx="8" fill="var(--dg-surface)" stroke="var(--dg-line)" stroke-width="1.3"/>
  <text x="660" y="164" text-anchor="middle" font-size="11" fill="var(--dg-text)">S3</text>
  <g stroke="var(--dg-line)" stroke-width="1.3"><line x1="200" y1="50" x2="268" y2="50"/><line x1="320" y1="80" x2="280" y2="128"/><line x1="420" y1="80" x2="470" y2="128"/><line x1="580" y1="160" x2="598" y2="160"/></g>
</svg>

## Prerequisites and Assumptions

- Two or more Linux hosts with Docker, able to reach each other on TCP ports 8786 (scheduler) and 8787 (dashboard), plus the worker-to-worker ports Dask assigns.
- An S3 bucket readable and writable through instance roles (no credential files in images).
- A per-tile PDAL function that already works locally.

## Step-by-Step Implementation

### Step 1 — Build one image

Start from a conda-forge PDAL environment, add `dask[distributed]`, and copy in the module containing `process_tile`. Client, scheduler and workers all run this image.

### Step 2 — Start the scheduler

`docker run --network host lidar-dask:1.4 dask scheduler` on the scheduler host.

### Step 3 — Start workers

On each worker host: `docker run --network host lidar-dask:1.4 dask worker tcp://10.0.1.10:8786 --nworkers 8 --nthreads 1 --memory-limit 6GiB`.

### Step 4 — Submit from the client

Connect with `Client`, map `process_tile` over the tile keys, and consume `as_completed`.

### Step 5 — Watch and collect

Open the dashboard, then write the manifest of results and failures when the loop ends.

## Complete Working Example

`Dockerfile`:

```dockerfile
FROM mambaorg/micromamba:1.5-jammy
COPY --chown=$MAMBA_USER:$MAMBA_USER env.lock /tmp/env.lock
RUN micromamba install -y -n base -f /tmp/env.lock && micromamba clean -a -y
COPY --chown=$MAMBA_USER:$MAMBA_USER lidar_tasks.py /app/lidar_tasks.py
ENV PYTHONPATH=/app OMP_NUM_THREADS=1 GDAL_DISABLE_READDIR_ON_OPEN=EMPTY_DIR
```

`lidar_tasks.py` — imported by workers, so the function is importable by name:

```python
"""Per-tile task executed on Dask workers."""
from __future__ import annotations

import json
import time
from pathlib import PurePosixPath

import pdal

OUT = "/vsis3/lidar-out/dtm"


def process_tile(key: str) -> dict:
    stem = PurePosixPath(key).stem
    spec = {"pipeline": [
        f"/vsis3/lidar-in/{key}",
        {"type": "filters.range", "limits": "Classification![7:7],Classification![18:18]"},
        {"type": "filters.smrf", "slope": 0.15, "window": 18, "threshold": 0.5},
        {"type": "filters.range", "limits": "Classification[2:2]"},
        {"type": "writers.gdal", "filename": f"{OUT}/{stem}.tif", "resolution": 1.0,
         "output_type": "idw", "window_size": 6, "data_type": "float32",
         "gdalopts": "COMPRESS=DEFLATE,TILED=YES"},
    ]}
    t0 = time.perf_counter()
    n = pdal.Pipeline(json.dumps(spec)).execute()
    return {"tile": stem, "ground_points": n, "seconds": round(time.perf_counter() - t0, 1)}
```

`submit.py` — run anywhere that can reach the scheduler:

```python
"""Submit a tile list to a remote Dask scheduler and write a manifest."""
import json
import sys
from pathlib import Path

from dask.distributed import Client, as_completed

from lidar_tasks import process_tile

client = Client(sys.argv[1])                     # e.g. tcp://10.0.1.10:8786
print("dashboard:", client.dashboard_link)
keys = [k.strip() for k in Path("tile_list.txt").read_text().splitlines() if k.strip()]

futures = client.map(process_tile, keys, retries=2, pure=False,
                     key=[f"tile-{Path(k).stem}" for k in keys])
done, failed = [], []
for i, f in enumerate(as_completed(futures), 1):
    (failed.append({"key": f.key, "error": repr(f.exception())}) if f.status == "error"
     else done.append(f.result()))
    if i % 50 == 0:
        print(f"{i}/{len(futures)} done, {len(failed)} failed", flush=True)

Path("manifest.json").write_text(json.dumps({"done": done, "failed": failed}, indent=2))
client.close()
```

<svg viewBox="0 0 740 200" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Timeline of a first run with sixteen workers" style="width:100%;max-width:740px;display:block;margin:1.6rem auto">
  <title>What the task stream shows</title>
  <desc>A simplified task stream: sixteen horizontal worker lanes filled with blocks, each block one tile. Most blocks are similar in length. One lane near the end runs a long block for a large tile while other lanes are idle, a tail that largest-first ordering would reduce. A red block marks a failed task that was retried on another worker.</desc>
  <rect x="0" y="0" width="740" height="200" fill="var(--dg-bg)" rx="10"/>
  <g fill="var(--dg-b-soft)" stroke="var(--dg-b)" stroke-width="0.8">
    <rect x="40" y="20" width="150" height="14"/><rect x="194" y="20" width="160" height="14"/><rect x="358" y="20" width="150" height="14"/>
    <rect x="40" y="40" width="170" height="14"/><rect x="214" y="40" width="140" height="14"/><rect x="358" y="40" width="160" height="14"/>
    <rect x="40" y="60" width="160" height="14"/><rect x="204" y="60" width="150" height="14"/><rect x="358" y="60" width="140" height="14"/>
    <rect x="40" y="80" width="150" height="14"/><rect x="194" y="80" width="170" height="14"/><rect x="368" y="80" width="150" height="14"/>
    <rect x="40" y="100" width="140" height="14"/><rect x="184" y="100" width="170" height="14"/><rect x="358" y="100" width="330" height="14"/>
    <rect x="40" y="120" width="160" height="14"/><rect x="204" y="120" width="160" height="14"/><rect x="368" y="120" width="140" height="14"/>
  </g>
  <rect x="220" y="140" width="60" height="14" fill="var(--dg-e-soft)" stroke="var(--dg-e)" stroke-width="0.8"/>
  <rect x="284" y="140" width="150" height="14" fill="var(--dg-b-soft)" stroke="var(--dg-b)" stroke-width="0.8"/>
  <text x="500" y="112" font-size="10.5" fill="var(--dg-text)">large tile: long tail</text>
  <text x="228" y="176" font-size="10.5" fill="var(--dg-e)">failed attempt, retried</text>
  <text x="40" y="194" font-size="10.5" fill="var(--dg-muted)">lanes = workers, blocks = tiles (simplified)</text>
</svg>

## Sizing the First Cluster

The first real run is also the best moment to measure what the batch needs. Start with two worker hosts, run a hundred representative tiles, and read three numbers from the performance report: median task time, peak worker memory, and the share of time workers spent idle. Median task time times the number of tiles, divided by the number of workers, gives a first estimate of wall time for the full list. Peak memory tells you whether `--memory-limit` can be lowered to fit more workers per host, or must be raised because the largest tiles came close to the pause threshold. Idle time above a few percent usually points to I/O — workers waiting on S3 — which argues for hosts in the bucket's region or larger instance network bandwidth rather than more workers.

With those numbers, choose the host count for the real run from the deadline and the budget. Cloud VMs are billed per second or minute, so forty hosts for two hours costs roughly the same as ten hosts for eight; the only reason to run fewer is a quota or a shared bucket's request limits.

When the batch ends, stop the workers and scheduler explicitly. Idle Dask workers on on-demand instances cost exactly as much as busy ones, and a forgotten fleet over a weekend is the most expensive mistake in cloud LiDAR processing.

## Key Parameter Table

| Setting | Where | Value | Why |
|---|---|---|---|
| `--nworkers` | `dask worker` | cores or memory ÷ peak | Processes per host |
| `--nthreads` | `dask worker` | 1 | PDAL is CPU-bound, single-threaded |
| `--memory-limit` | `dask worker` | e.g. 6GiB | Pause and restart thresholds |
| `retries` | `client.map` | 2 | Absorb transient failures |
| `key` | `client.map` | `tile-<name>` | Readable dashboard and errors |
| `OMP_NUM_THREADS` | image env | 1 | No oversubscription |

## Verification

- **One-tile smoke test.** Submit a single task first and check its output appears in S3.
- **Worker count.** `len(client.scheduler_info()["workers"])` equals hosts × `--nworkers`.
- **Manifest complete.** Every key appears once in `done` or `failed`; retry the failures as a new, small batch.

## Gotchas and Edge Cases

**Functions defined in `__main__`.** Workers must be able to import the task function. Defining it in the submitting script works only because Dask pickles it by value; putting it in a module inside the image is more robust and avoids version mismatches.

**Firewalls.** Workers connect to each other as well as to the scheduler. Open the worker port range or run all hosts in one security group.

**Mismatched images.** A worker started from an older image may accept tasks and fail them. Tag images immutably and log `pdal.__version__` in task results.

<svg viewBox="0 24 740 150" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Rollout order for a first Dask deployment" style="width:100%;max-width:740px;display:block;margin:1.6rem auto">
  <title>Roll out in small steps</title>
  <desc>Four steps: run process_tile locally on one tile; run a LocalCluster on one machine with ten tiles; connect remote workers and run one hundred tiles; run the full list. Each step must succeed before the next, catching environment problems early and cheaply.</desc>
  <defs><marker id="ro-arw" markerWidth="9" markerHeight="7" refX="9" refY="3.5" orient="auto"><path d="M0,0 L0,7 L9,3.5 z" fill="var(--dg-line)"/></marker></defs>
  <rect x="0" y="24" width="740" height="150" fill="var(--dg-bg)" rx="10"/>
  <g font-size="10.5" fill="var(--dg-text)">
    <rect x="20" y="50" width="150" height="60" rx="8" fill="var(--dg-surface)" stroke="var(--dg-line)"/><text text-anchor="middle" x="95" y="76">1 tile, no Dask</text><text text-anchor="middle" x="95" y="94">function works</text>
    <rect x="200" y="50" width="150" height="60" rx="8" fill="var(--dg-a-soft)" stroke="var(--dg-a)"/><text text-anchor="middle" x="275" y="76">LocalCluster</text><text text-anchor="middle" x="275" y="94">10 tiles</text>
    <rect x="380" y="50" width="150" height="60" rx="8" fill="var(--dg-b-soft)" stroke="var(--dg-b)"/><text text-anchor="middle" x="455" y="76">remote workers</text><text text-anchor="middle" x="455" y="94">100 tiles</text>
    <rect x="560" y="50" width="160" height="60" rx="8" fill="var(--dg-d-soft)" stroke="var(--dg-d)"/><text text-anchor="middle" x="640" y="76">full list</text><text text-anchor="middle" x="640" y="94">manifest, retries</text>
  </g>
  <g stroke="var(--dg-line)" stroke-width="1.3"><line x1="170" y1="80" x2="196" y2="80" marker-end="url(#ro-arw)"/><line x1="350" y1="80" x2="376" y2="80" marker-end="url(#ro-arw)"/><line x1="530" y1="80" x2="556" y2="80" marker-end="url(#ro-arw)"/></g>
  <text x="370" y="146" text-anchor="middle" font-size="10.5" fill="var(--dg-muted)">each step catches a different class of problem cheaply</text>
</svg>

**Dashboard exposure.** Port 8787 shows task names and logs. Keep it on a private network or behind an authenticating proxy.

## Frequently Asked Questions

**How do I start a Dask cluster across several machines?**

Run dask scheduler on one host and dask worker with the scheduler's address on each other host, all from the same container image. Clients then connect to the scheduler address.

**Where should the task function live?**

In a module installed in the image that workers use, so workers can import it by name. This avoids pickling surprises and guarantees workers run the same code as the client expects.

**How do workers read tiles from S3?**

Through GDAL's virtual file system: PDAL readers accept /vsis3/bucket/key paths and use the instance role or service account credentials available on each worker.

**What should the task return?**

A small summary such as point counts, timings and output paths. Outputs themselves should be written to storage from the worker, never returned through Dask.

## Related

- [Dask Distributed Processing for LiDAR](https://www.pythonlidar.com/batch-automation-cloud-integration/dask-distributed-processing/) — the model and tuning
- [Dask vs ProcessPoolExecutor for PDAL](https://www.pythonlidar.com/batch-automation-cloud-integration/dask-distributed-processing/dask-vs-processpoolexecutor-for-pdal/) — whether you need Dask yet
- [Tracking Tile Progress and Failures in Dask](https://www.pythonlidar.com/batch-automation-cloud-integration/dask-distributed-processing/tracking-tile-progress-and-failures-in-dask/) — manifests and reruns
- [Building a Slim PDAL Docker Image](https://www.pythonlidar.com/batch-automation-cloud-integration/pdal-docker-containers/building-a-slim-pdal-docker-image/) — the image all nodes share
- [Streaming LAZ from S3 with PDAL](https://www.pythonlidar.com/batch-automation-cloud-integration/s3-cloud-storage-io/streaming-laz-from-s3-with-pdal/) — the I/O pattern workers use
