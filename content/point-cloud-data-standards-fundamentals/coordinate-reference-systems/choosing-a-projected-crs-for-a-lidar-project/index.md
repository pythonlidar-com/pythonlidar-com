---
title: "Choosing a Projected CRS for a LiDAR Project"
description: "Pick the horizontal and vertical CRS for LiDAR processing and delivery: UTM zone from the project centroid with pyproj, national grids versus UTM, which datum realization, projects that straddle zones, scale distortion at zone edges, and the compound EPSG code to write."
slug: "choosing-a-projected-crs-for-a-lidar-project"
type: "howto"
breadcrumb: "Choosing a Projected CRS"
datePublished: "2026-09-18"
dateModified: "2026-09-18"
---

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Article",
      "headline": "Choosing a Projected CRS for a LiDAR Project",
      "description": "Pick the horizontal and vertical CRS for LiDAR processing and delivery: UTM zone from the project centroid with pyproj, national grids versus UTM, which datum realization, projects that straddle zones, scale distortion at zone edges, and the compound EPSG code to write.",
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
          "name": "Coordinate Reference Systems",
          "item": "https://www.pythonlidar.com/point-cloud-data-standards-fundamentals/coordinate-reference-systems/"
        },
        {
          "@type": "ListItem",
          "position": 4,
          "name": "Choosing a Projected CRS",
          "item": "https://www.pythonlidar.com/point-cloud-data-standards-fundamentals/coordinate-reference-systems/choosing-a-projected-crs-for-a-lidar-project/"
        }
      ]
    },
    {
      "@type": "HowTo",
      "name": "Choose a projected CRS for a LiDAR project",
      "step": [
        {
          "@type": "HowToStep",
          "name": "Check for a mandated CRS",
          "text": "Contracts and national programmes often fix the delivery CRS. If so, process in it too, unless it is geographic, in which case process in a projected CRS and reproject once at delivery."
        },
        {
          "@type": "HowToStep",
          "name": "Find the UTM zone",
          "text": "Query pyproj for UTM CRSs whose area of use contains the project centroid, filtered by datum name."
        },
        {
          "@type": "HowToStep",
          "name": "Check the extent against the zone",
          "text": "UTM zones are 6\u00b0 wide. A project that crosses a zone boundary by a few kilometres should stay in the zone containing most of it; scale error just outside a zone edge is small and far better than splitting the project."
        },
        {
          "@type": "HowToStep",
          "name": "Choose the vertical datum",
          "text": "Use the official vertical datum for the region \u2014 NAVD88 (EPSG:5703) in the conterminous US today, EVRF2007 or a national height system in Europe \u2014 and record the geoid model used."
        },
        {
          "@type": "HowToStep",
          "name": "Write the compound code everywhere",
          "text": "EPSG:6344+5703 style codes in writers.las (a_srs), writers.gdal and every output's metadata."
        }
      ]
    },
    {
      "@type": "FAQPage",
      "mainEntity": [
        {
          "@type": "Question",
          "name": "Which UTM zone should I use?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "The zone containing the project centroid, which pyproj can find with query_utm_crs_info. If the project crosses a zone boundary, keep it in the zone containing most of the area rather than splitting it."
          }
        },
        {
          "@type": "Question",
          "name": "Should I use UTM or a national grid?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Use what your client and local users work in. National and state grids are designed to minimize distortion locally and match existing mapping; UTM is a sound default when no local grid is standard."
          }
        },
        {
          "@type": "Question",
          "name": "Why use a compound CRS?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "A compound CRS declares both the horizontal system and the vertical datum. Without the vertical part, heights are ambiguous, and datum or geoid mismatches become impossible to detect or correct later."
          }
        },
        {
          "@type": "Question",
          "name": "Can I process LiDAR in latitude and longitude?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Not sensibly. Point spacing, window sizes, raster resolution and slopes all assume metric coordinates. Reproject to a projected CRS first and, if needed, back to geographic at delivery."
          }
        }
      ]
    }
  ]
}
</script>

**TL;DR:** Process in a metric projected CRS with a current datum realization — for example NAD83(2011) / UTM (EPSG:6330–6348) in the US, ETRS89 / UTM (EPSG:25828–25838) in Europe, or the national grid your client uses — combined with the official vertical datum as a compound CRS. Find the UTM zone from the project centroid with `pyproj.database.query_utm_crs_info`, and keep a project that straddles two zones in one zone rather than splitting it.

## Context and Motivation

This guide is part of [Coordinate Reference Systems](https://www.pythonlidar.com/point-cloud-data-standards-fundamentals/coordinate-reference-systems/). Everything that measures distances or areas in LiDAR processing — point spacing, SMRF windows, raster cell sizes, buffer widths, slope — assumes a projected CRS in metres with small distortion. Geographic coordinates in degrees break all of it, and a projection chosen carelessly introduces scale errors or forces data across zone boundaries. The choice is usually easy, but it should be made once, deliberately, at the start of a project, and written into every file as a compound CRS so that heights are as well defined as positions.

<svg viewBox="0 0 740 220" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Decision tree for choosing a projected CRS" style="width:100%;max-width:740px;display:block;margin:1.6rem auto">
  <title>Three questions settle most projects</title>
  <desc>A decision tree. First: does the client or regulator mandate a CRS? If yes, use it. If no: is there a national or state grid in routine use for this area? If yes, use that grid with its current datum realization. If no: use the UTM zone containing the project centroid on the current national datum, and pair it with the official vertical datum as a compound CRS.</desc>
  <defs><marker id="cc-arw" markerWidth="9" markerHeight="7" refX="9" refY="3.5" orient="auto"><path d="M0,0 L0,7 L9,3.5 z" fill="var(--dg-line)"/></marker></defs>
  <rect x="0" y="0" width="740" height="220" fill="var(--dg-bg)" rx="10"/>
  <rect x="20" y="20" width="220" height="44" rx="8" fill="var(--dg-surface)" stroke="var(--dg-line)" stroke-width="1.3"/>
  <text x="130" y="47" text-anchor="middle" font-size="10.5" fill="var(--dg-text)">client mandates a CRS?</text>
  <rect x="280" y="80" width="220" height="44" rx="8" fill="var(--dg-surface)" stroke="var(--dg-line)" stroke-width="1.3"/>
  <text x="390" y="107" text-anchor="middle" font-size="10.5" fill="var(--dg-text)">national/state grid in use?</text>
  <rect x="540" y="140" width="180" height="60" rx="8" fill="var(--dg-a-soft)" stroke="var(--dg-a)" stroke-width="1.3"/>
  <text x="630" y="166" text-anchor="middle" font-size="10.5" fill="var(--dg-text)">UTM zone of centroid</text>
  <text x="630" y="184" text-anchor="middle" font-size="10" fill="var(--dg-muted)">current datum + vertical</text>
  <rect x="20" y="140" width="220" height="60" rx="8" fill="var(--dg-d-soft)" stroke="var(--dg-d)" stroke-width="1.3"/>
  <text x="130" y="166" text-anchor="middle" font-size="10.5" fill="var(--dg-text)">use the mandated CRS</text>
  <text x="130" y="184" text-anchor="middle" font-size="10" fill="var(--dg-muted)">as a compound CRS</text>
  <rect x="280" y="150" width="220" height="50" rx="8" fill="var(--dg-b-soft)" stroke="var(--dg-b)" stroke-width="1.3"/>
  <text x="390" y="180" text-anchor="middle" font-size="10.5" fill="var(--dg-text)">national grid, current datum</text>
  <line x1="130" y1="64" x2="130" y2="136" stroke="var(--dg-line)" stroke-width="1.3" marker-end="url(#cc-arw)"/>
  <path d="M240 42 L390 42 L390 76" fill="none" stroke="var(--dg-line)" stroke-width="1.3" marker-end="url(#cc-arw)"/>
  <line x1="390" y1="124" x2="390" y2="146" stroke="var(--dg-line)" stroke-width="1.3" marker-end="url(#cc-arw)"/>
  <path d="M500 102 L630 102 L630 136" fill="none" stroke="var(--dg-line)" stroke-width="1.3" marker-end="url(#cc-arw)"/>
  <text x="138" y="104" font-size="10" fill="var(--dg-muted)">yes</text>
  <text x="300" y="36" font-size="10" fill="var(--dg-muted)">no</text>
  <text x="398" y="140" font-size="10" fill="var(--dg-muted)">yes</text>
  <text x="560" y="96" font-size="10" fill="var(--dg-muted)">no</text>
</svg>

## Prerequisites and Assumptions

- The project boundary, in any CRS, to compute a centroid and extent.
- pyproj 3.x.
- Knowledge of the client's requirements and of the official vertical datum and geoid model for the region.

## Step-by-Step Implementation

### Step 1 — Check for a mandated CRS

Contracts and national programmes often fix the delivery CRS. If so, process in it too, unless it is geographic, in which case process in a projected CRS and reproject once at delivery.

### Step 2 — Find the UTM zone

Query pyproj for UTM CRSs whose area of use contains the project centroid, filtered by datum name.

### Step 3 — Check the extent against the zone

UTM zones are 6° wide. A project that crosses a zone boundary by a few kilometres should stay in the zone containing most of it; scale error just outside a zone edge is small and far better than splitting the project.

### Step 4 — Choose the vertical datum

Use the official vertical datum for the region — NAVD88 (EPSG:5703) in the conterminous US today, EVRF2007 or a national height system in Europe — and record the geoid model used.

### Step 5 — Write the compound code everywhere

`EPSG:6344+5703` style codes in `writers.las` (`a_srs`), `writers.gdal` and every output's metadata.

## Complete Working Example

```python
"""Pick a UTM CRS for a project boundary and report scale distortion across it."""
from __future__ import annotations

import geopandas as gpd
from pyproj import CRS, Proj
from pyproj.aoi import AreaOfInterest
from pyproj.database import query_utm_crs_info


def pick_utm(boundary: gpd.GeoDataFrame, datum_name: str = "NAD83(2011)") -> CRS:
    geo = boundary.to_crs("EPSG:4326")
    lon, lat = geo.geometry.union_all().centroid.coords[0]
    infos = query_utm_crs_info(datum_name=datum_name,
                               area_of_interest=AreaOfInterest(lon, lat, lon, lat))
    if not infos:
        raise ValueError(f"no {datum_name} UTM zone found at {lon:.3f}, {lat:.3f}")
    return CRS.from_epsg(infos[0].code)


def scale_report(boundary: gpd.GeoDataFrame, crs: CRS) -> dict:
    geo = boundary.to_crs("EPSG:4326").geometry.union_all()
    minx, miny, maxx, maxy = geo.bounds
    proj = Proj(crs)
    factors = []
    for lon in (minx, (minx + maxx) / 2, maxx):
        for lat in (miny, maxy):
            factors.append(proj.get_factors(lon, lat).meridional_scale)
    return {"crs": crs.name, "epsg": crs.to_epsg(),
            "scale_min": round(min(factors), 6), "scale_max": round(max(factors), 6),
            "max_distortion_ppm": round(max(abs(f - 1) for f in factors) * 1e6, 1)}


if __name__ == "__main__":
    area = gpd.read_file("project/boundary.gpkg")
    utm = pick_utm(area)
    print(scale_report(area, utm))
    compound = f"EPSG:{utm.to_epsg()}+5703"
    print("write outputs with a_srs =", compound, "->", CRS.from_user_input(compound).name)
```

A typical result for a county near the central meridian:

```text
{'crs': 'NAD83(2011) / UTM zone 15N', 'epsg': 6344, 'scale_min': 0.999602, 'scale_max': 0.999701, 'max_distortion_ppm': 398.0}
write outputs with a_srs = EPSG:6344+5703 -> NAD83(2011) / UTM zone 15N + NAVD88 height
```

A scale factor of 0.9996 at the central meridian is by design; 400 ppm is 4 cm per 100 m, negligible for point spacing and cell sizes but worth knowing for survey-grade distance comparisons.

<svg viewBox="0 0 740 200" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="UTM scale factor across a zone" style="width:100%;max-width:740px;display:block;margin:1.6rem auto">
  <title>Scale across one UTM zone</title>
  <desc>A curve of the UTM point scale factor across a 6 degree zone at mid-latitudes. It is 0.9996 at the central meridian, rises to exactly 1 about 180 kilometres either side, and reaches about 1.0010 at the zone edges. A project straddling the edge by a small distance sees only a slight further increase.</desc>
  <rect x="0" y="0" width="740" height="200" fill="var(--dg-bg)" rx="10"/>
  <line x1="60" y1="170" x2="700" y2="170" stroke="var(--dg-line)" stroke-width="1.3"/>
  <line x1="60" y1="100" x2="700" y2="100" stroke="var(--dg-line-soft)" stroke-width="1" stroke-dasharray="4 3"/>
  <path d="M100 40 C220 150 300 150 380 152 C460 150 540 150 660 40" fill="none" stroke="var(--dg-a)" stroke-width="2"/>
  <text x="380" y="140" text-anchor="middle" font-size="10.5" fill="var(--dg-text)">0.9996 at central meridian</text>
  <text x="696" y="94" text-anchor="end" font-size="10.5" fill="var(--dg-muted)">scale = 1</text>
  <text x="110" y="34" font-size="10.5" fill="var(--dg-text)">≈ 1.0010 at zone edge</text>
  <g font-size="10" fill="var(--dg-muted)"><text text-anchor="middle" x="100" y="188">−3°</text><text text-anchor="middle" x="380" y="188">0°</text><text text-anchor="middle" x="660" y="188">+3°</text></g>
</svg>

## Key Parameter Table

| Region | Horizontal (projected) | Vertical | Compound example |
|---|---|---|---|
| Conterminous US | NAD83(2011) / UTM, EPSG:6330–6348 | NAVD88 height, EPSG:5703 | EPSG:6347+5703 |
| US, state plane | NAD83(2011) / State Plane (m or ftUS) | NAVD88 (m or ftUS) | EPSG:6539+6360 |
| Europe | ETRS89 / UTM, EPSG:25828–25838 | EVRF2007 height, EPSG:5621 | EPSG:25832+5621 |
| Great Britain | OSGB36 / British National Grid, EPSG:27700 | ODN height, EPSG:5701 | EPSG:7405 (predefined) |
| Global fallback | WGS 84 / UTM, EPSG:326xx / 327xx | EGM2008 height, EPSG:3855 | EPSG:32633+3855 |

Confirm each code in your PROJ database before use; national agencies periodically publish new realizations.

## Verification

- **Centroid lands in the zone.** Transform the centroid to the chosen CRS; the easting should fall well within 166,000–834,000 m for UTM.
- **Round trip.** Transform a few boundary vertices to the CRS and back; errors should be sub-millimetre.
- **Vertical present.** `CRS.from_user_input(compound).sub_crs_list` has two members, projected and vertical.

## Gotchas and Edge Cases

**Old datum realizations.** Plain NAD83 (EPSG:26915 etc.) and NAD83(2011) differ by up to a metre or more in places. Choose the realization that matches your control survey, and use it consistently.

**Feet in state plane.** Many state plane CRSs have both metre and US-survey-foot variants. Using a feet CRS for processing complicates every metric parameter; process in metres and convert at delivery if the client wants feet, as in [reprojecting State Plane feet to metres](https://www.pythonlidar.com/pdal-pipeline-architecture-execution/spatial-reprojection/reprojecting-state-plane-feet-to-metres/).

**Projects spanning two zones.** Splitting a project across zones creates a seam in every product. Keep one zone, accept the slightly larger scale factor beyond the edge, or use a custom transverse Mercator centred on the project for very wide areas.

<svg viewBox="0 0 740 170" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="A project straddling a UTM zone boundary kept in one zone" style="width:100%;max-width:740px;display:block;margin:1.6rem auto">
  <title>Straddling a zone boundary</title>
  <desc>Two adjacent UTM zones separated by a vertical boundary line. A project area crosses the boundary, with most of it in zone 15 and a small part in zone 16. The recommended choice keeps the whole project in zone 15, with slightly higher scale distortion in the small part beyond the edge, instead of splitting it and creating a seam.</desc>
  <rect x="0" y="0" width="740" height="170" fill="var(--dg-bg)" rx="10"/>
  <path d="M40 20 h330 v130 h-330 Z" fill="var(--dg-a-soft)" stroke="var(--dg-a)" stroke-width="1.2"/>
  <path d="M370 20 h330 v130 h-330 Z" fill="var(--dg-surface-2)" stroke="var(--dg-line)" stroke-width="1.2"/>
  <text x="200" y="40" text-anchor="middle" font-size="11" fill="var(--dg-text)">UTM zone 15</text>
  <text x="540" y="40" text-anchor="middle" font-size="11" fill="var(--dg-text)">UTM zone 16</text>
  <path d="M200 60 L420 60 L430 130 L190 130 Z" fill="var(--dg-c-soft)" stroke="var(--dg-c)" stroke-width="1.6"/>
  <text x="300" y="100" text-anchor="middle" font-size="10.5" fill="var(--dg-text)">project, processed in zone 15</text>
  <text x="560" y="100" font-size="10.5" fill="var(--dg-muted)">small overhang: keep, do not split</text>
</svg>

**Geographic processing.** Some public data is distributed in EPSG:4326. Reproject to a projected CRS before any metric processing; filters that take distances in metres interpret degrees as metres without complaint.

## Frequently Asked Questions

**Which UTM zone should I use?**

The zone containing the project centroid, which pyproj can find with query_utm_crs_info. If the project crosses a zone boundary, keep it in the zone containing most of the area rather than splitting it.

**Should I use UTM or a national grid?**

Use what your client and local users work in. National and state grids are designed to minimize distortion locally and match existing mapping; UTM is a sound default when no local grid is standard.

**Why use a compound CRS?**

A compound CRS declares both the horizontal system and the vertical datum. Without the vertical part, heights are ambiguous, and datum or geoid mismatches become impossible to detect or correct later.

**Can I process LiDAR in latitude and longitude?**

Not sensibly. Point spacing, window sizes, raster resolution and slopes all assume metric coordinates. Reproject to a projected CRS first and, if needed, back to geographic at delivery.

## Related

- [Coordinate Reference Systems](https://www.pythonlidar.com/point-cloud-data-standards-fundamentals/coordinate-reference-systems/) — CRS handling overview
- [Reading the CRS from LAS WKT and GeoTIFF Keys](https://www.pythonlidar.com/point-cloud-data-standards-fundamentals/coordinate-reference-systems/reading-the-crs-from-las-wkt-and-geotiff-keys/) — what a file declares
- [Inspecting PROJ Transformations Before Reprojecting](https://www.pythonlidar.com/pdal-pipeline-architecture-execution/spatial-reprojection/inspecting-proj-transformations-before-reprojecting/) — getting into the chosen CRS accurately
- [Setting a Vertical CRS on a Point Cloud](https://www.pythonlidar.com/point-cloud-data-standards-fundamentals/coordinate-reference-systems/setting-a-vertical-crs-on-a-point-cloud/) — the vertical half
- [Reprojecting Point Clouds from UTM to WGS84](https://www.pythonlidar.com/pdal-pipeline-architecture-execution/spatial-reprojection/reprojecting-point-clouds-from-utm-to-wgs84/) — delivering in geographic coordinates
