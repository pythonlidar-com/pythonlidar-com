---
title: "Generating Contours from a DTM with gdal_contour"
description: "Create contour lines and filled contour polygons from a LiDAR DTM with the gdal_contour command and its Python equivalent: interval, base and fixed levels, elevation attributes, polygon mode for elevation bands, and running it over a VRT mosaic."
slug: "generating-contours-from-a-dtm-with-gdal-contour"
type: "howto"
breadcrumb: "Contours with gdal_contour"
datePublished: "2026-09-18"
dateModified: "2026-09-18"
---

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Article",
      "headline": "Generating Contours from a DTM with gdal_contour",
      "description": "Create contour lines and filled contour polygons from a LiDAR DTM with the gdal_contour command and its Python equivalent: interval, base and fixed levels, elevation attributes, polygon mode for elevation bands, and running it over a VRT mosaic.",
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
        },
        {
          "@type": "ListItem",
          "position": 4,
          "name": "Contours with gdal_contour",
          "item": "https://www.pythonlidar.com/ground-filtering-dtm-dsm-generation/contour-generation/generating-contours-from-a-dtm-with-gdal-contour/"
        }
      ]
    },
    {
      "@type": "HowTo",
      "name": "Generate contours from a DTM with gdal_contour",
      "step": [
        {
          "@type": "HowToStep",
          "name": "Mosaic tiles into a VRT",
          "text": "gdalbuildvrt mosaic.vrt dtm_tiles/.tif creates a virtual raster with no copying; contouring it gives continuous lines across tile boundaries."
        },
        {
          "@type": "HowToStep",
          "name": "Generate lines",
          "text": "-i sets the interval, -off the base offset, -a the elevation attribute name. -nln names the output layer."
        },
        {
          "@type": "HowToStep",
          "name": "Or generate bands",
          "text": "-p switches to polygons; -amin and -amax name the attributes holding each band's lower and upper bound."
        },
        {
          "@type": "HowToStep",
          "name": "Use fixed levels when needed",
          "text": "-fl takes an explicit list of elevations \u2014 useful for flood levels, design heights or irregular intervals."
        },
        {
          "@type": "HowToStep",
          "name": "Check the output",
          "text": "Count features, list distinct elevations, and look for contours along NoData edges."
        }
      ]
    },
    {
      "@type": "FAQPage",
      "mainEntity": [
        {
          "@type": "Question",
          "name": "How do I create contour lines from a DTM with GDAL?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Run gdal_contour with an attribute name, an interval and an output format, for example gdal_contour -a elev -i 0.5 -f GPKG dtm.tif contours.gpkg. From Python, gdal.ContourGenerateEx does the same."
          }
        },
        {
          "@type": "Question",
          "name": "How do I get filled elevation bands instead of lines?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Add the -p flag with -amin and -amax attribute names. Each output polygon covers the area between two consecutive levels and carries both bounds."
          }
        },
        {
          "@type": "Question",
          "name": "How do I contour many DTM tiles at once?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Build a VRT mosaic with gdalbuildvrt and contour the VRT. The lines are continuous across tile boundaries, which they would not be if each tile were contoured separately."
          }
        },
        {
          "@type": "Question",
          "name": "Can I choose specific elevations?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Yes. The -fl option takes a list of fixed levels, useful for flood elevations or design heights."
          }
        }
      ]
    }
  ]
}
</script>

**TL;DR:** `gdal_contour -a elev -i 0.5 -f GPKG -nln contours dtm.tif contours.gpkg` writes 0.5 m contour lines with an `elev` attribute. Add `-p -amin elev_min -amax elev_max` for filled elevation-band polygons, `-fl 100 105 110` for fixed levels, and point it at a `.vrt` mosaic so lines are continuous across tiles. `gdal.ContourGenerateEx` does the same from Python.

## Context and Motivation

This guide is part of [Contour Generation from LiDAR DTMs](https://www.pythonlidar.com/ground-filtering-dtm-dsm-generation/contour-generation/). `gdal_contour` ships with every GDAL installation, needs no code, and handles the geometry correctly — marching squares over the raster, lines joined into continuous features, NoData respected. It is the right first tool for contours, and the right production tool when contours are one step in a shell-driven batch. The Python API exposes exactly the same algorithm when contours are part of a larger Python workflow.

The command's options map onto three decisions: which elevations to draw, what to store with each feature, and whether you want lines or filled bands.

<svg viewBox="0 0 740 210" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Contour lines versus filled contour polygons from the same DTM" style="width:100%;max-width:740px;display:block;margin:1.6rem auto">
  <title>Lines or bands</title>
  <desc>Left: contour lines at regular intervals across a hill, each a line feature carrying one elevation value. Right: the same hill as filled polygons, each band carrying a minimum and maximum elevation, suitable for hypsometric tinting or area statistics by elevation.</desc>
  <rect x="0" y="0" width="740" height="210" fill="var(--dg-bg)" rx="10"/>
  <text x="185" y="24" text-anchor="middle" font-size="11.5" font-weight="600" fill="var(--dg-text)">lines: elev</text>
  <text x="555" y="24" text-anchor="middle" font-size="11.5" font-weight="600" fill="var(--dg-text)">polygons (-p): elev_min, elev_max</text>
  <g fill="none" stroke="var(--dg-a)" stroke-width="1.6"><ellipse cx="185" cy="115" rx="140" ry="75"/><ellipse cx="185" cy="115" rx="100" ry="52"/><ellipse cx="185" cy="115" rx="58" ry="30"/></g>
  <ellipse cx="555" cy="115" rx="140" ry="75" fill="var(--dg-b-soft)" stroke="var(--dg-b)" stroke-width="1.2"/>
  <ellipse cx="555" cy="115" rx="100" ry="52" fill="var(--dg-a-soft)" stroke="var(--dg-a)" stroke-width="1.2"/>
  <ellipse cx="555" cy="115" rx="58" ry="30" fill="var(--dg-c-soft)" stroke="var(--dg-c)" stroke-width="1.2"/>
  <text x="185" y="119" text-anchor="middle" font-size="10" fill="var(--dg-text)">216.0</text>
  <text x="555" y="119" text-anchor="middle" font-size="10" fill="var(--dg-text)">216–217</text>
  <text x="185" y="202" text-anchor="middle" font-size="10" fill="var(--dg-muted)">one feature per level</text>
  <text x="555" y="202" text-anchor="middle" font-size="10" fill="var(--dg-muted)">one feature per band</text>
</svg>

## Prerequisites and Assumptions

- GDAL 3.x command-line tools and, for the Python route, the `osgeo` bindings.
- A void-filled, ideally smoothed DTM; see [smoothing a LiDAR DTM before contouring](https://www.pythonlidar.com/ground-filtering-dtm-dsm-generation/contour-generation/smoothing-a-lidar-dtm-before-contouring/).
- A NoData value set on the raster, so contours are not drawn around empty areas.

## Step-by-Step Implementation

### Step 1 — Mosaic tiles into a VRT

`gdalbuildvrt mosaic.vrt dtm_tiles/*.tif` creates a virtual raster with no copying; contouring it gives continuous lines across tile boundaries.

### Step 2 — Generate lines

`-i` sets the interval, `-off` the base offset, `-a` the elevation attribute name. `-nln` names the output layer.

### Step 3 — Or generate bands

`-p` switches to polygons; `-amin` and `-amax` name the attributes holding each band's lower and upper bound.

### Step 4 — Use fixed levels when needed

`-fl` takes an explicit list of elevations — useful for flood levels, design heights or irregular intervals.

### Step 5 — Check the output

Count features, list distinct elevations, and look for contours along NoData edges.

## Complete Working Example

Shell, for a batch:

```bash
#!/usr/bin/env bash
set -euo pipefail
gdalbuildvrt -overwrite mosaic/dtm.vrt dtm_tiles/*.tif

# 0.5 m lines with an elevation attribute
gdal_contour -a elev -i 0.5 -off 0 -f GPKG -nln contours \
  mosaic/dtm.vrt out/contours_050.gpkg

# 1 m elevation bands for hypsometric tinting
gdal_contour -p -amin elev_min -amax elev_max -i 1.0 -f GPKG -nln bands \
  mosaic/dtm.vrt out/bands_100.gpkg

# design flood levels only
gdal_contour -a elev -fl 212.4 213.0 213.8 -f GPKG -nln flood_levels \
  mosaic/dtm.vrt out/flood_levels.gpkg

ogrinfo -so out/contours_050.gpkg contours | grep "Feature Count"
```

Python, when contours are part of a larger script:

```python
"""Contour lines and bands from a DTM VRT with GDAL's Python API."""
from osgeo import gdal, ogr

gdal.UseExceptions()


def contour(src: str, dst: str, layer_name: str, interval: float, polygons: bool = False) -> int:
    ds = gdal.Open(src)
    band = ds.GetRasterBand(1)
    out = ogr.GetDriverByName("GPKG").CreateDataSource(dst)
    geom = ogr.wkbMultiPolygon if polygons else ogr.wkbLineString
    lyr = out.CreateLayer(layer_name, ds.GetSpatialRef(), geom)
    lyr.CreateField(ogr.FieldDefn("id", ogr.OFTInteger))
    if polygons:
        lyr.CreateField(ogr.FieldDefn("elev_min", ogr.OFTReal))
        lyr.CreateField(ogr.FieldDefn("elev_max", ogr.OFTReal))
        opts = [f"LEVEL_INTERVAL={interval}", "ID_FIELD=0", "ELEV_FIELD_MIN=1",
                "ELEV_FIELD_MAX=2", "POLYGONIZE=YES"]
    else:
        lyr.CreateField(ogr.FieldDefn("elev", ogr.OFTReal))
        opts = [f"LEVEL_INTERVAL={interval}", "ID_FIELD=0", "ELEV_FIELD=1"]
    nd = band.GetNoDataValue()
    if nd is not None:
        opts.append(f"NODATA={nd}")
    gdal.ContourGenerateEx(band, lyr, options=opts)
    n = lyr.GetFeatureCount()
    out = None
    return n


if __name__ == "__main__":
    import glob
    gdal.BuildVRT("mosaic/dtm.vrt", sorted(glob.glob("dtm_tiles/*.tif")))
    print("lines:", contour("mosaic/dtm.vrt", "out/contours_050.gpkg", "contours", 0.5))
    print("bands:", contour("mosaic/dtm.vrt", "out/bands_100.gpkg", "bands", 1.0, polygons=True))
```

<svg viewBox="0 0 740 200" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Contours from separate tiles versus a VRT mosaic across a tile edge" style="width:100%;max-width:740px;display:block;margin:1.6rem auto">
  <title>Why contour the mosaic</title>
  <desc>Left: two adjacent tiles contoured separately; each contour is split at the shared edge into two features whose ends do not quite meet. Right: the same area contoured from a VRT mosaic; each contour crosses the edge as one continuous feature.</desc>
  <rect x="0" y="0" width="740" height="200" fill="var(--dg-bg)" rx="10"/>
  <line x1="185" y1="24" x2="185" y2="176" stroke="var(--dg-line-soft)" stroke-width="1.2" stroke-dasharray="5 4"/>
  <line x1="555" y1="24" x2="555" y2="176" stroke="var(--dg-line-soft)" stroke-width="1.2" stroke-dasharray="5 4"/>
  <g fill="none" stroke="var(--dg-c)" stroke-width="1.8"><path d="M40 60 C100 52 150 70 183 64"/><path d="M188 67 C230 60 290 72 330 66"/><path d="M40 110 C100 102 150 120 183 114"/><path d="M188 118 C230 110 290 122 330 116"/></g>
  <g fill="none" stroke="var(--dg-a)" stroke-width="1.8"><path d="M410 60 C470 52 520 70 555 65 C600 60 660 72 700 66"/><path d="M410 110 C470 102 520 120 555 115 C600 110 660 122 700 116"/></g>
  <text x="185" y="194" text-anchor="middle" font-size="10.5" fill="var(--dg-muted)">tiles: lines break at the edge</text>
  <text x="555" y="194" text-anchor="middle" font-size="10.5" fill="var(--dg-muted)">VRT: continuous features</text>
</svg>

## Using Elevation Bands

Polygon output is less familiar than lines but often more useful for analysis. Each band is an area, so questions that are awkward with lines become one-liners: how much of a parcel lies below a flood elevation, what share of a catchment is above 300 m, where does a site need cut or fill relative to a design level. With GeoPandas, intersect the bands with parcels and sum areas grouped by `elev_min`.

Bands also make hypsometric tinting trivial in any GIS: style by `elev_min` with a colour ramp and the landscape's shape reads at a glance, without a separate raster. For that purpose bands can be coarser than the delivered contour lines — 5 or 10 m bands under 0.5 m lines is a common pairing.

Two cautions apply. Bands inherit every artefact of the surface, so smooth the DTM first; micro-relief creates thousands of tiny island polygons. And band boundaries are only as accurate as the DTM, so the same interval rule applies as for lines: do not slice more finely than the vertical accuracy supports. For flood mapping, a fixed-level band at the design elevation (`-fl` with `-p`) is usually what is really wanted.

## Key Parameter Table

| Option | Python equivalent | Meaning |
|---|---|---|
| `-i 0.5` | `LEVEL_INTERVAL=0.5` | Contour interval |
| `-off 0` | `LEVEL_BASE=0` | Offset of the series |
| `-fl a b c` | `FIXED_LEVELS=a,b,c` | Explicit levels |
| `-a elev` | `ELEV_FIELD=<index>` | Elevation attribute (lines) |
| `-p` | `POLYGONIZE=YES` | Filled bands instead of lines |
| `-amin` / `-amax` | `ELEV_FIELD_MIN` / `ELEV_FIELD_MAX` | Band bounds (polygons) |
| `-snodata v` | `NODATA=v` | Override NoData value |
| `-f GPKG -nln name` | driver + layer | Output format and layer name |

## Verification

- **Distinct elevations** are exactly the interval series: `ogrinfo -sql "SELECT DISTINCT elev FROM contours" out/contours_050.gpkg`.
- **No lines along NoData.** Overlay contours on the DTM's NoData mask; lines should not trace its boundary.
- **Continuity.** Pick a contour crossing a former tile edge and confirm it is one feature.

## Gotchas and Edge Cases

**NoData not set.** Without a NoData value, GDAL treats fill values such as −9999 as elevations and draws a dense ring of contours around every void. Set NoData on the DTM or pass `-snodata`.

**Floating-point levels.** An interval of 0.1 produces levels like 212.30000000000001. Round the attribute when cleaning, or use `-fl` with exact values.

**Huge polygon features.** Polygon mode on a large, detailed DTM creates bands with millions of vertices. Smooth first, and consider coarser intervals for bands than for lines.

<svg viewBox="90 14 640 160" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Contours ringing a NoData void when NoData is not declared" style="width:100%;max-width:740px;display:block;margin:1.6rem auto">
  <title>What an undeclared NoData value does</title>
  <desc>Left: a DTM with a void filled with the value minus 9999 but no NoData declared; dozens of tightly packed contours ring the void as the surface plunges to minus 9999. Right: the same DTM with NoData declared; contours stop at the void edge.</desc>
  <rect x="90" y="14" width="640" height="160" fill="var(--dg-bg)" rx="10"/>
  <rect x="140" y="60" width="90" height="60" fill="var(--dg-surface-2)"/>
  <g fill="none" stroke="var(--dg-e)" stroke-width="1"><rect x="134" y="54" width="102" height="72"/><rect x="128" y="48" width="114" height="84"/><rect x="122" y="42" width="126" height="96"/><rect x="116" y="36" width="138" height="108"/></g>
  <text x="185" y="162" text-anchor="middle" font-size="10.5" fill="var(--dg-e)">−9999 treated as elevation</text>
  <rect x="510" y="60" width="90" height="60" fill="var(--dg-surface-2)"/>
  <g fill="none" stroke="var(--dg-a)" stroke-width="1.4"><path d="M420 40 L510 44"/><path d="M600 44 L700 40"/><path d="M420 140 L510 136"/><path d="M600 136 L700 140"/></g>
  <text x="555" y="162" text-anchor="middle" font-size="10.5" fill="var(--dg-d)">NoData declared: lines stop</text>
</svg>

**Units.** gdal_contour uses the raster's values as they are. A DTM in feet produces contours in feet; make sure the interval is in the same unit.

## Frequently Asked Questions

**How do I create contour lines from a DTM with GDAL?**

Run gdal_contour with an attribute name, an interval and an output format, for example gdal_contour -a elev -i 0.5 -f GPKG dtm.tif contours.gpkg. From Python, gdal.ContourGenerateEx does the same.

**How do I get filled elevation bands instead of lines?**

Add the -p flag with -amin and -amax attribute names. Each output polygon covers the area between two consecutive levels and carries both bounds.

**How do I contour many DTM tiles at once?**

Build a VRT mosaic with gdalbuildvrt and contour the VRT. The lines are continuous across tile boundaries, which they would not be if each tile were contoured separately.

**Can I choose specific elevations?**

Yes. The -fl option takes a list of fixed levels, useful for flood elevations or design heights.

## Related

- [Contour Generation from LiDAR DTMs](https://www.pythonlidar.com/ground-filtering-dtm-dsm-generation/contour-generation/) — the full workflow
- [Smoothing a LiDAR DTM Before Contouring](https://www.pythonlidar.com/ground-filtering-dtm-dsm-generation/contour-generation/smoothing-a-lidar-dtm-before-contouring/) — preparing the surface
- [Exporting Contours to GeoPackage](https://www.pythonlidar.com/ground-filtering-dtm-dsm-generation/contour-generation/exporting-contours-to-geopackage/) — cleaning and delivery
- [Building a Seamless DTM Mosaic from Tiles](https://www.pythonlidar.com/ground-filtering-dtm-dsm-generation/dtm-raster-generation/building-a-seamless-dtm-mosaic-from-tiles/) — the mosaic contours come from
- [Generating Slope and Aspect Rasters with gdaldem](https://www.pythonlidar.com/ground-filtering-dtm-dsm-generation/hillshade-slope-aspect/generating-slope-and-aspect-rasters-with-gdaldem/) — the other GDAL terrain tool
