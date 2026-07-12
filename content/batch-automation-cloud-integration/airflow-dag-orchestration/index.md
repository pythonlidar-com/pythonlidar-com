---
title: "Airflow DAG Orchestration for PDAL Workflows"
description: "Orchestrating multi-stage LiDAR processing with Apache Airflow — modelling tile discovery, ground classification, DTM rasterization, and QC as a DAG, using dynamic task mapping, operators, and retries."
slug: "airflow-dag-orchestration"
type: "cluster"
breadcrumb: "Airflow DAG Orchestration"
datePublished: "2024-07-08"
dateModified: "2026-07-12"
---

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Article",
      "headline": "Airflow DAG Orchestration for PDAL Workflows",
      "description": "Orchestrating multi-stage LiDAR processing with Apache Airflow — modelling tile discovery, ground classification, DTM rasterization, and QC as a DAG, using dynamic task mapping, operators, and retries.",
      "datePublished": "2024-07-08",
      "dateModified": "2026-07-12",
      "author": {"@type": "Organization", "name": "pythonlidar.com"}
    },
    {
      "@type": "BreadcrumbList",
      "itemListElement": [
        {"@type": "ListItem", "position": 1, "name": "Home", "item": "https://pythonlidar.com/"},
        {"@type": "ListItem", "position": 2, "name": "Batch Automation and Cloud Integration for PDAL", "item": "https://pythonlidar.com/batch-automation-cloud-integration/"},
        {"@type": "ListItem", "position": 3, "name": "Airflow DAG Orchestration", "item": "https://pythonlidar.com/batch-automation-cloud-integration/airflow-dag-orchestration/"}
      ]
    },
    {
      "@type": "HowTo",
      "name": "Model a PDAL LiDAR pipeline as an Airflow DAG",
      "step": [
        {"@type": "HowToStep", "name": "Discover tiles as a task", "text": "Write a task that lists LAZ tiles from an S3 prefix and returns the keys as an XCom list."},
        {"@type": "HowToStep", "name": "Expand classification over the tile list", "text": "Use dynamic task mapping (.expand) so one classify task instance runs per discovered tile."},
        {"@type": "HowToStep", "name": "Chain rasterization downstream", "text": "Map a DTM rasterization task over the classified outputs, preserving per-tile parallelism."},
        {"@type": "HowToStep", "name": "Reduce with a validation task", "text": "Collect the mapped results into a single QC task that asserts point counts and raster coverage."},
        {"@type": "HowToStep", "name": "Publish and record the run", "text": "Move validated rasters to the delivery prefix and emit run metadata for downstream consumers."}
      ]
    },
    {
      "@type": "FAQPage",
      "mainEntity": [
        {
          "@type": "Question",
          "name": "What is the difference between an Airflow DAG and a PDAL pipeline?",
          "acceptedAnswer": {"@type": "Answer", "text": "A PDAL pipeline is a single in-process sequence of readers, filters, and writers that transforms one point cloud buffer. An Airflow DAG is a scheduling graph whose nodes are whole units of work — often each node executes a complete PDAL pipeline against one tile. Airflow decides when and where each task runs, handles retries and parallelism, and passes small references between tasks; PDAL moves the actual points inside a task."}
        },
        {
          "@type": "Question",
          "name": "How does dynamic task mapping work for per-tile LiDAR processing?",
          "acceptedAnswer": {"@type": "Answer", "text": "Dynamic task mapping expands a single task definition into N runtime instances, one per element of an upstream list. A discover_tiles task returns a list of S3 keys, and calling .expand(tile=discover_tiles()) on the classify task creates one mapped instance per key. Airflow schedules those instances in parallel up to the pool and executor limits, so adding tiles never requires editing the DAG."}
        },
        {
          "@type": "Question",
          "name": "Should PDAL run inside the Airflow worker or in a separate container?",
          "acceptedAnswer": {"@type": "Answer", "text": "For small clusters where every worker has PDAL and PROJ installed, PythonOperator or the TaskFlow API runs the pipeline directly in the worker. For heterogeneous or serverless environments, DockerOperator or AwsBatchOperator delegates the work to a container image that pins the PDAL version, which keeps workers thin and makes the runtime reproducible across the fleet."}
        },
        {
          "@type": "Question",
          "name": "Why must Airflow tasks that run PDAL be idempotent?",
          "acceptedAnswer": {"@type": "Answer", "text": "Airflow retries failed tasks and allows manual re-runs of any date, so a task may execute more than once for the same tile. Writing outputs to a deterministic key derived from the tile name and run id, and overwriting rather than appending, guarantees that a retry produces the same result instead of duplicating points or corrupting a partially written raster."}
        }
      ]
    }
  ]
}
</script>

A regional LiDAR delivery is not one job — it is thousands of small jobs that must run in a dependable order, recover from transient failures, and report their status without a human watching the terminal. When you process a county-scale acquisition tile by tile, you need something to decide which tiles are ready, launch classification and rasterization for each of them, wait for every result, and only then declare the batch complete. Apache Airflow is the scheduler that owns those decisions. This guide shows how to express a PDAL LiDAR workflow as an Airflow directed acyclic graph, so that discovery, ground classification, DTM rasterization, and quality control become named tasks with explicit dependencies rather than a fragile shell script. It sits under [Batch Automation and Cloud Integration for PDAL](/batch-automation-cloud-integration/), the broader guide to running point cloud pipelines beyond a single workstation.

<svg viewBox="0 0 780 300" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Airflow DAG for a per-tile PDAL LiDAR workflow with dynamic task mapping" style="width:100%;max-width:780px;display:block;margin:1.5rem auto">
  <title>PDAL LiDAR workflow modelled as an Airflow DAG</title>
  <desc>A left-to-right DAG. A single discover_tiles task returns a list of tiles. That fans out into a mapped classify_ground task and then a mapped rasterize_dtm task, each drawn as a stack of three instances to indicate dynamic task mapping. The mapped branch reduces into a single validate task, which connects to a final publish task. Labels note that XCom carries the tile list and that mapped instances run in parallel.</desc>
  <defs>
    <marker id="af-arr" markerWidth="8" markerHeight="8" refX="7" refY="3" orient="auto">
      <path d="M0,0 L0,6 L8,3 z" fill="currentColor" opacity="0.6"/>
    </marker>
  </defs>
  <!-- discover -->
  <rect x="12" y="120" width="120" height="56" rx="6" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.75"/>
  <text x="72" y="144" text-anchor="middle" font-size="11" fill="currentColor" font-family="monospace">discover_tiles</text>
  <text x="72" y="161" text-anchor="middle" font-size="9" fill="currentColor" opacity="0.6">list S3 keys</text>
  <!-- classify mapped stack -->
  <rect x="214" y="104" width="132" height="52" rx="6" fill="none" stroke="currentColor" stroke-width="1" opacity="0.35"/>
  <rect x="208" y="112" width="132" height="52" rx="6" fill="none" stroke="currentColor" stroke-width="1" opacity="0.5"/>
  <rect x="202" y="120" width="132" height="52" rx="6" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.8"/>
  <text x="268" y="144" text-anchor="middle" font-size="11" fill="currentColor" font-family="monospace">classify_ground</text>
  <text x="268" y="161" text-anchor="middle" font-size="9" fill="currentColor" opacity="0.6">filters.smrf</text>
  <!-- rasterize mapped stack -->
  <rect x="428" y="104" width="132" height="52" rx="6" fill="none" stroke="currentColor" stroke-width="1" opacity="0.35"/>
  <rect x="422" y="112" width="132" height="52" rx="6" fill="none" stroke="currentColor" stroke-width="1" opacity="0.5"/>
  <rect x="416" y="120" width="132" height="52" rx="6" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.8"/>
  <text x="482" y="144" text-anchor="middle" font-size="11" fill="currentColor" font-family="monospace">rasterize_dtm</text>
  <text x="482" y="161" text-anchor="middle" font-size="9" fill="currentColor" opacity="0.6">writers.gdal</text>
  <!-- validate -->
  <rect x="600" y="60" width="120" height="52" rx="6" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.75"/>
  <text x="660" y="82" text-anchor="middle" font-size="11" fill="currentColor" font-family="monospace">validate</text>
  <text x="660" y="99" text-anchor="middle" font-size="9" fill="currentColor" opacity="0.6">QC reduce</text>
  <!-- publish -->
  <rect x="600" y="184" width="120" height="52" rx="6" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.75"/>
  <text x="660" y="206" text-anchor="middle" font-size="11" fill="currentColor" font-family="monospace">publish</text>
  <text x="660" y="223" text-anchor="middle" font-size="9" fill="currentColor" opacity="0.6">deliver prefix</text>
  <!-- arrows -->
  <line x1="132" y1="146" x2="198" y2="146" stroke="currentColor" stroke-width="1.5" opacity="0.6" marker-end="url(#af-arr)"/>
  <line x1="334" y1="146" x2="412" y2="146" stroke="currentColor" stroke-width="1.5" opacity="0.6" marker-end="url(#af-arr)"/>
  <line x1="548" y1="140" x2="596" y2="94" stroke="currentColor" stroke-width="1.5" opacity="0.6" marker-end="url(#af-arr)"/>
  <line x1="660" y1="112" x2="660" y2="180" stroke="currentColor" stroke-width="1.5" opacity="0.6" marker-end="url(#af-arr)"/>
  <!-- annotations -->
  <text x="165" y="112" text-anchor="middle" font-size="9" fill="currentColor" opacity="0.55" font-style="italic">XCom: tile list</text>
  <text x="268" y="205" text-anchor="middle" font-size="9" fill="currentColor" opacity="0.55">.expand() — one instance per tile, run in parallel</text>
  <text x="482" y="205" text-anchor="middle" font-size="9" fill="currentColor" opacity="0.55">mapped downstream</text>
</svg>

## Prerequisites

Have these in place before wiring a PDAL workflow into Airflow:

- **Apache Airflow 2.4 or later** — dynamic task mapping (`.expand`) and the TaskFlow API are only stable from 2.3+; 2.4 adds mapped-task UI improvements you will want.
- **A configured executor** — `LocalExecutor` for a single node, or `CeleryExecutor` / `KubernetesExecutor` for a fleet. The executor determines how many mapped instances run at once.
- **PDAL 2.5+ reachable from the workers** — either installed in the worker image (`conda install -c conda-forge pdal python-pdal`) or available as a container image for `DockerOperator`.
- **Object storage credentials** — an Airflow connection (for example `aws_default`) with read access to the raw tile prefix and write access to the delivery prefix.
- **A tiling scheme** — inputs already split into manageable LAZ tiles (typically 1 km squares). Airflow orchestrates tiles; it does not split them.
- **Familiarity with the underlying pipeline** — the per-tile work reuses the same [PDAL Pipeline Architecture & Execution](/pdal-pipeline-architecture-execution/) model of readers, filters, and writers.

## Core Workflow Architecture

Airflow gives you a small vocabulary — DAG, task, operator, scheduler, XCom — and the whole design problem is mapping your LiDAR stages onto it. A **DAG** is the graph definition: a Python module that declares tasks and their dependencies. A **task** is a single node; at runtime it becomes a *task instance* tied to a logical date. An **operator** is the template a task uses to do work — `PythonOperator` runs a callable, `DockerOperator` runs an image, `AwsBatchOperator` submits a job. The **scheduler** walks the graph, decides which task instances are runnable, and hands them to the executor. **XCom** is the lightweight cross-task message store used to pass small values — a list of tile keys, an output path, a point count — never the point clouds themselves.

The lifecycle of a per-tile LiDAR run maps cleanly onto five stages:

1. **Discover** — a task lists LAZ tiles under an input prefix and returns their keys. This is the fan-out source; its return value becomes the list every mapped task iterates over.
2. **Classify** — one dynamically mapped task per tile runs a [SMRF Ground Classification](/ground-filtering-dtm-dsm-generation/smrf-ground-classification/) pipeline, writing a classified LAZ back to a working prefix and returning that key via XCom.
3. **Rasterize** — a second mapped task consumes each classified tile and produces a DTM GeoTIFF using the [DTM Raster Generation](/ground-filtering-dtm-dsm-generation/dtm-raster-generation/) approach with `writers.gdal`.
4. **Validate** — a single reduce task collects every mapped result, asserts point-count and coverage invariants, and fails the run loudly if any tile is empty or missing.
5. **Publish** — a final task promotes validated rasters to the delivery prefix and records run metadata so downstream consumers know the batch is complete.

The shape is a fan-out/fan-in: one discover task, a mapped middle that scales with tile count, and a reduce that waits for all of them. Because each mapped instance is independent, this is embarrassingly parallel work — the same property exploited by [Parallel Execution](/pdal-pipeline-architecture-execution/parallel-execution/) inside a single machine, lifted to the scheduler level so it spans many workers.

## Full Implementation

The DAG below is a complete, runnable Airflow 2.x module. It mixes the TaskFlow API (`@task`) for Python-native steps with dynamic task mapping over the discovered tiles. Drop it in your `dags/` folder; it reads tiles from S3, classifies ground, writes a DTM per tile, validates, and publishes.

```python
"""pdal_tile_dag.py — orchestrate a per-tile PDAL LiDAR workflow in Airflow 2.x."""
from __future__ import annotations

import json
import logging
import posixpath
from datetime import datetime, timedelta

import boto3
import pdal
from airflow.decorators import dag, task

log = logging.getLogger(__name__)

RAW_BUCKET = "lidar-acquisitions"
RAW_PREFIX = "county-2024/raw/"
WORK_PREFIX = "county-2024/classified/"
DELIVER_PREFIX = "county-2024/dtm/"
SRS = "EPSG:6347"  # NAD83(2011) / UTM 18N

default_args = {
    "owner": "lidar-ops",
    "retries": 3,
    "retry_delay": timedelta(minutes=5),
    "retry_exponential_backoff": True,
    "execution_timeout": timedelta(minutes=45),
}


def _s3():
    return boto3.client("s3")


@dag(
    dag_id="pdal_tile_dtm",
    start_date=datetime(2024, 7, 1),
    schedule=None,           # trigger manually or from a sensor
    catchup=False,
    default_args=default_args,
    max_active_tasks=16,     # cap concurrent mapped instances
    tags=["pdal", "lidar", "dtm"],
)
def pdal_tile_dtm():

    @task
    def discover_tiles() -> list[str]:
        """List LAZ tiles under the raw prefix and return their S3 keys."""
        paginator = _s3().get_paginator("list_objects_v2")
        keys: list[str] = []
        for page in paginator.paginate(Bucket=RAW_BUCKET, Prefix=RAW_PREFIX):
            keys += [o["Key"] for o in page.get("Contents", [])
                     if o["Key"].lower().endswith(".laz")]
        if not keys:
            raise ValueError(f"No LAZ tiles under s3://{RAW_BUCKET}/{RAW_PREFIX}")
        log.info("Discovered %d tiles", len(keys))
        return keys

    @task(pool="pdal_pool")
    def classify_ground(tile_key: str) -> str:
        """Run an SMRF ground-classification pipeline for one tile."""
        name = posixpath.basename(tile_key)
        out_key = f"{WORK_PREFIX}{name}"
        pipeline = {
            "pipeline": [
                {"type": "readers.las",
                 "filename": f"/vsis3/{RAW_BUCKET}/{tile_key}",
                 "spatialreference": SRS},
                {"type": "filters.smrf", "slope": 0.15,
                 "window": 18.0, "threshold": 0.5, "scalar": 1.2},
                {"type": "filters.range", "limits": "Classification[2:2]"},
                {"type": "writers.las",
                 "filename": f"/vsis3/{RAW_BUCKET}/{out_key}",
                 "forward": "all", "compression": "laszip"},
            ]
        }
        count = pdal.Pipeline(json.dumps(pipeline)).execute()
        if count == 0:
            raise RuntimeError(f"{name}: SMRF produced 0 ground points")
        log.info("%s: %d ground points -> %s", name, count, out_key)
        return out_key

    @task(pool="pdal_pool")
    def rasterize_dtm(classified_key: str) -> dict:
        """Interpolate a DTM GeoTIFF from classified ground points."""
        name = posixpath.basename(classified_key).replace(".laz", ".tif")
        out_key = f"{DELIVER_PREFIX}{name}"
        pipeline = {
            "pipeline": [
                {"type": "readers.las",
                 "filename": f"/vsis3/{RAW_BUCKET}/{classified_key}"},
                {"type": "writers.gdal",
                 "filename": f"/vsis3/{RAW_BUCKET}/{out_key}",
                 "resolution": 1.0, "output_type": "idw",
                 "gdaldriver": "GTiff", "data_type": "float32",
                 "nodata": -9999},
            ]
        }
        count = pdal.Pipeline(json.dumps(pipeline)).execute()
        return {"raster": out_key, "points": count}

    @task
    def validate(results: list[dict]) -> dict:
        """Reduce mapped results; fail the run if any tile is degenerate."""
        empties = [r["raster"] for r in results if r["points"] == 0]
        if empties:
            raise ValueError(f"{len(empties)} empty DTM tiles: {empties[:5]}")
        total = sum(r["points"] for r in results)
        log.info("Validated %d rasters, %d ground points", len(results), total)
        return {"tiles": len(results), "points": total}

    @task
    def publish(summary: dict) -> None:
        """Record a manifest marking the batch complete."""
        body = json.dumps({"completed_at": datetime.utcnow().isoformat(),
                           **summary}).encode()
        _s3().put_object(Bucket=RAW_BUCKET,
                         Key=f"{DELIVER_PREFIX}_MANIFEST.json", Body=body)
        log.info("Published manifest: %s", summary)

    tiles = discover_tiles()
    classified = classify_ground.expand(tile_key=tiles)
    rastered = rasterize_dtm.expand(classified_key=classified)
    publish(validate(rastered))


dag = pdal_tile_dtm()
```

## Code Breakdown

### Discovery and the fan-out source

`discover_tiles` returns a plain Python list, which is the entire trick behind dynamic mapping. When you later call `classify_ground.expand(tile_key=tiles)`, Airflow reads that returned list at runtime and materialises one mapped task instance per element. The list lives in XCom, so keep it to keys and paths — a few kilobytes of strings — not point data. Raising `ValueError` on an empty prefix turns a silent no-op batch into an explicit, retryable failure.

### Mapped classification with a pool

`classify_ground` carries `pool="pdal_pool"`. A pool caps how many PDAL-heavy instances run at once regardless of how many tiles exist, which protects worker memory when a thousand tiles fan out simultaneously. The task returns `out_key` — again just a string — so the next mapped task can consume it. Reading directly from S3 via GDAL's `/vsis3/` virtual filesystem avoids staging every tile to local disk, complementing the streaming approach in [S3 Cloud Storage I/O](/batch-automation-cloud-integration/s3-cloud-storage-io/).

### Chained mapping: rasterize over classified

`rasterize_dtm.expand(classified_key=classified)` maps a second task over the *output* of the first mapped task. Airflow preserves the per-tile relationship, so mapped instance 7 of the rasterizer consumes mapped instance 7 of the classifier. Returning a dict (`{"raster", "points"}`) lets the downstream reduce inspect richer results without a second lookup.

### Reduce and idempotent publish

`validate` receives the *full list* of mapped return values — that is the fan-in. It is an ordinary (non-mapped) task, so it only runs after every mapped instance finishes. `publish` writes a manifest to a deterministic key; re-running overwrites it rather than appending, which is exactly the idempotency Airflow needs when a task retries.

### Choosing the operator

The example runs PDAL inside the worker via `@task`. Swap the body for `DockerOperator` when you want to pin a PDAL image, or `AwsBatchOperator` to offload heavy tiles to a managed compute fleet described in [AWS Batch Processing](/batch-automation-cloud-integration/aws-batch-processing/):

| Operator | Where PDAL runs | Best for | Trade-off |
|---|---|---|---|
| `PythonOperator` / `@task` | inside the Airflow worker | small clusters, uniform worker image | worker must carry PDAL + PROJ |
| `DockerOperator` | a container on the worker host | reproducible pinned PDAL version | Docker socket access; image pulls |
| `KubernetesPodOperator` | an ephemeral pod | elastic scaling on k8s | pod startup latency per tile |
| `AwsBatchOperator` | AWS Batch job queue | very large heterogeneous batches | Batch queue setup; job round-trip |

## Parameter Reference Table

| Setting | Scope | Typical value | Effect |
|---|---|---|---|
| `schedule` | DAG | `None`, `"@daily"`, cron | When the scheduler triggers a run; `None` means manual/sensor-driven |
| `catchup` | DAG | `False` | Whether to backfill missed intervals — almost always `False` for LiDAR batches |
| `max_active_tasks` | DAG | 8–32 | Ceiling on concurrent task instances within one DAG run |
| `max_active_runs` | DAG | 1 | How many DAG runs execute at once; keep at 1 to avoid prefix collisions |
| `pool` | task | `pdal_pool` | Named concurrency slot shared across tasks to cap RAM-heavy work |
| `retries` | task | 3 | Automatic re-attempts on failure |
| `retry_delay` | task | 5 min | Wait before a retry; pair with `retry_exponential_backoff` |
| `execution_timeout` | task | 45 min | Kill a task that hangs, freeing the slot for others |
| `sla` | task | 2 h | Emits a miss callback if a task is not done in time (does not kill it) |
| `.expand(arg=...)` | task | — | Turns one task into N mapped instances over the list argument |
| `max_map_length` | Airflow config | 1024 default | Hard ceiling on mapped instances per task |

## Validation and Integrity Checks

Airflow's own signals are your first validation layer. The grid and graph views show each mapped instance's state; a green reduce task means every tile finished. Inspect a task instance's **log** to see the PDAL point count printed by the callable, and inspect its **XCom** tab to confirm the returned key or dict is what downstream tasks expect.

Beyond the UI, keep the correctness checks inside the tasks so a bad tile fails fast rather than propagating a silent void into the delivery:

```python
# inside rasterize_dtm, before returning
import numpy as np
arr = pdal.Pipeline(json.dumps({"pipeline": [
    f"/vsis3/{RAW_BUCKET}/{classified_key}"]}))
arr.execute()
z = arr.arrays[0]["Z"]
if np.ptp(z) < 0.01:
    raise RuntimeError(f"{classified_key}: flat/degenerate ground surface")
```

The `validate` reduce task is where cross-tile invariants belong: assert that the number of output rasters equals the number of discovered tiles, that no raster reported zero points, and that the summed ground count is within a sane band for the acquisition. Failing the run here — rather than publishing — is what stops a partial batch from being mistaken for a complete one.

## Performance Tuning

Throughput in an Airflow-orchestrated PDAL workflow is governed by concurrency limits, not by any single pipeline's speed. Three knobs interact:

- **Executor parallelism.** `LocalExecutor` runs `parallelism` tasks in one process pool; `CeleryExecutor` and `KubernetesExecutor` spread instances across workers or pods. If tiles queue but nothing runs, the executor's global `parallelism` is the ceiling.
- **Pools.** A `pdal_pool` with, say, 8 slots means at most 8 SMRF or `writers.gdal` tasks run concurrently even if 500 tiles are mapped. Size the pool to `(worker_RAM / peak_pipeline_RAM)` so a fan-out never triggers the OOM killer. Peak per-tile memory scales the same way it does for [Memory Management](/pdal-pipeline-architecture-execution/memory-management/) inside a standalone pipeline.
- **`max_active_tasks` per DAG.** Caps concurrency for one run so a single large batch cannot starve other DAGs sharing the same worker pool.

Representative timings for a 400-tile county batch (1 km tiles, ~40 M points each) illustrate how the pool dominates:

| Executor | `pdal_pool` slots | Workers | Wall time | Notes |
|---|---|---|---|---|
| LocalExecutor | 4 | 1 (16 cores) | 3 h 10 m | CPU-bound; SMRF parallelises within each task |
| CeleryExecutor | 12 | 3 (16 cores) | 1 h 05 m | Near-linear scaling with worker count |
| KubernetesExecutor | 40 | elastic pods | 34 m | Pod startup adds ~15 s per tile |

Two rules follow. First, prefer more small mapped instances over few large ones — Airflow schedules at task granularity, so finer tiles give the scheduler more to parallelise and smoother retries. Second, keep top-level DAG code cheap: the scheduler parses every DAG file on a short interval, so a `boto3` call or a directory walk at module scope (outside a task) will throttle the whole scheduler.

## Common Errors and Troubleshooting

**Mapped tasks stuck in `queued` and never running**
Root cause: no free slots. Either the executor's global `parallelism`, the DAG's `max_active_tasks`, or the task's `pool` is fully consumed. Fix: raise the relevant limit, or accept the throttle — queued is not an error, it is backpressure. Confirm which limit binds by checking Admin → Pools and the scheduler logs.

**`XCom value too large` / database bloat**
Root cause: returning point arrays or large blobs from a task, which Airflow serialises into the metadata database. Fix: return only S3 keys and small dicts; write the actual data to object storage and pass its path. The default XCom backend is not a data channel.

**`ValueError: Received an unexpected number of mapped instances` or empty expansion**
Root cause: the upstream `discover_tiles` returned an empty list, or returned something that is not a list. Fix: raise explicitly on empty discovery (as the example does) and ensure the mapped-over value is a genuine `list`, not a generator — generators are not re-iterable across mapping.

**Tasks run but write to the wrong day / duplicate outputs**
Root cause: non-idempotent output keys, or `catchup=True` backfilling historical dates. Fix: derive output keys deterministically from the tile name (not from wall-clock time), overwrite rather than append, and set `catchup=False` unless you truly want backfills.

**Scheduler slow, DAG "latest heartbeat" lagging**
Root cause: expensive top-level code — network calls, imports of heavy libraries, or globbing storage at module scope. Fix: move all I/O inside `@task` functions; keep the DAG file to declarations. Also watch timezone: `start_date` should be timezone-aware (`pendulum`/UTC) so schedule intervals do not shift unexpectedly.

## Frequently Asked Questions

**What is the difference between an Airflow DAG and a PDAL pipeline?**

A PDAL pipeline is a single in-process sequence of readers, filters, and writers that transforms one point cloud buffer. An Airflow DAG is a scheduling graph whose nodes are whole units of work — often each node executes a complete PDAL pipeline against one tile. Airflow decides when and where each task runs, handles retries and parallelism, and passes small references between tasks; PDAL moves the actual points inside a task. The two compose: the DAG orchestrates, the [PDAL pipeline](/pdal-pipeline-architecture-execution/) processes.

**How does dynamic task mapping work for per-tile LiDAR processing?**

Dynamic task mapping expands a single task definition into N runtime instances, one per element of an upstream list. A `discover_tiles` task returns a list of S3 keys, and calling `.expand(tile=discover_tiles())` on the classify task creates one mapped instance per key. Airflow schedules those instances in parallel up to the pool and executor limits, so adding tiles never requires editing the DAG.

**Should PDAL run inside the Airflow worker or in a separate container?**

For small clusters where every worker has PDAL and PROJ installed, `PythonOperator` or the TaskFlow API runs the pipeline directly in the worker. For heterogeneous or serverless environments, `DockerOperator` or `AwsBatchOperator` delegates the work to a container image that pins the PDAL version, which keeps workers thin and makes the runtime reproducible across the fleet. See [PDAL Docker Containers](/batch-automation-cloud-integration/pdal-docker-containers/) for building that image.

**Why must Airflow tasks that run PDAL be idempotent?**

Airflow retries failed tasks and allows manual re-runs of any date, so a task may execute more than once for the same tile. Writing outputs to a deterministic key derived from the tile name, and overwriting rather than appending, guarantees that a retry produces the same result instead of duplicating points or corrupting a partially written raster.

**Can one DAG process multiple acquisitions at once?**

Yes, but prefer parameterised runs. Trigger the same DAG with a run config that sets the prefix, and keep `max_active_runs=1` per acquisition so two runs never write to the same delivery prefix. For a fully worked single-acquisition version, see [Orchestrating PDAL Workflows with Airflow](/batch-automation-cloud-integration/airflow-dag-orchestration/orchestrating-pdal-workflows-with-airflow/).

---

## Related

- [Batch Automation and Cloud Integration for PDAL](/batch-automation-cloud-integration/) — parent overview of running PDAL beyond a single workstation
- [Orchestrating PDAL Workflows with Airflow](/batch-automation-cloud-integration/airflow-dag-orchestration/orchestrating-pdal-workflows-with-airflow/) — a complete worked DAG with the TaskFlow API and dynamic mapping
- [AWS Batch Processing](/batch-automation-cloud-integration/aws-batch-processing/) — offload heavy mapped tasks to a managed compute fleet
- [PDAL Docker Containers](/batch-automation-cloud-integration/pdal-docker-containers/) — pin a reproducible PDAL image for DockerOperator and Batch
- [S3 Cloud Storage I/O](/batch-automation-cloud-integration/s3-cloud-storage-io/) — read and write LAZ and COGs directly from object storage
- [SMRF Ground Classification](/ground-filtering-dtm-dsm-generation/smrf-ground-classification/) — the classification stage each mapped task runs
- [DTM Raster Generation](/ground-filtering-dtm-dsm-generation/dtm-raster-generation/) — the `writers.gdal` rasterization the DAG parallelises
