---
title: "Inspecting PROJ Transformations Before Reprojecting"
description: "See exactly which coordinate operation filters.reprojection will use: projinfo candidate lists, accuracy and grid requirements, enabling PROJ network grids, and pinning a specific pipeline so results do not change between machines."
slug: "inspecting-proj-transformations-before-reprojecting"
type: "howto"
breadcrumb: "Inspecting PROJ Transformations"
datePublished: "2026-09-18"
dateModified: "2026-09-18"
---

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Article",
      "headline": "Inspecting PROJ Transformations Before Reprojecting",
      "description": "See exactly which coordinate operation filters.reprojection will use: projinfo candidate lists, accuracy and grid requirements, enabling PROJ network grids, and pinning a specific pipeline so results do not change between machines.",
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
          "name": "PDAL Pipeline Architecture and Execution",
          "item": "https://www.pythonlidar.com/pdal-pipeline-architecture-execution/"
        },
        {
          "@type": "ListItem",
          "position": 3,
          "name": "Spatial Reprojection",
          "item": "https://www.pythonlidar.com/pdal-pipeline-architecture-execution/spatial-reprojection/"
        },
        {
          "@type": "ListItem",
          "position": 4,
          "name": "Inspecting PROJ Transformations",
          "item": "https://www.pythonlidar.com/pdal-pipeline-architecture-execution/spatial-reprojection/inspecting-proj-transformations-before-reprojecting/"
        }
      ]
    },
    {
      "@type": "HowTo",
      "name": "Inspect and pin the PROJ transformation PDAL uses for reprojection",
      "step": [
        {
          "@type": "HowToStep",
          "name": "List candidate operations for your area",
          "text": "projinfo with --spatial-test intersects and an area of use lists only operations valid where your data is."
        },
        {
          "@type": "HowToStep",
          "name": "Read accuracy and grid requirements",
          "text": "Each candidate shows its accuracy and whether it is usable with installed grids. projinfo ..."
        },
        {
          "@type": "HowToStep",
          "name": "Make the grids available",
          "text": "Either allow PROJ to fetch grids on demand with PROJ_NETWORK=ON (it caches them locally), or install them ahead of time with projsync --bbox ... so containers work offline."
        },
        {
          "@type": "HowToStep",
          "name": "Check what PDAL will use",
          "text": "Build the same transformation with pyproj's TransformerGroup, confirm the best candidate is available, and compare a test point against PDAL's output."
        },
        {
          "@type": "HowToStep",
          "name": "Pin and record",
          "text": "Record the chosen operation's description in your processing log or output metadata, and bake the grids into the container image so every worker uses the same one."
        }
      ]
    },
    {
      "@type": "FAQPage",
      "mainEntity": [
        {
          "@type": "Question",
          "name": "How do I know which transformation filters.reprojection used?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "PDAL does not report it directly. Reproduce the transformation with pyproj using the same PROJ installation, list the candidates, and compare a test point: if PDAL matches the first candidate, it used the best available operation."
          }
        },
        {
          "@type": "Question",
          "name": "What does PROJ_NETWORK=ON do?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "It lets PROJ download missing grid files from its content delivery network when an operation needs them, caching them locally. It is convenient interactively but should be replaced by pre-installed grids in reproducible batch environments."
          }
        },
        {
          "@type": "Question",
          "name": "Why do I get different results on different machines?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Almost always because different grids are installed, so PROJ selects different operations. Inspect the candidates on both machines and install the same grids everywhere."
          }
        },
        {
          "@type": "Question",
          "name": "Is a Helmert transformation good enough for LiDAR?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "It depends on the accuracy you need. Helmert transformations between NAD83 and WGS84 realizations are typically accurate to about a metre, which is far worse than modern LiDAR's vertical accuracy. Use grid-based operations when they exist."
          }
        }
      ]
    }
  ]
}
</script>

**TL;DR:** Run `projinfo -s <src> -t <dst> --spatial-test intersects -o PROJ` for your area to list every candidate operation with its accuracy and the grids it needs. If the best one needs a grid you do not have, either enable `PROJ_NETWORK=ON` or install the grid with `projsync`. For reproducible production runs, compare PDAL's output against the expected operation with pyproj, and pin the environment so the same grids exist everywhere.

## Context and Motivation

This guide is part of [Spatial Reprojection](https://www.pythonlidar.com/pdal-pipeline-architecture-execution/spatial-reprojection/). `filters.reprojection` delegates to PROJ, and PROJ chooses among several possible coordinate operations between two CRSs — a grid-based datum shift accurate to centimetres, a Helmert transform accurate to a metre, or a "ballpark" transformation that ignores the datum difference altogether. It picks the most accurate one whose grids are available *on that machine*. The same pipeline can therefore produce outputs that differ by a metre between a laptop with grids installed and a container without them, and nothing in PDAL's output tells you which happened.

Inspecting the candidates before a production run, and checking which one was used, turns that silent variability into a documented choice.

<svg viewBox="0 0 740 220" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="PROJ choosing among candidate operations depending on available grids" style="width:100%;max-width:740px;display:block;margin:1.6rem auto">
  <title>The best operation you have installed</title>
  <desc>Three candidate operations listed from most to least accurate: a grid-based shift accurate to 0.05 metres that needs a grid file, a Helmert transformation accurate to 1 metre, and a ballpark transformation of unknown accuracy. On a machine with the grid, PROJ uses the first. On a machine without it, PROJ silently falls to the second, shifting the output by up to a metre.</desc>
  <rect x="0" y="0" width="740" height="220" fill="var(--dg-bg)" rx="10"/>
  <rect x="20" y="24" width="440" height="44" rx="8" fill="var(--dg-d-soft)" stroke="var(--dg-d)" stroke-width="1.3"/>
  <text x="36" y="44" font-size="11" fill="var(--dg-text)">1 · grid shift, accuracy 0.05 m</text>
  <text x="36" y="60" font-size="10" fill="var(--dg-muted)">needs a datum-shift grid file</text>
  <rect x="20" y="80" width="440" height="44" rx="8" fill="var(--dg-c-soft)" stroke="var(--dg-c)" stroke-width="1.3"/>
  <text x="36" y="100" font-size="11" fill="var(--dg-text)">2 · Helmert, accuracy 1 m</text>
  <text x="36" y="116" font-size="10" fill="var(--dg-muted)">no grid needed</text>
  <rect x="20" y="136" width="440" height="44" rx="8" fill="var(--dg-e-soft)" stroke="var(--dg-e)" stroke-width="1.3"/>
  <text x="36" y="156" font-size="11" fill="var(--dg-text)">3 · ballpark, accuracy unknown</text>
  <text x="36" y="172" font-size="10" fill="var(--dg-muted)">ignores the datum difference</text>
  <text x="490" y="50" font-size="10.5" fill="var(--dg-d)">laptop with grids → uses 1</text>
  <text x="490" y="106" font-size="10.5" fill="var(--dg-c)">container without grids → uses 2</text>
  <text x="20" y="206" font-size="10.5" fill="var(--dg-muted)">same pipeline, same input, outputs up to a metre apart — and no warning in the PDAL log</text>
</svg>

## Prerequisites and Assumptions

- PROJ 7+ with the `projinfo` and `projsync` utilities (bundled with PROJ in conda-forge and most Linux packages).
- pyproj 3.x in Python, built against the same PROJ as PDAL where possible.
- Source and target CRSs identified, ideally as EPSG codes, with a bounding box of the project in geographic coordinates.

## Step-by-Step Implementation

### Step 1 — List candidate operations for your area

`projinfo` with `--spatial-test intersects` and an area of use lists only operations valid where your data is.

```bash
projinfo -s EPSG:4269 -t EPSG:6318 --spatial-test intersects \
  --bbox -76.0,39.5,-75.0,40.5 --summary
```

### Step 2 — Read accuracy and grid requirements

Each candidate shows its accuracy and whether it is usable with installed grids. `projinfo ... -o PROJ` prints the full pipeline, including `+proj=hgridshift +grids=...` steps.

### Step 3 — Make the grids available

Either allow PROJ to fetch grids on demand with `PROJ_NETWORK=ON` (it caches them locally), or install them ahead of time with `projsync --bbox ...` so containers work offline.

### Step 4 — Check what PDAL will use

Build the same transformation with pyproj's `TransformerGroup`, confirm the best candidate is available, and compare a test point against PDAL's output.

### Step 5 — Pin and record

Record the chosen operation's description in your processing log or output metadata, and bake the grids into the container image so every worker uses the same one.

## Complete Working Example

```python
"""Report PROJ candidates for a reprojection and verify PDAL used the best one."""
from __future__ import annotations

import json
import os

import numpy as np
import pdal
from pyproj.transformer import TransformerGroup

SRC, DST = "EPSG:6318+5703", "EPSG:6347+5703"      # NAD83(2011) geographic -> UTM 18N
AREA = (-76.0, 39.5, -75.0, 40.5)                  # west, south, east, north


def candidates() -> TransformerGroup:
    from pyproj.aoi import AreaOfInterest
    group = TransformerGroup(SRC, DST, always_xy=True,
                             area_of_interest=AreaOfInterest(*AREA))
    for i, t in enumerate(group.transformers):
        print(f"[{i}] acc={t.accuracy} m  {t.description}")
    for op in group.unavailable_operations:
        grids = [g.short_name for g in op.grids if not g.available]
        print(f"[unavailable] acc={op.accuracy} m  {op.name}  missing grids: {grids}")
    if not group.best_available:
        print("WARNING: the most accurate operation is not available on this machine")
    return group


def pdal_point(x: float, y: float, z: float) -> np.ndarray:
    arr = np.array([(x, y, z)], dtype=[("X", "f8"), ("Y", "f8"), ("Z", "f8")])
    p = pdal.Pipeline(json.dumps({"pipeline": [
        {"type": "filters.reprojection", "in_srs": SRC, "out_srs": DST}]}), arrays=[arr])
    p.execute()
    out = p.arrays[0][0]
    return np.array([out["X"], out["Y"], out["Z"]])


if __name__ == "__main__":
    print("PROJ_NETWORK =", os.environ.get("PROJ_NETWORK", "OFF"))
    group = candidates()
    x, y, z = -75.5, 40.0, 120.0
    best = np.array(group.transformers[0].transform(x, y, z))
    got = pdal_point(x, y, z)
    diff = np.abs(best - got)
    print("pyproj best:", best.round(3), " PDAL:", got.round(3), " diff:", diff.round(3))
    assert diff.max() < 0.01, "PDAL did not use the best available operation"
```

Run it once with grids and once in your production container. If the outputs or the warning differ, the container is missing grids.

<svg viewBox="0 0 740 200" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Where PROJ looks for grids: local paths, the user cache and the CDN" style="width:100%;max-width:740px;display:block;margin:1.6rem auto">
  <title>Where grids come from</title>
  <desc>PROJ searches for a grid in order: the PROJ_DATA directories bundled with the installation, then the user cache directory, and finally, only when PROJ_NETWORK is ON, the PROJ content delivery network over HTTPS. A downloaded grid is written to the cache for next time. In an offline container, only the first location is available.</desc>
  <defs><marker id="grid-arw" markerWidth="9" markerHeight="7" refX="9" refY="3.5" orient="auto"><path d="M0,0 L0,7 L9,3.5 z" fill="var(--dg-line)"/></marker></defs>
  <rect x="0" y="0" width="740" height="200" fill="var(--dg-bg)" rx="10"/>
  <rect x="20" y="60" width="180" height="60" rx="8" fill="var(--dg-surface)" stroke="var(--dg-line)" stroke-width="1.3"/>
  <text x="110" y="86" text-anchor="middle" font-size="11" fill="var(--dg-text)">PROJ_DATA dirs</text>
  <text x="110" y="104" text-anchor="middle" font-size="10" fill="var(--dg-muted)">projsync, image build</text>
  <rect x="280" y="60" width="180" height="60" rx="8" fill="var(--dg-surface)" stroke="var(--dg-line)" stroke-width="1.3"/>
  <text x="370" y="86" text-anchor="middle" font-size="11" fill="var(--dg-text)">user cache</text>
  <text x="370" y="104" text-anchor="middle" font-size="10" fill="var(--dg-muted)">earlier downloads</text>
  <rect x="540" y="60" width="180" height="60" rx="8" fill="var(--dg-b-soft)" stroke="var(--dg-b)" stroke-width="1.3"/>
  <text x="630" y="86" text-anchor="middle" font-size="11" fill="var(--dg-text)">PROJ CDN</text>
  <text x="630" y="104" text-anchor="middle" font-size="10" fill="var(--dg-muted)">only if PROJ_NETWORK=ON</text>
  <line x1="200" y1="90" x2="276" y2="90" stroke="var(--dg-line)" stroke-width="1.4" marker-end="url(#grid-arw)"/>
  <line x1="460" y1="90" x2="536" y2="90" stroke="var(--dg-line)" stroke-width="1.4" marker-end="url(#grid-arw)"/>
  <path d="M630 124 L630 150 L370 150 L370 124" fill="none" stroke="var(--dg-b)" stroke-width="1.3" stroke-dasharray="5 4" marker-end="url(#grid-arw)"/>
  <text x="500" y="168" text-anchor="middle" font-size="10.5" fill="var(--dg-b)">downloaded grid cached</text>
  <text x="20" y="40" font-size="10.5" fill="var(--dg-muted)">search order; an offline container sees only the first box</text>
</svg>

## Key Parameter Table

| Tool or setting | Example | Purpose |
|---|---|---|
| `projinfo --summary` | `projinfo -s A -t B --summary` | One line per candidate with accuracy |
| `--spatial-test intersects` | with `--bbox w,s,e,n` | Only operations valid in your area |
| `-o PROJ` | `projinfo -s A -t B -o PROJ` | Full pipeline, including grid names |
| `PROJ_NETWORK=ON` | environment variable | Fetch missing grids from the PROJ CDN |
| `projsync` | `projsync --bbox -76,39.5,-75,40.5` | Pre-download grids for an area |
| `TransformerGroup` | pyproj | Candidates and availability from Python |

## Verification

- **Best available equals best overall.** `group.best_available` is true on every machine that runs production.
- **PDAL matches pyproj.** The test point transformed by PDAL equals pyproj's first candidate to within a millimetre.
- **Environment recorded.** The output metadata or run log records the PROJ version and the operation description.

## Gotchas and Edge Cases

**Ballpark transformations are silent.** When no real datum transformation is known between two CRSs, PROJ may use a ballpark operation that treats different datums as identical. `projinfo` labels it clearly; PDAL does not. Always inspect when the source and target datums differ.

**Network grids in batch jobs.** `PROJ_NETWORK=ON` downloads grids on first use, which works on a laptop but can fail or be slow in a fleet of containers without internet egress. Bake grids into the image with `projsync` during the build instead.

**Different PROJ builds for PDAL and pyproj.** pip-installed pyproj wheels bundle their own PROJ. If PDAL uses a different PROJ with a different grid set, the check above can disagree for reasons unrelated to your data. Install both from conda-forge to share one PROJ.

<svg viewBox="0 0 740 170" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Two PROJ installations in one environment" style="width:100%;max-width:740px;display:block;margin:1.6rem auto">
  <title>One environment, two PROJs</title>
  <desc>Left: PDAL linked to a system or conda PROJ with grids installed. Right: a pip pyproj wheel bundling its own PROJ with a separate, empty data directory. A comparison between them fails even though PDAL's output is correct. Installing both from conda-forge makes them share one PROJ and one grid directory.</desc>
  <rect x="0" y="0" width="740" height="170" fill="var(--dg-bg)" rx="10"/>
  <rect x="20" y="30" width="300" height="110" rx="9" fill="var(--dg-surface)" stroke="var(--dg-line)" stroke-width="1.3"/>
  <text x="170" y="56" text-anchor="middle" font-size="11.5" font-weight="600" fill="var(--dg-text)">PDAL</text>
  <text x="170" y="80" text-anchor="middle" font-size="10.5" fill="var(--dg-muted)">conda PROJ 9.x</text>
  <text x="170" y="100" text-anchor="middle" font-size="10.5" fill="var(--dg-d)">grids installed</text>
  <rect x="420" y="30" width="300" height="110" rx="9" fill="var(--dg-surface)" stroke="var(--dg-line)" stroke-width="1.3"/>
  <text x="570" y="56" text-anchor="middle" font-size="11.5" font-weight="600" fill="var(--dg-text)">pyproj (pip wheel)</text>
  <text x="570" y="80" text-anchor="middle" font-size="10.5" fill="var(--dg-muted)">bundled PROJ</text>
  <text x="570" y="100" text-anchor="middle" font-size="10.5" fill="var(--dg-e)">separate, empty grid dir</text>
  <text x="370" y="160" text-anchor="middle" font-size="10.5" fill="var(--dg-muted)">install both from conda-forge so they share one PROJ and one set of grids</text>
</svg>

**EPSG database updates.** New PROJ releases add operations and change preferences. Pin the PROJ version in production and re-run the inspection when you upgrade it.

## Frequently Asked Questions

**How do I know which transformation filters.reprojection used?**

PDAL does not report it directly. Reproduce the transformation with pyproj using the same PROJ installation, list the candidates, and compare a test point: if PDAL matches the first candidate, it used the best available operation.

**What does PROJ_NETWORK=ON do?**

It lets PROJ download missing grid files from its content delivery network when an operation needs them, caching them locally. It is convenient interactively but should be replaced by pre-installed grids in reproducible batch environments.

**Why do I get different results on different machines?**

Almost always because different grids are installed, so PROJ selects different operations. Inspect the candidates on both machines and install the same grids everywhere.

**Is a Helmert transformation good enough for LiDAR?**

It depends on the accuracy you need. Helmert transformations between NAD83 and WGS84 realizations are typically accurate to about a metre, which is far worse than modern LiDAR's vertical accuracy. Use grid-based operations when they exist.

## Related

- [Spatial Reprojection](https://www.pythonlidar.com/pdal-pipeline-architecture-execution/spatial-reprojection/) — the reprojection stage in general
- [Handling Vertical Datum Transforms in PDAL](https://www.pythonlidar.com/pdal-pipeline-architecture-execution/spatial-reprojection/handling-vertical-datum-transforms-in-pdal/) — geoid grids for heights
- [Reprojecting State Plane Feet to Metres](https://www.pythonlidar.com/pdal-pipeline-architecture-execution/spatial-reprojection/reprojecting-state-plane-feet-to-metres/) — units and compound CRSs
- [Building a Slim PDAL Docker Image](https://www.pythonlidar.com/batch-automation-cloud-integration/pdal-docker-containers/building-a-slim-pdal-docker-image/) — baking grids into containers
- [Choosing a Projected CRS for a LiDAR Project](https://www.pythonlidar.com/point-cloud-data-standards-fundamentals/coordinate-reference-systems/choosing-a-projected-crs-for-a-lidar-project/) — picking the target in the first place
