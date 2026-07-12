---
title: "Exporting Hillshade from a LiDAR DTM"
description: "Step-by-step guide to producing a shaded-relief hillshade GeoTIFF from a LiDAR DTM with gdaldem/gdal.DEMProcessing — setting azimuth, altitude, and z-factor, and rendering multidirectional shading."
slug: "exporting-hillshade-from-a-lidar-dtm"
type: "long_tail"
breadcrumb: "Exporting Hillshade from a DTM"
datePublished: "2024-06-28"
dateModified: "2026-07-12"
---

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Article",
      "headline": "Exporting Hillshade from a LiDAR DTM",
      "description": "Step-by-step guide to producing a shaded-relief hillshade GeoTIFF from a LiDAR DTM with gdaldem/gdal.DEMProcessing — setting azimuth, altitude, and z-factor, and rendering multidirectional shading.",
      "datePublished": "2024-06-28",
      "dateModified": "2026-07-12",
      "author": {"@type": "Organization", "name": "pythonlidar.com"}
    },
    {
      "@type": "BreadcrumbList",
      "itemListElement": [
        {"@type": "ListItem", "position": 1, "name": "Home", "item": "https://pythonlidar.com/"},
        {"@type": "ListItem", "position": 2, "name": "Ground Filtering and DTM/DSM Generation with PDAL", "item": "https://pythonlidar.com/ground-filtering-dtm-dsm-generation/"},
        {"@type": "ListItem", "position": 3, "name": "Hillshade, Slope and Aspect", "item": "https://pythonlidar.com/ground-filtering-dtm-dsm-generation/hillshade-slope-aspect/"},
        {"@type": "ListItem", "position": 4, "name": "Exporting Hillshade from a LiDAR DTM", "item": "https://pythonlidar.com/ground-filtering-dtm-dsm-generation/hillshade-slope-aspect/exporting-hillshade-from-a-lidar-dtm/"}
      ]
    },
    {
      "@type": "HowTo",
      "name": "Export a hillshade GeoTIFF from a LiDAR DTM",
      "description": "Produce a shaded-relief hillshade raster from a bare-earth LiDAR DTM using gdal.DEMProcessing.",
      "step": [
        {"@type": "HowToStep", "position": 1, "name": "Confirm the DTM CRS is metric", "text": "Open the DTM with rasterio and verify the CRS is projected so horizontal and vertical units both read in metres."},
        {"@type": "HowToStep", "position": 2, "name": "Set the lighting parameters", "text": "Choose azimuth 315 and altitude 45 for conventional northwest shaded relief."},
        {"@type": "HowToStep", "position": 3, "name": "Call gdal.DEMProcessing", "text": "Invoke DEMProcessing with processing hillshade, passing azimuth, altitude, and zFactor."},
        {"@type": "HowToStep", "position": 4, "name": "Verify the output", "text": "Reopen the hillshade with rasterio and assert the value range falls within 0 to 255."}
      ]
    },
    {
      "@type": "FAQPage",
      "mainEntity": [
        {
          "@type": "Question",
          "name": "What z-factor should I use when the DTM is in degrees?",
          "acceptedAnswer": {"@type": "Answer", "text": "When horizontal units are degrees but elevation is metres, keep zFactor at 1.0 and instead set scale to about 111320, the number of metres in one degree at the equator. The cleaner fix is to reproject the DTM to a projected metric CRS such as EPSG:6342 so that no scale correction is needed at all."}
        },
        {
          "@type": "Question",
          "name": "Why is my hillshade a featureless sea of grey?",
          "acceptedAnswer": {"@type": "Answer", "text": "A washed-out mid-grey image usually means the sun altitude is too high. At an altitude near 90 degrees the light comes straight down and every slope receives almost identical illumination, erasing contrast. Drop the altitude to 45 degrees, and if the terrain is subtle try 30 to 35 to deepen the shadows."}
        },
        {
          "@type": "Question",
          "name": "Can I exaggerate subtle terrain in the hillshade?",
          "acceptedAnswer": {"@type": "Answer", "text": "Yes. Raise zFactor above 1.0 to vertically exaggerate the surface before shading. A value of 2 to 3 makes shallow features such as field boundaries or faint channels far more legible, though large values can create an artificially embossed look on steep ground."}
        },
        {
          "@type": "Question",
          "name": "Does gdal.DEMProcessing overwrite an existing output file?",
          "acceptedAnswer": {"@type": "Answer", "text": "Yes. gdal.DEMProcessing writes the destination path unconditionally and replaces any existing file at that location. Choose a distinct output filename or check for existence yourself if you need to preserve a previous run."}
        }
      ]
    }
  ]
}
</script>

**TL;DR:** Call `gdal.DEMProcessing("hillshade.tif", "dtm.tif", "hillshade", azimuth=315, altitude=45, zFactor=1.0, computeEdges=True)` on a DTM that is in a projected metric CRS, and you get a shaded-relief GeoTIFF with values from 0 (deep shadow) to 255 (full light) that overlays the source exactly.

## Context and Motivation

This guide is part of [Hillshade, Slope and Aspect from LiDAR DTMs](/ground-filtering-dtm-dsm-generation/hillshade-slope-aspect/), which surveys all three terrain derivatives; here the focus is narrowed to the single most requested product — the shaded-relief hillshade.

A hillshade is the image people picture when they think of a topographic map: a greyscale rendering that makes ridges, gullies, and terraces pop as if lit by a low afternoon sun. It carries no elevation numbers itself; it translates the DTM's gradient into brightness so the human eye can read the shape of the land at a glance. For LiDAR practitioners the hillshade is often the first sanity check on a freshly built terrain surface, because classification errors, interpolation artefacts, and tiling seams that hide in raw elevation values jump out instantly under raking light. It is also the base layer beneath most cartographic products, sitting under coloured elevation tints, contour lines, and vector overlays.

The mechanics are handled by GDAL's `gdaldem` tool, reached from Python through `gdal.DEMProcessing`. Because the operation reads a raster and writes a raster, the quality of the result depends entirely on two things: a clean DTM and correctly chosen lighting parameters. Get the coordinate system and the sun angle right, and a single function call produces a publication-ready shade.

<svg viewBox="0 0 640 250" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Sun azimuth and altitude geometry over a terrain profile" style="width:100%;max-width:640px;display:block;margin:1.5rem auto">
  <title>Hillshade illumination geometry</title>
  <desc>A terrain cross-section with a sun symbol in the upper left. One arrow shows the light ray descending at a 45 degree altitude onto a slope; a compass rose marks the 315 degree azimuth. Slopes facing the light are labelled bright and slopes facing away are labelled dark.</desc>
  <!-- ground profile -->
  <path d="M40,200 L150,150 L240,180 L330,120 L430,170 L540,130 L600,160" fill="none" stroke="currentColor" stroke-width="1.6"/>
  <!-- sun -->
  <circle cx="95" cy="52" r="16" fill="none" stroke="currentColor" stroke-width="1.5"/>
  <text x="95" y="30" text-anchor="middle" font-size="10" fill="currentColor" opacity="0.7" font-family="sans-serif">sun</text>
  <!-- light ray at 45 deg -->
  <line x1="108" y1="65" x2="315" y2="118" stroke="currentColor" stroke-width="1.2" stroke-dasharray="5 3" opacity="0.7"/>
  <text x="200" y="80" text-anchor="middle" font-size="10" fill="currentColor" opacity="0.65" font-family="sans-serif">altitude 45 deg above horizon</text>
  <!-- bright / dark labels -->
  <text x="288" y="150" text-anchor="middle" font-size="10" fill="currentColor" font-family="sans-serif">lit slope: bright (toward 255)</text>
  <text x="490" y="205" text-anchor="middle" font-size="10" fill="currentColor" opacity="0.6" font-family="sans-serif">shaded slope: dark (toward 0)</text>
  <!-- compass rose for azimuth -->
  <circle cx="560" cy="55" r="30" fill="none" stroke="currentColor" stroke-width="1" opacity="0.6"/>
  <line x1="560" y1="55" x2="539" y2="34" stroke="currentColor" stroke-width="1.4" opacity="0.8"/>
  <text x="560" y="22" text-anchor="middle" font-size="9" fill="currentColor" opacity="0.6" font-family="sans-serif">N</text>
  <text x="560" y="100" text-anchor="middle" font-size="9" fill="currentColor" opacity="0.6" font-family="sans-serif">azimuth 315 deg (NW)</text>
</svg>

## Prerequisites and Assumptions

| Requirement | Minimum version / detail |
|---|---|
| GDAL | 3.4+ with Python bindings (`osgeo.gdal`) |
| `rasterio` | 1.3+ for verification |
| Input DTM | single-band Float32 GeoTIFF with a declared NoData value |
| DTM CRS | projected and metric, e.g. EPSG:6342 (NAD83(2011)/UTM 13N) |
| Void handling | NoData interior voids filled beforehand |

The DTM should already be a finished bare-earth surface. If you have not built one yet, produce it with [Generating a DTM GeoTIFF with writers.gdal](/ground-filtering-dtm-dsm-generation/dtm-raster-generation/generating-a-dtm-geotiff-with-writers-gdal/). Confirm the CRS is projected before you start — this single check prevents the most common hillshade failure:

```python
import rasterio

with rasterio.open("dtm_utm13n.tif") as src:
    assert src.crs is not None, "DTM has no CRS"
    assert src.crs.is_projected, "Reproject to a metric CRS (e.g. EPSG:6342) first"
    print("CRS:", src.crs, "| units:", src.crs.linear_units)
```

## Step-by-Step Implementation

### Step 1 — Inspect the DTM

Open the surface and note its NoData value, data type, and pixel size. The geotransform's pixel size is what turns cell-to-cell height differences into a real gradient, so a DTM with a bogus resolution produces a bogus shade.

```python
import rasterio

with rasterio.open("dtm_utm13n.tif") as src:
    print("size:", src.width, "x", src.height)
    print("pixel size:", src.res)
    print("nodata:", src.nodata)
    print("dtype:", src.dtypes[0])
```

### Step 2 — Choose the lighting

For conventional shaded relief, light the scene from the northwest at a moderate height. `azimuth=315` places the sun in the upper-left, matching the direction most readers instinctively expect, and `altitude=45` gives balanced shadows. Keep `zFactor=1.0` when horizontal and vertical units match.

### Step 3 — Run gdal.DEMProcessing

```python
from osgeo import gdal

gdal.UseExceptions()

gdal.DEMProcessing(
    "hillshade_utm13n.tif",
    "dtm_utm13n.tif",
    "hillshade",
    azimuth=315.0,
    altitude=45.0,
    zFactor=1.0,
    computeEdges=True,
    format="GTiff",
    creationOptions=["COMPRESS=DEFLATE", "TILED=YES"],
)
```

`computeEdges=True` fills the border cells rather than leaving a one-pixel NoData frame, and the creation options compress and tile the output so it stays small and reads efficiently in a GIS.

### Step 4 — Render multidirectional shading (optional)

For rugged terrain where a single light source drowns the valleys in shadow, switch on multidirectional shading. GDAL then blends light from several azimuths and ignores the `azimuth` argument.

```python
gdal.DEMProcessing(
    "hillshade_multi.tif",
    "dtm_utm13n.tif",
    "hillshade",
    multiDirectional=True,
    altitude=45.0,
    zFactor=1.0,
    computeEdges=True,
    format="GTiff",
)
```

## Complete Working Example

Save this as `export_hillshade.py` and run it against any metric-CRS DTM. It validates the CRS, exports the hillshade, and checks the output range in one pass.

```python
#!/usr/bin/env python3
"""
export_hillshade.py
Export a shaded-relief hillshade GeoTIFF from a LiDAR DTM using gdal.DEMProcessing.

Usage:
    python export_hillshade.py dtm_utm13n.tif hillshade.tif

Requirements:
    conda install -c conda-forge gdal rasterio
"""

import sys

from osgeo import gdal
import rasterio

gdal.UseExceptions()


def export_hillshade(
    dtm_path: str,
    out_path: str,
    azimuth: float = 315.0,
    altitude: float = 45.0,
    z_factor: float = 1.0,
    multidirectional: bool = False,
) -> str:
    """Produce a hillshade GeoTIFF from a bare-earth DTM and return its path."""
    with rasterio.open(dtm_path) as src:
        if src.crs is None:
            raise ValueError(f"{dtm_path} has no CRS.")
        # Guard the classic degree/metre mismatch: in a geographic CRS one
        # degree of horizontal distance is not one metre, so the gradient is
        # overstated ~100000x and the shade collapses. Correct with scale.
        scale = 1.0 if src.crs.is_projected else 111320.0
        if scale != 1.0:
            print("WARNING: DTM CRS is geographic; applying scale=111320. "
                  "Reprojecting to EPSG:6342 is preferable.")

    gdal.DEMProcessing(
        out_path,
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
    return out_path


def verify_hillshade(path: str) -> None:
    """Assert the hillshade values fall inside the 0-255 shaded-relief domain."""
    with rasterio.open(path) as src:
        band = src.read(1, masked=True)
        lo, hi = float(band.min()), float(band.max())
        assert 0 <= lo and hi <= 255, f"Hillshade out of range: [{lo}, {hi}]"
        if hi - lo < 20:
            print(f"WARNING: low contrast (range {lo:.0f}-{hi:.0f}); "
                  "check altitude and CRS units.")
        print(f"OK: hillshade range [{lo:.0f}, {hi:.0f}], nodata={src.nodata}")


def main() -> None:
    if len(sys.argv) != 3:
        print("Usage: python export_hillshade.py <dtm.tif> <hillshade.tif>")
        sys.exit(1)

    dtm_path, out_path = sys.argv[1], sys.argv[2]
    print(f"Shading {dtm_path} -> {out_path} (az 315, alt 45)...")
    export_hillshade(dtm_path, out_path)
    verify_hillshade(out_path)


if __name__ == "__main__":
    main()
```

## Key Parameter Table

| Parameter | Type | Default | Notes |
|---|---|---|---|
| `azimuth` | float | 315 | Light direction, degrees clockwise from north; 315 = northwest |
| `altitude` | float | 45 | Sun height above the horizon; lower deepens shadows |
| `zFactor` | float | 1.0 | Vertical exaggeration; raise to 2–3 to reveal subtle relief |
| `scale` | float | 1.0 | Horizontal:vertical unit ratio; ~111320 for a geographic CRS |
| `multiDirectional` | bool | False | Blend several light directions; ignores `azimuth` |
| `computeEdges` | bool | False | Estimate border cells instead of leaving a NoData frame |
| `creationOptions` | list | — | GTiff options such as `COMPRESS=DEFLATE`, `TILED=YES` |

## Verification

Confirm three things before the hillshade goes anywhere.

**Value range.** A valid hillshade occupies 0–255. Read it back and check:

```python
import rasterio

with rasterio.open("hillshade_utm13n.tif") as src:
    band = src.read(1, masked=True)
    print("min", band.min(), "max", band.max())
```

**Contrast.** If the minimum and maximum are only a few values apart, the image is washed out — usually an altitude that is too high or a degree-based CRS. A healthy shade spans most of the 0–255 range.

**Alignment.** The output inherits the DTM's geotransform and CRS, so it should overlay the source pixel-for-pixel. Drop both into QGIS; the shade must register exactly on the elevation grid with no offset or rotation.

## Gotchas and Edge Cases

**1. z-factor and unit mismatch when the DTM is in degrees.**
A DTM in a geographic CRS such as EPSG:4326 stores X and Y in degrees while Z stays in metres. `gdaldem` cannot detect the difference and computes a gradient roughly 100,000 times too steep, so the whole raster saturates to one shade. Either reproject to a projected metric CRS such as EPSG:6342 (the robust fix) or pass `scale=111320` to reconcile the units at the equator. Confirm with `src.crs.is_projected` before shading.

**2. Sea-of-grey from a wrong altitude.**
Setting `altitude` near 90 sends the light straight down, so every slope receives almost identical illumination and the image flattens to featureless mid-grey. Keep the altitude around 45 for general use and drop it to 30–35 to accentuate faint terrain. The opposite mistake — an altitude near 0 — throws the scene into near-total darkness with only ridge tops catching light.

**3. Faint terrain that will not show.**
Very flat surfaces, such as floodplains or ploughed fields, produce weak gradients and a low-contrast shade even with correct lighting. Raise `zFactor` to 2 or 3 to vertically exaggerate the relief; features such as drainage channels and field boundaries then emerge clearly. Be aware that heavy exaggeration also amplifies interpolation noise, so pair it with a well-built DTM.

**4. NoData frame or void bleed.**
Forgetting `computeEdges=True` leaves a one-pixel empty border. Unfilled interior voids are worse: they corrupt the gradient of every neighbouring cell and appear as flat blotches or bright spikes. Fill voids in the DTM before shading.

## Frequently Asked Questions

**What z-factor should I use when the DTM is in degrees?**

Keep `zFactor` at 1.0 and instead set `scale` to about 111320, the number of metres in one degree of longitude at the equator. The cleaner solution is to reproject the DTM to a projected metric CRS such as EPSG:6342 so that no scale correction is needed and the gradient is computed in consistent units.

**Why is my hillshade a featureless sea of grey?**

A washed-out mid-grey image usually means the sun altitude is too high. At an altitude near 90 degrees the light falls straight down and every slope receives near-identical illumination, erasing contrast. Drop the altitude to 45 degrees, and for subtle terrain try 30 to 35 to deepen the shadows.

**Can I exaggerate subtle terrain in the hillshade?**

Yes. Raise `zFactor` above 1.0 to vertically exaggerate the surface before shading. A value of 2 to 3 makes shallow features such as field boundaries or faint channels far more legible, though large values can produce an artificially embossed look on steep ground.

**Does gdal.DEMProcessing overwrite an existing output file?**

Yes. `gdal.DEMProcessing` writes the destination path unconditionally and replaces any existing file there. Pick a distinct output name or check for existence yourself if you need to keep a previous run.

---

## Related

- [Hillshade, Slope and Aspect from LiDAR DTMs](/ground-filtering-dtm-dsm-generation/hillshade-slope-aspect/) — parent guide covering all three terrain derivatives and their shared workflow
- [DTM Raster Generation](/ground-filtering-dtm-dsm-generation/dtm-raster-generation/) — build the bare-earth surface the hillshade is derived from
- [Generating a DTM GeoTIFF with writers.gdal](/ground-filtering-dtm-dsm-generation/dtm-raster-generation/generating-a-dtm-geotiff-with-writers-gdal/) — produce a suitable single-band DTM input
- [Filling NoData Voids in DTM Rasters](/ground-filtering-dtm-dsm-generation/dtm-raster-generation/filling-nodata-voids-in-dtm-rasters/) — remove voids that would corrupt the shade
- [Ground Filtering and DTM/DSM Generation with PDAL](/ground-filtering-dtm-dsm-generation/) — the wider terrain-modelling workflow
