---
title: "Array Jobs for LiDAR Tiles in AWS Batch"
description: "Process thousands of LiDAR tiles with one AWS Batch array job: write a tile manifest, map AWS_BATCH_JOB_ARRAY_INDEX to a tile inside the container, size vCPU and memory per child, and chain array jobs with N_TO_N dependencies."
slug: "array-jobs-for-lidar-tiles-in-aws-batch"
type: "howto"
breadcrumb: "Array Jobs for Tiles"
datePublished: "2026-09-18"
dateModified: "2026-09-18"
---

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Article",
      "headline": "Array Jobs for LiDAR Tiles in AWS Batch",
      "description": "Process thousands of LiDAR tiles with one AWS Batch array job: write a tile manifest, map AWS_BATCH_JOB_ARRAY_INDEX to a tile inside the container, size vCPU and memory per child, and chain array jobs with N_TO_N dependencies.",
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
          "name": "AWS Batch Processing",
          "item": "https://www.pythonlidar.com/batch-automation-cloud-integration/aws-batch-processing/"
        },
        {
          "@type": "ListItem",
          "position": 4,
          "name": "Array Jobs for Tiles",
          "item": "https://www.pythonlidar.com/batch-automation-cloud-integration/aws-batch-processing/array-jobs-for-lidar-tiles-in-aws-batch/"
        }
      ]
    },
    {
      "@type": "HowTo",
      "name": "Process LiDAR tiles with AWS Batch array jobs",
      "step": [
        {
          "@type": "HowToStep",
          "name": "Write the manifest",
          "text": "One tile key per line, sorted, uploaded next to the run's outputs so every run records exactly what it processed."
        },
        {
          "@type": "HowToStep",
          "name": "Write the entrypoint",
          "text": "The container script reads AWS_BATCH_JOB_ARRAY_INDEX and MANIFEST_URI, fetches the manifest, and processes line index."
        },
        {
          "@type": "HowToStep",
          "name": "Size the child job",
          "text": "Set vcpus and memory from a measured tile: PDAL memory scales with points per tile, so measure the largest tile rather than the average."
        },
        {
          "@type": "HowToStep",
          "name": "Submit the array job",
          "text": "submit_job with arrayProperties={\"size\": n} and a retryStrategy that retries on host termination."
        },
        {
          "@type": "HowToStep",
          "name": "Chain stages with N_TO_N",
          "text": "A second array job of the same size with dependsOn=[{\"jobId\": first, \"type\": \"N_TO_N\"}] starts child i as soon as child i of the first job succeeds."
        }
      ]
    },
    {
      "@type": "FAQPage",
      "mainEntity": [
        {
          "@type": "Question",
          "name": "How does a child job know which tile to process?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "AWS Batch sets AWS_BATCH_JOB_ARRAY_INDEX in every child. The container reads it and takes that line of a manifest file listing the tiles, so the same image serves every child."
          }
        },
        {
          "@type": "Question",
          "name": "How many tiles can one array job handle?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Up to 10,000 children. Split larger tile lists into several manifests and array jobs, or let each child process a small group of tiles."
          }
        },
        {
          "@type": "Question",
          "name": "What does an N_TO_N dependency do?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "It links two array jobs of the same size index by index: child i of the second job starts once child i of the first succeeds, instead of waiting for the entire first job."
          }
        },
        {
          "@type": "Question",
          "name": "How should I set memory for PDAL array children?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Measure peak memory on the densest tile and add about a quarter as headroom. If tile sizes vary widely, submit dense tiles as a separate array job with a larger memory request."
          }
        }
      ]
    }
  ]
}
</script>

**TL;DR:** Write the tile list to a manifest in S3, submit one array job with `arrayProperties.size` equal to the tile count (up to 10,000), and have the container read `AWS_BATCH_JOB_ARRAY_INDEX` to pick its line from the manifest. Each child is an independent job with its own retries and logs, and a second array job can depend on the first with `N_TO_N` so tile *i* of stage two starts as soon as tile *i* of stage one finishes.

## Context and Motivation

This guide is part of [AWS Batch Processing](https://www.pythonlidar.com/batch-automation-cloud-integration/aws-batch-processing/). Submitting one Batch job per tile works, but at thousands of tiles it means thousands of `SubmitJob` calls, API throttling, and a job list nobody can read. An array job is a single submission that fans out into child jobs, each told its index through an environment variable. The submission is instant, the console groups the children under one parent, and the retry strategy applies to each child independently.

For LiDAR the pattern maps cleanly: index *i* is tile *i* of a manifest, and the container is the same PDAL image used for single-tile runs, as described in [scaling PDAL tile processing with AWS Batch](https://www.pythonlidar.com/batch-automation-cloud-integration/aws-batch-processing/scaling-pdal-tile-processing-with-aws-batch/).

<svg viewBox="0 0 740 220" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="An array job reading its tile from a manifest by index" style="width:100%;max-width:740px;display:block;margin:1.6rem auto">
  <title>Index to tile through a manifest</title>
  <desc>A manifest file in S3 lists tile keys on numbered lines 0 to n. One array job submission creates child jobs 0 to n. Each child reads AWS_BATCH_JOB_ARRAY_INDEX and fetches the matching line from the manifest, then runs PDAL on that tile.</desc>
  <defs><marker id="aj-arw" markerWidth="9" markerHeight="7" refX="9" refY="3.5" orient="auto"><path d="M0,0 L0,7 L9,3.5 z" fill="var(--dg-line)"/></marker></defs>
  <rect x="0" y="0" width="740" height="220" fill="var(--dg-bg)" rx="10"/>
  <rect x="20" y="30" width="230" height="160" rx="10" fill="var(--dg-surface)" stroke="var(--dg-line)" stroke-width="1.3"/>
  <text x="135" y="54" text-anchor="middle" font-size="11.5" font-weight="600" fill="var(--dg-text)">manifest.txt</text>
  <g font-size="10" fill="var(--dg-text)" font-family="monospace">
    <text x="40" y="84" text-anchor="start">0  tiles/571_4190.laz</text>
    <text x="40" y="106" text-anchor="start">1  tiles/571_4191.laz</text>
    <text x="40" y="128" text-anchor="start">2  tiles/572_4190.laz</text>
    <text x="40" y="170" text-anchor="start">n  tiles/598_4222.laz</text>
  </g>
  <text x="135" y="150" text-anchor="middle" font-size="12" fill="var(--dg-muted)">⋮</text>
  <g font-size="10.5" fill="var(--dg-text)">
    <rect x="490" y="30" width="230" height="36" rx="6" fill="var(--dg-a-soft)" stroke="var(--dg-a)"/><text text-anchor="middle" x="605" y="53">child 0 → line 0</text>
    <rect x="490" y="76" width="230" height="36" rx="6" fill="var(--dg-a-soft)" stroke="var(--dg-a)"/><text text-anchor="middle" x="605" y="99">child 1 → line 1</text>
    <rect x="490" y="154" width="230" height="36" rx="6" fill="var(--dg-a-soft)" stroke="var(--dg-a)"/><text text-anchor="middle" x="605" y="177">child n → line n</text>
  </g>
  <text x="605" y="138" text-anchor="middle" font-size="12" fill="var(--dg-muted)">⋮</text>
  <line x1="486" y1="48" x2="254" y2="80" stroke="var(--dg-line)" stroke-width="1.2" marker-end="url(#aj-arw)"/>
  <line x1="486" y1="94" x2="254" y2="102" stroke="var(--dg-line)" stroke-width="1.2" marker-end="url(#aj-arw)"/>
  <line x1="486" y1="172" x2="254" y2="166" stroke="var(--dg-line)" stroke-width="1.2" marker-end="url(#aj-arw)"/>
  <text x="370" y="208" text-anchor="middle" font-size="10.5" fill="var(--dg-muted)">AWS_BATCH_JOB_ARRAY_INDEX selects the line</text>
</svg>

## Prerequisites and Assumptions

- An AWS Batch compute environment and job queue (EC2 or Fargate), and a job definition using a PDAL image in ECR.
- An IAM job role with read access to the input bucket and write access to the output bucket.
- A tile list, for example from a tile index built with `pdal tindex` or an S3 listing.

## Step-by-Step Implementation

### Step 1 — Write the manifest

One tile key per line, sorted, uploaded next to the run's outputs so every run records exactly what it processed.

### Step 2 — Write the entrypoint

The container script reads `AWS_BATCH_JOB_ARRAY_INDEX` and `MANIFEST_URI`, fetches the manifest, and processes line *index*.

### Step 3 — Size the child job

Set `vcpus` and `memory` from a measured tile: PDAL memory scales with points per tile, so measure the largest tile rather than the average.

### Step 4 — Submit the array job

`submit_job` with `arrayProperties={"size": n}` and a `retryStrategy` that retries on host termination.

### Step 5 — Chain stages with N_TO_N

A second array job of the same size with `dependsOn=[{"jobId": first, "type": "N_TO_N"}]` starts child *i* as soon as child *i* of the first job succeeds.

## Complete Working Example

Entrypoint inside the container:

```python
#!/usr/bin/env python3
"""entrypoint.py: process one tile chosen by the array index."""
import json
import os
import sys

import boto3
import pdal

s3 = boto3.client("s3")
idx = int(os.environ.get("AWS_BATCH_JOB_ARRAY_INDEX", "0"))
bucket, key = os.environ["MANIFEST_URI"].removeprefix("s3://").split("/", 1)
tiles = s3.get_object(Bucket=bucket, Key=key)["Body"].read().decode().split()
tile = tiles[idx]
stem = tile.rsplit("/", 1)[-1].removesuffix(".laz")
out = f"{os.environ['OUT_PREFIX']}/{stem}.tif"

spec = {"pipeline": [
    f"/vsis3/lidar-in/{tile}",
    {"type": "filters.smrf", "slope": 0.15, "window": 18},
    {"type": "filters.range", "limits": "Classification[2:2]"},
    {"type": "writers.gdal", "filename": f"/vsis3/lidar-out/{out}",
     "resolution": 1.0, "output_type": "idw", "data_type": "float32"},
]}
n = pdal.Pipeline(json.dumps(spec)).execute()
print(json.dumps({"index": idx, "tile": tile, "ground_points": n}))
sys.exit(0 if n else 3)
```

Submission from a workstation or an orchestrator:

```python
import boto3

batch, s3 = boto3.client("batch"), boto3.client("s3")
tiles = sorted(o["Key"] for p in s3.get_paginator("list_objects_v2")
               .paginate(Bucket="lidar-in", Prefix="tiles/") for o in p.get("Contents", [])
               if o["Key"].endswith(".laz"))
s3.put_object(Bucket="lidar-out", Key="runs/2026-09-18/manifest.txt",
              Body="\n".join(tiles).encode())

env = [{"name": "MANIFEST_URI", "value": "s3://lidar-out/runs/2026-09-18/manifest.txt"},
       {"name": "OUT_PREFIX", "value": "runs/2026-09-18/dtm"}]

dtm = batch.submit_job(
    jobName="dtm-2026-09-18", jobQueue="lidar-spot", jobDefinition="pdal-dtm:7",
    arrayProperties={"size": len(tiles)},
    containerOverrides={"environment": env,
                        "resourceRequirements": [{"type": "VCPU", "value": "2"},
                                                 {"type": "MEMORY", "value": "8192"}]},
    retryStrategy={"attempts": 3, "evaluateOnExit": [
        {"onStatusReason": "Host EC2*", "action": "RETRY"},
        {"onExitCode": "3", "action": "EXIT"},
        {"onReason": "*", "action": "EXIT"}]},
)["jobId"]

hillshade = batch.submit_job(
    jobName="hillshade-2026-09-18", jobQueue="lidar-spot", jobDefinition="gdal-hillshade:2",
    arrayProperties={"size": len(tiles)},
    dependsOn=[{"jobId": dtm, "type": "N_TO_N"}],
    containerOverrides={"environment": env},
)["jobId"]
print(dtm, hillshade)
```

<svg viewBox="0 0 740 200" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="N_TO_N dependency between two array jobs" style="width:100%;max-width:740px;display:block;margin:1.6rem auto">
  <title>N_TO_N chaining</title>
  <desc>Two rows of child jobs. The top row is the DTM array job with children 0 to 4, the bottom row is the hillshade array job with children 0 to 4. Each DTM child has an arrow to the hillshade child with the same index, so hillshade 2 can start as soon as DTM 2 finishes, without waiting for the whole DTM job.</desc>
  <defs><marker id="nn-arw" markerWidth="9" markerHeight="7" refX="9" refY="3.5" orient="auto"><path d="M0,0 L0,7 L9,3.5 z" fill="var(--dg-line)"/></marker></defs>
  <rect x="0" y="0" width="740" height="200" fill="var(--dg-bg)" rx="10"/>
  <text x="80" y="54" text-anchor="middle" font-size="11" fill="var(--dg-text)">DTM job</text>
  <text x="80" y="154" text-anchor="middle" font-size="11" fill="var(--dg-text)">hillshade job</text>
  <g font-size="10.5" fill="var(--dg-text)">
    <rect x="160" y="30" width="100" height="40" rx="6" fill="var(--dg-a-soft)" stroke="var(--dg-a)"/><text text-anchor="middle" x="210" y="54">0</text>
    <rect x="272" y="30" width="100" height="40" rx="6" fill="var(--dg-a-soft)" stroke="var(--dg-a)"/><text text-anchor="middle" x="322" y="54">1</text>
    <rect x="384" y="30" width="100" height="40" rx="6" fill="var(--dg-a-soft)" stroke="var(--dg-a)"/><text text-anchor="middle" x="434" y="54">2</text>
    <rect x="496" y="30" width="100" height="40" rx="6" fill="var(--dg-a-soft)" stroke="var(--dg-a)"/><text text-anchor="middle" x="546" y="54">3</text>
    <rect x="608" y="30" width="100" height="40" rx="6" fill="var(--dg-a-soft)" stroke="var(--dg-a)"/><text text-anchor="middle" x="658" y="54">4</text>
    <rect x="160" y="130" width="100" height="40" rx="6" fill="var(--dg-d-soft)" stroke="var(--dg-d)"/><text text-anchor="middle" x="210" y="154">0</text>
    <rect x="272" y="130" width="100" height="40" rx="6" fill="var(--dg-d-soft)" stroke="var(--dg-d)"/><text text-anchor="middle" x="322" y="154">1</text>
    <rect x="384" y="130" width="100" height="40" rx="6" fill="var(--dg-d-soft)" stroke="var(--dg-d)"/><text text-anchor="middle" x="434" y="154">2</text>
    <rect x="496" y="130" width="100" height="40" rx="6" fill="var(--dg-d-soft)" stroke="var(--dg-d)"/><text text-anchor="middle" x="546" y="154">3</text>
    <rect x="608" y="130" width="100" height="40" rx="6" fill="var(--dg-d-soft)" stroke="var(--dg-d)"/><text text-anchor="middle" x="658" y="154">4</text>
  </g>
  <g stroke="var(--dg-line)" stroke-width="1.3">
    <line x1="210" y1="70" x2="210" y2="126" marker-end="url(#nn-arw)"/>
    <line x1="322" y1="70" x2="322" y2="126" marker-end="url(#nn-arw)"/>
    <line x1="434" y1="70" x2="434" y2="126" marker-end="url(#nn-arw)"/>
    <line x1="546" y1="70" x2="546" y2="126" marker-end="url(#nn-arw)"/>
    <line x1="658" y1="70" x2="658" y2="126" marker-end="url(#nn-arw)"/>
  </g>
  <text x="434" y="192" text-anchor="middle" font-size="10.5" fill="var(--dg-muted)">child i of stage two waits only for child i of stage one</text>
</svg>

## Sizing Children From the Largest Tile

Batch places child jobs by their declared `vcpus` and `memory`. If the declaration is too small, the container is killed with `OutOfMemoryError: Container killed due to memory usage` and retries fail the same way; if it is too large, fewer children fit per instance and the run takes longer and costs more. Tiles in a project are rarely uniform — dense urban tiles and tiles covering overlap between flightlines can hold several times the points of a rural tile — so size the job definition from the largest tile, not the median. Measure peak memory on that tile locally as described in [measuring peak memory of a PDAL pipeline](https://www.pythonlidar.com/pdal-pipeline-architecture-execution/memory-management/measuring-peak-memory-of-a-pdal-pipeline/), then add around 25% headroom.

When the spread is extreme, split the manifest into two array jobs — normal tiles with a small memory request and a handful of dense tiles with a large one. The cost saving from packing the common case tightly usually outweighs the small complexity of two submissions.

## Key Parameter Table

| Setting | Typical | Notes |
|---|---|---|
| `arrayProperties.size` | 2–10,000 | One child per tile; split larger lists |
| `AWS_BATCH_JOB_ARRAY_INDEX` | 0…size−1 | Set in each child |
| `resourceRequirements` VCPU | 1–4 | PDAL is mostly single-threaded per tile |
| `resourceRequirements` MEMORY | from largest tile | +25% headroom |
| `retryStrategy.attempts` | 2–3 | Per child |
| `evaluateOnExit` | retry on `Host EC2*` | Exit early on permanent codes |
| `dependsOn` type | `N_TO_N` / sequential | Per-index vs whole-job dependency |

## Verification

- **Child count.** The parent job's array status counts total children equal to the manifest length.
- **Outputs.** The output prefix contains one raster per manifest line; list both and diff.
- **Chaining.** Hillshade children start while DTM children are still running, which is visible in the start times.

## Gotchas and Edge Cases

**The 10,000 limit.** An array job holds at most 10,000 children. For larger projects, split the manifest into chunks and submit one array job per chunk, or have each child process a small group of tiles.

**Manifest immutability.** Children read the manifest when they start, possibly hours after submission. Never overwrite a manifest during a run; write each run's manifest to a new key.

**Failure of the parent.** The parent array job is marked failed if any child fails after its retries, and an `N_TO_N` dependant child whose upstream child failed never runs. Collect failures from the child statuses and resubmit only those tiles with a smaller manifest.

<svg viewBox="0 0 740 170" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Splitting a large tile list across several array jobs" style="width:100%;max-width:740px;display:block;margin:1.6rem auto">
  <title>Chunking beyond 10,000 tiles</title>
  <desc>A 24,000-tile manifest is split into three chunk manifests of 10,000, 10,000 and 4,000 lines. Each chunk is submitted as its own array job, keeping every job within the 10,000-child limit.</desc>
  <rect x="0" y="0" width="740" height="170" fill="var(--dg-bg)" rx="10"/>
  <rect x="20" y="50" width="180" height="70" rx="10" fill="var(--dg-surface-2)" stroke="var(--dg-line)" stroke-width="1.3"/>
  <text x="110" y="82" text-anchor="middle" font-size="11" fill="var(--dg-text)">24,000 tiles</text>
  <text x="110" y="102" text-anchor="middle" font-size="10" fill="var(--dg-muted)">one manifest</text>
  <path d="M200 85 L250 85" stroke="var(--dg-line)" stroke-width="1.5"/>
  <g font-size="10.5" fill="var(--dg-text)">
    <rect x="260" y="30" width="140" height="110" rx="10" fill="var(--dg-a-soft)" stroke="var(--dg-a)"/><text text-anchor="middle" x="330" y="80">array job A</text><text text-anchor="middle" x="330" y="100">10,000</text>
    <rect x="420" y="30" width="140" height="110" rx="10" fill="var(--dg-a-soft)" stroke="var(--dg-a)"/><text text-anchor="middle" x="490" y="80">array job B</text><text text-anchor="middle" x="490" y="100">10,000</text>
    <rect x="580" y="30" width="140" height="110" rx="10" fill="var(--dg-a-soft)" stroke="var(--dg-a)"/><text text-anchor="middle" x="650" y="80">array job C</text><text text-anchor="middle" x="650" y="100">4,000</text>
  </g>
  <text x="490" y="160" text-anchor="middle" font-size="10.5" fill="var(--dg-muted)">each chunk gets its own manifest key</text>
</svg>

## Frequently Asked Questions

**How does a child job know which tile to process?**

AWS Batch sets AWS_BATCH_JOB_ARRAY_INDEX in every child. The container reads it and takes that line of a manifest file listing the tiles, so the same image serves every child.

**How many tiles can one array job handle?**

Up to 10,000 children. Split larger tile lists into several manifests and array jobs, or let each child process a small group of tiles.

**What does an N_TO_N dependency do?**

It links two array jobs of the same size index by index: child i of the second job starts once child i of the first succeeds, instead of waiting for the entire first job.

**How should I set memory for PDAL array children?**

Measure peak memory on the densest tile and add about a quarter as headroom. If tile sizes vary widely, submit dense tiles as a separate array job with a larger memory request.

## Related

- [AWS Batch Processing](https://www.pythonlidar.com/batch-automation-cloud-integration/aws-batch-processing/) — running PDAL in AWS Batch
- [Scaling PDAL Tile Processing with AWS Batch](https://www.pythonlidar.com/batch-automation-cloud-integration/aws-batch-processing/scaling-pdal-tile-processing-with-aws-batch/) — environments and job definitions
- [Handling Spot Interruptions in PDAL Batch Jobs](https://www.pythonlidar.com/batch-automation-cloud-integration/aws-batch-processing/handling-spot-interruptions-in-pdal-batch-jobs/) — retry strategies
- [Estimating Cloud Cost per LiDAR Tile](https://www.pythonlidar.com/batch-automation-cloud-integration/aws-batch-processing/estimating-cloud-cost-per-lidar-tile/) — pricing the run
- [Dynamic Task Mapping for LiDAR Tiles](https://www.pythonlidar.com/batch-automation-cloud-integration/airflow-dag-orchestration/dynamic-task-mapping-for-lidar-tiles/) — the Airflow equivalent
