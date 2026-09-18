---
title: "Vertical Accuracy Assessment for LiDAR"
description: "Measure and report LiDAR vertical accuracy in Python: surveyed checkpoints, TIN interpolation of ground returns at each checkpoint, RMSEz, NVA and VVA, swath-to-swath relative accuracy, and the reports clients and specifications expect."
slug: "vertical-accuracy-assessment"
type: "topic"
breadcrumb: "Vertical Accuracy Assessment"
datePublished: "2026-09-18"
dateModified: "2026-09-18"
---

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Article",
      "headline": "Vertical Accuracy Assessment for LiDAR",
      "description": "Measure and report LiDAR vertical accuracy in Python: surveyed checkpoints, TIN interpolation of ground returns at each checkpoint, RMSEz, NVA and VVA, swath-to-swath relative accuracy, and the reports clients and specifications expect.",
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
          "name": "Point Cloud Data Standards & Fundamentals",
          "item": "https://www.pythonlidar.com/point-cloud-data-standards-fundamentals/"
        },
        {
          "@type": "ListItem",
          "position": 3,
          "name": "Vertical Accuracy Assessment",
          "item": "https://www.pythonlidar.com/point-cloud-data-standards-fundamentals/vertical-accuracy-assessment/"
        }
      ]
    },
    {
      "@type": "HowTo",
      "name": "Assess the vertical accuracy of a LiDAR dataset against checkpoints",
      "step": [
        {
          "@type": "HowToStep",
          "name": "Harmonize",
          "text": "Transform checkpoints into the LiDAR CRS, including the vertical datum and geoid, and record the transformation used."
        },
        {
          "@type": "HowToStep",
          "name": "Select ground near each checkpoint",
          "text": "Read class 2 points within a small radius \u2014 a few metres \u2014 of each checkpoint, using a spatial query rather than loading the whole project."
        },
        {
          "@type": "HowToStep",
          "name": "Interpolate",
          "text": "Build a local triangulation of those ground points and interpolate the LiDAR elevation at the checkpoint's X, Y."
        },
        {
          "@type": "HowToStep",
          "name": "Difference",
          "text": "Compute \u0394Z = Z_lidar \u2212 Z_checkpoint for each checkpoint, flagging those without enough nearby ground."
        },
        {
          "@type": "HowToStep",
          "name": "Summarize",
          "text": "Compute RMSEz for open terrain (non-vegetated vertical accuracy, NVA) and the 95th percentile of absolute error in vegetated terrain (vegetated vertical accuracy, VVA), plus mean error to detect bias."
        },
        {
          "@type": "HowToStep",
          "name": "Report and act",
          "text": "Compare with thresholds, examine outliers, and \u2014 if a consistent bias appears \u2014 investigate the datum chain before touching the data."
        }
      ]
    },
    {
      "@type": "FAQPage",
      "mainEntity": [
        {
          "@type": "Question",
          "name": "What is RMSEz?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "The root-mean-square of the vertical differences between LiDAR and surveyed checkpoints: square each difference, average them, take the square root. It combines random error and bias into one number in the same units as elevation."
          }
        },
        {
          "@type": "Question",
          "name": "What is the difference between NVA and VVA?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "NVA, non-vegetated vertical accuracy, is computed from checkpoints on open terrain, where errors are close to normally distributed; historically reported as 1.96 times RMSEz at 95 percent confidence. VVA, vegetated vertical accuracy, uses checkpoints under vegetation and reports the 95th percentile of absolute errors, because errors there are not normal."
          }
        },
        {
          "@type": "Question",
          "name": "How many checkpoints do I need?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Current standards generally call for at least 30 checkpoints for a meaningful RMSE, with more for large projects and distribution across the area and land cover types. Fewer checkpoints make the statistic unstable and let one bad point dominate."
          }
        },
        {
          "@type": "Question",
          "name": "Can I remove a checkpoint that has a large error?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Only with a documented reason that is independent of the error itself, such as evidence the site changed after the survey, the point sits on a wall or kerb, or the survey record is faulty. Removing checkpoints because they make the statistic worse turns an accuracy assessment into a selection exercise, and reviewers will ask for the full list."
          }
        },
        {
          "@type": "Question",
          "name": "What does relative accuracy measure that RMSEz does not?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Relative accuracy compares overlapping swaths of the same dataset with each other, measuring internal consistency between flightlines. It needs no checkpoints and covers the whole project, so it catches calibration problems between lines that a sparse checkpoint set can miss entirely."
          }
        },
        {
          "@type": "Question",
          "name": "Should I compare checkpoints with the point cloud or the DEM?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Assess the point cloud with a TIN of ground returns to measure the data itself; assess the DEM separately if it is a deliverable. The DEM adds rasterization and interpolation error on top of the point cloud's."
          }
        }
      ]
    }
  ]
}
</script>

Every LiDAR delivery ends with a question the client will ask whether or not the contract spells it out: how accurate is it? For elevation data the answer has a standard form. A set of independently surveyed checkpoints — GNSS or total-station elevations on open, hard or vegetated ground — is compared with the LiDAR surface at the same locations, and the differences are summarized as root-mean-square error in Z, with specific statistics for open terrain and for vegetation. This topic in the [Point Cloud Data Standards and Fundamentals](https://www.pythonlidar.com/point-cloud-data-standards-fundamentals/) section covers doing that assessment in Python: which surface to compare against, how to interpolate LiDAR elevations at a checkpoint, which statistics the ASPRS standards and the USGS Lidar Base Specification use, and how to check relative accuracy between overlapping swaths when checkpoints are scarce.

<svg viewBox="10 60 720 170" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="A surveyed checkpoint compared with the LiDAR ground surface interpolated at the same location" style="width:100%;max-width:740px;display:block;margin:1.6rem auto">
  <title>One checkpoint, one difference</title>
  <desc>A profile of LiDAR ground returns with a triangulated surface drawn through them. A surveyed checkpoint sits slightly above the surface. The vertical distance between the checkpoint and the surface at the same horizontal position is the error for that checkpoint, labelled delta Z. Summary statistics over all checkpoints are computed from these differences.</desc>
  <rect x="10" y="60" width="720" height="170" fill="var(--dg-bg)" rx="10"/>
  <polyline points="40,150 120,146 200,152 280,140 360,144 440,136 520,142 600,134 700,138" fill="none" stroke="var(--dg-d)" stroke-width="2"/>
  <g fill="var(--dg-d)"><circle cx="40" cy="150" r="3.5"/><circle cx="120" cy="146" r="3.5"/><circle cx="200" cy="152" r="3.5"/><circle cx="280" cy="140" r="3.5"/><circle cx="360" cy="144" r="3.5"/><circle cx="440" cy="136" r="3.5"/><circle cx="520" cy="142" r="3.5"/><circle cx="600" cy="134" r="3.5"/><circle cx="700" cy="138" r="3.5"/></g>
  <path d="M400 118 L410 100 L420 118 Z" fill="var(--dg-c)"/>
  <line x1="410" y1="118" x2="410" y2="140" stroke="var(--dg-e)" stroke-width="1.8"/>
  <text x="422" y="134" font-size="11" fill="var(--dg-e)">ΔZ = LiDAR − checkpoint</text>
  <text x="410" y="90" text-anchor="middle" font-size="10.5" fill="var(--dg-text)">surveyed checkpoint</text>
  <text x="40" y="178" font-size="10.5" fill="var(--dg-d)">LiDAR ground returns and the TIN through them</text>
  <line x1="40" y1="196" x2="700" y2="196" stroke="var(--dg-line-soft)" stroke-width="1"/>
  <text x="40" y="216" font-size="10.5" fill="var(--dg-muted)">repeat at every checkpoint; RMSEz summarizes the set</text>
</svg>

## Prerequisites

- **Checkpoints** surveyed independently of the LiDAR calibration: at least 30 is the common minimum in current standards, more for large projects, distributed across the project and across land cover types. Each needs an ID, X, Y, Z, a land-cover label (open or vegetated) and ideally a survey accuracy estimate.
- **Matching CRSs.** Checkpoints and LiDAR must share horizontal and vertical datums, units and geoid model. A 0.3 m geoid mismatch dwarfs every other error.
- **Ground-classified LiDAR** — class 2 — because checkpoints measure the bare earth.
- **Python 3.10+** with NumPy, SciPy, pandas and the PDAL bindings.
- **A reading of the specification** your delivery must meet: ASPRS Positional Accuracy Standards (the current edition reports RMSE), the USGS Lidar Base Specification (quality levels with NVA and VVA thresholds), or a client document.

## Core Workflow Architecture

1. **Harmonize.** Transform checkpoints into the LiDAR CRS, including the vertical datum and geoid, and record the transformation used.
2. **Select ground near each checkpoint.** Read class 2 points within a small radius — a few metres — of each checkpoint, using a spatial query rather than loading the whole project.
3. **Interpolate.** Build a local triangulation of those ground points and interpolate the LiDAR elevation at the checkpoint's X, Y.
4. **Difference.** Compute ΔZ = Z_lidar − Z_checkpoint for each checkpoint, flagging those without enough nearby ground.
5. **Summarize.** Compute RMSEz for open terrain (non-vegetated vertical accuracy, NVA) and the 95th percentile of absolute error in vegetated terrain (vegetated vertical accuracy, VVA), plus mean error to detect bias.
6. **Report and act.** Compare with thresholds, examine outliers, and — if a consistent bias appears — investigate the datum chain before touching the data.

<svg viewBox="0 0 740 200" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="The six steps of a vertical accuracy assessment" style="width:100%;max-width:740px;display:block;margin:1.6rem auto">
  <title>Six steps from survey to report</title>
  <desc>Six boxes in sequence: harmonize datums, select nearby ground points, interpolate by TIN, compute differences, summarize RMSEz, NVA and VVA, and report. A feedback arrow runs from the report step back to the harmonize step, labelled bias found, check the datum chain.</desc>
  <defs><marker id="vaa-arw" markerWidth="9" markerHeight="7" refX="9" refY="3.5" orient="auto"><path d="M0,0 L0,7 L9,3.5 z" fill="var(--dg-line)"/></marker></defs>
  <rect x="0" y="0" width="740" height="200" fill="var(--dg-bg)" rx="10"/>
  <g font-size="10.5" fill="var(--dg-text)">
    <rect x="16" y="60" width="104" height="50" rx="8" fill="var(--dg-a-soft)" stroke="var(--dg-a)"/><text text-anchor="middle" x="68" y="89">harmonize</text>
    <rect x="136" y="60" width="104" height="50" rx="8" fill="var(--dg-a-soft)" stroke="var(--dg-a)"/><text text-anchor="middle" x="188" y="89">select ground</text>
    <rect x="256" y="60" width="104" height="50" rx="8" fill="var(--dg-b-soft)" stroke="var(--dg-b)"/><text text-anchor="middle" x="308" y="89">interpolate</text>
    <rect x="376" y="60" width="104" height="50" rx="8" fill="var(--dg-b-soft)" stroke="var(--dg-b)"/><text text-anchor="middle" x="428" y="89">difference</text>
    <rect x="496" y="60" width="104" height="50" rx="8" fill="var(--dg-c-soft)" stroke="var(--dg-c)"/><text text-anchor="middle" x="548" y="89">summarize</text>
    <rect x="616" y="60" width="104" height="50" rx="8" fill="var(--dg-surface)" stroke="var(--dg-line)"/><text text-anchor="middle" x="668" y="89">report</text>
  </g>
  <line x1="120" y1="85" x2="132" y2="85" stroke="var(--dg-line)" stroke-width="1.3" marker-end="url(#vaa-arw)"/>
  <line x1="240" y1="85" x2="252" y2="85" stroke="var(--dg-line)" stroke-width="1.3" marker-end="url(#vaa-arw)"/>
  <line x1="360" y1="85" x2="372" y2="85" stroke="var(--dg-line)" stroke-width="1.3" marker-end="url(#vaa-arw)"/>
  <line x1="480" y1="85" x2="492" y2="85" stroke="var(--dg-line)" stroke-width="1.3" marker-end="url(#vaa-arw)"/>
  <line x1="600" y1="85" x2="612" y2="85" stroke="var(--dg-line)" stroke-width="1.3" marker-end="url(#vaa-arw)"/>
  <path d="M668 110 L668 150 L68 150 L68 114" fill="none" stroke="var(--dg-e)" stroke-width="1.4" stroke-dasharray="5 4" marker-end="url(#vaa-arw)"/>
  <text x="370" y="172" text-anchor="middle" font-size="10.5" fill="var(--dg-e)">consistent bias found → check the datum chain before editing data</text>
  <text x="16" y="40" font-size="10.5" fill="var(--dg-muted)">the loop back is the most useful part of the assessment</text>
</svg>

## Full Implementation

```python
"""Vertical accuracy of a LiDAR project against surveyed checkpoints."""
from __future__ import annotations

import json
import logging
from dataclasses import dataclass
from pathlib import Path

import numpy as np
import pandas as pd
import pdal
from scipy.spatial import Delaunay

log = logging.getLogger("vacc")


@dataclass(frozen=True)
class Settings:
    radius: float = 3.0            # m, ground search radius around each checkpoint
    min_points: int = 6            # ground points needed to interpolate
    lidar_crs: str = "EPSG:6347+5703"


def ground_near(tiles: list[Path], x: float, y: float, r: float) -> np.ndarray:
    bounds = f"([{x - r}, {x + r}], [{y - r}, {y + r}])"
    readers = [{"type": "readers.las", "filename": str(t), "tag": f"t{i}"} for i, t in enumerate(tiles)]
    spec = {"pipeline": [
        *readers,
        {"type": "filters.merge", "inputs": [rd["tag"] for rd in readers]},
        {"type": "filters.crop", "bounds": bounds},
        {"type": "filters.range", "limits": "Classification[2:2]"},
    ]}
    p = pdal.Pipeline(json.dumps(spec))
    p.execute()
    return p.arrays[0]


def tin_z(pts: np.ndarray, x: float, y: float) -> float:
    xy = np.column_stack([pts["X"], pts["Y"]])
    tri = Delaunay(xy)
    s = tri.find_simplex([[x, y]])[0]
    if s < 0:
        return float("nan")
    verts = tri.simplices[s]
    T = tri.transform[s]
    b = T[:2] @ (np.array([x, y]) - T[2])
    w = np.append(b, 1 - b.sum())
    return float(w @ pts["Z"][verts])


def tiles_for(index: pd.DataFrame, x: float, y: float, r: float) -> list[Path]:
    hit = index[(index.minx <= x + r) & (index.maxx >= x - r) &
                (index.miny <= y + r) & (index.maxy >= y - r)]
    return [Path(p) for p in hit.path]


def assess(checkpoints: pd.DataFrame, tile_index: pd.DataFrame, s: Settings = Settings()) -> pd.DataFrame:
    rows = []
    for cp in checkpoints.itertuples():
        tiles = tiles_for(tile_index, cp.x, cp.y, s.radius)
        if not tiles:
            rows.append({"id": cp.id, "status": "no tile"})
            continue
        g = ground_near(tiles, cp.x, cp.y, s.radius)
        if len(g) < s.min_points:
            rows.append({"id": cp.id, "status": f"only {len(g)} ground points"})
            continue
        z = tin_z(g, cp.x, cp.y)
        rows.append({"id": cp.id, "cover": cp.cover, "z_check": cp.z, "z_lidar": z,
                     "dz": z - cp.z, "n_ground": len(g),
                     "status": "ok" if np.isfinite(z) else "outside TIN"})
    return pd.DataFrame(rows)


def summarize(res: pd.DataFrame) -> dict:
    ok = res[res.status == "ok"]
    open_ = ok[ok.cover == "open"].dz
    veg = ok[ok.cover == "vegetated"].dz
    rmse_open = float(np.sqrt(np.mean(open_ ** 2)))
    return {
        "n_open": int(open_.size), "n_vegetated": int(veg.size),
        "mean_dz_open_m": round(float(open_.mean()), 3),
        "rmsez_open_m": round(rmse_open, 3),
        "nva_95_m": round(1.96 * rmse_open, 3),
        "vva_p95_m": round(float(np.percentile(np.abs(veg), 95)), 3) if veg.size else None,
        "rejected": int((res.status != "ok").sum()),
    }


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    cps = pd.read_csv("survey/checkpoints_navd88_m.csv")          # id, x, y, z, cover
    index = pd.read_csv("tiles/index.csv")                         # path, minx, maxx, miny, maxy
    results = assess(cps, index)
    results.to_csv("qa/checkpoint_results.csv", index=False)
    print(json.dumps(summarize(results), indent=2))
```

## Code Breakdown

**Spatial query per checkpoint.** Each checkpoint needs only a few metres of ground, so the pipeline merges the one to four tiles that touch the search box and crops immediately. On a project with thousands of tiles, this keeps an assessment of 60 checkpoints to seconds. For COPC data, put the bounds on `readers.copc` and the read itself becomes a few range requests.

**Class 2 only.** Checkpoints measure the terrain. Including vegetation or building returns in the interpolation measures the wrong surface; in vegetated terrain, it is exactly the error the VVA statistic exists to capture from ground points alone.

**TIN interpolation, not nearest neighbour.** A nearest-neighbour lookup picks one return, whose position can be a metre away on a slope; the height difference from horizontal offset alone would then masquerade as vertical error. Linear interpolation on a Delaunay triangulation of the surrounding ground estimates the surface directly above the checkpoint. The standards describe exactly this comparison. The dedicated guide on [interpolating LiDAR elevations at checkpoints](https://www.pythonlidar.com/point-cloud-data-standards-fundamentals/vertical-accuracy-assessment/interpolating-lidar-elevations-at-checkpoints/) covers edge cases.

**Barycentric weights by hand.** `Delaunay.transform` gives the affine map to barycentric coordinates for each simplex, which makes the interpolation one small matrix product and avoids building a full `LinearNDInterpolator` per checkpoint.

**Rejected checkpoints are reported, not dropped silently.** A checkpoint with no tile, too few ground points or outside the triangulation is kept in the results with its reason. Reviewers need to see which checkpoints were excluded and why.

**`ΔZ` sign convention.** LiDAR minus checkpoint: positive means the LiDAR surface is high. Stating the convention prevents a bias being "corrected" in the wrong direction.

## Parameter Reference Table

| Parameter | Type | Default | Range | Effect |
|---|---|---|---|---|
| `radius` | float, m | 3.0 | 1–10 | Ground search around each checkpoint; larger tolerates sparse ground, smooths slopes |
| `min_points` | int | 6 | 3–20 | Minimum ground returns for a trustworthy TIN |
| checkpoint count | int | ≥ 30 | project-dependent | Fewer makes RMSE unstable and outliers dominant |
| NVA factor | float | 1.96 | fixed | 95 % confidence for normally distributed errors (legacy reporting) |
| VVA statistic | percentile | 95th | fixed | Robust to non-normal vegetated errors |
| outlier screen | float, m | 3 × RMSEz | project | Checkpoints to investigate, not automatically delete |

## Validation and Integrity Checks

**Datum sanity before statistics.** Compute the mean ΔZ first. A mean of several decimetres with a small spread almost always means a geoid or vertical datum mismatch, not a data problem — see [handling vertical datum transforms in PDAL](https://www.pythonlidar.com/pdal-pipeline-architecture-execution/spatial-reprojection/handling-vertical-datum-transforms-in-pdal/).

**Distribution of errors.** Plot a histogram of open-terrain ΔZ. RMSE-based statistics assume roughly normal errors; heavy tails or bimodality point to a subset of checkpoints (a particular area, flight or survey crew) that needs attention.

**Spatial pattern.** Map ΔZ by checkpoint location. Errors that cluster by flightline suggest calibration; errors that cluster by terrain suggest classification.

<svg viewBox="0 0 740 220" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Two error histograms: a healthy one and one showing a datum bias" style="width:100%;max-width:740px;display:block;margin:1.6rem auto">
  <title>Read the histogram before the RMSE</title>
  <desc>Two histograms of checkpoint differences. The left one is centred on zero with a spread of about 6 centimetres, a healthy result. The right one has the same spread but is centred at plus 0.32 metres; its RMSE is dominated by bias, which is the signature of a geoid or vertical datum mismatch rather than poor data.</desc>
  <rect x="0" y="0" width="740" height="220" fill="var(--dg-bg)" rx="10"/>
  <text x="185" y="26" text-anchor="middle" font-size="11.5" font-weight="600" fill="var(--dg-text)">centred: mean 0.01 m</text>
  <text x="555" y="26" text-anchor="middle" font-size="11.5" font-weight="600" fill="var(--dg-text)">shifted: mean 0.32 m</text>
  <line x1="30" y1="180" x2="340" y2="180" stroke="var(--dg-line)" stroke-width="1.3"/>
  <line x1="400" y1="180" x2="710" y2="180" stroke="var(--dg-line)" stroke-width="1.3"/>
  <line x1="185" y1="40" x2="185" y2="180" stroke="var(--dg-line-soft)" stroke-width="1" stroke-dasharray="4 3"/>
  <line x1="470" y1="40" x2="470" y2="180" stroke="var(--dg-line-soft)" stroke-width="1" stroke-dasharray="4 3"/>
  <g fill="var(--dg-b-soft)" stroke="var(--dg-b)" stroke-width="1">
    <rect x="125" y="150" width="20" height="30"/><rect x="145" y="110" width="20" height="70"/><rect x="165" y="60" width="20" height="120"/><rect x="185" y="56" width="20" height="124"/><rect x="205" y="104" width="20" height="76"/><rect x="225" y="148" width="20" height="32"/>
    <rect x="560" y="150" width="20" height="30"/><rect x="580" y="110" width="20" height="70"/><rect x="600" y="60" width="20" height="120"/><rect x="620" y="56" width="20" height="124"/><rect x="640" y="104" width="20" height="76"/><rect x="660" y="148" width="20" height="32"/>
  </g>
  <text x="185" y="200" text-anchor="middle" font-size="10" fill="var(--dg-muted)">0</text>
  <text x="470" y="200" text-anchor="middle" font-size="10" fill="var(--dg-muted)">0</text>
  <text x="630" y="200" text-anchor="middle" font-size="10" fill="var(--dg-e)">+0.32</text>
  <text x="555" y="214" text-anchor="middle" font-size="10.5" fill="var(--dg-muted)">same spread, RMSE dominated by bias</text>
</svg>

```python
res = pd.read_csv("qa/checkpoint_results.csv")
ok = res[(res.status == "ok") & (res.cover == "open")]
bias, sd = ok.dz.mean(), ok.dz.std(ddof=1)
print(f"mean {bias:+.3f} m, sd {sd:.3f} m, rmse {np.sqrt((ok.dz**2).mean()):.3f} m")
if abs(bias) > 2 * sd / np.sqrt(len(ok)) and abs(bias) > 0.05:
    print("significant bias: check vertical datum, geoid model and units before anything else")
```

## Designing the Checkpoint Survey

Most accuracy disputes are settled — or caused — before any Python runs, by how the checkpoints were chosen. A few design rules make the numbers mean what everyone assumes they mean.

**Independence.** Checkpoints used to calibrate or adjust the LiDAR (control points) cannot also be used to assess it. An assessment against control measures how well the adjustment fitted, not how accurate the data is.

**Flat, open, stable sites for NVA.** Each open-terrain checkpoint should sit on ground that is level or gently sloping over several metres, away from breaklines, kerbs and walls, on a surface that will not change — compacted gravel, short grass, bare earth, asphalt. On a slope, a small horizontal error in either dataset becomes a vertical difference and inflates RMSEz for reasons that have nothing to do with the LiDAR.

**Representative vegetation for VVA.** Vegetated checkpoints should cover the vegetation types in the project in rough proportion to their area: forest, tall crops, scrub. Placing them all under light canopy makes VVA look better than the project deserves.

**Spread.** Distribute checkpoints across the whole project, not just along roads where access is easy, and include areas near swath edges and in each flight block. A simple grid-plus-jitter plan, adjusted in the field for access, beats clustering.

**Survey accuracy.** Checkpoints should be several times more accurate than the LiDAR they test. If checkpoint uncertainty is not negligible, the reported RMSE includes it; the current ASPRS edition asks for that contribution to be accounted for rather than ignored.

## Performance Tuning

Assessment is dominated by reading. Three changes keep it fast at any project size:

- **Index tiles once.** Build a CSV or GeoPackage of tile extents with [a tile index](https://www.pythonlidar.com/batch-automation-cloud-integration/tile-indexing-and-merging/building-a-tile-index-with-pdal-tindex/) and select tiles by bounding box, as `tiles_for` does. Scanning headers for every checkpoint is wasteful.
- **Use COPC where available.** A bounds query on `readers.copc` fetches only the octree nodes near each checkpoint, which turns a multi-gigabyte read into kilobytes.
- **Parallelize across checkpoints.** Each checkpoint is independent; a small process pool over checkpoints gives near-linear speed-up when data is local.

## Common Errors and Troubleshooting

**Mean ΔZ of 0.3 m or more.** A geoid model or vertical datum mismatch — NAVD88 heights compared with ellipsoidal LiDAR heights, or two different geoid models. Transform one side explicitly and rerun.

**Mean ΔZ of about 3.28× what you expect, or a factor error.** Feet versus metres in the vertical, commonly from a State Plane delivery. See [reprojecting State Plane feet to metres](https://www.pythonlidar.com/pdal-pipeline-architecture-execution/spatial-reprojection/reprojecting-state-plane-feet-to-metres/).

**A handful of very large errors.** Checkpoints on features that changed since the survey (new construction, earthworks), checkpoints under bridges or on walls, or checkpoints in areas where ground classification failed. Investigate each; do not simply drop them to improve the number.

**"only 2 ground points" for many checkpoints.** Ground density is too low around them, often under dense canopy. Increase the radius for vegetated checkpoints, or accept that they cannot be assessed and report them as such.

**Different results from vendor QA.** Vendors often compare against a DEM raster rather than a TIN of points, which adds interpolation error from the raster. Agree on the method before comparing numbers.

## Frequently Asked Questions

**What is RMSEz?**

The root-mean-square of the vertical differences between LiDAR and surveyed checkpoints: square each difference, average them, take the square root. It combines random error and bias into one number in the same units as elevation.

**What is the difference between NVA and VVA?**

NVA, non-vegetated vertical accuracy, is computed from checkpoints on open terrain, where errors are close to normally distributed; historically reported as 1.96 times RMSEz at 95 percent confidence. VVA, vegetated vertical accuracy, uses checkpoints under vegetation and reports the 95th percentile of absolute errors, because errors there are not normal.

**How many checkpoints do I need?**

Current standards generally call for at least 30 checkpoints for a meaningful RMSE, with more for large projects and distribution across the area and land cover types. Fewer checkpoints make the statistic unstable and let one bad point dominate.

**Can I remove a checkpoint that has a large error?**

Only with a documented reason that is independent of the error itself, such as evidence the site changed after the survey, the point sits on a wall or kerb, or the survey record is faulty. Removing checkpoints because they make the statistic worse turns an accuracy assessment into a selection exercise, and reviewers will ask for the full list.

**What does relative accuracy measure that RMSEz does not?**

Relative accuracy compares overlapping swaths of the same dataset with each other, measuring internal consistency between flightlines. It needs no checkpoints and covers the whole project, so it catches calibration problems between lines that a sparse checkpoint set can miss entirely.

**Should I compare checkpoints with the point cloud or the DEM?**

Assess the point cloud with a TIN of ground returns to measure the data itself; assess the DEM separately if it is a deliverable. The DEM adds rasterization and interpolation error on top of the point cloud's.

## Related

- [Computing RMSEz Against Survey Checkpoints](https://www.pythonlidar.com/point-cloud-data-standards-fundamentals/vertical-accuracy-assessment/computing-rmsez-against-survey-checkpoints/) — the core calculation step by step
- [Reporting NVA and VVA Accuracy](https://www.pythonlidar.com/point-cloud-data-standards-fundamentals/vertical-accuracy-assessment/reporting-nva-and-vva-accuracy/) — statistics and wording for deliverables
- [Measuring Swath-to-Swath Relative Accuracy](https://www.pythonlidar.com/point-cloud-data-standards-fundamentals/vertical-accuracy-assessment/measuring-swath-to-swath-relative-accuracy/) — internal consistency without checkpoints
- [Interpolating LiDAR Elevations at Checkpoints](https://www.pythonlidar.com/point-cloud-data-standards-fundamentals/vertical-accuracy-assessment/interpolating-lidar-elevations-at-checkpoints/) — TIN interpolation details
- [Coordinate Reference Systems](https://www.pythonlidar.com/point-cloud-data-standards-fundamentals/coordinate-reference-systems/) — getting both sides into one datum
