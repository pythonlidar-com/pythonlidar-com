---
title: "Handling Vertical Datum Transforms in PDAL"
description: "Why filters.reprojection leaves Z untouched unless both CRSs are compound, how to confirm the geoid grid is installed, and an assertion that catches a silent null vertical transform."
slug: "handling-vertical-datum-transforms-in-pdal"
type: "howto"
breadcrumb: "Vertical Datum Transforms"
datePublished: "2026-08-07"
dateModified: "2026-08-07"
---

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Article",
      "headline": "Handling Vertical Datum Transforms in PDAL",
      "description": "Why filters.reprojection leaves Z untouched unless both CRSs are compound, how to confirm the geoid grid is installed, and an assertion that catches a silent null vertical transform.",
      "datePublished": "2026-08-07",
      "dateModified": "2026-08-07",
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
          "name": "Vertical Datum Transforms",
          "item": "https://www.pythonlidar.com/pdal-pipeline-architecture-execution/spatial-reprojection/handling-vertical-datum-transforms-in-pdal/"
        }
      ]
    },
    {
      "@type": "HowTo",
      "name": "Apply a vertical datum transformation to a point cloud with PDAL",
      "step": [
        {
          "@type": "HowToStep",
          "name": "Confirm the transformation exists",
          "text": "Run projinfo between the two compound CRS codes and check that a grid-based operation appears rather than only a null transform."
        },
        {
          "@type": "HowToStep",
          "name": "Declare compound CRSs on both sides",
          "text": "Set in_srs and out_srs to codes that include a vertical component, such as EPSG:6339+5703."
        },
        {
          "@type": "HowToStep",
          "name": "Set the writer vertical scale",
          "text": "Choose scale_z and offset_z appropriate to the target vertical unit rather than inheriting the source header."
        },
        {
          "@type": "HowToStep",
          "name": "Assert that Z moved",
          "text": "Compare mean elevation before and after and fail the run if the shift is under a centimetre."
        },
        {
          "@type": "HowToStep",
          "name": "Check against a control point",
          "text": "Transform a point with a published orthometric height and compare the result to the published value."
        }
      ]
    },
    {
      "@type": "FAQPage",
      "mainEntity": [
        {
          "@type": "Question",
          "name": "Why did my reprojection leave Z unchanged?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Almost certainly because one of the two CRSs had no vertical component. A code like EPSG:6318 describes only the horizontal system, so PDAL transforms X and Y and passes Z through. Use compound codes on both sides, such as EPSG:6339+5703 to EPSG:6318+4979."
          }
        },
        {
          "@type": "Question",
          "name": "How do I know the geoid grid is installed?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Run projinfo between the source and target codes and read the candidate operations. If the only candidate is a null transformation, or the output names a missing grid file, the shift will not happen. Setting PROJ_NETWORK=ON lets PROJ fetch the grid at run time instead."
          }
        },
        {
          "@type": "Question",
          "name": "Can I just add a constant offset instead?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Only if the tile is small and the accuracy requirement is loose. Geoid separation varies across the ground, often by more than a metre within a kilometre, so a constant offset reproduces the mean and leaves a tilted error surface behind."
          }
        },
        {
          "@type": "Question",
          "name": "What if nobody knows what the source Z means?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Stop and find out. The difference between ellipsoidal and orthometric heights is tens of metres, and no pipeline configuration recovers from guessing wrong. The survey report, the acquisition contract or the data provider will say; the LAS header usually will not."
          }
        }
      ]
    }
  ]
}
</script>

**TL;DR:** A vertical transform needs a compound CRS on both sides — `EPSG:6339+5703`, not `EPSG:6339` — plus the geoid grid installed where PROJ can find it. Without both, `filters.reprojection` moves your coordinates horizontally, leaves Z untouched, and reports success.

## Context and Motivation

This guide is part of [Spatial Reprojection in PDAL](https://www.pythonlidar.com/pdal-pipeline-architecture-execution/spatial-reprojection/), which covers the horizontal case in depth. Vertical transformation is the half that fails silently, and it fails in a way that surveys notice months later: a terrain model that fits the control network in plan and sits thirty metres off in height.

The root of the problem is that a plain projected CRS code says nothing about the vertical axis. `EPSG:6339` is NAD83(2011) / UTM zone 11N — a horizontal system. Points in a LAS file tagged with it carry a Z value, but the file does not record whether that Z is a height above the ellipsoid, above a geoid model, or above a tide-gauge datum from 1929. PDAL cannot transform what has not been declared, so it does the only safe thing: it transforms X and Y and passes Z through unchanged. That is correct behaviour and it is almost never what the user wanted.

<svg viewBox="0 0 720 256" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Ellipsoidal height, geoid separation and orthometric height on one profile" style="width:100%;max-width:720px;display:block;margin:1.6rem auto">
  <title>The thirty metres a vertical datum accounts for</title>
  <desc>A cross-section with three surfaces. The ellipsoid is a smooth mathematical reference. The geoid undulates above and below it — the separation is about minus thirty metres in this example. The terrain sits above the geoid. An ellipsoidal height measured to the terrain differs from the orthometric height by exactly the geoid separation at that point, and the separation changes across the tile.</desc>
  <rect x="0" y="0" width="720" height="256" fill="var(--dg-bg)" rx="10"/>
  <path d="M40 196 L680 196" fill="none" stroke="var(--dg-b)" stroke-width="2.2"/>
  <text x="46" y="214" font-size="10.5" fill="var(--dg-b)">ellipsoid — the mathematical reference surface</text>
  <path d="M40 150 Q200 132 360 148 T680 140" fill="none" stroke="var(--dg-c)" stroke-width="2.2" stroke-dasharray="7 4"/>
  <text x="46" y="128" font-size="10.5" fill="var(--dg-c)">geoid — where mean sea level would sit</text>
  <path d="M40 96 L140 86 Q260 52 380 82 L520 70 L680 88" fill="none" stroke="var(--dg-line)" stroke-width="2.4"/>
  <text x="500" y="56" font-size="10.5" fill="var(--dg-text)">terrain</text>
  <line x1="240" y1="60" x2="240" y2="196" stroke="var(--dg-a)" stroke-width="1.6"/>
  <text x="250" y="78" font-size="10.5" fill="var(--dg-a)">ellipsoidal height h</text>
  <line x1="300" y1="66" x2="300" y2="140" stroke="var(--dg-d)" stroke-width="1.6"/>
  <text x="310" y="112" font-size="10.5" fill="var(--dg-d)">orthometric height H</text>
  <line x1="560" y1="138" x2="560" y2="196" stroke="var(--dg-e)" stroke-width="1.6"/>
  <text x="570" y="170" font-size="10.5" fill="var(--dg-e)">separation N ≈ −30 m</text>
  <text x="40" y="240" font-size="10.5" fill="var(--dg-muted)">H = h − N, and N varies across a single tile — which is why a constant offset is not a substitute for a geoid grid</text>
</svg>

## Prerequisites and Assumptions

| Requirement | Detail |
|---|---|
| PDAL | 2.4+ built against PROJ 8 or later |
| PROJ data grids | `proj-data` package, or `PROJ_NETWORK=ON` to fetch grids on demand |
| A declared source vertical datum | from the survey report; the file will rarely tell you |
| Compound EPSG codes | e.g. `EPSG:6339+5703` for NAD83(2011) UTM 11N with NAVD88 heights |
| `projinfo` | to confirm the transformation exists before running the pipeline |

If nobody can tell you what the source Z means, stop. Guessing between ellipsoidal and orthometric heights is a thirty-metre coin flip, and no amount of pipeline configuration recovers from choosing wrong.

## Step-by-Step Implementation

### Step 1 — Confirm the grid is installed

```bash
projinfo -s "EPSG:6339+5703" -t "EPSG:6318+5703" --spatial-test intersects -o PROJ
```

The output lists candidate operations with accuracies. If the only candidate is a null transformation, or the output mentions a missing grid file, the vertical shift will not happen.

### Step 2 — Declare both sides as compound CRSs

```json
{
  "type": "filters.reprojection",
  "in_srs": "EPSG:6339+5703",
  "out_srs": "EPSG:6318+4979"
}
```

`5703` is NAVD88 height; `4979` is WGS84 ellipsoidal height. Writing `EPSG:6339` alone on either side disables the vertical part of the transform entirely.

### Step 3 — Set the writer's Z scale deliberately

Vertical units may not survive the transform unchanged. If the source was in US survey feet and the target is metres, `scale_z` on the writer must be reconsidered — the header does not follow automatically, as [metadata and header sync](https://www.pythonlidar.com/point-cloud-data-standards-fundamentals/metadata-header-sync/) explains.

### Step 4 — Check a known point

Take a control point with a published orthometric height, run it through the same transform, and compare. A single point is enough to catch a missing grid, and nothing else will.

## Complete Working Example

```python
"""Transform a tile between compound CRSs and verify the vertical shift happened."""
from __future__ import annotations

import json
import logging
from pathlib import Path

import numpy as np
import pdal

LOG = logging.getLogger("vdatum")


def spec(src: Path, dst: Path, in_srs: str, out_srs: str) -> str:
    return json.dumps({"pipeline": [
        {"type": "readers.las", "filename": str(src)},
        {"type": "filters.reprojection", "in_srs": in_srs, "out_srs": out_srs},
        {"type": "writers.las", "filename": str(dst), "compression": "laszip",
         "scale_z": 0.001, "offset_z": "auto", "forward": "all"},
    ]})


def z_stats(path: Path) -> tuple[float, float]:
    p = pdal.Pipeline(json.dumps({"pipeline": [{"type": "readers.las", "filename": str(path)}]}))
    p.execute()
    z = p.arrays[0]["Z"]
    return float(np.min(z)), float(np.max(z))


def run(src: Path, dst: Path, in_srs: str, out_srs: str, expect_shift: float,
        tolerance: float = 2.0) -> None:
    before_min, before_max = z_stats(src)
    pdal.Pipeline(spec(src, dst, in_srs, out_srs)).execute()
    after_min, after_max = z_stats(dst)

    observed = ((after_min + after_max) / 2) - ((before_min + before_max) / 2)
    LOG.info("mean Z moved by %.3f m (expected about %.3f m)", observed, expect_shift)

    if abs(observed) < 0.01:
        raise AssertionError(
            "Z did not move at all — the vertical transform was not applied. "
            "Check that both CRSs are compound and that the geoid grid is installed."
        )
    if abs(observed - expect_shift) > tolerance:
        raise AssertionError(
            f"vertical shift {observed:.3f} m is not the expected {expect_shift:.3f} m"
        )


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    run(Path("tile_navd88.laz"), Path("tile_ellipsoidal.laz"),
        in_srs="EPSG:6339+5703", out_srs="EPSG:6339+4979", expect_shift=31.4)
```

<svg viewBox="0 0 720 248" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Candidate vertical transformations ranked by accuracy and whether their grids are present" style="width:100%;max-width:720px;display:block;margin:1.6rem auto">
  <title>What projinfo shows before you run anything</title>
  <desc>Three candidate operations between the same pair of compound CRSs. The grid-based operation is accurate to two centimetres but only if the grid files are installed. The Helmert fit is always available at half a metre. The null transform applies no vertical shift at all, and PROJ will silently use it when the grid is missing.</desc>
  <rect x="0" y="0" width="720" height="248" fill="var(--dg-bg)" rx="10"/>
  <rect x="20" y="58" width="360" height="42" rx="7" fill="var(--dg-d-soft)" stroke="var(--dg-d)" stroke-width="1.3"/>
  <text x="200" y="84" text-anchor="middle" font-size="11.5" fill="var(--dg-text)">NADCON5 + GEOID18 grids</text>
  <rect x="400" y="58" width="140" height="42" rx="7" fill="var(--dg-surface)" stroke="var(--dg-line-soft)" stroke-width="1"/>
  <text x="470" y="84" text-anchor="middle" font-size="11" fill="var(--dg-text)">0.02 m</text>
  <text x="560" y="84" font-size="10.5" fill="var(--dg-muted)">installed</text>
  <rect x="20" y="112" width="360" height="42" rx="7" fill="var(--dg-c-soft)" stroke="var(--dg-c)" stroke-width="1.3"/>
  <text x="200" y="138" text-anchor="middle" font-size="11.5" fill="var(--dg-text)">Helmert 7-parameter</text>
  <rect x="400" y="112" width="140" height="42" rx="7" fill="var(--dg-surface)" stroke="var(--dg-line-soft)" stroke-width="1"/>
  <text x="470" y="138" text-anchor="middle" font-size="11" fill="var(--dg-text)">0.50 m</text>
  <text x="560" y="138" font-size="10.5" fill="var(--dg-muted)">always available</text>
  <rect x="20" y="166" width="360" height="42" rx="7" fill="var(--dg-e-soft)" stroke="var(--dg-e)" stroke-width="1.3"/>
  <text x="200" y="192" text-anchor="middle" font-size="11.5" fill="var(--dg-text)">null vertical transform</text>
  <rect x="400" y="166" width="140" height="42" rx="7" fill="var(--dg-surface)" stroke="var(--dg-line-soft)" stroke-width="1"/>
  <text x="470" y="192" text-anchor="middle" font-size="11" fill="var(--dg-text)">no shift at all</text>
  <text x="560" y="192" font-size="10.5" fill="var(--dg-muted)">the silent fallback</text>
  <text x="20" y="44" font-size="10.5" fill="var(--dg-muted)">projinfo -s EPSG:6339+5703 -t EPSG:6339+4979 — candidates, best first</text>
  <text x="20" y="238" font-size="10.5" fill="var(--dg-muted)">PROJ picks the best candidate it can actually execute, and reports success either way</text>
</svg>

## Key Parameter Table

| Setting | Where | Purpose |
|---|---|---|
| `in_srs` | `filters.reprojection` | Overrides whatever the file declares; required when the file omits the vertical part |
| `out_srs` | `filters.reprojection` | Must include a vertical code for Z to move at all |
| `PROJ_NETWORK` | environment | `ON` lets PROJ fetch missing grids over the network at run time |
| `PROJ_DATA` | environment | Directory holding the installed grids; wrong value means silent null transforms |
| `scale_z` / `offset_z` | `writers.las` | Vertical precision after the transform; `auto` offset avoids integer range problems |

## Verification

**Z actually moved.** The assertion in the example: if the mean elevation shifted by less than a centimetre, no vertical transform was applied.

**The shift matches the geoid model.** Compare against the published separation for the tile centre. Regional geoid separations range from roughly −100 m to +85 m worldwide, so a shift in the wrong direction is as diagnostic as no shift at all.

**Control points agree.** The only check that matters to a surveyor. One point with a published orthometric height, transformed, compared.

## Gotchas and Edge Cases

<svg viewBox="0 0 720 250" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Four vertical-transform configurations and whether the Z coordinate moves" style="width:100%;max-width:720px;display:block;margin:1.6rem auto">
  <title>Four configurations, one that works</title>
  <desc>Four combinations of source and target CRS declarations. Horizontal-only codes on both sides move X and Y only. A compound source with a horizontal target still moves nothing vertically. A horizontal source with a compound target fails or assumes ellipsoidal. Only compound codes on both sides, with the geoid grid present, transform the height.</desc>
  <rect x="0" y="0" width="720" height="250" fill="var(--dg-bg)" rx="10"/>
  <text x="200" y="38" text-anchor="middle" font-size="10.5" fill="var(--dg-muted)">what you declare</text>
  <text x="540" y="38" text-anchor="middle" font-size="10.5" fill="var(--dg-muted)">what happens to Z</text>
  <rect x="20" y="48" width="360" height="40" rx="6" fill="var(--dg-surface)" stroke="var(--dg-line-soft)" stroke-width="1.1"/>
  <text x="200" y="73" text-anchor="middle" font-size="11" fill="var(--dg-text)">EPSG:6339  →  EPSG:6318</text>
  <rect x="400" y="48" width="300" height="40" rx="6" fill="var(--dg-e-soft)" stroke="var(--dg-e)" stroke-width="1.2"/>
  <text x="550" y="73" text-anchor="middle" font-size="11" fill="var(--dg-text)">unchanged — no vertical axis declared</text>
  <rect x="20" y="96" width="360" height="40" rx="6" fill="var(--dg-surface)" stroke="var(--dg-line-soft)" stroke-width="1.1"/>
  <text x="200" y="121" text-anchor="middle" font-size="11" fill="var(--dg-text)">EPSG:6339+5703  →  EPSG:6318</text>
  <rect x="400" y="96" width="300" height="40" rx="6" fill="var(--dg-e-soft)" stroke="var(--dg-e)" stroke-width="1.2"/>
  <text x="550" y="121" text-anchor="middle" font-size="11" fill="var(--dg-text)">unchanged — the target has no vertical</text>
  <rect x="20" y="144" width="360" height="40" rx="6" fill="var(--dg-surface)" stroke="var(--dg-line-soft)" stroke-width="1.1"/>
  <text x="200" y="169" text-anchor="middle" font-size="11" fill="var(--dg-text)">EPSG:6339+5703  →  EPSG:6318+4979</text>
  <rect x="400" y="144" width="300" height="40" rx="6" fill="var(--dg-c-soft)" stroke="var(--dg-c)" stroke-width="1.2"/>
  <text x="550" y="169" text-anchor="middle" font-size="11" fill="var(--dg-text)">moves — if the geoid grid is installed</text>
  <rect x="20" y="192" width="360" height="40" rx="6" fill="var(--dg-surface)" stroke="var(--dg-line-soft)" stroke-width="1.1"/>
  <text x="200" y="217" text-anchor="middle" font-size="11" fill="var(--dg-text)">the same, with PROJ_DATA unset</text>
  <rect x="400" y="192" width="300" height="40" rx="6" fill="var(--dg-e-soft)" stroke="var(--dg-e)" stroke-width="1.2"/>
  <text x="550" y="217" text-anchor="middle" font-size="11" fill="var(--dg-text)">unchanged — grid missing, null transform</text>
</svg>

**The null transform is not an error.** PROJ prefers a lower-accuracy operation over failing, so a missing grid produces a run that succeeds and does nothing. The assertion in the example exists precisely because the exit code will not tell you.

**Vertical units and horizontal units differ more often than you expect.** US state plane systems in survey feet with NAVD88 heights in metres are common. Check both axes of the compound CRS, not just the horizontal one.

**Containers lose grids.** An image that works on your laptop may not carry `proj-data`; the [Docker containers](https://www.pythonlidar.com/batch-automation-cloud-integration/pdal-docker-containers/) guide covers pinning the whole native stack so this cannot drift.

## Frequently Asked Questions

**Why did my reprojection leave Z unchanged?**

Almost certainly because one of the two CRSs had no vertical component. A code like EPSG:6318 describes only the horizontal system, so PDAL transforms X and Y and passes Z through. Use compound codes on both sides, such as EPSG:6339+5703 to EPSG:6318+4979.

**How do I know the geoid grid is installed?**

Run projinfo between the source and target codes and read the candidate operations. If the only candidate is a null transformation, or the output names a missing grid file, the shift will not happen. Setting PROJ_NETWORK=ON lets PROJ fetch the grid at run time instead.

**Can I just add a constant offset instead?**

Only if the tile is small and the accuracy requirement is loose. Geoid separation varies across the ground, often by more than a metre within a kilometre, so a constant offset reproduces the mean and leaves a tilted error surface behind.

**What if nobody knows what the source Z means?**

Stop and find out. The difference between ellipsoidal and orthometric heights is tens of metres, and no pipeline configuration recovers from guessing wrong. The survey report, the acquisition contract or the data provider will say; the LAS header usually will not.

---

## Related

- [Spatial Reprojection](https://www.pythonlidar.com/pdal-pipeline-architecture-execution/spatial-reprojection/) — the parent guide to horizontal transformation and CRS handling
- [Reprojecting Point Clouds from UTM to WGS84](https://www.pythonlidar.com/pdal-pipeline-architecture-execution/spatial-reprojection/reprojecting-point-clouds-from-utm-to-wgs84/) — the horizontal case, worked end to end
- [Coordinate Reference Systems](https://www.pythonlidar.com/point-cloud-data-standards-fundamentals/coordinate-reference-systems/) — where a CRS is recorded in a LAS file and how PDAL resolves it
- [Fixing CRS Mismatches in Point Clouds](https://www.pythonlidar.com/point-cloud-data-standards-fundamentals/coordinate-reference-systems/fixing-crs-mismatches-in-point-clouds/) — diagnosing an offset before assuming it is vertical
- [PDAL Pipeline Architecture and Execution](https://www.pythonlidar.com/pdal-pipeline-architecture-execution/) — the section overview
