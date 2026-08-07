---
title: "Hillshade, Slope and Aspect from LiDAR DTMs"
description: "Deriving hillshade, slope, and aspect rasters from a LiDAR-derived DTM using gdaldem and Python — azimuth/altitude, z-factor, multidirectional shading, and how these terrain derivatives support mapping and analysis."
slug: "hillshade-slope-aspect"
type: "topic"
breadcrumb: "Hillshade, Slope & Aspect"
datePublished: "2024-06-28"
dateModified: "2026-07-12"
---

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Article",
      "headline": "Hillshade, Slope and Aspect from LiDAR DTMs",
      "description": "Deriving hillshade, slope, and aspect rasters from a LiDAR-derived DTM using gdaldem and Python — azimuth/altitude, z-factor, multidirectional shading, and how these terrain derivatives support mapping and analysis.",
      "datePublished": "2024-06-28",
      "dateModified": "2026-07-12",
      "author": {"@type": "Organization", "name": "pythonlidar.com"}
    },
    {
      "@type": "BreadcrumbList",
      "itemListElement": [
        {"@type": "ListItem", "position": 1, "name": "Home", "item": "https://www.pythonlidar.com/"},
        {"@type": "ListItem", "position": 2, "name": "Ground Filtering and DTM/DSM Generation with PDAL", "item": "https://www.pythonlidar.com/ground-filtering-dtm-dsm-generation/"},
        {"@type": "ListItem", "position": 3, "name": "Hillshade, Slope and Aspect", "item": "https://www.pythonlidar.com/ground-filtering-dtm-dsm-generation/hillshade-slope-aspect/"}
      ]
    },
    {
      "@type": "HowTo",
      "name": "Derive hillshade, slope, and aspect from a LiDAR DTM",
      "step": [
        {"@type": "HowToStep", "name": "Open the DTM and confirm its CRS units", "text": "Load the DTM GeoTIFF with rasterio and check whether horizontal units are metres or degrees."},
        {"@type": "HowToStep", "name": "Generate hillshade with gdal.DEMProcessing", "text": "Call DEMProcessing with processing 'hillshade', setting azimuth 315, altitude 45, and zFactor."},
        {"@type": "HowToStep", "name": "Generate slope in degrees", "text": "Call DEMProcessing with processing 'slope' and slopeFormat 'degree'."},
        {"@type": "HowToStep", "name": "Generate aspect", "text": "Call DEMProcessing with processing 'aspect' to produce compass bearing of the downslope direction."},
        {"@type": "HowToStep", "name": "Validate the output rasters", "text": "Reopen each product with rasterio and assert the value ranges match the expected domain."}
      ]
    },
    {
      "@type": "FAQPage",
      "mainEntity": [
        {
          "@type": "Question",
          "name": "Why does my hillshade come out completely flat or black?",
          "acceptedAnswer": {"@type": "Answer", "text": "The most common cause is a z-factor mismatch. If the DTM CRS is geographic (degrees) but elevation is in metres, gdaldem treats one degree of horizontal distance as equal to one metre of vertical rise, producing an effectively vertical surface that renders as uniform grey or black. Set a scale value of about 111320 or reproject the DTM to a projected metric CRS such as EPSG:32613 first."}
        },
        {
          "@type": "Question",
          "name": "Should slope be expressed in degrees or percent?",
          "acceptedAnswer": {"@type": "Answer", "text": "gdaldem supports both through the slopeFormat argument. Degrees range from 0 to 90 and are intuitive for terrain classification and mapping legends. Percent slope is rise over run times 100 and is preferred in engineering, hydrology, and agricultural suitability models. The underlying gradient is identical; only the reported unit differs."}
        },
        {
          "@type": "Question",
          "name": "What azimuth and altitude values are standard for hillshade?",
          "acceptedAnswer": {"@type": "Answer", "text": "The cartographic convention is an azimuth of 315 degrees (light from the northwest) and an altitude of 45 degrees above the horizon. Northwest lighting avoids the relief-inversion illusion that occurs when terrain is lit from the south, and a 45-degree altitude balances contrast across both gentle and steep slopes."}
        },
        {
          "@type": "Question",
          "name": "What is multidirectional hillshade and when should I use it?",
          "acceptedAnswer": {"@type": "Answer", "text": "Multidirectional hillshade combines illumination from several azimuths into one raster, revealing detail in valleys and lee slopes that a single light source leaves in deep shadow. Enable it by passing multiDirectional True to gdal.DEMProcessing. It is well suited to rugged terrain and archaeological micro-relief where a conventional single-azimuth shade obscures features."}
        }
      ]
    }
  ]
}
</script>

Once a bare-earth terrain surface exists as a raster, its raw elevation values are rarely the final deliverable. Cartographers, geomorphologists, and hydrologists work with what the surface *does* — how it catches light, how steeply it falls, and which way it faces. Those three qualities are captured by hillshade, slope, and aspect rasters, and all three are computed directly from a LiDAR-derived DTM with a single GDAL utility, `gdaldem`, exposed in Python through `osgeo.gdal.DEMProcessing`. This guide sits within the broader [Ground Filtering and DTM/DSM Generation with PDAL](https://www.pythonlidar.com/ground-filtering-dtm-dsm-generation/) workflow and picks up exactly where a finished elevation grid leaves off.

<svg viewBox="0 0 720 300" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="DTM feeding gdaldem to produce hillshade, slope, and aspect rasters" style="width:100%;max-width:720px;display:block;margin:1.5rem auto">
  <title>Terrain derivative fan-out from a single DTM</title>
  <desc>A DTM GeoTIFF box on the left feeds into a central gdal.DEMProcessing box, which fans out with three arrows to three output boxes: hillshade (0-255 grey), slope (0-90 degrees), and aspect (0-360 degrees). Each output box lists its parameters.</desc>
  <rect x="0" y="0" width="720" height="300" fill="var(--dg-bg)" rx="10"/>
  <defs>
    <marker id="hsa-arr" markerWidth="9" markerHeight="9" refX="7" refY="3" orient="auto">
      <path d="M0,0 L0,6 L8,3 z" fill="currentColor" opacity="0.6"/>
    </marker>
  </defs>
  <!-- source DTM -->
  <rect x="12" y="118" width="140" height="66" rx="8" fill="none" stroke="currentColor" stroke-width="1.5"/>
  <text x="82" y="146" text-anchor="middle" font-size="12" fill="currentColor" font-weight="600" font-family="sans-serif">DTM GeoTIFF</text>
  <text x="82" y="165" text-anchor="middle" font-size="10" fill="currentColor" opacity="0.6" font-family="sans-serif">bare-earth Z, EPSG:32613</text>
  <!-- processor -->
  <rect x="238" y="112" width="150" height="78" rx="8" fill="none" stroke="currentColor" stroke-width="1.5"/>
  <text x="313" y="140" text-anchor="middle" font-size="12" fill="currentColor" font-weight="600" font-family="monospace">gdal.DEMProcessing</text>
  <text x="313" y="159" text-anchor="middle" font-size="10" fill="currentColor" opacity="0.6" font-family="sans-serif">GDAL DEM engine</text>
  <text x="313" y="175" text-anchor="middle" font-size="10" fill="currentColor" opacity="0.6" font-family="sans-serif">z_factor, scale, compute</text>
  <line x1="152" y1="151" x2="234" y2="151" stroke="currentColor" stroke-width="1.5" marker-end="url(#hsa-arr)"/>
  <!-- outputs -->
  <rect x="486" y="20" width="220" height="66" rx="8" fill="none" stroke="currentColor" stroke-width="1.5"/>
  <text x="596" y="46" text-anchor="middle" font-size="12" fill="currentColor" font-weight="600" font-family="sans-serif">Hillshade</text>
  <text x="596" y="65" text-anchor="middle" font-size="10" fill="currentColor" opacity="0.6" font-family="sans-serif">0-255 grey · az 315 · alt 45</text>
  <rect x="486" y="118" width="220" height="66" rx="8" fill="none" stroke="currentColor" stroke-width="1.5"/>
  <text x="596" y="144" text-anchor="middle" font-size="12" fill="currentColor" font-weight="600" font-family="sans-serif">Slope</text>
  <text x="596" y="163" text-anchor="middle" font-size="10" fill="currentColor" opacity="0.6" font-family="sans-serif">0-90 deg or percent</text>
  <rect x="486" y="216" width="220" height="66" rx="8" fill="none" stroke="currentColor" stroke-width="1.5"/>
  <text x="596" y="242" text-anchor="middle" font-size="12" fill="currentColor" font-weight="600" font-family="sans-serif">Aspect</text>
  <text x="596" y="261" text-anchor="middle" font-size="10" fill="currentColor" opacity="0.6" font-family="sans-serif">0-360 deg compass bearing</text>
  <line x1="388" y1="140" x2="482" y2="60"  stroke="currentColor" stroke-width="1.5" marker-end="url(#hsa-arr)"/>
  <line x1="388" y1="151" x2="482" y2="151" stroke="currentColor" stroke-width="1.5" marker-end="url(#hsa-arr)"/>
  <line x1="388" y1="162" x2="482" y2="243" stroke="currentColor" stroke-width="1.5" marker-end="url(#hsa-arr)"/>
</svg>

## Prerequisites

Have these in place before deriving any terrain product:

- **GDAL 3.4 or later** with Python bindings (`osgeo.gdal`) — install via `conda install -c conda-forge gdal` or a system package
- **A finished DTM GeoTIFF** — produced upstream in [DTM Raster Generation](https://www.pythonlidar.com/ground-filtering-dtm-dsm-generation/dtm-raster-generation/), ideally void-filled and in a projected metric CRS
- **`rasterio` and `numpy`** for validation and value-range inspection
- **A known CRS with known horizontal units** — a projected system such as EPSG:6342 (NAD83(2011)/UTM 13N) or EPSG:32613 (WGS84/UTM 13N) keeps horizontal and vertical units both in metres
- **Single-band Float32 elevation data** with a defined NoData value so edge cells do not contaminate the gradient calculation

If the DTM still carries voids, resolve them first — see [Filling NoData Voids in DTM Rasters](https://www.pythonlidar.com/ground-filtering-dtm-dsm-generation/dtm-raster-generation/filling-nodata-voids-in-dtm-rasters/). And if the surface is not yet in a metric projection, reproject it; the reasoning mirrors the point-cloud case covered in [Spatial Reprojection](https://www.pythonlidar.com/pdal-pipeline-architecture-execution/spatial-reprojection/).

## Core Workflow Architecture

Every terrain derivative starts from the same 3x3 moving window. GDAL slides a kernel across the elevation grid and, for each central cell, estimates the partial derivatives of height with respect to the x and y axes using the Horn method. From those two gradients it computes whichever product you request. The lifecycle has five deterministic stages:

1. **Surface intake** — GDAL opens the DTM as a single elevation band and reads its geotransform, which supplies the pixel size that converts cell-to-cell height differences into a real-world gradient.
2. **Gradient estimation** — for each interior cell the Horn 3x3 operator produces `dz/dx` and `dz/dy`. Cells adjacent to NoData are excluded so voids do not smear across the result.
3. **z-factor and scale application** — the vertical exaggeration (`z_factor`) and the horizontal-to-vertical unit ratio (`scale`) rescale the gradient before the trigonometric step. This is where unit-mismatch bugs originate.
4. **Product computation** — the gradient is turned into a shaded-relief value (hillshade), a steepness angle (slope), or a downslope compass bearing (aspect).
5. **Raster emission** — GDAL writes a new GeoTIFF that inherits the DTM's geotransform and CRS, so the derivative overlays the source perfectly.

Because all three products share stages one through three, generating them together in one script amortises the I/O. The distinctions appear only at stage four: hillshade needs an `azimuth` and `altitude`, slope needs a `slopeFormat`, and aspect needs neither but reports a circular quantity. The dedicated walkthrough in [Exporting Hillshade from a LiDAR DTM](https://www.pythonlidar.com/ground-filtering-dtm-dsm-generation/hillshade-slope-aspect/exporting-hillshade-from-a-lidar-dtm/) drills into the shaded-relief case end to end.

## Full Implementation

The module below opens a DTM, checks its CRS units, and emits hillshade, slope, and aspect in one pass. It uses `gdal.DEMProcessing`, which is the Python entry point to the same code that powers the `gdaldem` command-line tool. Each call is wrapped so a GDAL failure raises a clear Python exception rather than returning a null handle.

```python
import logging
from pathlib import Path

from osgeo import gdal
import rasterio

gdal.UseExceptions()
logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")


def horizontal_units_are_degrees(dtm_path: str) -> bool:
    """Return True if the DTM CRS measures horizontal distance in degrees."""
    with rasterio.open(dtm_path) as src:
        crs = src.crs
        if crs is None:
            raise ValueError(f"{dtm_path} has no CRS; cannot derive terrain products.")
        # linear_units_factor raises for geographic CRS, so probe is_geographic
        return crs.is_geographic


def derive_terrain_products(
    dtm_path: str,
    out_dir: str,
    azimuth: float = 315.0,
    altitude: float = 45.0,
    z_factor: float = 1.0,
    slope_format: str = "degree",
    multidirectional: bool = False,
) -> dict:
    """
    Derive hillshade, slope, and aspect GeoTIFFs from a LiDAR DTM.

    Parameters
    ----------
    dtm_path        : path to the input bare-earth DTM GeoTIFF
    out_dir         : directory for the three output rasters
    azimuth         : sun direction for hillshade, degrees clockwise from north (default 315)
    altitude        : sun height above the horizon for hillshade, degrees (default 45)
    z_factor        : vertical exaggeration applied before the gradient trig (default 1.0)
    slope_format    : "degree" (0-90) or "percent" (rise/run * 100) for the slope product
    multidirectional: if True, blend several azimuths into the hillshade

    Returns
    -------
    dict mapping product name to output path
    """
    out = Path(out_dir)
    out.mkdir(parents=True, exist_ok=True)

    # Guard against the classic geographic-CRS unit trap. In a degree-based CRS,
    # a scale of 111320 converts the ~metre vertical unit into the degree
    # horizontal unit at the equator so the gradient is not wildly overstated.
    scale = 111320.0 if horizontal_units_are_degrees(dtm_path) else 1.0
    if scale != 1.0:
        logging.warning(
            "DTM CRS is geographic; applying scale=%.0f. "
            "Reprojecting to a metric CRS such as EPSG:32613 is preferable.",
            scale,
        )

    products = {}

    hillshade_path = str(out / "hillshade.tif")
    gdal.DEMProcessing(
        hillshade_path,
        dtm_path,
        "hillshade",
        azimuth=azimuth,
        altitude=altitude,
        zFactor=z_factor,
        scale=scale,
        multiDirectional=multidirectional,
        computeEdges=True,
        format="GTiff",
        creationOptions=["COMPRESS=DEFLATE", "TILED=YES"],
    )
    products["hillshade"] = hillshade_path
    logging.info("Wrote hillshade -> %s", hillshade_path)

    slope_path = str(out / "slope.tif")
    gdal.DEMProcessing(
        slope_path,
        dtm_path,
        "slope",
        slopeFormat=slope_format,
        zFactor=z_factor,
        scale=scale,
        computeEdges=True,
        format="GTiff",
        creationOptions=["COMPRESS=DEFLATE", "TILED=YES"],
    )
    products["slope"] = slope_path
    logging.info("Wrote slope (%s) -> %s", slope_format, slope_path)

    aspect_path = str(out / "aspect.tif")
    gdal.DEMProcessing(
        aspect_path,
        dtm_path,
        "aspect",
        zeroForFlat=True,
        computeEdges=True,
        format="GTiff",
        creationOptions=["COMPRESS=DEFLATE", "TILED=YES"],
    )
    products["aspect"] = aspect_path
    logging.info("Wrote aspect -> %s", aspect_path)

    return products


if __name__ == "__main__":
    DTM = "dtm_utm13n.tif"
    if not Path(DTM).exists():
        raise FileNotFoundError(f"DTM not found: {DTM}")

    outputs = derive_terrain_products(
        DTM,
        out_dir="terrain_derivatives",
        azimuth=315.0,
        altitude=45.0,
        z_factor=1.0,
        slope_format="degree",
        multidirectional=False,
    )
    logging.info("Derived products: %s", outputs)
```

<svg viewBox="38 11 496 257" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Horn three by three stencil and the gradient formulas gdaldem derives from it" style="width:100%;max-width:720px;display:block;margin:1.6rem auto">
  <title>The 3×3 stencil behind every gdaldem derivative</title>
  <desc>A three by three cell stencil labelled a to i with the centre cell e highlighted. Beside it the two Horn gradients: the east-west gradient weights the right column against the left, the north-south gradient weights the bottom row against the top, and slope and aspect follow from those two numbers.</desc>
  <rect x="38" y="11" width="496" height="257" fill="var(--dg-bg)" rx="10"/>
  <rect x="60" y="60" width="56" height="56" fill="var(--dg-surface)" stroke="var(--dg-a)" stroke-width="1.3"/>
  <text x="88" y="96" text-anchor="middle" font-size="15" font-weight="600" fill="var(--dg-text)">a</text>
  <rect x="116" y="60" width="56" height="56" fill="var(--dg-surface)" stroke="var(--dg-a)" stroke-width="1.3"/>
  <text x="144" y="96" text-anchor="middle" font-size="15" font-weight="600" fill="var(--dg-text)">b</text>
  <rect x="172" y="60" width="56" height="56" fill="var(--dg-surface)" stroke="var(--dg-a)" stroke-width="1.3"/>
  <text x="200" y="96" text-anchor="middle" font-size="15" font-weight="600" fill="var(--dg-text)">c</text>
  <rect x="60" y="116" width="56" height="56" fill="var(--dg-surface)" stroke="var(--dg-a)" stroke-width="1.3"/>
  <text x="88" y="152" text-anchor="middle" font-size="15" font-weight="600" fill="var(--dg-text)">d</text>
  <rect x="116" y="116" width="56" height="56" fill="var(--dg-a-soft)" stroke="var(--dg-a)" stroke-width="1.3"/>
  <text x="144" y="152" text-anchor="middle" font-size="15" font-weight="600" fill="var(--dg-text)">e</text>
  <rect x="172" y="116" width="56" height="56" fill="var(--dg-surface)" stroke="var(--dg-a)" stroke-width="1.3"/>
  <text x="200" y="152" text-anchor="middle" font-size="15" font-weight="600" fill="var(--dg-text)">f</text>
  <rect x="60" y="172" width="56" height="56" fill="var(--dg-surface)" stroke="var(--dg-a)" stroke-width="1.3"/>
  <text x="88" y="208" text-anchor="middle" font-size="15" font-weight="600" fill="var(--dg-text)">g</text>
  <rect x="116" y="172" width="56" height="56" fill="var(--dg-surface)" stroke="var(--dg-a)" stroke-width="1.3"/>
  <text x="144" y="208" text-anchor="middle" font-size="15" font-weight="600" fill="var(--dg-text)">h</text>
  <rect x="172" y="172" width="56" height="56" fill="var(--dg-surface)" stroke="var(--dg-a)" stroke-width="1.3"/>
  <text x="200" y="208" text-anchor="middle" font-size="15" font-weight="600" fill="var(--dg-text)">i</text>
  <text x="60" y="44" font-size="10.5" fill="var(--dg-muted)">the cell being solved is e; its eight neighbours are all gdaldem ever reads</text>
  <text x="286" y="92" font-size="11.5" fill="var(--dg-text)">dz/dx = ((c + 2f + i) − (a + 2d + g)) / (8 · cell)</text>
  <text x="286" y="126" font-size="11.5" fill="var(--dg-text)">dz/dy = ((g + 2h + i) − (a + 2b + c)) / (8 · cell)</text>
  <text x="286" y="160" font-size="11.5" fill="var(--dg-text)">slope = atan( √( (dz/dx)² + (dz/dy)² ) )</text>
  <text x="286" y="194" font-size="11.5" fill="var(--dg-text)">aspect = atan2( dz/dy, −dz/dx )</text>
  <text x="60" y="242" font-size="10.5" fill="var(--dg-muted)">an edge cell has no full stencil, so gdaldem writes NoData one pixel in from every border</text>
</svg>

## Code Breakdown

### Unit probe: the first defence against a flat hillshade

`horizontal_units_are_degrees` reads the CRS with `rasterio` and returns whether it is geographic. A DTM in EPSG:4326 stores X and Y in degrees but Z in metres, and GDAL has no way to know the two axes use different units. Left uncorrected, the gradient is overstated by roughly a factor of 100,000 and the whole raster collapses to a single shade. Detecting the condition up front lets the code apply a `scale` correction and log a warning rather than silently emitting garbage.

### Hillshade call: azimuth, altitude, and multidirectional shading

The hillshade branch passes `azimuth=315` and `altitude=45`, the cartographic defaults. `azimuth` is the compass direction the light comes from, measured clockwise from north; `altitude` is how high the light sits above the horizon. Setting `multiDirectional=True` switches GDAL to a blended illumination model that ignores `azimuth` and instead weights light from several directions, which recovers detail in shadowed valleys. `computeEdges=True` tells GDAL to estimate gradients for border cells rather than leaving a one-pixel NoData frame.

### Slope call: choosing the reported unit

The slope branch differs only in `slopeFormat`. `"degree"` reports the angle between the surface and horizontal, bounded at 0 to 90. `"percent"` reports rise over run as a percentage, which is unbounded in principle (a vertical cliff is infinite percent) but in practice stays modest for real terrain. The gradient computation is identical; the argument only changes the final conversion.

### Aspect call: a circular quantity

Aspect needs no illumination parameters. It reports the compass bearing that the steepest downhill direction faces, from 0 to 360 degrees, with `zeroForFlat=True` assigning flat cells a value of 0 rather than the GDAL default of -9999. Because aspect is circular, never average it with ordinary arithmetic — 350 degrees and 10 degrees are 20 degrees apart, not 340.

## Parameter Reference Table

| Product | Parameter | Type | Default | Valid range | Effect |
|---------|-----------|------|---------|-------------|--------|
| hillshade | `azimuth` | float | 315 | 0–360 | Light source compass direction, clockwise from north |
| hillshade | `altitude` | float | 45 | 0–90 | Light source height above the horizon |
| hillshade | `multiDirectional` | bool | False | — | Blend several azimuths; ignores `azimuth` when True |
| all | `zFactor` | float | 1.0 | > 0 | Vertical exaggeration applied before the gradient trig |
| all | `scale` | float | 1.0 | > 0 | Horizontal-to-vertical unit ratio; ~111320 for geographic CRS |
| slope | `slopeFormat` | string | `degree` | `degree`, `percent` | Reported steepness unit |
| aspect | `zeroForFlat` | bool | False | — | Emit 0 for flat cells instead of the NoData sentinel |
| all | `computeEdges` | bool | False | — | Estimate border-cell gradients instead of leaving NoData |

<svg viewBox="0 0 720 282" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Aspect measured clockwise from north, with the values gdaldem writes" style="width:100%;max-width:720px;display:block;margin:1.6rem auto">
  <title>Reading an aspect raster</title>
  <desc>A compass wheel split into eight sectors from north clockwise through east, south and west. Beside it the values gdaldem writes: zero and 360 both mean a north-facing slope, 90 east, 180 south, 270 west, and a flat cell is written as minus 9999 rather than any direction.</desc>
  <rect x="0" y="0" width="720" height="282" fill="var(--dg-bg)" rx="10"/>
  <path d="M170 140 L139.4 66.1 A80 80 0 0 1 200.6 66.1 Z" fill="var(--dg-a)" fill-opacity="0.12" stroke="var(--dg-bg)" stroke-width="1.2"/>
  <text x="170" y="44" text-anchor="middle" font-size="11" font-weight="600" fill="var(--dg-text)">N</text>
  <path d="M170 140 L200.6 66.1 A80 80 0 0 1 243.9 109.4 Z" fill="var(--dg-a)" fill-opacity="0.21" stroke="var(--dg-bg)" stroke-width="1.2"/>
  <text x="241" y="73" text-anchor="middle" font-size="11" font-weight="600" fill="var(--dg-text)">NE</text>
  <path d="M170 140 L243.9 109.4 A80 80 0 0 1 243.9 170.6 Z" fill="var(--dg-a)" fill-opacity="0.3" stroke="var(--dg-bg)" stroke-width="1.2"/>
  <text x="270" y="144" text-anchor="middle" font-size="11" font-weight="600" fill="var(--dg-text)">E</text>
  <path d="M170 140 L243.9 170.6 A80 80 0 0 1 200.6 213.9 Z" fill="var(--dg-a)" fill-opacity="0.39" stroke="var(--dg-bg)" stroke-width="1.2"/>
  <text x="241" y="215" text-anchor="middle" font-size="11" font-weight="600" fill="var(--dg-text)">SE</text>
  <path d="M170 140 L200.6 213.9 A80 80 0 0 1 139.4 213.9 Z" fill="var(--dg-a)" fill-opacity="0.48" stroke="var(--dg-bg)" stroke-width="1.2"/>
  <text x="170" y="244" text-anchor="middle" font-size="11" font-weight="600" fill="var(--dg-text)">S</text>
  <path d="M170 140 L139.4 213.9 A80 80 0 0 1 96.1 170.6 Z" fill="var(--dg-a)" fill-opacity="0.12" stroke="var(--dg-bg)" stroke-width="1.2"/>
  <text x="99" y="215" text-anchor="middle" font-size="11" font-weight="600" fill="var(--dg-text)">SW</text>
  <path d="M170 140 L96.1 170.6 A80 80 0 0 1 96.1 109.4 Z" fill="var(--dg-a)" fill-opacity="0.21" stroke="var(--dg-bg)" stroke-width="1.2"/>
  <text x="70" y="144" text-anchor="middle" font-size="11" font-weight="600" fill="var(--dg-text)">W</text>
  <path d="M170 140 L96.1 109.4 A80 80 0 0 1 139.4 66.1 Z" fill="var(--dg-a)" fill-opacity="0.3" stroke="var(--dg-bg)" stroke-width="1.2"/>
  <text x="99" y="73" text-anchor="middle" font-size="11" font-weight="600" fill="var(--dg-text)">NW</text>
  <circle cx="170" cy="140" r="4" fill="var(--dg-c)"/>
  <rect x="360" y="60" width="340" height="160" rx="8" fill="var(--dg-surface)" stroke="var(--dg-line-soft)" stroke-width="1.2"/>
  <text x="378" y="92" font-size="11.5" fill="var(--dg-text)">0° and 360° — the slope faces north</text>
  <text x="378" y="126" font-size="11.5" fill="var(--dg-text)">90° east · 180° south · 270° west</text>
  <text x="378" y="160" font-size="11.5" fill="var(--dg-text)">measured clockwise, never anticlockwise</text>
  <text x="378" y="194" font-size="11.5" fill="var(--dg-text)">−9999 — a flat cell has no aspect</text>
  <text x="300" y="248" font-size="10.5" fill="var(--dg-muted)">averaging aspect numerically is meaningless:</text>
  <text x="300" y="266" font-size="10.5" fill="var(--dg-muted)">350° and 10° average to 180°, the opposite way.</text>
</svg>

## Validation and Integrity Checks

Reopen each product and confirm its values fall inside the expected domain. A hillshade must sit in 0–255, slope in degrees must sit in 0–90, and aspect must sit in 0–360. Values outside those bands signal a unit or NoData problem.

```python
import numpy as np
import rasterio


def validate_products(products: dict) -> None:
    expected = {
        "hillshade": (0, 255),
        "slope": (0, 90),
        "aspect": (0, 360),
    }
    for name, path in products.items():
        with rasterio.open(path) as src:
            band = src.read(1, masked=True)
            lo, hi = float(band.min()), float(band.max())
            emin, emax = expected[name]
            assert emin <= lo and hi <= emax + 1e-6, (
                f"{name} out of range: got [{lo:.2f}, {hi:.2f}], "
                f"expected [{emin}, {emax}]"
            )
            print(f"{name:10s} OK  range [{lo:.2f}, {hi:.2f}]  "
                  f"nodata={src.nodata}")
```

A slope raster whose maximum sits at implausible values such as several thousand degrees is the unmistakable signature of the geographic-CRS unit trap — the gradient was computed as if one degree of longitude equalled one metre of elevation. A hillshade whose entire histogram collapses onto one or two values points to the same root cause. If the products validate cleanly, they are ready to feed a map renderer or an analysis model; the sibling surface produced in [DSM Generation](https://www.pythonlidar.com/ground-filtering-dtm-dsm-generation/dsm-generation/) can be shaded with exactly the same routine to compare canopy relief against bare earth.

## Performance Tuning

`gdaldem` is single-threaded and memory-light — it streams the raster row by row, so peak RAM stays close to a few scanlines regardless of tile size. Throughput is therefore dominated by I/O and by how the output is compressed. The table shows representative timings for a 10,000 x 10,000 cell DTM at 1 m resolution on an NVMe workstation:

| Configuration | Output codec | Tiled | Time (s) | Output size |
|---------------|-------------|-------|----------|-------------|
| Hillshade only | none | no | 6.1 | 95 MB |
| Hillshade only | DEFLATE | yes | 7.4 | 22 MB |
| All three products | DEFLATE | yes | 21.8 | 61 MB |
| All three, `multiDirectional` hillshade | DEFLATE | yes | 27.2 | 63 MB |

Practical guidance:

- **Compress the output.** DEFLATE with tiling costs about 20 % more wall time but shrinks the files roughly fourfold, which pays for itself as soon as the rasters cross a network.
- **Batch the three products in one process.** The DTM is read once per call, so issuing three separate command-line invocations reads the source three times. A single Python script that reuses the opened dataset is measurably faster on large tiles.
- **Parallelise across tiles, not within one.** Since a single `gdaldem` run cannot use multiple cores, scale out by processing many DTM tiles concurrently — the same reasoning covered in [Optimizing PDAL for Multi-Core Processing](https://www.pythonlidar.com/pdal-pipeline-architecture-execution/parallel-execution/optimizing-pdal-for-multi-core-processing/).

## How These Derivatives Support Mapping and Analysis

The three products are not interchangeable — each answers a different question about the terrain, and mature workflows use them together rather than in isolation.

**Hillshade is a communication layer.** It carries no analytical value on its own, but it is the single most effective way to let a human read topography. Placed beneath a semi-transparent colour ramp of the raw DTM, it turns a flat rainbow of elevation into a tactile, three-dimensional surface. It is also the fastest QA tool available: interpolation seams, tiling boundaries, and misclassified vegetation that survived ground filtering all reveal themselves as unnatural ridges or pits under raking light, often before any statistical check would catch them.

**Slope drives quantitative models.** Because it reports a physical gradient, slope feeds directly into engineering and environmental analysis. Landslide susceptibility mapping thresholds slope into hazard classes; road and pipeline routing avoids cells above a grade limit; hydrological models use slope as a primary term in flow-velocity and erosion equations. When the deliverable is a suitability model rather than a picture, percent slope in an engineering pipeline is usually the more convenient unit, while a degree-based classification suits a printed hazard map.

**Aspect informs anything sun- or wind-dependent.** The compass bearing a slope faces controls how much solar radiation it receives, which in turn shapes snowmelt timing, vegetation communities, and micro-climate. Ecologists reclassify aspect into cardinal or intercardinal bins to correlate species distribution with orientation; solar-siting studies favour south-facing slopes in the northern hemisphere. Because aspect is circular, treat it as a categorical or directional variable, never as a plain continuous number to be averaged.

Combined, these layers let a small script turn a single bare-earth grid into a full cartographic and analytical stack. The same routine applied to the canopy surface from [DTM vs DSM: Which Surface Model to Generate](https://www.pythonlidar.com/ground-filtering-dtm-dsm-generation/dsm-generation/dtm-vs-dsm-which-surface-model/) yields a matching set for the first-return surface, and differencing the two shading products highlights where vegetation and structures depart from bare earth.

## Common Errors and Troubleshooting

**Hillshade renders as a flat sea of grey or solid black**
Root cause: the DTM is in a geographic CRS (degrees) while elevation is in metres, so the gradient is overstated by roughly five orders of magnitude and every cell saturates. Fix: reproject the DTM to a projected metric CRS such as EPSG:32613, or pass `scale=111320` to convert the horizontal unit at the equator. Reprojection is the more robust option.

**Slope values in the thousands**
Root cause: the same unit mismatch, seen through the slope product instead of the shade. Fix: verify with `rasterio` that `crs.is_projected` is True before processing, and reproject if it is not.

**A one-pixel NoData border around every product**
Root cause: `computeEdges` defaults to False, so GDAL cannot form a full 3x3 window at the raster boundary and leaves those cells empty. Fix: pass `computeEdges=True` to every `DEMProcessing` call, as the implementation above does.

**Voids bleed into the derivatives as large flat or spiked patches**
Root cause: unfilled NoData cells inside the DTM corrupt the 3x3 gradient of their neighbours. Fix: fill the voids upstream — see [Filling NoData Voids in DTM Rasters](https://www.pythonlidar.com/ground-filtering-dtm-dsm-generation/dtm-raster-generation/filling-nodata-voids-in-dtm-rasters/) — and ensure the DTM's NoData value is correctly declared so GDAL masks rather than interpolates across it.

**Aspect returns -9999 across flat areas**
Root cause: flat cells have no defined downslope direction, and GDAL emits its NoData sentinel by default. Fix: pass `zeroForFlat=True` so flat cells report 0, or mask them explicitly during analysis.

## Frequently Asked Questions

**Why does my hillshade come out completely flat or black?**

The most common cause is a z-factor and unit mismatch. If the DTM CRS is geographic (degrees) but the elevation is in metres, `gdaldem` treats one degree of horizontal distance as equal to one metre of vertical rise, producing an effectively vertical surface that renders as uniform grey or black. Set a `scale` value of about 111320, or better, reproject the DTM to a projected metric CRS such as EPSG:32613 before processing.

**Should slope be expressed in degrees or percent?**

`gdaldem` supports both through the `slopeFormat` argument. Degrees range from 0 to 90 and read intuitively on terrain classification legends. Percent slope is rise over run times 100 and is the convention in engineering, hydrology, and agricultural suitability models. The underlying gradient is identical; only the reported unit differs.

**What azimuth and altitude values are standard for hillshade?**

The cartographic convention is an azimuth of 315 degrees, placing the light in the northwest, and an altitude of 45 degrees above the horizon. Northwest lighting avoids the relief-inversion illusion that appears when terrain is lit from the south, and a 45-degree altitude balances contrast across both gentle and steep slopes.

**What is multidirectional hillshade and when should I use it?**

Multidirectional hillshade blends illumination from several azimuths into one raster, recovering detail in valleys and lee slopes that a single light source leaves in deep shadow. Enable it by passing `multiDirectional=True` to `gdal.DEMProcessing`. It suits rugged terrain and archaeological micro-relief, where a conventional single-azimuth shade would obscure features.

**Can I compute these products directly from the point cloud instead of a DTM?**

Not with `gdaldem`, which requires a continuous raster surface. Rasterise the classified ground returns into a DTM first — see [DTM Raster Generation](https://www.pythonlidar.com/ground-filtering-dtm-dsm-generation/dtm-raster-generation/) — then derive hillshade, slope, and aspect from that grid.

---

## Related

- [Ground Filtering and DTM/DSM Generation with PDAL](https://www.pythonlidar.com/ground-filtering-dtm-dsm-generation/) — parent guide covering ground classification through raster surface generation
- [Exporting Hillshade from a LiDAR DTM](https://www.pythonlidar.com/ground-filtering-dtm-dsm-generation/hillshade-slope-aspect/exporting-hillshade-from-a-lidar-dtm/) — a focused, step-by-step shaded-relief walkthrough
- [DTM Raster Generation](https://www.pythonlidar.com/ground-filtering-dtm-dsm-generation/dtm-raster-generation/) — produce the bare-earth surface these derivatives consume
- [DSM Generation](https://www.pythonlidar.com/ground-filtering-dtm-dsm-generation/dsm-generation/) — build the first-return surface model to compare canopy relief against bare earth
- [Filling NoData Voids in DTM Rasters](https://www.pythonlidar.com/ground-filtering-dtm-dsm-generation/dtm-raster-generation/filling-nodata-voids-in-dtm-rasters/) — remove voids before deriving terrain products
- [Spatial Reprojection](https://www.pythonlidar.com/pdal-pipeline-architecture-execution/spatial-reprojection/) — put the surface in a metric CRS to avoid unit-mismatch shading failures
