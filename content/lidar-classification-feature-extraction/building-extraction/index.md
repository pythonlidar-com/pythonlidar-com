---
title: "Building Extraction from LiDAR Point Clouds"
description: "Classify roof points to ASPRS class 6 and turn them into footprint polygons with heights: height normalization, planarity, per-segment rules in pandas, and polygonization with Shapely."
slug: "building-extraction"
type: "topic"
breadcrumb: "Building Extraction"
datePublished: "2026-09-18"
dateModified: "2026-09-18"
---

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Article",
      "headline": "Building Extraction from LiDAR Point Clouds",
      "description": "Classify roof points to ASPRS class 6 and turn them into footprint polygons with heights: height normalization, planarity, per-segment rules in pandas, and polygonization with Shapely.",
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
          "name": "Building Extraction",
          "item": "https://www.pythonlidar.com/lidar-classification-feature-extraction/building-extraction/"
        }
      ]
    },
    {
      "@type": "HowTo",
      "name": "Building Extraction from LiDAR Point Clouds",
      "step": [
        {
          "@type": "HowToStep",
          "name": "Clean",
          "text": "Drop noise classes 7 and 18 so that stray returns above roofs cannot distort neighbourhood statistics."
        },
        {
          "@type": "HowToStep",
          "name": "Normalize",
          "text": "Compute HeightAboveGround and keep only points between 2.5 m and a sensible ceiling, which isolates elevated objects from the terrain."
        },
        {
          "@type": "HowToStep",
          "name": "Describe",
          "text": "Attach Planarity, Scattering and normal vectors to each point from its k nearest neighbours."
        },
        {
          "@type": "HowToStep",
          "name": "Segment",
          "text": "Group planar points into connected segments with filters.cluster, giving each candidate roof a ClusterID."
        },
        {
          "@type": "HowToStep",
          "name": "Decide",
          "text": "Aggregate features per segment and keep segments that are large, flat and elevated; write class 6 back to their points."
        },
        {
          "@type": "HowToStep",
          "name": "Polygonize",
          "text": "Rasterize class-6 points to a mask, extract polygons, regularize them, and attach eave and ridge heights."
        }
      ]
    },
    {
      "@type": "FAQPage",
      "mainEntity": [
        {
          "@type": "Question",
          "name": "Why not classify buildings with filters.approximatecoplanar alone?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "It gives a per-point boolean, which is noisy at roof edges and inside dense crowns where a few neighbours happen to line up. Aggregating a continuous planarity value per segment is far more robust, and you still get the coplanarity test's intuition."
          }
        },
        {
          "@type": "Question",
          "name": "What height threshold should separate buildings from other objects?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "2.5 metres suits most residential data: it clears cars, fences and hedges while keeping single-storey houses. Commercial and industrial areas can go to 3 metres. Always check the smallest building type the client cares about before raising it."
          }
        },
        {
          "@type": "Question",
          "name": "How do I handle buildings under tree canopy?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Roofs under dense canopy often have too few returns to pass the size test. Lower min_points for segments that sit inside a vegetation mask, or accept that they will be missed and report them from the reference comparison rather than forcing weaker rules on every tile."
          }
        },
        {
          "@type": "Question",
          "name": "Can the same workflow produce roof pitch?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Yes. The normals are already computed; roof pitch is the arccosine of NormalZ, aggregated per roof plane. The dedicated guide on estimating roof pitch and aspect from normals shows how to split a segment into planes first."
          }
        }
      ]
    }
  ]
}
</script>

A municipal client asks for two things from last spring's flight: every building classified as ASPRS class 6 in the delivered LAZ, and a footprint layer with an eave height and a ridge height per building for the planning department's 3D model. The ground is already classified; everything above it is class 1, a mix of roofs, trees, cars, fences and the odd crane. Building extraction is the job of separating the roofs from that mix and then turning scattered roof returns into clean polygons. It is the most requested above-ground product in urban LiDAR and a good first project in the [classification and feature extraction](https://www.pythonlidar.com/lidar-classification-feature-extraction/) section, because the geometric signal — a large, flat, elevated, contiguous surface — is unusually strong.

<svg viewBox="0 0 740 260" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Cross-section of an urban scene showing which points the building rules keep and reject" style="width:100%;max-width:740px;display:block;margin:1.6rem auto">
  <title>What the rules see in a cross-section</title>
  <desc>A profile through a street. Ground points run along the bottom. A car sits just above the ground and is removed by the height band. A pitched roof is kept because its points are planar and contiguous. A tree next to the house is rejected because its points are scattered. A low garden wall is rejected by the height band. Dashed lines mark the 2.5 metre height threshold.</desc>
  <rect x="0" y="0" width="740" height="260" fill="var(--dg-bg)" rx="10"/>
  <line x1="20" y1="214" x2="720" y2="214" stroke="var(--dg-line)" stroke-width="1.5"/>
  <line x1="20" y1="176" x2="720" y2="176" stroke="var(--dg-line-soft)" stroke-width="1.2" stroke-dasharray="5 4"/>
  <text x="714" y="170" text-anchor="end" font-size="10" fill="var(--dg-muted)">2.5 m above ground</text>
  <rect x="60" y="196" width="60" height="16" rx="4" fill="var(--dg-surface-2)" stroke="var(--dg-line)" stroke-width="1"/>
  <text x="90" y="236" text-anchor="middle" font-size="10.5" fill="var(--dg-muted)">car: too low</text>
  <path d="M220 214 L220 130 L320 80 L420 130 L420 214" fill="none" stroke="var(--dg-line-soft)" stroke-width="1"/>
  <path d="M220 130 L320 80 L420 130" fill="none" stroke="var(--dg-a)" stroke-width="3"/>
  <g fill="var(--dg-a)"><circle cx="240" cy="120" r="3"/><circle cx="262" cy="109" r="3"/><circle cx="284" cy="98" r="3"/><circle cx="306" cy="87" r="3"/><circle cx="334" cy="87" r="3"/><circle cx="356" cy="98" r="3"/><circle cx="378" cy="109" r="3"/><circle cx="400" cy="120" r="3"/></g>
  <text x="320" y="236" text-anchor="middle" font-size="10.5" fill="var(--dg-text)">roof: planar, contiguous, kept</text>
  <line x1="530" y1="214" x2="530" y2="150" stroke="var(--dg-line)" stroke-width="3"/>
  <g fill="var(--dg-d)"><circle cx="500" cy="120" r="3"/><circle cx="520" cy="100" r="3"/><circle cx="548" cy="96" r="3"/><circle cx="566" cy="118" r="3"/><circle cx="512" cy="136" r="3"/><circle cx="540" cy="126" r="3"/><circle cx="558" cy="142" r="3"/><circle cx="530" cy="112" r="3"/></g>
  <text x="530" y="236" text-anchor="middle" font-size="10.5" fill="var(--dg-muted)">tree: scattered</text>
  <rect x="620" y="198" width="70" height="14" fill="var(--dg-surface-2)" stroke="var(--dg-line)" stroke-width="1"/>
  <text x="655" y="236" text-anchor="middle" font-size="10.5" fill="var(--dg-muted)">wall: too low</text>
  <text x="20" y="34" font-size="11" fill="var(--dg-muted)">the height band removes the car and the wall; planarity separates the roof from the crown</text>
</svg>

## Prerequisites

- **PDAL 2.5 or newer** with `filters.covariancefeatures`, `filters.normal` and `filters.cluster`, and the Python bindings (`pip install pdal` or conda-forge `python-pdal`).
- **Python 3.10+** with NumPy, pandas, Shapely 2.x, rasterio and GeoPandas for the polygon stage.
- **Ground already classified** as class 2, for example by [SMRF](https://www.pythonlidar.com/ground-filtering-dtm-dsm-generation/smrf-ground-classification/). Everything else can be class 1 — the workflow does not trust any existing building labels.
- **Point density of 8 pts/m² or more.** Below that, small roofs have too few returns to test for planarity and footprints lose their corners.
- **A projected CRS in metres**, such as EPSG:6347 (NAD83(2011) UTM 18N) or EPSG:25832 (ETRS89 UTM 32N). Areas and thresholds below assume metres.
- **A test tile** with a known mix: a residential block with trees overhanging roofs is the case that exposes weak rules fastest.

## Core Workflow Architecture

Building extraction runs in six phases. The first four happen in PDAL and produce a feature-enriched, segmented cloud; the last two happen in pandas and Shapely and produce the classification and the polygons.

1. **Clean.** Drop noise classes 7 and 18 so that stray returns above roofs cannot distort neighbourhood statistics.
2. **Normalize.** Compute `HeightAboveGround` and keep only points between 2.5 m and a sensible ceiling, which isolates elevated objects from the terrain.
3. **Describe.** Attach `Planarity`, `Scattering` and normal vectors to each point from its k nearest neighbours.
4. **Segment.** Group planar points into connected segments with `filters.cluster`, giving each candidate roof a `ClusterID`.
5. **Decide.** Aggregate features per segment and keep segments that are large, flat and elevated; write class 6 back to their points.
6. **Polygonize.** Rasterize class-6 points to a mask, extract polygons, regularize them, and attach eave and ridge heights.

<svg viewBox="0 0 740 200" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="The six phases of building extraction split between PDAL and Python" style="width:100%;max-width:740px;display:block;margin:1.6rem auto">
  <title>Six phases, two runtimes</title>
  <desc>Six numbered boxes in a row. Clean, normalize, describe and segment are grouped under a bracket labelled PDAL pipeline. Decide and polygonize are grouped under a bracket labelled pandas and Shapely. An annotation notes that the first group is expensive and cached, while the second is cheap and iterated.</desc>
  <rect x="0" y="0" width="740" height="200" fill="var(--dg-bg)" rx="10"/>
  <rect x="20" y="70" width="100" height="50" rx="8" fill="var(--dg-a-soft)" stroke="var(--dg-a)" stroke-width="1.3"/>
  <text x="70" y="100" text-anchor="middle" font-size="11.5" fill="var(--dg-text)">1 clean</text>
  <rect x="138" y="70" width="100" height="50" rx="8" fill="var(--dg-a-soft)" stroke="var(--dg-a)" stroke-width="1.3"/>
  <text x="188" y="100" text-anchor="middle" font-size="11.5" fill="var(--dg-text)">2 normalize</text>
  <rect x="256" y="70" width="100" height="50" rx="8" fill="var(--dg-a-soft)" stroke="var(--dg-a)" stroke-width="1.3"/>
  <text x="306" y="100" text-anchor="middle" font-size="11.5" fill="var(--dg-text)">3 describe</text>
  <rect x="374" y="70" width="100" height="50" rx="8" fill="var(--dg-a-soft)" stroke="var(--dg-a)" stroke-width="1.3"/>
  <text x="424" y="100" text-anchor="middle" font-size="11.5" fill="var(--dg-text)">4 segment</text>
  <rect x="502" y="70" width="100" height="50" rx="8" fill="var(--dg-b-soft)" stroke="var(--dg-b)" stroke-width="1.3"/>
  <text x="552" y="100" text-anchor="middle" font-size="11.5" fill="var(--dg-text)">5 decide</text>
  <rect x="620" y="70" width="100" height="50" rx="8" fill="var(--dg-b-soft)" stroke="var(--dg-b)" stroke-width="1.3"/>
  <text x="670" y="100" text-anchor="middle" font-size="11.5" fill="var(--dg-text)">6 polygonize</text>
  <path d="M20 56 L20 46 L474 46 L474 56" fill="none" stroke="var(--dg-a)" stroke-width="1.3"/>
  <text x="247" y="38" text-anchor="middle" font-size="11" fill="var(--dg-text)">PDAL pipeline, run once per tile</text>
  <path d="M502 56 L502 46 L720 46 L720 56" fill="none" stroke="var(--dg-b)" stroke-width="1.3"/>
  <text x="611" y="38" text-anchor="middle" font-size="11" fill="var(--dg-text)">pandas and Shapely</text>
  <text x="247" y="148" text-anchor="middle" font-size="10.5" fill="var(--dg-muted)">minutes per tile, output cached as LAZ</text>
  <text x="611" y="148" text-anchor="middle" font-size="10.5" fill="var(--dg-muted)">seconds per tile, rerun freely</text>
  <text x="20" y="182" font-size="10.5" fill="var(--dg-muted)">tuning thresholds touches only phases 5 and 6, so the expensive half never reruns</text>
</svg>

## Full Implementation

The module below implements all six phases. It is written to be imported by a batch runner, so each phase is a function with typed inputs and outputs, and nothing writes to disk except the two explicit outputs.

```python
"""Building extraction: classified LAZ in, class-6 LAZ and footprint GeoPackage out."""
from __future__ import annotations

import json
import logging
from dataclasses import dataclass
from pathlib import Path

import geopandas as gpd
import numpy as np
import pandas as pd
import pdal
import rasterio.features
from rasterio.transform import from_origin
from shapely.geometry import shape

log = logging.getLogger("buildings")


@dataclass(frozen=True)
class BuildingRules:
    min_height: float = 2.5        # metres above ground
    max_height: float = 150.0
    knn: int = 16                  # covariance neighbourhood
    tolerance: float = 1.0         # cluster link distance, metres
    min_points: int = 60           # smallest segment worth testing
    min_planarity: float = 0.75    # median over the segment
    max_scattering: float = 0.08
    min_area: float = 25.0         # m², bounding-box proxy
    raster_cell: float = 0.5       # footprint mask resolution, metres


def segment(src: Path, rules: BuildingRules, crs: str) -> np.ndarray:
    """Phases 1-4: clean, normalize, describe and segment in one PDAL pipeline.

    Every point is kept; the where clauses restrict the expensive stages to
    elevated, non-noise, non-ground points, so writing class 6 back is trivial.
    """
    elevated = (f"HeightAboveGround >= {rules.min_height} && "
                f"HeightAboveGround <= {rules.max_height} && "
                "Classification != 2 && Classification != 7 && Classification != 18")
    stages = [
        {"type": "readers.las", "filename": str(src), "override_srs": crs},
        {"type": "filters.hag_nn", "count": 2},
        {"type": "filters.covariancefeatures", "knn": rules.knn, "threads": 4,
         "feature_set": "Dimensionality", "where": elevated},
        {"type": "filters.normal", "knn": 12, "always_up": True, "where": elevated},
        {"type": "filters.cluster", "tolerance": rules.tolerance,
         "min_points": rules.min_points, "is3d": True,
         "where": f"{elevated} && Planarity > 0.5"},
    ]
    pipeline = pdal.Pipeline(json.dumps({"pipeline": stages}))
    count = pipeline.execute()
    log.info("%s: %d points read", src.name, count)
    return pipeline.arrays[0]


def decide(points: np.ndarray, rules: BuildingRules) -> set[int]:
    """Phase 5: keep segments that look like roofs."""
    df = pd.DataFrame({k: points[k] for k in
                       ("X", "Y", "HeightAboveGround", "Planarity", "Scattering", "ClusterID")})
    df = df[df.ClusterID > 0]
    seg = df.groupby("ClusterID").agg(
        n=("X", "size"),
        planarity=("Planarity", "median"),
        scattering=("Scattering", "median"),
        hag_p90=("HeightAboveGround", lambda s: float(np.percentile(s, 90))),
        dx=("X", lambda s: float(s.max() - s.min())),
        dy=("Y", lambda s: float(s.max() - s.min())),
    )
    seg["area"] = seg.dx * seg.dy
    keep = seg[(seg.planarity >= rules.min_planarity)
               & (seg.scattering <= rules.max_scattering)
               & (seg.area >= rules.min_area)]
    log.info("%d segments tested, %d kept", len(seg), len(keep))
    return set(int(i) for i in keep.index)


def write_classified(dst: Path, pts: np.ndarray, keep: set[int], crs: str) -> int:
    """Write class 6 onto kept segments; every other point is written unchanged."""
    out = pts.copy()
    roof = np.isin(out["ClusterID"], list(keep)) & (out["Classification"] == 1)
    out["Classification"][roof] = 6
    # No extra_dims option: the feature dimensions stay out of the delivered file.
    writer = pdal.Writer.las(filename=str(dst), minor_version=4, dataformat_id=6,
                             forward="all", a_srs=crs)
    writer.pipeline(out).execute()
    log.info("%s: %d points written as class 6", dst.name, int(roof.sum()))
    return int(roof.sum())


def polygonize(pts: np.ndarray, keep: set[int], rules: BuildingRules, crs: str) -> gpd.GeoDataFrame:
    """Phase 6: rasterize roof points, polygonize, attach heights."""
    roof = pts[np.isin(pts["ClusterID"], list(keep))]
    cell = rules.raster_cell
    x0, y1 = roof["X"].min(), roof["Y"].max()
    cols = int(np.ceil((roof["X"].max() - x0) / cell)) + 1
    rows = int(np.ceil((y1 - roof["Y"].min()) / cell)) + 1
    grid = np.zeros((rows, cols), dtype=np.int32)
    c = ((roof["X"] - x0) / cell).astype(int)
    r = ((y1 - roof["Y"]) / cell).astype(int)
    grid[r, c] = roof["ClusterID"].astype(np.int32)
    transform = from_origin(x0, y1, cell, cell)
    records = []
    for geom, value in rasterio.features.shapes(grid, mask=grid > 0, transform=transform):
        poly = shape(geom).buffer(cell, join_style="mitre").buffer(-cell, join_style="mitre")
        seg = roof[roof["ClusterID"] == value]
        records.append({
            "segment": int(value),
            "eave_m": float(np.percentile(seg["HeightAboveGround"], 10)),
            "ridge_m": float(np.percentile(seg["HeightAboveGround"], 98)),
            "geometry": poly.simplify(cell / 2),
        })
    gdf = gpd.GeoDataFrame(records, crs=crs)
    return gdf[gdf.area >= rules.min_area]


def extract(src: Path, out_laz: Path, out_gpkg: Path, crs: str = "EPSG:6347") -> gpd.GeoDataFrame:
    rules = BuildingRules()
    pts = segment(src, rules, crs)
    keep = decide(pts, rules)
    write_classified(out_laz, pts, keep, crs)
    footprints = polygonize(pts, keep, rules, crs)
    footprints.to_file(out_gpkg, layer="buildings", driver="GPKG")
    log.info("%s: %d footprints", out_gpkg.name, len(footprints))
    return footprints


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")
    extract(Path("tile_5840_2710.laz"), Path("tile_5840_2710_bldg.laz"),
            Path("tile_5840_2710_footprints.gpkg"))
```

## Code Breakdown

**`override_srs` on the reader.** Many municipal deliveries carry a stale or missing CRS. Forcing it on read means every threshold in metres means metres, and the footprint GeoPackage inherits a correct CRS without a second step. If you trust the file, use `default_srs` instead so a present CRS wins.

**`count: 2` on `filters.hag_nn`.** Averaging the two nearest ground points gives a smoother reference surface than a single neighbour on sloping streets, which keeps the 2.5 m band from clipping the downhill eave of a house on a hill.

**`where: "Planarity > 0.5"` on the cluster stage.** This is a deliberately loose pre-filter. It keeps crowns from being linked into roof segments without rejecting the slightly noisy edges of real roofs; the stricter 0.75 median test happens per segment in `decide`, where one noisy edge cannot sink a whole building.

**Bounding-box area as a size proxy.** Computing a true hull per segment is slow for thousands of segments. The bounding box over-estimates the area of an L-shaped building, but the test only has to reject sheds and cars, so a generous proxy is fine. The accurate area comes later from the polygon.

**`where` clauses instead of dropping points.** The obvious alternative — removing ground and low points with `filters.range` — works for segmentation but leaves you matching roof points back to the full tile before you can write it. Restricting each expensive stage with a `where` expression gives the same neighbourhoods — PDAL runs the stage on the matching subset only — while every point stays in the array, so writing class 6 is a single masked assignment. If you need a stable per-point key for other joins, add one with [filters.ferry](https://www.pythonlidar.com/pdal-pipeline-architecture-execution/attribute-mapping/copying-dimensions-with-filters-ferry/) before the first filter.

**Close-then-open with a mitre buffer.** Buffering out by one cell and back in fills single-cell gaps between returns without rounding corners, which is why `join_style="mitre"` matters: the default round join turns every building into a lozenge.

**Eave and ridge as percentiles.** The 10th and 98th percentiles of height above ground are robust to the chimney and the satellite dish that would dominate a max, and to the gutter returns that would drag a min down.

## Parameter Reference Table

| Parameter | Type | Default here | Valid range | Effect |
|---|---|---|---|---|
| `min_height` | float, m | 2.5 | 1.5–4.0 | Lower keeps garden sheds and bus shelters; higher drops single-storey extensions |
| `knn` (covariance) | int | 16 | 8–40 | Scale with density; too small makes crowns look planar |
| `tolerance` (cluster) | float, m | 1.0 | 0.5–2.5 | Must exceed point spacing; too large merges terraced houses into one segment |
| `min_points` (cluster) | int | 60 | 20–300 | Minimum segment size; roughly area × density ÷ 2 for the smallest roof you want |
| `min_planarity` | float | 0.75 | 0.6–0.9 | Median per segment; higher rejects green roofs and complex dormers |
| `max_scattering` | float | 0.08 | 0.04–0.2 | Median per segment; the strongest single separator from vegetation |
| `min_area` | float, m² | 25 | 10–60 | Drops sheds, vehicles on car parks, rooftop plant |
| `raster_cell` | float, m | 0.5 | 0.25–1.0 | Footprint mask resolution; about the point spacing is right |

## Validation and Integrity Checks

A building classification can look perfect in a viewer and still be wrong in ways that cost the client, so check it numerically.

- **Point conservation.** The output LAZ must have exactly as many points as the input. Anything else means the write-back step dropped or duplicated points.
- **Only class 1 changed.** Compare classification histograms before and after; class 2 and every class other than 1 and 6 must be identical. The [counting points per class](https://www.pythonlidar.com/point-cloud-data-standards-fundamentals/asprs-classification-codes/counting-points-per-class-with-pdal/) recipe gives a one-line histogram.
- **Footprints against a reference.** If the client has an existing footprint layer, compute the fraction of reference buildings intersected by an extracted footprint (completeness) and the fraction of extracted footprints intersecting a reference (correctness). Values above 0.9 for both are typical on clean suburban data.
- **Height sanity.** Ridge minus eave should be between 0 and roughly 15 m for houses. Negative values mean the percentile ordering is broken; very large values usually mean a tree was merged into the segment.

```python
def check_conservation(src: Path, dst: Path) -> None:
    def hist(path: Path) -> dict[int, int]:
        p = pdal.Pipeline(json.dumps({"pipeline": [str(path)]}))
        p.execute()
        classes, counts = np.unique(p.arrays[0]["Classification"], return_counts=True)
        return dict(zip(classes.tolist(), counts.tolist()))

    before, after = hist(src), hist(dst)
    assert sum(before.values()) == sum(after.values()), "point count changed"
    for cls in set(before) | set(after):
        if cls not in (1, 6):
            assert before.get(cls, 0) == after.get(cls, 0), f"class {cls} changed"
    moved = before.get(1, 0) - after.get(1, 0)
    assert moved == after.get(6, 0) - before.get(6, 0), "class 1 to 6 accounting mismatch"
```

<svg viewBox="0 0 740 230" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Completeness and correctness measured by matching extracted footprints to a reference layer" style="width:100%;max-width:740px;display:block;margin:1.6rem auto">
  <title>Completeness and correctness against a reference</title>
  <desc>Two rows of building outlines. The top row is the reference layer with six buildings. The bottom row is the extracted layer with six footprints. Five pairs match. One reference building, a small garage, has no extracted match and counts against completeness. One extracted footprint, a tree canopy, has no reference match and counts against correctness. Both scores come out at five in six.</desc>
  <rect x="0" y="0" width="740" height="230" fill="var(--dg-bg)" rx="10"/>
  <text x="20" y="44" font-size="11" fill="var(--dg-text)">reference</text>
  <text x="20" y="144" font-size="11" fill="var(--dg-text)">extracted</text>
  <g fill="var(--dg-surface-2)" stroke="var(--dg-line)" stroke-width="1.2">
    <rect x="110" y="24" width="70" height="44"/><rect x="200" y="24" width="56" height="44"/><rect x="276" y="24" width="84" height="44"/><rect x="380" y="24" width="60" height="44"/><rect x="460" y="34" width="30" height="24"/><rect x="510" y="24" width="76" height="44"/>
  </g>
  <g fill="var(--dg-a-soft)" stroke="var(--dg-a)" stroke-width="1.2">
    <rect x="112" y="124" width="66" height="42"/><rect x="202" y="124" width="52" height="42"/><rect x="278" y="124" width="80" height="42"/><rect x="382" y="124" width="56" height="42"/><rect x="512" y="124" width="72" height="42"/>
  </g>
  <circle cx="630" cy="145" r="22" fill="var(--dg-e-soft)" stroke="var(--dg-e)" stroke-width="1.2"/>
  <text x="475" y="96" text-anchor="middle" font-size="10" fill="var(--dg-e)">missed</text>
  <text x="630" y="186" text-anchor="middle" font-size="10" fill="var(--dg-e)">false positive</text>
  <text x="20" y="212" font-size="10.5" fill="var(--dg-muted)">completeness = matched reference ÷ all reference = 5/6 · correctness = matched extracted ÷ all extracted = 5/6</text>
</svg>

## Performance Tuning

On an 8-core worker, a 1 km² suburban tile at 20 pts/m² spends roughly 60 percent of its time in `filters.covariancefeatures`, 25 percent in `filters.normal`, and the rest split between reading, HAG and clustering. The pandas and Shapely phases are negligible. That profile suggests the order in which to optimize.

- **Cut before describing.** The height band typically leaves 30 to 50 percent of an urban tile; the implementation's `where` clause already skips ground and noise; adding `Classification == 1` to it also skips points a previous run has labelled.
- **Use `threads`.** `filters.covariancefeatures` honours its `threads` option. Four threads roughly halve its time; beyond eight the gain flattens because neighbour search becomes memory-bound.
- **Skip normals if you do not need pitch.** Normals are only used for roof pitch and aspect. If the client wants footprints and heights alone, drop `filters.normal` and save a quarter of the run.
- **Tile at 500 m with a 30 m buffer.** Smaller tiles fit comfortably in memory and parallelize well across processes, and a 30 m buffer covers almost every building that straddles an edge; see [buffered tiling](https://www.pythonlidar.com/batch-automation-cloud-integration/tile-indexing-and-merging/buffered-tiling-to-avoid-edge-artefacts/).

## Common Errors and Troubleshooting

**`Dimension 'Planarity' not found` in the cluster stage.** The `where` expression references a dimension that is not yet in the table. Either the covariance stage is below the cluster stage in the list, or `feature_set` was set to something that does not include planarity. Move the stage up and keep `"feature_set": "Dimensionality"`.

**Every tree becomes a building.** On sparse data with small `knn`, crowns look planar. Raise `knn` to 24 or 32, and tighten `max_scattering`; a histogram of median scattering per segment usually shows two clear peaks that tell you where the threshold belongs.

**Terraced houses come out as one polygon.** Adjacent roofs are genuinely contiguous, so Euclidean clustering merges them. That is often acceptable; if the client needs individual units, split segments with an intersecting cadastral layer using [filters.overlay](https://www.pythonlidar.com/lidar-classification-feature-extraction/building-extraction/extracting-building-footprints-from-lidar/) rather than trying to tune clustering.

**Footprints have jagged staircase edges.** The mask resolution is finer than the point spacing, or simplification is off. Set `raster_cell` near the average point spacing and simplify at half a cell; for strictly rectilinear output, regularize with a minimum rotated rectangle per polygon.

**Output file is much larger than the input.** The writer carried the computed feature dimensions into the file. The implementation leaves `extra_dims` unset so the feature dimensions are not written; if you add `extra_dims: "all"` for debugging, remember to remove it before delivery or list only the dimensions the client needs.

## Frequently Asked Questions

**Why not classify buildings with filters.approximatecoplanar alone?**

It gives a per-point boolean, which is noisy at roof edges and inside dense crowns where a few neighbours happen to line up. Aggregating a continuous planarity value per segment is far more robust, and you still get the coplanarity test's intuition.

**What height threshold should separate buildings from other objects?**

2.5 metres suits most residential data: it clears cars, fences and hedges while keeping single-storey houses. Commercial and industrial areas can go to 3 metres. Always check the smallest building type the client cares about before raising it.

**How do I handle buildings under tree canopy?**

Roofs under dense canopy often have too few returns to pass the size test. Lower min_points for segments that sit inside a vegetation mask, or accept that they will be missed and report them from the reference comparison rather than forcing weaker rules on every tile.

**Can the same workflow produce roof pitch?**

Yes. The normals are already computed; roof pitch is the arccosine of NormalZ, aggregated per roof plane. The dedicated guide on estimating roof pitch and aspect from normals shows how to split a segment into planes first.

## Related

- [Extracting Building Footprints from LiDAR](https://www.pythonlidar.com/lidar-classification-feature-extraction/building-extraction/extracting-building-footprints-from-lidar/) — the polygonization and regularization step in depth
- [Detecting Planar Roofs with Covariance Features](https://www.pythonlidar.com/lidar-classification-feature-extraction/building-extraction/detecting-planar-roofs-with-covariance-features/) — choosing knn and thresholds from the data
- [Estimating Roof Pitch and Aspect from Normals](https://www.pythonlidar.com/lidar-classification-feature-extraction/building-extraction/estimating-roof-pitch-and-aspect-from-normals/) — per-plane geometry for solar and 3D models
- [Point Cloud Segmentation](https://www.pythonlidar.com/lidar-classification-feature-extraction/point-cloud-segmentation/) — the grouping step this workflow depends on
- [Individual Tree Segmentation](https://www.pythonlidar.com/lidar-classification-feature-extraction/individual-tree-segmentation/) — the complementary problem for the points buildings reject
