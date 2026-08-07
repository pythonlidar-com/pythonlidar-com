---
title: "Writing Cloud-Optimized GeoTIFFs to S3"
description: "Producing a Cloud-Optimized GeoTIFF DTM with PDAL writers.gdal and uploading it to S3 — COG creation options, /vsis3/ direct writes vs boto3 upload, and validating the COG structure."
slug: "writing-cloud-optimized-geotiffs-to-s3"
type: "howto"
breadcrumb: "Writing COGs to S3"
datePublished: "2024-07-06"
dateModified: "2026-07-12"
---

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Article",
      "headline": "Writing Cloud-Optimized GeoTIFFs to S3",
      "description": "Producing a Cloud-Optimized GeoTIFF DTM with PDAL writers.gdal and uploading it to S3 — COG creation options, /vsis3/ direct writes vs boto3 upload, and validating the COG structure.",
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
        {"@type": "ListItem", "position": 4, "name": "Writing COGs to S3", "item": "https://www.pythonlidar.com/batch-automation-cloud-integration/s3-cloud-storage-io/writing-cloud-optimized-geotiffs-to-s3/"}
      ]
    },
    {
      "@type": "HowTo",
      "name": "Write a Cloud-Optimized GeoTIFF DTM and upload it to S3",
      "description": "Rasterise a DTM with PDAL writers.gdal using the COG driver and upload the result to an Amazon S3 bucket, then validate the COG structure.",
      "step": [
        {"@type": "HowToStep", "position": 1, "name": "Rasterise a DTM to local scratch", "text": "Run writers.gdal with the COG driver and creation options to a local temp path."},
        {"@type": "HowToStep", "position": 2, "name": "Choose direct write or boto3 upload", "text": "Either target a /vsis3/ path directly or upload the finished local COG with boto3 for atomic multipart transfer."},
        {"@type": "HowToStep", "position": 3, "name": "Validate the COG structure", "text": "Confirm tiling and overviews with gdalinfo or the rio cogeo validate check."},
        {"@type": "HowToStep", "position": 4, "name": "Confirm the object on the bucket", "text": "Run head_object and open the raster back through /vsis3/ to prove it reads remotely."}
      ]
    },
    {
      "@type": "FAQPage",
      "mainEntity": [
        {
          "@type": "Question",
          "name": "Should I use the GDAL COG driver or GTiff with COG options in writers.gdal?",
          "acceptedAnswer": {"@type": "Answer", "text": "Prefer the dedicated COG driver (gdaldriver: COG). It builds internal tiling, overviews, and the correct IFD ordering in one pass so the output is a valid Cloud-Optimized GeoTIFF by construction. GTiff with TILED=YES plus a manual gdaladdo can produce an equivalent file but requires the extra overview step and careful option matching."}
        },
        {
          "@type": "Question",
          "name": "Is a direct /vsis3/ write atomic?",
          "acceptedAnswer": {"@type": "Answer", "text": "Effectively yes for the object itself — GDAL buffers the raster and issues the PutObject only on close, so readers never see a partial file. But a crash mid-run leaves no object at all and wastes the compute. Writing to local scratch then uploading with boto3 gives you a verifiable file plus multipart resumability."}
        },
        {
          "@type": "Question",
          "name": "Do Cloud-Optimized GeoTIFFs need internal overviews?",
          "acceptedAnswer": {"@type": "Answer", "text": "Yes. Overviews are what let a client fetch a low-resolution preview with a small range request instead of downloading the full raster. The COG driver generates them automatically; with the plain GTiff driver you must add them with gdaladdo or the OVERVIEWS creation option before the file qualifies as a COG."}
        },
        {
          "@type": "Question",
          "name": "How do I validate that my GeoTIFF is actually a valid COG?",
          "acceptedAnswer": {"@type": "Answer", "text": "Run rio cogeo validate on the file, or inspect it with gdalinfo and confirm it reports a tiled layout with overviews and the LAYOUT=COG structure. A valid COG has internal tiles, overviews ordered for range reads, and the image data after the metadata."}
        }
      ]
    }
  ]
}
</script>

**TL;DR:** Rasterise ground points with `writers.gdal` using `gdaldriver: "COG"` and creation options (`COMPRESS=DEFLATE`, `BLOCKSIZE=512`, `OVERVIEWS=AUTO`), write to local scratch, then push the finished file to `s3://survey-deliverables/cog/tile.tif` with a boto3 `upload_file` — validate with `rio cogeo validate` before and `gdalinfo /vsis3/...` after.

## Context and Motivation

This guide is part of [S3 Cloud Storage I/O with PDAL](https://www.pythonlidar.com/batch-automation-cloud-integration/s3-cloud-storage-io/), which covers the full range of reading and writing point-cloud data against Amazon S3.

A terrain raster that lives in a bucket is only useful to downstream web maps and tiling services if it is a Cloud-Optimized GeoTIFF: internally tiled, carrying overviews, and laid out so a client can pull a small window with an HTTP range request instead of downloading the whole file. PDAL's `writers.gdal` stage rasterises a classified point cloud into exactly this kind of surface, and GDAL's COG driver structures the bytes correctly. The remaining question — the one this guide answers — is how the finished raster gets into the bucket: a direct `/vsis3/` write from the writer, or a two-step "write local, upload with boto3" that trades a little code for atomicity and resumability. The upstream rasterisation is the same one covered in [Generating a DTM GeoTIFF with writers.gdal](https://www.pythonlidar.com/ground-filtering-dtm-dsm-generation/dtm-raster-generation/generating-a-dtm-geotiff-with-writers-gdal/); here the focus is COG structure and the S3 handoff.

<svg viewBox="0 0 740 250" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Two paths for writing a Cloud-Optimized GeoTIFF DTM to S3" style="width:100%;max-width:740px;display:block;margin:1.5rem auto">
  <title>Writing a COG DTM to S3: direct /vsis3/ write versus local write plus boto3 upload</title>
  <desc>writers.gdal rasterises points into a COG. Path A writes directly to a /vsis3/ path with a single PutObject on close. Path B writes to local scratch, validates, then uploads with a boto3 multipart transfer. Both land the same object in the bucket.</desc>
  <rect x="0" y="0" width="740" height="250" fill="var(--dg-bg)" rx="10"/>
  <defs>
    <marker id="cog-arr" markerWidth="9" markerHeight="9" refX="7" refY="3" orient="auto">
      <path d="M0,0 L0,6 L8,3 z" fill="currentColor" opacity="0.6"/>
    </marker>
  </defs>
  <!-- writer -->
  <rect x="20" y="98" width="150" height="60" rx="8" fill="none" stroke="currentColor" stroke-width="1.5"/>
  <text x="95" y="124" text-anchor="middle" font-size="11" fill="currentColor" font-family="monospace" font-weight="600">writers.gdal</text>
  <text x="95" y="142" text-anchor="middle" font-size="9" fill="currentColor" opacity="0.6">COG driver</text>
  <!-- path A -->
  <text x="300" y="52" text-anchor="middle" font-size="10" fill="currentColor" opacity="0.6">Path A: direct write</text>
  <rect x="240" y="62" width="160" height="52" rx="8" fill="none" stroke="currentColor" stroke-width="1.4" opacity="0.85"/>
  <text x="320" y="86" text-anchor="middle" font-size="10" fill="currentColor" font-family="monospace" opacity="0.75">/vsis3/ path</text>
  <text x="320" y="103" text-anchor="middle" font-size="9" fill="currentColor" opacity="0.6">buffer, PutObject on close</text>
  <line x1="170" y1="118" x2="238" y2="92" stroke="currentColor" stroke-width="1.4" opacity="0.6" marker-end="url(#cog-arr)"/>
  <!-- path B -->
  <text x="300" y="150" text-anchor="middle" font-size="10" fill="currentColor" opacity="0.6">Path B: local then upload</text>
  <rect x="240" y="160" width="150" height="52" rx="8" fill="none" stroke="currentColor" stroke-width="1.4" opacity="0.85"/>
  <text x="315" y="184" text-anchor="middle" font-size="10" fill="currentColor" opacity="0.75">local scratch .tif</text>
  <text x="315" y="201" text-anchor="middle" font-size="9" fill="currentColor" opacity="0.6">validate then boto3</text>
  <line x1="170" y1="140" x2="238" y2="176" stroke="currentColor" stroke-width="1.4" opacity="0.6" marker-end="url(#cog-arr)"/>
  <rect x="450" y="160" width="130" height="52" rx="8" fill="none" stroke="currentColor" stroke-width="1.4" opacity="0.85"/>
  <text x="515" y="190" text-anchor="middle" font-size="9" fill="currentColor" opacity="0.7">boto3 upload_file</text>
  <text x="515" y="204" text-anchor="middle" font-size="8" fill="currentColor" opacity="0.55">multipart</text>
  <line x1="390" y1="186" x2="448" y2="186" stroke="currentColor" stroke-width="1.4" opacity="0.6" marker-end="url(#cog-arr)"/>
  <!-- bucket -->
  <rect x="610" y="98" width="120" height="70" rx="8" fill="none" stroke="currentColor" stroke-width="1.6"/>
  <text x="670" y="128" text-anchor="middle" font-size="11" fill="currentColor" font-weight="600">S3 bucket</text>
  <text x="670" y="146" text-anchor="middle" font-size="9" fill="currentColor" font-family="monospace" opacity="0.6">cog/tile.tif</text>
  <line x1="400" y1="88" x2="608" y2="120" stroke="currentColor" stroke-width="1.4" opacity="0.5" marker-end="url(#cog-arr)"/>
  <line x1="580" y1="186" x2="640" y2="168" stroke="currentColor" stroke-width="1.4" opacity="0.5" marker-end="url(#cog-arr)"/>
</svg>

## Prerequisites and Assumptions

| Requirement | Detail |
|---|---|
| PDAL | 2.5+ built against GDAL 3.4+ (COG driver requires GDAL 3.1+) |
| Python `pdal` bindings | `pip install pdal` |
| `boto3` | for the upload path and verification |
| `rio-cogeo` (optional) | `pip install rio-cogeo` for `rio cogeo validate` |
| Input | a classified cloud with ground points (Classification 2) |
| IAM permissions | `s3:PutObject` on the target bucket/prefix |

The point cloud should already carry ground labels. If it does not, run `filters.smrf` first as shown below; the ground-classification background lives in the broader terrain-model material referenced under [DTM Raster Generation](https://www.pythonlidar.com/ground-filtering-dtm-dsm-generation/dtm-raster-generation/).

## Step-by-Step Implementation

### Step 1 — Rasterise a DTM with the COG driver

The COG driver builds tiling and overviews in a single pass, so the writer output is a valid Cloud-Optimized GeoTIFF with no separate overview step:

```json
{
  "type": "writers.gdal",
  "filename": "/tmp/dtm_tile_0421.tif",
  "resolution": 0.5,
  "output_type": "idw",
  "data_type": "float32",
  "nodata": -9999,
  "gdaldriver": "COG",
  "gdalopts": "COMPRESS=DEFLATE,BLOCKSIZE=512,OVERVIEWS=AUTO,RESAMPLING=BILINEAR"
}
```

`output_type: "idw"` interpolates across small gaps between ground points; `BLOCKSIZE=512` sets the internal tile size the COG driver uses, and `OVERVIEWS=AUTO` lets GDAL pick the overview levels.

### Step 2 — Choose direct write or local-plus-upload

For a direct write, swap the local `filename` for a `/vsis3/` path — GDAL buffers the raster and issues one `PutObject` on close:

```json
"filename": "/vsis3/survey-deliverables/cog/dtm_tile_0421.tif"
```

For the more robust two-step path, keep the local `filename`, validate the file, then upload it. This is preferred for large rasters and unattended batch jobs because a mid-run crash never leaves a half-written object, and boto3's multipart transfer resumes cleanly.

### Step 3 — Upload with boto3 (two-step path)

```python
import boto3
from boto3.s3.transfer import TransferConfig

def upload_cog(local_path: str, bucket: str, key: str) -> None:
    """Multipart-upload a finished COG with the correct content type."""
    cfg = TransferConfig(multipart_threshold=8 * 1024 * 1024)  # 8 MB parts
    boto3.client("s3").upload_file(
        local_path, bucket, key,
        ExtraArgs={"ContentType": "image/tiff", "ServerSideEncryption": "AES256"},
        Config=cfg,
    )
```

### Step 4 — Validate the COG structure

Confirm the file is genuinely cloud-optimized before or after upload:

```bash
rio cogeo validate /tmp/dtm_tile_0421.tif
# or, structurally:
gdalinfo /tmp/dtm_tile_0421.tif | grep -iE "block|overview|layout"
```

A valid COG reports an internally tiled layout with overviews present.

<svg viewBox="0 0 720 262" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="The internal layout of a cloud optimized GeoTIFF" style="width:100%;max-width:720px;display:block;margin:1.6rem auto">
  <title>What makes a GeoTIFF cloud optimized</title>
  <desc>A COG laid out in file order: the header and image file directories first, then the overview levels from coarsest to finest, then the full resolution tiles. Because the directories are at the front and the data is internally tiled, a client can read the header in one request and then fetch exactly the tiles covering its area of interest.</desc>
  <rect x="0" y="0" width="720" height="262" fill="var(--dg-bg)" rx="10"/>
  <rect x="20" y="64" width="90" height="70" rx="5" fill="var(--dg-a-soft)" stroke="var(--dg-a)" stroke-width="1.3"/>
  <text x="65" y="150" text-anchor="middle" font-size="9.5" fill="var(--dg-muted)">header + IFDs</text>
  <rect x="114" y="64" width="70" height="70" rx="5" fill="var(--dg-c-soft)" stroke="var(--dg-c)" stroke-width="1.3"/>
  <text x="149" y="150" text-anchor="middle" font-size="9.5" fill="var(--dg-muted)">overview 1:16</text>
  <rect x="188" y="64" width="90" height="70" rx="5" fill="var(--dg-c-soft)" stroke="var(--dg-c)" stroke-width="1.3"/>
  <text x="233" y="150" text-anchor="middle" font-size="9.5" fill="var(--dg-muted)">overview 1:4</text>
  <rect x="282" y="64" width="120" height="70" rx="5" fill="var(--dg-c-soft)" stroke="var(--dg-c)" stroke-width="1.3"/>
  <text x="342" y="150" text-anchor="middle" font-size="9.5" fill="var(--dg-muted)">overview 1:2</text>
  <rect x="406" y="64" width="290" height="70" rx="5" fill="var(--dg-b-soft)" stroke="var(--dg-b)" stroke-width="1.3"/>
  <text x="551" y="150" text-anchor="middle" font-size="9.5" fill="var(--dg-muted)">full resolution tiles, 512×512</text>
  <text x="20" y="46" font-size="10.5" fill="var(--dg-muted)">byte order in the file, front to back</text>
  <text x="20" y="182" font-size="11" fill="var(--dg-text)">a viewer zoomed out reads only the third block; a pipeline cropping one field reads the header and four tiles</text>
  <text x="20" y="216" font-size="10.5" fill="var(--dg-muted)">gdal_translate -of COG does all of this, including the overview build — writing a plain GeoTIFF and renaming it does not,</text>
  <text x="20" y="236" font-size="10.5" fill="var(--dg-muted)">and rio cogeo validate is the check that tells the two apart before the object reaches the bucket.</text>
</svg>

## Complete Working Example

Save as `dtm_cog_to_s3.py`. It classifies ground, rasterises a COG DTM to scratch, validates it, and multipart-uploads it to S3.

```python
#!/usr/bin/env python3
"""
dtm_cog_to_s3.py
Rasterise a Cloud-Optimized GeoTIFF DTM with PDAL and upload it to S3.

Usage:
    python dtm_cog_to_s3.py input.laz survey-deliverables cog/dtm_tile_0421.tif

Requirements:
    conda install -c conda-forge pdal python-pdal   # GDAL 3.1+ for the COG driver
    pip install boto3 rio-cogeo
"""

import os
import sys
import json
import subprocess
import tempfile

import pdal
import boto3
from boto3.s3.transfer import TransferConfig


def build_cog_dtm(src: str, dst_local: str, resolution: float = 0.5) -> pdal.Pipeline:
    """Classify ground, keep it, and rasterise a COG DTM to a local path."""
    stages = [
        {"type": "readers.las", "filename": src},
        {"type": "filters.smrf", "slope": 0.2, "window": 16.0, "threshold": 0.45},
        {"type": "filters.range", "limits": "Classification[2:2]"},
        {
            "type": "writers.gdal",
            "filename": dst_local,
            "resolution": resolution,
            "output_type": "idw",
            "data_type": "float32",
            "nodata": -9999,
            "gdaldriver": "COG",
            "gdalopts": "COMPRESS=DEFLATE,BLOCKSIZE=512,OVERVIEWS=AUTO,RESAMPLING=BILINEAR",
        },
    ]
    return pdal.Pipeline(json.dumps({"pipeline": stages}))


def validate_cog(path: str) -> None:
    """Raise if the file is not a valid Cloud-Optimized GeoTIFF."""
    result = subprocess.run(
        ["rio", "cogeo", "validate", path],
        capture_output=True, text=True,
    )
    if "is a valid cloud optimized GeoTIFF" not in result.stdout:
        raise RuntimeError(f"COG validation failed:\n{result.stdout}\n{result.stderr}")
    print(result.stdout.strip())


def upload_cog(local_path: str, bucket: str, key: str) -> None:
    cfg = TransferConfig(multipart_threshold=8 * 1024 * 1024)
    boto3.client("s3").upload_file(
        local_path, bucket, key,
        ExtraArgs={"ContentType": "image/tiff", "ServerSideEncryption": "AES256"},
        Config=cfg,
    )
    print(f"Uploaded s3://{bucket}/{key}")


def confirm_remote(bucket: str, key: str) -> None:
    head = boto3.client("s3").head_object(Bucket=bucket, Key=key)
    print(f"Confirmed s3://{bucket}/{key}: {head['ContentLength']:,} bytes")


def main() -> None:
    if len(sys.argv) != 4:
        print("Usage: python dtm_cog_to_s3.py <input.laz> <bucket> <key>")
        sys.exit(1)

    src, bucket, key = sys.argv[1], sys.argv[2], sys.argv[3]
    os.environ.setdefault("AWS_REGION", "us-west-2")

    with tempfile.TemporaryDirectory() as tmp:
        local_cog = os.path.join(tmp, "dtm.tif")
        pipeline = build_cog_dtm(src, local_cog)
        pipeline.validate()
        n = pipeline.execute()
        print(f"Rasterised {n:,} ground points into {local_cog}")

        validate_cog(local_cog)
        upload_cog(local_cog, bucket, key)
        confirm_remote(bucket, key)


if __name__ == "__main__":
    main()
```

## Key Parameter Table

| Option | Where | Example | Notes |
|---|---|---|---|
| `gdaldriver` | `writers.gdal` | `COG` | Dedicated COG driver; builds tiling + overviews in one pass |
| `COMPRESS` | `gdalopts` | `DEFLATE` | Lossless; use `LZW` or `ZSTD` as alternatives |
| `BLOCKSIZE` | `gdalopts` | `512` | Internal tile edge in pixels (COG driver option) |
| `OVERVIEWS` | `gdalopts` | `AUTO` | Overview generation; `AUTO` lets GDAL choose levels |
| `RESAMPLING` | `gdalopts` | `BILINEAR` | Resampling used when building overviews |
| `output_type` | `writers.gdal` | `idw` | Interpolation across gaps; `mean`/`min`/`max` also valid |
| `resolution` | `writers.gdal` | `0.5` | Grid spacing in CRS units (metres for UTM) |
| `nodata` | `writers.gdal` | `-9999` | Fill value for empty cells |
| `multipart_threshold` | `TransferConfig` | `8388608` | Part size boundary for boto3 multipart upload |

For the plain `GTiff` driver, the equivalent block option is `BLOCKXSIZE`/`BLOCKYSIZE` with `TILED=YES`, and you must add overviews separately with `gdaladdo` before the file counts as a COG.

## Verification

**Validate the COG locally** with `rio cogeo validate`, which checks tiling, overview presence, and IFD ordering:

```bash
rio cogeo validate /tmp/dtm.tif
# -> ".../dtm.tif is a valid cloud optimized GeoTIFF"
```

**Confirm the object landed** with a `head_object` and check the size is plausible for the raster dimensions:

```python
import boto3
head = boto3.client("s3").head_object(Bucket="survey-deliverables", Key="cog/dtm_tile_0421.tif")
assert head["ContentLength"] > 0
print(head["ContentLength"], head["ETag"])
```

**Read it back through `/vsis3/`** to prove the uploaded COG opens remotely and reports the tiled structure — the ultimate proof that a client can range-read it:

```bash
AWS_REGION=us-west-2 gdalinfo /vsis3/survey-deliverables/cog/dtm_tile_0421.tif | grep -iE "block|overview|epsg"
```

<svg viewBox="0 0 720 250" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Writing a COG straight to S3 against writing locally and uploading" style="width:100%;max-width:720px;display:block;margin:1.6rem auto">
  <title>Why the local write usually wins</title>
  <desc>Two write paths. Writing through the S3 virtual filesystem streams the file as it is produced but cannot revisit earlier bytes, so GDAL has to buffer the parts a COG needs to rewrite. Writing to local disk first lets GDAL seek freely, then a single multipart upload transfers a finished, validated object.</desc>
  <rect x="0" y="0" width="720" height="250" fill="var(--dg-bg)" rx="10"/>
  <defs><marker id="wr-arw" markerWidth="9" markerHeight="7" refX="9" refY="3.5" orient="auto"><path d="M0,0 L0,7 L9,3.5 z" fill="var(--dg-line)"/></marker></defs>
  <text x="20" y="44" font-size="11.5" font-weight="600" fill="var(--dg-c)">direct to /vsis3/</text>
  <rect x="180" y="28" width="140" height="32" rx="6" fill="var(--dg-c-soft)" stroke="var(--dg-c)" stroke-width="1.2"/>
  <text x="250" y="49" text-anchor="middle" font-size="10.5" fill="var(--dg-text)">writers.gdal</text>
  <rect x="360" y="28" width="150" height="32" rx="6" fill="var(--dg-c-soft)" stroke="var(--dg-c)" stroke-width="1.2"/>
  <text x="435" y="49" text-anchor="middle" font-size="10.5" fill="var(--dg-text)">buffered in memory</text>
  <rect x="550" y="28" width="150" height="32" rx="6" fill="var(--dg-c-soft)" stroke="var(--dg-c)" stroke-width="1.2"/>
  <text x="625" y="49" text-anchor="middle" font-size="10.5" fill="var(--dg-text)">object in S3</text>
  <line x1="320" y1="44" x2="354" y2="44" stroke="var(--dg-line)" stroke-width="1.4" marker-end="url(#wr-arw)"/>
  <line x1="510" y1="44" x2="544" y2="44" stroke="var(--dg-line)" stroke-width="1.4" marker-end="url(#wr-arw)"/>
  <text x="20" y="112" font-size="11.5" font-weight="600" fill="var(--dg-d)">local, then upload</text>
  <rect x="180" y="96" width="140" height="32" rx="6" fill="var(--dg-d-soft)" stroke="var(--dg-d)" stroke-width="1.2"/>
  <text x="250" y="117" text-anchor="middle" font-size="10.5" fill="var(--dg-text)">writers.gdal</text>
  <rect x="360" y="96" width="150" height="32" rx="6" fill="var(--dg-d-soft)" stroke="var(--dg-d)" stroke-width="1.2"/>
  <text x="435" y="117" text-anchor="middle" font-size="10.5" fill="var(--dg-text)">local disk, seekable</text>
  <rect x="550" y="96" width="150" height="32" rx="6" fill="var(--dg-d-soft)" stroke="var(--dg-d)" stroke-width="1.2"/>
  <text x="625" y="117" text-anchor="middle" font-size="10.5" fill="var(--dg-text)">multipart upload</text>
  <line x1="320" y1="112" x2="354" y2="112" stroke="var(--dg-line)" stroke-width="1.4" marker-end="url(#wr-arw)"/>
  <line x1="510" y1="112" x2="544" y2="112" stroke="var(--dg-line)" stroke-width="1.4" marker-end="url(#wr-arw)"/>
  <text x="20" y="166" font-size="10.5" fill="var(--dg-muted)">the direct path holds the overview pyramid in RAM until the file is closed, which on a 0.25 m DTM is gigabytes; the local path</text>
  <text x="20" y="186" font-size="10.5" fill="var(--dg-muted)">needs scratch space the container may not have. On Batch, attach an ephemeral volume and take the second path.</text>
  <text x="20" y="212" font-size="10.5" fill="var(--dg-muted)">Either way, validate before the object is visible — write to a staging key and copy on success, so no consumer ever sees</text>
  <text x="20" y="232" font-size="10.5" fill="var(--dg-muted)">a half-written raster at the final key.</text>
</svg>

## Gotchas and Edge Cases

**1. COG driver versus GTiff + manual overviews.** The dedicated `COG` driver is the reliable choice: it emits tiling, overviews, and the metadata-before-data layout in one write. If you must use `GTiff` (for a driver-specific option the COG driver does not expose), you have to set `TILED=YES` and run `gdaladdo -r bilinear file.tif 2 4 8 16` afterward, then re-validate. Skipping the overview step yields a tiled GeoTIFF that fails COG validation.

**2. Direct `/vsis3/` writes are not resumable.** A direct write holds the whole raster in memory and PUTs it once on close. That is atomic from a reader's perspective — no partial object appears — but if the process dies mid-run you lose the compute and get no object at all. For large tiles, the local-then-upload path lets boto3 resume a failed multipart transfer and lets you validate the file before it ever reaches the bucket.

**3. Overviews inflate small tiles.** For tiny rasters, overviews and internal tiling can add more overhead than they save. The COG structure pays off for rasters large enough that a client benefits from range-reading a window; for a 200×200 pixel tile the benefit is marginal. Consider your consumer's access pattern before mandating COG on every output.

**4. Content type and encryption on upload.** boto3 does not infer `ContentType` from the extension, so without `ExtraArgs` the object may be served as `binary/octet-stream`, which some tile viewers reject. Set `ContentType="image/tiff"`, and if the bucket policy denies unencrypted PUTs, pass `ServerSideEncryption` explicitly — a direct `/vsis3/` write cannot easily attach these headers, which is another reason to prefer the boto3 path for governed buckets.

## Frequently Asked Questions

**Should I use the GDAL COG driver or GTiff with COG options in `writers.gdal`?**

Prefer the dedicated COG driver (`gdaldriver: "COG"`). It builds internal tiling, overviews, and the correct IFD ordering in one pass, so the output is a valid Cloud-Optimized GeoTIFF by construction. `GTiff` with `TILED=YES` plus a manual `gdaladdo` can produce an equivalent file but requires the extra overview step and careful option matching.

**Is a direct `/vsis3/` write atomic?**

Effectively yes for the object itself — GDAL buffers the raster and issues the `PutObject` only on close, so readers never see a partial file. But a crash mid-run leaves no object at all and wastes the compute. Writing to local scratch then uploading with boto3 gives you a verifiable file plus multipart resumability.

**Do Cloud-Optimized GeoTIFFs need internal overviews?**

Yes. Overviews let a client fetch a low-resolution preview with a small range request instead of downloading the full raster. The COG driver generates them automatically; with the plain `GTiff` driver you must add them with `gdaladdo` or the `OVERVIEWS` creation option before the file qualifies as a COG.

**How do I validate that my GeoTIFF is actually a valid COG?**

Run `rio cogeo validate` on the file, or inspect it with `gdalinfo` and confirm it reports a tiled layout with overviews and the COG structure. A valid COG has internal tiles, overviews ordered for range reads, and the image data positioned after the metadata.

---

## Related

- [S3 Cloud Storage I/O with PDAL](https://www.pythonlidar.com/batch-automation-cloud-integration/s3-cloud-storage-io/) — parent guide to reading and writing point clouds against S3
- [Streaming LAZ from S3 with PDAL](https://www.pythonlidar.com/batch-automation-cloud-integration/s3-cloud-storage-io/streaming-laz-from-s3-with-pdal/) — the read-side counterpart to this write guide
- [Generating a DTM GeoTIFF with writers.gdal](https://www.pythonlidar.com/ground-filtering-dtm-dsm-generation/dtm-raster-generation/generating-a-dtm-geotiff-with-writers-gdal/) — the upstream rasterisation this guide sends to the cloud
- [DTM Raster Generation](https://www.pythonlidar.com/ground-filtering-dtm-dsm-generation/dtm-raster-generation/) — surface-model interpolation options and gap handling
- [Batch Automation and Cloud Integration for PDAL](https://www.pythonlidar.com/batch-automation-cloud-integration/) — the wider cloud automation picture
