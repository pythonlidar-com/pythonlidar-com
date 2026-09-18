---
title: "Retrying Failed Tiles in Airflow"
description: "Make per-tile LiDAR tasks in Airflow fail cleanly and retry sensibly: retries with exponential backoff, separating transient from permanent errors with AirflowFailException, clearing individual mapped instances, and rerunning only failed tiles."
slug: "retrying-failed-tiles-in-airflow"
type: "howto"
breadcrumb: "Retrying Failed Tiles"
datePublished: "2026-09-18"
dateModified: "2026-09-18"
---

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Article",
      "headline": "Retrying Failed Tiles in Airflow",
      "description": "Make per-tile LiDAR tasks in Airflow fail cleanly and retry sensibly: retries with exponential backoff, separating transient from permanent errors with AirflowFailException, clearing individual mapped instances, and rerunning only failed tiles.",
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
          "name": "Retrying Failed Tiles",
          "item": "https://www.pythonlidar.com/batch-automation-cloud-integration/airflow-dag-orchestration/retrying-failed-tiles-in-airflow/"
        }
      ]
    },
    {
      "@type": "HowTo",
      "name": "Retry failed LiDAR tile tasks in Airflow",
      "step": [
        {
          "@type": "HowToStep",
          "name": "Set retry policy on the tile task",
          "text": "retries=3, retry_delay=timedelta(minutes=2), retry_exponential_backoff=True and max_retry_delay=timedelta(minutes=30)."
        },
        {
          "@type": "HowToStep",
          "name": "Classify exceptions",
          "text": "Wrap the PDAL call; for known permanent errors raise AirflowFailException, which fails the instance immediately with no retries. Let everything else propagate normally and use the retry budget."
        },
        {
          "@type": "HowToStep",
          "name": "Skip tiles that should not be processed",
          "text": "Raise AirflowSkipException for tiles outside the project area or already complete, so they show as skipped instead of failed."
        },
        {
          "@type": "HowToStep",
          "name": "Add a failure callback",
          "text": "on_failure_callback records the tile and error in a table or sends an alert, giving a list of failed tiles without trawling logs."
        },
        {
          "@type": "HowToStep",
          "name": "Rerun only failures",
          "text": "After the fix, clear the failed mapped instances with airflow tasks clear -s ... --only-failed, or in the grid view, and let the reduce task run again."
        }
      ]
    },
    {
      "@type": "FAQPage",
      "mainEntity": [
        {
          "@type": "Question",
          "name": "How do I stop Airflow retrying a tile that will never succeed?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Raise AirflowFailException from the task. The instance is marked failed immediately and its remaining retries are not used, which suits corrupt files or tiles with no usable points."
          }
        },
        {
          "@type": "Question",
          "name": "What retry settings suit cloud LiDAR tasks?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Two to four retries with a base delay of a couple of minutes and exponential backoff capped around thirty minutes. That covers S3 throttling and node loss without stalling runs for hours."
          }
        },
        {
          "@type": "Question",
          "name": "How do I rerun only the failed tiles?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Clear the failed mapped instances, either in the grid view or with airflow tasks clear and the only-failed flag. Successful instances keep their state, and downstream tasks rerun once the cleared ones finish."
          }
        },
        {
          "@type": "Question",
          "name": "Why must tile outputs be idempotent for retries?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "A retried task may run after a partial write. If outputs are written to a temporary key and moved into place on success, or overwritten deterministically, retries cannot leave corrupt or duplicated results."
          }
        }
      ]
    }
  ]
}
</script>

**TL;DR:** Give the per-tile task `retries`, `retry_delay` and `retry_exponential_backoff=True` so throttling and spot interruptions heal themselves, but raise `AirflowFailException` for errors that will never succeed — a corrupt LAZ or a missing CRS — so they fail at once without wasting retries. Afterwards, clear only the failed mapped instances rather than rerunning the DAG, and make outputs idempotent so reruns are safe.

## Context and Motivation

This guide is part of [Airflow DAG Orchestration](https://www.pythonlidar.com/batch-automation-cloud-integration/airflow-dag-orchestration/). In a run of thousands of tiles, some tasks will fail. Most failures in cloud LiDAR processing are transient: S3 returning `SlowDown`, a worker pod evicted, a spot instance reclaimed. A few are permanent: a truncated LAZ, a tile with no ground points, a file whose header says it has a CRS it does not. Treating both kinds the same is costly either way. Too few retries and transient failures need manual attention; too many and every corrupt tile burns an hour of retries before anyone looks at it.

## Prerequisites and Assumptions

- A per-tile Airflow task, ideally dynamically mapped as in [dynamic task mapping for LiDAR tiles](https://www.pythonlidar.com/batch-automation-cloud-integration/airflow-dag-orchestration/dynamic-task-mapping-for-lidar-tiles/).
- Outputs written to deterministic keys, so a rerun overwrites rather than duplicates.
- Access to the Airflow UI or CLI to clear task instances.

## Step-by-Step Implementation

### Step 1 — Set retry policy on the tile task

`retries=3`, `retry_delay=timedelta(minutes=2)`, `retry_exponential_backoff=True` and `max_retry_delay=timedelta(minutes=30)`.

### Step 2 — Classify exceptions

Wrap the PDAL call; for known permanent errors raise `AirflowFailException`, which fails the instance immediately with no retries. Let everything else propagate normally and use the retry budget.

### Step 3 — Skip tiles that should not be processed

Raise `AirflowSkipException` for tiles outside the project area or already complete, so they show as skipped instead of failed.

### Step 4 — Add a failure callback

`on_failure_callback` records the tile and error in a table or sends an alert, giving a list of failed tiles without trawling logs.

### Step 5 — Rerun only failures

After the fix, clear the failed mapped instances with `airflow tasks clear -s ... --only-failed`, or in the grid view, and let the reduce task run again.

## Complete Working Example

```python
from __future__ import annotations

import json
from datetime import timedelta

from airflow.decorators import task
from airflow.exceptions import AirflowFailException, AirflowSkipException

PERMANENT = ("Invalid LAZ", "Unable to read", "No points", "readers.las: Invalid")


def record_failure(context):
    ti = context["ti"]
    print(json.dumps({"dag_run": context["run_id"], "task": ti.task_id,
                      "map_index": ti.map_index, "error": str(context.get("exception"))}))


@task(retries=3, retry_delay=timedelta(minutes=2), retry_exponential_backoff=True,
      max_retry_delay=timedelta(minutes=30), pool="pdal_slots",
      on_failure_callback=record_failure)
def process_tile(key: str, out_prefix: str) -> dict:
    import boto3
    import pdal

    stem = key.rsplit("/", 1)[-1].removesuffix(".laz")
    out_key = f"{out_prefix}/{stem}.tif"

    s3 = boto3.client("s3")
    if s3.list_objects_v2(Bucket="lidar-out", Prefix=out_key).get("KeyCount"):
        raise AirflowSkipException(f"{out_key} already exists")

    spec = {"pipeline": [
        f"/vsis3/lidar-in/{key}",
        {"type": "filters.smrf"},
        {"type": "filters.range", "limits": "Classification[2:2]"},
        {"type": "writers.gdal", "filename": f"/vsis3/lidar-out/{out_key}",
         "resolution": 1.0, "output_type": "idw"},
    ]}
    try:
        n = pdal.Pipeline(json.dumps(spec)).execute()
    except RuntimeError as exc:
        if any(p in str(exc) for p in PERMANENT):
            raise AirflowFailException(f"{key}: permanent error: {exc}") from exc
        raise                      # transient: let Airflow retry with backoff
    if n == 0:
        raise AirflowFailException(f"{key}: no ground points after SMRF")
    return {"tile": stem, "ground_points": n}
```

Clearing only the failed instances of one run from the CLI:

```bash
airflow tasks clear lidar_dtm_daily \
  --task-regex '^process_tile$' --only-failed \
  --start-date 2026-09-17 --end-date 2026-09-17 --yes
```

<svg viewBox="0 0 740 220" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Decision tree for how a tile task ends" style="width:100%;max-width:740px;display:block;margin:1.6rem auto">
  <title>Transient, permanent, skip</title>
  <desc>A tile task raises an error or finishes. Already done or out of scope leads to skipped. A permanent error such as a corrupt LAZ raises AirflowFailException and fails immediately. Any other error is treated as transient and retried with exponential backoff up to three times before failing.</desc>
  <defs><marker id="rt-arw" markerWidth="9" markerHeight="7" refX="9" refY="3.5" orient="auto"><path d="M0,0 L0,7 L9,3.5 z" fill="var(--dg-line)"/></marker></defs>
  <rect x="0" y="0" width="740" height="220" fill="var(--dg-bg)" rx="10"/>
  <rect x="20" y="86" width="150" height="48" rx="8" fill="var(--dg-surface)" stroke="var(--dg-line)" stroke-width="1.3"/>
  <text x="95" y="114" text-anchor="middle" font-size="11" fill="var(--dg-text)">process_tile</text>
  <rect x="250" y="20" width="200" height="44" rx="8" fill="var(--dg-surface-2)" stroke="var(--dg-line)"/>
  <text x="350" y="46" text-anchor="middle" font-size="10.5" fill="var(--dg-text)">already done / out of scope</text>
  <rect x="250" y="88" width="200" height="44" rx="8" fill="var(--dg-surface-2)" stroke="var(--dg-line)"/>
  <text x="350" y="114" text-anchor="middle" font-size="10.5" fill="var(--dg-text)">corrupt LAZ, no points</text>
  <rect x="250" y="156" width="200" height="44" rx="8" fill="var(--dg-surface-2)" stroke="var(--dg-line)"/>
  <text x="350" y="182" text-anchor="middle" font-size="10.5" fill="var(--dg-text)">throttling, eviction, spot</text>
  <rect x="540" y="20" width="180" height="44" rx="8" fill="var(--dg-a-soft)" stroke="var(--dg-a)"/>
  <text x="630" y="46" text-anchor="middle" font-size="10.5" fill="var(--dg-text)">skipped</text>
  <rect x="540" y="88" width="180" height="44" rx="8" fill="var(--dg-e-soft)" stroke="var(--dg-e)"/>
  <text x="630" y="114" text-anchor="middle" font-size="10.5" fill="var(--dg-text)">failed, no retries</text>
  <rect x="540" y="156" width="180" height="44" rx="8" fill="var(--dg-d-soft)" stroke="var(--dg-d)"/>
  <text x="630" y="182" text-anchor="middle" font-size="10.5" fill="var(--dg-text)">retry with backoff</text>
  <path d="M170 110 L210 110 L210 42 L246 42" fill="none" stroke="var(--dg-line)" stroke-width="1.3" marker-end="url(#rt-arw)"/>
  <line x1="170" y1="110" x2="246" y2="110" stroke="var(--dg-line)" stroke-width="1.3" marker-end="url(#rt-arw)"/>
  <path d="M210 110 L210 178 L246 178" fill="none" stroke="var(--dg-line)" stroke-width="1.3" marker-end="url(#rt-arw)"/>
  <line x1="450" y1="42" x2="536" y2="42" stroke="var(--dg-line)" stroke-width="1.3" marker-end="url(#rt-arw)"/>
  <line x1="450" y1="110" x2="536" y2="110" stroke="var(--dg-line)" stroke-width="1.3" marker-end="url(#rt-arw)"/>
  <line x1="450" y1="178" x2="536" y2="178" stroke="var(--dg-line)" stroke-width="1.3" marker-end="url(#rt-arw)"/>
</svg>

## Backoff Arithmetic

With `retry_delay` of two minutes and exponential backoff, the waits grow roughly as 2, 4 and 8 minutes, with jitter, capped at `max_retry_delay`. Three retries therefore span about a quarter of an hour, long enough for S3 throttling to subside or for a replacement spot node to join the cluster, and short enough that a run does not stall for hours on one tile. If failures are mostly spot interruptions, a longer first delay helps more than more retries, because capacity often returns in bursts.

<svg viewBox="0 38 740 146" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Retry timeline with exponential backoff" style="width:100%;max-width:740px;display:block;margin:1.6rem auto">
  <title>Exponential backoff timeline</title>
  <desc>A timeline from 0 to 16 minutes. The first attempt fails at 0, the second attempt runs at about 2 minutes, the third at about 6 minutes and the fourth at about 14 minutes. Gaps between attempts double each time.</desc>
  <rect x="0" y="38" width="740" height="146" fill="var(--dg-bg)" rx="10"/>
  <line x1="40" y1="100" x2="700" y2="100" stroke="var(--dg-line)" stroke-width="1.5"/>
  <g font-size="10" fill="var(--dg-muted)">
    <text x="40" y="124" text-anchor="middle">0</text>
    <text x="205" y="124" text-anchor="middle">4 min</text>
    <text x="370" y="124" text-anchor="middle">8 min</text>
    <text x="535" y="124" text-anchor="middle">12 min</text>
    <text x="700" y="124" text-anchor="middle">16 min</text>
  </g>
  <circle cx="40" cy="100" r="8" fill="var(--dg-e)"/>
  <circle cx="122" cy="100" r="8" fill="var(--dg-e)"/>
  <circle cx="287" cy="100" r="8" fill="var(--dg-e)"/>
  <circle cx="617" cy="100" r="8" fill="var(--dg-d)"/>
  <g font-size="10.5" fill="var(--dg-text)">
    <text x="40" y="76" text-anchor="middle">try 1</text>
    <text x="122" y="76" text-anchor="middle">try 2</text>
    <text x="287" y="76" text-anchor="middle">try 3</text>
    <text x="617" y="76" text-anchor="middle">try 4 succeeds</text>
  </g>
  <text x="370" y="160" text-anchor="middle" font-size="10.5" fill="var(--dg-muted)">waits of ~2, ~4, ~8 minutes, capped by max_retry_delay</text>
</svg>

## Where Retries Belong: Task or Operator

When PDAL runs inside a container launched by `KubernetesPodOperator` or an AWS Batch operator, there are two retry layers: Airflow's task retries and the platform's own (Batch job `retryStrategy`, Kubernetes pod restarts). Pick one owner per failure type. Letting both retry multiplies attempts — three Airflow retries of a Batch job with three attempts each is up to sixteen runs of a corrupt tile. A workable split is to let the platform absorb infrastructure failures such as spot reclamation, which it detects precisely through exit reasons, and let Airflow own application failures, where the exception classification above applies.

Record the attempt number in the output metadata or the failure log (`ti.try_number` inside the task). A tile that only succeeds on its third attempt, run after run, points to a resource problem — memory too tight, a slow disk — that retries are hiding rather than fixing.

## Key Parameter Table

| Setting | Typical | Effect |
|---|---|---|
| `retries` | 2–4 | Attempts after the first |
| `retry_delay` | 1–5 min | Base wait |
| `retry_exponential_backoff` | `True` | Doubles the wait each retry |
| `max_retry_delay` | 30 min | Cap on the wait |
| `AirflowFailException` | permanent errors | Fail now, skip retries |
| `AirflowSkipException` | done / out of scope | Mark skipped |
| `--only-failed` | CLI clear | Rerun failures only |

## Verification

- **Inject a corrupt file.** Put a truncated LAZ in the input list; its instance fails once, with no retries, and the callback logs it.
- **Inject throttling.** Temporarily lower S3 request limits or kill a worker mid-task; the instance retries and eventually succeeds.
- **Rerun count.** After clearing failures, only those instances run; completed tiles stay green.

## Gotchas and Edge Cases

**Idempotency is a precondition.** Retrying a task that wrote half an output and then crashed must produce a correct file, not append to a broken one. Write to a temporary key and rename it on success, or overwrite deterministically — see [making tile outputs idempotent](https://www.pythonlidar.com/batch-automation-cloud-integration/tile-indexing-and-merging/making-tile-outputs-idempotent/).

**Matching error strings is brittle.** PDAL error messages change between versions. Keep the list of permanent patterns short, and back it with a pre-check (for example `pdal info --summary` in a quick upstream task) that validates headers before the heavy work.

**Timeouts count as failures.** Set `execution_timeout` so a hung read eventually fails and retries, rather than holding a pool slot forever.

<svg viewBox="0 14 740 156" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Clearing only failed tiles in a mapped task" style="width:100%;max-width:740px;display:block;margin:1.6rem auto">
  <title>Rerun only what failed</title>
  <desc>A row of twelve mapped instances of which ten succeeded and two failed. Clearing with only-failed resets those two to none; they run again while the ten successful instances are untouched.</desc>
  <rect x="0" y="14" width="740" height="156" fill="var(--dg-bg)" rx="10"/>
  <g stroke-width="1.2">
    <rect x="40" y="40" width="44" height="44" rx="6" fill="var(--dg-d-soft)" stroke="var(--dg-d)"/>
    <rect x="96" y="40" width="44" height="44" rx="6" fill="var(--dg-d-soft)" stroke="var(--dg-d)"/>
    <rect x="152" y="40" width="44" height="44" rx="6" fill="var(--dg-e-soft)" stroke="var(--dg-e)"/>
    <rect x="208" y="40" width="44" height="44" rx="6" fill="var(--dg-d-soft)" stroke="var(--dg-d)"/>
    <rect x="264" y="40" width="44" height="44" rx="6" fill="var(--dg-d-soft)" stroke="var(--dg-d)"/>
    <rect x="320" y="40" width="44" height="44" rx="6" fill="var(--dg-d-soft)" stroke="var(--dg-d)"/>
    <rect x="376" y="40" width="44" height="44" rx="6" fill="var(--dg-d-soft)" stroke="var(--dg-d)"/>
    <rect x="432" y="40" width="44" height="44" rx="6" fill="var(--dg-d-soft)" stroke="var(--dg-d)"/>
    <rect x="488" y="40" width="44" height="44" rx="6" fill="var(--dg-e-soft)" stroke="var(--dg-e)"/>
    <rect x="544" y="40" width="44" height="44" rx="6" fill="var(--dg-d-soft)" stroke="var(--dg-d)"/>
    <rect x="600" y="40" width="44" height="44" rx="6" fill="var(--dg-d-soft)" stroke="var(--dg-d)"/>
    <rect x="656" y="40" width="44" height="44" rx="6" fill="var(--dg-d-soft)" stroke="var(--dg-d)"/>
  </g>
  <g font-size="10.5" fill="var(--dg-text)">
    <text x="174" y="66" text-anchor="middle">✗</text>
    <text x="510" y="66" text-anchor="middle">✗</text>
  </g>
  <text x="370" y="120" text-anchor="middle" font-size="11" fill="var(--dg-text)">clear --only-failed resets the two red instances</text>
  <text x="370" y="142" text-anchor="middle" font-size="10.5" fill="var(--dg-muted)">green instances keep their state and outputs</text>
</svg>

## Frequently Asked Questions

**How do I stop Airflow retrying a tile that will never succeed?**

Raise AirflowFailException from the task. The instance is marked failed immediately and its remaining retries are not used, which suits corrupt files or tiles with no usable points.

**What retry settings suit cloud LiDAR tasks?**

Two to four retries with a base delay of a couple of minutes and exponential backoff capped around thirty minutes. That covers S3 throttling and node loss without stalling runs for hours.

**How do I rerun only the failed tiles?**

Clear the failed mapped instances, either in the grid view or with airflow tasks clear and the only-failed flag. Successful instances keep their state, and downstream tasks rerun once the cleared ones finish.

**Why must tile outputs be idempotent for retries?**

A retried task may run after a partial write. If outputs are written to a temporary key and moved into place on success, or overwritten deterministically, retries cannot leave corrupt or duplicated results.

## Related

- [Airflow DAG Orchestration](https://www.pythonlidar.com/batch-automation-cloud-integration/airflow-dag-orchestration/) — Airflow for LiDAR pipelines
- [Dynamic Task Mapping for LiDAR Tiles](https://www.pythonlidar.com/batch-automation-cloud-integration/airflow-dag-orchestration/dynamic-task-mapping-for-lidar-tiles/) — the mapped task retried here
- [Making Tile Outputs Idempotent](https://www.pythonlidar.com/batch-automation-cloud-integration/tile-indexing-and-merging/making-tile-outputs-idempotent/) — safe reruns
- [Handling Spot Interruptions in PDAL Batch Jobs](https://www.pythonlidar.com/batch-automation-cloud-integration/aws-batch-processing/handling-spot-interruptions-in-pdal-batch-jobs/) — the most common transient failure
- [Tracking Tile Progress and Failures in Dask](https://www.pythonlidar.com/batch-automation-cloud-integration/dask-distributed-processing/tracking-tile-progress-and-failures-in-dask/) — the same idea in Dask
