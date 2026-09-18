---
title: "Water and Bridge Classification in LiDAR"
description: "Classify water to ASPRS class 9 and bridge decks to class 17, then hydro-flatten the DTM: return dropouts and intensity as water evidence, breakline polygons with filters.overlay, and removing decks so terrain models let water flow."
slug: "water-and-bridge-classification"
type: "topic"
breadcrumb: "Water and Bridge Classification"
datePublished: "2026-09-18"
dateModified: "2026-09-18"
---

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Article",
      "headline": "Water and Bridge Classification in LiDAR",
      "description": "Classify water to ASPRS class 9 and bridge decks to class 17, then hydro-flatten the DTM: return dropouts and intensity as water evidence, breakline polygons with filters.overlay, and removing decks so terrain models let water flow.",
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
          "name": "Water and Bridge Classification",
          "item": "https://www.pythonlidar.com/lidar-classification-feature-extraction/water-and-bridge-classification/"
        }
      ]
    },
    {
      "@type": "HowTo",
      "name": "Water and Bridge Classification in LiDAR",
      "step": [
        {
          "@type": "HowToStep",
          "name": "Find water candidates",
          "text": "Rasterize a return-count grid; cells inside large areas of very low or zero return density, adjacent to ground, are water candidates. Low intensity and flatness strengthen the evidence."
        },
        {
          "@type": "HowToStep",
          "name": "Build water polygons",
          "text": "Polygonize the candidate cells, clean them morphologically, and merge with any supplied hydrography; drop polygons below the specification's minimum size."
        },
        {
          "@type": "HowToStep",
          "name": "Classify water",
          "text": "Burn polygons into the points with filters.overlay and set class 9 for ground and unclassified points inside them."
        },
        {
          "@type": "HowToStep",
          "name": "Find bridge decks",
          "text": "Within road-over-water or road-over-road crossings, points classified as ground that sit well above the interpolated terrain on either side are deck candidates."
        },
        {
          "@type": "HowToStep",
          "name": "Classify bridges",
          "text": "Set class 17 on deck points, removing them from the ground used for the DTM."
        },
        {
          "@type": "HowToStep",
          "name": "Hydro-flatten",
          "text": "Build the DTM from class 2 only, then burn each water polygon at a single elevation derived from its shoreline."
        }
      ]
    },
    {
      "@type": "FAQPage",
      "mainEntity": [
        {
          "@type": "Question",
          "name": "Why do water bodies have so few LiDAR returns?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Topographic LiDAR uses near-infrared light, which water absorbs strongly. Most pulses produce no detectable return, except where the beam strikes the surface nearly vertically and reflects straight back, or where waves, foam or debris scatter it. Bathymetric sensors use green light to penetrate water, but that is a different instrument."
          }
        },
        {
          "@type": "Question",
          "name": "What is hydro-flattening?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "It is the practice of setting each water body in a DEM to a single flat elevation, or for rivers to a surface that descends smoothly downstream, and making the shoreline consistent with the surrounding terrain. It removes the interpolation noise over water that would otherwise appear as bumps and pits."
          }
        },
        {
          "@type": "Question",
          "name": "Should bridges be classified as ground?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "No. ASPRS class 17 exists for bridge decks precisely so that terrain models can exclude them. A DTM that includes decks shows a dam at every crossing, which breaks drainage analysis and flood modelling."
          }
        },
        {
          "@type": "Question",
          "name": "Do I need breaklines, or can I derive water from the points?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Large open lakes can be derived reliably from return density. Rivers, especially narrow or tree-lined ones, are much better handled with supplied hydrography or manually digitized breaklines. Most production work combines both: derive, then correct against supplied layers."
          }
        }
      ]
    }
  ]
}
</script>

Water and bridges are the two classes that decide whether a LiDAR terrain model is usable for hydrology. Near-infrared lasers are largely absorbed by water, so lakes and rivers come back as sparse, noisy returns — or no returns at all — and a DTM interpolated across them ripples with artefacts. Bridges are the opposite problem: they are solid, flat and connected to the road at both ends, so ground filters routinely classify decks as ground, and the resulting DTM dams every river at every crossing. Delivery specifications such as the USGS Lidar Base Specification require water classified as class 9, bridge decks as class 17, and water bodies above a size threshold flattened to a single elevation in the DEM. This topic, part of the [classification and feature extraction](https://www.pythonlidar.com/lidar-classification-feature-extraction/) section, covers all three.

<svg viewBox="0 50 740 200" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Cross-section of a river under a bridge showing return behaviour and the resulting DTM problems" style="width:100%;max-width:740px;display:block;margin:1.6rem auto">
  <title>Two classes, two opposite failures</title>
  <desc>A profile across a river valley with a road bridge. Over the water, points are sparse and scattered around the surface, with gaps where the laser was absorbed. Over the bridge, points form a solid flat deck at road height. Beneath, a dashed line shows the DTM an unmodified ground filter produces: noisy over the water and raised across the channel where the deck was taken for ground, blocking flow.</desc>
  <rect x="0" y="50" width="740" height="200" fill="var(--dg-bg)" rx="10"/>
  <path d="M20 120 L200 120 L260 190 L480 190 L540 120 L720 120" fill="none" stroke="var(--dg-line)" stroke-width="1.6"/>
  <rect x="260" y="176" width="220" height="14" fill="var(--dg-b-soft)"/>
  <text x="370" y="208" text-anchor="middle" font-size="10.5" fill="var(--dg-b)">water surface</text>
  <g fill="var(--dg-b)"><circle cx="280" cy="176" r="2.6"/><circle cx="320" cy="172" r="2.6"/><circle cx="410" cy="178" r="2.6"/><circle cx="455" cy="170" r="2.6"/><circle cx="300" cy="162" r="2.6"/></g>
  <rect x="180" y="84" width="380" height="12" fill="var(--dg-c-soft)" stroke="var(--dg-c)" stroke-width="1.2"/>
  <g fill="var(--dg-c)"><circle cx="200" cy="84" r="2.6"/><circle cx="240" cy="84" r="2.6"/><circle cx="280" cy="84" r="2.6"/><circle cx="320" cy="84" r="2.6"/><circle cx="360" cy="84" r="2.6"/><circle cx="400" cy="84" r="2.6"/><circle cx="440" cy="84" r="2.6"/><circle cx="480" cy="84" r="2.6"/><circle cx="520" cy="84" r="2.6"/></g>
  <text x="370" y="74" text-anchor="middle" font-size="10.5" fill="var(--dg-c)">bridge deck: dense, flat, road height</text>
  <path d="M20 124 L200 124 L230 100 L510 100 L540 124 L720 124" fill="none" stroke="var(--dg-e)" stroke-width="1.6" stroke-dasharray="6 4"/>
  <text x="716" y="150" text-anchor="end" font-size="10.5" fill="var(--dg-e)">naive DTM: dam across the channel</text>
  <text x="20" y="236" font-size="10.5" fill="var(--dg-muted)">water fails by having too few points, bridges by having the right points in the wrong class</text>
</svg>

## Prerequisites

- **PDAL 2.5+** with `filters.overlay`, `filters.hag_nn`, `filters.covariancefeatures`, `filters.smrf` and `writers.gdal`, plus the Python bindings.
- **Python 3.10+** with NumPy, GeoPandas, Shapely 2.x and rasterio.
- **Ground classified**, with the understanding that some decks and some water returns will be in class 2 and must be corrected.
- **Water body and road polygons, if available.** National hydrography layers, OpenStreetMap water and bridge ways, or a client breakline set make both classes far more reliable than detection from the points alone.
- **Point source IDs populated**, because per-flightline behaviour over water (specular returns at nadir) matters for diagnostics.
- **A projected CRS in metres**, the same one the breaklines use, or reprojection of the polygons before overlay.

## Core Workflow Architecture

1. **Find water candidates.** Rasterize a return-count grid; cells inside large areas of very low or zero return density, adjacent to ground, are water candidates. Low intensity and flatness strengthen the evidence.
2. **Build water polygons.** Polygonize the candidate cells, clean them morphologically, and merge with any supplied hydrography; drop polygons below the specification's minimum size.
3. **Classify water.** Burn polygons into the points with `filters.overlay` and set class 9 for ground and unclassified points inside them.
4. **Find bridge decks.** Within road-over-water or road-over-road crossings, points classified as ground that sit well above the interpolated terrain on either side are deck candidates.
5. **Classify bridges.** Set class 17 on deck points, removing them from the ground used for the DTM.
6. **Hydro-flatten.** Build the DTM from class 2 only, then burn each water polygon at a single elevation derived from its shoreline.

## Full Implementation

```python
"""Water (class 9) and bridge deck (class 17) classification, with hydro-flattening."""
from __future__ import annotations

import json
import logging
from pathlib import Path

import geopandas as gpd
import numpy as np
import pdal
import rasterio
import rasterio.features
from rasterio.transform import from_origin
from scipy import ndimage as ndi
from shapely.geometry import shape

log = logging.getLogger("hydro")


def water_candidates(src: Path, cell: float = 2.0, min_area_m2: float = 8000.0,
                     crs: str = "EPSG:6341") -> gpd.GeoDataFrame:
    """Polygons of near-empty cells large enough to count as water bodies."""
    p = pdal.Pipeline(json.dumps({"pipeline": [str(src)]}))
    p.execute()
    a = p.arrays[0]
    x0, y1 = np.floor(a["X"].min()), np.ceil(a["Y"].max())
    cols = int(np.ceil((a["X"].max() - x0) / cell))
    rows = int(np.ceil((y1 - a["Y"].min()) / cell))
    c = np.clip(((a["X"] - x0) / cell).astype(int), 0, cols - 1)
    r = np.clip(((y1 - a["Y"]) / cell).astype(int), 0, rows - 1)
    counts = np.zeros((rows, cols), dtype=np.int32)
    np.add.at(counts, (r, c), 1)

    expected = np.median(counts[counts > 0])
    empty = counts < max(1, 0.1 * expected)          # under 10 % of typical density
    empty = ndi.binary_opening(empty, iterations=2)  # drop isolated shadows
    empty = ndi.binary_closing(empty, iterations=3)  # join returns scattered on the surface
    transform = from_origin(x0, y1, cell, cell)
    polys = [shape(g) for g, v in rasterio.features.shapes(
        empty.astype(np.uint8), mask=empty, transform=transform) if v == 1]
    gdf = gpd.GeoDataFrame({"geometry": polys}, crs=crs)
    gdf = gdf[gdf.area >= min_area_m2].reset_index(drop=True)
    gdf["WaterId"] = np.arange(1, len(gdf) + 1)
    log.info("%d water candidates >= %.0f m²", len(gdf), min_area_m2)
    return gdf


def classify(src: Path, dst: Path, water: gpd.GeoDataFrame, crs: str = "EPSG:6341") -> None:
    water_gpkg = dst.with_suffix(".water.gpkg")
    water.to_file(water_gpkg, layer="water", driver="GPKG")
    stages = [
        {"type": "readers.las", "filename": str(src), "override_srs": crs},
        {"type": "filters.ferry", "dimensions": "=>WaterId"},
        {"type": "filters.overlay", "dimension": "WaterId",
         "datasource": str(water_gpkg), "layer": "water", "column": "WaterId"},
        {"type": "filters.assign", "value": [
            "Classification = 9 WHERE WaterId > 0 && (Classification == 1 || Classification == 2)"
        ]},
        # Bridge decks: ground-classified points far above the surrounding terrain.
        {"type": "filters.hag_nn", "count": 6, "max_distance": 60.0,
         "where": "Classification == 2"},
        {"type": "filters.assign", "value": [
            "Classification = 17 WHERE Classification == 2 && HeightAboveGround > 2.5"
        ]},
        {"type": "writers.las", "filename": str(dst), "minor_version": 4,
         "dataformat_id": 6, "forward": "all"},
    ]
    n = pdal.Pipeline(json.dumps({"pipeline": stages})).execute()
    log.info("%s: %d points written", dst.name, n)


def hydro_flatten(dtm_path: Path, water: gpd.GeoDataFrame, out_path: Path) -> None:
    """Burn each water polygon at the 5th percentile of its shoreline elevation."""
    with rasterio.open(dtm_path) as ds:
        dtm = ds.read(1, masked=True).filled(np.nan)
        profile, transform = ds.profile, ds.transform
    for poly in water.geometry:
        ring = poly.exterior.buffer(3.0).difference(poly)
        shore = rasterio.features.geometry_mask([ring], dtm.shape, transform, invert=True)
        inside = rasterio.features.geometry_mask([poly], dtm.shape, transform, invert=True)
        z = np.nanpercentile(dtm[shore], 5)
        dtm[inside] = z
    profile.update(nodata=-9999.0)
    with rasterio.open(out_path, "w", **profile) as out:
        out.write(np.nan_to_num(dtm, nan=-9999.0).astype(profile["dtype"]), 1)


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
    src = Path("valley_0310.laz")
    water = water_candidates(src)
    classify(src, Path("valley_0310_hydro.laz"), water)
```

## Code Breakdown

**Return count as the water signal.** A grid of return counts is the most reliable single piece of evidence for water in near-infrared data: open water returns a small fraction of the density of the land around it. Ten percent of the tile's median cell count is a conservative threshold; wind-roughened water returns more, calm water less.

**Opening then closing.** Opening removes small empty patches — shadows behind buildings, dark roofs, missing returns under dense canopy — that are not water. Closing then fills the scattered surface returns inside a lake so the polygon is solid. The order matters: closing first would join shadows into lakes.

**8,000 m² minimum.** The USGS Lidar Base Specification requires hydro-flattening for inland ponds and lakes of about two acres or more, which is roughly 8,100 m²; it treats rivers above a nominal width of 30 m (100 ft) similarly. Use your contract's thresholds, and prefer supplied breaklines to derived polygons where you have them.

**`filters.overlay` into a scratch dimension.** Overlay writes the polygon's `WaterId` onto every point inside it. The dimension has to exist first, which is what `filters.ferry` with `=>WaterId` does. Keeping the ID lets you trace any point back to its water body later.

**Only classes 1 and 2 become water.** Points of overhanging vegetation, docks and boats inside the polygon keep their classes. Specifications differ on whether to relabel above-water points; the conservative default is to leave them.

**Bridges from ground above ground.** After water is removed from class 2, `filters.hag_nn` with a `where` clause computes, for each remaining ground point, its height above its nearest ground neighbours — with `max_distance: 60` so the neighbours are drawn from the banks, not only from the deck itself. Deck points sit several metres above those neighbours. This heuristic works because SMRF has already classified most of the terrain correctly; the [bridge deck guide](https://www.pythonlidar.com/lidar-classification-feature-extraction/water-and-bridge-classification/classifying-bridge-decks/) shows a more robust version using road polygons.

**Shoreline percentile for flattening.** The water surface should sit at or just below the lowest bank, so the 5th percentile of DTM values in a 3 m ring around each polygon is used. Taking the minimum would chase one bad cell; the mean would put the water above parts of the bank.

<svg viewBox="0 0 740 240" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Return density along a transect crossing land, a lake and land again" style="width:100%;max-width:740px;display:block;margin:1.6rem auto">
  <title>The dropout that marks water</title>
  <desc>A line chart of returns per square metre along a 600 metre transect. Over land the density hovers around 14. Over the lake between 220 and 430 metres it drops to between zero and one, with a brief spike near the centre where the laser hit the water at nadir. A dashed threshold line at ten percent of the land density sits just above the lake values.</desc>
  <rect x="0" y="0" width="740" height="240" fill="var(--dg-bg)" rx="10"/>
  <line x1="70" y1="190" x2="700" y2="190" stroke="var(--dg-line)" stroke-width="1.3"/>
  <line x1="70" y1="190" x2="70" y2="30" stroke="var(--dg-line)" stroke-width="1.3"/>
  <rect x="301" y="30" width="221" height="160" fill="var(--dg-b-soft)"/>
  <polyline points="70,62 110,58 150,66 190,60 230,64 270,58 301,70 312,184 350,186 390,183 405,150 418,182 460,187 500,184 522,120 540,64 580,60 620,66 660,58 700,62" fill="none" stroke="var(--dg-a)" stroke-width="2"/>
  <line x1="70" y1="175" x2="700" y2="175" stroke="var(--dg-e)" stroke-width="1.2" stroke-dasharray="5 4"/>
  <text x="696" y="170" text-anchor="end" font-size="10.5" fill="var(--dg-e)">10 % of land density</text>
  <text x="411" y="48" text-anchor="middle" font-size="10.5" fill="var(--dg-text)">lake</text>
  <text x="430" y="140" font-size="10" fill="var(--dg-muted)">nadir specular spike</text>
  <text x="62" y="64" text-anchor="end" font-size="10" fill="var(--dg-muted)">14</text>
  <text x="62" y="194" text-anchor="end" font-size="10" fill="var(--dg-muted)">0</text>
  <text x="385" y="214" text-anchor="middle" font-size="10.5" fill="var(--dg-muted)">distance along transect, 0–600 m (illustrative)</text>
  <text x="30" y="110" font-size="10.5" fill="var(--dg-muted)" transform="rotate(-90 30 110)" text-anchor="middle">returns/m²</text>
</svg>

The flattening step deserves a picture of its own, because the choice of where to sample the water elevation is what makes the shoreline look right or wrong in a hillshade.

<svg viewBox="0 28 740 202" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Sampling a shoreline ring to choose a single flattened water elevation" style="width:100%;max-width:740px;display:block;margin:1.6rem auto">
  <title>One elevation from the shoreline ring</title>
  <desc>Left: a plan view of a lake polygon surrounded by a three metre ring along its shore, where DTM cells are sampled. Right: a histogram of the sampled shoreline elevations ranging from 212.4 to 213.6 metres, with the fifth percentile at 212.5 marked as the chosen water surface, below almost every bank cell so the water never appears to sit above the land.</desc>
  <rect x="0" y="28" width="740" height="202" fill="var(--dg-bg)" rx="10"/>
  <path d="M80 110 C90 60 170 40 230 60 C300 80 320 130 290 170 C250 210 140 200 100 170 C84 156 78 132 80 110 Z" fill="none" stroke="var(--dg-c)" stroke-width="10" stroke-opacity="0.5"/>
  <path d="M80 110 C90 60 170 40 230 60 C300 80 320 130 290 170 C250 210 140 200 100 170 C84 156 78 132 80 110 Z" fill="var(--dg-b-soft)" stroke="var(--dg-b)" stroke-width="1.5"/>
  <text x="195" y="125" text-anchor="middle" font-size="11" fill="var(--dg-text)">water polygon</text>
  <text x="195" y="222" text-anchor="middle" font-size="10.5" fill="var(--dg-muted)">3 m shoreline ring sampled</text>
  <line x1="420" y1="180" x2="710" y2="180" stroke="var(--dg-line)" stroke-width="1.3"/>
  <g fill="var(--dg-c-soft)" stroke="var(--dg-c)" stroke-width="1">
    <rect x="430" y="168" width="30" height="12"/><rect x="462" y="140" width="30" height="40"/><rect x="494" y="100" width="30" height="80"/><rect x="526" y="80" width="30" height="100"/><rect x="558" y="96" width="30" height="84"/><rect x="590" y="126" width="30" height="54"/><rect x="622" y="150" width="30" height="30"/><rect x="654" y="166" width="30" height="14"/>
  </g>
  <line x1="446" y1="50" x2="446" y2="180" stroke="var(--dg-b)" stroke-width="1.8" stroke-dasharray="5 4"/>
  <text x="452" y="60" font-size="10.5" fill="var(--dg-b)">5th percentile = water surface</text>
  <text x="430" y="198" font-size="10" fill="var(--dg-muted)">212.4 m</text>
  <text x="684" y="198" text-anchor="end" font-size="10" fill="var(--dg-muted)">213.6 m</text>
  <text x="565" y="220" text-anchor="middle" font-size="10.5" fill="var(--dg-muted)">shoreline DTM elevations</text>
</svg>

## Parameter Reference Table

| Parameter | Type | Default here | Typical range | Effect |
|---|---|---|---|---|
| `cell` (density grid) | float, m | 2.0 | 1–5 | Coarser is steadier but blunts narrow channels |
| density threshold | fraction | 0.10 | 0.05–0.25 | Fraction of median cell count below which a cell is empty |
| opening iterations | int | 2 | 1–4 | Removes shadows and dark roofs from candidates |
| closing iterations | int | 3 | 2–6 | Fills scattered surface returns inside lakes |
| `min_area_m2` | float | 8000 | per spec | Smallest water body classified and flattened |
| `hag_nn` `count` | int | 6 | 3–12 | Ground neighbours used to judge a deck point |
| `hag_nn` `max_distance` | float, m | 60 | 30–150 | Must reach the banks across the widest deck |
| deck height | float, m | 2.5 | 1.5–5 | Minimum clearance of a deck above the terrain |
| shoreline ring | float, m | 3.0 | 1–10 | Width of the band sampled for water elevation |

## Validation and Integrity Checks

- **Water polygons against imagery or hydrography.** Overlay the derived polygons on orthophotos. False water usually appears as large flat dark roofs, fresh asphalt and deep shadows; false dry land appears where a lake was flown at an angle that returned strong specular points.
- **No ground inside water.** After classification, count class 2 points inside each polygon; it should be zero, or only a handful along the edge where the polygon overlaps the bank.
- **Monotonic river surfaces.** For flowing water, flattened elevations must decrease downstream. Sample the flattened DTM along the channel centreline and assert that each step is non-increasing. Lakes need only be flat; rivers need to be flat across and descending along.
- **Deck removal lets flow through.** Run a quick flow accumulation on the DTM, or simply profile across each bridge: the channel must be continuous beneath every crossing.

```python
def check_downstream(dtm: np.ndarray, rows: np.ndarray, cols: np.ndarray, tol: float = 0.02) -> None:
    profile = dtm[rows, cols]              # centreline cells ordered upstream to downstream
    rises = np.diff(profile) > tol
    assert not rises.any(), f"water surface rises at {int(rises.sum())} steps along the river"
```

## Performance Tuning

Water detection is raster work on a coarse grid and takes seconds per tile. The cost is in the classification pipeline, where `filters.hag_nn` with a large `max_distance` can be slow if it runs on every point — which is why it is restricted to class 2 with a `where` clause. On tiles with no water and no roads crossing water, skip the bridge stage entirely; a quick intersection of the tile extent with a road-over-water layer decides that in milliseconds.

Water bodies straddle tiles far more often than buildings, and flattening a lake tile by tile produces steps at every tile edge. Derive water polygons on a whole-project mosaic of the density grid, or merge per-tile polygons before computing shoreline elevations, so each lake gets exactly one elevation.

## Common Errors and Troubleshooting

**Dark roofs and fresh asphalt classified as water.** They absorb near-infrared too. Require that candidate cells are adjacent to ground, not surrounded by buildings, and filter polygons by compactness — roofs are rectilinear, lakes are not.

**Rivers broken into pieces.** Narrow channels under overhanging trees retain canopy returns, so the density grid does not drop to zero there. Use supplied centrelines or breaklines for rivers; detection from density alone is reliable only for open water.

**Steps in the flattened river.** Each polygon was flattened independently. For rivers, flatten along the channel with a gradient — interpolate water elevation from upstream to downstream shoreline samples — rather than to one value.

**Deck classified but the DTM still dams.** The DTM was built with triangulation across the gap, which bridges the deck's absence with a straight line at deck height from the approaches. Build it with an interpolation that respects breaklines, or burn the channel from the water polygon before hillshading and hydrology.

**Bridge approach embankments labelled as deck.** Embankments are genuinely above nearby ground. Restrict the deck test to points over water or over another road, using the water polygons or a road layer as a mask.

## Frequently Asked Questions

**Why do water bodies have so few LiDAR returns?**

Topographic LiDAR uses near-infrared light, which water absorbs strongly. Most pulses produce no detectable return, except where the beam strikes the surface nearly vertically and reflects straight back, or where waves, foam or debris scatter it. Bathymetric sensors use green light to penetrate water, but that is a different instrument.

**What is hydro-flattening?**

It is the practice of setting each water body in a DEM to a single flat elevation, or for rivers to a surface that descends smoothly downstream, and making the shoreline consistent with the surrounding terrain. It removes the interpolation noise over water that would otherwise appear as bumps and pits.

**Should bridges be classified as ground?**

No. ASPRS class 17 exists for bridge decks precisely so that terrain models can exclude them. A DTM that includes decks shows a dam at every crossing, which breaks drainage analysis and flood modelling.

**Do I need breaklines, or can I derive water from the points?**

Large open lakes can be derived reliably from return density. Rivers, especially narrow or tree-lined ones, are much better handled with supplied hydrography or manually digitized breaklines. Most production work combines both: derive, then correct against supplied layers.

## Related

- [Classifying Water from Intensity and Returns](https://www.pythonlidar.com/lidar-classification-feature-extraction/water-and-bridge-classification/classifying-water-from-intensity-and-returns/) — detecting water without supplied polygons
- [Hydro-Flattening Water Bodies in a DTM](https://www.pythonlidar.com/lidar-classification-feature-extraction/water-and-bridge-classification/hydro-flattening-water-bodies-in-a-dtm/) — flat lakes, descending rivers, consistent shorelines
- [Classifying Bridge Decks](https://www.pythonlidar.com/lidar-classification-feature-extraction/water-and-bridge-classification/classifying-bridge-decks/) — robust deck detection with road polygons
- [DTM Raster Generation](https://www.pythonlidar.com/ground-filtering-dtm-dsm-generation/dtm-raster-generation/) — building the terrain model these classes feed
- [Filling NoData Voids in DTM Rasters](https://www.pythonlidar.com/ground-filtering-dtm-dsm-generation/dtm-raster-generation/filling-nodata-voids-in-dtm-rasters/) — the gaps water leaves behind
