---
title: "Batch Automation and Cloud Integration for PDAL"
description: "Scaling PDAL point cloud processing beyond one machine: containerised pipelines, AWS Batch tile fan-out, streaming LAZ and Cloud-Optimized GeoTIFF I/O against S3, and Airflow DAG orchestration for reproducible production workflows."
slug: "batch-automation-cloud-integration"
type: "guide"
breadcrumb: "Batch & Cloud Automation"
datePublished: "2024-07-01"
dateModified: "2026-07-12"
---

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Article",
      "headline": "Batch Automation and Cloud Integration for PDAL",
      "description": "Scaling PDAL point cloud processing beyond one machine: containerised pipelines, AWS Batch tile fan-out, streaming LAZ and Cloud-Optimized GeoTIFF I/O against S3, and Airflow DAG orchestration for reproducible production workflows.",
      "datePublished": "2024-07-01",
      "dateModified": "2026-07-12",
      "author": { "@type": "Organization", "name": "pythonlidar.com" },
      "publisher": { "@type": "Organization", "name": "pythonlidar.com" }
    },
    {
      "@type": "BreadcrumbList",
      "itemListElement": [
        { "@type": "ListItem", "position": 1, "name": "Home", "item": "https://www.pythonlidar.com/" },
        { "@type": "ListItem", "position": 2, "name": "Batch Automation and Cloud Integration for PDAL", "item": "https://www.pythonlidar.com/batch-automation-cloud-integration/" }
      ]
    },
    {
      "@type": "HowTo",
      "name": "Run a PDAL Tile Job at Scale on AWS Batch",
      "step": [
        { "@type": "HowToStep", "name": "Build and pin a PDAL Docker image", "text": "Base your worker image on the official ghcr.io/pdal/pdal tag, add boto3 and your entrypoint, and pin the tag to a specific PDAL version so every container in the fleet runs identical stage code." },
        { "@type": "HowToStep", "name": "Publish a tile manifest to S3", "text": "Enumerate the input LAZ tiles once and write a manifest object to S3, or derive the tile key for each array index from a deterministic naming scheme so each job knows exactly which tile it owns." },
        { "@type": "HowToStep", "name": "Submit an AWS Batch array job", "text": "Register a job definition referencing the image and an IAM job role, then submit an array job whose size equals the tile count so the scheduler fans out one container per tile across the compute environment." },
        { "@type": "HowToStep", "name": "Stream the tile, run the pipeline, write a COG", "text": "Each container reads its LAZ tile through the /vsis3/ virtual file system, runs the PDAL pipeline, and writes a Cloud-Optimized GeoTIFF DTM back to an S3 output prefix without staging the whole dataset locally." },
        { "@type": "HowToStep", "name": "Orchestrate and monitor with Airflow", "text": "Wrap manifest generation, job submission, and validation in an Airflow DAG so retries, backfills, and per-tile status are visible and reproducible across runs." }
      ]
    },
    {
      "@type": "FAQPage",
      "mainEntity": [
        {
          "@type": "Question",
          "name": "Why parallelise PDAL across containers instead of threads inside one pipeline?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "A single PDAL pipeline is largely single-threaded, and the parts that use OpenMP contend for the same cores and memory. Point cloud tiles are naturally independent, so running one container per tile gives near-linear scaling with no shared-state locking, isolates memory pressure per job, and lets a scheduler like AWS Batch or Airflow retry a failed tile without touching the others."
          }
        },
        {
          "@type": "Question",
          "name": "How does PDAL read a LAZ file directly from S3 without downloading it first?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "PDAL uses GDAL's virtual file system. Prefix the object path with /vsis3/ (using AWS credentials from the environment or instance role) or /vsicurl/ (for a public HTTPS URL) in the readers.las filename. GDAL issues HTTP range requests so only the byte ranges the reader needs are fetched, avoiding a full local copy of the tile."
          }
        },
        {
          "@type": "Question",
          "name": "What makes a GeoTIFF a Cloud-Optimized GeoTIFF, and how do I write one from PDAL?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "A COG is an internally tiled, overview-bearing GeoTIFF laid out so HTTP range requests can fetch a single tile or zoom level. Write it from writers.gdal by targeting the COG GDAL driver (gdaldriver set to COG) or by setting internal tiling and overviews. The result can be served straight from S3 and read partially by web map clients."
          }
        },
        {
          "@type": "Question",
          "name": "How do I keep AWS Batch jobs idempotent so retries do not corrupt output?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Make each job a pure function of its tile key: read one input tile, write one deterministically named output object. Write to a temporary key and copy to the final key only on success, or rely on S3's atomic single-object PUT, so a retried job overwrites its own partial output rather than appending. Never let two tiles share an output path."
          }
        },
        {
          "@type": "Question",
          "name": "Should I use AWS Batch or Airflow to run a large tile campaign?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "They solve different problems and are often combined. AWS Batch is the execution layer that provisions compute and fans a single array job out across thousands of containers. Airflow is the orchestration layer that sequences stages, generates the manifest, submits the Batch job, waits for completion, and runs validation, giving you retries, scheduling, and lineage. Use Airflow to drive Batch."
          }
        }
      ]
    }
  ]
}
</script>

A single regional LiDAR campaign routinely produces thousands of LAZ tiles and terabytes of raw points — a statewide 3DEP block, a corridor mapping survey, or a repeat-flown mine site. Processing that volume on one workstation, one tile at a time, is neither fast enough nor reproducible enough for production delivery. This guide covers how to take a PDAL pipeline that runs correctly on your laptop and scale it across a cloud fleet: packaging it in a Docker container, fanning it out over independent tile jobs with AWS Batch, streaming inputs and outputs directly against S3 through GDAL's virtual file systems, and orchestrating the whole campaign with Airflow so every run is versioned, retryable, and auditable. The design principle throughout is simple — each tile is an independent, stateless unit of work — and everything else follows from it.

---

<svg viewBox="0 0 860 300" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Cloud tile-processing architecture from an S3 manifest through a job queue to containerised PDAL workers writing COG outputs back to S3" style="width:100%;max-width:860px;display:block;margin:1.5rem auto">
  <title>Containerised PDAL Tile Fan-Out on the Cloud</title>
  <desc>A tile manifest stored in S3 feeds a job queue driven by AWS Batch or Airflow, which fans work out to N identical containerised PDAL workers. Each worker streams one LAZ tile from S3, runs a pipeline, and writes a Cloud-Optimized GeoTIFF DTM back to S3.</desc>
  <defs>
    <marker id="arr-cloud" markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto">
      <polygon points="0 0, 8 3, 0 6" fill="currentColor" opacity="0.6"/>
    </marker>
  </defs>
  <!-- Manifest / S3 input -->
  <rect x="20" y="115" width="150" height="70" rx="6" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.8"/>
  <text x="95" y="142" text-anchor="middle" font-size="13" fill="currentColor" font-family="system-ui,sans-serif" font-weight="600">S3 Tile Manifest</text>
  <text x="95" y="160" text-anchor="middle" font-size="11" fill="currentColor" font-family="system-ui,sans-serif" opacity="0.75">tiles/*.laz</text>
  <text x="95" y="174" text-anchor="middle" font-size="11" fill="currentColor" font-family="system-ui,sans-serif" opacity="0.75">manifest.json</text>
  <!-- Arrow to queue -->
  <line x1="170" y1="150" x2="222" y2="150" stroke="currentColor" stroke-width="1.5" marker-end="url(#arr-cloud)" opacity="0.6"/>
  <!-- Job queue -->
  <rect x="224" y="115" width="160" height="70" rx="6" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.8"/>
  <text x="304" y="142" text-anchor="middle" font-size="13" fill="currentColor" font-family="system-ui,sans-serif" font-weight="600">Job Queue</text>
  <text x="304" y="160" text-anchor="middle" font-size="11" fill="currentColor" font-family="system-ui,sans-serif" opacity="0.75">AWS Batch array</text>
  <text x="304" y="174" text-anchor="middle" font-size="11" fill="currentColor" font-family="system-ui,sans-serif" opacity="0.75">Airflow DAG</text>
  <!-- Fan-out arrows -->
  <line x1="384" y1="140" x2="452" y2="70" stroke="currentColor" stroke-width="1.5" marker-end="url(#arr-cloud)" opacity="0.6"/>
  <line x1="384" y1="150" x2="452" y2="150" stroke="currentColor" stroke-width="1.5" marker-end="url(#arr-cloud)" opacity="0.6"/>
  <line x1="384" y1="160" x2="452" y2="230" stroke="currentColor" stroke-width="1.5" marker-end="url(#arr-cloud)" opacity="0.6"/>
  <text x="418" y="108" text-anchor="middle" font-size="10" fill="currentColor" font-family="system-ui,sans-serif" opacity="0.55">fan-out</text>
  <!-- Worker 1 -->
  <rect x="454" y="40" width="188" height="58" rx="6" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.8"/>
  <text x="548" y="63" text-anchor="middle" font-size="12" fill="currentColor" font-family="system-ui,sans-serif" font-weight="600">PDAL Worker 1</text>
  <text x="548" y="82" text-anchor="middle" font-size="10" fill="currentColor" font-family="system-ui,sans-serif" opacity="0.75">docker · pdal · boto3</text>
  <!-- Worker 2 -->
  <rect x="454" y="121" width="188" height="58" rx="6" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.8"/>
  <text x="548" y="144" text-anchor="middle" font-size="12" fill="currentColor" font-family="system-ui,sans-serif" font-weight="600">PDAL Worker 2</text>
  <text x="548" y="163" text-anchor="middle" font-size="10" fill="currentColor" font-family="system-ui,sans-serif" opacity="0.75">streams /vsis3/ tile</text>
  <!-- Worker N -->
  <rect x="454" y="202" width="188" height="58" rx="6" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.8"/>
  <text x="548" y="225" text-anchor="middle" font-size="12" fill="currentColor" font-family="system-ui,sans-serif" font-weight="600">PDAL Worker N</text>
  <text x="548" y="244" text-anchor="middle" font-size="10" fill="currentColor" font-family="system-ui,sans-serif" opacity="0.75">runs pipeline</text>
  <!-- Arrows to output -->
  <line x1="642" y1="69" x2="708" y2="130" stroke="currentColor" stroke-width="1.5" marker-end="url(#arr-cloud)" opacity="0.6"/>
  <line x1="642" y1="150" x2="708" y2="150" stroke="currentColor" stroke-width="1.5" marker-end="url(#arr-cloud)" opacity="0.6"/>
  <line x1="642" y1="231" x2="708" y2="170" stroke="currentColor" stroke-width="1.5" marker-end="url(#arr-cloud)" opacity="0.6"/>
  <text x="676" y="108" text-anchor="middle" font-size="10" fill="currentColor" font-family="system-ui,sans-serif" opacity="0.55">write COG</text>
  <!-- S3 output -->
  <rect x="710" y="115" width="140" height="70" rx="6" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.8"/>
  <text x="780" y="142" text-anchor="middle" font-size="13" fill="currentColor" font-family="system-ui,sans-serif" font-weight="600">S3 Output</text>
  <text x="780" y="160" text-anchor="middle" font-size="11" fill="currentColor" font-family="system-ui,sans-serif" opacity="0.75">dtm/*.tif</text>
  <text x="780" y="174" text-anchor="middle" font-size="11" fill="currentColor" font-family="system-ui,sans-serif" opacity="0.75">COG rasters</text>
  <!-- Caption -->
  <text x="430" y="290" text-anchor="middle" font-size="10" fill="currentColor" font-family="system-ui,sans-serif" opacity="0.5">Each worker is stateless and idempotent: one tile in, one deterministically named COG out — any tile can be retried independently</text>
</svg>

## Why Regional Campaigns Demand Cloud-Backed Batch Processing

The economics of point cloud processing change completely once a dataset crosses from a handful of tiles into the thousands. A single tile — say a one-kilometre-square block of classified airborne LiDAR — might take two to ten minutes to clean, classify, and rasterise into a terrain model. Multiply that by four thousand tiles and a serial run stretches into days of wall-clock time, all bottlenecked on one machine's cores and one machine's disk. Worse, that machine holds all the state: if it crashes at tile 2,600, you are left reconstructing which outputs are valid and which are half-written.

Cloud-backed batch processing dissolves both problems. Because the tiles are spatially independent, the work is embarrassingly parallel: a hundred containers each processing forty tiles finish in roughly one-hundredth of the wall-clock time of a serial run, and you pay only for the compute-minutes you actually consume. Object storage such as S3 becomes the single source of truth for both inputs and outputs, so no worker holds irreplaceable state. And containerisation guarantees that the PDAL, GDAL, and PROJ versions that produced last quarter's deliverable are byte-for-byte the versions that produce this quarter's — the reproducibility that regulated survey work and scientific datasets require.

This guide builds on the execution fundamentals in [PDAL Pipeline Architecture & Execution](https://www.pythonlidar.com/pdal-pipeline-architecture-execution/). The pipelines you scale here are the same JSON stage graphs described there; what changes is where they run and how many run at once.

## Conceptual Architecture: Stateless, Idempotent Tile Jobs

The architecture rests on three ideas that reinforce one another.

**Statelessness.** A worker container starts, reads exactly one input tile, produces exactly one output, and exits. It keeps nothing on local disk that another job needs, and it depends on nothing that a previous job left behind. Any worker can process any tile; workers are interchangeable. This is what lets a scheduler place jobs on spot instances that may be reclaimed at any moment — losing a worker costs at most one tile's work.

**Idempotency.** Running the same tile job twice produces the same output and no side effects beyond overwriting that tile's own output object. This is the property that makes retries safe. When a network blip or a spot reclamation kills a job at tile 2,600, the scheduler simply re-runs index 2,600; because the job is a pure function of its tile key, the re-run overwrites any partial output cleanly. Idempotency requires deterministic output naming — `dtm/tile_6342_NE.tif` is derived from the input key, never from a timestamp or a random suffix.

**File-level parallelism over intra-pipeline threading.** PDAL's own concurrency inside a single pipeline is limited: most stages are single-threaded, and the OpenMP-accelerated ground filters saturate only a few cores while contending for shared memory. Distributing whole tiles across separate processes and separate containers sidesteps that ceiling entirely — there is no shared point table, no lock contention, and each container's memory footprint is isolated. This is the same principle explored in [Parallel Execution](https://www.pythonlidar.com/pdal-pipeline-architecture-execution/parallel-execution/) and [Optimizing PDAL for Multi-Core Processing](https://www.pythonlidar.com/pdal-pipeline-architecture-execution/parallel-execution/optimizing-pdal-for-multi-core-processing/), lifted from one machine's cores to a fleet's nodes.

The glue that makes stateless, idempotent jobs practical against cloud storage is GDAL's **virtual file system layer**, which PDAL inherits. Two virtual prefixes matter most:

- `/vsis3/` — reads and writes S3 objects using AWS credentials resolved from the environment, a shared config file, or an EC2/ECS instance role. A filename like `/vsis3/lidar-prod/tiles/tile_6342_NE.laz` is treated as a seekable file, with GDAL issuing HTTP range requests under the hood so only the byte ranges a reader needs are transferred.
- `/vsicurl/` — reads any object exposed over plain HTTP/HTTPS, ideal for public datasets or pre-signed URLs where no AWS credentials are in play.

Because these virtual systems support range reads, a worker never has to download an entire multi-gigabyte tile before it starts. It streams. That single fact is what keeps per-container memory and local disk small enough to pack many workers onto modest instances.

## Core Components

Four technologies do the heavy lifting. Their roles are distinct and composable.

| Component | Role in the stack | Key artefacts / parameters |
|---|---|---|
| **Docker** (`ghcr.io/pdal/pdal`) | Packages PDAL, GDAL, PROJ, and your entrypoint into one immutable image so every worker runs identical code | Pinned image tag, `ENTRYPOINT`, added `boto3`/deps, `WORKDIR` |
| **AWS Batch** | Provisions compute and fans a single array job out to N containers, one per tile index | Job definition (image, vCPU, memory, `jobRoleArn`), array job `size`, compute environment (`SPOT`/`EC2`), job queue |
| **S3 readers/writers** | The durable input and output store, streamed in place via GDAL virtual file systems | `readers.las` with `/vsis3/` filename; `writers.gdal` COG output to `/vsis3/`; IAM read/write scoping |
| **Airflow** | Orchestrates the campaign: builds the manifest, submits Batch jobs, waits, validates, retries | DAG, `BatchOperator`/`PythonOperator`, `XCom` for passing the manifest key, `retries`/`retry_delay` |

Docker and AWS Batch are covered in depth in [PDAL Docker Containers](https://www.pythonlidar.com/batch-automation-cloud-integration/pdal-docker-containers/) and [AWS Batch Processing](https://www.pythonlidar.com/batch-automation-cloud-integration/aws-batch-processing/). The S3 streaming and COG-writing mechanics have their own detailed treatments in [S3 Cloud Storage I/O](https://www.pythonlidar.com/batch-automation-cloud-integration/s3-cloud-storage-io/), and the DAG patterns in [Airflow DAG Orchestration](https://www.pythonlidar.com/batch-automation-cloud-integration/airflow-dag-orchestration/).

## Annotated Reference: Image, Pipeline, and Entrypoint

Three artefacts define a worker. First, the Docker image. It starts from the official PDAL image so the geospatial stack is already correct, adds the AWS SDK, and installs a thin entrypoint script.

```dockerfile
# Pin to a specific PDAL release — never :latest in production
FROM ghcr.io/pdal/pdal:2.6.3

# boto3 for S3 manifest access; PDAL, GDAL, PROJ already present
RUN python3 -m pip install --no-cache-dir boto3==1.34.84

WORKDIR /work
COPY worker.py /work/worker.py

# The container's whole job: process one tile identified by env vars
ENTRYPOINT ["python3", "/work/worker.py"]
```

Second, the pipeline. It reads a LAZ tile straight from S3 through `/vsis3/`, cleans and classifies ground, and rasterises a bare-earth DTM to a Cloud-Optimized GeoTIFF written back to S3. The `writers.gdal` stage targets the `COG` GDAL driver so the output is internally tiled with overviews — ready to serve without a post-processing pass. The rasterisation approach here is the same one detailed in [DTM Raster Generation](https://www.pythonlidar.com/ground-filtering-dtm-dsm-generation/dtm-raster-generation/).

```json
{
  "pipeline": [
    {
      "type": "readers.las",
      "filename": "/vsis3/lidar-prod/tiles/tile_6342_NE.laz",
      "spatialreference": "EPSG:6347"
    },
    {
      "type": "filters.outlier",
      "method": "statistical",
      "mean_k": 12,
      "multiplier": 2.5
    },
    {
      "type": "filters.smrf",
      "window": 16.0,
      "slope": 0.2,
      "threshold": 0.45,
      "scalar": 1.2,
      "cell": 1.0
    },
    {
      "type": "filters.range",
      "limits": "Classification[2:2]"
    },
    {
      "type": "writers.gdal",
      "filename": "/vsis3/lidar-prod/dtm/tile_6342_NE.tif",
      "gdaldriver": "COG",
      "output_type": "idw",
      "resolution": 1.0,
      "window_size": 6,
      "nodata": -9999,
      "gdalopts": "COMPRESS=DEFLATE,PREDICTOR=3,BLOCKSIZE=512"
    }
  ]
}
```

The `filters.range` stage keeps only points classified as ground (ASPRS class 2) before rasterisation, so the surface is a true DTM rather than a mixed surface. `output_type: idw` fills the grid by inverse-distance weighting; `window_size: 6` bridges small gaps between ground returns. Choosing between interpolation strategies is discussed further under DTM raster work.

Third, the entrypoint reads the tile key from the environment. Under an AWS Batch array job, each container sees a distinct `AWS_BATCH_JOB_ARRAY_INDEX`; the worker maps that index to a tile key via the manifest.

## Python Integration: A Runnable Worker

The worker below is the complete unit that runs inside the container. It resolves its tile from the array index and a manifest in S3, builds the pipeline with the input and output keys substituted, executes it, and confirms the output landed. It uses typed signatures, structured logging, and explicit error handling so failures surface clearly in AWS Batch logs.

```python
import json
import logging
import os
import sys

import boto3
import pdal

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s [%(name)s] %(message)s",
)
log = logging.getLogger("pdal-worker")


def resolve_tile_key(bucket: str, manifest_key: str, index: int) -> str:
    """Map an array index to a tile key using a manifest object in S3."""
    s3 = boto3.client("s3")
    obj = s3.get_object(Bucket=bucket, Key=manifest_key)
    tiles = json.loads(obj["Body"].read())["tiles"]
    if index >= len(tiles):
        raise IndexError(f"index {index} exceeds manifest of {len(tiles)} tiles")
    return tiles[index]


def build_pipeline(bucket: str, tile_key: str, out_prefix: str) -> str:
    """Return a PDAL pipeline JSON string streaming one tile in and a COG out."""
    stem = os.path.splitext(os.path.basename(tile_key))[0]
    in_uri = f"/vsis3/{bucket}/{tile_key}"
    out_uri = f"/vsis3/{bucket}/{out_prefix}/{stem}.tif"
    pipeline = {
        "pipeline": [
            {"type": "readers.las", "filename": in_uri, "spatialreference": "EPSG:6347"},
            {"type": "filters.outlier", "method": "statistical", "mean_k": 12, "multiplier": 2.5},
            {"type": "filters.smrf", "window": 16.0, "slope": 0.2,
             "threshold": 0.45, "scalar": 1.2, "cell": 1.0},
            {"type": "filters.range", "limits": "Classification[2:2]"},
            {"type": "writers.gdal", "filename": out_uri, "gdaldriver": "COG",
             "output_type": "idw", "resolution": 1.0, "window_size": 6,
             "nodata": -9999,
             "gdalopts": "COMPRESS=DEFLATE,PREDICTOR=3,BLOCKSIZE=512"},
        ]
    }
    return json.dumps(pipeline)


def process_tile() -> int:
    """Process the single tile assigned to this container. Returns point count."""
    bucket = os.environ["TILE_BUCKET"]
    manifest_key = os.environ["MANIFEST_KEY"]
    out_prefix = os.environ.get("OUTPUT_PREFIX", "dtm")
    index = int(os.environ.get("AWS_BATCH_JOB_ARRAY_INDEX", "0"))

    tile_key = resolve_tile_key(bucket, manifest_key, index)
    log.info("array index %d -> tile %s", index, tile_key)

    pipeline = pdal.Pipeline(build_pipeline(bucket, tile_key, out_prefix))
    try:
        count = pipeline.execute()
    except RuntimeError as exc:
        log.error("pipeline failed for %s: %s", tile_key, exc)
        raise

    if count == 0:
        log.warning("tile %s produced zero points after filtering", tile_key)
    log.info("wrote DTM for %s (%d points rasterised)", tile_key, count)
    return count


if __name__ == "__main__":
    try:
        process_tile()
    except Exception:
        log.exception("worker failed")
        sys.exit(1)
```

Because the AWS credentials are supplied by the container's IAM job role, no keys appear in the code or the image. The `/vsis3/` prefix picks them up automatically. Reading the manifest once per container keeps the design stateless: the manifest is the only shared artefact, and it is immutable for the duration of the campaign.

## Schema and Data-Flow Notes

The data flow is a loop that begins and ends in S3. A one-time enumeration step lists the input tiles and writes a `manifest.json` — an ordered array of object keys — so that array index *i* deterministically maps to tile *i*. The Batch array job then launches one container per index. Each container streams its LAZ tile in via range reads, runs the pipeline entirely in memory (the streaming execution model means the full tile is never resident at once), and writes a COG out.

Two schema concerns travel with the points. First, **CRS integrity**: the `spatialreference` on `readers.las` must match the tile's true projection, because `filters.smrf`'s `window` is measured in the CRS's linear units — running it against a geographic CRS silently corrupts the ground surface. If your tiles arrive in mixed projections, insert a `filters.reprojection` stage, as covered in the PDAL pipeline architecture guide. Second, **classification dependency**: the DTM branch keeps only class 2, so any upstream stage that drops the `Classification` dimension breaks the pipeline; keep `filters.smrf` immediately before the `filters.range` mask.

Memory behaviour per container matters because you will pack several workers onto each instance. Streaming keeps the resident point set bounded by `capacity`, but the GDAL rasteriser holds the output grid in memory until the write flushes — a 1 km tile at 1 m resolution is a modest one-million-cell raster, but dropping to 0.25 m resolution multiplies that by sixteen. Size container memory against the output raster, not just the input points. The trade-offs are the same ones discussed in [Memory Management](https://www.pythonlidar.com/pdal-pipeline-architecture-execution/memory-management/).

## Performance and Scaling

The central scaling relationship is between worker count, throughput, and cost. Because tiles are independent, throughput scales almost linearly with concurrent workers until you saturate S3 bandwidth or hit an account concurrency limit. The table below sketches a representative 4,000-tile campaign where each tile takes roughly three minutes of compute.

| Concurrent workers | Wall-clock (approx.) | vCPU-hours consumed | Relative cost profile | Practical limiter |
|---|---|---|---|---|
| 1 | ~200 hours | ~200 | Lowest total, unusable latency | Single-node cores and disk |
| 20 | ~10 hours | ~205 | Low, overnight batch | Instance count in compute env |
| 100 | ~2 hours | ~210 | Moderate, spot-friendly | S3 request rate, image pull |
| 400 | ~30 minutes | ~215 | Higher burst, same total | S3 throttling, account vCPU quota |
| 1,000 | ~12 minutes | ~225 | Highest burst spend | Batch scheduler + S3 prefix limits |

Two things stand out. Total vCPU-hours stay roughly flat across the range — you are buying the same amount of compute, just compressing it in time — so the choice of scale is really a latency-versus-burst-spend decision, not a total-cost one (the slight rise at high concurrency comes from image-pull and scheduling overhead). And the limiter shifts from your own machine at low concurrency to shared cloud services at high concurrency: above a few hundred workers reading and writing under the same S3 prefix, request throttling, not CPU, sets the ceiling.

Three levers push the ceiling higher. **Spread S3 keys across prefixes** — partition tiles into `tiles/00/`, `tiles/01/`, and so on — so requests distribute across S3's internal partitions rather than hammering one. **Use spot compute** for the fleet; because losing a worker costs one idempotent tile, interruption tolerance is essentially free here. And **right-size each container** to a small vCPU/memory footprint so the scheduler packs many workers per instance; giving one tile eight cores wastes seven, since a single pipeline cannot use them. For CPU-bound ground classification, one to two vCPUs per container with `OMP_NUM_THREADS` matched to that count is the sweet spot.

## Production Deployment

A campaign is production-ready when it is reproducible, least-privileged, and self-healing.

**Pin the image.** Reference the worker image by immutable digest (`ghcr.io/pdal/pdal@sha256:...`) or at least a specific version tag in the Batch job definition, never `:latest`. This is what guarantees that re-running last quarter's job produces last quarter's numbers. Store the Dockerfile and pipeline JSON in version control alongside the DAG.

**Scope IAM tightly.** The Batch `jobRoleArn` should grant `s3:GetObject` on the input prefix and `s3:PutObject` on the output prefix — and nothing else. Read access to the manifest, write access to the DTM output, no wildcard bucket permissions. Credentials reach the container through the role, so no secrets live in the image or environment.

**Configure retries at both layers.** Set the Batch job definition's `retryStrategy` to two or three attempts so transient failures (a spot reclamation, a brief S3 5xx) recover automatically. Layer Airflow task retries on top for the orchestration steps. Because each tile job is idempotent, a retry is always safe.

**Make output writes atomic.** A COG is written with a single finalising operation, and S3 object PUTs are atomic — a reader never sees a half-written object. Still, guard against a job that dies mid-rasterisation by treating the output prefix as write-once per key and letting the retry overwrite. Never let two array indices resolve to the same output key.

**Orchestrate with a DAG.** Wrap the lifecycle — enumerate tiles and write the manifest, submit the Batch array job, wait for completion, run a validation task that samples output COGs — in an Airflow DAG. The DAG gives you scheduled backfills, per-run lineage, and a single place to see which tiles failed. Pass the manifest key from the enumeration task to the submit task through `XCom`.

## Failure Modes and Debugging

**S3 request throttling (`503 SlowDown`).** At high concurrency, many workers reading or writing under one prefix exceed S3's per-prefix request rate. GDAL surfaces this as intermittent read failures. Mitigate by partitioning keys across multiple prefixes, enabling exponential-backoff retries in the AWS SDK config (`max_attempts`, `retry_mode = adaptive`), and staggering job start times rather than launching all workers in the same second.

**Credential expiry mid-job.** Long-running containers using temporary role credentials can see them expire before the job finishes. The AWS SDK and GDAL refresh instance-role credentials automatically, but if you inject static keys they will not refresh — always use the IAM job role and let `/vsis3/` resolve credentials dynamically. Symptom: a job that reads fine for minutes then fails writing the COG with an access-denied error.

**Out-of-memory container kills.** A container killed with exit code 137 and no Python traceback is the OOM killer. The usual cause is an output raster larger than the container's memory limit — dropping resolution multiplies grid cells quadratically. Fix by raising the job definition's `memory` for fine-resolution outputs, or by lowering `capacity` if the input point buffer is the culprit. This mirrors the container memory guidance in [Memory Management](https://www.pythonlidar.com/pdal-pipeline-architecture-execution/memory-management/).

**Partial or missing outputs.** If a job reports success but the COG is absent or truncated, suspect a write that never flushed — often a silent permission gap where the role can `GetObject` but not `PutObject` on the output prefix, or an interrupted spot instance. The idempotent design is the cure: re-run the affected array indices. A validation task that lists the expected output keys against the manifest catches these gaps before the data reaches a downstream consumer.

**Manifest and index drift.** If the tile list changes between the enumeration step and job submission, array indices can point at the wrong tiles. Freeze the manifest as an immutable object (versioned or content-hashed key) and reference that exact key from every worker, so the mapping cannot shift underneath a running campaign.

---

## Frequently Asked Questions

**Why parallelise PDAL across containers instead of threads inside one pipeline?**

A single PDAL pipeline is largely single-threaded, and the parts that use OpenMP contend for the same cores and memory. Point cloud tiles are naturally independent, so running one container per tile gives near-linear scaling with no shared-state locking, isolates memory pressure per job, and lets a scheduler like AWS Batch or Airflow retry a failed tile without touching the others. See [Parallel Execution](https://www.pythonlidar.com/pdal-pipeline-architecture-execution/parallel-execution/) for the single-machine version of the same principle.

**How does PDAL read a LAZ file directly from S3 without downloading it first?**

PDAL uses GDAL's virtual file system. Prefix the object path with `/vsis3/` (using AWS credentials from the environment or instance role) or `/vsicurl/` (for a public HTTPS URL) in the `readers.las` filename. GDAL issues HTTP range requests so only the byte ranges the reader needs are fetched, avoiding a full local copy of the tile.

**What makes a GeoTIFF a Cloud-Optimized GeoTIFF, and how do I write one from PDAL?**

A COG is an internally tiled, overview-bearing GeoTIFF laid out so HTTP range requests can fetch a single tile or zoom level. Write it from `writers.gdal` by targeting the COG GDAL driver (`gdaldriver` set to `COG`) or by setting internal tiling and overviews. The result can be served straight from S3 and read partially by web map clients.

**How do I keep AWS Batch jobs idempotent so retries do not corrupt output?**

Make each job a pure function of its tile key: read one input tile, write one deterministically named output object. Write to a temporary key and copy to the final key only on success, or rely on S3's atomic single-object PUT, so a retried job overwrites its own partial output rather than appending. Never let two tiles share an output path.

**Should I use AWS Batch or Airflow to run a large tile campaign?**

They solve different problems and are often combined. AWS Batch is the execution layer that provisions compute and fans a single array job out across thousands of containers. Airflow is the orchestration layer that sequences stages, generates the manifest, submits the Batch job, waits for completion, and runs validation, giving you retries, scheduling, and lineage. Use Airflow to drive Batch.

---

## Related

- [PDAL Docker Containers](https://www.pythonlidar.com/batch-automation-cloud-integration/pdal-docker-containers/) — building, pinning, and running the official PDAL image as a portable worker
- [AWS Batch Processing](https://www.pythonlidar.com/batch-automation-cloud-integration/aws-batch-processing/) — job definitions, array jobs, and compute environments for tile fan-out
- [S3 Cloud Storage I/O](https://www.pythonlidar.com/batch-automation-cloud-integration/s3-cloud-storage-io/) — streaming LAZ with /vsis3/ and writing Cloud-Optimized GeoTIFFs back to the cloud
- [Airflow DAG Orchestration](https://www.pythonlidar.com/batch-automation-cloud-integration/airflow-dag-orchestration/) — DAGs, operators, and XCom for reproducible campaign scheduling
- [PDAL Pipeline Architecture & Execution](https://www.pythonlidar.com/pdal-pipeline-architecture-execution/) — the execution model behind every pipeline you scale here
- [Parallel Execution](https://www.pythonlidar.com/pdal-pipeline-architecture-execution/parallel-execution/) — file-level parallelism strategies on a single machine
- [Memory Management](https://www.pythonlidar.com/pdal-pipeline-architecture-execution/memory-management/) — capacity, stream mode, and container memory limits
- [DTM Raster Generation](https://www.pythonlidar.com/ground-filtering-dtm-dsm-generation/dtm-raster-generation/) — turning classified ground returns into terrain rasters
