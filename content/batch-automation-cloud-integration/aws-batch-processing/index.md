---
title: "AWS Batch Processing for PDAL Point Clouds"
description: "Running thousands of PDAL tile jobs on AWS Batch — job definitions, array jobs indexed over a tile manifest, compute environments and Spot instances, IAM roles for S3 access, and collecting results."
slug: "aws-batch-processing"
type: "topic"
breadcrumb: "AWS Batch Processing"
datePublished: "2024-07-04"
dateModified: "2026-07-12"
---

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Article",
      "headline": "AWS Batch Processing for PDAL Point Clouds",
      "description": "Running thousands of PDAL tile jobs on AWS Batch — job definitions, array jobs indexed over a tile manifest, compute environments and Spot instances, IAM roles for S3 access, and collecting results.",
      "datePublished": "2024-07-04",
      "dateModified": "2026-07-12",
      "author": {"@type": "Organization", "name": "pythonlidar.com"}
    },
    {
      "@type": "BreadcrumbList",
      "itemListElement": [
        {"@type": "ListItem", "position": 1, "name": "Home", "item": "https://www.pythonlidar.com/"},
        {"@type": "ListItem", "position": 2, "name": "Batch Automation and Cloud Integration for PDAL", "item": "https://www.pythonlidar.com/batch-automation-cloud-integration/"},
        {"@type": "ListItem", "position": 3, "name": "AWS Batch Processing", "item": "https://www.pythonlidar.com/batch-automation-cloud-integration/aws-batch-processing/"}
      ]
    },
    {
      "@type": "HowTo",
      "name": "Run a fleet of PDAL tile jobs on AWS Batch",
      "step": [
        {"@type": "HowToStep", "name": "Build a compute environment", "text": "Create a managed Spot compute environment bounded by minvCpus, maxvCpus, and an instance role."},
        {"@type": "HowToStep", "name": "Attach a job queue", "text": "Point a job queue at the compute environment so submitted jobs have a place to land."},
        {"@type": "HowToStep", "name": "Register a job definition", "text": "Declare the PDAL container image, vCPU and memory, the job role granting S3 access, and a retry strategy."},
        {"@type": "HowToStep", "name": "Submit an array job", "text": "Call submit_job with arrayProperties.size equal to the number of tiles so each child gets a distinct AWS_BATCH_JOB_ARRAY_INDEX."},
        {"@type": "HowToStep", "name": "Collect results", "text": "Poll describe_jobs for the array summary and count the output objects written back to the S3 results prefix."}
      ]
    },
    {
      "@type": "FAQPage",
      "mainEntity": [
        {
          "@type": "Question",
          "name": "How does one AWS Batch array child map to a single PDAL tile?",
          "acceptedAnswer": {"@type": "Answer", "text": "AWS Batch injects the environment variable AWS_BATCH_JOB_ARRAY_INDEX into every array child, running from 0 to size-1. The container reads that integer, uses it to look up the corresponding tile key in a manifest stored in S3, downloads that one tile, runs the PDAL pipeline, and uploads the result. Nothing else differs between children, so one index equals one tile."}
        },
        {
          "@type": "Question",
          "name": "Why is my AWS Batch job stuck in RUNNABLE?",
          "acceptedAnswer": {"@type": "Answer", "text": "A job stays RUNNABLE when the compute environment cannot place it. The usual causes are a maxvCpus ceiling already consumed by other children, a vCPU or memory request larger than any instance type the environment allows, a Spot capacity shortage in the chosen instance families, or a missing or misconfigured instance role. Check the compute environment status and raise maxvCpus or widen the allowed instance types."}
        },
        {
          "@type": "Question",
          "name": "Should PDAL tile jobs use Spot or On-Demand instances?",
          "acceptedAnswer": {"@type": "Answer", "text": "Spot is the right default for tile processing because each child is idempotent and short-lived, so an interrupted tile simply retries on another instance. Set a retry strategy of two or three attempts with an evaluateOnExit rule that retries Spot reclamation exit codes. Reserve On-Demand for the small number of jobs that must not be interrupted, such as a final aggregation step."}
        },
        {
          "@type": "Question",
          "name": "How do I give the PDAL container access to S3 without embedding keys?",
          "acceptedAnswer": {"@type": "Answer", "text": "Attach an IAM job role to the job definition through jobRoleArn. AWS Batch exposes that role to the container through the ECS task credentials endpoint, and boto3 picks it up automatically. Grant the role s3:GetObject on the input prefix and s3:PutObject on the output prefix. Never bake long-lived access keys into the image."}
        }
      ]
    }
  ]
}
</script>

A regional LiDAR acquisition arrives as tens of thousands of LAZ tiles sitting in an S3 bucket, and the deliverable is a matching set of derived rasters or cleaned point clouds. Running that conversion one tile at a time on a workstation would take weeks; standing up and babysitting a permanent cluster wastes money between jobs. AWS Batch resolves the tension by treating the whole acquisition as a single array job — you submit once, Batch provisions Spot capacity on demand, fans one container out per tile, and tears the fleet down when the queue drains. This page shows how to wire PDAL into that model: the job definition, the array indexing that maps a tile to a container, the IAM role that lets the container reach S3, and the retry logic that makes Spot interruptions a non-event. It is part of the broader [Batch Automation and Cloud Integration for PDAL](https://www.pythonlidar.com/batch-automation-cloud-integration/) guide.

<svg viewBox="0 0 760 300" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="AWS Batch array job fanning PDAL tile containers out over an S3 tile manifest" style="width:100%;max-width:760px;display:block;margin:1.5rem auto">
  <title>AWS Batch array job architecture for PDAL tile processing</title>
  <desc>A submit_job call creates an array job that fans out into three indexed child containers. Each child reads its own array index, looks up a tile key in a manifest stored in S3, pulls that tile, runs a PDAL pipeline, and writes a result object back to the output prefix in S3.</desc>
  <rect x="0" y="0" width="760" height="300" fill="var(--dg-bg)" rx="10"/>
  <defs>
    <marker id="arr-batch" markerWidth="8" markerHeight="8" refX="7" refY="3" orient="auto">
      <path d="M0,0 L0,6 L8,3 z" fill="currentColor" opacity="0.6"/>
    </marker>
  </defs>
  <!-- submit -->
  <rect x="10" y="120" width="140" height="60" rx="6" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.75"/>
  <text x="80" y="146" text-anchor="middle" font-size="12" fill="currentColor" font-family="monospace">submit_job</text>
  <text x="80" y="164" text-anchor="middle" font-size="10" fill="currentColor" opacity="0.6">arrayProperties</text>
  <!-- queue/CE -->
  <rect x="182" y="120" width="150" height="60" rx="6" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.75"/>
  <text x="257" y="144" text-anchor="middle" font-size="11" fill="currentColor" font-family="monospace">job queue</text>
  <text x="257" y="162" text-anchor="middle" font-size="10" fill="currentColor" opacity="0.6">Spot compute env</text>
  <!-- children -->
  <rect x="380" y="30"  width="180" height="52" rx="6" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.7"/>
  <text x="470" y="52"  text-anchor="middle" font-size="10" fill="currentColor" font-family="monospace">child index 0</text>
  <text x="470" y="69"  text-anchor="middle" font-size="10" fill="currentColor" opacity="0.6">pdal pipeline</text>
  <rect x="380" y="124" width="180" height="52" rx="6" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.7"/>
  <text x="470" y="146" text-anchor="middle" font-size="10" fill="currentColor" font-family="monospace">child index 1</text>
  <text x="470" y="163" text-anchor="middle" font-size="10" fill="currentColor" opacity="0.6">pdal pipeline</text>
  <rect x="380" y="218" width="180" height="52" rx="6" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.7"/>
  <text x="470" y="240" text-anchor="middle" font-size="10" fill="currentColor" font-family="monospace">child index N</text>
  <text x="470" y="257" text-anchor="middle" font-size="10" fill="currentColor" opacity="0.6">pdal pipeline</text>
  <!-- S3 -->
  <rect x="610" y="120" width="140" height="60" rx="6" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.75"/>
  <text x="680" y="144" text-anchor="middle" font-size="11" fill="currentColor" font-family="monospace">S3 bucket</text>
  <text x="680" y="162" text-anchor="middle" font-size="10" fill="currentColor" opacity="0.6">manifest + tiles</text>
  <!-- arrows -->
  <line x1="150" y1="150" x2="178" y2="150" stroke="currentColor" stroke-width="1.5" opacity="0.6" marker-end="url(#arr-batch)"/>
  <line x1="332" y1="150" x2="376" y2="56"  stroke="currentColor" stroke-width="1.5" opacity="0.6" marker-end="url(#arr-batch)"/>
  <line x1="332" y1="150" x2="376" y2="150" stroke="currentColor" stroke-width="1.5" opacity="0.6" marker-end="url(#arr-batch)"/>
  <line x1="332" y1="150" x2="376" y2="244" stroke="currentColor" stroke-width="1.5" opacity="0.6" marker-end="url(#arr-batch)"/>
  <line x1="560" y1="56"  x2="606" y2="140" stroke="currentColor" stroke-width="1" opacity="0.45" marker-end="url(#arr-batch)"/>
  <line x1="560" y1="150" x2="606" y2="150" stroke="currentColor" stroke-width="1" opacity="0.45" marker-end="url(#arr-batch)"/>
  <line x1="560" y1="244" x2="606" y2="160" stroke="currentColor" stroke-width="1" opacity="0.45" marker-end="url(#arr-batch)"/>
  <text x="470" y="292" text-anchor="middle" font-size="10" fill="currentColor" opacity="0.5">AWS_BATCH_JOB_ARRAY_INDEX selects one manifest row per container</text>
</svg>

## Prerequisites

Confirm these before submitting your first array job:

- **An AWS account with AWS Batch, ECS, EC2, and S3 access** — Batch schedules containers onto an ECS-backed compute environment running on EC2 (or Fargate).
- **A container image with PDAL installed**, pushed to Amazon ECR or another registry the compute environment can pull from. Building that image is covered in [PDAL Docker Containers](https://www.pythonlidar.com/batch-automation-cloud-integration/pdal-docker-containers/); this page assumes the image already exists and focuses on scheduling it.
- **`boto3` 1.28 or later** in your submitting environment (`pip install boto3`), configured with credentials that allow `batch:SubmitJob` and `batch:DescribeJobs`.
- **Two IAM roles**: an *instance role* for the compute environment (usually `ecsInstanceRole`) and a *job role* that your container assumes to reach S3.
- **Input tiles and a manifest in S3** — the LAZ tiles under one prefix and a newline-delimited or JSON manifest listing their keys under another.
- **A validated PDAL pipeline** that runs correctly on one tile locally. Do not debug pipeline logic and Batch plumbing at the same time; get the pipeline right first using [PDAL stage chaining](https://www.pythonlidar.com/pdal-pipeline-architecture-execution/pdal-stage-chaining/).

## Core Workflow Architecture

AWS Batch has four objects that must exist before a single tile runs, and they nest in a fixed order. The lifecycle of a tile-processing run walks through them top to bottom, then fans out:

1. **Compute environment** — a managed pool that Batch scales between `minvCpus` and `maxvCpus` by launching EC2 instances (Spot or On-Demand) as jobs demand them. This is where you choose instance families and the bid model.
2. **Job queue** — an ordered landing zone bound to one or more compute environments. Submitted jobs sit here until the environment has capacity to place them.
3. **Job definition** — the reusable template: which container image to run, how many vCPUs and how much memory each container gets, the command, the `jobRoleArn` for S3 access, and the retry strategy. Registering it returns a versioned ARN.
4. **Array job submission** — a single `submit_job` call with `arrayProperties.size = N` creates one parent job and `N` children. Batch sets `AWS_BATCH_JOB_ARRAY_INDEX` to a distinct integer `0..N-1` in each child. That index is the only thing that differs between containers.
5. **Per-tile execution** — each container reads its index, looks up row `index` in the manifest, downloads that tile from S3, runs the PDAL pipeline, and uploads the output object. Because every child is identical apart from the index, the work is embarrassingly parallel — the same property exploited by [parallel execution in PDAL](https://www.pythonlidar.com/pdal-pipeline-architecture-execution/parallel-execution/) on a single host, now spread across a fleet.
6. **Aggregation and teardown** — once the array parent reports `SUCCEEDED`, a downstream step counts output objects and stitches or indexes them. Batch scales the compute environment back to `minvCpus` automatically, so idle cost returns to zero.

The mapping in step 4 is the heart of the design. You never pass a filename to a job; you pass an index, and the index resolves to a tile through the manifest. This keeps the job definition completely generic — the same definition processes any acquisition, and the manifest is the only thing that changes between runs.

## Full Implementation

Three artefacts make up a working setup: a job definition (JSON), a submitter (boto3), and a container entrypoint (Python) that runs inside each child. They are shown in that order.

### The job definition

Register this once per pipeline change. It pins the image, resources, the S3-capable job role, and a Spot-aware retry strategy.

```json
{
  "jobDefinitionName": "pdal-tile-worker",
  "type": "container",
  "platformCapabilities": ["EC2"],
  "containerProperties": {
    "image": "123456789012.dkr.ecr.us-east-1.amazonaws.com/pdal-worker:2.6.3",
    "command": ["python", "/opt/worker/process_tile.py"],
    "jobRoleArn": "arn:aws:iam::123456789012:role/pdal-batch-job-role",
    "executionRoleArn": "arn:aws:iam::123456789012:role/ecsTaskExecutionRole",
    "resourceRequirements": [
      {"type": "VCPU", "value": "2"},
      {"type": "MEMORY", "value": "8192"}
    ],
    "environment": [
      {"name": "MANIFEST_KEY", "value": "manifests/acq_2026_east.txt"},
      {"name": "INPUT_BUCKET", "value": "lidar-raw-east"},
      {"name": "OUTPUT_BUCKET", "value": "lidar-derived-east"},
      {"name": "OUTPUT_PREFIX", "value": "dtm/acq_2026_east/"}
    ]
  },
  "retryStrategy": {
    "attempts": 3,
    "evaluateOnExit": [
      {"onStatusReason": "Host EC2*", "action": "RETRY"},
      {"onExitCode": "137", "action": "RETRY"},
      {"onReason": "*", "action": "EXIT"}
    ]
  }
}
```

### The submitter

This module reads the manifest to learn the tile count, then submits one array job sized to match. It is deliberately small — the intelligence lives in the manifest and the entrypoint, not the submitter.

```python
import boto3
import logging

logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")

batch = boto3.client("batch", region_name="us-east-1")
s3 = boto3.client("s3", region_name="us-east-1")


def count_manifest_rows(bucket: str, key: str) -> int:
    """Return the number of tile keys in a newline-delimited S3 manifest."""
    body = s3.get_object(Bucket=bucket, Key=key)["Body"].read().decode("utf-8")
    rows = [line for line in body.splitlines() if line.strip()]
    if not rows:
        raise ValueError(f"Manifest s3://{bucket}/{key} is empty.")
    return len(rows)


def submit_tile_array(
    job_name: str,
    job_queue: str,
    job_definition: str,
    manifest_bucket: str,
    manifest_key: str,
) -> str:
    """
    Submit one AWS Batch array job with one child per manifest row.

    Returns the parent jobId. Each child receives AWS_BATCH_JOB_ARRAY_INDEX
    in the range 0..size-1 and resolves it against the manifest at runtime.
    """
    size = count_manifest_rows(manifest_bucket, manifest_key)
    if size > 10_000:
        raise ValueError(
            f"Array size {size} exceeds the AWS Batch limit of 10,000 children. "
            "Split the manifest into multiple array jobs."
        )

    response = batch.submit_job(
        jobName=job_name,
        jobQueue=job_queue,
        jobDefinition=job_definition,
        arrayProperties={"size": size},
        containerOverrides={
            "environment": [
                {"name": "MANIFEST_KEY", "value": manifest_key},
                {"name": "INPUT_BUCKET", "value": manifest_bucket},
            ]
        },
    )
    job_id = response["jobId"]
    logging.info("Submitted array job %s with %d children.", job_id, size)
    return job_id


if __name__ == "__main__":
    parent = submit_tile_array(
        job_name="pdal-dtm-acq2026east",
        job_queue="pdal-spot-queue",
        job_definition="pdal-tile-worker",
        manifest_bucket="lidar-raw-east",
        manifest_key="manifests/acq_2026_east.txt",
    )
    print(f"Parent jobId: {parent}")
```

### The container entrypoint

This is the `command` the job definition invokes. It reads the array index, resolves it to a tile, and runs a ground-to-DTM PDAL pipeline. boto3 inside the container uses the job role automatically — no keys are ever handled.

```python
#!/usr/bin/env python3
"""process_tile.py — one AWS Batch array child processes one LiDAR tile."""
import json
import os
import sys
import tempfile

import boto3
import pdal

s3 = boto3.client("s3")


def resolve_tile_key(bucket: str, manifest_key: str, index: int) -> str:
    """Return the tile S3 key at row `index` of the manifest."""
    body = s3.get_object(Bucket=bucket, Key=manifest_key)["Body"].read().decode("utf-8")
    keys = [line.strip() for line in body.splitlines() if line.strip()]
    if index >= len(keys):
        raise IndexError(f"Array index {index} out of range for {len(keys)} tiles.")
    return keys[index]


def run_dtm_pipeline(local_in: str, local_out: str, resolution: float = 1.0) -> int:
    """Classify ground with SMRF and rasterise a DTM GeoTIFF. Returns point count."""
    pipeline = {
        "pipeline": [
            {"type": "readers.las", "filename": local_in},
            {"type": "filters.smrf", "slope": 0.15, "window": 18.0, "threshold": 0.45},
            {"type": "filters.range", "limits": "Classification[2:2]"},
            {
                "type": "writers.gdal",
                "filename": local_out,
                "resolution": resolution,
                "output_type": "idw",
                "gdaldriver": "GTiff",
            },
        ]
    }
    p = pdal.Pipeline(json.dumps(pipeline))
    p.validate()
    return p.execute()


def main() -> None:
    index = int(os.environ["AWS_BATCH_JOB_ARRAY_INDEX"])
    in_bucket = os.environ["INPUT_BUCKET"]
    out_bucket = os.environ["OUTPUT_BUCKET"]
    out_prefix = os.environ["OUTPUT_PREFIX"]
    manifest_key = os.environ["MANIFEST_KEY"]

    tile_key = resolve_tile_key(in_bucket, manifest_key, index)
    stem = os.path.splitext(os.path.basename(tile_key))[0]

    with tempfile.TemporaryDirectory() as tmp:
        local_in = os.path.join(tmp, "tile.laz")
        local_out = os.path.join(tmp, f"{stem}_dtm.tif")

        s3.download_file(in_bucket, tile_key, local_in)
        count = run_dtm_pipeline(local_in, local_out)
        if count == 0:
            print(f"WARNING: tile {tile_key} produced 0 points", file=sys.stderr)

        out_key = f"{out_prefix}{stem}_dtm.tif"
        s3.upload_file(local_out, out_bucket, out_key)
        print(f"index={index} tile={tile_key} points={count} -> s3://{out_bucket}/{out_key}")


if __name__ == "__main__":
    main()
```

<svg viewBox="0 0 720 272" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="How an AWS Batch job definition, queue and compute environment fit together" style="width:100%;max-width:720px;display:block;margin:1.6rem auto">
  <title>Three Batch objects, and which one holds which setting</title>
  <desc>A job definition holds the container image, the vCPU and memory request and the retry strategy. A job queue holds priority and points at one or more compute environments. A compute environment holds the instance types, the spot bid and the maximum vCPUs. Submitting an array job names a definition and a queue, and every scaling limit you hit lives in the third box.</desc>
  <rect x="0" y="0" width="720" height="272" fill="var(--dg-bg)" rx="10"/>
  <defs><marker id="bat-arw" markerWidth="9" markerHeight="7" refX="9" refY="3.5" orient="auto"><path d="M0,0 L0,7 L9,3.5 z" fill="var(--dg-line)"/></marker></defs>
  <rect x="20" y="56" width="200" height="120" rx="8" fill="var(--dg-a-soft)" stroke="var(--dg-a)" stroke-width="1.4"/>
  <text x="120" y="80" text-anchor="middle" font-size="12" font-weight="600" fill="var(--dg-text)">job definition</text>
  <text x="120" y="106" text-anchor="middle" font-size="10.5" fill="var(--dg-muted)">container image</text>
  <text x="120" y="128" text-anchor="middle" font-size="10.5" fill="var(--dg-muted)">vCPU and memory</text>
  <text x="120" y="150" text-anchor="middle" font-size="10.5" fill="var(--dg-muted)">retry strategy</text>
  <rect x="260" y="56" width="200" height="120" rx="8" fill="var(--dg-c-soft)" stroke="var(--dg-c)" stroke-width="1.4"/>
  <text x="360" y="80" text-anchor="middle" font-size="12" font-weight="600" fill="var(--dg-text)">job queue</text>
  <text x="360" y="106" text-anchor="middle" font-size="10.5" fill="var(--dg-muted)">priority</text>
  <text x="360" y="128" text-anchor="middle" font-size="10.5" fill="var(--dg-muted)">which environments</text>
  <text x="360" y="150" text-anchor="middle" font-size="10.5" fill="var(--dg-muted)">and in what order</text>
  <rect x="500" y="56" width="200" height="120" rx="8" fill="var(--dg-d-soft)" stroke="var(--dg-d)" stroke-width="1.4"/>
  <text x="600" y="80" text-anchor="middle" font-size="12" font-weight="600" fill="var(--dg-text)">compute environment</text>
  <text x="600" y="106" text-anchor="middle" font-size="10.5" fill="var(--dg-muted)">instance types</text>
  <text x="600" y="128" text-anchor="middle" font-size="10.5" fill="var(--dg-muted)">spot bid percentage</text>
  <text x="600" y="150" text-anchor="middle" font-size="10.5" fill="var(--dg-muted)">max vCPUs — the ceiling</text>
  <line x1="220" y1="116" x2="254" y2="116" stroke="var(--dg-line)" stroke-width="1.5" marker-end="url(#bat-arw)"/>
  <line x1="460" y1="116" x2="494" y2="116" stroke="var(--dg-line)" stroke-width="1.5" marker-end="url(#bat-arw)"/>
  <rect x="20" y="200" width="680" height="34" rx="7" fill="var(--dg-surface)" stroke="var(--dg-line-soft)" stroke-width="1.2"/>
  <text x="34" y="222" font-size="11" fill="var(--dg-text)">submit_job(arrayProperties={"size": 12500}) names the first two — and runs at the speed the third one allows</text>
  <text x="20" y="260" font-size="10.5" fill="var(--dg-muted)">when 12,500 tiles run at a steady 40 concurrent, the max vCPUs of the compute environment is what to raise, not the array size</text>
  <text x="20" y="40" font-size="10.5" fill="var(--dg-muted)">the three objects, and the setting each one owns</text>
</svg>

## Code Breakdown

### Index resolution is the whole trick

`AWS_BATCH_JOB_ARRAY_INDEX` is set by Batch, not by you. The submitter never names a tile — it only declares how many children to make. Each child converts its index into a filename by reading the same manifest, so a run of 4,000 tiles needs exactly one `submit_job` call and one manifest, not 4,000 API calls. If you later reprocess only the failures, you write a smaller manifest and submit a smaller array; the entrypoint code never changes.

### The job role, not baked keys

`jobRoleArn` points at an IAM role that Batch surfaces to the container through the ECS task credential endpoint. When boto3 constructs `s3` inside `process_tile.py`, it walks its credential chain, finds those task credentials, and uses them transparently. This is why the entrypoint has no `aws_access_key_id` anywhere. The role needs `s3:GetObject` on the input bucket and `s3:PutObject` on the output bucket — nothing more.

### Temporary storage discipline

Each child writes into a `TemporaryDirectory` that is deleted on exit. Batch containers share the instance's disk with any co-scheduled siblings, so leaking large intermediate files causes `No space left on device` failures that look mysterious. Downloading, processing, and uploading within a scoped temp directory keeps the per-container footprint predictable and lets you size instance storage against a single tile rather than a whole acquisition.

### The retry strategy earns its keep on Spot

The `evaluateOnExit` rules retry Spot reclamations (`Host EC2*` status reasons) and out-of-memory kills (exit code `137`) but exit immediately on anything else, so a genuine pipeline bug fails fast instead of burning three attempts. This is what makes Spot safe for tile work: an interrupted tile is indistinguishable from one that never started, because the operation is idempotent.

## Parameter Reference Table

| Object | Parameter | Type | Typical value | Effect |
|--------|-----------|------|---------------|--------|
| compute env | `minvCpus` | int | 0 | Idle floor; 0 means scale to nothing between runs |
| compute env | `maxvCpus` | int | 256 | Hard ceiling on concurrent vCPUs across all children |
| compute env | `type` (bid) | string | `SPOT` | `SPOT` for cost, `EC2` (On-Demand) for guaranteed capacity |
| job definition | `resourceRequirements` VCPU | string | `"2"` | vCPUs pinned to each container |
| job definition | `resourceRequirements` MEMORY | string | `"8192"` | Hard memory limit (MiB); exceeding it triggers exit 137 |
| job definition | `jobRoleArn` | string (ARN) | — | IAM role the container assumes for S3 access |
| job definition | `retryStrategy.attempts` | int | 3 | Max attempts per child before it is marked FAILED |
| submit_job | `arrayProperties.size` | int | tile count | Number of children; max 10,000 |
| submit_job | `containerOverrides.environment` | list | manifest vars | Per-submission overrides without re-registering the definition |
| container | `AWS_BATCH_JOB_ARRAY_INDEX` | int (env) | 0..size-1 | Injected by Batch; selects the manifest row |

## Validation and Integrity Checks

Validation happens at two levels: the array as a whole, and the objects it produced.

Poll the parent job for its child status summary. A healthy run ends with every child `SUCCEEDED`:

```python
import boto3

batch = boto3.client("batch", region_name="us-east-1")


def array_status(job_id: str) -> dict:
    job = batch.describe_jobs(jobs=[job_id])["jobs"][0]
    summary = job["arrayProperties"]["statusSummary"]
    print(
        f"SUCCEEDED={summary.get('SUCCEEDED', 0)} "
        f"FAILED={summary.get('FAILED', 0)} "
        f"RUNNING={summary.get('RUNNING', 0)} "
        f"RUNNABLE={summary.get('RUNNABLE', 0)}"
    )
    return summary
```

Then confirm the output object count matches the tile count — a per-child success does not guarantee an upload if the pipeline emitted zero points:

```python
def count_outputs(bucket: str, prefix: str) -> int:
    s3 = boto3.client("s3")
    paginator = s3.get_paginator("list_objects_v2")
    n = 0
    for page in paginator.paginate(Bucket=bucket, Prefix=prefix):
        n += len(page.get("Contents", []))
    return n


assert count_outputs("lidar-derived-east", "dtm/acq_2026_east/") == 4000
```

For anything that ran, the container log stream in CloudWatch (log group `/aws/batch/job`) carries the `index=... points=...` line printed by the entrypoint. Grepping those lines reconstructs exactly which tiles produced how many points, which is invaluable when a handful of tiles come back suspiciously empty.

<svg viewBox="0 0 720 250" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="A spot interruption two minutes into a tile and the work it costs" style="width:100%;max-width:720px;display:block;margin:1.6rem auto">
  <title>What a spot reclaim actually costs you</title>
  <desc>A tile job timeline. Six minutes of work is interrupted at four minutes by a spot reclaim notice with a two minute warning. Without checkpointing the whole four minutes is lost and the retry starts over. With the output written per sub-tile the retry resumes from the last durable object and loses only the sub-tile in flight.</desc>
  <rect x="0" y="0" width="720" height="250" fill="var(--dg-bg)" rx="10"/>
  <text x="20" y="46" font-size="11.5" font-weight="600" fill="var(--dg-e)">no checkpointing</text>
  <rect x="180" y="30" width="380" height="26" rx="4" fill="var(--dg-e-soft)" stroke="var(--dg-e)" stroke-width="1.2"/>
  <rect x="560" y="30" width="120" height="26" rx="4" fill="var(--dg-surface-2)" stroke="var(--dg-line-soft)" stroke-width="1.2"/>
  <text x="620" y="48" text-anchor="middle" font-size="10" fill="var(--dg-muted)">lost</text>
  <text x="370" y="48" text-anchor="middle" font-size="10.5" fill="var(--dg-text)">4 min of work, all of it discarded</text>
  <text x="20" y="106" font-size="11.5" font-weight="600" fill="var(--dg-d)">sub-tile checkpoints</text>
  <rect x="180" y="90" width="70" height="26" rx="4" fill="var(--dg-d-soft)" stroke="var(--dg-d)" stroke-width="1.2"/>
  <text x="215" y="108" text-anchor="middle" font-size="9.5" fill="var(--dg-text)">saved</text>
  <rect x="256" y="90" width="70" height="26" rx="4" fill="var(--dg-d-soft)" stroke="var(--dg-d)" stroke-width="1.2"/>
  <text x="291" y="108" text-anchor="middle" font-size="9.5" fill="var(--dg-text)">saved</text>
  <rect x="332" y="90" width="70" height="26" rx="4" fill="var(--dg-d-soft)" stroke="var(--dg-d)" stroke-width="1.2"/>
  <text x="367" y="108" text-anchor="middle" font-size="9.5" fill="var(--dg-text)">saved</text>
  <rect x="408" y="90" width="70" height="26" rx="4" fill="var(--dg-c-soft)" stroke="var(--dg-c)" stroke-width="1.2"/>
  <text x="443" y="108" text-anchor="middle" font-size="9.5" fill="var(--dg-text)">in flight</text>
  <text x="500" y="108" font-size="10.5" fill="var(--dg-d)">retry resumes here — 45 s lost, not 4 min</text>
  <line x1="560" y1="20" x2="560" y2="130" stroke="var(--dg-c)" stroke-width="2" stroke-dasharray="5 4"/>
  <text x="552" y="150" text-anchor="end" font-size="10.5" fill="var(--dg-c)">reclaim notice — two minutes of warning</text>
  <text x="20" y="182" font-size="10.5" fill="var(--dg-muted)">trap SIGTERM in the entrypoint: the two minute warning is enough to flush the current sub-tile and write its marker,</text>
  <text x="20" y="202" font-size="10.5" fill="var(--dg-muted)">which turns an interruption from lost work into a resumption point.</text>
  <text x="20" y="230" font-size="10.5" fill="var(--dg-muted)">Spot is roughly a third of the on-demand price; at a 5% interruption rate the arithmetic is not close.</text>
</svg>

## Performance and Cost

Two independent levers govern both wall-clock time and dollar cost: how much each container gets, and how many run at once.

| Lever | Setting | Effect on speed | Effect on cost |
|-------|---------|-----------------|----------------|
| vCPU per child | 1 → 4 | Faster per-tile SMRF and interpolation, up to the pipeline's parallel ceiling | More vCPU-hours per tile |
| memory per child | 4 GB → 16 GB | Prevents exit 137 on dense tiles; no speed gain once sufficient | Larger instances, higher hourly rate |
| `maxvCpus` | 64 → 512 | More children run concurrently, shorter total run | Same total vCPU-hours; only the completion time changes |
| bid model | On-Demand → Spot | Neutral to slightly slower under reclamation | Typically 60–70% cheaper |

Practical guidance:

- **Size memory to the densest tile, not the average.** A 2 vCPU / 8 GB container comfortably handles typical airborne tiles at 8–20 pts/m². TLS or dense urban tiles above 500 pts/m² may need 16 GB; the alternative is pre-splitting them, as covered in [memory management](https://www.pythonlidar.com/pdal-pipeline-architecture-execution/memory-management/).
- **`maxvCpus` sets your parallelism, not your bill.** Total vCPU-hours are fixed by the work; raising `maxvCpus` from 128 to 512 finishes a 4,000-tile run roughly four times faster at the same total cost, minus a little Spot price variance.
- **Match vCPUs to the pipeline's real parallel width.** SMRF and `writers.gdal` interpolation parallelise well; a serial-heavy pipeline gains nothing from 4 vCPUs and wastes the reservation. Benchmark one tile at 1, 2, and 4 vCPUs before committing, the same way you would when [optimizing PDAL for multi-core processing](https://www.pythonlidar.com/pdal-pipeline-architecture-execution/parallel-execution/optimizing-pdal-for-multi-core-processing/).
- **Spot is the default for idempotent tiles.** With a retry strategy in place, reclamations cost a restart, not a failure. Keep On-Demand for a single aggregation job that must not be interrupted.

## Common Errors and Troubleshooting

**Jobs stuck in `RUNNABLE` and never starting.**
The compute environment cannot place them. Check, in order: is `maxvCpus` already fully consumed by earlier children; is a child's vCPU/memory request larger than any allowed instance type provides; is there a Spot capacity shortage in the chosen instance families; and is the instance role attached and valid. Widen the allowed instance types or raise `maxvCpus`, and confirm the environment status is `VALID` not `INVALID`.

**`AccessDenied` when the container touches S3.**
The job role is missing a permission or was not attached. Confirm `jobRoleArn` is set on the job definition (the *job* role, not the *execution* role — the execution role only pulls the image and writes logs). The job role must grant `s3:GetObject` on the input prefix and `s3:PutObject` on the output prefix. A common trap is granting access to `arn:aws:s3:::bucket` but not `arn:aws:s3:::bucket/*`; object operations need the `/*` resource.

**Containers dying with exit code 137.**
137 is a SIGKILL from the out-of-memory killer: the pipeline asked for more memory than the job definition's `MEMORY` limit. Either raise the limit for that job definition or reduce the per-container footprint by lowering PDAL's `chunk_size` or pre-tiling the densest inputs. Because the retry strategy retries 137, a truly oversized tile will fail three times and then surface as `FAILED` — check the CloudWatch log for the tile key on the last attempt.

**A few children `FAILED` while most `SUCCEEDED`.**
This is normal at scale and is exactly what array jobs are built for. Read the failed children's index values from `describe_jobs` (append `:index` to the parent job ID to inspect one child), map them back to tile keys through the manifest, write those keys into a new smaller manifest, and resubmit a small array. Never rerun the whole array to recover a handful of tiles.

**`submit_job` rejected with an array size error.**
AWS Batch caps an array at 10,000 children. A larger acquisition must be split into several array jobs over manifest shards — the [scaling PDAL tile processing with AWS Batch](https://www.pythonlidar.com/batch-automation-cloud-integration/aws-batch-processing/scaling-pdal-tile-processing-with-aws-batch/) walkthrough shows the sharding loop end to end.

## Frequently Asked Questions

**How does one AWS Batch array child map to a single PDAL tile?**

AWS Batch injects `AWS_BATCH_JOB_ARRAY_INDEX` into every array child, running from 0 to `size-1`. The container reads that integer, uses it to look up the corresponding tile key in a manifest stored in S3, downloads that one tile, runs the PDAL pipeline, and uploads the result. Nothing else differs between children, so one index equals one tile.

**Why is my AWS Batch job stuck in RUNNABLE?**

A job stays RUNNABLE when the compute environment cannot place it. The usual causes are a `maxvCpus` ceiling already consumed by other children, a vCPU or memory request larger than any instance type the environment allows, a Spot capacity shortage in the chosen instance families, or a missing instance role. Check the compute environment status and raise `maxvCpus` or widen the allowed instance types.

**Should PDAL tile jobs use Spot or On-Demand instances?**

Spot is the right default for tile processing because each child is idempotent and short-lived, so an interrupted tile simply retries on another instance. Set two or three attempts with an `evaluateOnExit` rule that retries Spot reclamation reasons. Reserve On-Demand for the small number of jobs that must not be interrupted, such as a final aggregation step.

**How do I give the PDAL container access to S3 without embedding keys?**

Attach an IAM job role to the job definition through `jobRoleArn`. AWS Batch exposes that role to the container through the ECS task credentials endpoint, and boto3 picks it up automatically. Grant the role `s3:GetObject` on the input prefix and `s3:PutObject` on the output prefix. Never bake long-lived access keys into the image.

**Can I reuse one job definition for different pipelines?**

Yes. Keep the pipeline-agnostic bits — image, role, retries — in the job definition, and pass acquisition-specific values (manifest key, output prefix) through `containerOverrides.environment` at submit time. You only re-register the definition when the image, resources, or role change, not for every new acquisition.

---

## Related

- [Batch Automation and Cloud Integration for PDAL](https://www.pythonlidar.com/batch-automation-cloud-integration/) — parent overview of containerised and cloud-scheduled PDAL workflows
- [Scaling PDAL Tile Processing with AWS Batch](https://www.pythonlidar.com/batch-automation-cloud-integration/aws-batch-processing/scaling-pdal-tile-processing-with-aws-batch/) — a full worked ground-to-DTM fan-out with manifest sharding and failure recovery
- [PDAL Docker Containers](https://www.pythonlidar.com/batch-automation-cloud-integration/pdal-docker-containers/) — building the PDAL image that each Batch child runs
- [S3 Cloud Storage I/O](https://www.pythonlidar.com/batch-automation-cloud-integration/s3-cloud-storage-io/) — reading and writing point clouds and rasters directly against S3
- [Airflow DAG Orchestration](https://www.pythonlidar.com/batch-automation-cloud-integration/airflow-dag-orchestration/) — coordinating Batch submissions and aggregation as a scheduled DAG
- [Parallel Execution](https://www.pythonlidar.com/pdal-pipeline-architecture-execution/parallel-execution/) — the single-host parallelism model that Batch spreads across a fleet
