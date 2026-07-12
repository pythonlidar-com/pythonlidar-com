---
title: "Scaling PDAL Tile Processing with AWS Batch"
description: "A worked example of fanning out a PDAL ground-to-DTM pipeline across an AWS Batch array job — building the tile manifest, submitting with boto3, and aggregating the output rasters."
slug: "scaling-pdal-tile-processing-with-aws-batch"
type: "howto"
breadcrumb: "Scaling PDAL with AWS Batch"
datePublished: "2024-07-04"
dateModified: "2026-07-12"
---

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Article",
      "headline": "Scaling PDAL Tile Processing with AWS Batch",
      "description": "A worked example of fanning out a PDAL ground-to-DTM pipeline across an AWS Batch array job — building the tile manifest, submitting with boto3, and aggregating the output rasters.",
      "datePublished": "2024-07-04",
      "dateModified": "2026-07-12",
      "author": {"@type": "Organization", "name": "pythonlidar.com"}
    },
    {
      "@type": "BreadcrumbList",
      "itemListElement": [
        {"@type": "ListItem", "position": 1, "name": "Home", "item": "https://www.pythonlidar.com/"},
        {"@type": "ListItem", "position": 2, "name": "Batch Automation and Cloud Integration for PDAL", "item": "https://www.pythonlidar.com/batch-automation-cloud-integration/"},
        {"@type": "ListItem", "position": 3, "name": "AWS Batch Processing", "item": "https://www.pythonlidar.com/batch-automation-cloud-integration/aws-batch-processing/"},
        {"@type": "ListItem", "position": 4, "name": "Scaling PDAL with AWS Batch", "item": "https://www.pythonlidar.com/batch-automation-cloud-integration/aws-batch-processing/scaling-pdal-tile-processing-with-aws-batch/"}
      ]
    },
    {
      "@type": "HowTo",
      "name": "Scale a PDAL ground-to-DTM pipeline across an AWS Batch array job",
      "description": "Build a tile manifest in S3, submit an AWS Batch array job sized to the tile count, monitor the children, and aggregate the output DTM rasters.",
      "step": [
        {"@type": "HowToStep", "position": 1, "name": "Build the tile manifest", "text": "List the LAZ tiles under the input prefix and write their keys, one per line, to a manifest object in S3."},
        {"@type": "HowToStep", "position": 2, "name": "Register the job definition", "text": "Register a job definition pinning the PDAL image, vCPU and memory, the S3 job role, and a retry strategy."},
        {"@type": "HowToStep", "position": 3, "name": "Submit an array job sized to the tile count", "text": "Call submit_job with arrayProperties.size equal to the number of manifest rows, sharding above 10,000."},
        {"@type": "HowToStep", "position": 4, "name": "Monitor the array", "text": "Poll describe_jobs for the statusSummary until SUCCEEDED plus FAILED equals the array size."},
        {"@type": "HowToStep", "position": 5, "name": "Aggregate the output rasters", "text": "List the output prefix, confirm the object count, and build a GDAL VRT mosaic over the per-tile DTMs."}
      ]
    },
    {
      "@type": "FAQPage",
      "mainEntity": [
        {
          "@type": "Question",
          "name": "What is the maximum size of an AWS Batch array job?",
          "acceptedAnswer": {"@type": "Answer", "text": "A single AWS Batch array job can have at most 10,000 children. Acquisitions with more tiles must be split into multiple array jobs over manifest shards of up to 10,000 keys each, submitted in a loop. Each shard is an independent array job with its own parent jobId."}
        },
        {
          "@type": "Question",
          "name": "How do I retry only the tiles that failed in an AWS Batch array job?",
          "acceptedAnswer": {"@type": "Answer", "text": "Read the failed children from describe_jobs by appending the index to the parent jobId, map each failed index back to its tile key through the original manifest, write those keys into a new smaller manifest, and submit a fresh array sized to the number of failures. Never rerun the whole array to recover a few tiles."}
        },
        {
          "@type": "Question",
          "name": "Why am I getting throttling errors when submitting many AWS Batch jobs?",
          "acceptedAnswer": {"@type": "Answer", "text": "One array job is a single submit_job call regardless of the child count, so it does not throttle. Throttling appears when you submit thousands of individual jobs in a loop instead of one array, or when polling describe_jobs too aggressively. Use array jobs, add exponential backoff on the boto3 client, and poll on an interval of ten seconds or more."}
        }
      ]
    }
  ]
}
</script>

**TL;DR:** List your LAZ tiles into a newline-delimited manifest in S3, submit a single AWS Batch array job with `arrayProperties.size` equal to the row count so each child resolves `AWS_BATCH_JOB_ARRAY_INDEX` to one tile, poll `describe_jobs` until the status summary settles, then mosaic the per-tile DTMs with a GDAL VRT — sharding into multiple arrays above the 10,000-child limit.

## Context and Motivation

This guide is part of [AWS Batch Processing for PDAL Point Clouds](https://www.pythonlidar.com/batch-automation-cloud-integration/aws-batch-processing/), which introduces the compute environment, job queue, and array-indexing model. Here we walk one concrete acquisition all the way through: a 12,500-tile regional survey that needs a one-metre DTM per tile, produced by a ground-classification pipeline running on Spot capacity.

The appeal of the array-job approach is that scaling is a number, not a rewrite. Whether the acquisition is 200 tiles or 12,500, the pipeline, the job definition, and the container are identical; only the manifest length and the array size change. That property is what lets a survey team reprocess an entire county overnight without provisioning anything by hand. The single complication at this scale is the 10,000-child ceiling on a Batch array, which turns a 12,500-tile job into two shards — handled below with a small sharding loop rather than any change to the processing logic.

<svg viewBox="0 0 720 250" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Manifest sharding into two AWS Batch array jobs feeding a mosaic step" style="width:100%;max-width:720px;display:block;margin:1.5rem auto">
  <title>Sharding a 12,500-tile manifest into two AWS Batch array jobs</title>
  <desc>A full manifest of 12,500 tile keys is split into two shards of up to 10,000 rows. Each shard becomes a separate AWS Batch array job. Both arrays write per-tile DTM rasters into the same S3 output prefix, which a final VRT mosaic step reads.</desc>
  <defs>
    <marker id="arr-scale" markerWidth="8" markerHeight="8" refX="7" refY="3" orient="auto">
      <path d="M0,0 L0,6 L8,3 z" fill="currentColor" opacity="0.6"/>
    </marker>
  </defs>
  <rect x="10" y="95" width="150" height="60" rx="6" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.75"/>
  <text x="85" y="120" text-anchor="middle" font-size="11" fill="currentColor" font-family="monospace">manifest.txt</text>
  <text x="85" y="138" text-anchor="middle" font-size="10" fill="currentColor" opacity="0.6">12,500 keys</text>
  <rect x="205" y="35"  width="150" height="55" rx="6" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.7"/>
  <text x="280" y="58"  text-anchor="middle" font-size="10" fill="currentColor" font-family="monospace">shard 0</text>
  <text x="280" y="75"  text-anchor="middle" font-size="10" fill="currentColor" opacity="0.6">size 10,000</text>
  <rect x="205" y="160" width="150" height="55" rx="6" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.7"/>
  <text x="280" y="183" text-anchor="middle" font-size="10" fill="currentColor" font-family="monospace">shard 1</text>
  <text x="280" y="200" text-anchor="middle" font-size="10" fill="currentColor" opacity="0.6">size 2,500</text>
  <rect x="400" y="95" width="150" height="60" rx="6" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.75"/>
  <text x="475" y="120" text-anchor="middle" font-size="10" fill="currentColor" font-family="monospace">output prefix</text>
  <text x="475" y="138" text-anchor="middle" font-size="10" fill="currentColor" opacity="0.6">per-tile DTMs</text>
  <rect x="590" y="95" width="120" height="60" rx="6" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.75"/>
  <text x="650" y="120" text-anchor="middle" font-size="10" fill="currentColor" font-family="monospace">VRT mosaic</text>
  <text x="650" y="138" text-anchor="middle" font-size="10" fill="currentColor" opacity="0.6">gdalbuildvrt</text>
  <line x1="160" y1="115" x2="201" y2="70"  stroke="currentColor" stroke-width="1.5" opacity="0.6" marker-end="url(#arr-scale)"/>
  <line x1="160" y1="135" x2="201" y2="185" stroke="currentColor" stroke-width="1.5" opacity="0.6" marker-end="url(#arr-scale)"/>
  <line x1="355" y1="62"  x2="398" y2="112" stroke="currentColor" stroke-width="1.5" opacity="0.6" marker-end="url(#arr-scale)"/>
  <line x1="355" y1="188" x2="398" y2="138" stroke="currentColor" stroke-width="1.5" opacity="0.6" marker-end="url(#arr-scale)"/>
  <line x1="550" y1="125" x2="586" y2="125" stroke="currentColor" stroke-width="1.5" opacity="0.6" marker-end="url(#arr-scale)"/>
</svg>

## Prerequisites and Assumptions

| Requirement | Detail |
|---|---|
| AWS Batch objects | A Spot compute environment and a job queue already created |
| PDAL image | Pushed to ECR, containing `process_tile.py` from the parent guide |
| Job role | IAM role with `s3:GetObject` on input and `s3:PutObject` on output |
| `boto3` | 1.28+ in the submitting environment |
| Input tiles | LAZ tiles under one S3 prefix, one tile per grid cell |
| GDAL | 3.4+ available where the aggregation runs, for `gdalbuildvrt` |

This walkthrough assumes the ground-to-DTM pipeline itself is settled. If you are still tuning ground classification, do that on one tile first with [SMRF ground classification](https://www.pythonlidar.com/ground-filtering-dtm-dsm-generation/smrf-ground-classification/) before scaling out; a bad parameter multiplied across 12,500 tiles is an expensive mistake.

## Step-by-Step Implementation

### Step 1 — Build the tile manifest in S3

List every LAZ under the input prefix and write the keys, one per line, to a manifest object. The row order fixes the index-to-tile mapping for the whole run, so write it once and keep it.

```python
import boto3

s3 = boto3.client("s3")


def build_manifest(bucket: str, tile_prefix: str, manifest_key: str) -> int:
    """Write all .laz keys under tile_prefix to a newline-delimited manifest. Returns row count."""
    paginator = s3.get_paginator("list_objects_v2")
    keys = []
    for page in paginator.paginate(Bucket=bucket, Prefix=tile_prefix):
        for obj in page.get("Contents", []):
            if obj["Key"].lower().endswith(".laz"):
                keys.append(obj["Key"])
    keys.sort()
    body = "\n".join(keys).encode("utf-8")
    s3.put_object(Bucket=bucket, Key=manifest_key, Body=body)
    return len(keys)
```

### Step 2 — Register the job definition

Register the definition once (or reuse the one from the parent guide). It pins the PDAL image, the resources per tile, the job role, and the Spot-aware retries.

```bash
aws batch register-job-definition \
  --job-definition-name pdal-dtm-worker \
  --type container \
  --platform-capabilities EC2 \
  --container-properties '{
    "image": "123456789012.dkr.ecr.us-east-1.amazonaws.com/pdal-worker:2.6.3",
    "command": ["python", "/opt/worker/process_tile.py"],
    "jobRoleArn": "arn:aws:iam::123456789012:role/pdal-batch-job-role",
    "executionRoleArn": "arn:aws:iam::123456789012:role/ecsTaskExecutionRole",
    "resourceRequirements": [
      {"type": "VCPU", "value": "2"},
      {"type": "MEMORY", "value": "8192"}
    ]
  }' \
  --retry-strategy '{"attempts": 3, "evaluateOnExit": [
    {"onStatusReason": "Host EC2*", "action": "RETRY"},
    {"onExitCode": "137", "action": "RETRY"},
    {"onReason": "*", "action": "EXIT"}
  ]}'
```

### Step 3 — Submit an array job sized to the tile count

The array size equals the number of manifest rows. Above 10,000 rows, split into shards and submit one array per shard, writing a shard manifest for each so every child still resolves a contiguous index range.

```python
import math


def submit_sharded(bucket, full_manifest_key, job_queue, job_def, out_prefix, total_rows):
    """Submit one array job per 10,000-row shard. Returns the list of parent jobIds."""
    body = s3.get_object(Bucket=bucket, Key=full_manifest_key)["Body"].read().decode("utf-8")
    rows = [r for r in body.splitlines() if r.strip()]
    batch = boto3.client("batch", region_name="us-east-1")
    MAX = 10_000
    parents = []

    for shard_idx in range(math.ceil(len(rows) / MAX)):
        shard_rows = rows[shard_idx * MAX:(shard_idx + 1) * MAX]
        shard_key = f"{full_manifest_key}.shard{shard_idx}"
        s3.put_object(Bucket=bucket, Key=shard_key, Body="\n".join(shard_rows).encode("utf-8"))

        resp = batch.submit_job(
            jobName=f"pdal-dtm-shard{shard_idx}",
            jobQueue=job_queue,
            jobDefinition=job_def,
            arrayProperties={"size": len(shard_rows)},
            containerOverrides={"environment": [
                {"name": "INPUT_BUCKET", "value": bucket},
                {"name": "MANIFEST_KEY", "value": shard_key},
                {"name": "OUTPUT_PREFIX", "value": out_prefix},
            ]},
        )
        parents.append(resp["jobId"])
    return parents
```

### Step 4 — Monitor the array

Poll the status summary on a calm interval. The run is done when `SUCCEEDED + FAILED` equals the array size; a tight polling loop only invites throttling.

```python
import time


def wait_for_array(job_id: str, size: int, poll_seconds: int = 20) -> dict:
    batch = boto3.client("batch", region_name="us-east-1")
    while True:
        summary = batch.describe_jobs(jobs=[job_id])["jobs"][0]["arrayProperties"]["statusSummary"]
        done = summary.get("SUCCEEDED", 0) + summary.get("FAILED", 0)
        print(f"{job_id}: {done}/{size} settled "
              f"(FAILED={summary.get('FAILED', 0)})")
        if done >= size:
            return summary
        time.sleep(poll_seconds)
```

### Step 5 — Aggregate the output rasters

Confirm the object count, then build a GDAL virtual raster over the per-tile DTMs. A VRT stitches thousands of GeoTIFFs into one addressable mosaic without copying pixels.

```python
import subprocess


def aggregate_dtms(bucket: str, out_prefix: str, expected: int, vrt_path: str) -> None:
    paginator = s3.get_paginator("list_objects_v2")
    uris = []
    for page in paginator.paginate(Bucket=bucket, Prefix=out_prefix):
        for obj in page.get("Contents", []):
            if obj["Key"].endswith("_dtm.tif"):
                uris.append(f"/vsis3/{bucket}/{obj['Key']}")
    if len(uris) != expected:
        raise RuntimeError(f"Expected {expected} DTMs, found {len(uris)}. Investigate missing tiles.")
    subprocess.run(["gdalbuildvrt", "-overwrite", vrt_path, *uris], check=True)
    print(f"Built {vrt_path} over {len(uris)} tiles.")
```

## Complete Working Example

The following script is self-contained: it builds the manifest, submits the shards, waits, and mosaics. Save it as `scale_dtm.py` and run it against your bucket.

```python
#!/usr/bin/env python3
"""scale_dtm.py — fan a PDAL ground-to-DTM pipeline across AWS Batch and mosaic the result."""
import math
import subprocess
import time

import boto3

REGION = "us-east-1"
BUCKET = "lidar-raw-east"
TILE_PREFIX = "tiles/acq_2026_east/"
MANIFEST_KEY = "manifests/acq_2026_east.txt"
OUTPUT_PREFIX = "dtm/acq_2026_east/"
JOB_QUEUE = "pdal-spot-queue"
JOB_DEF = "pdal-dtm-worker"
MAX_ARRAY = 10_000

s3 = boto3.client("s3", region_name=REGION)
batch = boto3.client("batch", region_name=REGION)


def build_manifest() -> list:
    paginator = s3.get_paginator("list_objects_v2")
    keys = [
        obj["Key"]
        for page in paginator.paginate(Bucket=BUCKET, Prefix=TILE_PREFIX)
        for obj in page.get("Contents", [])
        if obj["Key"].lower().endswith(".laz")
    ]
    keys.sort()
    s3.put_object(Bucket=BUCKET, Key=MANIFEST_KEY, Body="\n".join(keys).encode("utf-8"))
    print(f"Manifest written with {len(keys)} tiles.")
    return keys


def submit_shards(rows: list) -> list:
    parents = []
    for i in range(math.ceil(len(rows) / MAX_ARRAY)):
        shard = rows[i * MAX_ARRAY:(i + 1) * MAX_ARRAY]
        shard_key = f"{MANIFEST_KEY}.shard{i}"
        s3.put_object(Bucket=BUCKET, Key=shard_key, Body="\n".join(shard).encode("utf-8"))
        resp = batch.submit_job(
            jobName=f"pdal-dtm-shard{i}",
            jobQueue=JOB_QUEUE,
            jobDefinition=JOB_DEF,
            arrayProperties={"size": len(shard)},
            containerOverrides={"environment": [
                {"name": "INPUT_BUCKET", "value": BUCKET},
                {"name": "OUTPUT_BUCKET", "value": BUCKET},
                {"name": "MANIFEST_KEY", "value": shard_key},
                {"name": "OUTPUT_PREFIX", "value": OUTPUT_PREFIX},
            ]},
        )
        parents.append((resp["jobId"], len(shard)))
        print(f"Submitted shard {i}: jobId={resp['jobId']} size={len(shard)}")
    return parents


def wait(parents: list) -> None:
    for job_id, size in parents:
        while True:
            summ = batch.describe_jobs(jobs=[job_id])["jobs"][0]["arrayProperties"]["statusSummary"]
            done = summ.get("SUCCEEDED", 0) + summ.get("FAILED", 0)
            print(f"{job_id}: {done}/{size} settled, FAILED={summ.get('FAILED', 0)}")
            if done >= size:
                if summ.get("FAILED", 0):
                    print(f"WARNING: {summ['FAILED']} children failed in {job_id}")
                break
            time.sleep(20)


def mosaic(expected: int) -> None:
    paginator = s3.get_paginator("list_objects_v2")
    uris = [
        f"/vsis3/{BUCKET}/{obj['Key']}"
        for page in paginator.paginate(Bucket=BUCKET, Prefix=OUTPUT_PREFIX)
        for obj in page.get("Contents", [])
        if obj["Key"].endswith("_dtm.tif")
    ]
    print(f"Found {len(uris)}/{expected} DTM rasters.")
    subprocess.run(["gdalbuildvrt", "-overwrite", "acq_2026_east_dtm.vrt", *uris], check=True)


def main() -> None:
    keys = build_manifest()
    parents = submit_shards(keys)
    wait(parents)
    mosaic(len(keys))
    print("Done.")


if __name__ == "__main__":
    main()
```

## Key Parameter Table

| Parameter | Where | Value here | Notes |
|---|---|---|---|
| `arrayProperties.size` | `submit_job` | up to 10,000 | Must equal the shard's row count; hard ceiling of 10,000 |
| shard size | submitter | 10,000 | Rows per array job; a 12,500-tile run makes two shards |
| VCPU | job definition | 2 | Per-tile vCPUs; benchmark 1 vs 2 vs 4 before committing |
| MEMORY | job definition | 8192 MiB | Raise for dense tiles to avoid exit 137 |
| `retryStrategy.attempts` | job definition | 3 | Covers Spot reclamation and transient S3 errors |
| `poll_seconds` | monitor | 20 | Keep at 10+ to avoid `describe_jobs` throttling |
| `/vsis3/` | GDAL VRT | — | GDAL's S3 virtual filesystem; no download needed for the VRT |

## Verification

Three checks confirm the run before the mosaic is trusted downstream.

**Every child settled.** `SUCCEEDED + FAILED` must equal the array size for each shard. A parent that never reaches this has children stuck in `RUNNABLE` — a compute-environment placement problem, not a pipeline problem.

**Output count matches tile count.** After a fully successful run, the output prefix must hold exactly one `_dtm.tif` per input tile:

```python
paginator = s3.get_paginator("list_objects_v2")
n = sum(
    1
    for page in paginator.paginate(Bucket="lidar-raw-east", Prefix="dtm/acq_2026_east/")
    for obj in page.get("Contents", [])
    if obj["Key"].endswith("_dtm.tif")
)
assert n == 12_500, f"Expected 12,500 DTMs, found {n}"
```

**Mosaic opens cleanly.** `gdalinfo acq_2026_east_dtm.vrt` should report the full acquisition extent and 12,500 source rasters. A VRT that opens but shows gaps means specific tiles are missing — cross-reference the failed indices against the manifest to name them.

## Gotchas and Edge Cases

**1. The 10,000-child ceiling is per array, not per account.** Exceeding it is a `submit_job` rejection, not a silent truncation. Shard the manifest as shown; there is no way to raise this limit. Keep shard boundaries stable across reruns so index-to-tile mapping stays reproducible.

**2. Individual-job submission throttles; array jobs do not.** Submitting 12,500 separate jobs in a loop will hit `SubmitJob` rate limits and take far longer than one array call. One array of 10,000 is a single API request. If you must loop (across shards), add exponential backoff — boto3's standard retry mode handles most of it, but poll `describe_jobs` no faster than every ten seconds.

**3. Partial failures are expected; plan the recovery path.** At 12,500 tiles some children will fail — a corrupt tile, a Spot reclamation on the final retry, a transient S3 error. Recover them surgically: read the failed indices, map them to keys through the original manifest, write a small recovery manifest, and submit a tiny array. The retry strategy in the job definition handles transient failures automatically, so a recovery run is usually a handful of genuinely bad tiles.

```python
def failed_tile_keys(parent_job_id: str, size: int, manifest_rows: list) -> list:
    """Map failed array child indices back to their tile keys."""
    failed = []
    for idx in range(size):
        child = batch.describe_jobs(jobs=[f"{parent_job_id}:{idx}"])["jobs"]
        if child and child[0]["status"] == "FAILED":
            failed.append(manifest_rows[idx])
    return failed
```

**4. Uneven tile density skews completion time.** A DTM array finishes only when its slowest child does, and a dense urban tile can take several times longer than a sparse rural one. If a few stragglers dominate the tail, pre-split the densest tiles before building the manifest so no single child is an outlier — the same footprint reasoning covered in [memory management](https://www.pythonlidar.com/pdal-pipeline-architecture-execution/memory-management/).

## Frequently Asked Questions

**What is the maximum size of an AWS Batch array job?**

A single AWS Batch array job can have at most 10,000 children. Acquisitions with more tiles must be split into multiple array jobs over manifest shards of up to 10,000 keys each, submitted in a loop. Each shard is an independent array job with its own parent `jobId`.

**How do I retry only the tiles that failed in an AWS Batch array job?**

Read the failed children from `describe_jobs` by appending the index to the parent `jobId` (for example `abc123:47`), map each failed index back to its tile key through the original manifest, write those keys into a new smaller manifest, and submit a fresh array sized to the number of failures. Never rerun the whole array to recover a few tiles.

**Why am I getting throttling errors when submitting many AWS Batch jobs?**

One array job is a single `submit_job` call regardless of the child count, so it does not throttle. Throttling appears when you submit thousands of individual jobs in a loop instead of one array, or when polling `describe_jobs` too aggressively. Use array jobs, add exponential backoff on the boto3 client, and poll on an interval of ten seconds or more.

**Can I aggregate the tiles into a single GeoTIFF instead of a VRT?**

Yes — build the VRT first, then run `gdal_translate acq_2026_east_dtm.vrt merged.tif` to flatten it into one file. The VRT step is cheap and lets you validate coverage before committing to a large materialised raster; for most downstream use a VRT is sufficient and avoids duplicating terabytes of pixels.

---

## Related

- [AWS Batch Processing for PDAL Point Clouds](https://www.pythonlidar.com/batch-automation-cloud-integration/aws-batch-processing/) — the parent guide covering compute environments, job definitions, and array indexing in depth
- [Batch Automation and Cloud Integration for PDAL](https://www.pythonlidar.com/batch-automation-cloud-integration/) — the wider landscape of containerised and scheduled PDAL processing
- [S3 Cloud Storage I/O](https://www.pythonlidar.com/batch-automation-cloud-integration/s3-cloud-storage-io/) — reading tiles and writing rasters directly against S3 with `/vsis3/`
- [SMRF Ground Classification](https://www.pythonlidar.com/ground-filtering-dtm-dsm-generation/smrf-ground-classification/) — tuning the ground-classification stage each Batch child runs
- [Optimizing PDAL for Multi-Core Processing](https://www.pythonlidar.com/pdal-pipeline-architecture-execution/parallel-execution/optimizing-pdal-for-multi-core-processing/) — sizing vCPUs per container by measuring one tile's parallel width
