---
title: "PDAL Docker Containers for Reproducible Pipelines"
description: "Packaging PDAL, GDAL, PROJ, and the Python bindings into a pinned Docker image for reproducible LiDAR processing — the official pdal/pdal image, custom Dockerfiles, volume mounts, and running pipeline JSON in a container."
slug: "pdal-docker-containers"
type: "topic"
breadcrumb: "PDAL Docker Containers"
datePublished: "2024-07-02"
dateModified: "2026-07-12"
---

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Article",
      "headline": "PDAL Docker Containers for Reproducible Pipelines",
      "description": "Packaging PDAL, GDAL, PROJ, and the Python bindings into a pinned Docker image for reproducible LiDAR processing — the official pdal/pdal image, custom Dockerfiles, volume mounts, and running pipeline JSON in a container.",
      "datePublished": "2024-07-02",
      "dateModified": "2026-07-12",
      "author": {"@type": "Organization", "name": "pythonlidar.com"}
    },
    {
      "@type": "BreadcrumbList",
      "itemListElement": [
        {"@type": "ListItem", "position": 1, "name": "Home", "item": "https://www.pythonlidar.com/"},
        {"@type": "ListItem", "position": 2, "name": "Batch Automation and Cloud Integration for PDAL", "item": "https://www.pythonlidar.com/batch-automation-cloud-integration/"},
        {"@type": "ListItem", "position": 3, "name": "PDAL Docker Containers", "item": "https://www.pythonlidar.com/batch-automation-cloud-integration/pdal-docker-containers/"}
      ]
    },
    {
      "@type": "HowTo",
      "name": "Package PDAL into a pinned Docker image for reproducible pipelines",
      "step": [
        {"@type": "HowToStep", "name": "Pin the base image", "text": "Reference ghcr.io/pdal/pdal:2.6 by digest so PDAL, GDAL, and PROJ versions never drift between builds."},
        {"@type": "HowToStep", "name": "Add Python dependencies", "text": "Layer laspy, rasterio, and boto3 into a custom Dockerfile with a pinned requirements file."},
        {"@type": "HowToStep", "name": "Create a non-root user", "text": "Add a dedicated uid/gid so files written to bind mounts are owned correctly on the host."},
        {"@type": "HowToStep", "name": "Bind mount the tile directory", "text": "Mount the host data folder into the container with docker run -v and reference container paths in the pipeline JSON."},
        {"@type": "HowToStep", "name": "Run the pipeline", "text": "Invoke pdal pipeline against the mounted JSON or call a Python entrypoint that drives the pipeline."}
      ]
    },
    {
      "@type": "FAQPage",
      "mainEntity": [
        {
          "@type": "Question",
          "name": "Why pin the PDAL Docker image to a specific tag instead of latest?",
          "acceptedAnswer": {"@type": "Answer", "text": "The latest tag moves whenever a new image is published, which silently changes the bundled PDAL, GDAL, and PROJ versions. A pipeline that classified ground correctly last month can drift after an upstream rebuild. Pinning to ghcr.io/pdal/pdal:2.6 — or better, to an image digest — freezes the entire native stack so results stay byte-for-byte reproducible across machines and CI runs."}
        },
        {
          "@type": "Question",
          "name": "Does the official PDAL image include the Python bindings?",
          "acceptedAnswer": {"@type": "Answer", "text": "The ghcr.io/pdal/pdal images are built on a conda-forge base that includes the python-pdal bindings and a working Python interpreter. You can import pdal inside the container immediately. You still need to add laspy, rasterio, or boto3 yourself with a custom Dockerfile if your entrypoint uses them."}
        },
        {
          "@type": "Question",
          "name": "Why do files created inside the container belong to root on the host?",
          "acceptedAnswer": {"@type": "Answer", "text": "By default a container process runs as uid 0, so any file it writes to a bind mount is owned by root on the host. Run the container with --user $(id -u):$(id -g), or bake a non-root user into the image with a fixed uid/gid, so output LAZ tiles and GeoTIFFs are owned by your host account and remain editable."}
        },
        {
          "@type": "Question",
          "name": "How do I keep the PDAL image small?",
          "acceptedAnswer": {"@type": "Answer", "text": "Use a multi-stage build so compilers and build caches never reach the final layer, install only the Python packages you actually import, and clean conda and pip caches in the same RUN instruction that installs them. Pinning a slim requirements file rather than a broad environment.yml keeps the runtime image in the 1.2–1.6 GB range instead of 3 GB+."}
        }
      ]
    }
  ]
}
</script>

Reproducibility is the hardest guarantee to make in a LiDAR processing stack. A pipeline that classifies ground and writes a clean DTM depends not only on the PDAL version but on the exact GDAL and PROJ builds underneath it, the datum grids installed alongside PROJ, and the Python packages wrapped around the whole thing. Move that pipeline to a colleague's laptop or a fresh cloud worker and a subtly different PROJ can shift coordinates by metres. Packaging PDAL into a pinned Docker image collapses that entire native stack into a single immutable artifact you can pull, run, and archive — the same bytes producing the same output everywhere. This guide is part of [Batch Automation and Cloud Integration for PDAL](https://www.pythonlidar.com/batch-automation-cloud-integration/), and it establishes the container foundation that the batch and cloud workflows build on.

<svg viewBox="0 0 760 300" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="PDAL Docker image layer and volume mount architecture" style="width:100%;max-width:760px;display:block;margin:1.5rem auto">
  <title>PDAL Docker image layers and host bind mounts</title>
  <desc>A layered diagram: the official pdal base image at the bottom carrying PDAL, GDAL, and PROJ, a middle layer adding Python dependencies laspy, rasterio, and boto3, and a top layer holding the entrypoint script. To the right, a host machine mounts a tiles directory and an output directory into the running container via docker run minus v.</desc>
  <rect x="0" y="0" width="760" height="300" fill="var(--dg-bg)" rx="10"/>
  <defs>
    <marker id="dk-arr" markerWidth="8" markerHeight="8" refX="7" refY="3" orient="auto">
      <path d="M0,0 L0,6 L8,3 z" fill="currentColor" opacity="0.6"/>
    </marker>
  </defs>
  <!-- image stack -->
  <text x="185" y="24" text-anchor="middle" font-size="12" fill="currentColor" font-weight="600">Container image (pinned)</text>
  <rect x="40" y="200" width="290" height="60" rx="6" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.75"/>
  <text x="185" y="224" text-anchor="middle" font-size="11" fill="currentColor" font-family="monospace">ghcr.io/pdal/pdal:2.6</text>
  <text x="185" y="245" text-anchor="middle" font-size="10" fill="currentColor" opacity="0.65">PDAL · GDAL · PROJ · grids</text>
  <rect x="40" y="130" width="290" height="58" rx="6" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.75"/>
  <text x="185" y="154" text-anchor="middle" font-size="11" fill="currentColor" font-family="monospace">pip: laspy · rasterio · boto3</text>
  <text x="185" y="174" text-anchor="middle" font-size="10" fill="currentColor" opacity="0.65">Python dependency layer</text>
  <rect x="40" y="60" width="290" height="58" rx="6" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.75"/>
  <text x="185" y="84" text-anchor="middle" font-size="11" fill="currentColor" font-family="monospace">COPY entrypoint.py</text>
  <text x="185" y="104" text-anchor="middle" font-size="10" fill="currentColor" opacity="0.65">non-root user · WORKDIR /work</text>
  <!-- host -->
  <text x="600" y="24" text-anchor="middle" font-size="12" fill="currentColor" font-weight="600">Host filesystem</text>
  <rect x="470" y="60" width="250" height="58" rx="6" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.7"/>
  <text x="595" y="84" text-anchor="middle" font-size="11" fill="currentColor" font-family="monospace">/data/tiles  (read)</text>
  <text x="595" y="104" text-anchor="middle" font-size="10" fill="currentColor" opacity="0.6">input LAZ tiles</text>
  <rect x="470" y="200" width="250" height="60" rx="6" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.7"/>
  <text x="595" y="225" text-anchor="middle" font-size="11" fill="currentColor" font-family="monospace">/data/out  (write)</text>
  <text x="595" y="246" text-anchor="middle" font-size="10" fill="currentColor" opacity="0.6">DTM GeoTIFF · clean LAZ</text>
  <!-- mount arrows -->
  <line x1="468" y1="89" x2="332" y2="89" stroke="currentColor" stroke-width="1.3" opacity="0.6" marker-end="url(#dk-arr)" stroke-dasharray="5 3"/>
  <line x1="332" y1="230" x2="468" y2="230" stroke="currentColor" stroke-width="1.3" opacity="0.6" marker-end="url(#dk-arr)" stroke-dasharray="5 3"/>
  <text x="400" y="146" text-anchor="middle" font-size="10" fill="currentColor" opacity="0.75">-v bind mount</text>
  <text x="400" y="160" text-anchor="middle" font-size="10" fill="currentColor" opacity="0.75">crosses the</text>
  <text x="400" y="174" text-anchor="middle" font-size="10" fill="currentColor" opacity="0.75">boundary</text>
</svg>

## Prerequisites

Have these in place before building a PDAL image:

- **Docker Engine 24 or later** (or a compatible runtime such as Podman) with permission to run `docker build` and `docker run`.
- **A pinned target PDAL version** — this guide uses `ghcr.io/pdal/pdal:2.6`, which bundles PDAL 2.6, GDAL 3.8, and PROJ 9.
- **A pipeline JSON file** you already run locally — see [PDAL Pipeline Architecture & Execution](https://www.pythonlidar.com/pdal-pipeline-architecture-execution/) for the execution model and [PDAL Stage Chaining](https://www.pythonlidar.com/pdal-pipeline-architecture-execution/pdal-stage-chaining/) for how reader, filter, and writer stages connect.
- **Test LiDAR tiles** in LAZ or LAS, staged in a host directory you can bind mount.
- **Basic familiarity with bind mounts and image tags** — you do not need Kubernetes or a registry account to follow along, though pushing the finished image to a registry is a natural next step.

## Core Workflow Architecture

Containerising PDAL follows a predictable lifecycle. Each stage exists to remove one class of "works on my machine" failure:

1. **Pin the base image.** Start from `ghcr.io/pdal/pdal:2.6` rather than `:latest`. The tag freezes PDAL, GDAL, PROJ, and — critically — the PROJ datum grids that govern reprojection accuracy. For maximum determinism, resolve the tag to a digest (`ghcr.io/pdal/pdal:2.6@sha256:...`) so even a re-tag upstream cannot change your build.
2. **Layer Python dependencies.** The base image ships the `python-pdal` bindings, but analytics code usually also needs `laspy` for header work, `rasterio` for raster post-processing, and `boto3` for object storage. Install these from a pinned `requirements.txt` in a dedicated layer.
3. **Add a non-root user.** Create a fixed uid/gid inside the image so processes do not run as root. This is what keeps output tiles owned by your host account instead of root.
4. **Copy the entrypoint.** Bake in a small Python driver or shell wrapper that locates the pipeline JSON, sets the working directory, and invokes PDAL.
5. **Bind mount data at run time.** Data never goes into the image. Mount the host tile directory and an output directory with `-v` when you `docker run`, and reference the container-side paths inside the pipeline JSON.
6. **Execute and collect.** Run `pdal pipeline` directly or hand control to the Python entrypoint, then read results back from the mounted output directory on the host.

Keeping the image immutable and the data external is the central discipline: the same image tag processes any tile set, and any tile set can be reprocessed by any archived image tag. That separation is what makes downstream [AWS Batch Processing](https://www.pythonlidar.com/batch-automation-cloud-integration/aws-batch-processing/) and [S3 Cloud Storage I/O](https://www.pythonlidar.com/batch-automation-cloud-integration/s3-cloud-storage-io/) tractable — both simply run this same image with different mounts and credentials.

### Choosing and pinning the official image

The PDAL project publishes images to the GitHub Container Registry at `ghcr.io/pdal/pdal`. Tags follow the PDAL release line — `ghcr.io/pdal/pdal:2.6` tracks the 2.6 series, while dated and SHA-suffixed tags identify individual builds. Three pinning strategies trade convenience for determinism:

- **Minor tag (`:2.6`)** — receives patch rebuilds within the 2.6 line. Convenient, and adequate when you only need PDAL-2.6-level behaviour, but a patch rebuild can still shift GDAL or PROJ.
- **Exact build tag** — a specific published build such as a dated tag. Stable until you deliberately move it.
- **Digest pin (`:2.6@sha256:...`)** — the strongest guarantee. A digest addresses one exact image manifest, so a re-tag or rebuild upstream cannot change what you pull. Record the digest in your Dockerfile and your run scripts for anything survey-grade or audited.

Resolve a tag to its digest once with `docker buildx imagetools inspect ghcr.io/pdal/pdal:2.6`, then paste the digest into your `FROM` line. Archiving that digest alongside the pipeline JSON means a result produced today can be regenerated bit-for-bit years later, which is the whole point of containerising the workflow.

## Full Implementation

### The Dockerfile

This multi-stage Dockerfile starts from the pinned PDAL image, installs a small set of Python dependencies, creates a non-root user, and copies in an entrypoint. The multi-stage split keeps pip's build caches out of the final image.

```dockerfile
# syntax=docker/dockerfile:1
# ---- build stage: resolve Python deps with caches that never ship ----
FROM ghcr.io/pdal/pdal:2.6 AS build

# Install into a prefix we can copy wholesale into the runtime stage.
COPY requirements.txt /tmp/requirements.txt
RUN --mount=type=cache,target=/root/.cache/pip \
    pip install --prefix=/install --no-warn-script-location \
        -r /tmp/requirements.txt

# ---- runtime stage: pinned base + deps + entrypoint, nothing else ----
FROM ghcr.io/pdal/pdal:2.6

# Copy only the resolved site-packages, not the pip cache.
COPY --from=build /install /opt/conda

# Non-root user so bind-mounted output is owned by the host caller.
ARG UID=1000
ARG GID=1000
RUN groupadd -g ${GID} lidar \
 && useradd  -m -u ${UID} -g ${GID} -s /bin/bash lidar

WORKDIR /work
COPY --chown=lidar:lidar entrypoint.py /work/entrypoint.py

USER lidar
ENTRYPOINT ["python", "/work/entrypoint.py"]
```

The paired `requirements.txt` pins every Python dependency so the layer is reproducible:

```text
laspy==2.5.4
rasterio==1.3.10
boto3==1.34.144
```

### The Python entrypoint

The entrypoint is a thin, typed driver. It accepts a pipeline JSON path, validates before executing, streams the point count, and exits with a non-zero code on failure so an orchestrator can detect it.

```python
#!/usr/bin/env python3
"""entrypoint.py — run a PDAL pipeline JSON inside the container.

All paths are container paths (e.g. /data/tiles/tile_042.laz), which map to
host directories through the docker run -v bind mounts.
"""
from __future__ import annotations

import argparse
import json
import logging
import sys
from pathlib import Path

import pdal

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
log = logging.getLogger("pdal-runner")


def run_pipeline(pipeline_path: Path) -> int:
    """Validate and execute a pipeline JSON file; return the point count."""
    if not pipeline_path.is_file():
        raise FileNotFoundError(f"Pipeline JSON not found: {pipeline_path}")

    spec = pipeline_path.read_text(encoding="utf-8")
    pipeline = pdal.Pipeline(spec)

    pipeline.validate()  # raises RuntimeError on schema / CRS problems
    count = pipeline.execute()

    log.info("Processed %d points via %s", count, pipeline_path.name)
    if count == 0:
        raise RuntimeError("Pipeline executed but wrote 0 points — check filters and paths.")
    return count


def main() -> int:
    parser = argparse.ArgumentParser(description="Run a PDAL pipeline in a container.")
    parser.add_argument("pipeline", type=Path, help="Path to pipeline JSON (container path).")
    args = parser.parse_args()

    try:
        run_pipeline(args.pipeline)
    except (FileNotFoundError, RuntimeError, json.JSONDecodeError) as exc:
        log.error("Pipeline failed: %s", exc)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
```

### Building and running

Build the image once, tag it descriptively, then run it against mounted data:

```bash
# Build with the host caller's uid/gid so outputs are owned correctly.
docker build \
  --build-arg UID=$(id -u) \
  --build-arg GID=$(id -g) \
  -t pythonlidar/pdal:2.6-app .

# Run a pipeline: mount tiles read-only, mount an output dir read-write.
docker run --rm \
  -v "$PWD/data/tiles":/data/tiles:ro \
  -v "$PWD/data/out":/data/out \
  -v "$PWD/pipelines":/pipelines:ro \
  pythonlidar/pdal:2.6-app /pipelines/dtm.json
```

A representative `pipelines/dtm.json` referencing container paths:

```json
{
  "pipeline": [
    {
      "type": "readers.las",
      "filename": "/data/tiles/tile_0042.laz"
    },
    {
      "type": "filters.smrf",
      "slope": 0.2,
      "window": 16.0,
      "threshold": 0.45
    },
    {
      "type": "filters.range",
      "limits": "Classification[2:2]"
    },
    {
      "type": "writers.gdal",
      "filename": "/data/out/tile_0042_dtm.tif",
      "resolution": 1.0,
      "output_type": "idw",
      "gdaldriver": "GTiff"
    }
  ]
}
```

<svg viewBox="0 0 720 312" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Which Docker layers survive a rebuild after editing the entrypoint" style="width:100%;max-width:720px;display:block;margin:1.6rem auto">
  <title>Layer order decides how long a rebuild takes</title>
  <desc>Six layers of a PDAL image after a one-line edit to the entrypoint. The base image, the apt install, the requirements copy and the pip install are all reused from cache. The entrypoint copy is invalidated, and so is everything below it. Putting the dependency install above the source copy is what keeps a rebuild at three seconds instead of ninety.</desc>
  <rect x="0" y="0" width="720" height="312" fill="var(--dg-bg)" rx="10"/>
  <rect x="20" y="48" width="340" height="30" rx="5" fill="var(--dg-surface)" stroke="var(--dg-line-soft)" stroke-width="1"/>
  <text x="34" y="68" font-size="11" fill="var(--dg-text)">FROM ghcr.io/pdal/pdal:2.6</text>
  <rect x="380" y="48" width="310" height="30" rx="5" fill="var(--dg-d-soft)" stroke="var(--dg-d)" stroke-width="1.1"/>
  <text x="535" y="68" text-anchor="middle" font-size="11" fill="var(--dg-text)">cached — pinned by digest</text>
  <rect x="20" y="86" width="340" height="30" rx="5" fill="var(--dg-surface)" stroke="var(--dg-line-soft)" stroke-width="1"/>
  <text x="34" y="106" font-size="11" fill="var(--dg-text)">RUN apt-get install …</text>
  <rect x="380" y="86" width="310" height="30" rx="5" fill="var(--dg-d-soft)" stroke="var(--dg-d)" stroke-width="1.1"/>
  <text x="535" y="106" text-anchor="middle" font-size="11" fill="var(--dg-text)">cached — unchanged</text>
  <rect x="20" y="124" width="340" height="30" rx="5" fill="var(--dg-surface)" stroke="var(--dg-line-soft)" stroke-width="1"/>
  <text x="34" y="144" font-size="11" fill="var(--dg-text)">COPY requirements.txt</text>
  <rect x="380" y="124" width="310" height="30" rx="5" fill="var(--dg-d-soft)" stroke="var(--dg-d)" stroke-width="1.1"/>
  <text x="535" y="144" text-anchor="middle" font-size="11" fill="var(--dg-text)">cached — file unchanged</text>
  <rect x="20" y="162" width="340" height="30" rx="5" fill="var(--dg-surface)" stroke="var(--dg-line-soft)" stroke-width="1"/>
  <text x="34" y="182" font-size="11" fill="var(--dg-text)">RUN pip install -r requirements.txt</text>
  <rect x="380" y="162" width="310" height="30" rx="5" fill="var(--dg-d-soft)" stroke="var(--dg-d)" stroke-width="1.1"/>
  <text x="535" y="182" text-anchor="middle" font-size="11" fill="var(--dg-text)">cached — 90 s saved</text>
  <rect x="20" y="200" width="340" height="30" rx="5" fill="var(--dg-surface)" stroke="var(--dg-line-soft)" stroke-width="1"/>
  <text x="34" y="220" font-size="11" fill="var(--dg-text)">COPY entrypoint.py</text>
  <rect x="380" y="200" width="310" height="30" rx="5" fill="var(--dg-e-soft)" stroke="var(--dg-e)" stroke-width="1.1"/>
  <text x="535" y="220" text-anchor="middle" font-size="11" fill="var(--dg-text)">invalidated — you edited it</text>
  <rect x="20" y="238" width="340" height="30" rx="5" fill="var(--dg-surface)" stroke="var(--dg-line-soft)" stroke-width="1"/>
  <text x="34" y="258" font-size="11" fill="var(--dg-text)">everything after it</text>
  <rect x="380" y="238" width="310" height="30" rx="5" fill="var(--dg-e-soft)" stroke="var(--dg-e)" stroke-width="1.1"/>
  <text x="535" y="258" text-anchor="middle" font-size="11" fill="var(--dg-text)">rebuilt, whether it changed or not</text>
  <text x="20" y="36" font-size="10.5" fill="var(--dg-muted)">after editing one line of entrypoint.py</text>
  <text x="20" y="296" font-size="10.5" fill="var(--dg-muted)">the rule is invariant: order the Dockerfile from least to most frequently changed</text>
</svg>

## Code Breakdown

**The pinned base line (`FROM ghcr.io/pdal/pdal:2.6`).** This single line is the reproducibility anchor. It fixes not just PDAL but the whole native geospatial stack and the PROJ grids that datum transforms depend on. Because both build and runtime stages reference the identical tag, they share layers and the base is only pulled once.

**The build stage and `--mount=type=cache`.** Pip's wheel cache is expensive to rebuild but must not bloat the shipped image. Installing into `/install` in a throwaway stage and copying only that prefix forward keeps the runtime layer lean while still benefiting from a warm cache on rebuilds.

**The non-root user.** `useradd -u ${UID}` bakes a fixed uid into the image, and `--build-arg UID=$(id -u)` aligns it to the host caller. Combined with `USER lidar`, every file the container writes to `/data/out` lands on the host owned by you, not root — the single most common Docker friction point for data teams.

**`validate()` before `execute()`.** The entrypoint calls `pipeline.validate()` first, which parses the stage graph and checks dimensions and CRS without doing I/O. This surfaces bad container paths or schema errors instantly; see [Pipeline Validation](https://www.pythonlidar.com/pdal-pipeline-architecture-execution/pipeline-validation/) for the full check set. The non-zero exit on failure lets Docker, CI, or a scheduler treat a failed tile as a failed job.

**Read-only input mounts.** Mounting tiles with `:ro` guarantees the container cannot mutate source data — a cheap safety net when the same directory feeds many parallel jobs.

## Parameter Reference Table

| Concern | Flag / setting | Example | Effect |
|---|---|---|---|
| Pin the stack | image tag/digest | `ghcr.io/pdal/pdal:2.6` | Freezes PDAL, GDAL, PROJ, and grids |
| Mount input | `-v host:container:ro` | `-v "$PWD/data/tiles":/data/tiles:ro` | Read-only source tiles |
| Mount output | `-v host:container` | `-v "$PWD/data/out":/data/out` | Writable results directory |
| File ownership | `--user` | `--user $(id -u):$(id -g)` | Output owned by host caller |
| Auto-cleanup | `--rm` | `docker run --rm ...` | Removes the container on exit |
| PROJ grids | env `PROJ_NETWORK` | `-e PROJ_NETWORK=ON` | Fetch missing datum grids on demand |
| GDAL cache | env `GDAL_CACHEMAX` | `-e GDAL_CACHEMAX=512` | Raster block cache in MB |
| Thread count | env `OMP_NUM_THREADS` | `-e OMP_NUM_THREADS=4` | Cap PDAL/GDAL parallel threads |
| Working dir | `WORKDIR` / `-w` | `-w /work` | Base for relative container paths |
| Memory limit | `--memory` | `--memory=4g` | Hard cap to prevent OOM on the host |

## Validation and Integrity Checks

Confirm the image carries the versions you intended before trusting any output. The fastest check is the PDAL version banner:

```bash
docker run --rm pythonlidar/pdal:2.6-app --help >/dev/null 2>&1; \
docker run --rm --entrypoint pdal pythonlidar/pdal:2.6-app --version
```

That prints something like `pdal 2.6.0 (git-version: ...)`. Verify the native dependency versions in the same image, since reprojection accuracy hinges on them:

```bash
docker run --rm --entrypoint bash pythonlidar/pdal:2.6-app -c \
  "pdal --version && gdalinfo --version && projinfo EPSG:32618 | head -1"
```

Confirm the Python layer imports cleanly — a broken binding surfaces here rather than mid-pipeline:

```bash
docker run --rm --entrypoint python pythonlidar/pdal:2.6-app -c \
  "import pdal, laspy, rasterio, boto3; print('imports OK', pdal.__version__)"
```

After a real run, check the output on the host: the GeoTIFF should exist, be owned by your user (not root), and open cleanly. A quick `gdalinfo data/out/tile_0042_dtm.tif` on the host confirms the raster has a valid CRS and sensible extent, closing the loop from container to deliverable.

<svg viewBox="0 0 720 238" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Final image size for four build strategies" style="width:100%;max-width:720px;display:block;margin:1.6rem auto">
  <title>Four builds of the same toolchain</title>
  <desc>Final image sizes for the same PDAL toolchain. Installing a broad conda environment yields 3.1 gigabytes. Pip on the official base image gives 1.55. Cleaning the pip cache inside the same RUN instruction saves another 270 megabytes because the cache never becomes a layer. A multi-stage build that copies only the runtime gets to 940 megabytes.</desc>
  <rect x="0" y="0" width="720" height="238" fill="var(--dg-bg)" rx="10"/>
  <rect x="300" y="54" width="360" height="30" rx="4" fill="var(--dg-e-soft)" stroke="var(--dg-e)" stroke-width="1.2"/>
  <text x="290" y="74" text-anchor="end" font-size="11" fill="var(--dg-text)">conda env from environment.yml</text>
  <text x="668" y="74" font-size="10.5" fill="var(--dg-muted)">3.10 GB</text>
  <rect x="300" y="96" width="180" height="30" rx="4" fill="var(--dg-c-soft)" stroke="var(--dg-c)" stroke-width="1.2"/>
  <text x="290" y="116" text-anchor="end" font-size="11" fill="var(--dg-text)">pip on the official base</text>
  <text x="488" y="116" font-size="10.5" fill="var(--dg-muted)">1.55 GB</text>
  <rect x="300" y="138" width="148" height="30" rx="4" fill="var(--dg-d-soft)" stroke="var(--dg-d)" stroke-width="1.2"/>
  <text x="290" y="158" text-anchor="end" font-size="11" fill="var(--dg-text)">pip + cache cleaned in one RUN</text>
  <text x="456" y="158" font-size="10.5" fill="var(--dg-muted)">1.28 GB</text>
  <rect x="300" y="180" width="109" height="30" rx="4" fill="var(--dg-d-soft)" stroke="var(--dg-d)" stroke-width="1.2"/>
  <text x="290" y="200" text-anchor="end" font-size="11" fill="var(--dg-text)">multi-stage, runtime only</text>
  <text x="417" y="200" font-size="10.5" fill="var(--dg-muted)">0.94 GB</text>
  <text x="300" y="40" font-size="10.5" fill="var(--dg-muted)">compressed image size, same PDAL 2.6 toolchain</text>
  <text x="60" y="230" font-size="10.5" fill="var(--dg-muted)">image size is pulled once per worker per scale-out event — on a 400-instance fan-out, 2 GB of difference is 800 GB of transfer</text>
</svg>

## Performance Tuning

**Order Dockerfile layers by volatility.** Docker caches layers top-down and invalidates everything below the first change. Copy `requirements.txt` and install dependencies *before* copying your frequently edited `entrypoint.py`. Editing the entrypoint then rebuilds only the final tiny layer instead of reinstalling every Python package — turning a two-minute rebuild into a two-second one.

**Use multi-stage builds to shed weight.** The build stage above keeps pip caches and any transient tooling out of the runtime image. A single-stage build that runs `pip install` directly commonly ships 600–900 MB of cache; the multi-stage variant lands the runtime image around 1.3 GB, dominated by the unavoidable GDAL/PROJ payload.

**Pin a slim requirements file, not a broad environment.** Installing only the three packages the entrypoint imports avoids dragging in SciPy, Matplotlib, and JupyterLab that a catch-all `environment.yml` would pull. Fewer packages mean smaller images, faster cold pulls on cloud workers, and a smaller attack surface.

**Match `OMP_NUM_THREADS` to the container's CPU quota.** PDAL filters such as `filters.smrf` parallelise across threads. When you cap the container with `--cpus=4`, set `-e OMP_NUM_THREADS=4` so the thread pool matches the quota; otherwise the runtime spawns a thread per host core and thrashes. The [Parallel Execution](https://www.pythonlidar.com/pdal-pipeline-architecture-execution/parallel-execution/) guide covers how PDAL distributes work across cores, and [Memory Management](https://www.pythonlidar.com/pdal-pipeline-architecture-execution/memory-management/) explains chunk sizing for large tiles inside constrained containers.

**Cache the base pull in CI.** In continuous integration, pull `ghcr.io/pdal/pdal:2.6` once and reuse it across jobs. The base is the largest layer; re-pulling it per job dominates pipeline wall time.

## Common Errors and Troubleshooting

**`PROJ: proj_create_operations: Cannot find proj.db` or metre-scale coordinate errors**
Root cause: a reprojection needs a datum grid that is not bundled in the image, so PROJ silently falls back to an approximate transform. Fix: enable on-demand grid download with `-e PROJ_NETWORK=ON`, or bake the grids in by adding them to `$PROJ_DATA` in the Dockerfile. Verify with `docker run --rm --entrypoint projinfo pythonlidar/pdal:2.6-app -s EPSG:32618 -t EPSG:4326 --summary`.

**`ERROR 4: ... not recognized as a supported file format` from writers.gdal**
Root cause: the requested `gdaldriver` is not compiled into the image's GDAL build, or the driver name is misspelled. Fix: list available drivers with `docker run --rm --entrypoint gdalinfo pythonlidar/pdal:2.6-app --formats | grep -i gtiff` and use an exact driver short name such as `GTiff` or `COG`.

**Output files owned by `root`, uneditable on the host**
Root cause: the container ran as uid 0 and wrote to the bind mount as root. Fix: run with `--user $(id -u):$(id -g)`, or rebuild with the `UID`/`GID` build args shown above so the baked-in user matches your host account. Existing root-owned files can be reclaimed with `sudo chown -R $(id -u):$(id -g) data/out`.

**`RuntimeError: Unable to open ... for reading` for a file that exists on the host**
Root cause: the pipeline JSON references a host path that does not exist inside the container, because the bind mount changed the path. Fix: always reference the container-side path (`/data/tiles/...`) in the JSON, and confirm the mount with `docker run --rm -v "$PWD/data/tiles":/data/tiles:ro pythonlidar/pdal:2.6-app --entrypoint ls /data/tiles`.

**`Killed` mid-run with no traceback**
Root cause: the container exceeded its memory limit and the kernel OOM-killer terminated it. Fix: raise `--memory`, lower the reader `chunk_size` so fewer points are resident at once, or split the tile. See [Memory Management](https://www.pythonlidar.com/pdal-pipeline-architecture-execution/memory-management/) for chunk-size strategy in constrained environments.

## Frequently Asked Questions

**Why pin the PDAL Docker image to a specific tag instead of latest?**

The `latest` tag moves whenever a new image is published, which silently changes the bundled PDAL, GDAL, and PROJ versions. A pipeline that classified ground correctly last month can drift after an upstream rebuild. Pinning to `ghcr.io/pdal/pdal:2.6` — or better, to an image digest — freezes the entire native stack so results stay byte-for-byte reproducible across machines and CI runs.

**Does the official PDAL image include the Python bindings?**

The `ghcr.io/pdal/pdal` images are built on a conda-forge base that includes the `python-pdal` bindings and a working Python interpreter, so you can `import pdal` inside the container immediately. You still need to add `laspy`, `rasterio`, or `boto3` yourself with a custom Dockerfile if your entrypoint uses them.

**Why do files created inside the container belong to root on the host?**

By default a container process runs as uid 0, so any file it writes to a bind mount is owned by root on the host. Run the container with `--user $(id -u):$(id -g)`, or bake a non-root user into the image with a fixed uid/gid, so output LAZ tiles and GeoTIFFs are owned by your host account and remain editable.

**How do I keep the PDAL image small?**

Use a multi-stage build so compilers and build caches never reach the final layer, install only the Python packages you actually import, and clean caches in the same `RUN` instruction that installs them. Pinning a slim requirements file rather than a broad `environment.yml` keeps the runtime image in the 1.2–1.6 GB range instead of 3 GB+.

**Can the same image run both `pdal pipeline` and a Python script?**

Yes. The image ships the `pdal` CLI and a full Python interpreter. Override the entrypoint with `--entrypoint pdal` to run the CLI directly, or use the default Python entrypoint to drive pipelines programmatically — the same container serves batch CLI jobs and richer Python orchestration.

---

## Related

- [Batch Automation and Cloud Integration for PDAL](https://www.pythonlidar.com/batch-automation-cloud-integration/) — parent overview of scaling PDAL beyond a single workstation
- [Running PDAL Pipelines in Docker](https://www.pythonlidar.com/batch-automation-cloud-integration/pdal-docker-containers/running-pdal-pipelines-in-docker/) — a focused, step-by-step walkthrough of mounting data and executing one pipeline
- [AWS Batch Processing](https://www.pythonlidar.com/batch-automation-cloud-integration/aws-batch-processing/) — run this image as a job definition to fan tiles across a compute fleet
- [S3 Cloud Storage I/O](https://www.pythonlidar.com/batch-automation-cloud-integration/s3-cloud-storage-io/) — read and write LAZ and COG directly from object storage inside the container
- [PDAL Pipeline Architecture & Execution](https://www.pythonlidar.com/pdal-pipeline-architecture-execution/) — the reader/filter/writer execution model the container runs
- [Pipeline Validation](https://www.pythonlidar.com/pdal-pipeline-architecture-execution/pipeline-validation/) — catch schema, dimension, and CRS errors before a container job spends I/O
