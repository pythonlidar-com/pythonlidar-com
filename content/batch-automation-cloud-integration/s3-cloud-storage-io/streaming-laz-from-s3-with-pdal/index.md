---
title: "Streaming LAZ from S3 with PDAL"
description: "How to stream a LAZ tile straight from Amazon S3 into a PDAL pipeline using the /vsis3/ virtual file system — no local download — with credential setup and verification."
slug: "streaming-laz-from-s3-with-pdal"
type: "howto"
breadcrumb: "Streaming LAZ from S3"
datePublished: "2024-07-06"
dateModified: "2026-07-12"
---

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Article",
      "headline": "Streaming LAZ from S3 with PDAL",
      "description": "How to stream a LAZ tile straight from Amazon S3 into a PDAL pipeline using the /vsis3/ virtual file system — no local download — with credential setup and verification.",
      "datePublished": "2024-07-06",
      "dateModified": "2026-07-12",
      "author": {"@type": "Organization", "name": "pythonlidar.com"}
    },
    {
      "@type": "BreadcrumbList",
      "itemListElement": [
        {"@type": "ListItem", "position": 1, "name": "Home", "item": "https://www.pythonlidar.com/"},
        {"@type": "ListItem", "position": 2, "name": "Batch Automation and Cloud Integration for PDAL", "item": "https://www.pythonlidar.com/batch-automation-cloud-integration/"},
        {"@type": "ListItem", "position": 3, "name": "S3 Cloud Storage I/O", "item": "https://www.pythonlidar.com/batch-automation-cloud-integration/s3-cloud-storage-io/"},
        {"@type": "ListItem", "position": 4, "name": "Streaming LAZ from S3", "item": "https://www.pythonlidar.com/batch-automation-cloud-integration/s3-cloud-storage-io/streaming-laz-from-s3-with-pdal/"}
      ]
    },
    {
      "@type": "HowTo",
      "name": "Stream a LAZ tile from S3 into a PDAL pipeline",
      "description": "Read a LAZ object directly from an Amazon S3 bucket into PDAL using the /vsis3/ virtual file system without downloading a local copy.",
      "step": [
        {"@type": "HowToStep", "position": 1, "name": "Set region and credentials", "text": "Export AWS_REGION and either static keys or rely on an attached IAM role so GDAL can sign /vsis3/ requests."},
        {"@type": "HowToStep", "position": 2, "name": "Rewrite the S3 URI to a /vsis3/ path", "text": "Convert s3://bucket/key.laz into /vsis3/bucket/key.laz for the readers.las filename."},
        {"@type": "HowToStep", "position": 3, "name": "Build and execute the pipeline", "text": "Pass the /vsis3/ path to readers.las and call pipeline.execute() to stream the object."},
        {"@type": "HowToStep", "position": 4, "name": "Verify the point count", "text": "Compare the streamed point count against the source header via a boto3 head_object size sanity check."}
      ]
    },
    {
      "@type": "FAQPage",
      "mainEntity": [
        {
          "@type": "Question",
          "name": "Does streaming a LAZ file from S3 avoid downloading the whole object?",
          "acceptedAnswer": {"@type": "Answer", "text": "No. A plain LAZ object is transferred in full because its compressed chunks are not spatially addressable. Streaming here means PDAL reads the bytes through the /vsis3/ handler without you writing a local file, but the entire object still crosses the network. Only COPC or EPT layouts fetch just the ranges a query needs."}
        },
        {
          "@type": "Question",
          "name": "How does PDAL get AWS credentials when reading /vsis3/ inside a container?",
          "acceptedAnswer": {"@type": "Answer", "text": "GDAL reads the standard AWS credential chain: environment variables first, then a mounted ~/.aws/credentials profile, then the container or instance role metadata endpoint. On ECS/Fargate the task role is exposed automatically, so no secret needs to be baked into the image."}
        },
        {
          "@type": "Question",
          "name": "Can I stream from a public bucket without credentials?",
          "acceptedAnswer": {"@type": "Answer", "text": "Yes. For a public object, set AWS_NO_SIGN_REQUEST=YES so GDAL skips signing, or use the /vsicurl/ prefix with the object's HTTPS URL. Both issue unauthenticated range requests and need no AWS keys."}
        },
        {
          "@type": "Question",
          "name": "Why is my first read from S3 slow but later reads fast?",
          "acceptedAnswer": {"@type": "Answer", "text": "The first open pays for the header probe, TLS handshake, and any directory listing. Subsequent reads within the same process hit the CPL_VSIL_CURL cache. Setting GDAL_DISABLE_READDIR_ON_OPEN=EMPTY_DIR removes the listing cost on that first open."}
        }
      ]
    }
  ]
}
</script>

**TL;DR:** Set `AWS_REGION` (plus credentials or an IAM role), rewrite `s3://bucket/tile.laz` to `/vsis3/bucket/tile.laz`, and hand that path to `readers.las` — `pipeline.execute()` then streams the tile through GDAL's virtual file system with no local download, no temp file, and no explicit boto3 call.

## Context and Motivation

This guide is part of [S3 Cloud Storage I/O with PDAL](https://www.pythonlidar.com/batch-automation-cloud-integration/s3-cloud-storage-io/), the parent guide to reading and writing point clouds against Amazon S3.

The common way teams first read cloud LiDAR is clumsy: call boto3 `download_file` into a temp directory, run PDAL against the local copy, then delete it. That pattern doubles disk pressure, complicates cleanup on failure, and serialises the transfer ahead of processing. GDAL's `/vsis3/` virtual file system removes the temp file entirely — `readers.las` opens the S3 object as if it were a local path and PDAL reads through it directly. For a batch worker chewing through thousands of tiles, dropping the download-then-delete dance simplifies the code and removes an entire class of "disk full" failures. The wider [PDAL pipeline model](https://www.pythonlidar.com/pdal-pipeline-architecture-execution/) is untouched; only the reader's `filename` changes.

<svg viewBox="0 0 720 210" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Streaming a LAZ object from S3 into readers.las without a local temp file" style="width:100%;max-width:720px;display:block;margin:1.5rem auto">
  <title>Streaming LAZ from S3 versus the download-then-read pattern</title>
  <desc>Top row shows the old pattern: S3 object copied to a local temp file then read by PDAL. Bottom row shows the streaming pattern: readers.las reads directly through the /vsis3/ handler from S3 with no temp file.</desc>
  <defs>
    <marker id="laz-arr" markerWidth="9" markerHeight="9" refX="7" refY="3" orient="auto">
      <path d="M0,0 L0,6 L8,3 z" fill="currentColor" opacity="0.6"/>
    </marker>
  </defs>
  <!-- old pattern -->
  <text x="20" y="28" font-size="10" fill="currentColor" opacity="0.55">download then read</text>
  <rect x="20" y="36" width="120" height="46" rx="6" fill="none" stroke="currentColor" stroke-width="1.3" opacity="0.55"/>
  <text x="80" y="63" text-anchor="middle" font-size="10" fill="currentColor" opacity="0.7">S3 object</text>
  <rect x="200" y="36" width="120" height="46" rx="6" fill="none" stroke="currentColor" stroke-width="1.3" opacity="0.55" stroke-dasharray="4 3"/>
  <text x="260" y="58" text-anchor="middle" font-size="10" fill="currentColor" opacity="0.7">local temp</text>
  <text x="260" y="72" text-anchor="middle" font-size="9" fill="currentColor" opacity="0.5">tile.laz</text>
  <rect x="380" y="36" width="120" height="46" rx="6" fill="none" stroke="currentColor" stroke-width="1.3" opacity="0.55"/>
  <text x="440" y="63" text-anchor="middle" font-size="10" fill="currentColor" font-family="monospace" opacity="0.7">readers.las</text>
  <line x1="140" y1="59" x2="198" y2="59" stroke="currentColor" stroke-width="1.3" opacity="0.5" marker-end="url(#laz-arr)"/>
  <line x1="320" y1="59" x2="378" y2="59" stroke="currentColor" stroke-width="1.3" opacity="0.5" marker-end="url(#laz-arr)"/>
  <!-- streaming pattern -->
  <text x="20" y="128" font-size="10" fill="currentColor" opacity="0.7">stream via /vsis3/</text>
  <rect x="20" y="136" width="140" height="52" rx="6" fill="none" stroke="currentColor" stroke-width="1.5"/>
  <text x="90" y="160" text-anchor="middle" font-size="11" fill="currentColor" font-weight="600">S3 bucket</text>
  <text x="90" y="177" text-anchor="middle" font-size="9" fill="currentColor" font-family="monospace" opacity="0.65">tile.laz</text>
  <rect x="280" y="136" width="150" height="52" rx="6" fill="none" stroke="currentColor" stroke-width="1.5"/>
  <text x="355" y="160" text-anchor="middle" font-size="11" fill="currentColor" font-weight="600">GDAL /vsis3/</text>
  <text x="355" y="177" text-anchor="middle" font-size="9" fill="currentColor" opacity="0.6">SigV4 GET</text>
  <rect x="550" y="136" width="150" height="52" rx="6" fill="none" stroke="currentColor" stroke-width="1.5"/>
  <text x="625" y="160" text-anchor="middle" font-size="11" fill="currentColor" font-family="monospace" font-weight="600">readers.las</text>
  <text x="625" y="177" text-anchor="middle" font-size="9" fill="currentColor" opacity="0.6">no temp file</text>
  <line x1="160" y1="162" x2="278" y2="162" stroke="currentColor" stroke-width="1.5" marker-end="url(#laz-arr)"/>
  <line x1="430" y1="162" x2="548" y2="162" stroke="currentColor" stroke-width="1.5" marker-end="url(#laz-arr)"/>
</svg>

## Prerequisites and Assumptions

| Requirement | Detail |
|---|---|
| PDAL | 2.5+ built against GDAL 3.4+ (conda-forge `pdal`) |
| Python `pdal` bindings | `pip install pdal` in the same environment |
| `boto3` | for verification (`pip install boto3`) |
| Credentials | env vars, a named profile, or an attached IAM role |
| IAM permissions | `s3:GetObject`, plus `s3:ListBucket` for COPC probing |
| Bucket region | known and exported as `AWS_REGION` |

Confirm GDAL was built with the S3 driver before anything else:

```bash
pdal --version           # note the linked GDAL version
gdalinfo --formats | grep -i vsi   # confirms virtual FS support is present
```

If the source object might carry an empty or wrong CRS in its header, handle that as you would for any file — see [fixing CRS mismatches in point clouds](https://www.pythonlidar.com/point-cloud-data-standards-fundamentals/coordinate-reference-systems/fixing-crs-mismatches-in-point-clouds/). The transport layer never rewrites the CRS.

## Step-by-Step Implementation

### Step 1 — Set the region and credentials

GDAL signs `/vsis3/` requests with the same credential chain the AWS CLI uses. On a workstation, the simplest path is environment variables:

```bash
export AWS_REGION=us-west-2
export AWS_ACCESS_KEY_ID=AKIA...
export AWS_SECRET_ACCESS_KEY=...
```

On EC2, ECS, or Fargate, skip the keys entirely and attach an IAM role — GDAL reads the instance/container metadata endpoint automatically. For a public dataset, sign nothing:

```bash
export AWS_NO_SIGN_REQUEST=YES
```

### Step 2 — Rewrite the S3 URI to a `/vsis3/` path

The virtual file system uses a different prefix from the familiar `s3://` scheme. Strip `s3://` and prepend `/vsis3/`:

```python
def s3_uri_to_vsis3(uri: str) -> str:
    """Convert s3://bucket/key.laz to /vsis3/bucket/key.laz."""
    if not uri.startswith("s3://"):
        raise ValueError(f"Expected an s3:// URI, got: {uri}")
    return "/vsis3/" + uri[len("s3://"):]
```

So `s3://ny-lidar-2021/tiles/u_18TWL_4501.laz` becomes `/vsis3/ny-lidar-2021/tiles/u_18TWL_4501.laz`.

### Step 3 — Build the pipeline and execute

Hand the rewritten path to `readers.las` exactly as you would a local filename. Nothing downstream needs to know the source is remote:

```python
import json
import pdal

def stream_laz(vsis3_path: str) -> pdal.Pipeline:
    pipeline = {
        "pipeline": [
            {"type": "readers.las", "filename": vsis3_path},
            {"type": "filters.stats", "dimensions": "Z"},
        ]
    }
    return pdal.Pipeline(json.dumps(pipeline))
```

The `filters.stats` stage here simply proves the bytes flowed by summarising the `Z` dimension; in a real job you would chain classification, reprojection, or rasterisation stages after the reader following the usual [PDAL stage chaining](https://www.pythonlidar.com/pdal-pipeline-architecture-execution/pdal-stage-chaining/) rules.

### Step 4 — Tune the range-read behaviour

For a bucket holding thousands of sibling tiles, stop GDAL from listing the prefix on every open and restrict which extensions it probes:

```python
import os

os.environ["GDAL_DISABLE_READDIR_ON_OPEN"] = "EMPTY_DIR"
os.environ["CPL_VSIL_CURL_ALLOWED_EXTENSIONS"] = ".laz,.copc.laz"
os.environ["CPL_VSIL_CURL_CACHE_SIZE"] = str(128 * 1024 * 1024)
```

## Complete Working Example

Save as `stream_laz_from_s3.py` and run against any accessible LAZ object. It configures the environment, rewrites the URI, streams the tile, and cross-checks the streamed count against a boto3 `head_object`.

```python
#!/usr/bin/env python3
"""
stream_laz_from_s3.py
Stream a LAZ tile from Amazon S3 into PDAL through /vsis3/ with no local copy.

Usage:
    python stream_laz_from_s3.py s3://ny-lidar-2021/tiles/u_18TWL_4501.laz

Requirements:
    conda install -c conda-forge pdal python-pdal   # PDAL 2.5+ / GDAL 3.4+
    pip install boto3
"""

import os
import sys
import json

import pdal
import boto3


def configure_env(region: str = "us-west-2") -> None:
    os.environ.setdefault("AWS_REGION", region)
    os.environ["GDAL_DISABLE_READDIR_ON_OPEN"] = "EMPTY_DIR"
    os.environ["CPL_VSIL_CURL_ALLOWED_EXTENSIONS"] = ".laz,.copc.laz"
    os.environ["CPL_VSIL_CURL_CACHE_SIZE"] = str(128 * 1024 * 1024)


def s3_uri_to_vsis3(uri: str) -> tuple[str, str, str]:
    """Return (vsis3_path, bucket, key) for an s3:// URI."""
    if not uri.startswith("s3://"):
        raise ValueError(f"Expected an s3:// URI, got: {uri}")
    bucket, _, key = uri[len("s3://"):].partition("/")
    return f"/vsis3/{bucket}/{key}", bucket, key


def stream_and_count(vsis3_path: str) -> int:
    pipeline = pdal.Pipeline(json.dumps({
        "pipeline": [
            {"type": "readers.las", "filename": vsis3_path},
            {"type": "filters.stats", "dimensions": "Z"},
        ]
    }))
    pipeline.validate()
    count = pipeline.execute()
    stats = json.loads(pipeline.metadata)["metadata"]["filters.stats"]
    z = stats["statistic"][0]
    print(f"Streamed {count:,} points; Z range {z['minimum']:.2f}..{z['maximum']:.2f}")
    return count


def sanity_check_object(bucket: str, key: str) -> None:
    head = boto3.client("s3").head_object(Bucket=bucket, Key=key)
    print(f"s3://{bucket}/{key}: {head['ContentLength']:,} bytes on the bucket")


def main() -> None:
    if len(sys.argv) != 2:
        print("Usage: python stream_laz_from_s3.py s3://bucket/key.laz")
        sys.exit(1)

    configure_env()
    vsis3_path, bucket, key = s3_uri_to_vsis3(sys.argv[1])
    print(f"Streaming {vsis3_path} ...")

    count = stream_and_count(vsis3_path)
    if count == 0:
        raise RuntimeError("Streamed 0 points — check credentials, region, and key.")

    sanity_check_object(bucket, key)
    print("OK: tile streamed directly from S3, no local copy written.")


if __name__ == "__main__":
    main()
```

## Key Parameter Table

| Parameter / variable | Where | Example | Notes |
|---|---|---|---|
| `filename` | `readers.las` | `/vsis3/ny-lidar-2021/tiles/u_18TWL_4501.laz` | Virtual path; no local file created |
| `AWS_REGION` | env | `us-west-2` | Must match the bucket's region |
| `AWS_NO_SIGN_REQUEST` | env | `YES` | Read public buckets without credentials |
| `GDAL_DISABLE_READDIR_ON_OPEN` | env | `EMPTY_DIR` | Skips per-open directory listing |
| `CPL_VSIL_CURL_ALLOWED_EXTENSIONS` | env | `.laz,.copc.laz` | Restricts extensions GDAL probes |
| `CPL_VSIL_CURL_CACHE_SIZE` | env | `134217728` | Range-read cache size in bytes |

## Verification

**Assert a non-zero count.** A silent `0` from `execute()` means the object was reachable but empty, or a filter dropped everything — for a bare reader plus stats it almost always signals a credential or key problem masked by a permissive error path.

```python
assert count > 0, "Streamed 0 points — credentials, region, or key is wrong"
```

**Confirm no temp file was written.** The whole point of `/vsis3/` is to avoid local scratch. Watch the working directory during a run and confirm nothing appears; the only bytes on disk should be whatever a downstream writer produces.

**Cross-check the object size.** A `head_object` proves the key exists and reports `ContentLength`. If the streamed point count looks implausibly small for a multi-hundred-megabyte object, suspect a truncated transfer or a region redirect that silently degraded to a partial read.

```bash
aws s3api head-object --bucket ny-lidar-2021 --key tiles/u_18TWL_4501.laz --region us-west-2
```

## Gotchas and Edge Cases

**1. "Streaming" LAZ still transfers the whole object.** LAZ compresses points into chunks that are not spatially indexed, so PDAL cannot fetch "just the corner" of a plain `.laz`. The `/vsis3/` handler pulls the entire object across the wire before decompression. If you need genuine partial reads — fetching only the octree nodes a bounding box touches — convert the archive to COPC (`.copc.laz`), which the parent [S3 Cloud Storage I/O](https://www.pythonlidar.com/batch-automation-cloud-integration/s3-cloud-storage-io/) guide covers. For iterative work on the same tile, weigh the transfer cost against local caching, a trade-off explored in [LAZ vs Uncompressed LAS for Iterative Processing](https://www.pythonlidar.com/pdal-pipeline-architecture-execution/memory-management/laz-vs-uncompressed-las-for-iterative-processing/).

**2. Credentials go missing inside containers.** A container that runs fine locally can fail in production because the local `~/.aws/credentials` was never mounted and no role is attached. On ECS/Fargate rely on the task role; in plain Docker, pass credentials as environment variables or mount the credentials file read-only. Never bake keys into the image — see [Running PDAL Pipelines in Docker](https://www.pythonlidar.com/batch-automation-cloud-integration/pdal-docker-containers/running-pdal-pipelines-in-docker/).

**3. Region mismatch degrades silently.** If `AWS_REGION` is wrong, S3 may answer with a 301 redirect that GDAL cannot always replay for a signed request, producing an obscure failure rather than a clear "wrong region" message. Always export the bucket's home region explicitly.

**4. A shared process cache can mask a broken read.** Within one process the `CPL_VSIL_CURL` cache serves repeated opens of the same key, so a permissions change on the bucket may not surface until a fresh process starts. When testing access, use a new interpreter rather than re-running in the same session.

## Frequently Asked Questions

**Does streaming a LAZ file from S3 avoid downloading the whole object?**

No. A plain LAZ object is transferred in full because its compressed chunks are not spatially addressable. Streaming here means PDAL reads through the `/vsis3/` handler without you writing a local file, but the entire object still crosses the network. Only COPC or EPT layouts fetch just the ranges a query needs.

**How does PDAL get AWS credentials when reading `/vsis3/` inside a container?**

GDAL reads the standard AWS credential chain: environment variables first, then a mounted `~/.aws/credentials` profile, then the container or instance role metadata endpoint. On ECS/Fargate the task role is exposed automatically, so no secret needs to be baked into the image.

**Can I stream from a public bucket without credentials?**

Yes. Set `AWS_NO_SIGN_REQUEST=YES` so GDAL skips signing, or use the `/vsicurl/` prefix with the object's HTTPS URL. Both issue unauthenticated range requests and need no AWS keys.

**Why is my first read from S3 slow but later reads fast?**

The first open pays for the header probe, TLS handshake, and any directory listing. Later reads within the same process hit the `CPL_VSIL_CURL` cache. Setting `GDAL_DISABLE_READDIR_ON_OPEN=EMPTY_DIR` removes the listing cost on that first open.

---

## Related

- [S3 Cloud Storage I/O with PDAL](https://www.pythonlidar.com/batch-automation-cloud-integration/s3-cloud-storage-io/) — parent guide to reading and writing point clouds against S3
- [Writing Cloud-Optimized GeoTIFFs to S3](https://www.pythonlidar.com/batch-automation-cloud-integration/s3-cloud-storage-io/writing-cloud-optimized-geotiffs-to-s3/) — the write-back counterpart to this read guide
- [Running PDAL Pipelines in Docker](https://www.pythonlidar.com/batch-automation-cloud-integration/pdal-docker-containers/running-pdal-pipelines-in-docker/) — supply credentials to a containerised streaming job
- [PDAL Stage Chaining](https://www.pythonlidar.com/pdal-pipeline-architecture-execution/pdal-stage-chaining/) — chain filters after the streaming reader
- [Batch Automation and Cloud Integration for PDAL](https://www.pythonlidar.com/batch-automation-cloud-integration/) — the wider cloud automation picture
