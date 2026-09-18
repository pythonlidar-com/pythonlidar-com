---
title: "Contour Generation from LiDAR DTMs"
description: "Produce clean contour lines from a LiDAR terrain model in Python: choosing the interval from vertical accuracy, smoothing the DTM before contouring, GDAL ContourGenerate with elevation attributes, index contours, and GeoPackage delivery."
slug: "contour-generation"
type: "topic"
breadcrumb: "Contour Generation"
datePublished: "2026-09-18"
dateModified: "2026-09-18"
---

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Article",
      "headline": "Contour Generation from LiDAR DTMs",
      "description": "Produce clean contour lines from a LiDAR terrain model in Python: choosing the interval from vertical accuracy, smoothing the DTM before contouring, GDAL ContourGenerate with elevation attributes, index contours, and GeoPackage delivery.",
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
          "name": "Ground Filtering & Terrain Models",
          "item": "https://www.pythonlidar.com/ground-filtering-dtm-dsm-generation/"
        },
        {
          "@type": "ListItem",
          "position": 3,
          "name": "Contour Generation",
          "item": "https://www.pythonlidar.com/ground-filtering-dtm-dsm-generation/contour-generation/"
        }
      ]
    },
    {
      "@type": "HowTo",
      "name": "Generate contour lines from a LiDAR DTM",
      "step": [
        {
          "@type": "HowToStep",
          "name": "Choose the interval",
          "text": "A common rule of thumb is that the contour interval should be at least about twice the NVA at 95 % confidence, so that a contour's position is meaningful. For QL2 data with NVA around 0.2 m, 0.5 m contours are defensible; 0.25 m contours are not."
        },
        {
          "@type": "HowToStep",
          "name": "Mosaic and prepare",
          "text": "Contour a seamless mosaic, not individual tiles, to avoid broken lines at tile edges. Fill voids and apply hydro-flattening first."
        },
        {
          "@type": "HowToStep",
          "name": "Smooth",
          "text": "Apply a Gaussian or median filter sized to a few cells to remove micro-relief that would produce zigzags, without shifting the landform."
        },
        {
          "@type": "HowToStep",
          "name": "Contour",
          "text": "Run gdal.ContourGenerateEx with a fixed interval and base, writing an elevation attribute."
        },
        {
          "@type": "HowToStep",
          "name": "Clean",
          "text": "Drop closed loops below a minimum length, simplify slightly, and tag index contours (every fifth line, typically)."
        },
        {
          "@type": "HowToStep",
          "name": "Deliver",
          "text": "Write to GeoPackage or Shapefile with elevation, index flag and CRS; optionally DXF for CAD."
        }
      ]
    },
    {
      "@type": "FAQPage",
      "mainEntity": [
        {
          "@type": "Question",
          "name": "What contour interval should I use for LiDAR?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "One the vertical accuracy supports: roughly twice the 95 percent vertical accuracy or more. For typical QL2 data that means 0.5 metres or coarser; tighter intervals imply precision the data does not have."
          }
        },
        {
          "@type": "Question",
          "name": "Should I smooth the DTM before contouring?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Yes, lightly. A small Gaussian filter removes micro-relief that makes contours zigzag and form spurious loops, while moving real contours by only centimetres. Heavy smoothing flattens real landforms, so keep it modest and check the result."
          }
        },
        {
          "@type": "Question",
          "name": "How do I generate contours in Python?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Use GDAL's ContourGenerateEx on the DTM band with LEVEL_INTERVAL, LEVEL_BASE and field options, writing into an OGR layer such as a GeoPackage. GeoPandas can then clean and attribute the lines."
          }
        },
        {
          "@type": "Question",
          "name": "Should I contour tiles or a mosaic?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "A mosaic. Contouring tiles separately breaks every line at every tile edge and can produce slightly different line positions on either side of a seam. Build a virtual mosaic with gdal.BuildVRT and contour that once; if the area is too large, contour overlapping blocks and merge lines by elevation afterwards."
          }
        },
        {
          "@type": "Question",
          "name": "Why do contours cross after simplification?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Because the simplification tolerance was large compared with the spacing between adjacent contours on steep ground. Use topology-preserving simplification, keep the tolerance to a fraction of a cell, and check the output for crossings with a spatial join before delivery."
          }
        },
        {
          "@type": "Question",
          "name": "Can I produce contours in feet from a metre DTM?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Yes, but convert elevations first: multiply the DTM by the appropriate foot factor, or contour in metres with an interval equivalent to the desired feet and convert the elevation attribute afterwards. Be explicit about US survey feet versus international feet, and state the vertical datum in the metadata."
          }
        },
        {
          "@type": "Question",
          "name": "What are index contours?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Every fifth contour, typically, drawn heavier and labelled on maps to make elevations easy to read. Flag them with an attribute so cartographic styling can pick them out."
          }
        }
      ]
    }
  ]
}
</script>

Contours are still one of the most requested LiDAR deliverables. Engineers design on them, planners read them, and many regulations and legacy CAD workflows expect them. A 1 m LiDAR DTM contains everything needed, but contouring it naively produces lines that zigzag around every cell, break into thousands of tiny closed loops on flat ground, and imply an accuracy the data does not have. This topic in the [Ground Filtering and DTM/DSM Generation](https://www.pythonlidar.com/ground-filtering-dtm-dsm-generation/) section covers the full workflow: picking an interval that the vertical accuracy supports, smoothing the surface so the lines represent landform rather than noise, generating contours with GDAL from Python, cleaning and attributing them, and delivering them in a form GIS and CAD users can load directly.

<svg viewBox="0 0 740 230" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Raw versus smoothed contours on the same hillside" style="width:100%;max-width:740px;display:block;margin:1.6rem auto">
  <title>Contours from raw and smoothed DTMs</title>
  <desc>Two panels of the same hillside. Contours from the raw 1 metre DTM are jagged with small spurious closed loops on the flatter ground at the bottom. Contours from a lightly smoothed DTM are clean, evenly spaced curves that follow the landform, with no spurious loops.</desc>
  <rect x="0" y="0" width="740" height="230" fill="var(--dg-bg)" rx="10"/>
  <text x="185" y="26" text-anchor="middle" font-size="11.5" font-weight="600" fill="var(--dg-text)">raw 1 m DTM</text>
  <text x="555" y="26" text-anchor="middle" font-size="11.5" font-weight="600" fill="var(--dg-text)">smoothed DTM</text>
  <g fill="none" stroke="var(--dg-c)" stroke-width="1.4">
    <path d="M30 60 L60 56 L80 64 L110 58 L140 66 L170 60 L200 68 L230 62 L260 70 L290 64 L330 72"/>
    <path d="M30 100 L55 94 L85 104 L105 96 L135 106 L165 98 L195 108 L225 100 L255 110 L285 102 L330 112"/>
    <path d="M30 140 L60 134 L85 146 L115 138 L145 148 L175 140 L205 150 L235 142 L265 152 L300 144 L330 154"/>
    <ellipse cx="90" cy="185" rx="10" ry="6"/><ellipse cx="160" cy="190" rx="8" ry="5"/><ellipse cx="230" cy="182" rx="11" ry="6"/><ellipse cx="290" cy="192" rx="7" ry="4"/>
  </g>
  <g fill="none" stroke="var(--dg-a)" stroke-width="1.6">
    <path d="M400 60 C480 54 560 70 700 66"/>
    <path d="M400 100 C480 94 560 110 700 106"/>
    <path d="M400 140 C480 134 560 150 700 146"/>
  </g>
  <text x="185" y="216" text-anchor="middle" font-size="10.5" fill="var(--dg-muted)">zigzags and spurious loops on flat ground</text>
  <text x="555" y="216" text-anchor="middle" font-size="10.5" fill="var(--dg-muted)">lines follow the landform</text>
</svg>

## Prerequisites

- **A bare-earth DTM** GeoTIFF from class 2 returns, ideally hydro-flattened and void-filled; see [generating a DTM GeoTIFF with writers.gdal](https://www.pythonlidar.com/ground-filtering-dtm-dsm-generation/dtm-raster-generation/generating-a-dtm-geotiff-with-writers-gdal/) and [filling NoData voids](https://www.pythonlidar.com/ground-filtering-dtm-dsm-generation/dtm-raster-generation/filling-nodata-voids-in-dtm-rasters/).
- **GDAL 3.x Python bindings** (`from osgeo import gdal, ogr`), plus rasterio, NumPy, SciPy, GeoPandas and Shapely.
- **The DTM's vertical accuracy**, from [vertical accuracy assessment](https://www.pythonlidar.com/point-cloud-data-standards-fundamentals/vertical-accuracy-assessment/), to set a defensible interval.
- **A projected CRS in metres** (or feet if the client works in feet), with the vertical datum known.
- **The client's conventions**: interval, index contour spacing, attribute names, and whether contours must be closed at tile edges.

## Core Workflow Architecture

1. **Choose the interval.** A common rule of thumb is that the contour interval should be at least about twice the NVA at 95 % confidence, so that a contour's position is meaningful. For QL2 data with NVA around 0.2 m, 0.5 m contours are defensible; 0.25 m contours are not.
2. **Mosaic and prepare.** Contour a seamless mosaic, not individual tiles, to avoid broken lines at tile edges. Fill voids and apply hydro-flattening first.
3. **Smooth.** Apply a Gaussian or median filter sized to a few cells to remove micro-relief that would produce zigzags, without shifting the landform.
4. **Contour.** Run `gdal.ContourGenerateEx` with a fixed interval and base, writing an elevation attribute.
5. **Clean.** Drop closed loops below a minimum length, simplify slightly, and tag index contours (every fifth line, typically).
6. **Deliver.** Write to GeoPackage or Shapefile with elevation, index flag and CRS; optionally DXF for CAD.

## Full Implementation

```python
"""DTM to clean, attributed contours in a GeoPackage."""
from __future__ import annotations

import logging
from pathlib import Path

import geopandas as gpd
import numpy as np
import rasterio
from osgeo import gdal, ogr, osr
from scipy import ndimage as ndi

gdal.UseExceptions()
log = logging.getLogger("contours")


def smooth_dtm(src: Path, dst: Path, sigma_cells: float = 1.5) -> None:
    with rasterio.open(src) as ds:
        z = ds.read(1, masked=True)
        profile = ds.profile
    filled = z.filled(np.nan)
    valid = ~np.isnan(filled)
    # Normalized Gaussian: smooth values and weights separately so NoData does not bleed in.
    num = ndi.gaussian_filter(np.where(valid, filled, 0.0), sigma_cells)
    den = ndi.gaussian_filter(valid.astype(float), sigma_cells)
    out = np.where(valid, num / np.maximum(den, 1e-6), profile.get("nodata", -9999))
    profile.update(dtype="float32")
    with rasterio.open(dst, "w", **profile) as o:
        o.write(out.astype("float32"), 1)


def contour(dtm: Path, gpkg: Path, interval: float, base: float = 0.0) -> None:
    ds = gdal.Open(str(dtm))
    band = ds.GetRasterBand(1)
    srs = osr.SpatialReference(wkt=ds.GetProjection())
    drv = ogr.GetDriverByName("GPKG")
    if gpkg.exists():
        drv.DeleteDataSource(str(gpkg))
    out = drv.CreateDataSource(str(gpkg))
    layer = out.CreateLayer("contours_raw", srs, ogr.wkbLineString)
    layer.CreateField(ogr.FieldDefn("id", ogr.OFTInteger))
    layer.CreateField(ogr.FieldDefn("elev", ogr.OFTReal))
    nodata = band.GetNoDataValue()
    opts = [f"LEVEL_INTERVAL={interval}", f"LEVEL_BASE={base}", "ID_FIELD=0", "ELEV_FIELD=1"]
    if nodata is not None:
        opts.append(f"NODATA={nodata}")
    gdal.ContourGenerateEx(band, layer, options=opts)
    out = None


def clean(gpkg: Path, interval: float, index_every: int = 5,
          min_loop_m: float = 40.0, simplify_m: float = 0.25) -> gpd.GeoDataFrame:
    gdf = gpd.read_file(gpkg, layer="contours_raw")
    gdf = gdf.explode(index_parts=False).reset_index(drop=True)
    closed = gdf.geometry.is_ring
    gdf = gdf[~(closed & (gdf.length < min_loop_m))].copy()
    gdf["geometry"] = gdf.geometry.simplify(simplify_m, preserve_topology=True)
    gdf["elev"] = gdf["elev"].round(3)
    steps = np.round(gdf["elev"] / interval).astype(int)
    gdf["index"] = (steps % index_every == 0).astype(int)
    gdf = gdf[["elev", "index", "geometry"]]
    gdf.to_file(gpkg, layer="contours", driver="GPKG")
    log.info("%d contour lines, %d index", len(gdf), int(gdf["index"].sum()))
    return gdf


def run(dtm: Path, out_dir: Path, interval: float = 0.5) -> gpd.GeoDataFrame:
    out_dir.mkdir(parents=True, exist_ok=True)
    smooth = out_dir / "dtm_smooth.tif"
    gpkg = out_dir / "contours.gpkg"
    smooth_dtm(dtm, smooth)
    contour(smooth, gpkg, interval)
    return clean(gpkg, interval)


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    run(Path("mosaic/county_north_dtm_1m.tif"), Path("out/contours"), interval=0.5)
```

## Code Breakdown

**Normalized Gaussian smoothing.** A plain Gaussian filter on a raster with NoData either spreads NoData or pulls edge cells toward the fill value. Smoothing the values and a validity mask separately and dividing keeps edges correct and leaves NoData cells untouched.

**`sigma_cells: 1.5`.** On a 1 m DTM this removes variation at the scale of a couple of metres — ploughing furrows, small debris, residual vegetation bumps — while moving contour positions by only centimetres on real slopes. The dedicated guide on [smoothing a LiDAR DTM before contouring](https://www.pythonlidar.com/ground-filtering-dtm-dsm-generation/contour-generation/smoothing-a-lidar-dtm-before-contouring/) quantifies the trade-off.

**`ContourGenerateEx` with named options.** `LEVEL_INTERVAL` and `LEVEL_BASE` define the elevations; `ID_FIELD` and `ELEV_FIELD` give the indexes of the fields created on the layer. Passing `NODATA` stops contours being drawn around the NoData boundary.

**Explode, then filter loops.** GDAL may emit multi-part lines. Exploding makes each part a row, so tiny closed rings — spurious loops on flat ground — can be dropped by length.

**Topology-preserving simplification.** A tolerance a quarter of a cell removes the stair-step vertices contouring produces on a grid without letting adjacent contours cross.

**Index contours by integer step.** Computing the step number from the elevation and interval avoids floating-point surprises (`elev % 2.5` on doubles is unreliable).

## Parameter Reference Table

| Parameter | Type | Default here | Typical range | Effect |
|---|---|---|---|---|
| `interval` | float, m | 0.5 | 0.25–5 | Vertical spacing; ≥ about 2 × NVA95 |
| `base` | float, m | 0.0 | — | Offset of the contour series |
| `sigma_cells` | float | 1.5 | 0.5–4 | Smoothing strength before contouring |
| `min_loop_m` | float, m | 40 | 10–200 | Shortest closed contour kept |
| `simplify_m` | float, m | 0.25 | 0.1–1.0 | Vertex reduction tolerance |
| `index_every` | int | 5 | 4–10 | Every nth contour flagged as index |

<svg viewBox="0 0 740 210" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Contour interval chosen relative to vertical accuracy" style="width:100%;max-width:740px;display:block;margin:1.6rem auto">
  <title>Interval against accuracy</title>
  <desc>A vertical scale showing a DTM's 95 percent vertical accuracy band of plus or minus 0.2 metres around a true surface. Contours at 0.25 metre spacing fall within each other's uncertainty bands and cannot be distinguished reliably. Contours at 0.5 metre spacing are separated by more than the band, so each line's position is meaningful.</desc>
  <rect x="0" y="0" width="740" height="210" fill="var(--dg-bg)" rx="10"/>
  <text x="185" y="24" text-anchor="middle" font-size="11" font-weight="600" fill="var(--dg-text)">0.25 m interval</text>
  <text x="555" y="24" text-anchor="middle" font-size="11" font-weight="600" fill="var(--dg-text)">0.5 m interval</text>
  <g fill="var(--dg-e-soft)"><rect x="60" y="48" width="250" height="32"/><rect x="60" y="88" width="250" height="32"/><rect x="60" y="128" width="250" height="32"/></g>
  <g stroke="var(--dg-c)" stroke-width="1.6"><line x1="60" y1="64" x2="310" y2="64"/><line x1="60" y1="84" x2="310" y2="84"/><line x1="60" y1="104" x2="310" y2="104"/><line x1="60" y1="124" x2="310" y2="124"/><line x1="60" y1="144" x2="310" y2="144"/></g>
  <g fill="var(--dg-d-soft)"><rect x="430" y="48" width="250" height="32"/><rect x="430" y="118" width="250" height="32"/></g>
  <g stroke="var(--dg-a)" stroke-width="1.6"><line x1="430" y1="64" x2="680" y2="64"/><line x1="430" y1="134" x2="680" y2="134"/></g>
  <text x="185" y="186" text-anchor="middle" font-size="10.5" fill="var(--dg-muted)">uncertainty bands overlap: lines not meaningful</text>
  <text x="555" y="186" text-anchor="middle" font-size="10.5" fill="var(--dg-muted)">bands separated: each line is meaningful</text>
  <text x="370" y="204" text-anchor="middle" font-size="10" fill="var(--dg-muted)">shaded: ±0.2 m (95 %) around each contour level</text>
</svg>

## Validation and Integrity Checks

- **No crossings.** Contours of different elevations must never intersect. A spatial self-join of the output checks it; any hit points to a simplification tolerance that is too large.
- **Elevations on the series.** Every `elev` value should be `base + k × interval` to rounding.
- **Continuity at mosaic joins.** If you contoured tiles separately, check for dangling line ends along tile edges; the fix is to contour the mosaic.
- **Spot comparison.** Sample the original (unsmoothed) DTM along a few contours; values should scatter tightly around the contour elevation, with a standard deviation well below the interval.

```python
from shapely.strtree import STRtree
g = gpd.read_file("out/contours/contours.gpkg", layer="contours")
tree = STRtree(g.geometry.values)
pairs = tree.query(g.geometry.values, predicate="crosses")
bad = [(i, j) for i, j in zip(*pairs) if i < j and g.elev.iat[i] != g.elev.iat[j]]
assert not bad, f"{len(bad)} crossing contour pairs"
```

## Index Contours, Labels and Cartography

Contour sets are read by people, and a few cartographic conventions make them far easier to read. Index contours — every fifth line at a 0.5 m interval, so every 2.5 m — are drawn heavier and carry elevation labels; intermediate contours are thin and unlabelled. Labels sit along the line, oriented uphill so that the top of the text faces higher ground, and are placed on straight stretches away from dense clusters. On very flat ground, supplementary contours at half the interval, drawn dashed, can show subtle relief where standard contours are hundreds of metres apart.

<svg viewBox="0 0 740 200" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Index and intermediate contours with an uphill-oriented label" style="width:100%;max-width:740px;display:block;margin:1.6rem auto">
  <title>Index contours carry the labels</title>
  <desc>Five roughly parallel contour lines on a slope. The middle one is an index contour, drawn heavier, with the label 215.0 placed along it and oriented so the text's top faces uphill. The other four are thin intermediate contours at 0.5 metre spacing without labels. An arrow indicates the uphill direction.</desc>
  <defs><marker id="ct-arw" markerWidth="9" markerHeight="7" refX="9" refY="3.5" orient="auto"><path d="M0,0 L0,7 L9,3.5 z" fill="var(--dg-line)"/></marker></defs>
  <rect x="0" y="0" width="740" height="200" fill="var(--dg-bg)" rx="10"/>
  <g fill="none" stroke="var(--dg-a)" stroke-width="1.1"><path d="M40 40 C200 30 400 50 620 36"/><path d="M40 70 C200 60 400 80 620 66"/><path d="M40 130 C200 120 400 140 620 126"/><path d="M40 160 C200 150 400 170 620 156"/></g>
  <path d="M40 100 C200 90 290 108 330 106" fill="none" stroke="var(--dg-a)" stroke-width="2.6"/>
  <path d="M410 108 C470 108 540 100 620 96" fill="none" stroke="var(--dg-a)" stroke-width="2.6"/>
  <text x="370" y="110" text-anchor="middle" font-size="11" fill="var(--dg-text)">215.0</text>
  <line x1="680" y1="170" x2="680" y2="40" stroke="var(--dg-line)" stroke-width="1.4" marker-end="url(#ct-arw)"/>
  <text x="672" y="186" text-anchor="end" font-size="10.5" fill="var(--dg-muted)">uphill</text>
  <text x="40" y="190" font-size="10.5" fill="var(--dg-muted)">heavy: index contour, labelled · thin: intermediate, 0.5 m apart</text>
</svg>

None of this needs to be baked into the geometry. Deliver lines with an `elev` value and an `index` flag, and let the client's GIS or CAD style them. What does need care in the data is line continuity: labelling engines place labels on long, unbroken lines, so contours split at every tile edge or simplified into fragments label poorly.

## Contours for CAD and Engineering Users

Many engineering users will load contours into CAD rather than GIS. Three details avoid friction there. First, CAD tools expect 3D polylines or 2D lines with elevation; writing each line's Z coordinate equal to its elevation (a 3D line string) serves both. Second, units must match the drawing — US projects often work in US survey feet, so contour the DTM in the delivery units or convert elevations and interval together, never one without the other. Third, a DXF export with the elevation in a layer name or attribute follows most CAD conventions; GDAL's DXF driver writes it from the same GeoDataFrame used for the GeoPackage.

Engineers also tend to ask for finer intervals than the data supports. The honest response is to deliver the defensible interval and, if needed, a separately labelled set of supplementary contours with an explicit note on accuracy, rather than a dense set that looks precise and is not.

## Performance Tuning

Contouring is fast; a 20 km × 20 km mosaic at 1 m takes a minute or two. The expensive parts are smoothing very large rasters in memory and writing hundreds of thousands of features.

- **Contour a VRT mosaic.** `gdal.BuildVRT` over tiles gives GDAL a seamless virtual raster without copying data.
- **Smooth in blocks with overlap.** For rasters too large for memory, smooth windows with a margin of 4 × sigma and write the interiors.
- **Coarsen for small-scale maps.** 2 m or 5 m contours for a regional map can come from a DTM resampled to 2–5 m, which is much faster and smoother.

## Common Errors and Troubleshooting

**Contours zigzag along cell edges.** No smoothing, or simplification set to zero. Apply a small Gaussian and simplify at a quarter of a cell.

**Thousands of tiny loops.** Micro-relief on flat ground crosses contour levels. Smooth more, raise the interval, or drop short closed loops.

**Contours around NoData holes.** NoData was not passed to the contouring call, or voids were not filled. Fill voids first, or pass `NODATA` so GDAL skips them.

**Lines stop at tile edges.** Tiles were contoured one by one. Contour a mosaic instead.

**Contours drawn across lakes.** The DTM was not hydro-flattened; interpolated water surfaces produce meaningless lines. Flatten water first, as in [hydro-flattening water bodies in a DTM](https://www.pythonlidar.com/lidar-classification-feature-extraction/water-and-bridge-classification/hydro-flattening-water-bodies-in-a-dtm/).

## Frequently Asked Questions

**What contour interval should I use for LiDAR?**

One the vertical accuracy supports: roughly twice the 95 percent vertical accuracy or more. For typical QL2 data that means 0.5 metres or coarser; tighter intervals imply precision the data does not have.

**Should I smooth the DTM before contouring?**

Yes, lightly. A small Gaussian filter removes micro-relief that makes contours zigzag and form spurious loops, while moving real contours by only centimetres. Heavy smoothing flattens real landforms, so keep it modest and check the result.

**How do I generate contours in Python?**

Use GDAL's ContourGenerateEx on the DTM band with LEVEL_INTERVAL, LEVEL_BASE and field options, writing into an OGR layer such as a GeoPackage. GeoPandas can then clean and attribute the lines.

**Should I contour tiles or a mosaic?**

A mosaic. Contouring tiles separately breaks every line at every tile edge and can produce slightly different line positions on either side of a seam. Build a virtual mosaic with gdal.BuildVRT and contour that once; if the area is too large, contour overlapping blocks and merge lines by elevation afterwards.

**Why do contours cross after simplification?**

Because the simplification tolerance was large compared with the spacing between adjacent contours on steep ground. Use topology-preserving simplification, keep the tolerance to a fraction of a cell, and check the output for crossings with a spatial join before delivery.

**Can I produce contours in feet from a metre DTM?**

Yes, but convert elevations first: multiply the DTM by the appropriate foot factor, or contour in metres with an interval equivalent to the desired feet and convert the elevation attribute afterwards. Be explicit about US survey feet versus international feet, and state the vertical datum in the metadata.

**What are index contours?**

Every fifth contour, typically, drawn heavier and labelled on maps to make elevations easy to read. Flag them with an attribute so cartographic styling can pick them out.

## Related

- [Generating Contours from a DTM with gdal_contour](https://www.pythonlidar.com/ground-filtering-dtm-dsm-generation/contour-generation/generating-contours-from-a-dtm-with-gdal-contour/) — the command-line route
- [Smoothing a LiDAR DTM Before Contouring](https://www.pythonlidar.com/ground-filtering-dtm-dsm-generation/contour-generation/smoothing-a-lidar-dtm-before-contouring/) — choosing the filter
- [Exporting Contours to GeoPackage](https://www.pythonlidar.com/ground-filtering-dtm-dsm-generation/contour-generation/exporting-contours-to-geopackage/) — attributes and delivery
- [DTM Raster Generation](https://www.pythonlidar.com/ground-filtering-dtm-dsm-generation/dtm-raster-generation/) — the surface contours come from
- [Hillshade, Slope and Aspect](https://www.pythonlidar.com/ground-filtering-dtm-dsm-generation/hillshade-slope-aspect/) — other terrain derivatives
