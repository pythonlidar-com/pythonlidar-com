---
title: "S3 Cloud Storage I/O with PDAL"
description: "Reading and writing LiDAR directly against Amazon S3 in PDAL — the GDAL /vsis3/ and /vsicurl/ virtual file systems, credentials and region config, streaming LAZ readers, and writing Cloud-Optimized GeoTIFFs back to a bucket."
slug: "s3-cloud-storage-io"
type: "cluster"
breadcrumb: "S3 Cloud Storage I/O"
datePublished: "2024-07-06"
dateModified: "2026-07-12"
---

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Article",
      "headline": "S3 Cloud Storage I/O with PDAL",
      "description": "Reading and writing LiDAR directly against Amazon S3 in PDAL — the GDAL /vsis3/ and /vsicurl/ virtual file systems, credentials and region config, streaming LAZ readers, and writing Cloud-Optimized GeoTIFFs back to a bucket.",
      "datePublished": "2024-07-06",
      "dateModified": "2026-07-12",
      "author": {"@type": "Organization", "name": "pythonlidar.com"}
    },
    {
      "@type": "BreadcrumbList",
      "itemListElement": [
        {"@type": "ListItem", "position": 1, "name": "Home", "item": "https://pythonlidar.com/"},
        {"@type": "ListItem", "position": 2, "name": "Batch Automation and Cloud Integration for PDAL", "item": "https://pythonlidar.com/batch-automation-cloud-integration/"},
        {"@type": "ListItem", "position": 3, "name": "S3 Cloud Storage I/O", "item": "https://pythonlidar.com/batch-automation-cloud-integration/s3-cloud-storage-io/"}
      ]
    },
    {
      "@type": "HowTo",
      "name": "Read and write LiDAR against Amazon S3 with PDAL",
      "step": [
        {"@type": "HowToStep", "name": "Configure region and credentials", "text": "Export AWS_REGION plus AWS_ACCESS_KEY_ID/AWS_SECRET_ACCESS_KEY, or attach an IAM instance role so GDAL's /vsis3/ handler can sign requests."},
        {"@type": "HowToStep", "name": "Tune the CPL_VSIL_CURL cache", "text": "Set CPL_VSIL_CURL_ALLOWED_EXTENSIONS and GDAL cache variables so range reads are efficient and header probes are cached."},
        {"@type": "HowToStep", "name": "Point the reader at a /vsis3/ path", "text": "Give readers.las a filename of /vsis3/bucket/key.laz to fetch the object without a local copy."},
        {"@type": "HowToStep", "name": "Write outputs back to the bucket", "text": "Send writers.gdal or writers.las to a /vsis3/ path, or write locally and upload with boto3 for atomic multipart transfers."},
        {"@type": "HowToStep", "name": "Validate the transfer", "text": "Confirm the object with a boto3 head_object call and compare point counts or raster dimensions against the source."}
      ]
    },
    {
      "@type": "FAQPage",
      "mainEntity": [
        {
          "@type": "Question",
          "name": "What is the difference between /vsis3/ and /vsicurl/ in PDAL?",
          "acceptedAnswer": {"@type": "Answer", "text": "/vsicurl/ reads a plain public HTTP or HTTPS URL and issues unauthenticated HTTP range requests. /vsis3/ speaks the S3 API directly, signs every request with SigV4 credentials, and supports private buckets, requester-pays, and writes. Use /vsicurl/ for open datasets exposed over a CDN and /vsis3/ whenever authentication, private access, or writing is involved."}
        },
        {
          "@type": "Question",
          "name": "Do I need to download a LAZ file before PDAL can read it from S3?",
          "acceptedAnswer": {"@type": "Answer", "text": "No. Passing /vsis3/bucket/key.laz to readers.las lets GDAL's virtual file system stream the bytes on demand. Note that LAZ is a monolithic format, so PDAL still transfers the whole object to decompress it; only COPC and EPT layouts support true partial range reads that fetch just the chunks a query needs."}
        },
        {
          "@type": "Question",
          "name": "How do I fix a 403 SignatureDoesNotMatch error when reading from /vsis3/?",
          "acceptedAnswer": {"@type": "Answer", "text": "That error almost always means the AWS_REGION does not match the bucket's region, or the clock is skewed, or the secret key is wrong. Set AWS_REGION to the bucket's home region, confirm the key pair with aws sts get-caller-identity, and make sure no stray AWS_SESSION_TOKEN from an expired session is present in the environment."}
        },
        {
          "@type": "Question",
          "name": "Can PDAL write a GeoTIFF straight to an S3 bucket?",
          "acceptedAnswer": {"@type": "Answer", "text": "Yes. writers.gdal accepts a /vsis3/bucket/key.tif filename and GDAL buffers the object in memory before a single PutObject on close. For large rasters or when you need multipart resumability, write to local scratch first and upload the finished file with boto3 so a failed run never leaves a half-written object in the bucket."}
        }
      ]
    }
  ]
}
</script>

Moving LiDAR into the cloud changes the shape of every pipeline: the point cloud no longer lives on a local disk that PDAL can `open()` at will, it lives as an object behind an authenticated HTTP API. PDAL bridges that gap through GDAL's virtual file system layer — a family of path prefixes such as `/vsis3/`, `/vsicurl/`, and `/vsizip/` that make a remote object look, to a reader or writer stage, exactly like a filename. Get the prefix, the region, and the credential wiring right and a `readers.las` stage will pull a tile out of `s3://usgs-lidar-tiles/co_2019/tile_0421.laz` and a `writers.gdal` stage will push a finished terrain raster back to `s3://survey-deliverables/dtm/tile_0421.tif`, all without a single explicit download or upload call in your Python. This guide is part of [Batch Automation and Cloud Integration for PDAL](/batch-automation-cloud-integration/), and it focuses on the storage-access layer that every cloud workflow sits on.

<svg viewBox="0 0 760 250" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="PDAL reading and writing S3 objects through GDAL virtual file systems" style="width:100%;max-width:760px;display:block;margin:1.5rem auto">
  <title>PDAL S3 I/O through the GDAL virtual file system layer</title>
  <desc>A PDAL pipeline in the centre reads through the GDAL VSI layer, which signs SigV4 requests against an S3 bucket for input LAZ objects using /vsis3/, and writes a Cloud-Optimized GeoTIFF back to the bucket. Environment variables for region and credentials feed the VSI layer.</desc>
  <defs>
    <marker id="s3-arr" markerWidth="9" markerHeight="9" refX="7" refY="3" orient="auto">
      <path d="M0,0 L0,6 L8,3 z" fill="currentColor" opacity="0.6"/>
    </marker>
  </defs>
  <!-- S3 bucket -->
  <rect x="20" y="70" width="170" height="110" rx="8" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.8"/>
  <text x="105" y="96" text-anchor="middle" font-size="12" fill="currentColor" font-weight="600">Amazon S3 bucket</text>
  <text x="105" y="122" text-anchor="middle" font-size="10" fill="currentColor" font-family="monospace" opacity="0.7">tile_0421.laz</text>
  <text x="105" y="142" text-anchor="middle" font-size="10" fill="currentColor" font-family="monospace" opacity="0.7">dtm/tile_0421.tif</text>
  <text x="105" y="164" text-anchor="middle" font-size="9" fill="currentColor" opacity="0.55">private / requester-pays</text>
  <!-- GDAL VSI layer -->
  <rect x="300" y="60" width="160" height="130" rx="8" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.8"/>
  <text x="380" y="86" text-anchor="middle" font-size="12" fill="currentColor" font-weight="600">GDAL VSI layer</text>
  <text x="380" y="110" text-anchor="middle" font-size="10" fill="currentColor" font-family="monospace" opacity="0.7">/vsis3/</text>
  <text x="380" y="127" text-anchor="middle" font-size="10" fill="currentColor" font-family="monospace" opacity="0.7">/vsicurl/</text>
  <text x="380" y="144" text-anchor="middle" font-size="9" fill="currentColor" opacity="0.55">SigV4 signing</text>
  <text x="380" y="160" text-anchor="middle" font-size="9" fill="currentColor" opacity="0.55">HTTP range cache</text>
  <!-- PDAL pipeline -->
  <rect x="570" y="70" width="170" height="110" rx="8" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.8"/>
  <text x="655" y="96" text-anchor="middle" font-size="12" fill="currentColor" font-weight="600">PDAL pipeline</text>
  <text x="655" y="122" text-anchor="middle" font-size="10" fill="currentColor" font-family="monospace" opacity="0.7">readers.las</text>
  <text x="655" y="142" text-anchor="middle" font-size="10" fill="currentColor" font-family="monospace" opacity="0.7">writers.gdal</text>
  <text x="655" y="164" text-anchor="middle" font-size="9" fill="currentColor" opacity="0.55">filters between</text>
  <!-- arrows read -->
  <line x1="190" y1="108" x2="298" y2="108" stroke="currentColor" stroke-width="1.5" opacity="0.6" marker-end="url(#s3-arr)"/>
  <line x1="460" y1="108" x2="568" y2="108" stroke="currentColor" stroke-width="1.5" opacity="0.6" marker-end="url(#s3-arr)"/>
  <text x="245" y="100" text-anchor="middle" font-size="9" fill="currentColor" opacity="0.55">GET range</text>
  <!-- arrows write -->
  <line x1="568" y1="150" x2="462" y2="150" stroke="currentColor" stroke-width="1.5" opacity="0.6" marker-end="url(#s3-arr)"/>
  <line x1="298" y1="150" x2="192" y2="150" stroke="currentColor" stroke-width="1.5" opacity="0.6" marker-end="url(#s3-arr)"/>
  <text x="515" y="142" text-anchor="middle" font-size="9" fill="currentColor" opacity="0.55">PUT object</text>
  <!-- env config -->
  <rect x="256" y="212" width="248" height="30" rx="5" fill="none" stroke="currentColor" stroke-width="1" stroke-dasharray="4 3" opacity="0.6"/>
  <text x="380" y="231" text-anchor="middle" font-size="8.5" fill="currentColor" opacity="0.7">AWS_REGION · credentials · CPL_VSIL_CURL_*</text>
  <line x1="380" y1="212" x2="380" y2="190" stroke="currentColor" stroke-width="1" stroke-dasharray="3 3" opacity="0.5" marker-end="url(#s3-arr)"/>
</svg>

## Prerequisites

Before wiring PDAL to a bucket, confirm the following:

- **PDAL 2.5+ built against GDAL 3.4 or newer** — the `/vsis3/` handler and its SigV4 signing live in GDAL, so `pdal --version` must report a GDAL new enough to include the S3 driver. The conda-forge `pdal` package satisfies this.
- **`boto3` and `botocore`** in the same environment for validation and multipart uploads (`pip install boto3`).
- **AWS credentials reachable by GDAL** — either environment variables, a shared `~/.aws/credentials` profile, or an attached IAM role. GDAL reads the same credential chain the AWS CLI uses.
- **Read/write IAM permissions** — at minimum `s3:GetObject` and `s3:ListBucket` for reading, plus `s3:PutObject` for writing, scoped to the relevant bucket ARNs.
- **The bucket's home region** — a region mismatch is the single most common cause of a signing failure, so know it before you start.
- **Familiarity with the PDAL execution model** — see [PDAL Pipeline Architecture & Execution](/pdal-pipeline-architecture-execution/) for how readers, filters, and writers thread a point buffer together.

## Core Workflow Architecture

Every S3-backed pipeline follows the same lifecycle. The only thing that changes versus a local run is that a filename gains a virtual prefix and the environment must carry credentials.

1. **Region and credential resolution** — at process start, GDAL resolves `AWS_REGION` and a credential source. On an EC2 instance or in ECS/Fargate an IAM role is preferred; on a laptop, environment variables or a named profile work. Nothing is fetched yet.
2. **Path rewriting** — you replace `s3://bucket/key.laz` with `/vsis3/bucket/key.laz` in the reader's `filename`. For a public object over HTTPS you would instead use `/vsicurl/https://host/key.laz`. A zipped object nests prefixes: `/vsizip/vsis3/bucket/tiles.zip/tile.laz`.
3. **Lazy open and header probe** — when `pipeline.execute()` runs, the reader issues a small ranged `GET` for the LAS/LAZ header. GDAL caches this so repeated metadata probes do not re-hit S3.
4. **Streaming transfer** — for COPC or EPT sources, PDAL issues targeted range reads for only the chunks a spatial or resolution query touches. For a plain LAZ object the whole file is pulled because LAZ chunks are not independently addressable through a spatial index.
5. **In-memory processing** — filters run exactly as they would locally; the storage layer is invisible above the reader.
6. **Write-back** — `writers.gdal` or `writers.las` targets another `/vsis3/` path (GDAL buffers then issues a `PutObject` on close), or writes to local scratch for a subsequent boto3 multipart upload.
7. **Validation** — a `head_object` call confirms the object exists and reports its size and `ETag`, and a point-count or raster-dimension check confirms the payload is intact.

The two child guides drill into the two halves of this cycle: [Streaming LAZ from S3 with PDAL](/batch-automation-cloud-integration/s3-cloud-storage-io/streaming-laz-from-s3-with-pdal/) covers the read side end to end, and [Writing Cloud-Optimized GeoTIFFs to S3](/batch-automation-cloud-integration/s3-cloud-storage-io/writing-cloud-optimized-geotiffs-to-s3/) covers producing and uploading a COG raster.

## Full Implementation

The module below reads a LAZ tile from a private bucket over `/vsis3/`, classifies ground with SMRF, rasterises a terrain surface, and writes the GeoTIFF straight back to S3 — a complete round trip through the virtual file system. It configures the GDAL S3 environment programmatically so the same code runs unchanged on a laptop with a profile or on an instance with a role.

```python
import os
import json
import logging
import pdal
import boto3

logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")


def configure_s3_environment(region: str = "us-west-2") -> None:
    """
    Prime GDAL's /vsis3/ handler. Credentials themselves come from the
    standard AWS chain (env vars, ~/.aws/credentials, or an IAM role) —
    here we only set the region and the range-read tuning knobs.
    """
    os.environ.setdefault("AWS_REGION", region)
    # Cache HTTP range responses so repeated header probes do not re-hit S3.
    os.environ["CPL_VSIL_CURL_CACHE_SIZE"] = str(256 * 1024 * 1024)  # 256 MB
    # Skip directory-listing probes on extensions GDAL never needs to enumerate.
    os.environ["CPL_VSIL_CURL_ALLOWED_EXTENSIONS"] = ".laz,.las,.copc.laz,.tif"
    # Do not re-issue a HEAD before every GET; trust the cached size.
    os.environ["GDAL_DISABLE_READDIR_ON_OPEN"] = "EMPTY_DIR"


def s3_to_dtm_pipeline(
    src_vsis3: str,
    dst_vsis3: str,
    resolution: float = 1.0,
    out_srs: str = "EPSG:32613",
) -> pdal.Pipeline:
    """
    Build a pipeline that reads a LAZ object from S3, classifies ground,
    keeps ground returns, and rasterises a DTM written back to S3.

    src_vsis3 : e.g. /vsis3/usgs-lidar-tiles/co_2019/tile_0421.laz
    dst_vsis3 : e.g. /vsis3/survey-deliverables/dtm/tile_0421.tif
    resolution: output grid spacing in CRS units (metres for UTM)
    out_srs   : CRS of the source cloud, tagged onto the raster
    """
    stages = [
        {"type": "readers.las", "filename": src_vsis3},
        {"type": "filters.smrf", "slope": 0.2, "window": 16.0, "threshold": 0.45},
        {"type": "filters.range", "limits": "Classification[2:2]"},
        {
            "type": "writers.gdal",
            "filename": dst_vsis3,
            "resolution": resolution,
            "output_type": "idw",
            "gdaldriver": "GTiff",
            "data_type": "float32",
            "nodata": -9999,
            "override_srs": out_srs,
            "gdalopts": "COMPRESS=DEFLATE,TILED=YES,BLOCKXSIZE=256,BLOCKYSIZE=256",
        },
    ]
    return pdal.Pipeline(json.dumps({"pipeline": stages}))


def run(src_vsis3: str, dst_vsis3: str) -> int:
    configure_s3_environment()
    pipeline = s3_to_dtm_pipeline(src_vsis3, dst_vsis3)

    try:
        pipeline.validate()
    except RuntimeError as exc:
        logging.error("Pipeline failed validation: %s", exc)
        raise

    count = pipeline.execute()
    logging.info("Processed %d points from %s", count, src_vsis3)
    return count


def verify_object(bucket: str, key: str) -> None:
    """Confirm the written object exists and report its size and ETag."""
    s3 = boto3.client("s3")
    head = s3.head_object(Bucket=bucket, Key=key)
    logging.info(
        "s3://%s/%s present: %d bytes, ETag %s",
        bucket, key, head["ContentLength"], head["ETag"],
    )


if __name__ == "__main__":
    SRC = "/vsis3/usgs-lidar-tiles/co_2019/tile_0421.laz"
    DST = "/vsis3/survey-deliverables/dtm/tile_0421.tif"

    run(SRC, DST)
    verify_object("survey-deliverables", "dtm/tile_0421.tif")
```

## Code Breakdown

### The virtual file system prefix

The only structural difference from a local pipeline is the `filename`. `/vsis3/usgs-lidar-tiles/co_2019/tile_0421.laz` maps to `s3://usgs-lidar-tiles/co_2019/tile_0421.laz` — GDAL strips the `/vsis3/` prefix, treats the first path segment as the bucket and the remainder as the object key, and signs the request. There is no separate "open S3" call; the reader treats the object as an ordinary file handle backed by HTTP range requests. This is why the same `readers.las` stage that works on a local disk works unchanged against a bucket.

### Region and credential wiring

`configure_s3_environment` sets `AWS_REGION` but deliberately does not set the access key or secret. Hard-coding credentials in source is an anti-pattern; instead GDAL walks the AWS credential chain — environment variables (`AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, and an optional `AWS_SESSION_TOKEN`), then a named profile from `~/.aws/credentials`, then the instance/container role metadata endpoint. On AWS compute an IAM role is the cleanest option because there is no long-lived secret to rotate. For requester-pays buckets you must additionally set `AWS_REQUEST_PAYER=requester`, and the caller (not the bucket owner) is billed for the transfer.

### The CPL_VSIL_CURL tuning knobs

The three `CPL_VSIL_CURL` and GDAL variables are what separate a snappy remote read from a painfully slow one. `CPL_VSIL_CURL_CACHE_SIZE` sizes the in-process range cache. `CPL_VSIL_CURL_ALLOWED_EXTENSIONS` restricts which suffixes GDAL will attempt to enumerate, avoiding needless directory probes. `GDAL_DISABLE_READDIR_ON_OPEN=EMPTY_DIR` stops GDAL from issuing a `LIST` on the containing prefix every time it opens an object — a large win in buckets with thousands of sibling tiles.

### The writer stage

`writers.gdal` rasterises the surviving ground points into a grid and hands the finished GeoTIFF to the same VSI layer for a `PutObject`. The `gdalopts` string carries the GeoTIFF creation options straight through to the GDAL driver — here internal tiling and DEFLATE compression, which are the structural precursors to a Cloud-Optimized GeoTIFF. The dedicated child guide layers overviews and the COG driver on top. Because GDAL buffers the whole raster and PUTs it once on close, a crash mid-run leaves no partial object — but it also means very large rasters are held in memory, which the [Memory Management](/pdal-pipeline-architecture-execution/memory-management/) guide addresses.

## Parameter and Configuration Reference

| Setting | Where | Example value | Effect |
|---|---|---|---|
| `filename` (`/vsis3/`) | reader / writer | `/vsis3/bucket/key.laz` | Routes I/O through the signed S3 handler |
| `filename` (`/vsicurl/`) | reader | `/vsicurl/https://host/key.laz` | Unauthenticated HTTP range reads for public objects |
| `AWS_REGION` | env | `us-west-2` | Bucket home region for SigV4; mismatch causes 403 |
| `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` | env | (from IAM) | Static credentials; omit when using an instance role |
| `AWS_SESSION_TOKEN` | env | (from STS) | Required for temporary/assumed-role credentials |
| `AWS_REQUEST_PAYER` | env | `requester` | Enables reads from requester-pays buckets |
| `CPL_VSIL_CURL_CACHE_SIZE` | env | `268435456` | Byte size of the range-read cache |
| `CPL_VSIL_CURL_ALLOWED_EXTENSIONS` | env | `.laz,.copc.laz,.tif` | Limits extensions GDAL will probe/enumerate |
| `GDAL_DISABLE_READDIR_ON_OPEN` | env | `EMPTY_DIR` | Suppresses directory listing on every open |
| `VSI_CACHE` | env | `TRUE` | Enables the block cache for the VSI file handle |
| `gdalopts` | `writers.gdal` | `COMPRESS=DEFLATE,TILED=YES` | GeoTIFF creation options passed to GDAL |

## Validation and Integrity Checks

A remote write can fail in ways a local write cannot — a truncated PUT, a permissions gap, or an eventual-consistency lag. Validate every transfer explicitly rather than trusting a zero exit code.

**Confirm the object landed** with a `head_object`, which is a cheap metadata-only call:

```python
import boto3

s3 = boto3.client("s3")
head = s3.head_object(Bucket="survey-deliverables", Key="dtm/tile_0421.tif")
assert head["ContentLength"] > 0, "Uploaded object is empty"
print(f"{head['ContentLength']:,} bytes, ETag {head['ETag']}")
```

**Compare point counts** across the round trip. Read the source header count and the count PDAL actually processed; a mismatch signals a truncated transfer or a silently applied filter:

```python
import pdal, json

src = pdal.Pipeline(json.dumps({"pipeline": ["/vsis3/usgs-lidar-tiles/co_2019/tile_0421.laz"]}))
n = src.execute()
print(f"Source object streamed {n:,} points")
```

**Check the raster back out of the bucket** with a `/vsis3/`-prefixed `gdalinfo` to prove the written GeoTIFF is readable remotely and carries the CRS you tagged:

```bash
AWS_REGION=us-west-2 gdalinfo /vsis3/survey-deliverables/dtm/tile_0421.tif | grep -iE "size|epsg|block"
```

## Performance Tuning

**Prefer range-friendly formats for remote reads.** A plain LAZ object forces a whole-file transfer because its chunks are not spatially indexed; a COPC (`.copc.laz`) or an EPT tileset lets PDAL issue targeted range `GET`s for only the octree nodes a query touches. If you routinely subset large tiles from S3, converting archives to COPC pays for itself on the very first windowed read. The child guide on [streaming LAZ](/batch-automation-cloud-integration/s3-cloud-storage-io/streaming-laz-from-s3-with-pdal/) quantifies the whole-file penalty.

**Size the curl cache to your access pattern.** Header probes, VLR reads, and COPC hierarchy fetches all benefit from `CPL_VSIL_CURL_CACHE_SIZE`. On a 4 GB container, 256 MB is a safe cache; on a fat batch node you can push it higher. Pair it with `VSI_CACHE=TRUE` so the file-handle block cache is active.

**Co-locate compute and storage.** Latency to S3 dominates small-object workloads. Running PDAL in the same region as the bucket removes cross-region round-trip time and, for many workloads, cross-region data-transfer charges. This is a core reason cloud batch jobs pin their compute to the bucket's region — see [AWS Batch Processing](/batch-automation-cloud-integration/aws-batch-processing/) for the scaling pattern and [PDAL Docker Containers](/batch-automation-cloud-integration/pdal-docker-containers/) for packaging the runtime.

**Batch metadata calls.** A per-tile `head_object` is cheap individually but adds up across thousands of tiles. When validating a large manifest, use `list_objects_v2` with a prefix to enumerate results in pages of up to 1,000 rather than probing each key.

| Access pattern | Format | Transfer per query | Notes |
|---|---|---|---|
| Full-tile read | LAZ | Entire object | Whole file decompressed; no partial reads |
| Windowed spatial query | COPC | Only overlapping nodes | True HTTP range reads via octree index |
| Resolution-limited preview | EPT | Coarse levels only | Fetch low-detail octree levels first |
| Repeated header probes | any | Cached after first | Served from CPL_VSIL_CURL cache |

## Common Errors and Troubleshooting

**`ERROR 11: HTTP response code: 403 ... SignatureDoesNotMatch`**
Root cause: the request was signed for the wrong region, or the credential pair is wrong, or an expired `AWS_SESSION_TOKEN` lingers in the environment. Fix: set `AWS_REGION` to the bucket's home region, verify identity with `aws sts get-caller-identity`, and `unset AWS_SESSION_TOKEN` if you are using static keys.

**`ERROR 15: ... Access Denied` on read**
Root cause: the IAM policy lacks `s3:GetObject` (or `s3:ListBucket` when opening COPC, which probes sibling keys), or the bucket is requester-pays and `AWS_REQUEST_PAYER` is unset. Fix: attach the missing permission, or export `AWS_REQUEST_PAYER=requester` for requester-pays datasets.

**Painfully slow reads that spike the request count**
Root cause: GDAL is issuing a directory listing on every open and re-probing metadata. Fix: set `GDAL_DISABLE_READDIR_ON_OPEN=EMPTY_DIR` and `CPL_VSIL_CURL_ALLOWED_EXTENSIONS` to the handful of suffixes you actually read, which stops the handler from enumerating thousands of sibling objects.

**`ERROR 1: ... failed to open ... for writing` on a /vsis3/ write**
Root cause: missing `s3:PutObject`, or a bucket policy that denies unencrypted uploads while GDAL sends no encryption header. Fix: grant `s3:PutObject`, and set `AWS_S3_ENDPOINT`/encryption options as the policy requires, or write locally and upload with boto3, which lets you attach `ServerSideEncryption` explicitly.

**Region redirect loop (`PermanentRedirect`)**
Root cause: the bucket lives in a region other than the one GDAL signed for, and S3 returned a 301 pointing at the correct endpoint. Fix: set `AWS_REGION` correctly; do not rely on the redirect, because signed requests cannot be transparently replayed against a new host.

## Frequently Asked Questions

**What is the difference between `/vsis3/` and `/vsicurl/` in PDAL?**

`/vsicurl/` reads a plain public HTTP or HTTPS URL and issues unauthenticated range requests — ideal for open datasets fronted by a CDN. `/vsis3/` speaks the S3 API directly, signs every request with SigV4 credentials, and supports private buckets, requester-pays, and writes. Reach for `/vsicurl/` when the data is public and read-only, and `/vsis3/` whenever authentication or writing is involved.

**Do I need to download a LAZ file before PDAL can read it from S3?**

No. Passing `/vsis3/bucket/key.laz` to `readers.las` lets the virtual file system stream bytes on demand. Because LAZ is a monolithic format, PDAL still transfers the whole object to decompress it; only COPC and EPT layouts support true partial range reads that fetch only the chunks a query needs.

**How do I fix a 403 SignatureDoesNotMatch error when reading from `/vsis3/`?**

Almost always the `AWS_REGION` does not match the bucket's region, the system clock is skewed, or the secret key is wrong. Set `AWS_REGION` to the bucket's home region, confirm the key pair with `aws sts get-caller-identity`, and make sure no stray expired `AWS_SESSION_TOKEN` is present.

**Can PDAL write a GeoTIFF straight to an S3 bucket?**

Yes. `writers.gdal` accepts a `/vsis3/bucket/key.tif` filename and GDAL buffers the raster in memory before a single `PutObject` on close. For large rasters or when you want multipart resumability, write to local scratch first and upload with boto3 so a failed run never leaves a half-written object.

**Where should credentials live in a containerised PDAL job?**

Prefer an IAM task or instance role over baked-in keys. On ECS/Fargate the task role is exposed through the container credential endpoint that both GDAL and boto3 read automatically, so no secret ever enters the image or the environment. See [PDAL Docker Containers](/batch-automation-cloud-integration/pdal-docker-containers/) for the packaging details.

---

## Related

- [Batch Automation and Cloud Integration for PDAL](/batch-automation-cloud-integration/) — parent overview of running PDAL at scale in the cloud
- [Streaming LAZ from S3 with PDAL](/batch-automation-cloud-integration/s3-cloud-storage-io/streaming-laz-from-s3-with-pdal/) — read a single tile straight from a bucket with no local copy
- [Writing Cloud-Optimized GeoTIFFs to S3](/batch-automation-cloud-integration/s3-cloud-storage-io/writing-cloud-optimized-geotiffs-to-s3/) — produce a COG DTM and push it back to the bucket
- [AWS Batch Processing](/batch-automation-cloud-integration/aws-batch-processing/) — fan tile jobs across a managed compute fleet in the bucket's region
- [PDAL Docker Containers](/batch-automation-cloud-integration/pdal-docker-containers/) — package the PDAL + GDAL runtime with the credential wiring baked in
- [Memory Management in PDAL Pipelines](/pdal-pipeline-architecture-execution/memory-management/) — control the footprint of buffered remote writes and large rasters
