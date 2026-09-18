---
title: "Individual Tree Segmentation from LiDAR"
description: "Split a forest canopy into individual trees: local-maximum tree tops, marker-controlled watershed on a canopy height model, point-based segmentation with filters.litree, and per-tree height and crown metrics."
slug: "individual-tree-segmentation"
type: "topic"
breadcrumb: "Individual Tree Segmentation"
datePublished: "2026-09-18"
dateModified: "2026-09-18"
---

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Article",
      "headline": "Individual Tree Segmentation from LiDAR",
      "description": "Split a forest canopy into individual trees: local-maximum tree tops, marker-controlled watershed on a canopy height model, point-based segmentation with filters.litree, and per-tree height and crown metrics.",
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
          "name": "Classification & Feature Extraction",
          "item": "https://www.pythonlidar.com/lidar-classification-feature-extraction/"
        },
        {
          "@type": "ListItem",
          "position": 3,
          "name": "Individual Tree Segmentation",
          "item": "https://www.pythonlidar.com/lidar-classification-feature-extraction/individual-tree-segmentation/"
        }
      ]
    },
    {
      "@type": "HowTo",
      "name": "Individual Tree Segmentation from LiDAR",
      "step": [
        {
          "@type": "HowToStep",
          "name": "Normalize",
          "text": "Compute HeightAboveGround so crowns are measured from the local terrain."
        },
        {
          "@type": "HowToStep",
          "name": "Rasterize the canopy",
          "text": "Build a CHM with the maximum height per 0.5 m cell and fill small pits."
        },
        {
          "@type": "HowToStep",
          "name": "Smooth",
          "text": "Apply a Gaussian filter sized to the smallest crown of interest, so branch-level bumps do not become tops."
        },
        {
          "@type": "HowToStep",
          "name": "Find tops",
          "text": "Detect local maxima with a minimum separation and a minimum height, typically 2 to 5 m."
        },
        {
          "@type": "HowToStep",
          "name": "Grow crowns",
          "text": "Run a marker-controlled watershed on the inverted CHM, with tops as markers and a canopy mask to stop crowns spreading onto open ground."
        },
        {
          "@type": "HowToStep",
          "name": "Label points and measure",
          "text": "Assign each vegetation point the ID of the crown it falls in, then compute height, crown area and diameter per tree."
        }
      ]
    },
    {
      "@type": "FAQPage",
      "mainEntity": [
        {
          "@type": "Question",
          "name": "Should I segment trees from a CHM or directly from points?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Start with the CHM watershed: it is fast, easy to tune and good for dominant and co-dominant trees. Use point-based segmentation when understorey trees matter or when you need point labels for per-tree structure, and accept the extra run time."
          }
        },
        {
          "@type": "Question",
          "name": "What CHM resolution works best for tree segmentation?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Half a metre suits most forests at 10 to 30 points per square metre. Coarser grids merge small crowns; finer grids introduce pits unless density is very high. Match the cell to roughly half the radius of the smallest crown you need to detect."
          }
        },
        {
          "@type": "Question",
          "name": "How accurate is LiDAR tree height compared with field measurement?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "For matched trees the difference is usually within a metre, with LiDAR slightly lower because the laser rarely hits the exact apex. Field heights from clinometers carry their own error of similar size, so a small bias is normal and should be reported rather than hidden."
          }
        },
        {
          "@type": "Question",
          "name": "Can I get tree species from segmentation?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Not from geometry alone with any reliability. Crown shape and intensity statistics per tree can separate broad groups such as conifer and broadleaf, and a classifier trained on field-labelled trees can do better, but species usually needs spectral data as well."
          }
        }
      ]
    }
  ]
}
</script>

A forest inventory team does not want a canopy height raster; they want a table with one row per tree — location, height, crown diameter, crown area — that they can compare with plot measurements and aggregate into stems per hectare and basal-area estimates. Individual tree segmentation is the step that turns a continuous canopy into those discrete trees. It is also one of the harder problems in the [classification and feature extraction](https://www.pythonlidar.com/lidar-classification-feature-extraction/) section, because crowns touch, interlock and overlap, and there is no single geometric test that says where one tree ends and the next begins. What makes it tractable is a pair of assumptions that hold well in many forests: each tree has one highest point, and crowns fall away from it.

<svg viewBox="0 0 740 240" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Canopy profile with tree tops as local maxima and crown boundaries in the valleys" style="width:100%;max-width:740px;display:block;margin:1.6rem auto">
  <title>Tops on peaks, boundaries in valleys</title>
  <desc>A profile of a canopy height surface with four peaks. Each peak is marked as a tree top. The low points between peaks are marked as crown boundaries, which is where a watershed places its dividing lines. A small bump on the shoulder of one crown is shown as a false top that a smoothing step or a minimum distance would suppress.</desc>
  <rect x="0" y="0" width="740" height="240" fill="var(--dg-bg)" rx="10"/>
  <line x1="20" y1="210" x2="720" y2="210" stroke="var(--dg-line)" stroke-width="1.4"/>
  <path d="M30 200 Q80 130 120 70 Q150 110 190 150 Q230 100 270 50 Q310 110 350 160 Q380 150 400 136 Q420 150 440 150 Q480 90 520 80 Q560 120 600 140 Q640 100 670 90 Q700 150 720 200" fill="var(--dg-d-soft)" stroke="var(--dg-d)" stroke-width="1.6"/>
  <g fill="var(--dg-c)"><circle cx="120" cy="70" r="5"/><circle cx="270" cy="50" r="5"/><circle cx="520" cy="80" r="5"/><circle cx="670" cy="90" r="5"/></g>
  <circle cx="400" cy="136" r="5" fill="none" stroke="var(--dg-e)" stroke-width="1.6"/>
  <g stroke="var(--dg-line)" stroke-width="1.2" stroke-dasharray="4 3"><line x1="190" y1="150" x2="190" y2="210"/><line x1="350" y1="160" x2="350" y2="210"/><line x1="600" y1="140" x2="600" y2="210"/></g>
  <text x="120" y="56" text-anchor="middle" font-size="10.5" fill="var(--dg-text)">top</text>
  <text x="270" y="36" text-anchor="middle" font-size="10.5" fill="var(--dg-text)">top</text>
  <text x="520" y="66" text-anchor="middle" font-size="10.5" fill="var(--dg-text)">top</text>
  <text x="670" y="76" text-anchor="middle" font-size="10.5" fill="var(--dg-text)">top</text>
  <text x="400" y="122" text-anchor="middle" font-size="10.5" fill="var(--dg-e)">false top</text>
  <text x="270" y="228" text-anchor="middle" font-size="10.5" fill="var(--dg-muted)">dashed: crown boundaries at the valleys</text>
</svg>

## Prerequisites

- **PDAL 2.5+** for `filters.hag_nn`, `writers.gdal` and `filters.litree`, with the Python bindings.
- **Python 3.10+** with NumPy, SciPy, scikit-image (for `peak_local_max` and `watershed`), rasterio and pandas.
- **Ground classified to class 2**, so height above ground is meaningful; see [computing height above ground](https://www.pythonlidar.com/ground-filtering-dtm-dsm-generation/canopy-height-models/computing-height-above-ground-with-filters-hag-nn/).
- **A canopy height model** at 0.5 m resolution for the raster method. [Rasterizing a CHM from HAG](https://www.pythonlidar.com/ground-filtering-dtm-dsm-generation/canopy-height-models/rasterizing-a-canopy-height-model-from-hag/) builds one; a [pit-free CHM](https://www.pythonlidar.com/ground-filtering-dtm-dsm-generation/canopy-height-models/building-a-pit-free-canopy-height-model/) gives noticeably better segments.
- **Density of 10 pts/m² or more** for conifers and 20 or more for broadleaf stands. Below that, small trees are merged into their neighbours whatever the method.
- **Field plots, if you have them.** Stem maps from a handful of plots are the only honest way to tune and report detection rates.

## Core Workflow Architecture

1. **Normalize.** Compute `HeightAboveGround` so crowns are measured from the local terrain.
2. **Rasterize the canopy.** Build a CHM with the maximum height per 0.5 m cell and fill small pits.
3. **Smooth.** Apply a Gaussian filter sized to the smallest crown of interest, so branch-level bumps do not become tops.
4. **Find tops.** Detect local maxima with a minimum separation and a minimum height, typically 2 to 5 m.
5. **Grow crowns.** Run a marker-controlled watershed on the inverted CHM, with tops as markers and a canopy mask to stop crowns spreading onto open ground.
6. **Label points and measure.** Assign each vegetation point the ID of the crown it falls in, then compute height, crown area and diameter per tree.

## Full Implementation

The implementation below is the raster route — watershed on a CHM — because it is fast, robust and well understood. The point-based alternative, `filters.litree`, follows in its own section.

```python
"""Individual tree segmentation: marker-controlled watershed on a CHM."""
from __future__ import annotations

import json
import logging
from pathlib import Path

import numpy as np
import pandas as pd
import pdal
import rasterio
from scipy import ndimage as ndi
from skimage.feature import peak_local_max
from skimage.segmentation import watershed

log = logging.getLogger("trees")


def build_chm(src: Path, chm_path: Path, res: float = 0.5) -> None:
    stages = [
        {"type": "readers.las", "filename": str(src)},
        {"type": "filters.range", "limits": "Classification![7:7],Classification![18:18]"},
        {"type": "filters.hag_nn", "count": 2},
        {"type": "filters.range", "limits": "HeightAboveGround[0:70]"},
        {"type": "filters.ferry", "dimensions": "HeightAboveGround=>Z"},
        {"type": "writers.gdal", "filename": str(chm_path), "resolution": res,
         "radius": res * 1.5, "output_type": "max", "data_type": "float32",
         "nodata": -9999, "gdaldriver": "GTiff", "gdalopts": "COMPRESS=DEFLATE,TILED=YES"},
    ]
    pdal.Pipeline(json.dumps({"pipeline": stages})).execute()


def segment_crowns(chm_path: Path, labels_path: Path, min_height: float = 3.0,
                   sigma_m: float = 0.75, min_distance_m: float = 2.0) -> pd.DataFrame:
    with rasterio.open(chm_path) as ds:
        chm = ds.read(1)
        profile = ds.profile
        res = ds.res[0]
    chm = np.where(chm == -9999, 0.0, chm)
    # Close small pits so a missing return inside a crown does not split it.
    chm = ndi.grey_closing(chm, size=(3, 3))
    smooth = ndi.gaussian_filter(chm, sigma=sigma_m / res)

    tops = peak_local_max(smooth, min_distance=max(1, int(min_distance_m / res)),
                          threshold_abs=min_height, exclude_border=False)
    markers = np.zeros(chm.shape, dtype=np.int32)
    markers[tops[:, 0], tops[:, 1]] = np.arange(1, len(tops) + 1)

    canopy = smooth > (min_height * 0.66)
    labels = watershed(-smooth, markers=markers, mask=canopy)
    log.info("%d tree tops, %d labelled crowns", len(tops), labels.max())

    profile.update(dtype="int32", nodata=0)
    with rasterio.open(labels_path, "w", **profile) as out:
        out.write(labels.astype(np.int32), 1)

    ids = np.arange(1, labels.max() + 1)
    height = ndi.maximum(chm, labels, ids)
    cells = ndi.sum(np.ones_like(chm), labels, ids)
    area = cells * res * res
    rows, cols = tops[:, 0], tops[:, 1]
    x = profile["transform"].c + (cols + 0.5) * res
    y = profile["transform"].f - (rows + 0.5) * res
    return pd.DataFrame({
        "tree_id": ids, "x": x, "y": y,
        "height_m": np.round(height, 2),
        "crown_area_m2": np.round(area, 1),
        "crown_diameter_m": np.round(2 * np.sqrt(area / np.pi), 2),
    })


def run(src: Path, workdir: Path) -> pd.DataFrame:
    workdir.mkdir(parents=True, exist_ok=True)
    chm, lab = workdir / "chm.tif", workdir / "crowns.tif"
    build_chm(src, chm)
    trees = segment_crowns(chm, lab)
    trees = trees[trees.crown_area_m2 >= 1.0]
    trees.to_csv(workdir / "trees.csv", index=False)
    log.info("%d trees written", len(trees))
    return trees


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
    print(run(Path("stand_12.laz"), Path("out/stand_12")).describe())
```

## Code Breakdown

**`filters.ferry` from `HeightAboveGround` to `Z`.** `writers.gdal` rasterizes `Z` by default; ferrying the normalized height into `Z` is the simplest way to rasterize height above ground rather than elevation. The alternative is the writer's `dimension` option, which works equally well if you prefer to keep `Z` intact.

**`output_type: "max"` with a radius of 1.5 cells.** The maximum is the canopy surface; the slightly enlarged radius lets each cell see returns from its neighbours, which fills many small gaps before the explicit pit-closing step.

**Grey closing, then Gaussian smoothing.** Closing removes pits — cells where the laser went deep into the crown — that would otherwise split a crown in two. The Gaussian then suppresses branch-level bumps. `sigma_m` is expressed in metres and converted to cells so the parameter means the same thing at any resolution.

**`min_distance` for peaks.** Two tops closer than two metres are almost always the same crown in temperate forests. For dense young conifers, reduce it to 1.2 m; for large broadleaves, raise it to 3 or 4 m. A variable window that grows with height is the classic refinement and is worth adding once the basic method is tuned.

**Watershed on the inverted, masked surface.** Watershed floods basins, so inverting the CHM turns crowns into basins with tops at their bottom. The canopy mask stops crowns flowing across gaps onto bare ground, which would inflate crown areas at stand edges.

**Metrics from labels, height from the raw CHM.** Height is taken from the unsmoothed CHM, because smoothing lowers peaks by tens of centimetres. Crown diameter is reported as the diameter of a circle with the same area, the convention most inventory models expect.

<svg viewBox="0 0 740 230" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Effect of smoothing strength on the number of detected tree tops" style="width:100%;max-width:740px;display:block;margin:1.6rem auto">
  <title>Smoothing decides the tree count</title>
  <desc>A line chart of detected tree tops against Gaussian smoothing sigma for a plot with 118 field-measured trees. With no smoothing about 260 tops are detected, heavily over-segmented. The count falls steeply and crosses the field count near a sigma of 0.75 metres, then continues to fall to about 60 at 2 metres, under-segmented. A shaded band marks the useful range.</desc>
  <rect x="0" y="0" width="740" height="230" fill="var(--dg-bg)" rx="10"/>
  <line x1="80" y1="190" x2="680" y2="190" stroke="var(--dg-line)" stroke-width="1.3"/>
  <line x1="80" y1="190" x2="80" y2="24" stroke="var(--dg-line)" stroke-width="1.3"/>
  <rect x="230" y="24" width="110" height="166" fill="var(--dg-d-soft)"/>
  <line x1="80" y1="132" x2="680" y2="132" stroke="var(--dg-c)" stroke-width="1.2" stroke-dasharray="5 4"/>
  <text x="676" y="126" text-anchor="end" font-size="10.5" fill="var(--dg-c)">118 trees in the field</text>
  <polyline points="80,40 155,92 230,118 285,132 340,146 430,160 530,172 680,178" fill="none" stroke="var(--dg-a)" stroke-width="2"/>
  <g fill="var(--dg-a)"><circle cx="80" cy="40" r="3.5"/><circle cx="155" cy="92" r="3.5"/><circle cx="230" cy="118" r="3.5"/><circle cx="285" cy="132" r="3.5"/><circle cx="340" cy="146" r="3.5"/><circle cx="430" cy="160" r="3.5"/><circle cx="530" cy="172" r="3.5"/><circle cx="680" cy="178" r="3.5"/></g>
  <text x="96" y="36" font-size="10.5" fill="var(--dg-text)">over-segmented</text>
  <text x="560" y="164" font-size="10.5" fill="var(--dg-text)">under-segmented</text>
  <text x="285" y="40" text-anchor="middle" font-size="10.5" fill="var(--dg-text)">useful range</text>
  <text x="80" y="208" text-anchor="middle" font-size="10" fill="var(--dg-muted)">0</text>
  <text x="285" y="208" text-anchor="middle" font-size="10" fill="var(--dg-muted)">0.75</text>
  <text x="680" y="208" text-anchor="middle" font-size="10" fill="var(--dg-muted)">2.0</text>
  <text x="380" y="224" text-anchor="middle" font-size="10.5" fill="var(--dg-muted)">Gaussian sigma, metres (illustrative plot)</text>
</svg>

## Point-Based Segmentation with filters.litree

PDAL also ships a point-based method, `filters.litree`, an implementation of the region-growing approach of Li and colleagues (2012). It starts from the highest unlabelled point, grows a tree by adding points that are closer to it than to any competing top, and repeats. It writes a `TreeID` dimension directly onto the points, which avoids the raster step entirely and handles understorey trees under a gap better than a CHM can.

```json
{
  "pipeline": [
    "stand_12.laz",
    { "type": "filters.hag_nn", "count": 2 },
    { "type": "filters.range", "limits": "HeightAboveGround[2:70]" },
    { "type": "filters.litree", "min_points": 50, "min_height": 3.0, "radius": 100.0 },
    { "type": "writers.las", "filename": "stand_12_trees.laz",
      "minor_version": 4, "dataformat_id": 6, "extra_dims": "TreeID=uint32,HeightAboveGround=float" }
  ]
}
```

<svg viewBox="0 0 740 230" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Why a CHM hides understorey trees that a point-based method can find" style="width:100%;max-width:740px;display:block;margin:1.6rem auto">
  <title>What the raster cannot see</title>
  <desc>Two side-by-side profiles of the same stand. On the left, the canopy height model traces only the upper surface, so a small tree growing beneath a large crown is invisible and two crowns are found. On the right, the point-based method sees the returns from the small tree below the large crown and labels three trees, shown in three colours.</desc>
  <rect x="0" y="0" width="740" height="230" fill="var(--dg-bg)" rx="10"/>
  <text x="185" y="28" text-anchor="middle" font-size="12" font-weight="600" fill="var(--dg-text)">CHM watershed: 2 trees</text>
  <text x="555" y="28" text-anchor="middle" font-size="12" font-weight="600" fill="var(--dg-text)">filters.litree: 3 trees</text>
  <line x1="20" y1="200" x2="350" y2="200" stroke="var(--dg-line)" stroke-width="1.3"/>
  <line x1="390" y1="200" x2="720" y2="200" stroke="var(--dg-line)" stroke-width="1.3"/>
  <path d="M40 200 Q70 120 110 60 Q160 90 200 110 Q250 80 290 90 Q320 140 340 200" fill="var(--dg-d-soft)" stroke="var(--dg-d)" stroke-width="1.6"/>
  <g fill="var(--dg-line-soft)"><circle cx="150" cy="150" r="3"/><circle cx="160" cy="160" r="3"/><circle cx="170" cy="148" r="3"/><circle cx="162" cy="140" r="3"/></g>
  <text x="165" y="186" text-anchor="middle" font-size="10" fill="var(--dg-muted)">hidden</text>
  <g fill="var(--dg-d)"><circle cx="430" cy="140" r="3"/><circle cx="450" cy="100" r="3"/><circle cx="470" cy="70" r="3"/><circle cx="490" cy="80" r="3"/><circle cx="500" cy="110" r="3"/><circle cx="460" cy="120" r="3"/></g>
  <g fill="var(--dg-c)"><circle cx="520" cy="150" r="3"/><circle cx="530" cy="160" r="3"/><circle cx="540" cy="148" r="3"/><circle cx="532" cy="140" r="3"/></g>
  <g fill="var(--dg-a)"><circle cx="590" cy="120" r="3"/><circle cx="610" cy="100" r="3"/><circle cx="630" cy="92" r="3"/><circle cx="650" cy="100" r="3"/><circle cx="668" cy="130" r="3"/><circle cx="620" cy="130" r="3"/></g>
  <text x="535" y="186" text-anchor="middle" font-size="10" fill="var(--dg-text)">understorey tree</text>
</svg>

The trade-off is speed and tunability: litree is considerably slower on dense tiles, and it has fewer knobs than the raster route. It shines in open conifer stands with distinct crowns and is the right tool when you need point-level tree labels for later per-tree structural metrics. The guide on [segmenting trees directly from points](https://www.pythonlidar.com/lidar-classification-feature-extraction/individual-tree-segmentation/segmenting-trees-directly-from-points/) compares both on the same stand.

## Parameter Reference Table

| Parameter | Type | Default here | Valid range | Effect |
|---|---|---|---|---|
| CHM `resolution` | float, m | 0.5 | 0.25–1.0 | Finer resolves small crowns but adds pits; about half the smallest crown radius |
| `min_height` | float, m | 3.0 | 1.3–5.0 | Tops below this are ignored; 1.3 m matches breast height conventions |
| `sigma_m` | float, m | 0.75 | 0.3–2.0 | Main control over tree count; tune against field plots |
| `min_distance_m` | float, m | 2.0 | 1.0–5.0 | Minimum spacing of tops; larger for broadleaves |
| canopy mask factor | float | 0.66 | 0.3–0.9 | Fraction of `min_height` defining the crown edge |
| `filters.litree` `min_points` | int | 50 | 10–200 | Smallest tree kept by the point method |
| `filters.litree` `radius` | float, m | 100 | 20–200 | Search radius for competing tops; larger is slower |

## Validation and Integrity Checks

Tree segmentation is judged against field data, and the conventional measures are simple to compute once detected tops and field stems are matched one-to-one within a distance threshold (commonly 3 m) and a height tolerance.

- **Detection rate (recall):** matched field trees divided by all field trees.
- **Commission rate:** unmatched detected trees divided by all detected trees.
- **F-score:** the harmonic mean of recall and precision; 0.7 to 0.85 is typical for conifer stands, lower for dense broadleaf.
- **Height bias:** mean of detected minus field height for matched pairs; LiDAR usually under-estimates by 0.3 to 1 m because the laser misses the apex.

```python
from scipy.optimize import linear_sum_assignment
from scipy.spatial.distance import cdist


def match_trees(det: pd.DataFrame, field: pd.DataFrame, max_dist: float = 3.0) -> dict[str, float]:
    d = cdist(det[["x", "y"]], field[["x", "y"]])
    d[d > max_dist] = 1e6
    r, c = linear_sum_assignment(d)
    ok = d[r, c] <= max_dist
    tp = int(ok.sum())
    recall, precision = tp / len(field), tp / len(det)
    bias = float((det.height_m.to_numpy()[r[ok]] - field.height_m.to_numpy()[c[ok]]).mean())
    return {"recall": recall, "precision": precision,
            "f1": 2 * recall * precision / (recall + precision), "height_bias_m": bias}
```

## Tuning Against Field Plots

Every forest type needs its own smoothing and spacing, and the only defensible way to choose them is a small grid search against plots with mapped stems. The procedure is short enough to run for every new project.

1. Clip the CHM to each plot plus a 10 m margin, so crowns that straddle the plot boundary are segmented whole.
2. Run `segment_crowns` over a grid of `sigma_m` values (0.4 to 1.5 m in 0.1 m steps) and two or three `min_distance_m` values.
3. Keep only detected tops inside the plot boundary, and match them to field stems with `match_trees`.
4. Pick the setting with the best mean F-score across plots, not the best single plot; one plot always rewards overfitting.

Two cautions apply. Field stem maps include suppressed trees that no airborne method will detect, so decide up front whether recall is measured against all stems or against trees above a height or crown-class cutoff, and say which in the report. And plots are usually placed in accessible, homogeneous stands; if the project also covers steep or mixed stands, hold at least one plot from each back from tuning so that the reported accuracy reflects the whole area rather than the easiest part of it.

## Performance Tuning

The raster route is fast: a 1 km² tile at 0.5 m is a 2000 by 2000 array, and smoothing, peak finding and watershed together take a few seconds. The PDAL half dominates, and the usual levers apply — noise removed first, `count: 2` for HAG, and tile-level parallelism. For the point route, cut the input to vegetation above 2 m before `filters.litree`, and consider [voxel thinning](https://www.pythonlidar.com/pdal-pipeline-architecture-execution/memory-management/) of very dense crowns, because its cost grows quickly with point count per tree.

Tiles need a buffer at least one crown diameter wide — 15 to 20 m in mature forest — or every tree on a tile edge is cut in two. Keep only trees whose top falls inside the unbuffered tile, which de-duplicates cleanly across neighbours.

## Common Errors and Troubleshooting

**Far too many trees.** The CHM has pits or the smoothing is too weak. Build a pit-free CHM, increase `sigma_m`, or raise `min_distance_m`. Check a few crowns visually: if one crown holds three tops, smoothing is the fix.

**Large crowns swallowing small neighbours.** Under-segmentation in mixed stands happens when a small tree's top is lower than the saddle between it and a large neighbour. A variable smoothing window — smaller for lower canopy — or the point-based method helps.

**Crowns bleeding into clearings.** The canopy mask is missing or too permissive. Mask at two-thirds of `min_height`, or at a fixed 2 m, before running the watershed.

**Heights systematically low.** Taking height from the smoothed CHM lowers every tree. Always read heights from the raw CHM, or better, from the maximum `HeightAboveGround` of the points labelled with each tree.

**`peak_local_max` returns nothing.** The CHM nodata value was not replaced, so `-9999` dominates the array's range, or `threshold_abs` exceeds the tallest tree. Replace nodata with zero before smoothing, as the implementation does.

## Frequently Asked Questions

**Should I segment trees from a CHM or directly from points?**

Start with the CHM watershed: it is fast, easy to tune and good for dominant and co-dominant trees. Use point-based segmentation when understorey trees matter or when you need point labels for per-tree structure, and accept the extra run time.

**What CHM resolution works best for tree segmentation?**

Half a metre suits most forests at 10 to 30 points per square metre. Coarser grids merge small crowns; finer grids introduce pits unless density is very high. Match the cell to roughly half the radius of the smallest crown you need to detect.

**How accurate is LiDAR tree height compared with field measurement?**

For matched trees the difference is usually within a metre, with LiDAR slightly lower because the laser rarely hits the exact apex. Field heights from clinometers carry their own error of similar size, so a small bias is normal and should be reported rather than hidden.

**Can I get tree species from segmentation?**

Not from geometry alone with any reliability. Crown shape and intensity statistics per tree can separate broad groups such as conifer and broadleaf, and a classifier trained on field-labelled trees can do better, but species usually needs spectral data as well.

## Related

- [Segmenting Trees with a Watershed on a CHM](https://www.pythonlidar.com/lidar-classification-feature-extraction/individual-tree-segmentation/segmenting-trees-with-a-watershed-on-a-chm/) — the raster method step by step
- [Segmenting Trees Directly from Points](https://www.pythonlidar.com/lidar-classification-feature-extraction/individual-tree-segmentation/segmenting-trees-directly-from-points/) — filters.litree and its trade-offs
- [Computing Crown Metrics per Tree](https://www.pythonlidar.com/lidar-classification-feature-extraction/individual-tree-segmentation/computing-crown-metrics-per-tree/) — heights, areas, volumes and percentiles per tree
- [Canopy Height Models](https://www.pythonlidar.com/ground-filtering-dtm-dsm-generation/canopy-height-models/) — the raster this workflow starts from
- [Point Cloud Segmentation](https://www.pythonlidar.com/lidar-classification-feature-extraction/point-cloud-segmentation/) — general-purpose grouping methods
