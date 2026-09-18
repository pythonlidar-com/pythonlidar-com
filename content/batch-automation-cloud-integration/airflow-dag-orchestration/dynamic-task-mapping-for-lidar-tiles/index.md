---
title: "Dynamic Task Mapping for LiDAR Tiles"
description: "Fan out one Airflow task per LiDAR tile with dynamic task mapping: list tiles at run time, expand a PDAL task over them with .partial() and .expand(), limit concurrency with pools and max_active_tis_per_dag, and reduce the results into a manifest."
slug: "dynamic-task-mapping-for-lidar-tiles"
type: "howto"
breadcrumb: "Dynamic Task Mapping"
datePublished: "2026-09-18"
dateModified: "2026-09-18"
---

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Article",
      "headline": "Dynamic Task Mapping for LiDAR Tiles",
      "description": "Fan out one Airflow task per LiDAR tile with dynamic task mapping: list tiles at run time, expand a PDAL task over them with .partial() and .expand(), limit concurrency with pools and max_active_tis_per_dag, and reduce the results into a manifest.",
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
          "name": "Airflow DAG Orchestration",
          "item": "https://www.pythonlidar.com/batch-automation-cloud-integration/airflow-dag-orchestration/"
        },
        {
          "@type": "ListItem",
          "position": 4,
          "name": "Dynamic Task Mapping",
          "item": "https://www.pythonlidar.com/batch-automation-cloud-integration/airflow-dag-orchestration/dynamic-task-mapping-for-lidar-tiles/"
        }
      ]
    },
    {
      "@type": "HowTo",
      "name": "Fan out Airflow tasks per LiDAR tile with dynamic task mapping",
      "step": [
        {
          "@type": "HowToStep",
          "name": "List tiles in a task",
          "text": "A @task returns a list of tile keys, for example from an S3 prefix or a tile index filtered to new deliveries."
        },
        {
          "@type": "HowToStep",
          "name": "Define the per-tile task",
          "text": "A @task taking one key runs the PDAL pipeline and returns a small dict."
        },
        {
          "@type": "HowToStep",
          "name": "Expand",
          "text": "process_tile.partial(out_prefix=...).expand(key=list_tiles()) \u2014 partial fixes shared arguments, expand maps over the list."
        },
        {
          "@type": "HowToStep",
          "name": "Limit concurrency",
          "text": "Assign the task to a pool sized to the worker capacity, and set max_active_tis_per_dag on the mapped task so one run cannot occupy every slot."
        },
        {
          "@type": "HowToStep",
          "name": "Reduce",
          "text": "A downstream @task receiving the mapped output as a list writes the manifest; set trigger_rule=\"all_done\" so it runs even if some tiles failed."
        }
      ]
    },
    {
      "@type": "FAQPage",
      "mainEntity": [
        {
          "@type": "Question",
          "name": "What is dynamic task mapping in Airflow?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "A feature, introduced in Airflow 2.3, that creates one task instance per element of a list produced at run time. For LiDAR, the list is the set of tiles to process, so each tile becomes its own task with retries and logs."
          }
        },
        {
          "@type": "Question",
          "name": "How do I limit how many tiles process at once?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Put the mapped task in an Airflow pool sized to your worker capacity, and set max_active_tis_per_dag on the task. Instances beyond the limit wait in the scheduled state."
          }
        },
        {
          "@type": "Question",
          "name": "What if I have more tiles than the maximum map length?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Raise max_map_length in the core configuration, or group tiles into batches and map over the batches. Grouping also reduces load on the scheduler and metadata database."
          }
        },
        {
          "@type": "Question",
          "name": "Can the reduce task run if some tiles fail?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Yes. Set its trigger rule to all_done. Failed mapped instances contribute no value to the collected results, so the reduce task sees only successful outputs."
          }
        }
      ]
    }
  ]
}
</script>

**TL;DR:** In Airflow 2.3+ (and Airflow 3), a `@task` that returns the list of tile keys can feed `process_tile.partial(out_prefix=...).expand(key=tiles)`, which creates one mapped task instance per tile at run time. Cap parallelism with a pool or `max_active_tis_per_dag`, and add a downstream `@task` that receives the list of mapped results to write a manifest.

## Context and Motivation

This guide is part of [Airflow DAG Orchestration](https://www.pythonlidar.com/batch-automation-cloud-integration/airflow-dag-orchestration/). Before dynamic task mapping, fanning out over LiDAR tiles in Airflow meant either generating a DAG with thousands of static tasks — slow to parse and impossible to change without redeploying — or hiding the loop inside a single task, which threw away Airflow's per-task retries, logs and visibility. Dynamic mapping solves both: the DAG stays small, the tile list is decided when the run starts, and each tile still becomes a first-class task instance with its own state, retries and log.

It is the natural shape for recurring LiDAR processing: a nightly run that picks up newly delivered tiles, or an on-demand run over a project's tile index.

<svg viewBox="0 0 740 220" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="A list task expanding into mapped per-tile tasks and a reduce task" style="width:100%;max-width:740px;display:block;margin:1.6rem auto">
  <title>List, expand, reduce</title>
  <desc>A task named list_tiles returns tile keys at run time. The process_tile task expands into one mapped instance per key, shown as a column of small boxes with indices 0, 1, 2 through n. A write_manifest task receives the list of all mapped results after they finish.</desc>
  <defs><marker id="dm-arw" markerWidth="9" markerHeight="7" refX="9" refY="3.5" orient="auto"><path d="M0,0 L0,7 L9,3.5 z" fill="var(--dg-line)"/></marker></defs>
  <rect x="0" y="0" width="740" height="220" fill="var(--dg-bg)" rx="10"/>
  <rect x="20" y="86" width="150" height="48" rx="8" fill="var(--dg-surface)" stroke="var(--dg-line)" stroke-width="1.3"/>
  <text x="95" y="114" text-anchor="middle" font-size="11" fill="var(--dg-text)">list_tiles()</text>
  <g font-size="10.5" fill="var(--dg-text)">
    <rect x="260" y="20" width="200" height="34" rx="6" fill="var(--dg-a-soft)" stroke="var(--dg-a)"/><text text-anchor="middle" x="360" y="42">process_tile [0]</text>
    <rect x="260" y="62" width="200" height="34" rx="6" fill="var(--dg-a-soft)" stroke="var(--dg-a)"/><text text-anchor="middle" x="360" y="84">process_tile [1]</text>
    <rect x="260" y="104" width="200" height="34" rx="6" fill="var(--dg-a-soft)" stroke="var(--dg-a)"/><text text-anchor="middle" x="360" y="126">process_tile [2]</text>
    <rect x="260" y="166" width="200" height="34" rx="6" fill="var(--dg-a-soft)" stroke="var(--dg-a)"/><text text-anchor="middle" x="360" y="188">process_tile [n]</text>
    <rect x="560" y="86" width="160" height="48" rx="8" fill="var(--dg-d-soft)" stroke="var(--dg-d)"/><text text-anchor="middle" x="640" y="114">write_manifest()</text>
  </g>
  <text x="360" y="156" text-anchor="middle" font-size="12" fill="var(--dg-muted)">⋮</text>
  <path d="M170 110 L215 110 L215 37 L256 37" fill="none" stroke="var(--dg-line)" stroke-width="1.3" marker-end="url(#dm-arw)"/>
  <path d="M215 110 L215 183 L256 183" fill="none" stroke="var(--dg-line)" stroke-width="1.3" marker-end="url(#dm-arw)"/>
  <line x1="215" y1="79" x2="256" y2="79" stroke="var(--dg-line)" stroke-width="1.3" marker-end="url(#dm-arw)"/>
  <line x1="215" y1="121" x2="256" y2="121" stroke="var(--dg-line)" stroke-width="1.3" marker-end="url(#dm-arw)"/>
  <path d="M460 37 L510 37 L510 104 L556 104" fill="none" stroke="var(--dg-line)" stroke-width="1.3" marker-end="url(#dm-arw)"/>
  <path d="M460 183 L510 183 L510 116 L556 116" fill="none" stroke="var(--dg-line)" stroke-width="1.3" marker-end="url(#dm-arw)"/>
</svg>

## Prerequisites and Assumptions

- Airflow 2.3 or newer (dynamic task mapping), including Airflow 3.x.
- Workers — Celery, Kubernetes executor or a container-running operator — with PDAL available, or tasks that launch PDAL in containers.
- Tiles in object storage and an index or listing to enumerate them.

## Step-by-Step Implementation

### Step 1 — List tiles in a task

A `@task` returns a list of tile keys, for example from an S3 prefix or a tile index filtered to new deliveries.

### Step 2 — Define the per-tile task

A `@task` taking one key runs the PDAL pipeline and returns a small dict.

### Step 3 — Expand

`process_tile.partial(out_prefix=...).expand(key=list_tiles())` — `partial` fixes shared arguments, `expand` maps over the list.

### Step 4 — Limit concurrency

Assign the task to a pool sized to the worker capacity, and set `max_active_tis_per_dag` on the mapped task so one run cannot occupy every slot.

### Step 5 — Reduce

A downstream `@task` receiving the mapped output as a list writes the manifest; set `trigger_rule="all_done"` so it runs even if some tiles failed.

## Complete Working Example

```python
"""Airflow DAG: one mapped task per LiDAR tile, with a manifest at the end."""
from __future__ import annotations

import json
from datetime import datetime

import boto3
from airflow.decorators import dag, task
from airflow.utils.trigger_rule import TriggerRule

BUCKET_IN, BUCKET_OUT = "lidar-in", "lidar-out"


@dag(schedule="@daily", start_date=datetime(2026, 1, 1), catchup=False,
     max_active_runs=1, tags=["lidar"])
def lidar_dtm_daily():

    @task
    def list_tiles(prefix: str = "deliveries/2026/") -> list[str]:
        s3 = boto3.client("s3")
        keys = []
        for page in s3.get_paginator("list_objects_v2").paginate(Bucket=BUCKET_IN, Prefix=prefix):
            keys += [o["Key"] for o in page.get("Contents", []) if o["Key"].endswith(".laz")]
        return sorted(keys)

    @task(pool="pdal_slots", max_active_tis_per_dag=64, retries=2)
    def process_tile(key: str, out_prefix: str) -> dict:
        import pdal
        stem = key.rsplit("/", 1)[-1].removesuffix(".laz")
        spec = {"pipeline": [
            f"/vsis3/{BUCKET_IN}/{key}",
            {"type": "filters.range", "limits": "Classification![7:7],Classification![18:18]"},
            {"type": "filters.smrf", "slope": 0.15, "window": 18, "threshold": 0.5},
            {"type": "filters.range", "limits": "Classification[2:2]"},
            {"type": "writers.gdal", "filename": f"/vsis3/{BUCKET_OUT}/{out_prefix}/{stem}.tif",
             "resolution": 1.0, "output_type": "idw", "window_size": 6, "data_type": "float32"},
        ]}
        n = pdal.Pipeline(json.dumps(spec)).execute()
        return {"tile": stem, "ground_points": n}

    @task(trigger_rule=TriggerRule.ALL_DONE)
    def write_manifest(results: list[dict | None]) -> int:
        done = [r for r in results if r]
        boto3.client("s3").put_object(Bucket=BUCKET_OUT, Key="dtm/manifest.json",
                                      Body=json.dumps(done).encode())
        return len(done)

    results = process_tile.partial(out_prefix="dtm").expand(key=list_tiles())
    write_manifest(results)


lidar_dtm_daily()
```

Failed mapped instances contribute nothing to `results`, so the manifest lists successes only; failures are visible per instance in the grid view and can be cleared and retried individually, as described in [retrying failed tiles in Airflow](https://www.pythonlidar.com/batch-automation-cloud-integration/airflow-dag-orchestration/retrying-failed-tiles-in-airflow/).

<svg viewBox="0 24 740 182" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Concurrency limited by a pool and per-task cap" style="width:100%;max-width:740px;display:block;margin:1.6rem auto">
  <title>Two limits on fan-out</title>
  <desc>A queue of 2,000 mapped tile tasks feeds into a pool of 64 slots matching worker capacity. At most 64 tile tasks run at any time; the rest wait as scheduled. The max_active_tis_per_dag setting on the task prevents one DAG run from taking slots other DAGs need.</desc>
  <rect x="0" y="24" width="740" height="182" fill="var(--dg-bg)" rx="10"/>
  <rect x="20" y="50" width="220" height="100" rx="10" fill="var(--dg-surface-2)" stroke="var(--dg-line)" stroke-width="1.3"/>
  <text x="130" y="94" text-anchor="middle" font-size="11" fill="var(--dg-text)">2,000 mapped tasks</text>
  <text x="130" y="114" text-anchor="middle" font-size="10" fill="var(--dg-muted)">scheduled, waiting</text>
  <path d="M240 100 L300 100" stroke="var(--dg-line)" stroke-width="1.6"/>
  <path d="M300 60 L380 80 L380 120 L300 140 Z" fill="var(--dg-a-soft)" stroke="var(--dg-a)" stroke-width="1.3"/>
  <text x="340" y="104" text-anchor="middle" font-size="10" fill="var(--dg-text)">pool</text>
  <rect x="420" y="50" width="300" height="100" rx="10" fill="var(--dg-d-soft)" stroke="var(--dg-d)" stroke-width="1.3"/>
  <text x="570" y="94" text-anchor="middle" font-size="11" fill="var(--dg-text)">≤ 64 running</text>
  <text x="570" y="114" text-anchor="middle" font-size="10" fill="var(--dg-muted)">pdal_slots = worker capacity</text>
  <path d="M380 100 L416 100" stroke="var(--dg-line)" stroke-width="1.6"/>
  <text x="370" y="182" text-anchor="middle" font-size="10.5" fill="var(--dg-muted)">max_active_tis_per_dag keeps one run from taking every slot</text>
</svg>

## Mapping Over Several Arguments

Sometimes each tile needs more than its key — a per-tile CRS override, a buffer geometry, or an output name that does not derive from the input. Two options exist. `expand_kwargs` maps over a list of dicts, so `list_tiles` can return `[{"key": ..., "epsg": ...}, ...]` and each instance receives its own keyword arguments. Alternatively, `expand` over several lists produces the cross product, which is almost never what you want for tiles — mapping `key` and `epsg` separately would pair every tile with every EPSG code. For tile work, build explicit records upstream and use `expand_kwargs`.

Keep the records small and serialisable. Put shapes and large per-tile metadata in object storage or a tile index, and pass only an identifier through XCom; the mapped task can then fetch what it needs at run time. This also keeps the rendered DAG grid readable, because each instance's map index can be labelled with the tile name through the `map_index_template` option in Airflow 2.9 and later.

## Key Parameter Table

| Setting | Where | Typical | Purpose |
|---|---|---|---|
| `.partial(...)` | mapped task | shared args | Fixed across instances |
| `.expand(key=...)` | mapped task | list from upstream | One instance per element |
| `pool` | task | `pdal_slots` | Limit by worker capacity |
| `max_active_tis_per_dag` | task | 32–128 | Cap per DAG across runs |
| `max_map_length` | airflow.cfg `[core]` | default 1024 | Raise for large tile lists |
| `trigger_rule` | reduce task | `all_done` | Run even if some tiles fail |

## Verification

- **Mapped count.** The grid view shows as many mapped instances as tiles listed; compare with the listing size.
- **Manifest vs outputs.** Manifest entries match the objects under the output prefix.
- **Concurrency.** During a run, running instances never exceed the pool size.

## Gotchas and Edge Cases

**`max_map_length`.** Airflow limits how many instances a single expand may create (1024 by default). Statewide tile lists exceed it; raise the setting, or batch tiles into groups and map over groups.

**Large XCom payloads.** The tile list and every mapped result pass through XCom, stored in the metadata database by default. Keep results tiny, and for very large lists store the list in object storage and pass its key.

**Scheduler load.** Tens of thousands of mapped instances per run stress the scheduler and database. Grouping tiles — for example 10 per task — keeps instance counts manageable while retaining useful granularity.

<svg viewBox="0 0 740 170" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Mapping over single tiles versus groups of tiles" style="width:100%;max-width:740px;display:block;margin:1.6rem auto">
  <title>Group tiles when lists are huge</title>
  <desc>Two options for 20,000 tiles. Mapping one instance per tile creates 20,000 task instances, heavy for the scheduler and above the default map length. Mapping over groups of 10 creates 2,000 instances, each processing ten tiles sequentially with its own summary, retaining per-group retries and visibility.</desc>
  <rect x="0" y="0" width="740" height="170" fill="var(--dg-bg)" rx="10"/>
  <rect x="20" y="30" width="330" height="100" rx="10" fill="var(--dg-e-soft)" stroke="var(--dg-e)" stroke-width="1.3"/>
  <text x="185" y="62" text-anchor="middle" font-size="11.5" font-weight="600" fill="var(--dg-text)">1 tile per instance</text>
  <text x="185" y="88" text-anchor="middle" font-size="10.5" fill="var(--dg-text)">20,000 instances</text>
  <text x="185" y="108" text-anchor="middle" font-size="10.5" fill="var(--dg-text)">over max_map_length, heavy DB</text>
  <rect x="390" y="30" width="330" height="100" rx="10" fill="var(--dg-d-soft)" stroke="var(--dg-d)" stroke-width="1.3"/>
  <text x="555" y="62" text-anchor="middle" font-size="11.5" font-weight="600" fill="var(--dg-text)">10 tiles per instance</text>
  <text x="555" y="88" text-anchor="middle" font-size="10.5" fill="var(--dg-text)">2,000 instances</text>
  <text x="555" y="108" text-anchor="middle" font-size="10.5" fill="var(--dg-text)">manageable, still retryable</text>
  <text x="370" y="156" text-anchor="middle" font-size="10.5" fill="var(--dg-muted)">pick the group size that keeps instances in the low thousands</text>
</svg>

**Heavy PDAL in Airflow workers.** Running PDAL directly in Celery workers ties Airflow's workers to PDAL's dependencies. `KubernetesPodOperator` or AWS Batch operators, mapped the same way, keep Airflow light and PDAL in its own image.

## Frequently Asked Questions

**What is dynamic task mapping in Airflow?**

A feature, introduced in Airflow 2.3, that creates one task instance per element of a list produced at run time. For LiDAR, the list is the set of tiles to process, so each tile becomes its own task with retries and logs.

**How do I limit how many tiles process at once?**

Put the mapped task in an Airflow pool sized to your worker capacity, and set max_active_tis_per_dag on the task. Instances beyond the limit wait in the scheduled state.

**What if I have more tiles than the maximum map length?**

Raise max_map_length in the core configuration, or group tiles into batches and map over the batches. Grouping also reduces load on the scheduler and metadata database.

**Can the reduce task run if some tiles fail?**

Yes. Set its trigger rule to all_done. Failed mapped instances contribute no value to the collected results, so the reduce task sees only successful outputs.

## Related

- [Airflow DAG Orchestration](https://www.pythonlidar.com/batch-automation-cloud-integration/airflow-dag-orchestration/) — Airflow for LiDAR pipelines
- [Orchestrating PDAL Workflows with Airflow](https://www.pythonlidar.com/batch-automation-cloud-integration/airflow-dag-orchestration/orchestrating-pdal-workflows-with-airflow/) — the base DAG
- [Retrying Failed Tiles in Airflow](https://www.pythonlidar.com/batch-automation-cloud-integration/airflow-dag-orchestration/retrying-failed-tiles-in-airflow/) — handling failed instances
- [Array Jobs for LiDAR Tiles in AWS Batch](https://www.pythonlidar.com/batch-automation-cloud-integration/aws-batch-processing/array-jobs-for-lidar-tiles-in-aws-batch/) — fan-out inside AWS Batch
- [Building a Tile Index with pdal tindex](https://www.pythonlidar.com/batch-automation-cloud-integration/tile-indexing-and-merging/building-a-tile-index-with-pdal-tindex/) — where tile lists come from
