---
title: "Building a Slim PDAL Docker Image"
description: "Build a small, reproducible PDAL image for batch LiDAR processing: a multi-stage build with micromamba and conda-forge, cleaning package caches, running as a non-root user, and checking the result with pdal --drivers and image size reports."
slug: "building-a-slim-pdal-docker-image"
type: "howto"
breadcrumb: "Slim PDAL Image"
datePublished: "2026-09-18"
dateModified: "2026-09-18"
templateEngineOverride: md
---

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Article",
      "headline": "Building a Slim PDAL Docker Image",
      "description": "Build a small, reproducible PDAL image for batch LiDAR processing: a multi-stage build with micromamba and conda-forge, cleaning package caches, running as a non-root user, and checking the result with pdal --drivers and image size reports.",
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
          "name": "PDAL Docker Containers",
          "item": "https://www.pythonlidar.com/batch-automation-cloud-integration/pdal-docker-containers/"
        },
        {
          "@type": "ListItem",
          "position": 4,
          "name": "Slim PDAL Image",
          "item": "https://www.pythonlidar.com/batch-automation-cloud-integration/pdal-docker-containers/building-a-slim-pdal-docker-image/"
        }
      ]
    },
    {
      "@type": "HowTo",
      "name": "Build a slim PDAL Docker image",
      "step": [
        {
          "@type": "HowToStep",
          "name": "Install into a prefix in a builder stage",
          "text": "Use the mambaorg/micromamba image and create the environment at a fixed prefix such as /opt/env from the lock file."
        },
        {
          "@type": "HowToStep",
          "name": "Clean inside the same layer",
          "text": "Run micromamba clean --all --yes and delete headers, static libraries and bytecode caches in the same RUN so the removed files never land in a layer."
        },
        {
          "@type": "HowToStep",
          "name": "Copy the environment into a slim runtime",
          "text": "FROM debian:bookworm-slim, then COPY --from=builder /opt/env /opt/env and put /opt/env/bin first on PATH."
        },
        {
          "@type": "HowToStep",
          "name": "Set the runtime environment",
          "text": "Set PROJ_DATA and GDAL_DATA to the environment's share directories, add a non-root user, and copy the application code last so code changes do not invalidate the environment layer."
        },
        {
          "@type": "HowToStep",
          "name": "Check the image",
          "text": "Run pdal --version, pdal --drivers, a Python import test and docker image ls to confirm drivers and size."
        }
      ]
    },
    {
      "@type": "FAQPage",
      "mainEntity": [
        {
          "@type": "Question",
          "name": "What is the easiest way to get a small PDAL image?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Install PDAL from conda-forge with micromamba in a builder stage, clean caches in the same step, and copy only the environment directory into a slim Debian runtime stage."
          }
        },
        {
          "@type": "Question",
          "name": "Why not use Alpine for a PDAL image?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "PDAL and GDAL are not packaged for Alpine's musl libc on conda-forge, so they would have to be compiled from source. A slim Debian base with a conda-forge environment is simpler and still small."
          }
        },
        {
          "@type": "Question",
          "name": "Which environment variables does a PDAL image need?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Set PROJ_DATA and GDAL_DATA to the environment's share directories so projections and GDAL data files are found, and put the environment's bin directory first on PATH."
          }
        },
        {
          "@type": "Question",
          "name": "How do I check that the image has the drivers my pipeline needs?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Run pdal --drivers inside the image and search for each stage your pipelines use, then process a test tile and compare its output with a known-good result."
          }
        }
      ]
    }
  ]
}
</script>

**TL;DR:** Install PDAL, python-pdal and GDAL from conda-forge with micromamba in a builder stage, run `micromamba clean --all` and strip static libraries and headers, then copy only the environment into a minimal runtime stage and run as a non-root user. A typical result is well under half the size of a naive single-stage conda image, starts faster on every Batch or Kubernetes node, and contains exactly the packages your lock file names.

## Context and Motivation

This guide is part of [PDAL Docker Containers](https://www.pythonlidar.com/batch-automation-cloud-integration/pdal-docker-containers/). The official `pdal/pdal` image is convenient for trying commands, as in [running PDAL pipelines in Docker](https://www.pythonlidar.com/batch-automation-cloud-integration/pdal-docker-containers/running-pdal-pipelines-in-docker/), but production batch work usually needs your own image: PDAL plus python-pdal, laspy, NumPy, boto3 and your code, at pinned versions. Built naively, such an image carries a full conda installation, package caches and build headers, and can reach several gigabytes. Every node that runs a tile pulls it, so image size turns directly into start-up latency and registry egress across a large fleet.

<svg viewBox="0 0 740 210" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Multi-stage build copying only the environment" style="width:100%;max-width:740px;display:block;margin:1.6rem auto">
  <title>Builder stage and runtime stage</title>
  <desc>A builder stage based on a micromamba image installs PDAL, GDAL and Python packages, then cleans caches and removes headers and static libraries. Only the resulting environment directory is copied into a runtime stage based on a slim Debian image, which adds the application code and a non-root user.</desc>
  <defs><marker id="sp-arw" markerWidth="9" markerHeight="7" refX="9" refY="3.5" orient="auto"><path d="M0,0 L0,7 L9,3.5 z" fill="var(--dg-line)"/></marker></defs>
  <rect x="0" y="0" width="740" height="210" fill="var(--dg-bg)" rx="10"/>
  <rect x="20" y="30" width="300" height="150" rx="10" fill="var(--dg-surface-2)" stroke="var(--dg-line)" stroke-width="1.3"/>
  <text x="170" y="56" text-anchor="middle" font-size="11.5" font-weight="600" fill="var(--dg-text)">builder</text>
  <g font-size="10.5" fill="var(--dg-text)">
    <text x="40" y="86" text-anchor="start">micromamba install -f conda-lock</text>
    <text x="40" y="110" text-anchor="start">micromamba clean --all</text>
    <text x="40" y="134" text-anchor="start">rm include/, *.a, __pycache__</text>
    <text x="40" y="158" text-anchor="start">caches and tools stay here</text>
  </g>
  <rect x="420" y="30" width="300" height="150" rx="10" fill="var(--dg-d-soft)" stroke="var(--dg-d)" stroke-width="1.3"/>
  <text x="570" y="56" text-anchor="middle" font-size="11.5" font-weight="600" fill="var(--dg-text)">runtime</text>
  <g font-size="10.5" fill="var(--dg-text)">
    <text x="440" y="86" text-anchor="start">debian:bookworm-slim</text>
    <text x="440" y="110" text-anchor="start">COPY --from=builder /opt/env</text>
    <text x="440" y="134" text-anchor="start">COPY app/</text>
    <text x="440" y="158" text-anchor="start">USER lidar</text>
  </g>
  <line x1="320" y1="105" x2="416" y2="105" stroke="var(--dg-line)" stroke-width="1.5" marker-end="url(#sp-arw)"/>
  <text x="368" y="96" text-anchor="middle" font-size="10" fill="var(--dg-muted)">env only</text>
</svg>

## Prerequisites and Assumptions

- Docker or BuildKit-compatible builder (`docker buildx`).
- A conda lock file for the environment, as produced in [pinning PDAL versions with conda-lock](https://www.pythonlidar.com/batch-automation-cloud-integration/pdal-docker-containers/pinning-pdal-versions-with-conda-lock/), or an `environment.yml` to start from.
- A registry (ECR, GHCR, or similar) that the compute nodes pull from.

## Step-by-Step Implementation

### Step 1 — Install into a prefix in a builder stage

Use the `mambaorg/micromamba` image and create the environment at a fixed prefix such as `/opt/env` from the lock file.

### Step 2 — Clean inside the same layer

Run `micromamba clean --all --yes` and delete headers, static libraries and bytecode caches in the same `RUN` so the removed files never land in a layer.

### Step 3 — Copy the environment into a slim runtime

`FROM debian:bookworm-slim`, then `COPY --from=builder /opt/env /opt/env` and put `/opt/env/bin` first on `PATH`.

### Step 4 — Set the runtime environment

Set `PROJ_DATA` and `GDAL_DATA` to the environment's share directories, add a non-root user, and copy the application code last so code changes do not invalidate the environment layer.

### Step 5 — Check the image

Run `pdal --version`, `pdal --drivers`, a Python import test and `docker image ls` to confirm drivers and size.

## Complete Working Example

`Dockerfile`:

```dockerfile
# syntax=docker/dockerfile:1.7
FROM mambaorg/micromamba:1.5-bookworm-slim AS builder
COPY --chown=$MAMBA_USER:$MAMBA_USER conda-linux-64.lock /tmp/env.lock
RUN micromamba create -y -p /opt/env -f /tmp/env.lock \
 && micromamba clean --all --yes \
 && find /opt/env -name '*.a' -delete \
 && rm -rf /opt/env/include /opt/env/share/doc /opt/env/share/man \
 && find /opt/env -name '__pycache__' -type d -prune -exec rm -rf {} +

FROM debian:bookworm-slim AS runtime
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates \
 && rm -rf /var/lib/apt/lists/* \
 && useradd --create-home --uid 1000 lidar
COPY --from=builder /opt/env /opt/env
ENV PATH=/opt/env/bin:$PATH \
    PROJ_DATA=/opt/env/share/proj \
    GDAL_DATA=/opt/env/share/gdal \
    GDAL_DISABLE_READDIR_ON_OPEN=EMPTY_DIR \
    PYTHONDONTWRITEBYTECODE=1
WORKDIR /app
COPY --chown=lidar:lidar app/ /app/
USER lidar
ENTRYPOINT ["python", "/app/entrypoint.py"]
```

Build and check:

```bash
docker buildx build --platform linux/amd64 -t lidar-pdal:2026.09 --load .

docker run --rm --entrypoint pdal lidar-pdal:2026.09 --version
docker run --rm --entrypoint pdal lidar-pdal:2026.09 --drivers | grep -E 'readers.copc|filters.smrf|writers.gdal'
docker run --rm --entrypoint python lidar-pdal:2026.09 -c "import pdal, laspy, numpy; print(pdal.__version__, laspy.__version__)"
docker image ls lidar-pdal:2026.09 --format '{{.Size}}'
```

<svg viewBox="0 0 740 200" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Relative image sizes for three build approaches" style="width:100%;max-width:740px;display:block;margin:1.6rem auto">
  <title>Where the size goes</title>
  <desc>Three horizontal bars compare image size. A single-stage Miniconda image with caches is the longest. A single-stage micromamba image after cleaning is medium. The multi-stage build copying only the cleaned environment into a slim base is the shortest. Bars are illustrative; measure your own build.</desc>
  <rect x="0" y="0" width="740" height="200" fill="var(--dg-bg)" rx="10"/>
  <g font-size="10.5" fill="var(--dg-text)">
    <text x="20" y="50" text-anchor="start">single stage, caches kept</text>
    <text x="20" y="100" text-anchor="start">single stage, cleaned</text>
    <text x="20" y="150" text-anchor="start">multi-stage, env only</text>
  </g>
  <rect x="230" y="34" width="480" height="24" rx="4" fill="var(--dg-e-soft)" stroke="var(--dg-e)"/>
  <rect x="230" y="84" width="300" height="24" rx="4" fill="var(--dg-a-soft)" stroke="var(--dg-a)"/>
  <rect x="230" y="134" width="200" height="24" rx="4" fill="var(--dg-d-soft)" stroke="var(--dg-d)"/>
  <text x="370" y="186" text-anchor="middle" font-size="10.5" fill="var(--dg-muted)">illustrative proportions; check with docker image ls</text>
</svg>

## Why Not Alpine or pip Wheels

Alpine images are small, but PDAL and GDAL are not packaged for musl in conda-forge, so building them from source on Alpine is slow and fragile. The python-pdal wheel on PyPI needs a matching system PDAL to build against rather than bundling one, which pushes you back to installing PDAL separately. The conda-forge route gives PDAL, GDAL, PROJ and their plugins built consistently against each other, and the multi-stage copy removes most of the cost of using conda. Distroless bases can go smaller still, but debugging a failed tile without a shell is painful; a slim Debian base is a sensible middle ground.

Keep the environment focused. Every optional package — Jupyter, matplotlib, a full scientific stack — pulls in its own dependency tree. A batch image needs PDAL, python-pdal, NumPy, your I/O libraries and your code; notebooks belong in a separate development image built from the same lock file with extra packages.

## Tagging and Rebuilding

Tag images with something that identifies their contents, not just `latest`: a date plus the lock file's hash, or the PDAL version plus a build number. Job definitions and DAGs then reference an exact tag, and an old run can be reproduced months later by pulling the same image. Rebuild on a schedule — monthly is common — to pick up security fixes in the base image, but treat each rebuild as a new version that must pass the same one-tile comparison before production jobs switch to it. Registry lifecycle rules can expire untagged layers so old builds do not accumulate storage costs.

## Key Parameter Table

| Choice | Recommended | Reason |
|---|---|---|
| Builder base | `mambaorg/micromamba` | Fast solver, small footprint |
| Environment spec | conda-lock file | Exact, reproducible packages |
| Runtime base | `debian:bookworm-slim` | glibc, shell for debugging |
| Clean step | same `RUN` as install | Deleted files never enter a layer |
| `PROJ_DATA`, `GDAL_DATA` | env share dirs | Grids and definitions found |
| User | non-root, uid 1000 | Least privilege, matching bind mounts |
| Platform | explicit `linux/amd64` or `arm64` | Match the compute fleet |

## Verification

- **Drivers present.** `pdal --drivers` lists every stage your pipelines use; a missing plugin (for example `readers.copc` or `filters.hag_dem`) fails here instead of in production.
- **PROJ grids.** `projinfo -s EPSG:4269 -t EPSG:6318 --spatial-test intersects` lists operations; missing grid files show as unavailable operations.
- **Same outputs.** Run one tile through the old image and the new one and compare point counts and raster checksums.

## Gotchas and Edge Cases

**Deleting too much.** Some packages load data from `share/` at run time — PROJ, GDAL and certificates. Remove `share/doc` and `share/man`, not `share/` wholesale.

**Architecture mismatch.** Building on an Apple Silicon laptop produces `arm64` images by default. Graviton instances can run them, x86 fleets cannot; set `--platform` explicitly.

**Layer ordering.** Copy application code after the environment so a code change rebuilds only the last layers and nodes pull a few kilobytes instead of the whole environment.

<svg viewBox="130 0 480 186" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Layer order and what changes rebuild" style="width:100%;max-width:740px;display:block;margin:1.6rem auto">
  <title>Layer order matters</title>
  <desc>Stacked image layers from bottom to top: slim base, certificates and user, the conda environment, and application code. A change to application code rebuilds only the top layer, so nodes that already cached the lower layers pull only a small update.</desc>
  <rect x="130" y="0" width="480" height="186" fill="var(--dg-bg)" rx="10"/>
  <g font-size="10.5" fill="var(--dg-text)">
    <rect x="160" y="20" width="420" height="30" rx="5" fill="var(--dg-d-soft)" stroke="var(--dg-d)"/><text text-anchor="middle" x="370" y="40">app code (changes often, KB)</text>
    <rect x="160" y="56" width="420" height="50" rx="5" fill="var(--dg-a-soft)" stroke="var(--dg-a)"/><text text-anchor="middle" x="370" y="86">/opt/env (changes with the lock file)</text>
    <rect x="160" y="112" width="420" height="24" rx="5" fill="var(--dg-surface-2)" stroke="var(--dg-line)"/><text text-anchor="middle" x="370" y="129">certificates, user</text>
    <rect x="160" y="142" width="420" height="24" rx="5" fill="var(--dg-surface)" stroke="var(--dg-line)"/><text text-anchor="middle" x="370" y="159">debian:bookworm-slim</text>
  </g>
</svg>

## Frequently Asked Questions

**What is the easiest way to get a small PDAL image?**

Install PDAL from conda-forge with micromamba in a builder stage, clean caches in the same step, and copy only the environment directory into a slim Debian runtime stage.

**Why not use Alpine for a PDAL image?**

PDAL and GDAL are not packaged for Alpine's musl libc on conda-forge, so they would have to be compiled from source. A slim Debian base with a conda-forge environment is simpler and still small.

**Which environment variables does a PDAL image need?**

Set PROJ_DATA and GDAL_DATA to the environment's share directories so projections and GDAL data files are found, and put the environment's bin directory first on PATH.

**How do I check that the image has the drivers my pipeline needs?**

Run pdal --drivers inside the image and search for each stage your pipelines use, then process a test tile and compare its output with a known-good result.

## Related

- [PDAL Docker Containers](https://www.pythonlidar.com/batch-automation-cloud-integration/pdal-docker-containers/) — containerising PDAL
- [Running PDAL Pipelines in Docker](https://www.pythonlidar.com/batch-automation-cloud-integration/pdal-docker-containers/running-pdal-pipelines-in-docker/) — the official image
- [Pinning PDAL Versions with conda-lock](https://www.pythonlidar.com/batch-automation-cloud-integration/pdal-docker-containers/pinning-pdal-versions-with-conda-lock/) — the lock file used here
- [Array Jobs for LiDAR Tiles in AWS Batch](https://www.pythonlidar.com/batch-automation-cloud-integration/aws-batch-processing/array-jobs-for-lidar-tiles-in-aws-batch/) — where the image runs
