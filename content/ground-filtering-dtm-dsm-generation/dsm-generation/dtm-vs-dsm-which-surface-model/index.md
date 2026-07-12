---
title: "DTM vs DSM: Which Surface Model to Generate"
description: "When to build a bare-earth DTM versus a first-return DSM from LiDAR — how the two surfaces differ, what each is used for (hydrology vs canopy/volumetrics), and how to derive a canopy height model from both."
slug: "dtm-vs-dsm-which-surface-model"
type: "long_tail"
breadcrumb: "DTM vs DSM"
datePublished: "2024-06-26"
dateModified: "2026-07-12"
---

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Article",
      "headline": "DTM vs DSM: Which Surface Model to Generate",
      "description": "When to build a bare-earth DTM versus a first-return DSM from LiDAR — how the two surfaces differ, what each is used for (hydrology vs canopy/volumetrics), and how to derive a canopy height model from both.",
      "datePublished": "2024-06-26",
      "dateModified": "2026-07-12",
      "author": {"@type": "Organization", "name": "pythonlidar.com"}
    },
    {
      "@type": "BreadcrumbList",
      "itemListElement": [
        {"@type": "ListItem", "position": 1, "name": "Home", "item": "https://pythonlidar.com/"},
        {"@type": "ListItem", "position": 2, "name": "Ground Filtering and DTM/DSM Generation with PDAL", "item": "https://pythonlidar.com/ground-filtering-dtm-dsm-generation/"},
        {"@type": "ListItem", "position": 3, "name": "DSM Generation", "item": "https://pythonlidar.com/ground-filtering-dtm-dsm-generation/dsm-generation/"},
        {"@type": "ListItem", "position": 4, "name": "DTM vs DSM", "item": "https://pythonlidar.com/ground-filtering-dtm-dsm-generation/dsm-generation/dtm-vs-dsm-which-surface-model/"}
      ]
    },
    {
      "@type": "HowTo",
      "name": "Decide between a DTM and a DSM and derive a canopy height model",
      "step": [
        {"@type": "HowToStep", "position": 1, "name": "Name the deliverable", "text": "Decide whether the analysis needs bare earth (hydrology, contours) or the top surface (viewshed, volumetrics)."},
        {"@type": "HowToStep", "position": 2, "name": "Build the DTM", "text": "Classify ground, then rasterize classified ground with writers.gdal output_type=idw or min."},
        {"@type": "HowToStep", "position": 3, "name": "Build the DSM", "text": "Keep first returns and rasterize with writers.gdal output_type=max on the same grid."},
        {"@type": "HowToStep", "position": 4, "name": "Subtract to a CHM", "text": "Compute CHM = DSM - DTM on the aligned grids to get height above ground."}
      ]
    },
    {
      "@type": "FAQPage",
      "mainEntity": [
        {
          "@type": "Question",
          "name": "What is the core difference between a DTM and a DSM?",
          "acceptedAnswer": {"@type": "Answer", "text": "A DTM is the bare-earth surface with vegetation and structures removed — built from classified ground returns. A DSM is the top surface including canopy, roofs, and other objects — built from first returns with a maximum statistic. The DTM answers where the ground is; the DSM answers where the visible surface is."}
        },
        {
          "@type": "Question",
          "name": "Which model do I need for flood and hydrology work?",
          "acceptedAnswer": {"@type": "Answer", "text": "Use a DTM. Water flows over bare earth, so hydrological modelling, watershed delineation, and contour generation all require the ground surface with buildings and trees stripped away. A DSM would route water over rooftops and tree crowns, producing nonsense flow paths."}
        },
        {
          "@type": "Question",
          "name": "Which model do I need for canopy height or building volumes?",
          "acceptedAnswer": {"@type": "Answer", "text": "You need both. Subtract the DTM from the DSM to get a normalized surface — the canopy height model or nDSM — where each cell reports height above ground. That difference raster is what feeds tree-height estimates, biomass models, and stockpile or building volume calculations."}
        },
        {
          "@type": "Question",
          "name": "Can one pipeline produce both a DTM and a DSM?",
          "acceptedAnswer": {"@type": "Answer", "text": "Yes. Classify ground once, then branch to two writers.gdal stages — one filtering to classified ground with output_type=idw for the DTM, one filtering to first returns with output_type=max for the DSM. Writing both on an identical grid definition means they subtract cleanly into a CHM."}
        }
      ]
    }
  ]
}
</script>

# DTM vs DSM: Which Surface Model to Generate

**TL;DR:** Build a **DTM** when your analysis lives on the ground — hydrology, contours, earthwork, slope stability — because it strips vegetation and structures to bare earth. Build a **DSM** when you care about the visible top of the world — viewsheds, solar, telecom, canopy, volumetrics — because it keeps first returns at their full height. When you need height *above* ground, build both on one grid and subtract: `CHM = DSM - DTM`.

## Context and Motivation

This comparison is part of [DSM Generation from LiDAR with PDAL](/ground-filtering-dtm-dsm-generation/dsm-generation/), and it exists because the DTM-versus-DSM choice is the first fork every terrain-modelling project reaches — and the one most often gotten wrong. The two rasters look superficially similar, both being single-band elevation GeoTIFFs on the same footprint, yet they answer opposite questions and are built from disjoint subsets of the point cloud. Picking the wrong one does not throw an error; it quietly produces a hydrology model that drains across roofs or a viewshed blind to every tree.

The distinction is entirely about *which points become pixels*. A [DTM Raster Generation](/ground-filtering-dtm-dsm-generation/dtm-raster-generation/) surface consumes only points classified as ground, interpolating a smooth bare-earth sheet beneath the vegetation. A DSM consumes first returns and takes the maximum, tracing the outermost skin of canopy and structures. Everything downstream — the statistic you choose, the returns you keep, the way you fill voids — follows from that one decision. This page uses `EPSG:6350` (NAD83(2011) / Conus Albers) for the worked example so the numbers stay concrete.

<svg viewBox="0 0 760 320" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Side-by-side comparison of a DTM bare-earth surface and a DSM top surface over the same scene, with a canopy height model as their difference" style="width:100%;max-width:760px;display:block;margin:1.5rem auto">
  <title>DTM bare earth versus DSM top surface, and their difference as a canopy height model</title>
  <desc>Left panel shows a DTM: a smooth ground line beneath a tree and a building, labelled bare earth from classified ground returns. Right panel shows a DSM: a surface tracing the tree crown and roof top, labelled top surface from first returns. A lower band shows CHM equals DSM minus DTM, the height above ground.</desc>
  <defs>
    <marker id="cmp-arr" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
      <path d="M0,0 L0,6 L8,3 z" fill="currentColor" opacity="0.6"/>
    </marker>
  </defs>
  <!-- LEFT: DTM -->
  <text x="170" y="24" text-anchor="middle" font-size="13" fill="currentColor" font-weight="600">DTM</text>
  <text x="170" y="40" text-anchor="middle" font-size="10" fill="currentColor" opacity="0.6">classified ground → idw/min</text>
  <!-- tree + building outlines (faint) -->
  <path d="M150,120 Q170,80 190,120 Z" fill="none" stroke="currentColor" stroke-width="1" opacity="0.3"/>
  <rect x="230" y="110" width="60" height="60" fill="none" stroke="currentColor" stroke-width="1" opacity="0.3"/>
  <!-- bare earth line -->
  <path d="M40,175 Q170,168 300,174 T330,173" fill="none" stroke="currentColor" stroke-width="2"/>
  <text x="170" y="200" text-anchor="middle" font-size="10" fill="currentColor" opacity="0.7">bare earth (objects removed)</text>
  <!-- RIGHT: DSM -->
  <text x="590" y="24" text-anchor="middle" font-size="13" fill="currentColor" font-weight="600">DSM</text>
  <text x="590" y="40" text-anchor="middle" font-size="10" fill="currentColor" opacity="0.6">first returns → max</text>
  <path d="M430,175 Q450,170 470,172 L510,120 Q530,82 550,120 L560,150 L620,150 L620,95 L680,95 L680,175" fill="none" stroke="currentColor" stroke-width="2"/>
  <text x="590" y="200" text-anchor="middle" font-size="10" fill="currentColor" opacity="0.7">top surface (canopy + roof)</text>
  <!-- divider -->
  <line x1="380" y1="55" x2="380" y2="205" stroke="currentColor" stroke-width="1" stroke-dasharray="4 4" opacity="0.4"/>
  <!-- CHM band -->
  <rect x="120" y="240" width="520" height="52" rx="8" fill="none" stroke="currentColor" stroke-width="1.4" opacity="0.75"/>
  <text x="380" y="263" text-anchor="middle" font-size="12" fill="currentColor" font-family="monospace">CHM = DSM − DTM</text>
  <text x="380" y="281" text-anchor="middle" font-size="10" fill="currentColor" opacity="0.65">height above ground — canopy, structures</text>
  <line x1="300" y1="174" x2="335" y2="239" stroke="currentColor" stroke-width="1" opacity="0.4" marker-end="url(#cmp-arr)"/>
  <line x1="430" y1="175" x2="440" y2="239" stroke="currentColor" stroke-width="1" opacity="0.4" marker-end="url(#cmp-arr)"/>
</svg>

## The Core Distinction

| Aspect | DTM (bare earth) | DSM (top surface) |
|---|---|---|
| Points used | Classified ground (`Classification[2:2]`) | First returns (`ReturnNumber[1:1]`) |
| `writers.gdal` statistic | `idw` or `min` | `max` |
| What it represents | The ground beneath everything | The highest visible surface |
| Trees and buildings | Removed | Kept at full height |
| Prerequisite step | Ground classification (SMRF/PMF) | None — no classification needed |
| Typical uses | Hydrology, contours, earthwork, slope | Viewshed, solar, telecom, canopy, volumetrics |
| Failure if misused | Water routes over rooftops | Ground analysis blinded by canopy |

The row that matters most is the prerequisite. A DSM needs no classification at all — you keep first returns and take the maximum, which is why the [Building a DSM from First Returns](/ground-filtering-dtm-dsm-generation/dsm-generation/building-a-dsm-from-first-returns/) recipe is a three-stage pipeline. A DTM must first separate ground from non-ground using a morphological filter, which is an entire upstream workflow in its own right. That asymmetry is why teams sometimes reach for a DSM when a DTM is what they actually need: the DSM is cheaper, so it is tempting, but cheapness is not correctness.

## When to Choose Each

**Choose a DTM when the ground is the subject.** Flood inundation, watershed delineation, drainage design, cut-and-fill earthwork, road grading, slope-stability and landslide mapping, and archaeological micro-relief all operate on bare earth. Any building or tree left in the surface would deflect water, distort a contour, or hide a subtle ground feature. If the question contains the words "flow," "grade," "contour," or "excavate," you want a DTM.

**Choose a DSM when the visible surface is the subject.** Line-of-sight and viewshed studies, solar-panel siting, telecom and radar propagation, wind-turbine wake modelling, obstruction surveys near airports, and any canopy or building analysis operate on the top surface. The height of the tree, the pitch of the roof, and the sag of a wire are the signal, not noise to be removed. If the question involves "what can be seen from here" or "how tall is that," you want a DSM.

**Choose both when you need height above ground.** Canopy height, forest biomass, building heights, and stockpile or excavation volumes are all *differences* between the two surfaces. Neither raster alone answers them; the normalized surface — DSM minus DTM — does.

## Deriving a Canopy Height Model

A canopy height model (also called an nDSM, normalized DSM) is the DSM re-expressed as height above the ground rather than height above the datum. Because bare earth reads near zero after subtraction, every remaining value is the true above-ground height of whatever occupies the cell — a 24 m value is a 24 m tree, whether it stands in a valley or on a hilltop.

The one non-negotiable requirement is grid alignment. The DTM and DSM must share resolution, origin, extent, and CRS exactly; a half-cell offset produces bright and dark rings along every steep edge as mismatched pixels subtract. The safest way to guarantee alignment is to write both rasters from the same pipeline with identical `resolution`, `origin_x`, `origin_y`, and `override_srs`.

## Complete Working Example

This script classifies ground once, then produces a DTM, a DSM, and their difference CHM — all on one grid definition so they subtract without resampling. Save it as `dtm_dsm_chm.py`.

```python
#!/usr/bin/env python3
"""
dtm_dsm_chm.py
Produce a bare-earth DTM, a first-return DSM, and their difference (a canopy
height model) from a single LiDAR tile, all on one aligned grid.

Usage:
    python dtm_dsm_chm.py input_tile.laz out_prefix 1.0 6350

Requirements:
    pip install pdal rasterio numpy
    PDAL 2.5+ with filters.smrf (conda install -c conda-forge pdal python-pdal)
"""

import json
import sys

import numpy as np
import pdal
import rasterio


def _gdal_writer(filename: str, output_type: str, resolution: float, epsg: int) -> dict:
    """Shared writers.gdal config so the DTM and DSM land on an identical grid."""
    return {
        "type": "writers.gdal",
        "filename": filename,
        "gdaldriver": "GTiff",
        "output_type": output_type,
        "resolution": resolution,
        "nodata": -9999.0,
        "override_srs": f"EPSG:{epsg}",
        "data_type": "float32",
    }


def build_dtm_and_dsm(
    input_path: str,
    dtm_path: str,
    dsm_path: str,
    resolution: float,
    epsg: int,
) -> None:
    """
    Classify ground once, then rasterize a bare-earth DTM (classified ground,
    IDW-interpolated) and a first-return DSM (max) on the same grid.
    """
    pipeline_dict = {
        "pipeline": [
            {"type": "readers.las", "filename": input_path},
            # Classify ground so the DTM branch can isolate bare earth.
            {"type": "filters.smrf", "slope": 0.2, "window": 16.0, "threshold": 0.45},
            # --- DTM branch: keep classified ground, interpolate the surface ---
            {"type": "filters.range", "limits": "Classification[2:2]", "tag": "ground"},
            _gdal_writer(dtm_path, "idw", resolution, epsg),
            # --- DSM branch: return to the full set, keep first returns, take max ---
            {"type": "filters.range", "limits": "ReturnNumber[1:1]", "inputs": "readers.las"},
            _gdal_writer(dsm_path, "max", resolution, epsg),
        ]
    }
    pdal.Pipeline(json.dumps(pipeline_dict)).execute()


def build_chm(dtm_path: str, dsm_path: str, chm_path: str) -> None:
    """Subtract the DTM from the DSM to produce a canopy height model."""
    with rasterio.open(dsm_path) as dsm_src, rasterio.open(dtm_path) as dtm_src:
        if dsm_src.shape != dtm_src.shape or dsm_src.transform != dtm_src.transform:
            raise ValueError(
                "DTM and DSM grids are not aligned — cannot subtract cleanly. "
                "Rasterize both with identical resolution and origin."
            )
        dsm = dsm_src.read(1, masked=True)
        dtm = dtm_src.read(1, masked=True)
        chm = np.clip(dsm - dtm, 0.0, None)  # heights cannot be negative
        profile = dsm_src.profile

    with rasterio.open(chm_path, "w", **profile) as dst:
        dst.write(chm.filled(-9999.0).astype("float32"), 1)

    print(
        f"CHM written: max canopy/structure height = {float(chm.max()):.1f} m, "
        f"mean above-ground = {float(chm.mean()):.2f} m"
    )


def main() -> None:
    if len(sys.argv) != 5:
        print("Usage: python dtm_dsm_chm.py <in.laz> <out_prefix> <resolution> <epsg>")
        sys.exit(1)

    input_path = sys.argv[1]
    prefix = sys.argv[2]
    resolution = float(sys.argv[3])
    epsg = int(sys.argv[4])

    dtm = f"{prefix}_dtm.tif"
    dsm = f"{prefix}_dsm.tif"
    chm = f"{prefix}_chm.tif"

    print(f"Building DTM + DSM at {resolution} m (EPSG:{epsg})...")
    build_dtm_and_dsm(input_path, dtm, dsm, resolution, epsg)
    print(f"Deriving canopy height model...")
    build_chm(dtm, dsm, chm)
    print(f"Done: {dtm}, {dsm}, {chm}")


if __name__ == "__main__":
    main()
```

## Key Parameter Table

| Parameter | Stage | DTM branch | DSM branch |
|---|---|---|---|
| return/class selection | `filters.range` | `Classification[2:2]` | `ReturnNumber[1:1]` |
| `output_type` | `writers.gdal` | `idw` (fills between sparse ground) | `max` (highest first return) |
| classification prerequisite | `filters.smrf` | required | not used |
| `resolution` | `writers.gdal` | identical on both | identical on both |
| `override_srs` | `writers.gdal` | `EPSG:6350` | `EPSG:6350` |

The `idw` statistic suits the DTM because classified ground is sparse under dense canopy and inverse-distance weighting bridges the gaps smoothly; the `max` statistic suits the DSM because the top surface is defined by the tallest hit. Tuning the ground classifier itself — the `filters.smrf` slope and window above — is covered in [SMRF Ground Classification](/ground-filtering-dtm-dsm-generation/smrf-ground-classification/).

## Verification

**Confirm the DSM sits above the DTM.** After subtraction, the CHM should be non-negative almost everywhere. Cells where the DSM fell below the DTM indicate misalignment or ground points misclassified as high — the `np.clip` floor hides the symptom, so inspect the raw difference during development.

```python
import rasterio, numpy as np
with rasterio.open("out_dsm.tif") as d, rasterio.open("out_dtm.tif") as g:
    diff = d.read(1, masked=True) - g.read(1, masked=True)
    below = int((diff < -0.5).sum())
    print(f"cells where DSM < DTM by >0.5 m: {below:,}")
```

**Sanity-check the canopy statistics.** A forested tile should yield a CHM whose maximum matches the tallest trees (often 20–45 m) and whose mean sits well below that, since open ground and low vegetation pull the average down. A CHM maxing out at 2–3 m over known forest means the DSM never captured the canopy — check that first returns were populated.

## Gotchas and Edge Cases

**1. Misaligned grids ruin the CHM.** The single most common failure is subtracting a DTM and DSM that were rasterized separately with different origins. Always write both from one pipeline, or resample one onto the other's grid with `rasterio.warp.reproject` before subtracting.

**2. Buildings inflate a "canopy" height model.** An nDSM does not know a roof from a tree — both are above-ground objects. If you want vegetation only, mask out building-classified areas (ASPRS class 6) before or after subtraction; see [ASPRS Classification Codes](/point-cloud-data-standards-fundamentals/asprs-classification-codes/) for the class list.

**3. IDW over-smooths a DTM in steep terrain.** Inverse-distance interpolation can pull ridgelines and stream banks toward their neighbours. In rugged ground consider a finer resolution or a different interpolation, as weighed in [IDW vs Mean Interpolation for DTM Gaps](/ground-filtering-dtm-dsm-generation/dtm-raster-generation/idw-vs-mean-interpolation-for-dtm-gaps/).

**4. NoData bleeds into the difference.** If either raster has voids the CHM inherits them. Fill DTM voids first — see [Filling NoData Voids in DTM Rasters](/ground-filtering-dtm-dsm-generation/dtm-raster-generation/filling-nodata-voids-in-dtm-rasters/) — so the subtraction has valid values on both sides.

## Frequently Asked Questions

**What is the core difference between a DTM and a DSM?**

A DTM is the bare-earth surface with vegetation and structures removed — built from classified ground returns. A DSM is the top surface including canopy, roofs, and other objects — built from first returns with a maximum statistic. The DTM answers where the ground is; the DSM answers where the visible surface is.

**Which model do I need for flood and hydrology work?**

Use a DTM. Water flows over bare earth, so hydrological modelling, watershed delineation, and contour generation all require the ground surface with buildings and trees stripped away. A DSM would route water over rooftops and tree crowns, producing nonsense flow paths. The [DTM Raster Generation](/ground-filtering-dtm-dsm-generation/dtm-raster-generation/) guide covers building that surface.

**Which model do I need for canopy height or building volumes?**

You need both. Subtract the DTM from the DSM to get a normalized surface — the canopy height model or nDSM — where each cell reports height above ground. That difference raster is what feeds tree-height estimates, biomass models, and stockpile or building volume calculations. The [DSM Generation](/ground-filtering-dtm-dsm-generation/dsm-generation/) page details the top-surface half of that pair.

**Can one pipeline produce both a DTM and a DSM?**

Yes. Classify ground once, then branch to two `writers.gdal` stages — one filtering to classified ground with `output_type=idw` for the DTM, one filtering to first returns with `output_type=max` for the DSM. Writing both on an identical grid definition means they subtract cleanly into a CHM, as the complete example above demonstrates.

---

## Related

- [DSM Generation from LiDAR with PDAL](/ground-filtering-dtm-dsm-generation/dsm-generation/) — the top-surface workflow in full
- [DTM Raster Generation](/ground-filtering-dtm-dsm-generation/dtm-raster-generation/) — the bare-earth workflow this page compares against
- [Building a DSM from First Returns](/ground-filtering-dtm-dsm-generation/dsm-generation/building-a-dsm-from-first-returns/) — the focused first-return recipe for the DSM half
- [SMRF Ground Classification](/ground-filtering-dtm-dsm-generation/smrf-ground-classification/) — classifying ground, the prerequisite the DTM depends on
- [Ground Filtering and DTM/DSM Generation with PDAL](/ground-filtering-dtm-dsm-generation/) — parent overview tying terrain and surface modelling together
