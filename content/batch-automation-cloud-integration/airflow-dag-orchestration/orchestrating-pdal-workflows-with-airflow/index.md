---
title: "Orchestrating PDAL Workflows with Airflow"
description: "A worked Airflow DAG that runs a PDAL LiDAR pipeline per tile with dynamic task mapping — discovering tiles from S3, classifying ground, and writing DTMs, with retries and XCom result passing."
slug: "orchestrating-pdal-workflows-with-airflow"
type: "howto"
breadcrumb: "Orchestrating PDAL with Airflow"
datePublished: "2024-07-08"
dateModified: "2026-07-12"
---

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Article",
      "headline": "Orchestrating PDAL Workflows with Airflow",
      "description": "A worked Airflow DAG that runs a PDAL LiDAR pipeline per tile with dynamic task mapping — discovering tiles from S3, classifying ground, and writing DTMs, with retries and XCom result passing.",
      "datePublished": "2024-07-08",
      "dateModified": "2026-07-12",
      "author": {"@type": "Organization", "name": "pythonlidar.com"}
    },
    {
      "@type": "BreadcrumbList",
      "itemListElement": [
        {"@type": "ListItem", "position": 1, "name": "Home", "item": "https://www.pythonlidar.com/"},
        {"@type": "ListItem", "position": 2, "name": "Batch Automation and Cloud Integration for PDAL", "item": "https://www.pythonlidar.com/batch-automation-cloud-integration/"},
        {"@type": "ListItem", "position": 3, "name": "Airflow DAG Orchestration", "item": "https://www.pythonlidar.com/batch-automation-cloud-integration/airflow-dag-orchestration/"},
        {"@type": "ListItem", "position": 4, "name": "Orchestrating PDAL with Airflow", "item": "https://www.pythonlidar.com/batch-automation-cloud-integration/airflow-dag-orchestration/orchestrating-pdal-workflows-with-airflow/"}
      ]
    },
    {
      "@type": "HowTo",
      "name": "Orchestrate a per-tile PDAL workflow with Airflow",
      "description": "Build an Airflow 2.x TaskFlow DAG that discovers LAZ tiles, classifies ground, and writes DTMs per tile with dynamic task mapping.",
      "step": [
        {"@type": "HowToStep", "position": 1, "name": "Define a discovery task", "text": "Write an @task that lists LAZ keys from an S3 prefix and returns them as a list."},
        {"@type": "HowToStep", "position": 2, "name": "Write a per-tile PDAL task", "text": "Define an @task that builds and executes a PDAL pipeline for one tile key."},
        {"@type": "HowToStep", "position": 3, "name": "Expand the task over the tile list", "text": "Call .expand(tile_key=discover()) so Airflow creates one mapped instance per tile."},
        {"@type": "HowToStep", "position": 4, "name": "Reduce and summarise", "text": "Collect the mapped return values in a final task and assert the batch is complete."},
        {"@type": "HowToStep", "position": 5, "name": "Trigger and verify", "text": "Run the DAG, then inspect the grid view, task logs, and XCom to confirm each tile produced a DTM."}
      ]
    },
    {
      "@type": "FAQPage",
      "mainEntity": [
        {
          "@type": "Question",
          "name": "How many tiles can Airflow dynamic task mapping expand to?",
          "acceptedAnswer": {"@type": "Answer", "text": "The default ceiling is 1024 mapped instances per task, set by the max_map_length configuration value. You can raise it, but very large expansions inflate the scheduler's bookkeeping; for tens of thousands of tiles, batch the tile list into groups and map over the groups instead of individual files."}
        },
        {
          "@type": "Question",
          "name": "Where do I install PDAL so the Airflow worker can import it?",
          "acceptedAnswer": {"@type": "Answer", "text": "PDAL and its Python bindings must exist in the same environment the worker executes tasks in. Install it into the worker image with conda (conda install -c conda-forge pdal python-pdal), or run the task through DockerOperator against an image that already contains PDAL so the worker itself stays thin."}
        },
        {
          "@type": "Question",
          "name": "Why is my Airflow scheduler slow after adding a PDAL DAG?",
          "acceptedAnswer": {"@type": "Answer", "text": "The scheduler re-parses every DAG file on a short interval. Any expensive code at module level — a boto3 client call, an S3 listing, or a heavy import outside a task — runs on every parse and throttles the scheduler. Move all such work inside @task functions so it only runs when a task executes."}
        }
      ]
    }
  ]
}
</script>

**TL;DR:** Define a `discover_tiles` `@task` that returns a list of S3 keys, define a `process_tile` `@task` that runs a PDAL SMRF-plus-DTM pipeline for one key, then wire them with `process_tile.expand(tile_key=discover_tiles())` — Airflow fans out one retry-protected task instance per tile and passes each result path through XCom.

## Context and Motivation

This guide is part of [Airflow DAG Orchestration](https://www.pythonlidar.com/batch-automation-cloud-integration/airflow-dag-orchestration/), which explains the design patterns; here we build one concrete DAG end to end and run it. If you have ever kicked off a `for tile in tiles: subprocess.run(...)` loop and then watched it die on tile 340 with no way to resume, this is the fix. Airflow turns that loop into a graph where every tile is an independently scheduled, independently retryable unit of work, and where a single failed tile does not discard the 339 that already succeeded.

The workload is deliberately narrow: given a prefix full of LAZ tiles in object storage, produce one 1-metre DTM GeoTIFF per tile. Each tile runs the same two-part PDAL pipeline — classify ground with SMRF, then interpolate a raster with `writers.gdal` — the same operations covered in depth by [SMRF Ground Classification](https://www.pythonlidar.com/ground-filtering-dtm-dsm-generation/smrf-ground-classification/) and [DTM Raster Generation](https://www.pythonlidar.com/ground-filtering-dtm-dsm-generation/dtm-raster-generation/). What Airflow adds is the scheduling, retry, and result-tracking scaffolding around that pipeline.

<svg viewBox="0 0 720 250" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="TaskFlow DAG expanding a single process_tile task into mapped per-tile instances" style="width:100%;max-width:720px;display:block;margin:1.5rem auto">
  <title>Dynamic task mapping expands one process_tile task over a discovered tile list</title>
  <desc>On the left a discover_tiles task returns a list of three tile keys via XCom. An arrow labelled expand points to three separate process_tile instances stacked vertically, each running an SMRF and writers.gdal pipeline, and each returning a DTM path. The three converge into a single summarise task on the right.</desc>
  <defs>
    <marker id="ot-arr" markerWidth="8" markerHeight="8" refX="7" refY="3" orient="auto">
      <path d="M0,0 L0,6 L8,3 z" fill="currentColor" opacity="0.6"/>
    </marker>
  </defs>
  <!-- discover -->
  <rect x="12" y="98" width="120" height="54" rx="6" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.8"/>
  <text x="72" y="121" text-anchor="middle" font-size="11" fill="currentColor" font-family="monospace">discover_tiles</text>
  <text x="72" y="138" text-anchor="middle" font-size="9" fill="currentColor" opacity="0.6">returns [k0,k1,k2]</text>
  <!-- three mapped instances -->
  <rect x="290" y="20" width="180" height="46" rx="6" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.8"/>
  <text x="380" y="40" text-anchor="middle" font-size="10" fill="currentColor" font-family="monospace">process_tile[0]</text>
  <text x="380" y="56" text-anchor="middle" font-size="9" fill="currentColor" opacity="0.6">smrf + writers.gdal</text>
  <rect x="290" y="102" width="180" height="46" rx="6" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.8"/>
  <text x="380" y="122" text-anchor="middle" font-size="10" fill="currentColor" font-family="monospace">process_tile[1]</text>
  <text x="380" y="138" text-anchor="middle" font-size="9" fill="currentColor" opacity="0.6">smrf + writers.gdal</text>
  <rect x="290" y="184" width="180" height="46" rx="6" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.8"/>
  <text x="380" y="204" text-anchor="middle" font-size="10" fill="currentColor" font-family="monospace">process_tile[2]</text>
  <text x="380" y="220" text-anchor="middle" font-size="9" fill="currentColor" opacity="0.6">smrf + writers.gdal</text>
  <!-- summarise -->
  <rect x="580" y="98" width="120" height="54" rx="6" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.8"/>
  <text x="640" y="121" text-anchor="middle" font-size="11" fill="currentColor" font-family="monospace">summarise</text>
  <text x="640" y="138" text-anchor="middle" font-size="9" fill="currentColor" opacity="0.6">reduce paths</text>
  <!-- expand arrows -->
  <line x1="132" y1="118" x2="286" y2="45" stroke="currentColor" stroke-width="1.5" opacity="0.55" marker-end="url(#ot-arr)"/>
  <line x1="132" y1="125" x2="286" y2="125" stroke="currentColor" stroke-width="1.5" opacity="0.55" marker-end="url(#ot-arr)"/>
  <line x1="132" y1="132" x2="286" y2="205" stroke="currentColor" stroke-width="1.5" opacity="0.55" marker-end="url(#ot-arr)"/>
  <!-- reduce arrows -->
  <line x1="470" y1="45" x2="576" y2="118" stroke="currentColor" stroke-width="1.5" opacity="0.55" marker-end="url(#ot-arr)"/>
  <line x1="470" y1="125" x2="576" y2="125" stroke="currentColor" stroke-width="1.5" opacity="0.55" marker-end="url(#ot-arr)"/>
  <line x1="470" y1="205" x2="576" y2="132" stroke="currentColor" stroke-width="1.5" opacity="0.55" marker-end="url(#ot-arr)"/>
  <text x="205" y="80" text-anchor="middle" font-size="10" fill="currentColor" opacity="0.55" font-style="italic">.expand()</text>
</svg>

## Prerequisites and Assumptions

| Requirement | Detail |
|---|---|
| Airflow | 2.4+ (TaskFlow API and stable `.expand`) |
| PDAL | 2.5+ with Python bindings on the worker |
| Executor | `LocalExecutor` minimum; `CeleryExecutor` for real parallelism |
| Storage | S3 bucket with a raw LAZ prefix and a writable DTM prefix |
| Connection | `boto3` credentials available to the worker (IAM role or `aws_default`) |
| Input | LAZ tiles already cut to a grid; CRS embedded or known |

This walkthrough assumes tiles are in `EPSG:26918` (NAD83 / UTM 18N) — a common US survey CRS distinct from the WGS84 UTM codes used elsewhere. Adjust the `spatialreference` value to match your data.

## Step-by-Step Implementation

### Step 1 — Discover the tiles

The discovery task lists LAZ keys and returns them as a list. That return value is what mapping iterates over, so it must be a genuine `list`.

```python
@task
def discover_tiles(bucket: str, prefix: str) -> list[str]:
    import boto3
    s3 = boto3.client("s3")
    pages = s3.get_paginator("list_objects_v2").paginate(Bucket=bucket, Prefix=prefix)
    keys = [o["Key"] for p in pages for o in p.get("Contents", [])
            if o["Key"].endswith(".laz")]
    if not keys:
        raise ValueError(f"no tiles under s3://{bucket}/{prefix}")
    return keys
```

Note the `import boto3` *inside* the function. Keeping heavy imports out of module scope is what stops the scheduler from paying that cost on every DAG parse.

### Step 2 — Process one tile with PDAL

This task is written for a single tile. Dynamic mapping will call it once per key; the function itself never loops.

```python
@task(pool="pdal_pool", retries=3)
def process_tile(tile_key: str, bucket: str, out_prefix: str) -> dict:
    import json, posixpath, pdal
    name = posixpath.basename(tile_key).replace(".laz", ".tif")
    out_key = f"{out_prefix}{name}"
    pipe = {"pipeline": [
        {"type": "readers.las",
         "filename": f"/vsis3/{bucket}/{tile_key}",
         "spatialreference": "EPSG:26918"},
        {"type": "filters.smrf", "slope": 0.2, "window": 16.0, "threshold": 0.45},
        {"type": "filters.range", "limits": "Classification[2:2]"},
        {"type": "writers.gdal",
         "filename": f"/vsis3/{bucket}/{out_key}",
         "resolution": 1.0, "output_type": "idw", "nodata": -9999},
    ]}
    count = pdal.Pipeline(json.dumps(pipe)).execute()
    if count == 0:
        raise RuntimeError(f"{name}: no ground points classified")
    return {"tile": tile_key, "raster": out_key, "ground_points": count}
```

### Step 3 — Expand over the tile list

Mapping is one line. `.expand()` binds the mapped argument; constant arguments use `.partial()`.

```python
tiles = discover_tiles(BUCKET, RAW_PREFIX)
results = process_tile.partial(bucket=BUCKET, out_prefix=DTM_PREFIX).expand(tile_key=tiles)
```

Airflow reads the `tiles` list at runtime and creates `process_tile[0]`, `process_tile[1]`, … one per key. Each is scheduled, retried, and logged on its own.

### Step 4 — Reduce the results

A plain (non-mapped) task receives the full list of mapped return values. It only runs once every mapped instance succeeds, making it the natural place for batch-level assertions.

```python
@task
def summarise(results: list[dict]) -> dict:
    total = sum(r["ground_points"] for r in results)
    return {"tiles": len(results), "ground_points": total}
```

### Step 5 — Trigger and watch it run

Unpause the DAG in the UI (or `airflow dags trigger pdal_tile_walkthrough`), then open the grid view. Each mapped square is one tile; hover to see its state, click to read its log and XCom. A green `summarise` means the whole batch is done.

## Complete Working Example

Save as `dags/pdal_tile_walkthrough.py`. It is self-contained and runnable against any S3 prefix of LAZ tiles.

```python
"""pdal_tile_walkthrough.py — a per-tile PDAL DTM workflow in Airflow 2.x."""
from __future__ import annotations

import json
import posixpath
from datetime import datetime, timedelta

from airflow.decorators import dag, task

BUCKET = "lidar-demo"
RAW_PREFIX = "survey-a/raw/"
DTM_PREFIX = "survey-a/dtm/"

default_args = {"retries": 3, "retry_delay": timedelta(minutes=3),
                "execution_timeout": timedelta(minutes=30)}


@dag(dag_id="pdal_tile_walkthrough", start_date=datetime(2024, 7, 1),
     schedule=None, catchup=False, default_args=default_args,
     max_active_tasks=8, tags=["pdal", "dtm"])
def pdal_tile_walkthrough():

    @task
    def discover_tiles(bucket: str, prefix: str) -> list[str]:
        import boto3
        s3 = boto3.client("s3")
        pages = s3.get_paginator("list_objects_v2").paginate(
            Bucket=bucket, Prefix=prefix)
        keys = [o["Key"] for p in pages for o in p.get("Contents", [])
                if o["Key"].endswith(".laz")]
        if not keys:
            raise ValueError(f"no tiles under s3://{bucket}/{prefix}")
        return keys

    @task(pool="pdal_pool")
    def process_tile(tile_key: str, bucket: str, out_prefix: str) -> dict:
        import pdal
        name = posixpath.basename(tile_key).replace(".laz", ".tif")
        out_key = f"{out_prefix}{name}"
        pipe = {"pipeline": [
            {"type": "readers.las",
             "filename": f"/vsis3/{bucket}/{tile_key}",
             "spatialreference": "EPSG:26918"},
            {"type": "filters.smrf", "slope": 0.2,
             "window": 16.0, "threshold": 0.45},
            {"type": "filters.range", "limits": "Classification[2:2]"},
            {"type": "writers.gdal",
             "filename": f"/vsis3/{bucket}/{out_key}",
             "resolution": 1.0, "output_type": "idw", "nodata": -9999},
        ]}
        count = pdal.Pipeline(json.dumps(pipe)).execute()
        if count == 0:
            raise RuntimeError(f"{name}: no ground points classified")
        return {"tile": tile_key, "raster": out_key, "ground_points": count}

    @task
    def summarise(results: list[dict]) -> dict:
        total = sum(r["ground_points"] for r in results)
        empty = [r["tile"] for r in results if r["ground_points"] == 0]
        if empty:
            raise ValueError(f"empty tiles: {empty}")
        print(f"{len(results)} DTMs, {total:,} ground points")
        return {"tiles": len(results), "ground_points": total}

    tiles = discover_tiles(BUCKET, RAW_PREFIX)
    results = process_tile.partial(
        bucket=BUCKET, out_prefix=DTM_PREFIX).expand(tile_key=tiles)
    summarise(results)


dag = pdal_tile_walkthrough()
```

## Key Parameter Table

| Parameter | Where | Value | Purpose |
|---|---|---|---|
| `schedule` | `@dag` | `None` | Manual trigger; no automatic interval |
| `max_active_tasks` | `@dag` | 8 | Ceiling on concurrent mapped instances in a run |
| `pool` | `@task` | `pdal_pool` | Caps RAM-heavy PDAL tasks regardless of tile count |
| `retries` | default_args | 3 | Re-attempt a failed tile before giving up |
| `retry_delay` | default_args | 3 min | Pause before retrying a transient failure |
| `execution_timeout` | default_args | 30 min | Kill a hung tile and free its slot |
| `.partial(...)` | mapping | constants | Arguments shared by every mapped instance |
| `.expand(tile_key=...)` | mapping | the list | Argument that varies per mapped instance |
| `output_type` | `writers.gdal` | `idw` | Interpolation used to fill the DTM grid |

## Verification

After the run, confirm three things. First, the **grid view**: every `process_tile` square should be green, and the count of squares should equal the number of LAZ tiles in the prefix. Second, the **XCom** of `summarise` should report a `tiles` count matching that number and a plausible `ground_points` total. Third, list the output prefix to confirm one GeoTIFF per tile:

```bash
aws s3 ls s3://lidar-demo/survey-a/dtm/ | grep -c '\.tif$'
```

Spot-check one raster's validity with `pdal info` on its source, or open it in QGIS and confirm the elevation range is sane for the terrain. A DTM whose values are all `-9999` means every cell was nodata — usually a sign the SMRF stage classified nothing, which the `count == 0` guard should already have caught as a task failure.

## Gotchas and Edge Cases

**1. Mapping over a non-list collapses the fan-out.**
`.expand()` needs a real `list`. If `discover_tiles` returns a generator, a `dict`, or a single string, Airflow either errors or produces one oddly-shaped instance. Always materialise the keys with a list comprehension, as the example does, and raise on empty results so an empty prefix fails loudly instead of expanding to zero instances.

**2. The worker must actually have PDAL.**
A DAG that parses fine can still fail every task with `ModuleNotFoundError: No module named 'pdal'` because the *scheduler* parsed it but the *worker* lacks the library. PDAL, GDAL, and PROJ must live in the worker's environment. If your workers are heterogeneous, run the pipeline through [PDAL Docker Containers](https://www.pythonlidar.com/batch-automation-cloud-integration/pdal-docker-containers/) via `DockerOperator` so the runtime travels with the task instead of depending on each host.

**3. Top-level code throttles the scheduler.**
Anything outside a task body runs on every DAG parse. A `boto3.client("s3").list_objects_v2(...)` at module scope will hammer S3 and slow the scheduler for every DAG in the deployment. Keep the module body to declarations; push all I/O and heavy imports inside `@task` functions. This is the single most common performance mistake when porting a script to Airflow.

**4. Mapped instance count has a ceiling.**
Dynamic mapping is capped at `max_map_length` (default 1024). A national dataset with 40,000 tiles will hit that wall. Batch the tile list into groups of, say, 200 and map `process_batch` over the groups, looping the tiles inside each task — trading some per-tile granularity for a mapping count Airflow can track comfortably. The same fan-out logic then scales through [AWS Batch Processing](https://www.pythonlidar.com/batch-automation-cloud-integration/aws-batch-processing/) when the compute exceeds one cluster.

## Frequently Asked Questions

**How many tiles can Airflow dynamic task mapping expand to?**

The default ceiling is 1024 mapped instances per task, set by the `max_map_length` configuration value. You can raise it, but very large expansions inflate the scheduler's bookkeeping; for tens of thousands of tiles, batch the tile list into groups and map over the groups instead of individual files.

**Where do I install PDAL so the Airflow worker can import it?**

PDAL and its Python bindings must exist in the same environment the worker executes tasks in. Install it into the worker image with conda (`conda install -c conda-forge pdal python-pdal`), or run the task through `DockerOperator` against an image that already contains PDAL so the worker itself stays thin.

**Why is my Airflow scheduler slow after adding a PDAL DAG?**

The scheduler re-parses every DAG file on a short interval. Any expensive code at module level — a `boto3` client call, an S3 listing, or a heavy import outside a task — runs on every parse and throttles the scheduler. Move all such work inside `@task` functions so it only runs when a task executes.

**Can I add a reprojection or validation step to each tile?**

Yes. Insert extra PDAL stages into the `pipeline` list inside `process_tile` — for example a `filters.reprojection` before `writers.gdal`, following the [PDAL stage chaining](https://www.pythonlidar.com/pdal-pipeline-architecture-execution/pdal-stage-chaining/) order. Everything stays within one task, so the mapping and retry behaviour is unchanged.

**How do I re-run only the tiles that failed?**

In the grid view, select the failed `process_tile` instances and clear them; Airflow re-queues just those instances while leaving the successful ones untouched. That selective replay is the core reason to orchestrate with Airflow rather than a shell loop.

---

## Related

- [Airflow DAG Orchestration](https://www.pythonlidar.com/batch-automation-cloud-integration/airflow-dag-orchestration/) — parent guide to modelling PDAL workflows as DAGs
- [Batch Automation and Cloud Integration for PDAL](https://www.pythonlidar.com/batch-automation-cloud-integration/) — running PDAL beyond a single workstation
- [SMRF Ground Classification](https://www.pythonlidar.com/ground-filtering-dtm-dsm-generation/smrf-ground-classification/) — the classification stage each tile runs
- [DTM Raster Generation](https://www.pythonlidar.com/ground-filtering-dtm-dsm-generation/dtm-raster-generation/) — the `writers.gdal` step that produces each DTM
- [PDAL Docker Containers](https://www.pythonlidar.com/batch-automation-cloud-integration/pdal-docker-containers/) — package PDAL so any worker can run the task
