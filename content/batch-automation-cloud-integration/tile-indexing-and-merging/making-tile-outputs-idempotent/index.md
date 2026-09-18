---
title: "Making Tile Outputs Idempotent"
description: "Design per-tile LiDAR outputs so reruns are safe: deterministic output keys, write-to-temporary-then-move, completion markers carrying input and parameter hashes, skipping tiles already done, and avoiding appends that duplicate points."
slug: "making-tile-outputs-idempotent"
type: "howto"
breadcrumb: "Idempotent Tile Outputs"
datePublished: "2026-09-18"
dateModified: "2026-09-18"
---

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Article",
      "headline": "Making Tile Outputs Idempotent",
      "description": "Design per-tile LiDAR outputs so reruns are safe: deterministic output keys, write-to-temporary-then-move, completion markers carrying input and parameter hashes, skipping tiles already done, and avoiding appends that duplicate points.",
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
          "name": "Tile Indexing and Merging",
          "item": "https://www.pythonlidar.com/batch-automation-cloud-integration/tile-indexing-and-merging/"
        },
        {
          "@type": "ListItem",
          "position": 4,
          "name": "Idempotent Tile Outputs",
          "item": "https://www.pythonlidar.com/batch-automation-cloud-integration/tile-indexing-and-merging/making-tile-outputs-idempotent/"
        }
      ]
    },
    {
      "@type": "HowTo",
      "name": "Make per-tile LiDAR outputs idempotent",
      "step": [
        {
          "@type": "HowToStep",
          "name": "Derive output keys deterministically",
          "text": "Build the output key from the product, the processing version and the tile ID only, for example dtm/v3/571000_4190000.tif. Never include timestamps, run IDs or random suffixes in final keys."
        },
        {
          "@type": "HowToStep",
          "name": "Write to a temporary location",
          "text": "Write to \u2026/_tmp/<tile>.<uuid>.tif, or a local scratch file, so a crash never leaves a partial file at the final key."
        },
        {
          "@type": "HowToStep",
          "name": "Validate before publishing",
          "text": "Open the temporary output and check it has the expected size, CRS and a plausible value range."
        },
        {
          "@type": "HowToStep",
          "name": "Publish atomically",
          "text": "On a filesystem, os.replace the temp file onto the final path. On S3, upload the complete file with a single PUT or a completed multipart upload, which becomes visible all at once, and then delete the temporary object if you used one."
        },
        {
          "@type": "HowToStep",
          "name": "Write the marker last",
          "text": "Write a small JSON marker with the input ETag or hash, the parameter hash and the output checksum. Tasks check it first and skip when it matches."
        }
      ]
    },
    {
      "@type": "FAQPage",
      "mainEntity": [
        {
          "@type": "Question",
          "name": "What does idempotent mean for LiDAR tile processing?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Running a tile task once or many times produces the same outputs. Retries, reruns and overlapping backfills then cannot create duplicates, partial files or mixed results."
          }
        },
        {
          "@type": "Question",
          "name": "How do I avoid partial output files when a job crashes?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Write to a temporary file or key, validate it, and only then move it to the final key. A rename on a filesystem or a single-object upload to S3 makes the complete file appear at once."
          }
        },
        {
          "@type": "Question",
          "name": "How can a task tell whether a tile is already done?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Store a marker after publishing the output, recording a hash of the input and of the processing parameters. The task compares these with the current input and parameters and skips only when both match."
          }
        },
        {
          "@type": "Question",
          "name": "Should output file names include timestamps?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "No. Output keys should depend only on the product, processing version and tile, so a rerun overwrites the same object. Record timestamps inside the marker instead."
          }
        }
      ]
    }
  ]
}
</script>

**TL;DR:** Give every output a key derived only from the tile and the processing version, write it to a temporary name and move it into place only after success, and store a small marker recording a hash of the input and the pipeline parameters. A task then checks the marker first: if it matches, skip; otherwise redo the tile and overwrite. Running the same job once or five times gives the same result, which is what makes retries, partial reruns and backfills safe.

## Context and Motivation

This guide is part of [Tile Indexing and Merging](https://www.pythonlidar.com/batch-automation-cloud-integration/tile-indexing-and-merging/). Distributed tile processing always involves reruns: spot instances disappear mid-write, a scheduler retries a task it believes failed, someone reruns yesterday's job after fixing one tile, or a backfill overlaps a scheduled run. If outputs are not idempotent, each rerun risks a corrupt half-written raster that looks complete, a merged product containing a tile twice, or an appended LAZ with duplicated points — errors that are expensive to find later because nothing failed loudly.

An idempotent task is one whose effect is the same no matter how many times it runs. For tile work that comes down to a few simple rules about names, writes and markers.

<svg viewBox="0 0 740 210" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="An idempotent tile task flow" style="width:100%;max-width:740px;display:block;margin:1.6rem auto">
  <title>Check, write, publish</title>
  <desc>A tile task first reads the completion marker. If the marker's input and parameter hashes match, it skips. Otherwise it writes the output to a temporary key, validates it, moves it to the final deterministic key, and writes the marker last.</desc>
  <defs><marker id="ip-arw" markerWidth="9" markerHeight="7" refX="9" refY="3.5" orient="auto"><path d="M0,0 L0,7 L9,3.5 z" fill="var(--dg-line)"/></marker></defs>
  <rect x="0" y="0" width="740" height="210" fill="var(--dg-bg)" rx="10"/>
  <g font-size="10.5" fill="var(--dg-text)">
    <rect x="20" y="80" width="120" height="50" rx="8" fill="var(--dg-surface-2)" stroke="var(--dg-line)"/><text text-anchor="middle" x="80" y="102">read marker</text><text text-anchor="middle" x="80" y="118">hashes match?</text>
    <rect x="200" y="20" width="110" height="40" rx="8" fill="var(--dg-a-soft)" stroke="var(--dg-a)"/><text text-anchor="middle" x="255" y="44">skip</text>
    <rect x="200" y="140" width="110" height="50" rx="8" fill="var(--dg-surface-2)" stroke="var(--dg-line)"/><text text-anchor="middle" x="255" y="162">write to</text><text text-anchor="middle" x="255" y="178">tmp key</text>
    <rect x="350" y="140" width="110" height="50" rx="8" fill="var(--dg-surface-2)" stroke="var(--dg-line)"/><text text-anchor="middle" x="405" y="170">validate</text>
    <rect x="500" y="140" width="110" height="50" rx="8" fill="var(--dg-surface-2)" stroke="var(--dg-line)"/><text text-anchor="middle" x="555" y="162">move to</text><text text-anchor="middle" x="555" y="178">final key</text>
    <rect x="640" y="140" width="80" height="50" rx="8" fill="var(--dg-d-soft)" stroke="var(--dg-d)"/><text text-anchor="middle" x="680" y="162">write</text><text text-anchor="middle" x="680" y="178">marker</text>
  </g>
  <path d="M140 95 L170 95 L170 40 L196 40" fill="none" stroke="var(--dg-line)" stroke-width="1.3" marker-end="url(#ip-arw)"/>
  <path d="M140 115 L170 115 L170 165 L196 165" fill="none" stroke="var(--dg-line)" stroke-width="1.3" marker-end="url(#ip-arw)"/>
  <line x1="310" y1="165" x2="346" y2="165" stroke="var(--dg-line)" stroke-width="1.3" marker-end="url(#ip-arw)"/>
  <line x1="460" y1="165" x2="496" y2="165" stroke="var(--dg-line)" stroke-width="1.3" marker-end="url(#ip-arw)"/>
  <line x1="610" y1="165" x2="636" y2="165" stroke="var(--dg-line)" stroke-width="1.3" marker-end="url(#ip-arw)"/>
  <text x="185" y="30" text-anchor="end" font-size="10" fill="var(--dg-muted)">yes</text>
  <text x="185" y="194" text-anchor="end" font-size="10" fill="var(--dg-muted)">no</text>
</svg>

## Prerequisites and Assumptions

- Tiles with stable identifiers, for example from [retiling flightline files into a grid](https://www.pythonlidar.com/batch-automation-cloud-integration/tile-indexing-and-merging/retiling-flightline-files-into-a-grid/).
- Output storage that is either a filesystem (atomic rename) or S3 (atomic single-object PUT, with strong read-after-write consistency).
- A version string for your processing — pipeline version, image tag or lock hash.

## Step-by-Step Implementation

### Step 1 — Derive output keys deterministically

Build the output key from the product, the processing version and the tile ID only, for example `dtm/v3/571000_4190000.tif`. Never include timestamps, run IDs or random suffixes in final keys.

### Step 2 — Write to a temporary location

Write to `…/_tmp/<tile>.<uuid>.tif`, or a local scratch file, so a crash never leaves a partial file at the final key.

### Step 3 — Validate before publishing

Open the temporary output and check it has the expected size, CRS and a plausible value range.

### Step 4 — Publish atomically

On a filesystem, `os.replace` the temp file onto the final path. On S3, upload the complete file with a single PUT or a completed multipart upload, which becomes visible all at once, and then delete the temporary object if you used one.

### Step 5 — Write the marker last

Write a small JSON marker with the input ETag or hash, the parameter hash and the output checksum. Tasks check it first and skip when it matches.

## Complete Working Example

```python
"""Idempotent per-tile DTM task for local disk or S3."""
import hashlib
import json
import os
import tempfile

import boto3
import pdal
import rasterio

s3 = boto3.client("s3")
BUCKET = "lidar-out"
VERSION = "v3"
PARAMS = {"slope": 0.15, "window": 18.0, "threshold": 0.5, "resolution": 1.0}
PARAM_HASH = hashlib.sha256(json.dumps(PARAMS, sort_keys=True).encode()).hexdigest()[:16]


def marker_key(tile):
    return f"dtm/{VERSION}/_markers/{tile}.json"


def is_done(tile, input_etag):
    try:
        m = json.loads(s3.get_object(Bucket=BUCKET, Key=marker_key(tile))["Body"].read())
    except s3.exceptions.NoSuchKey:
        return False
    return m["input_etag"] == input_etag and m["param_hash"] == PARAM_HASH


def process(tile, in_bucket="lidar-in"):
    in_key = f"tiles/{tile}.laz"
    etag = s3.head_object(Bucket=in_bucket, Key=in_key)["ETag"].strip('"')
    if is_done(tile, etag):
        return "skipped"

    final_key = f"dtm/{VERSION}/{tile}.tif"
    with tempfile.TemporaryDirectory() as tmp:
        local = os.path.join(tmp, f"{tile}.tif")
        spec = {"pipeline": [
            f"/vsis3/{in_bucket}/{in_key}",
            {"type": "filters.smrf", "slope": PARAMS["slope"], "window": PARAMS["window"],
             "threshold": PARAMS["threshold"]},
            {"type": "filters.range", "limits": "Classification[2:2]"},
            {"type": "writers.gdal", "filename": local, "resolution": PARAMS["resolution"],
             "output_type": "idw", "data_type": "float32", "nodata": -9999},
        ]}
        pdal.Pipeline(json.dumps(spec)).execute()

        with rasterio.open(local) as src:                         # validate before publishing
            z = src.read(1, masked=True)
            assert src.crs is not None and z.count() > 0, f"{tile}: empty or no CRS"
            assert -500 < float(z.min()) and float(z.max()) < 9000, f"{tile}: implausible z"

        digest = hashlib.sha256(open(local, "rb").read()).hexdigest()
        s3.upload_file(local, BUCKET, final_key)                  # atomic: whole object or none

    s3.put_object(Bucket=BUCKET, Key=marker_key(tile), Body=json.dumps({
        "tile": tile, "input_etag": etag, "param_hash": PARAM_HASH,
        "version": VERSION, "output_sha256": digest}).encode())
    return "written"
```

Because the marker is written after the output, a crash between the two leaves an output without a marker; the next run redoes the tile and overwrites the same key, which is harmless. The reverse — a marker without an output — cannot happen.

<svg viewBox="0 0 740 200" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="What a crash leaves behind at each point" style="width:100%;max-width:740px;display:block;margin:1.6rem auto">
  <title>Crash at any point is safe</title>
  <desc>A timeline of the task with three crash points. A crash during processing leaves only a temporary file, ignored by readers. A crash after upload but before the marker leaves a correct output without a marker, so the next run redoes and overwrites it. A crash after the marker leaves a completed tile that the next run skips.</desc>
  <rect x="0" y="0" width="740" height="200" fill="var(--dg-bg)" rx="10"/>
  <line x1="40" y1="70" x2="700" y2="70" stroke="var(--dg-line)" stroke-width="1.5"/>
  <g font-size="10.5" fill="var(--dg-text)">
    <text text-anchor="middle" x="150" y="50">process to tmp</text>
    <text text-anchor="middle" x="390" y="50">upload final</text>
    <text text-anchor="middle" x="610" y="50">write marker</text>
  </g>
  <g fill="var(--dg-e)">
    <circle cx="260" cy="70" r="7"/><circle cx="500" cy="70" r="7"/><circle cx="690" cy="70" r="7"/>
  </g>
  <g font-size="10" fill="var(--dg-text)">
    <rect x="170" y="100" width="180" height="60" rx="8" fill="var(--dg-surface-2)" stroke="var(--dg-line)"/><text text-anchor="middle" x="260" y="126">only a tmp file</text><text text-anchor="middle" x="260" y="144">readers never see it</text>
    <rect x="410" y="100" width="180" height="60" rx="8" fill="var(--dg-surface-2)" stroke="var(--dg-line)"/><text text-anchor="middle" x="500" y="126">output, no marker</text><text text-anchor="middle" x="500" y="144">rerun overwrites</text>
    <rect x="560" y="166" width="170" height="28" rx="8" fill="var(--dg-d-soft)" stroke="var(--dg-d)"/><text text-anchor="middle" x="645" y="185">complete: rerun skips</text>
  </g>
  <line x1="690" y1="77" x2="690" y2="162" stroke="var(--dg-line)" stroke-width="1" stroke-dasharray="3 3"/>
</svg>

## Versioning Instead of Overwriting History

Idempotency and reproducibility pull slightly in different directions: idempotent tasks overwrite, but you may want to keep the outputs of the previous processing version. Put the version in the key prefix — `dtm/v3/` — and bump it whenever parameters or the software environment change in a way that alters results. Reruns within a version overwrite identical results; a new version writes alongside the old one, and consumers switch by prefix. Including the parameter hash in the marker, not just the version, catches the case where someone edits parameters but forgets to bump the version: the marker no longer matches, so every tile is reprocessed rather than silently mixing old and new results within one version.

Merged products need the same care. Build mosaics and merged LAZ files from the tile outputs listed in markers, not from a directory listing that might include temporary objects, and write the merged product to a key that includes the version and a hash of the input list, as in [merging processed tiles into one LAZ](https://www.pythonlidar.com/batch-automation-cloud-integration/tile-indexing-and-merging/merging-processed-tiles-into-one-laz/).

## Key Parameter Table

| Rule | Implementation | Prevents |
|---|---|---|
| Deterministic keys | product/version/tile | Duplicates across reruns |
| Temp then publish | `os.replace` or single PUT | Partial files at final keys |
| Validate first | open and range-check | Publishing empty or broken outputs |
| Marker last | JSON with input and param hashes | Skipping stale results |
| Version prefix | `v3/` | Mixing processing versions |
| No appends | overwrite whole tile outputs | Duplicated points |

## Verification

- **Run twice.** Run a batch, then run it again unchanged; the second run skips every tile and the output checksums are identical.
- **Kill mid-run.** Stop workers partway through, rerun, and confirm there are no truncated outputs and no tile is missing.
- **Change a parameter.** Edit one parameter without bumping the version; every tile's marker mismatches and the tiles are reprocessed.

## Gotchas and Edge Cases

**Appending is never idempotent.** Writers that append to an existing LAZ or GeoPackage layer duplicate data on retry. Write per-tile outputs and merge them afterwards from the marker list.

**ETags of multipart uploads.** An S3 ETag for a multipart object is not an MD5 of the content, but it is stable for the same object, which is all the marker needs. If inputs may be rewritten with identical content, use a content hash instead.

**Clock-based names.** A key such as `dtm_2026-09-18T10:22.tif` creates a new object on every retry. Put timestamps in marker metadata, never in output keys.

<svg viewBox="0 0 740 170" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Append versus overwrite on retry" style="width:100%;max-width:740px;display:block;margin:1.6rem auto">
  <title>Append duplicates, overwrite does not</title>
  <desc>Two outcomes after a task runs twice. Appending to a shared output leaves the tile's points in it twice. Overwriting a per-tile output leaves exactly one copy, identical to a single run.</desc>
  <rect x="0" y="0" width="740" height="170" fill="var(--dg-bg)" rx="10"/>
  <rect x="20" y="30" width="330" height="100" rx="10" fill="var(--dg-e-soft)" stroke="var(--dg-e)" stroke-width="1.3"/>
  <text x="185" y="62" text-anchor="middle" font-size="11.5" font-weight="600" fill="var(--dg-text)">append on retry</text>
  <text x="185" y="88" text-anchor="middle" font-size="10.5" fill="var(--dg-text)">tile points written twice</text>
  <text x="185" y="108" text-anchor="middle" font-size="10.5" fill="var(--dg-text)">density doubles silently</text>
  <rect x="390" y="30" width="330" height="100" rx="10" fill="var(--dg-d-soft)" stroke="var(--dg-d)" stroke-width="1.3"/>
  <text x="555" y="62" text-anchor="middle" font-size="11.5" font-weight="600" fill="var(--dg-text)">overwrite per tile</text>
  <text x="555" y="88" text-anchor="middle" font-size="10.5" fill="var(--dg-text)">one copy, same bytes</text>
  <text x="555" y="108" text-anchor="middle" font-size="10.5" fill="var(--dg-text)">retries are harmless</text>
  <text x="370" y="156" text-anchor="middle" font-size="10.5" fill="var(--dg-muted)">merge afterwards from the marker list</text>
</svg>

## Frequently Asked Questions

**What does idempotent mean for LiDAR tile processing?**

Running a tile task once or many times produces the same outputs. Retries, reruns and overlapping backfills then cannot create duplicates, partial files or mixed results.

**How do I avoid partial output files when a job crashes?**

Write to a temporary file or key, validate it, and only then move it to the final key. A rename on a filesystem or a single-object upload to S3 makes the complete file appear at once.

**How can a task tell whether a tile is already done?**

Store a marker after publishing the output, recording a hash of the input and of the processing parameters. The task compares these with the current input and parameters and skips only when both match.

**Should output file names include timestamps?**

No. Output keys should depend only on the product, processing version and tile, so a rerun overwrites the same object. Record timestamps inside the marker instead.

## Related

- [Tile Indexing and Merging](https://www.pythonlidar.com/batch-automation-cloud-integration/tile-indexing-and-merging/) — tiling strategies
- [Retiling Flightline Files into a Grid](https://www.pythonlidar.com/batch-automation-cloud-integration/tile-indexing-and-merging/retiling-flightline-files-into-a-grid/) — stable tile identifiers
- [Merging Processed Tiles into One LAZ](https://www.pythonlidar.com/batch-automation-cloud-integration/tile-indexing-and-merging/merging-processed-tiles-into-one-laz/) — building merged products safely
- [Retrying Failed Tiles in Airflow](https://www.pythonlidar.com/batch-automation-cloud-integration/airflow-dag-orchestration/retrying-failed-tiles-in-airflow/) — retries that rely on idempotency
- [Pinning PDAL Versions with conda-lock](https://www.pythonlidar.com/batch-automation-cloud-integration/pdal-docker-containers/pinning-pdal-versions-with-conda-lock/) — versioning the environment
