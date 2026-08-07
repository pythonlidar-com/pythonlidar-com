---
title: "Canopy Height Models with filters.hag_nn"
description: "Producing a canopy height model in the point domain: classify ground, compute height above ground per return with filters.hag_nn, then rasterize once — with the checks that catch an inflated surface."
slug: "canopy-height-models"
type: "topic"
breadcrumb: "Canopy Height Models"
datePublished: "2026-08-07"
dateModified: "2026-08-07"
---

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Article",
      "headline": "Canopy Height Models with filters.hag_nn",
      "description": "Producing a canopy height model in the point domain: classify ground, compute height above ground per return with filters.hag_nn, then rasterize once \u2014 with the checks that catch an inflated surface.",
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
          "name": "Ground Filtering and DTM/DSM Generation with PDAL",
          "item": "https://www.pythonlidar.com/ground-filtering-dtm-dsm-generation/"
        },
        {
          "@type": "ListItem",
          "position": 3,
          "name": "Canopy Height Models",
          "item": "https://www.pythonlidar.com/ground-filtering-dtm-dsm-generation/canopy-height-models/"
        }
      ]
    },
    {
      "@type": "HowTo",
      "name": "Build a canopy height model with filters.hag_nn",
      "step": [
        {
          "@type": "HowToStep",
          "name": "Remove blunders before classifying",
          "text": "Run outlier removal first so a low noise point cannot become the nearest ground neighbour."
        },
        {
          "@type": "HowToStep",
          "name": "Classify ground for the vegetation",
          "text": "Use a ground filter tuned for canopy, restricted to last and only returns."
        },
        {
          "@type": "HowToStep",
          "name": "Compute height above ground",
          "text": "Run filters.hag_nn with a count of about six neighbours and extrapolation disabled."
        },
        {
          "@type": "HowToStep",
          "name": "Keep the normalised cloud",
          "text": "Write HeightAboveGround as an extra dimension so the cloud can answer later questions without recomputation."
        },
        {
          "@type": "HowToStep",
          "name": "Rasterize the height dimension",
          "text": "Use writers.gdal with dimension set to HeightAboveGround and output_type max."
        }
      ]
    },
    {
      "@type": "FAQPage",
      "mainEntity": [
        {
          "@type": "Question",
          "name": "Why compute height above ground per point instead of subtracting rasters?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Resolution. Raster subtraction inherits the cell size of both inputs, so anything narrower than a cell is generalised away before the arithmetic starts. Computing height per return keeps every point\u2019s own height and defers generalisation to a single rasterization at the end."
          }
        },
        {
          "@type": "Question",
          "name": "Why is my canopy height model systematically too tall?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Almost always because the ground surface sits below the true ground. A single low blunder that survived into the ground class becomes the nearest ground neighbour for its whole neighbourhood, and every height there is inflated by the blunder\u2019s depth. Run outlier removal before classification."
          }
        },
        {
          "@type": "Question",
          "name": "Should I allow extrapolation?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Usually not. Where a point has no ground neighbours within reach \u2014 the middle of a large closed-canopy patch \u2014 extrapolating invents a ground surface from distant points and produces a plausible-looking number with no support. Leaving the gap visible is more useful than filling it convincingly."
          }
        },
        {
          "@type": "Question",
          "name": "Why does my CHM look exactly like a DSM?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Because the writer rasterized Z. Setting dimension to HeightAboveGround on writers.gdal is what makes the raster a height model; without it the output is elevations above sea level and looks entirely reasonable."
          }
        }
      ]
    }
  ]
}
</script>

A digital surface model tells you how high something is above sea level. A canopy height model tells you how tall it is — and almost every question about vegetation, from biomass to fuel loading to whether a tree will reach a power line, is a question about the second. Getting there means subtracting the ground from the surface, and PDAL offers two routes: raster arithmetic on a DSM and a DTM, or `filters.hag_nn`, which computes a height above ground for every point before any rasterization happens. This topic belongs to [Ground Filtering and DTM/DSM Generation with PDAL](https://www.pythonlidar.com/ground-filtering-dtm-dsm-generation/).

The point-domain route is the better one, and the reason is resolution. Raster subtraction inherits the cell size of both inputs, so a canopy gap narrower than a cell disappears before the arithmetic starts. Computing height above ground per point keeps every return's own height, and you rasterize once, at the end, from a cloud that already knows how tall everything is. That also makes the result reusable: the same normalised cloud answers "how tall" and "how many returns above two metres" without recomputation.

<svg viewBox="0 0 720 268" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Raster subtraction against per-point height above ground for producing a canopy height model" style="width:100%;max-width:720px;display:block;margin:1.6rem auto">
  <title>Two routes to a canopy height model</title>
  <desc>Above, the raster route: rasterize a DSM, rasterize a DTM, subtract cell by cell. Both inputs are already generalised to the grid, so features narrower than a cell are gone before the subtraction. Below, the point route: compute height above ground for every return with filters.hag_nn, then rasterize once. Every return keeps its own height and the normalised cloud can answer other questions later.</desc>
  <defs><marker id="chm-arw" markerWidth="9" markerHeight="7" refX="9" refY="3.5" orient="auto"><path d="M0,0 L0,7 L9,3.5 z" fill="var(--dg-line)"/></marker></defs>
  <rect x="0" y="0" width="720" height="268" fill="var(--dg-bg)" rx="10"/>
  <text x="20" y="36" font-size="11.5" font-weight="600" fill="var(--dg-c)">raster route — two grids, then arithmetic</text>
  <rect x="20" y="48" width="150" height="44" rx="7" fill="var(--dg-c-soft)" stroke="var(--dg-c)" stroke-width="1.3"/>
  <text x="95" y="75" text-anchor="middle" font-size="10.5" fill="var(--dg-text)">DSM at 1 m</text>
  <rect x="200" y="48" width="150" height="44" rx="7" fill="var(--dg-c-soft)" stroke="var(--dg-c)" stroke-width="1.3"/>
  <text x="275" y="75" text-anchor="middle" font-size="10.5" fill="var(--dg-text)">DTM at 1 m</text>
  <line x1="350" y1="70" x2="386" y2="70" stroke="var(--dg-line)" stroke-width="1.5" marker-end="url(#chm-arw)"/>
  <rect x="392" y="48" width="150" height="44" rx="7" fill="var(--dg-c-soft)" stroke="var(--dg-c)" stroke-width="1.3"/>
  <text x="467" y="75" text-anchor="middle" font-size="10.5" fill="var(--dg-text)">subtract</text>
  <text x="556" y="66" font-size="10.5" fill="var(--dg-e)">both inputs already generalised;</text>
  <text x="556" y="82" font-size="10.5" fill="var(--dg-e)">sub-cell detail is gone</text>
  <text x="20" y="144" font-size="11.5" font-weight="600" fill="var(--dg-d)">point route — normalise, then rasterize once</text>
  <rect x="20" y="156" width="150" height="44" rx="7" fill="var(--dg-d-soft)" stroke="var(--dg-d)" stroke-width="1.3"/>
  <text x="95" y="183" text-anchor="middle" font-size="10.5" fill="var(--dg-text)">classify ground</text>
  <line x1="170" y1="178" x2="194" y2="178" stroke="var(--dg-line)" stroke-width="1.5" marker-end="url(#chm-arw)"/>
  <rect x="200" y="156" width="150" height="44" rx="7" fill="var(--dg-d-soft)" stroke="var(--dg-d)" stroke-width="1.3"/>
  <text x="275" y="177" text-anchor="middle" font-size="10.5" fill="var(--dg-text)">filters.hag_nn</text>
  <text x="275" y="193" text-anchor="middle" font-size="9" fill="var(--dg-muted)">per-point height</text>
  <line x1="350" y1="178" x2="386" y2="178" stroke="var(--dg-line)" stroke-width="1.5" marker-end="url(#chm-arw)"/>
  <rect x="392" y="156" width="150" height="44" rx="7" fill="var(--dg-d-soft)" stroke="var(--dg-d)" stroke-width="1.3"/>
  <text x="467" y="183" text-anchor="middle" font-size="10.5" fill="var(--dg-text)">rasterize max</text>
  <text x="556" y="174" font-size="10.5" fill="var(--dg-d)">every return keeps its height;</text>
  <text x="556" y="190" font-size="10.5" fill="var(--dg-d)">one generalisation, at the end</text>
  <rect x="20" y="220" width="680" height="34" rx="7" fill="var(--dg-surface)" stroke="var(--dg-line-soft)" stroke-width="1.2"/>
  <text x="36" y="242" font-size="11" fill="var(--dg-text)">the normalised cloud also answers "how many returns above 2 m" and "what is the 95th percentile height" for free</text>
</svg>

## Prerequisites

| Requirement | Detail |
|---|---|
| PDAL | 2.4+ with `filters.hag_nn` |
| A classified cloud | ground must exist as Classification 2 before HAG can be computed |
| Ground density | at least one ground return per few cells; see [ground density under canopy](https://www.pythonlidar.com/point-cloud-data-standards-fundamentals/point-density-metrics/measuring-ground-point-density-under-canopy/) |
| Projected metric CRS | heights and cell sizes must share units |
| Memory | `hag_nn` builds a spatial index over the ground points and does not stream |

## Core Workflow Architecture

1. **Classify ground.** `filters.smrf` or `filters.pmf`, tuned for the vegetation — the whole model rests on this, and an error here propagates to every canopy height.
2. **Build the ground index.** `filters.hag_nn` collects the ground-classified points into a nearest-neighbour structure.
3. **Interpolate a ground elevation per point.** For each non-ground point, the filter averages the elevations of its `count` nearest ground neighbours.
4. **Subtract.** `HeightAboveGround` is written as a new dimension: the point's Z minus that interpolated ground.
5. **Decide about extrapolation.** Where a point has no ground neighbours within reach, the filter either extrapolates or writes zero, depending on `allow_extrapolation`.
6. **Rasterize.** `writers.gdal` with `output_type: "max"` over `HeightAboveGround` produces the canopy height model.

## Full Implementation

```python
"""Produce a canopy height model through the point domain."""
from __future__ import annotations

import json
import logging
from pathlib import Path

import numpy as np
import pdal

LOG = logging.getLogger("chm")


def build_chm(src: Path, chm: Path, normalised: Path, resolution: float = 1.0) -> dict:
    spec = json.dumps({"pipeline": [
        {"type": "readers.las", "filename": str(src)},
        # Blunders first: a single low noise point becomes a negative height
        # and, worse, can be picked up as a ground neighbour.
        {"type": "filters.outlier", "method": "statistical",
         "mean_k": 12, "multiplier": 2.5},
        {"type": "filters.range", "limits": "Classification![7:7]"},
        {"type": "filters.smrf", "window": 33, "slope": 0.2,
         "threshold": 0.6, "cell": 1.0, "returns": "last, only"},
        {"type": "filters.hag_nn", "count": 6, "allow_extrapolation": False},
        # Keep the normalised cloud: it answers more questions than the raster does.
        {"type": "writers.las", "filename": str(normalised),
         "compression": "laszip", "minor_version": 4, "dataformat_id": 6,
         "extra_dims": "HeightAboveGround=float", "forward": "all"},
        {"type": "writers.gdal", "filename": str(chm),
         "dimension": "HeightAboveGround", "output_type": "max",
         "resolution": resolution, "window_size": 3, "nodata": -9999,
         "gdaldriver": "GTiff"},
    ]})
    written = pdal.Pipeline(spec).execute()
    LOG.info("wrote %d points and a %.1f m CHM", written, resolution)
    return {"points": written, "chm": str(chm), "normalised": str(normalised)}


def audit(normalised: Path) -> dict:
    p = pdal.Pipeline(json.dumps({"pipeline": [
        {"type": "readers.las", "filename": str(normalised)}]}))
    p.execute()
    hag = p.arrays[0]["HeightAboveGround"]
    return {
        "min": round(float(hag.min()), 2),
        "p99": round(float(np.percentile(hag, 99)), 2),
        "max": round(float(hag.max()), 2),
        "negative_fraction": round(float((hag < -0.5).mean()), 5),
    }


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    build_chm(Path("forest.laz"), Path("chm.tif"), Path("forest_hag.laz"))
    print(json.dumps(audit(Path("forest_hag.laz")), indent=2))
```

## Code Breakdown

**Outlier removal comes before classification, not after.** A low blunder that survives into the ground class becomes the nearest ground neighbour for everything around it, and every canopy height in that neighbourhood is inflated by the blunder's depth.

**`returns: "last, only"` on the classifier.** Under canopy the ground is reconstructed from the returns that penetrated, which is the point made at length in [tuning SMRF for forested terrain](https://www.pythonlidar.com/ground-filtering-dtm-dsm-generation/smrf-ground-classification/tuning-smrf-for-forested-terrain/).

**`count: 6` rather than 1.** Averaging six ground neighbours smooths the interpolated surface. A count of one makes every canopy height depend on a single ground return, and that return's own error appears in the result at full amplitude.

**`allow_extrapolation: False` is a deliberate, conservative choice.** Where no ground neighbours are within reach — the middle of a large closed-canopy patch — extrapolating invents a ground surface from distant points. Writing zero instead makes the gap visible rather than plausible.

**The normalised cloud is written as well as the raster.** It is the reusable artefact; the CHM is one view of it.

## Parameter Reference Table

| Parameter | Stage | Default | Effect |
|---|---|---|---|
| `count` | `filters.hag_nn` | 1 | Ground neighbours averaged per point; 4–8 smooths sensibly |
| `allow_extrapolation` | `filters.hag_nn` | false | Whether to estimate ground beyond the ground points' hull |
| `max_distance` | `filters.hag_nn` | — | Cap on neighbour search distance, in CRS units |
| `dimension` | `writers.gdal` | Z | Set to `HeightAboveGround` or the raster is a DSM again |
| `output_type` | `writers.gdal` | — | `max` for canopy top; `mean` for a smoother crown surface |
| `window_size` | `writers.gdal` | 0 | Focal fill for empty cells; 3 is a reasonable default |

## Validation and Integrity Checks

**Ground points have height zero.** By construction, every Classification 2 point should have a `HeightAboveGround` within a few centimetres of zero. A systematic offset means the interpolation is wrong.

```python
ground = arr[arr["Classification"] == 2]["HeightAboveGround"]
assert abs(float(np.median(ground))) < 0.10, "ground is not at zero — check the classifier"
```

**Negative heights are rare.** A small number is normal — interpolation noise around breaklines. More than a fraction of a percent below −0.5 m means blunders survived into the ground class.

**The maximum is physically plausible.** Compare the 99th percentile against the tallest species in the area. A CHM with 60 m trees in a region whose canopy tops out at 35 m is reporting noise.

**Open ground is near zero.** Sample cells known to be a field or a car park; the CHM should read close to zero there, and a non-zero floor across open ground indicates a ground surface sitting below the true one.

<svg viewBox="0 0 720 258" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Distribution of height above ground across a forested tile with the diagnostic regions marked" style="width:100%;max-width:720px;display:block;margin:1.6rem auto">
  <title>What a healthy height-above-ground histogram looks like</title>
  <desc>A histogram of height above ground across a forested tile. A tall spike sits at zero, which is the ground class. A broad mode between fifteen and twenty-eight metres is the canopy. Between them a shallow understory shoulder. Two regions are marked as diagnostics: any substantial mass below zero means blunders survived into the ground class, and mass above forty metres means noise rather than trees.</desc>
  <rect x="0" y="0" width="720" height="258" fill="var(--dg-bg)" rx="10"/>
  <rect x="86" y="188" width="26" height="14" fill="var(--dg-e-soft)" stroke="var(--dg-e)" stroke-width="1"/>
  <rect x="114" y="52" width="26" height="150" fill="var(--dg-d-soft)" stroke="var(--dg-d)" stroke-width="1"/>
  <rect x="142" y="150" width="26" height="52" fill="var(--dg-a-soft)" stroke="var(--dg-a)" stroke-width="1"/>
  <rect x="170" y="168" width="26" height="34" fill="var(--dg-a-soft)" stroke="var(--dg-a)" stroke-width="1"/>
  <rect x="198" y="176" width="26" height="26" fill="var(--dg-a-soft)" stroke="var(--dg-a)" stroke-width="1"/>
  <rect x="226" y="180" width="26" height="22" fill="var(--dg-a-soft)" stroke="var(--dg-a)" stroke-width="1"/>
  <rect x="254" y="176" width="26" height="26" fill="var(--dg-a-soft)" stroke="var(--dg-a)" stroke-width="1"/>
  <rect x="282" y="166" width="26" height="36" fill="var(--dg-a-soft)" stroke="var(--dg-a)" stroke-width="1"/>
  <rect x="310" y="146" width="26" height="56" fill="var(--dg-a-soft)" stroke="var(--dg-a)" stroke-width="1"/>
  <rect x="338" y="122" width="26" height="80" fill="var(--dg-a-soft)" stroke="var(--dg-a)" stroke-width="1"/>
  <rect x="366" y="102" width="26" height="100" fill="var(--dg-a-soft)" stroke="var(--dg-a)" stroke-width="1"/>
  <rect x="394" y="94" width="26" height="108" fill="var(--dg-a-soft)" stroke="var(--dg-a)" stroke-width="1"/>
  <rect x="422" y="106" width="26" height="96" fill="var(--dg-a-soft)" stroke="var(--dg-a)" stroke-width="1"/>
  <rect x="450" y="130" width="26" height="72" fill="var(--dg-a-soft)" stroke="var(--dg-a)" stroke-width="1"/>
  <rect x="478" y="158" width="26" height="44" fill="var(--dg-a-soft)" stroke="var(--dg-a)" stroke-width="1"/>
  <rect x="506" y="182" width="26" height="20" fill="var(--dg-a-soft)" stroke="var(--dg-a)" stroke-width="1"/>
  <rect x="534" y="194" width="26" height="8" fill="var(--dg-a-soft)" stroke="var(--dg-a)" stroke-width="1"/>
  <rect x="562" y="198" width="26" height="4" fill="var(--dg-e-soft)" stroke="var(--dg-e)" stroke-width="1"/>
  <line x1="86" y1="202" x2="640" y2="202" stroke="var(--dg-line)" stroke-width="1.5"/>
  <text x="127" y="44" text-anchor="middle" font-size="10" fill="var(--dg-d)">ground</text>
  <text x="400" y="80" text-anchor="middle" font-size="10.5" fill="var(--dg-a)">canopy mode, 15–28 m</text>
  <text x="86" y="228" font-size="10" fill="var(--dg-e)">below 0 — blunders in ground</text>
  <text x="640" y="228" text-anchor="end" font-size="10" fill="var(--dg-e)">above 40 m — noise, not trees</text>
  <text x="86" y="248" font-size="10.5" fill="var(--dg-muted)">the two red regions are the whole quality check, and both are one line of NumPy</text>
</svg>

## Performance Tuning

`filters.hag_nn` is the expensive stage, and its cost is a spatial search per non-ground point against a structure built from the ground points. Three levers matter.

**Reduce the non-ground point count first.** Elevation limits and a crop cost almost nothing and shrink the number of searches directly — the ordering argument made in [reordering PDAL stages for speed](https://www.pythonlidar.com/pdal-pipeline-architecture-execution/pdal-stage-chaining/reordering-pdal-stages-for-speed/).

**Keep `count` modest.** Six neighbours is roughly six times the search work of one. Beyond about eight the surface stops getting smoother and the runtime keeps rising.

**Set `max_distance`.** Without it, a point over a large ground-free area searches unboundedly far. With it, the search terminates and the point is left unhandled, which is both faster and more honest.

The stage does not stream, so peak memory holds the whole cloud plus the ground index. On large tiles the [split-pass pattern](https://www.pythonlidar.com/pdal-pipeline-architecture-execution/streaming-mode-execution/splitting-a-blocking-pipeline-into-two-passes/) applies: stream the reduction, run HAG on the reduced cloud, stream the write.

## What a Canopy Height Model Is and Is Not

A CHM is a raster of height above the terrain, and the distance between that sentence and the questions people ask of it accounts for most of the disappointment in vegetation work.

**It is not a tree height map.** A cell holds the tallest return that fell in it, which for a cell straddling two crowns is the taller of the two, and for a cell between crowns is a branch tip or a patch of understory. Individual tree height needs the crowns delineated first, which is a separate operation on top of the CHM rather than a reading of it.

**It is not a measure of the true treetop either.** A laser pulse strikes somewhere on the upper crown, rarely the apex. Airborne LiDAR under-measures individual tree height by a metre or two as a rule, and the bias grows with narrower crowns and lower pulse density. For relative comparisons across a block this hardly matters; for a stand table checked against field measurements it matters a great deal, and the usual remedy is a locally calibrated offset rather than a change of processing.

**It is not comparable across acquisitions unless both were normalised the same way.** Two CHMs of the same forest, one built at 0.5 m from a 20 pts/m² flight and one at 2 m from an 8 pts/m² flight, will disagree systematically — the coarser one lower, because a larger cell is more likely to include a gap. Change detection between epochs requires matching cell sizes and comparable densities, and where those differ the difference has to be modelled rather than ignored.

**It is a superb relative measure.** Where the canopy is tall, where it is short, where a gap has opened since the last flight, how fuel load varies across a slope — the CHM answers all of these well, because the systematic biases affect the whole raster nearly equally and cancel in comparison.

## Products Derived from the Normalised Cloud

Writing the normalised cloud rather than only the raster is what makes the rest of this cheap. Once every return carries a `HeightAboveGround`, several standard products are one more pass each, with no reclassification and no second ground filter.

**Canopy cover** is the fraction of first returns above a height threshold, typically two metres, per cell. It is a `filters.range` on `HeightAboveGround` and `ReturnNumber` followed by a `count` raster, divided by an unfiltered count raster.

**Height percentiles** — the 25th, 75th and 95th percentile height per cell — are the standard predictors in area-based biomass models. They come from the same normalised cloud with a percentile reducer, and because they are computed from the point distribution rather than from a surface they are far more robust to gaps than the CHM itself.

**Understory density** is the count of returns between, say, 0.5 and 3 metres, which is directly interesting for fuel modelling and for habitat work, and impossible to recover from a CHM because the CHM kept only the maximum.

**Vertical profiles** for a stand come from histogramming `HeightAboveGround` over an area of interest, which is one NumPy call against the normalised cloud.

All four share the same ground classification, so they are internally consistent by construction — a property that is easy to lose when each product is built by a separate pipeline that classifies ground its own way.

<svg viewBox="-2 30 724 243" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Four products derived from one normalised point cloud" style="width:100%;max-width:720px;display:block;margin:1.6rem auto">
  <title>Why the normalised cloud is the real artefact</title>
  <desc>Four standard products, all from the same cloud of returns carrying HeightAboveGround. The canopy height model is the maximum per cell. Canopy cover is the share of first returns above two metres. Height percentiles feed area-based biomass models. Understory density counts returns between half a metre and three metres, which the height model discarded.</desc>
  <rect x="-2" y="30" width="724" height="243" fill="var(--dg-bg)" rx="10"/>
  <rect x="20" y="52" width="280" height="38" rx="6" fill="var(--dg-surface)" stroke="var(--dg-line-soft)" stroke-width="1.2"/>
  <text x="160" y="75" text-anchor="middle" font-size="11" fill="var(--dg-text)">canopy height model</text>
  <rect x="320" y="52" width="380" height="38" rx="6" fill="var(--dg-a-soft)" stroke="var(--dg-a)" stroke-width="1.2"/>
  <text x="510" y="75" text-anchor="middle" font-size="11" fill="var(--dg-text)">max HeightAboveGround per cell</text>
  <rect x="20" y="100" width="280" height="38" rx="6" fill="var(--dg-surface)" stroke="var(--dg-line-soft)" stroke-width="1.2"/>
  <text x="160" y="123" text-anchor="middle" font-size="11" fill="var(--dg-text)">canopy cover</text>
  <rect x="320" y="100" width="380" height="38" rx="6" fill="var(--dg-a-soft)" stroke="var(--dg-a)" stroke-width="1.2"/>
  <text x="510" y="123" text-anchor="middle" font-size="11" fill="var(--dg-text)">first returns above 2 m ÷ all first returns</text>
  <rect x="20" y="148" width="280" height="38" rx="6" fill="var(--dg-surface)" stroke="var(--dg-line-soft)" stroke-width="1.2"/>
  <text x="160" y="171" text-anchor="middle" font-size="11" fill="var(--dg-text)">height percentiles</text>
  <rect x="320" y="148" width="380" height="38" rx="6" fill="var(--dg-a-soft)" stroke="var(--dg-a)" stroke-width="1.2"/>
  <text x="510" y="171" text-anchor="middle" font-size="11" fill="var(--dg-text)">p25, p75, p95 per cell — biomass predictors</text>
  <rect x="20" y="196" width="280" height="38" rx="6" fill="var(--dg-surface)" stroke="var(--dg-line-soft)" stroke-width="1.2"/>
  <text x="160" y="219" text-anchor="middle" font-size="11" fill="var(--dg-text)">understory density</text>
  <rect x="320" y="196" width="380" height="38" rx="6" fill="var(--dg-a-soft)" stroke="var(--dg-a)" stroke-width="1.2"/>
  <text x="510" y="219" text-anchor="middle" font-size="11" fill="var(--dg-text)">count of returns between 0.5 m and 3 m</text>
  <text x="20" y="248" font-size="10.5" fill="var(--dg-muted)">all four share one ground classification, so they are internally consistent by construction</text>
</svg>

## Common Errors and Troubleshooting

**Every height is zero.** No points carry Classification 2, so the filter had no ground to measure against. Classification must precede HAG in the same pipeline or in an earlier one.

**Heights are systematically too tall.** A ground surface sitting below the true one, almost always from a low blunder that survived into the ground class. Run outlier removal before classifying.

**A ring of extreme heights around a clearing.** Extrapolation working as designed at the edge of the ground points' hull. Set `allow_extrapolation: False` and accept the gaps.

**The raster is a DSM, not a CHM.** `dimension` was not set on the writer, so it rasterized Z. The output looks entirely plausible and is elevations above sea level.

**Runtime is dominated by one stage.** Expected — HAG is the search. Reduce the input before it rather than tuning it.

## Frequently Asked Questions

**Why compute height above ground per point instead of subtracting rasters?**

Resolution. Raster subtraction inherits the cell size of both inputs, so anything narrower than a cell is generalised away before the arithmetic starts. Computing height per return keeps every point’s own height and defers generalisation to a single rasterization at the end.

**Why is my canopy height model systematically too tall?**

Almost always because the ground surface sits below the true ground. A single low blunder that survived into the ground class becomes the nearest ground neighbour for its whole neighbourhood, and every height there is inflated by the blunder’s depth. Run outlier removal before classification.

**Should I allow extrapolation?**

Usually not. Where a point has no ground neighbours within reach — the middle of a large closed-canopy patch — extrapolating invents a ground surface from distant points and produces a plausible-looking number with no support. Leaving the gap visible is more useful than filling it convincingly.

**Why does my CHM look exactly like a DSM?**

Because the writer rasterized Z. Setting dimension to HeightAboveGround on writers.gdal is what makes the raster a height model; without it the output is elevations above sea level and looks entirely reasonable.

---

## Related

- [Ground Filtering and DTM/DSM Generation with PDAL](https://www.pythonlidar.com/ground-filtering-dtm-dsm-generation/) — the section this workflow belongs to
- [Computing Height Above Ground with filters.hag_nn](https://www.pythonlidar.com/ground-filtering-dtm-dsm-generation/canopy-height-models/computing-height-above-ground-with-filters-hag-nn/) — the stage itself, its parameters and its failure modes
- [Rasterizing a Canopy Height Model from HAG](https://www.pythonlidar.com/ground-filtering-dtm-dsm-generation/canopy-height-models/rasterizing-a-canopy-height-model-from-hag/) — turning the normalised cloud into a raster product
- [Extracting Individual Tree Heights from a CHM](https://www.pythonlidar.com/ground-filtering-dtm-dsm-generation/canopy-height-models/extracting-individual-tree-heights-from-a-chm/) — local maxima, smoothing and what the numbers mean
- [DTM vs DSM: Which Surface Model](https://www.pythonlidar.com/ground-filtering-dtm-dsm-generation/dsm-generation/dtm-vs-dsm-which-surface-model/) — the raster route and when it is enough
- [SMRF Ground Classification](https://www.pythonlidar.com/ground-filtering-dtm-dsm-generation/smrf-ground-classification/) — the classification every canopy height rests on
