---
title: "Tracking Tile Progress and Failures in Dask"
description: "Know exactly what happened to every tile in a Dask batch: named task keys, streaming results with as_completed, a persistent manifest that survives client restarts, classifying failures, resubmitting only failed tiles, and skipping tiles whose outputs already exist."
slug: "tracking-tile-progress-and-failures-in-dask"
type: "howto"
breadcrumb: "Tracking Progress in Dask"
datePublished: "2026-09-18"
dateModified: "2026-09-18"
---

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Article",
      "headline": "Tracking Tile Progress and Failures in Dask",
      "description": "Know exactly what happened to every tile in a Dask batch: named task keys, streaming results with as_completed, a persistent manifest that survives client restarts, classifying failures, resubmitting only failed tiles, and skipping tiles whose outputs already exist.",
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
          "name": "Tracking Progress in Dask",
          "item": "https://www.pythonlidar.com/batch-automation-cloud-integration/dask-distributed-processing/tracking-tile-progress-and-failures-in-dask/"
        }
      ]
    },
    {
      "@type": "HowTo",
      "name": "Track progress and failures of LiDAR tiles in a Dask batch",
      "step": [
        {
          "@type": "HowToStep",
          "name": "Name every task",
          "text": "client.map(..., key=[f\"tile-{stem}\" for stem in stems]) makes keys readable and maps them back to tiles trivially."
        },
        {
          "@type": "HowToStep",
          "name": "Append a line per completed tile",
          "text": "Inside the as_completed loop, write one JSON object per line with tile, status, duration and error type; flush after each write."
        },
        {
          "@type": "HowToStep",
          "name": "Reconcile on start",
          "text": "Read existing manifest lines; the latest line per tile wins. Optionally also check whether the output object exists."
        },
        {
          "@type": "HowToStep",
          "name": "Submit only what is needed",
          "text": "Tiles without a done line are submitted; others are skipped."
        },
        {
          "@type": "HowToStep",
          "name": "Summarize failures",
          "text": "Count failures by exception type and list the tiles for each, to decide between fixing data, resizing workers or simply retrying."
        }
      ]
    },
    {
      "@type": "FAQPage",
      "mainEntity": [
        {
          "@type": "Question",
          "name": "How do I resume a Dask batch after the client crashes?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Record each finished tile in a durable manifest as results arrive. On restart, read the manifest and submit only tiles not marked done; deterministic output names make reruns of interrupted tiles safe."
          }
        },
        {
          "@type": "Question",
          "name": "Why use JSON lines for the manifest?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Each record is written and flushed as one line, so a crash leaves at most one partial line and everything before it is valid. It is easy to append to, easy to read back and easy to inspect with standard tools."
          }
        },
        {
          "@type": "Question",
          "name": "How do I find out why tiles failed?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Store the exception type and a short message per failure, then group by type. A few types usually account for all failures, and each points to a specific fix: memory, corrupt input, storage timeouts or metadata problems."
          }
        },
        {
          "@type": "Question",
          "name": "Should failed tiles be retried automatically?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Once or twice, for transient problems. Tiles that fail repeatedly with the same error need investigation, not more retries."
          }
        }
      ]
    }
  ]
}
</script>

**TL;DR:** Give every task a readable key (`tile-<name>`), consume futures with `as_completed`, and append one JSON line per finished tile — success or failure with the exception type — to a manifest file on disk. On rerun, read the manifest, skip tiles already done (or whose output already exists), and submit only the rest. Group failures by exception type to tell bad tiles from bad infrastructure.

## Context and Motivation

This guide is part of [Dask Distributed Processing for LiDAR](https://www.pythonlidar.com/batch-automation-cloud-integration/dask-distributed-processing/). A batch of twenty thousand tiles will not finish cleanly on the first attempt. Some tiles are corrupt, some exceed memory, some hit a network timeout, and sometimes the client itself dies — a laptop sleeps, a CI job times out. Without a durable record, the only options are to rerun everything or to guess. The Dask dashboard shows what is happening now; a manifest shows what happened, survives the process that wrote it, and turns "rerun the failures" into a one-line filter.

<svg viewBox="0 0 740 210" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Manifest lines written as tasks complete and read back on rerun" style="width:100%;max-width:740px;display:block;margin:1.6rem auto">
  <title>A manifest that outlives the client</title>
  <desc>Tasks complete in any order and each appends one JSON line to a manifest file: tile name, status, seconds and error type. The client later crashes. On rerun, the new client reads the manifest, skips tiles already marked done, and submits only pending and failed tiles.</desc>
  <defs><marker id="mf-arw" markerWidth="9" markerHeight="7" refX="9" refY="3.5" orient="auto"><path d="M0,0 L0,7 L9,3.5 z" fill="var(--dg-line)"/></marker></defs>
  <rect x="0" y="0" width="740" height="210" fill="var(--dg-bg)" rx="10"/>
  <rect x="20" y="30" width="190" height="130" rx="8" fill="var(--dg-surface)" stroke="var(--dg-line)" stroke-width="1.2"/>
  <text x="115" y="54" text-anchor="middle" font-size="11" fill="var(--dg-text)">run 1 (client dies)</text>
  <text x="115" y="80" text-anchor="middle" font-size="10" fill="var(--dg-muted)">as_completed</text>
  <text x="115" y="100" text-anchor="middle" font-size="10" fill="var(--dg-muted)">append per tile</text>
  <rect x="260" y="30" width="220" height="130" rx="8" fill="var(--dg-a-soft)" stroke="var(--dg-a)" stroke-width="1.3"/>
  <text x="370" y="54" text-anchor="middle" font-size="11" fill="var(--dg-text)">manifest.jsonl</text>
  <text x="276" y="80" font-size="10" fill="var(--dg-text)">t_0431 done 184 s</text>
  <text x="276" y="98" font-size="10" fill="var(--dg-text)">t_0432 failed MemoryError</text>
  <text x="276" y="116" font-size="10" fill="var(--dg-text)">t_0433 done 171 s</text>
  <text x="276" y="134" font-size="10" fill="var(--dg-text)">…</text>
  <rect x="530" y="30" width="190" height="130" rx="8" fill="var(--dg-d-soft)" stroke="var(--dg-d)" stroke-width="1.3"/>
  <text x="625" y="54" text-anchor="middle" font-size="11" fill="var(--dg-text)">run 2</text>
  <text x="625" y="80" text-anchor="middle" font-size="10" fill="var(--dg-text)">skip done</text>
  <text x="625" y="100" text-anchor="middle" font-size="10" fill="var(--dg-text)">submit failed + pending</text>
  <line x1="210" y1="95" x2="256" y2="95" stroke="var(--dg-line)" stroke-width="1.3" marker-end="url(#mf-arw)"/>
  <line x1="480" y1="95" x2="526" y2="95" stroke="var(--dg-line)" stroke-width="1.3" marker-end="url(#mf-arw)"/>
  <text x="370" y="190" text-anchor="middle" font-size="10.5" fill="var(--dg-muted)">append-only JSON lines: safe to read while being written</text>
</svg>

## Prerequisites and Assumptions

- A Dask client and cluster as in [processing LiDAR tiles with Dask distributed](https://www.pythonlidar.com/batch-automation-cloud-integration/dask-distributed-processing/processing-lidar-tiles-with-dask-distributed/).
- A per-tile function with deterministic output names, so a completed tile can also be recognized by its output.
- Local or shared disk for the manifest.

## Step-by-Step Implementation

### Step 1 — Name every task

`client.map(..., key=[f"tile-{stem}" for stem in stems])` makes keys readable and maps them back to tiles trivially.

### Step 2 — Append a line per completed tile

Inside the `as_completed` loop, write one JSON object per line with tile, status, duration and error type; flush after each write.

### Step 3 — Reconcile on start

Read existing manifest lines; the latest line per tile wins. Optionally also check whether the output object exists.

### Step 4 — Submit only what is needed

Tiles without a `done` line are submitted; others are skipped.

### Step 5 — Summarize failures

Count failures by exception type and list the tiles for each, to decide between fixing data, resizing workers or simply retrying.

## Complete Working Example

```python
"""Resumable Dask batch with a JSON-lines manifest and failure summary."""
from __future__ import annotations

import collections
import json
import sys
import time
from pathlib import Path

from dask.distributed import Client, as_completed

from lidar_tasks import process_tile

MANIFEST = Path("manifest.jsonl")


def load_manifest() -> dict[str, dict]:
    state: dict[str, dict] = {}
    if MANIFEST.exists():
        for line in MANIFEST.read_text().splitlines():
            rec = json.loads(line)
            state[rec["tile"]] = rec                    # latest record wins
    return state


def record(fh, tile: str, status: str, **extra) -> None:
    fh.write(json.dumps({"tile": tile, "status": status, "ts": time.time(), **extra}) + "\n")
    fh.flush()


def run(address: str, keys: list[str]) -> None:
    state = load_manifest()
    todo = [k for k in keys if state.get(Path(k).stem, {}).get("status") != "done"]
    print(f"{len(keys) - len(todo)} already done, submitting {len(todo)}")
    if not todo:
        return
    client = Client(address)
    futures = client.map(process_tile, todo, retries=1, pure=False,
                         key=[f"tile-{Path(k).stem}" for k in todo])
    with MANIFEST.open("a") as fh:
        for i, fut in enumerate(as_completed(futures), 1):
            tile = fut.key.removeprefix("tile-")
            if fut.status == "error":
                exc = fut.exception()
                record(fh, tile, "failed", error=type(exc).__name__, message=str(exc)[:300])
            else:
                r = fut.result()
                record(fh, tile, "done", seconds=r.get("seconds"))
            if i % 100 == 0:
                print(f"{i}/{len(futures)}", flush=True)
    client.close()

    failures = [r for r in load_manifest().values() if r["status"] == "failed"]
    by_type = collections.Counter(r["error"] for r in failures)
    print("failures by type:", dict(by_type))
    for err, n in by_type.most_common():
        sample = [r["tile"] for r in failures if r["error"] == err][:5]
        print(f"  {err}: {n} tiles, e.g. {sample}")


if __name__ == "__main__":
    tile_keys = [k.strip() for k in Path("tile_list.txt").read_text().splitlines() if k.strip()]
    run(sys.argv[1], tile_keys)
```

Running the script again after a crash or after fixing a problem submits only tiles that are not yet `done`.

<svg viewBox="0 0 740 200" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Failures grouped by exception type" style="width:100%;max-width:740px;display:block;margin:1.6rem auto">
  <title>Group failures before acting</title>
  <desc>Horizontal bars counting failed tiles by exception type after a 20,000 tile batch: 61 KilledWorker from memory, 12 RuntimeError from corrupt LAZ, 7 timeouts reading from storage, and 2 invalid CRS errors. Each group calls for a different response: larger workers, re-delivery, retry, and header repair.</desc>
  <rect x="0" y="0" width="740" height="200" fill="var(--dg-bg)" rx="10"/>
  <g font-size="11" fill="var(--dg-text)"><text text-anchor="end" x="230" y="42">KilledWorker (memory)</text><text text-anchor="end" x="230" y="80">RuntimeError (corrupt LAZ)</text><text text-anchor="end" x="230" y="118">timeout (storage)</text><text text-anchor="end" x="230" y="156">invalid CRS</text></g>
  <rect x="240" y="30" width="366" height="18" fill="var(--dg-e)"/>
  <rect x="240" y="68" width="72" height="18" fill="var(--dg-c)"/>
  <rect x="240" y="106" width="42" height="18" fill="var(--dg-b)"/>
  <rect x="240" y="144" width="12" height="18" fill="var(--dg-a)"/>
  <g font-size="10.5" fill="var(--dg-muted)"><text x="614" y="44">61 → bigger workers</text><text x="320" y="82">12 → re-deliver</text><text x="290" y="120">7 → retry</text><text x="260" y="158">2 → repair header</text></g>
  <text x="240" y="188" font-size="10.5" fill="var(--dg-muted)">illustrative 20,000-tile batch</text>
</svg>

## Reporting to People, Not Just Scripts

The manifest is primarily for machines, but a batch that runs for hours has human stakeholders too. A few derived views make it useful to them. A running count of done, failed and pending tiles, written to a small status file or posted to a chat channel every few hundred tiles, answers "how far along is it?" without anyone opening the dashboard. The median and 95th-percentile task time from the `seconds` field, recomputed as the batch progresses, gives an honest estimate of the remaining time. And at the end, a one-page summary — counts, total compute time, failures by type with example tiles — is the artefact that goes into the processing report for the delivery.

Because the manifest is plain JSON lines, all of this is a few lines of pandas: `pd.read_json("manifest.jsonl", lines=True)`, keep the last record per tile, and group. Keeping these views derived from the manifest, rather than tracked separately, guarantees they agree with what actually happened.

## Key Parameter Table

| Element | Choice | Why |
|---|---|---|
| task key | `tile-<stem>` | Readable, reversible to the tile |
| manifest format | JSON lines, append-only | Crash-safe, easy to parse |
| latest-wins | per tile | Reruns overwrite earlier failures |
| `retries` | 1 | Transient errors retried before recording failure |
| failure grouping | by exception type | Distinguishes data from infrastructure |
| output check | optional existence test | Recovers state if the manifest is lost |

## Verification

- **Kill and resume.** Interrupt the client mid-batch, rerun, and confirm it submits only unfinished tiles.
- **Counts.** After completion, `done` plus `failed` equals the tile list.
- **Output agreement.** Every `done` tile has an output object; a quick listing of the output prefix confirms it.

## Gotchas and Edge Cases

**Tasks still running when the client dies.** When the client disconnects, the scheduler cancels its futures by default, so tiles in progress stop and have no manifest line; they are resubmitted on rerun. Outputs they partly wrote are overwritten thanks to deterministic names.

**Duplicate submissions.** Two clients running the same batch against the same outputs duplicate work and race on the manifest. Use a lock file or run batches from one orchestrator.

**Large messages.** Recording full tracebacks for thousands of failures bloats the manifest. Store the exception type and a short message; keep full tracebacks in worker logs.

<svg viewBox="0 0 740 170" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Tile states across two runs" style="width:100%;max-width:740px;display:block;margin:1.6rem auto">
  <title>States across runs</title>
  <desc>A row of tile states after run 1: mostly done, some failed, some pending because the client died. After run 2, the pending and failed tiles have been resubmitted; most are now done, and a small number remain failed with persistent errors that need investigation rather than further retries.</desc>
  <rect x="0" y="0" width="740" height="170" fill="var(--dg-bg)" rx="10"/>
  <text x="20" y="44" font-size="10.5" fill="var(--dg-text)">after run 1</text>
  <rect x="120" y="30" width="420" height="20" fill="var(--dg-d-soft)" stroke="var(--dg-d)"/>
  <rect x="540" y="30" width="60" height="20" fill="var(--dg-e-soft)" stroke="var(--dg-e)"/>
  <rect x="600" y="30" width="100" height="20" fill="var(--dg-surface-2)" stroke="var(--dg-line)"/>
  <text x="20" y="104" font-size="10.5" fill="var(--dg-text)">after run 2</text>
  <rect x="120" y="90" width="565" height="20" fill="var(--dg-d-soft)" stroke="var(--dg-d)"/>
  <rect x="685" y="90" width="15" height="20" fill="var(--dg-e-soft)" stroke="var(--dg-e)"/>
  <g font-size="10" fill="var(--dg-muted)"><text x="330" y="70" text-anchor="middle">done</text><text x="570" y="70" text-anchor="middle">failed</text><text x="650" y="70" text-anchor="middle">pending</text><text x="400" y="130" text-anchor="middle">done</text><text x="692" y="130" text-anchor="middle">persistent</text></g>
  <text x="120" y="158" font-size="10.5" fill="var(--dg-muted)">persistent failures need a different fix, not another retry</text>
</svg>

**Retrying persistent failures.** A tile that fails the same way twice will fail a third time. Stop retrying after one or two reruns and route those tiles to investigation.

## Frequently Asked Questions

**How do I resume a Dask batch after the client crashes?**

Record each finished tile in a durable manifest as results arrive. On restart, read the manifest and submit only tiles not marked done; deterministic output names make reruns of interrupted tiles safe.

**Why use JSON lines for the manifest?**

Each record is written and flushed as one line, so a crash leaves at most one partial line and everything before it is valid. It is easy to append to, easy to read back and easy to inspect with standard tools.

**How do I find out why tiles failed?**

Store the exception type and a short message per failure, then group by type. A few types usually account for all failures, and each points to a specific fix: memory, corrupt input, storage timeouts or metadata problems.

**Should failed tiles be retried automatically?**

Once or twice, for transient problems. Tiles that fail repeatedly with the same error need investigation, not more retries.

## Related

- [Dask Distributed Processing for LiDAR](https://www.pythonlidar.com/batch-automation-cloud-integration/dask-distributed-processing/) — the overall pattern
- [Processing LiDAR Tiles with Dask Distributed](https://www.pythonlidar.com/batch-automation-cloud-integration/dask-distributed-processing/processing-lidar-tiles-with-dask-distributed/) — the cluster this runs on
- [Making Tile Outputs Idempotent](https://www.pythonlidar.com/batch-automation-cloud-integration/tile-indexing-and-merging/making-tile-outputs-idempotent/) — why reruns are safe
- [Retrying Failed Tiles in Airflow](https://www.pythonlidar.com/batch-automation-cloud-integration/airflow-dag-orchestration/retrying-failed-tiles-in-airflow/) — the same idea in Airflow
- [Diagnosing PDAL Out-of-Memory Failures](https://www.pythonlidar.com/pdal-pipeline-architecture-execution/memory-management/diagnosing-pdal-out-of-memory-failures/) — the commonest failure type
