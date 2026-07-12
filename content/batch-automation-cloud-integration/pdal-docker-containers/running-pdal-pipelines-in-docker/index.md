---
title: "Running PDAL Pipelines in Docker"
description: "A step-by-step guide to executing a PDAL pipeline inside a Docker container — mounting a data directory, passing pipeline JSON, and reading results back on the host."
slug: "running-pdal-pipelines-in-docker"
type: "long_tail"
breadcrumb: "Running PDAL Pipelines in Docker"
datePublished: "2024-07-08"
dateModified: "2026-07-12"
---

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Article",
      "headline": "Running PDAL Pipelines in Docker",
      "description": "A step-by-step guide to executing a PDAL pipeline inside a Docker container — mounting a data directory, passing pipeline JSON, and reading results back on the host.",
      "datePublished": "2024-07-08",
      "dateModified": "2026-07-12",
      "author": {"@type": "Organization", "name": "pythonlidar.com"}
    },
    {
      "@type": "BreadcrumbList",
      "itemListElement": [
        {"@type": "ListItem", "position": 1, "name": "Home", "item": "https://pythonlidar.com/"},
        {"@type": "ListItem", "position": 2, "name": "Batch Automation and Cloud Integration for PDAL", "item": "https://pythonlidar.com/batch-automation-cloud-integration/"},
        {"@type": "ListItem", "position": 3, "name": "PDAL Docker Containers", "item": "https://pythonlidar.com/batch-automation-cloud-integration/pdal-docker-containers/"},
        {"@type": "ListItem", "position": 4, "name": "Running PDAL Pipelines in Docker", "item": "https://pythonlidar.com/batch-automation-cloud-integration/pdal-docker-containers/running-pdal-pipelines-in-docker/"}
      ]
    },
    {
      "@type": "HowTo",
      "name": "Run a PDAL pipeline inside a Docker container",
      "description": "Pull the pinned PDAL image, prepare a pipeline JSON that uses container paths, run the container with a bind-mounted data directory, and verify the output on the host.",
      "step": [
        {"@type": "HowToStep", "position": 1, "name": "Pull the pinned image", "text": "Run docker pull ghcr.io/pdal/pdal:2.6 to fetch the exact PDAL, GDAL, and PROJ build."},
        {"@type": "HowToStep", "position": 2, "name": "Prepare pipeline.json", "text": "Write a pipeline whose reader and writer filenames use container paths under /data."},
        {"@type": "HowToStep", "position": 3, "name": "Run with a bind mount", "text": "Invoke docker run with -v to mount the host data directory and call pdal pipeline on the JSON."},
        {"@type": "HowToStep", "position": 4, "name": "Verify the output", "text": "Check the written file on the host with pdal info or gdalinfo and confirm ownership and CRS."}
      ]
    },
    {
      "@type": "FAQPage",
      "mainEntity": [
        {
          "@type": "Question",
          "name": "Do pipeline JSON paths refer to the host or the container?",
          "acceptedAnswer": {"@type": "Answer", "text": "They refer to paths inside the container. A bind mount maps a host directory such as ./data to a container path such as /data, and the reader and writer filenames in the pipeline JSON must use the container path (/data/input.laz), not the host path."}
        },
        {
          "@type": "Question",
          "name": "Why does docker run report permission denied on my mounted data under SELinux?",
          "acceptedAnswer": {"@type": "Answer", "text": "On SELinux-enforcing hosts such as Fedora or RHEL, the container cannot access bind-mounted files until they are relabelled. Append the :z or :Z suffix to the volume flag, for example -v \"$PWD/data\":/data:z, so Docker applies the correct SELinux context."}
        },
        {
          "@type": "Question",
          "name": "Can I run a PDAL pipeline in Docker from Python?",
          "acceptedAnswer": {"@type": "Answer", "text": "Yes. You can shell out to the container with subprocess.run(['docker','run',...]) or use the docker Python SDK's containers.run(). Both approaches let a host-side Python script build the command, launch the container, and check the exit code and output."}
        },
        {
          "@type": "Question",
          "name": "How do I stop container output files from being owned by root?",
          "acceptedAnswer": {"@type": "Answer", "text": "Add --user $(id -u):$(id -g) to docker run so the process runs as your host user id. Files written to the mounted output directory are then owned by you and remain editable without sudo."}
        }
      ]
    }
  ]
}
</script>

**TL;DR:** Pull `ghcr.io/pdal/pdal:2.6`, write a `pipeline.json` whose filenames point at container paths under `/data`, then run `docker run --rm -v "$PWD/data":/data ghcr.io/pdal/pdal:2.6 pdal pipeline /data/pipeline.json` — the bind mount carries input in and results back out to the host.

## Context and Motivation

This guide is part of [PDAL Docker Containers for Reproducible Pipelines](/batch-automation-cloud-integration/pdal-docker-containers/), which covers building and pinning images; here the focus is narrower — the exact mechanics of getting one pipeline to execute against real files and returning the output to your host without surprises.

The idea is simple, but three details trip up almost everyone the first time: a container has its own filesystem, so the paths in your pipeline JSON are not host paths; a container writes files as its own user, so results can land owned by root; and hardened hosts refuse the mount entirely until it is relabelled. Getting these right once turns "run PDAL in Docker" into a reliable one-liner you can drop into scripts and schedulers. Because the container carries a fixed PDAL, GDAL, and PROJ build, the run is also reproducible — the same `pdal pipeline` invocation produces the same DTM whether it runs on your laptop or a cloud worker, which is exactly what the broader [batch and cloud automation](/batch-automation-cloud-integration/) work depends on.

<svg viewBox="0 0 720 250" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Sequence of running a PDAL pipeline in a Docker container with a bind mount" style="width:100%;max-width:720px;display:block;margin:1.5rem auto">
  <title>Host to container pipeline execution sequence</title>
  <desc>Left column is the host with a data directory holding input.laz and pipeline.json. A docker run arrow crosses into the container in the right column, where pdal pipeline reads the input and writes dtm.tif. A return arrow shows the output file appearing back in the host data directory through the shared bind mount.</desc>
  <defs>
    <marker id="rp-arr" markerWidth="8" markerHeight="8" refX="7" refY="3" orient="auto">
      <path d="M0,0 L0,6 L8,3 z" fill="currentColor" opacity="0.6"/>
    </marker>
  </defs>
  <text x="150" y="26" text-anchor="middle" font-size="12" fill="currentColor" font-weight="600">Host: ./data</text>
  <rect x="30" y="45" width="240" height="150" rx="8" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.75"/>
  <text x="150" y="78" text-anchor="middle" font-size="11" fill="currentColor" font-family="monospace">input.laz</text>
  <text x="150" y="104" text-anchor="middle" font-size="11" fill="currentColor" font-family="monospace">pipeline.json</text>
  <text x="150" y="150" text-anchor="middle" font-size="11" fill="currentColor" font-family="monospace" opacity="0.55">dtm.tif</text>
  <text x="150" y="170" text-anchor="middle" font-size="10" fill="currentColor" opacity="0.5">(appears after run)</text>
  <text x="570" y="26" text-anchor="middle" font-size="12" fill="currentColor" font-weight="600">Container: /data</text>
  <rect x="450" y="45" width="240" height="150" rx="8" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.75"/>
  <text x="570" y="98" text-anchor="middle" font-size="11" fill="currentColor" font-family="monospace">pdal pipeline</text>
  <text x="570" y="118" text-anchor="middle" font-size="11" fill="currentColor" font-family="monospace">/data/pipeline.json</text>
  <text x="570" y="150" text-anchor="middle" font-size="10" fill="currentColor" opacity="0.6">reads /data/input.laz</text>
  <text x="570" y="168" text-anchor="middle" font-size="10" fill="currentColor" opacity="0.6">writes /data/dtm.tif</text>
  <line x1="272" y1="90" x2="448" y2="90" stroke="currentColor" stroke-width="1.4" opacity="0.6" marker-end="url(#rp-arr)"/>
  <text x="360" y="80" text-anchor="middle" font-size="10" fill="currentColor" opacity="0.6">docker run -v ./data:/data</text>
  <line x1="448" y1="150" x2="272" y2="150" stroke="currentColor" stroke-width="1.4" opacity="0.6" marker-end="url(#rp-arr)" stroke-dasharray="5 3"/>
  <text x="360" y="140" text-anchor="middle" font-size="10" fill="currentColor" opacity="0.6">output via shared mount</text>
</svg>

## Prerequisites and Assumptions

| Requirement | Detail |
|---|---|
| Docker Engine | 24+ with rights to `docker pull` and `docker run` |
| Image | `ghcr.io/pdal/pdal:2.6` (PDAL 2.6, GDAL 3.8, PROJ 9) |
| Host data directory | `./data` containing at least one LAZ/LAS tile |
| Pipeline JSON | A valid pipeline — see [PDAL Stage Chaining](/pdal-pipeline-architecture-execution/pdal-stage-chaining/) |
| Optional (Python driver) | `docker` SDK: `pip install docker` |

This walkthrough assumes a project layout of `./data/input.laz` and `./data/pipeline.json` on the host. Everything the container needs lives under `./data`, mounted at `/data` inside the container.

## Step-by-Step Implementation

### Step 1 — Pull the pinned image

Fetch the exact image once. Pinning to `:2.6` rather than `:latest` means the PROJ datum grids and GDAL drivers stay fixed, so reprojection and raster writes behave identically on every machine.

```bash
docker pull ghcr.io/pdal/pdal:2.6
docker run --rm --entrypoint pdal ghcr.io/pdal/pdal:2.6 --version
```

The second command should print `pdal 2.6.0 (...)`, confirming the CLI is reachable in the image.

### Step 2 — Prepare pipeline.json with container paths

Write the pipeline so every `filename` uses the container-side path under `/data`. This is the detail that most often causes a "file not found" error on an otherwise valid pipeline.

```json
{
  "pipeline": [
    {
      "type": "readers.las",
      "filename": "/data/input.laz"
    },
    {
      "type": "filters.smrf",
      "slope": 0.18,
      "window": 14.0,
      "threshold": 0.5
    },
    {
      "type": "filters.range",
      "limits": "Classification[2:2]"
    },
    {
      "type": "writers.gdal",
      "filename": "/data/dtm.tif",
      "resolution": 1.0,
      "output_type": "idw"
    }
  ]
}
```

Save this as `./data/pipeline.json` on the host. It classifies ground with `filters.smrf`, keeps only ground points, and writes a 1 m DTM GeoTIFF.

### Step 3 — Run the container with a bind mount

Mount `./data` into the container at `/data` and hand the pipeline to the `pdal` CLI. The `--user` flag keeps the output owned by your host account.

```bash
docker run --rm \
  --user "$(id -u):$(id -g)" \
  -v "$PWD/data":/data \
  ghcr.io/pdal/pdal:2.6 \
  pdal pipeline /data/pipeline.json
```

On an SELinux-enforcing host (Fedora, RHEL, CentOS Stream), append `:z` to the mount so Docker relabels the directory: `-v "$PWD/data":/data:z`. Without it, PDAL reports permission denied even though the files exist.

### Step 4 — Verify the output on the host

Because `/data` is a shared bind mount, `dtm.tif` written inside the container is immediately present in `./data` on the host:

```bash
ls -l data/dtm.tif
docker run --rm --entrypoint gdalinfo \
  -v "$PWD/data":/data ghcr.io/pdal/pdal:2.6 /data/dtm.tif | head -20
```

Expect a raster with a valid CRS, a sensible extent, and ownership matching your host user.

## Complete Working Example

The script below drives the whole flow from host-side Python using `subprocess`. It builds the `docker run` command, executes it, checks the exit code, and confirms the output file appeared — a pattern that slots directly into a scheduler or a larger [orchestration DAG](/batch-automation-cloud-integration/airflow-dag-orchestration/).

```python
#!/usr/bin/env python3
"""run_pdal_docker.py — execute a PDAL pipeline in a container from the host.

Usage:
    python run_pdal_docker.py ./data pipeline.json dtm.tif

The data directory is bind-mounted at /data inside the container, so the
pipeline JSON must reference /data/... paths.
"""
from __future__ import annotations

import os
import subprocess
import sys
from pathlib import Path

IMAGE = "ghcr.io/pdal/pdal:2.6"


def run_pipeline_in_docker(data_dir: Path, pipeline_name: str, expected_output: str) -> None:
    """Run `pdal pipeline` in a container against a bind-mounted data directory."""
    data_dir = data_dir.resolve()
    if not (data_dir / pipeline_name).is_file():
        raise FileNotFoundError(f"Pipeline JSON not found: {data_dir / pipeline_name}")

    cmd = [
        "docker", "run", "--rm",
        "--user", f"{os.getuid()}:{os.getgid()}",
        # ":z" is harmless on non-SELinux hosts and required on SELinux ones.
        "-v", f"{data_dir}:/data:z",
        IMAGE,
        "pdal", "pipeline", f"/data/{pipeline_name}",
    ]

    print("Running:", " ".join(cmd))
    result = subprocess.run(cmd, capture_output=True, text=True)

    if result.returncode != 0:
        raise RuntimeError(
            f"Container exited {result.returncode}.\n"
            f"stdout:\n{result.stdout}\nstderr:\n{result.stderr}"
        )

    out_path = data_dir / expected_output
    if not out_path.is_file():
        raise RuntimeError(f"Pipeline ran but expected output is missing: {out_path}")

    print(f"OK: wrote {out_path} ({out_path.stat().st_size:,} bytes)")


def main() -> int:
    if len(sys.argv) != 4:
        print("Usage: python run_pdal_docker.py <data_dir> <pipeline.json> <output_file>")
        return 1

    try:
        run_pipeline_in_docker(Path(sys.argv[1]), sys.argv[2], sys.argv[3])
    except (FileNotFoundError, RuntimeError) as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
```

If you prefer the official Docker SDK over `subprocess`, the same run reduces to a single call:

```python
import docker

client = docker.from_env()
logs = client.containers.run(
    "ghcr.io/pdal/pdal:2.6",
    command=["pdal", "pipeline", "/data/pipeline.json"],
    volumes={str(Path("data").resolve()): {"bind": "/data", "mode": "rw"}},
    user=f"{os.getuid()}:{os.getgid()}",
    remove=True,
    stdout=True, stderr=True,
)
print(logs.decode())
```

## Key Parameter Table

| Flag / option | Example | Purpose |
|---|---|---|
| `--rm` | `docker run --rm` | Delete the container after it exits |
| `-v host:container` | `-v "$PWD/data":/data` | Bind mount the data directory |
| `:z` / `:Z` suffix | `-v "$PWD/data":/data:z` | Relabel for SELinux (`:z` shared, `:Z` private) |
| `--user` | `--user $(id -u):$(id -g)` | Run as host uid/gid so output is not root-owned |
| `--entrypoint` | `--entrypoint gdalinfo` | Override the image entrypoint for inspection |
| positional command | `pdal pipeline /data/pipeline.json` | Execute the pipeline inside the container |
| `-e` env var | `-e OMP_NUM_THREADS=4` | Cap threads for filters like `filters.smrf` |

## Verification

Confirm three things after any run: the process exited zero, the output file exists on the host, and its contents are valid. The exit code is checked by the script above; for a manual run, `echo $?` should print `0`. Validate the raster or point cloud itself with a second short container invocation:

```bash
# For a raster DTM
docker run --rm --entrypoint gdalinfo -v "$PWD/data":/data \
  ghcr.io/pdal/pdal:2.6 /data/dtm.tif | grep -i "Size is\|Coordinate System"

# For a LAS/LAZ output, count points and read the header CRS
docker run --rm --entrypoint pdal -v "$PWD/data":/data \
  ghcr.io/pdal/pdal:2.6 info --metadata /data/dtm.laz | grep -i "count\|srs"
```

Finally, on the host, `ls -l data/dtm.tif` should show your username in the owner column — proof the `--user` flag worked and no `sudo chown` cleanup is needed.

## Gotchas and Edge Cases

**1. Host paths in the pipeline JSON.** If `filename` reads `./data/input.laz` or an absolute host path like `/home/you/project/data/input.laz`, the container cannot find it — that path does not exist inside the container. Always use the container-side path (`/data/input.laz`). This is the single most common failure and it presents as `Unable to open ... for reading`.

**2. SELinux blocks the mount.** On Fedora, RHEL, and CentOS Stream, an un-suffixed `-v` mount yields `Permission denied` even for world-readable files because the container's SELinux context does not match. Add `:z` (shared) or `:Z` (private-to-this-container) to the volume flag. The suffix is inert on Ubuntu and macOS, so it is safe to include unconditionally in cross-platform scripts.

**3. Relative vs absolute mount sources.** Docker requires the host side of a bind mount to be an absolute path. `-v data:/data` is interpreted as a *named volume* called `data`, not your directory — quietly giving the container an empty volume. Always expand to an absolute path with `"$PWD/data"` in shell or `Path("data").resolve()` in Python.

**4. Root-owned output files.** Omitting `--user` lets the container write as uid 0, leaving `dtm.tif` owned by root and uneditable without `sudo`. Add `--user $(id -u):$(id -g)`. If files are already root-owned, reclaim them with `sudo chown -R $(id -u):$(id -g) data`. When a run depends on reprojection, also confirm PROJ grids are available, exactly as covered in [reprojecting point clouds from UTM to WGS84](/pdal-pipeline-architecture-execution/spatial-reprojection/reprojecting-point-clouds-from-utm-to-wgs84/).

## Frequently Asked Questions

**Do pipeline JSON paths refer to the host or the container?**

They refer to paths inside the container. A bind mount maps a host directory such as `./data` to a container path such as `/data`, and the reader and writer filenames in the pipeline JSON must use the container path (`/data/input.laz`), not the host path.

**Why does docker run report permission denied on my mounted data under SELinux?**

On SELinux-enforcing hosts such as Fedora or RHEL, the container cannot access bind-mounted files until they are relabelled. Append the `:z` or `:Z` suffix to the volume flag, for example `-v "$PWD/data":/data:z`, so Docker applies the correct SELinux context.

**Can I run a PDAL pipeline in Docker from Python?**

Yes. You can shell out to the container with `subprocess.run(['docker','run',...])` or use the `docker` Python SDK's `containers.run()`. Both approaches let a host-side Python script build the command, launch the container, and check the exit code and output, as the complete example above shows.

**How do I stop container output files from being owned by root?**

Add `--user $(id -u):$(id -g)` to `docker run` so the process runs as your host user id. Files written to the mounted output directory are then owned by you and remain editable without `sudo`.

**Should I bind mount input and output as separate directories?**

You can, and it is good practice at scale — mount inputs read-only with `:ro` and outputs read-write. For a single ad-hoc run, one shared `/data` mount is simpler; the [container packaging guide](/batch-automation-cloud-integration/pdal-docker-containers/) shows the split-mount pattern used in production.

---

## Related

- [PDAL Docker Containers for Reproducible Pipelines](/batch-automation-cloud-integration/pdal-docker-containers/) — parent guide on building, pinning, and sizing the image
- [Batch Automation and Cloud Integration for PDAL](/batch-automation-cloud-integration/) — where containerised runs fit into batch and cloud workflows
- [PDAL Stage Chaining](/pdal-pipeline-architecture-execution/pdal-stage-chaining/) — how the reader, filter, and writer stages in the pipeline JSON connect
- [Reprojecting Point Clouds from UTM to WGS84](/pdal-pipeline-architecture-execution/spatial-reprojection/reprojecting-point-clouds-from-utm-to-wgs84/) — PROJ grid considerations when a containerised pipeline reprojects
- [Airflow DAG Orchestration](/batch-automation-cloud-integration/airflow-dag-orchestration/) — schedule containerised pipeline runs as DAG tasks
