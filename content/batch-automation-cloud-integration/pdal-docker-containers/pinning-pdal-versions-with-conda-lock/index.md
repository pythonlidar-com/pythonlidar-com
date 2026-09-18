---
title: "Pinning PDAL Versions with conda-lock"
description: "Make PDAL environments reproducible with conda-lock: declare PDAL, GDAL and python-pdal in environment.yml, generate per-platform lock files, install them with micromamba in CI and Docker, and upgrade PDAL deliberately by regenerating and testing the lock."
slug: "pinning-pdal-versions-with-conda-lock"
type: "howto"
breadcrumb: "Pinning with conda-lock"
datePublished: "2026-09-18"
dateModified: "2026-09-18"
---

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Article",
      "headline": "Pinning PDAL Versions with conda-lock",
      "description": "Make PDAL environments reproducible with conda-lock: declare PDAL, GDAL and python-pdal in environment.yml, generate per-platform lock files, install them with micromamba in CI and Docker, and upgrade PDAL deliberately by regenerating and testing the lock.",
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
          "name": "Pinning with conda-lock",
          "item": "https://www.pythonlidar.com/batch-automation-cloud-integration/pdal-docker-containers/pinning-pdal-versions-with-conda-lock/"
        }
      ]
    },
    {
      "@type": "HowTo",
      "name": "Pin PDAL versions with conda-lock",
      "step": [
        {
          "@type": "HowToStep",
          "name": "Write the spec",
          "text": "List direct dependencies only, with ranges on the libraries that affect results: PDAL, GDAL, PROJ and python-pdal."
        },
        {
          "@type": "HowToStep",
          "name": "Generate the lock",
          "text": "conda-lock lock -f environment.yml -p linux-64 -p linux-aarch64 -p osx-arm64 writes a unified conda-lock.yml."
        },
        {
          "@type": "HowToStep",
          "name": "Render per-platform explicit files for Docker",
          "text": "conda-lock render -p linux-64 writes conda-linux-64.lock, a plain explicit list that micromamba installs without resolving."
        },
        {
          "@type": "HowToStep",
          "name": "Install from the lock everywhere",
          "text": "conda-lock install -n lidar conda-lock.yml locally, and micromamba create -p /opt/env -f conda-linux-64.lock in Docker and CI."
        },
        {
          "@type": "HowToStep",
          "name": "Upgrade deliberately",
          "text": "Change a range in the spec, regenerate the lock, and run the regression tile set before merging; the lock diff shows exactly which packages moved."
        }
      ]
    },
    {
      "@type": "FAQPage",
      "mainEntity": [
        {
          "@type": "Question",
          "name": "Why pin PDAL versions for production LiDAR processing?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Filter defaults, raster writer behaviour and PROJ transformation grids change between releases, so unpinned environments can produce different outputs from the same data. A lock file makes every install identical."
          }
        },
        {
          "@type": "Question",
          "name": "What is the difference between environment.yml and a conda-lock file?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "environment.yml lists direct dependencies with version ranges. The lock file records the resolved solution: every package, including transitive ones, at an exact version and build with checksums, for each platform."
          }
        },
        {
          "@type": "Question",
          "name": "How do I use a conda-lock file in Docker?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Render an explicit per-platform lock file with conda-lock render and install it with micromamba create in the builder stage. No dependency solving happens during the image build."
          }
        },
        {
          "@type": "Question",
          "name": "How should I upgrade PDAL once it is pinned?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Change the version range in environment.yml, regenerate the lock, review which packages changed, and run regression tests on reference tiles before merging and rebuilding images."
          }
        },
        {
          "@type": "Question",
          "name": "Can I lock environments with pip instead?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "pip lock tools pin Python packages, but PDAL, GDAL and PROJ are compiled libraries that pip does not manage well. conda-forge ships them as consistent binary builds, which is why conda-lock is the usual choice for the geospatial stack."
          }
        }
      ]
    }
  ]
}
</script>

**TL;DR:** Put loose version constraints (`pdal >=2.8,<2.9`, `python-pdal`, `gdal`) in `environment.yml`, run `conda-lock -f environment.yml -p linux-64 -p osx-arm64` to resolve every package to an exact build with hashes, commit `conda-lock.yml`, and install from the lock everywhere. The same PDAL, GDAL and PROJ builds then run on laptops, in CI and in production containers, and an upgrade is a reviewed change to one file.

## Context and Motivation

This guide is part of [PDAL Docker Containers](https://www.pythonlidar.com/batch-automation-cloud-integration/pdal-docker-containers/). LiDAR results depend on library versions more than people expect. A PDAL release can change a filter's defaults, a GDAL release can change how a raster writer handles nodata, and a PROJ release with new transformation grids can shift reprojected coordinates by centimetres. An `environment.yml` that says `pdal` resolves to whatever is newest on the day the image is built, so two builds a month apart may produce different DTMs from the same tiles.

A lock file records the exact solution — every package, version, build string and checksum, for each platform — so installing it is deterministic. It is the foundation for the slim image in [building a slim PDAL Docker image](https://www.pythonlidar.com/batch-automation-cloud-integration/pdal-docker-containers/building-a-slim-pdal-docker-image/).

<svg viewBox="0 0 740 200" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="From loose spec to lock file to installs" style="width:100%;max-width:740px;display:block;margin:1.6rem auto">
  <title>Spec, lock, install</title>
  <desc>An environment.yml with loose constraints is resolved once by conda-lock into a lock file with exact versions and hashes for linux-64 and osx-arm64. The same lock file is installed by micromamba on laptops, in CI and in the Docker build, giving identical environments.</desc>
  <defs><marker id="cl-arw" markerWidth="9" markerHeight="7" refX="9" refY="3.5" orient="auto"><path d="M0,0 L0,7 L9,3.5 z" fill="var(--dg-line)"/></marker></defs>
  <rect x="0" y="0" width="740" height="200" fill="var(--dg-bg)" rx="10"/>
  <rect x="20" y="70" width="170" height="60" rx="8" fill="var(--dg-surface-2)" stroke="var(--dg-line)" stroke-width="1.3"/>
  <text x="105" y="96" text-anchor="middle" font-size="11" fill="var(--dg-text)">environment.yml</text>
  <text x="105" y="114" text-anchor="middle" font-size="10" fill="var(--dg-muted)">pdal &gt;=2.8,&lt;2.9</text>
  <rect x="270" y="70" width="170" height="60" rx="8" fill="var(--dg-a-soft)" stroke="var(--dg-a)" stroke-width="1.3"/>
  <text x="355" y="96" text-anchor="middle" font-size="11" fill="var(--dg-text)">conda-lock.yml</text>
  <text x="355" y="114" text-anchor="middle" font-size="10" fill="var(--dg-text)">exact builds + hashes</text>
  <g font-size="10.5" fill="var(--dg-text)">
    <rect x="540" y="20" width="180" height="40" rx="6" fill="var(--dg-d-soft)" stroke="var(--dg-d)"/><text text-anchor="middle" x="630" y="44">laptop</text>
    <rect x="540" y="80" width="180" height="40" rx="6" fill="var(--dg-d-soft)" stroke="var(--dg-d)"/><text text-anchor="middle" x="630" y="104">CI</text>
    <rect x="540" y="140" width="180" height="40" rx="6" fill="var(--dg-d-soft)" stroke="var(--dg-d)"/><text text-anchor="middle" x="630" y="164">Docker image</text>
  </g>
  <line x1="190" y1="100" x2="266" y2="100" stroke="var(--dg-line)" stroke-width="1.4" marker-end="url(#cl-arw)"/>
  <path d="M440 100 L490 100 L490 40 L536 40" fill="none" stroke="var(--dg-line)" stroke-width="1.3" marker-end="url(#cl-arw)"/>
  <line x1="490" y1="100" x2="536" y2="100" stroke="var(--dg-line)" stroke-width="1.3" marker-end="url(#cl-arw)"/>
  <path d="M490 100 L490 160 L536 160" fill="none" stroke="var(--dg-line)" stroke-width="1.3" marker-end="url(#cl-arw)"/>
  <text x="228" y="90" text-anchor="middle" font-size="10" fill="var(--dg-muted)">resolve</text>
</svg>

## Prerequisites and Assumptions

- `conda-lock` installed (`pipx install conda-lock` or from conda-forge) and `micromamba` for installs.
- conda-forge as the only channel; mixing `defaults` and conda-forge causes unsolvable or inconsistent environments for the geospatial stack.
- A repository where the spec and lock are committed together.

## Step-by-Step Implementation

### Step 1 — Write the spec

List direct dependencies only, with ranges on the libraries that affect results: PDAL, GDAL, PROJ and python-pdal.

### Step 2 — Generate the lock

`conda-lock lock -f environment.yml -p linux-64 -p linux-aarch64 -p osx-arm64` writes a unified `conda-lock.yml`.

### Step 3 — Render per-platform explicit files for Docker

`conda-lock render -p linux-64` writes `conda-linux-64.lock`, a plain explicit list that micromamba installs without resolving.

### Step 4 — Install from the lock everywhere

`conda-lock install -n lidar conda-lock.yml` locally, and `micromamba create -p /opt/env -f conda-linux-64.lock` in Docker and CI.

### Step 5 — Upgrade deliberately

Change a range in the spec, regenerate the lock, and run the regression tile set before merging; the lock diff shows exactly which packages moved.

## Complete Working Example

`environment.yml`:

```yaml
name: lidar
channels:
  - conda-forge
dependencies:
  - python =3.12
  - pdal >=2.8,<2.9
  - python-pdal >=3.4
  - gdal >=3.9,<3.10
  - proj >=9.4,<9.6
  - laspy >=2.5
  - lazrs-python
  - numpy >=1.26,<3
  - boto3
  - pytest
platforms:
  - linux-64
  - linux-aarch64
  - osx-arm64
```

Lock, render and install:

```bash
conda-lock lock -f environment.yml                 # uses platforms from the file
conda-lock render -p linux-64 -p linux-aarch64 conda-lock.yml
git add environment.yml conda-lock.yml conda-linux-64.lock conda-linux-aarch64.lock

# local development
conda-lock install -n lidar conda-lock.yml

# CI or Dockerfile
micromamba create -y -p /opt/env -f conda-linux-64.lock
/opt/env/bin/pdal --version
```

A regression check to run after every lock change:

```python
"""test_regression.py: fail if the environment changes results on reference tiles."""
import json
import subprocess

import rasterio

REF = json.load(open("tests/reference.json"))      # {"tile": {"ground": n, "dtm_mean": z}}


def test_reference_tiles(tmp_path):
    for tile, expected in REF.items():
        out = tmp_path / f"{tile}.tif"
        subprocess.run(["pdal", "pipeline", "pipelines/dtm.json",
                        f"--readers.las.filename=tests/data/{tile}.laz",
                        f"--writers.gdal.filename={out}"], check=True)
        with rasterio.open(out) as src:
            z = src.read(1, masked=True)
        assert abs(float(z.mean()) - expected["dtm_mean"]) < 0.005, tile
```

<svg viewBox="0 0 740 190" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="An upgrade flow gated by regression tiles" style="width:100%;max-width:740px;display:block;margin:1.6rem auto">
  <title>Upgrading on purpose</title>
  <desc>A change to the PDAL range in environment.yml regenerates the lock file. The lock diff is reviewed, then regression tests run on reference tiles. If outputs match within tolerance the change merges and a new image is built; if not, the difference is investigated before anything reaches production.</desc>
  <defs><marker id="ug-arw" markerWidth="9" markerHeight="7" refX="9" refY="3.5" orient="auto"><path d="M0,0 L0,7 L9,3.5 z" fill="var(--dg-line)"/></marker></defs>
  <rect x="0" y="0" width="740" height="190" fill="var(--dg-bg)" rx="10"/>
  <g font-size="10.5" fill="var(--dg-text)">
    <rect x="20" y="60" width="120" height="50" rx="8" fill="var(--dg-surface-2)" stroke="var(--dg-line)"/><text text-anchor="middle" x="80" y="89">edit range</text>
    <rect x="170" y="60" width="120" height="50" rx="8" fill="var(--dg-surface-2)" stroke="var(--dg-line)"/><text text-anchor="middle" x="230" y="89">re-lock</text>
    <rect x="320" y="60" width="120" height="50" rx="8" fill="var(--dg-surface-2)" stroke="var(--dg-line)"/><text text-anchor="middle" x="380" y="89">review diff</text>
    <rect x="470" y="60" width="120" height="50" rx="8" fill="var(--dg-a-soft)" stroke="var(--dg-a)"/><text text-anchor="middle" x="530" y="89">regression</text>
    <rect x="620" y="20" width="100" height="44" rx="8" fill="var(--dg-d-soft)" stroke="var(--dg-d)"/><text text-anchor="middle" x="670" y="46">merge</text>
    <rect x="620" y="106" width="100" height="44" rx="8" fill="var(--dg-e-soft)" stroke="var(--dg-e)"/><text text-anchor="middle" x="670" y="132">investigate</text>
  </g>
  <g stroke="var(--dg-line)" stroke-width="1.3" fill="none">
    <line x1="140" y1="85" x2="166" y2="85" marker-end="url(#ug-arw)"/>
    <line x1="290" y1="85" x2="316" y2="85" marker-end="url(#ug-arw)"/>
    <line x1="440" y1="85" x2="466" y2="85" marker-end="url(#ug-arw)"/>
    <path d="M590 75 L605 75 L605 42 L616 42" marker-end="url(#ug-arw)"/>
    <path d="M590 95 L605 95 L605 128 L616 128" marker-end="url(#ug-arw)"/>
  </g>
  <text x="370" y="176" text-anchor="middle" font-size="10.5" fill="var(--dg-muted)">the lock diff names every package that moved</text>
</svg>

## Reading a Lock Diff

A lock regeneration often moves far more than the package you asked about. Raising the PDAL range can pull a new GDAL build, a new PROJ, a new libtiff and a different compiler runtime. The diff of `conda-lock.yml` lists each one, which is the point: you can see that PROJ moved from 9.4 to 9.5 and check whether its release notes mention grid or datum changes relevant to your projects. Keep the reference tiles representative — one tile per CRS and vertical datum you process, one dense urban tile, one steep forested tile — so the regression test exercises the parts that library changes are most likely to affect.

It is also worth locking without changing ranges on a schedule, for example monthly, to pick up bug-fix builds. Treat that as a normal upgrade: review the diff, run the regression tiles, then merge.

## Why Transitive Packages Matter Most

The packages you list are rarely the ones that surprise you. PDAL's behaviour depends on the GDAL, PROJ, GEOS, laz-perf and libtiff builds it links against, none of which appear in a short `environment.yml`. Without a lock, a rebuild can hold PDAL at the same version while swapping PROJ underneath it, and reprojected outputs shift even though the "PDAL version" in your notes is unchanged. The lock pins the whole tree, so it is the full set of libraries, not just the headline one, that stays fixed between runs.

<svg viewBox="0 0 740 190" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="PDAL depends on a tree of libraries that a lock pins" style="width:100%;max-width:740px;display:block;margin:1.6rem auto">
  <title>The dependency tree behind PDAL</title>
  <desc>PDAL sits at the top, linked to GDAL, PROJ, GEOS and laz-perf. GDAL in turn links to libtiff and PROJ. The environment.yml names only PDAL and a few others, while the lock file pins every node in the tree.</desc>
  <rect x="0" y="0" width="740" height="190" fill="var(--dg-bg)" rx="10"/>
  <g stroke="var(--dg-line)" stroke-width="1.3">
    <line x1="370" y1="54" x2="140" y2="96"/><line x1="370" y1="54" x2="300" y2="96"/>
    <line x1="370" y1="54" x2="460" y2="96"/><line x1="370" y1="54" x2="610" y2="96"/>
    <line x1="140" y1="126" x2="140" y2="148"/>
  </g>
  <g font-size="10.5" fill="var(--dg-text)">
    <rect x="310" y="20" width="120" height="34" rx="6" fill="var(--dg-a-soft)" stroke="var(--dg-a)"/><text text-anchor="middle" x="370" y="42">PDAL</text>
    <rect x="80" y="96" width="120" height="30" rx="6" fill="var(--dg-surface-2)" stroke="var(--dg-line)"/><text text-anchor="middle" x="140" y="116">GDAL</text>
    <rect x="240" y="96" width="120" height="30" rx="6" fill="var(--dg-surface-2)" stroke="var(--dg-line)"/><text text-anchor="middle" x="300" y="116">PROJ</text>
    <rect x="400" y="96" width="120" height="30" rx="6" fill="var(--dg-surface-2)" stroke="var(--dg-line)"/><text text-anchor="middle" x="460" y="116">GEOS</text>
    <rect x="550" y="96" width="120" height="30" rx="6" fill="var(--dg-surface-2)" stroke="var(--dg-line)"/><text text-anchor="middle" x="610" y="116">laz-perf</text>
    <rect x="80" y="148" width="120" height="30" rx="6" fill="var(--dg-surface)" stroke="var(--dg-line)"/><text text-anchor="middle" x="140" y="168">libtiff</text>
  </g>
  <text x="460" y="168" text-anchor="middle" font-size="10.5" fill="var(--dg-muted)">the lock pins every node, not just PDAL</text>
</svg>

## Key Parameter Table

| Item | Recommended | Why |
|---|---|---|
| Channel | `conda-forge` only | Consistent geospatial builds |
| Ranges | minor-version for PDAL/GDAL/PROJ | Controlled upgrades |
| Platforms | fleet + developer machines | One lock for all |
| Lock format | unified `conda-lock.yml` | Reviewable diff |
| Docker input | rendered explicit `.lock` | No solve at build time |
| Regression set | 5–10 reference tiles | Catches result changes |

## Verification

- **Determinism.** Two fresh installs from the same lock produce identical `micromamba list --explicit --md5` output.
- **Versions in logs.** Print `pdal --version` and `gdal-config --version` at the start of each job, so logs record what produced each output.
- **Regression pass.** The reference test passes before and after any lock change you merge.

## Gotchas and Edge Cases

**pip packages.** conda-lock can include `pip:` dependencies, but they resolve separately and can overwrite conda packages. Prefer conda-forge builds of everything, especially NumPy.

**Platform-specific solves.** A package missing for one platform makes the whole lock fail. Drop that platform from `platforms`, or lock it separately.

**Lock drift in images.** An image built from the lock is only reproducible if the Dockerfile copies the rendered lock and nothing installs extra packages afterwards.

## Frequently Asked Questions

**Why pin PDAL versions for production LiDAR processing?**

Filter defaults, raster writer behaviour and PROJ transformation grids change between releases, so unpinned environments can produce different outputs from the same data. A lock file makes every install identical.

**What is the difference between environment.yml and a conda-lock file?**

environment.yml lists direct dependencies with version ranges. The lock file records the resolved solution: every package, including transitive ones, at an exact version and build with checksums, for each platform.

**How do I use a conda-lock file in Docker?**

Render an explicit per-platform lock file with conda-lock render and install it with micromamba create in the builder stage. No dependency solving happens during the image build.

**How should I upgrade PDAL once it is pinned?**

Change the version range in environment.yml, regenerate the lock, review which packages changed, and run regression tests on reference tiles before merging and rebuilding images.

**Can I lock environments with pip instead?**

pip lock tools pin Python packages, but PDAL, GDAL and PROJ are compiled libraries that pip does not manage well. conda-forge ships them as consistent binary builds, which is why conda-lock is the usual choice for the geospatial stack.

## Related

- [PDAL Docker Containers](https://www.pythonlidar.com/batch-automation-cloud-integration/pdal-docker-containers/) — containerising PDAL
- [Building a Slim PDAL Docker Image](https://www.pythonlidar.com/batch-automation-cloud-integration/pdal-docker-containers/building-a-slim-pdal-docker-image/) — installs the rendered lock
- [Testing PDAL Pipelines with pytest](https://www.pythonlidar.com/pdal-pipeline-architecture-execution/pipeline-validation/testing-pdal-pipelines-with-pytest/) — the regression test pattern
- [Inspecting PROJ Transformations Before Reprojecting](https://www.pythonlidar.com/pdal-pipeline-architecture-execution/spatial-reprojection/inspecting-proj-transformations-before-reprojecting/) — why PROJ versions matter
