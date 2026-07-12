---
title: "Reprojecting Point Clouds from UTM to WGS84 with PDAL and Python"
description: "Step-by-step guide to reprojecting LAS/LAZ point clouds from UTM to WGS84 (EPSG:4326) using PDAL filters.reprojection and a pyproj+laspy fallback, with datum handling, header sync, and validation."
slug: "reprojecting-point-clouds-from-utm-to-wgs84"
type: "howto"
breadcrumb: "Reprojecting UTM to WGS84"
datePublished: "2024-03-15"
dateModified: "2026-06-24"
---

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Article",
      "headline": "Reprojecting Point Clouds from UTM to WGS84 with PDAL and Python",
      "description": "Step-by-step guide to reprojecting LAS/LAZ point clouds from UTM to WGS84 using PDAL filters.reprojection and a pyproj+laspy fallback, with datum handling, header sync, and validation.",
      "datePublished": "2024-03-15",
      "dateModified": "2026-06-24",
      "author": { "@type": "Organization", "name": "pythonlidar.com" }
    },
    {
      "@type": "BreadcrumbList",
      "itemListElement": [
        { "@type": "ListItem", "position": 1, "name": "Home", "item": "https://www.pythonlidar.com/" },
        { "@type": "ListItem", "position": 2, "name": "PDAL Pipeline Architecture & Execution", "item": "https://www.pythonlidar.com/pdal-pipeline-architecture-execution/" },
        { "@type": "ListItem", "position": 3, "name": "Spatial Reprojection", "item": "https://www.pythonlidar.com/pdal-pipeline-architecture-execution/spatial-reprojection/" },
        { "@type": "ListItem", "position": 4, "name": "Reprojecting UTM to WGS84", "item": "https://www.pythonlidar.com/pdal-pipeline-architecture-execution/spatial-reprojection/reprojecting-point-clouds-from-utm-to-wgs84/" }
      ]
    },
    {
      "@type": "HowTo",
      "name": "Reproject Point Clouds from UTM to WGS84",
      "description": "Reproject a LAS/LAZ file from a UTM projected coordinate system to WGS84 geographic coordinates using PDAL and Python.",
      "step": [
        { "@type": "HowToStep", "position": 1, "name": "Identify source EPSG code", "text": "Confirm the UTM zone and hemisphere from the input LAS header using pdal info --metadata." },
        { "@type": "HowToStep", "position": 2, "name": "Build the PDAL reprojection pipeline", "text": "Declare filters.reprojection with in_srs and out_srs, then write with writers.las using a_srs and forward:all." },
        { "@type": "HowToStep", "position": 3, "name": "Execute the pipeline in Python", "text": "Call pdal.Pipeline(json.dumps(pipeline_dict)).execute() and check the returned point count." },
        { "@type": "HowToStep", "position": 4, "name": "Verify the output CRS and point count", "text": "Run pdal info --metadata on the output file and assert input_count == output_count." }
      ]
    },
    {
      "@type": "FAQPage",
      "mainEntity": [
        {
          "@type": "Question",
          "name": "Does PDAL automatically update the LAS header CRS after reprojection?",
          "acceptedAnswer": { "@type": "Answer", "text": "Yes — when you set a_srs on writers.las, PDAL writes a WKT2 VLR into the output header. Without a_srs the header retains the source CRS, which will confuse downstream GIS tools." }
        },
        {
          "@type": "Question",
          "name": "Are Z values transformed when reprojecting from UTM to WGS84?",
          "acceptedAnswer": { "@type": "Answer", "text": "Only if you include a compound CRS (e.g. EPSG:32618+5703) in out_srs. A plain EPSG:4326 target leaves Z values in their original vertical datum (NAVD88, EGM96, etc.) untouched." }
        },
        {
          "@type": "Question",
          "name": "Which UTM EPSG codes map to WGS84 (EPSG:4326)?",
          "acceptedAnswer": { "@type": "Answer", "text": "North-hemisphere zones run EPSG:32601-32660 (zone 1N-60N); south-hemisphere zones run EPSG:32701-32760. For NAD83 UTM use EPSG:26901-26923." }
        },
        {
          "@type": "Question",
          "name": "Does filters.reprojection require the input file to have a valid CRS in its header?",
          "acceptedAnswer": { "@type": "Answer", "text": "No. If you supply in_srs explicitly in the pipeline JSON, PDAL uses that value regardless of what the header says. This is the correct approach for files with empty or incorrect CRS metadata." }
        }
      ]
    }
  ]
}
</script>

**TL;DR:** Pass `filters.reprojection` with `in_srs: "EPSG:<utm_zone>"` and `out_srs: "EPSG:4326"` in a PDAL pipeline, then write with `writers.las` using `a_srs: "EPSG:4326"` and `forward: "all"` — the header, all attributes, and Z values in their original vertical datum are preserved automatically.

## Context and Motivation

This guide is part of [Spatial Reprojection in PDAL](https://www.pythonlidar.com/pdal-pipeline-architecture-execution/spatial-reprojection/), which covers the full range of coordinate system transformations available in a [PDAL pipeline](https://www.pythonlidar.com/pdal-pipeline-architecture-execution/).

UTM coordinates are ubiquitous in survey-grade LiDAR deliverables — they are metre-based, zone-specific, and optimised for regional accuracy. WGS84 (EPSG:4326) is the geographic coordinate system that web maps, cloud platforms, and most interoperability formats expect. The mismatch creates a routine but error-prone handoff: naive reprojection either corrupts the [LAS/LAZ file](https://www.pythonlidar.com/point-cloud-data-standards-fundamentals/laslaz-file-structure/) header CRS, silently applies approximate datum shifts, or produces unit confusion when Z values in metres are mixed with X/Y in decimal degrees.

Getting this right matters beyond aesthetics. A mismatched [coordinate reference system](https://www.pythonlidar.com/point-cloud-data-standards-fundamentals/coordinate-reference-systems/) in a production point cloud can cascade into broken ground classification, incorrect hillshade rasters, and failed API ingest. PDAL's `filters.reprojection` stage, backed by the PROJ engine, handles the inverse map projection and datum grid application in a single streaming pass — no in-memory array juggling required.

<svg viewBox="0 0 760 280" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="PDAL UTM to WGS84 reprojection data flow with PROJ datum lookup" style="width:100%;max-width:760px;display:block;margin:1.5rem auto;">
  <title>UTM to WGS84 reprojection pipeline stage flow with PROJ datum grid lookup</title>
  <desc>Four boxes connected by arrows: readers.las reading EPSG:32618 UTM input, then filters.reprojection which calls out to the PROJ datum grid for the inverse UTM projection, then writers.las writing EPSG:4326 WGS84 output with an updated WKT2 VLR in the header. A separate annotation shows that Z values are passed through unchanged unless a compound CRS is used.</desc>
  <defs>
    <marker id="utm-arr" markerWidth="8" markerHeight="8" refX="7" refY="3" orient="auto">
      <path d="M0,0 L0,6 L8,3 z" fill="currentColor"/>
    </marker>
    <marker id="utm-arr-dashed" markerWidth="8" markerHeight="8" refX="7" refY="3" orient="auto">
      <path d="M0,0 L0,6 L8,3 z" fill="currentColor" opacity="0.5"/>
    </marker>
  </defs>
  <!-- readers.las box -->
  <rect x="10" y="90" width="155" height="80" rx="8" fill="none" stroke="currentColor" stroke-width="1.5"/>
  <text x="87" y="124" text-anchor="middle" font-size="13" fill="currentColor" font-family="sans-serif" font-weight="600">readers.las</text>
  <text x="87" y="143" text-anchor="middle" font-size="11" fill="currentColor" font-family="sans-serif" opacity="0.7">EPSG:32618</text>
  <text x="87" y="159" text-anchor="middle" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.55">UTM Zone 18N</text>
  <!-- arrow 1 -->
  <line x1="165" y1="130" x2="213" y2="130" stroke="currentColor" stroke-width="1.5" marker-end="url(#utm-arr)"/>
  <!-- filters.reprojection box -->
  <rect x="215" y="60" width="200" height="140" rx="8" fill="none" stroke="currentColor" stroke-width="1.5"/>
  <text x="315" y="92" text-anchor="middle" font-size="13" fill="currentColor" font-family="sans-serif" font-weight="600">filters.reprojection</text>
  <text x="315" y="113" text-anchor="middle" font-size="11" fill="currentColor" font-family="sans-serif" opacity="0.75">in_srs: EPSG:32618</text>
  <text x="315" y="131" text-anchor="middle" font-size="11" fill="currentColor" font-family="sans-serif" opacity="0.75">out_srs: EPSG:4326</text>
  <text x="315" y="153" text-anchor="middle" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.55">inverse UTM projection</text>
  <text x="315" y="169" text-anchor="middle" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.55">streaming — no full RAM load</text>
  <text x="315" y="185" text-anchor="middle" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.55">X,Y → lon/lat (degrees)</text>
  <!-- PROJ datum grid callout -->
  <rect x="248" y="218" width="135" height="46" rx="6" fill="none" stroke="currentColor" stroke-width="1" stroke-dasharray="4 3" opacity="0.6"/>
  <text x="315" y="238" text-anchor="middle" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.7">PROJ datum grid</text>
  <text x="315" y="253" text-anchor="middle" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.7">$PROJ_DATA/*.tif</text>
  <line x1="315" y1="200" x2="315" y2="218" stroke="currentColor" stroke-width="1" stroke-dasharray="3 3" opacity="0.5" marker-end="url(#utm-arr-dashed)"/>
  <!-- arrow 2 -->
  <line x1="415" y1="130" x2="463" y2="130" stroke="currentColor" stroke-width="1.5" marker-end="url(#utm-arr)"/>
  <!-- writers.las box -->
  <rect x="465" y="90" width="180" height="80" rx="8" fill="none" stroke="currentColor" stroke-width="1.5"/>
  <text x="555" y="124" text-anchor="middle" font-size="13" fill="currentColor" font-family="sans-serif" font-weight="600">writers.las</text>
  <text x="555" y="143" text-anchor="middle" font-size="11" fill="currentColor" font-family="sans-serif" opacity="0.75">a_srs: EPSG:4326</text>
  <text x="555" y="159" text-anchor="middle" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.55">WKT2 VLR injected</text>
  <!-- Z passthrough annotation -->
  <text x="380" y="26" text-anchor="middle" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.55" font-style="italic">Z passthrough (unchanged unless compound CRS)</text>
  <line x1="87" y1="90" x2="87" y2="36" stroke="currentColor" stroke-width="1" stroke-dasharray="3 3" opacity="0.35"/>
  <line x1="87" y1="36" x2="555" y2="36" stroke="currentColor" stroke-width="1" stroke-dasharray="3 3" opacity="0.35"/>
  <line x1="555" y1="36" x2="555" y2="90" stroke="currentColor" stroke-width="1" stroke-dasharray="3 3" opacity="0.35"/>
</svg>

## Prerequisites and Assumptions

| Requirement | Minimum version / detail |
|---|---|
| PDAL | 2.4+ (PROJ 8+ bundled) |
| Python `pdal` bindings | 3.x (`pip install pdal`) |
| `pyproj` (fallback only) | 3.4+ |
| `laspy` (fallback only) | 2.0+ |
| Input file | LAS 1.2–1.4 or LAZ; CRS correctly embedded in VLR |
| Source EPSG known | Must know the UTM zone before calling the pipeline |

Confirm your input file's embedded CRS before writing the pipeline:

```bash
pdal info --metadata input.laz | python -m json.tool | grep -i srs
```

If the header reports `EPSG:0` or empty WKT, supply `in_srs` explicitly rather than relying on the file — an untagged file will silently produce incorrect output coordinates. See [fixing CRS mismatches in point clouds](https://www.pythonlidar.com/point-cloud-data-standards-fundamentals/coordinate-reference-systems/fixing-crs-mismatches-in-point-clouds/) for a full repair workflow. You can also run [pipeline validation](https://www.pythonlidar.com/pdal-pipeline-architecture-execution/pipeline-validation/) on the source pipeline JSON before executing it against real data.

## Step-by-Step Implementation

### Step 1 — Identify the source EPSG code

UTM zones follow a deterministic pattern. For a file covering the US East Coast (e.g. UTM Zone 18N, WGS84 datum): `EPSG:32618`. For NAD83 datum equivalents, the EPSG range is `EPSG:26901`–`26923`. Run `pdal info --metadata` or open the file in QGIS to read the VLR CRS before hardcoding anything.

### Step 2 — Build the reprojection pipeline

The minimal JSON pipeline has three stages: a reader, the reprojection filter, and a writer with explicit CRS tagging. This follows the same [PDAL stage chaining](https://www.pythonlidar.com/pdal-pipeline-architecture-execution/pdal-stage-chaining/) pattern used across all PDAL workflows — each stage passes its point buffer to the next in sequence.

```json
{
  "pipeline": [
    "input_utm.laz",
    {
      "type": "filters.reprojection",
      "in_srs": "EPSG:32618",
      "out_srs": "EPSG:4326"
    },
    {
      "type": "writers.las",
      "filename": "output_wgs84.laz",
      "a_srs": "EPSG:4326",
      "forward": "all"
    }
  ]
}
```

Key decisions:

- `in_srs` overrides whatever the header says; always supply it explicitly when the source CRS might be absent or wrong.
- `out_srs: "EPSG:4326"` targets 2D geographic coordinates. X becomes longitude, Y becomes latitude — both in decimal degrees.
- `a_srs` on `writers.las` writes the target CRS as a WKT2 VLR into the output header. Without it, the coordinates shift but the header still claims the old UTM CRS.
- `forward: "all"` propagates every non-geometric VLR and dimension (intensity, return number, classification) into the output unchanged.

### Step 3 — Execute in Python

```python
import pdal
import json

def reproject_utm_to_wgs84(
    input_path: str,
    output_path: str,
    source_epsg: int,
) -> int:
    """
    Reproject a LAS/LAZ file from UTM to WGS84 geographic coordinates.

    Args:
        input_path:   Path to source LAS/LAZ file in UTM.
        output_path:  Destination path for the WGS84 output.
        source_epsg:  EPSG integer for the source UTM CRS (e.g. 32618 for UTM Zone 18N).

    Returns:
        Number of points written to the output file.

    Raises:
        RuntimeError: If PDAL processes zero points (empty file or bad pipeline).
    """
    pipeline_dict = {
        "pipeline": [
            input_path,
            {
                "type": "filters.reprojection",
                "in_srs": f"EPSG:{source_epsg}",
                "out_srs": "EPSG:4326"
            },
            {
                "type": "writers.las",
                "filename": output_path,
                "a_srs": "EPSG:4326",
                "forward": "all"
            }
        ]
    }

    pipeline = pdal.Pipeline(json.dumps(pipeline_dict))
    count = pipeline.execute()

    if count == 0:
        raise RuntimeError(
            f"PDAL executed but processed 0 points from '{input_path}'. "
            "Check that in_srs matches the actual file CRS."
        )

    return count
```

PDAL's streaming model processes the file in configurable chunks — this pipeline handles multi-gigabyte files without loading the full point cloud into RAM, unlike the array-based fallback in the complete example below.

### Step 4 — Lightweight fallback with `pyproj` + `laspy`

When PDAL cannot be installed (minimal containers, serverless functions), transform coordinates with `laspy` and `pyproj`. This loads the entire cloud into memory, so it is unsuitable for files above a few hundred MB unless your environment has the RAM budget.

```python
import laspy
from pyproj import Transformer, CRS

def reproject_utm_to_wgs84_laspy(
    input_path: str,
    output_path: str,
    source_epsg: int,
) -> None:
    """
    Memory-resident reprojection fallback via laspy + pyproj.
    Loads the entire point cloud; use only for small files (<500 MB).
    Z values are NOT transformed — they remain in the original vertical datum.
    """
    with laspy.open(input_path) as f:
        las = f.read()

    # always_xy=True guarantees (longitude, latitude) ordering regardless of CRS axis order
    transformer = Transformer.from_crs(
        f"EPSG:{source_epsg}", "EPSG:4326", always_xy=True
    )

    lon, lat = transformer.transform(las.x, las.y)

    # laspy 2.x recalculates scale/offset on assignment via .x / .y properties
    las.x = lon
    las.y = lat
    # Z intentionally left unchanged — NAVD88/EGM96 heights remain valid

    # Inject a WKT2 VLR so GIS tools recognise the new CRS
    target_crs = CRS.from_epsg(4326)
    las.header.vlrs = [
        laspy.vlrs.VLR(
            user_id="LASF_Projection",
            record_id=2112,
            description="WKT Coordinate System",
            record_data=target_crs.to_wkt().encode("utf-8"),
        )
    ]
    las.header.global_encoding.wkt = True

    las.write(output_path)
    print(f"Transformed {len(las.x):,} points to EPSG:4326.")
```

## Complete Working Example

The following script can be copied, saved as `reproject_utm_wgs84.py`, and run against any LAS/LAZ file in UTM. It wires together the PDAL pipeline approach, verification, and coordinate range assertion in a single executable module.

```python
#!/usr/bin/env python3
"""
reproject_utm_wgs84.py
Reproject a LAS/LAZ file from any UTM zone to WGS84 (EPSG:4326) using PDAL.

Usage:
    python reproject_utm_wgs84.py input_utm18n.laz output_wgs84.laz 32618

Requirements:
    pip install pdal
    PDAL 2.4+ with PROJ 8+ (available via conda-forge: conda install -c conda-forge pdal)
"""

import json
import sys

import pdal


def reproject_utm_to_wgs84(
    input_path: str,
    output_path: str,
    source_epsg: int,
) -> int:
    """Reproject UTM LAS/LAZ to WGS84 geographic coordinates (EPSG:4326)."""
    pipeline_dict = {
        "pipeline": [
            input_path,
            {
                "type": "filters.reprojection",
                "in_srs": f"EPSG:{source_epsg}",
                "out_srs": "EPSG:4326",
            },
            {
                "type": "writers.las",
                "filename": output_path,
                "a_srs": "EPSG:4326",
                "forward": "all",
            },
        ]
    }

    pipeline = pdal.Pipeline(json.dumps(pipeline_dict))
    count = pipeline.execute()

    if count == 0:
        raise RuntimeError(
            f"PDAL processed 0 points from '{input_path}'. "
            "Verify that in_srs matches the actual file CRS."
        )

    return count


def verify_reprojection(input_path: str, output_path: str, expected_count: int) -> None:
    """Assert point count parity and check output coordinate ranges."""

    def count_points(path: str) -> int:
        p = pdal.Pipeline(json.dumps({"pipeline": [path]}))
        p.execute()
        return p.arrays[0].shape[0]

    n_out = count_points(output_path)
    assert n_out == expected_count, (
        f"Point count mismatch: {expected_count:,} in vs {n_out:,} out. "
        "Check that no filter stage was unintentionally applied."
    )

    # Spot-check coordinate ranges — WGS84 lon is [-180, 180], lat is [-90, 90]
    p = pdal.Pipeline(json.dumps({"pipeline": [output_path]}))
    p.execute()
    pts = p.arrays[0]
    assert pts["X"].min() > -180 and pts["X"].max() < 180, "X outside WGS84 longitude range"
    assert pts["Y"].min() > -90 and pts["Y"].max() < 90, "Y outside WGS84 latitude range"

    print(f"OK: {n_out:,} points verified at EPSG:4326 coordinate ranges.")


def main() -> None:
    if len(sys.argv) != 4:
        print("Usage: python reproject_utm_wgs84.py <input.laz> <output.laz> <source_epsg>")
        sys.exit(1)

    input_path = sys.argv[1]
    output_path = sys.argv[2]
    source_epsg = int(sys.argv[3])

    print(f"Reprojecting {input_path} (EPSG:{source_epsg}) -> {output_path} (EPSG:4326)...")
    count = reproject_utm_to_wgs84(input_path, output_path, source_epsg)
    print(f"Reprojected {count:,} points.")

    verify_reprojection(input_path, output_path, count)


if __name__ == "__main__":
    main()
```

## Key Parameter Table

| Parameter | Stage | Type | Default | Notes |
|---|---|---|---|---|
| `in_srs` | `filters.reprojection` | string (EPSG or WKT2) | file header CRS | Always supply explicitly; do not trust empty headers |
| `out_srs` | `filters.reprojection` | string (EPSG or WKT2) | — | `EPSG:4326` for 2D WGS84; use compound CRS to include vertical datum transform |
| `a_srs` | `writers.las` | string (EPSG or WKT2) | none | Writes target CRS as WKT2 VLR; **required** for correct downstream CRS detection |
| `forward` | `writers.las` | `"all"` / `"header"` / `"vlr"` | `"none"` | `"all"` preserves all VLRs, scale, offset, and point format metadata |
| `always_xy` | `pyproj.Transformer` | bool | `False` | Set `True` to enforce (lon, lat) order regardless of CRS authority definition |

### Including a vertical datum transform

If your deliverable requires heights in WGS84 ellipsoidal metres (e.g. for web APIs or volumetric analysis tools), chain the horizontal and vertical transformation with a compound CRS:

```json
{
  "type": "filters.reprojection",
  "in_srs": "EPSG:32618+5703",
  "out_srs": "EPSG:4979"
}
```

`EPSG:32618+5703` combines UTM Zone 18N with NAVD88 heights. `EPSG:4979` is 3D WGS84 (lon/lat/ellipsoidal height). PROJ applies the GEOID12B or GEOID18 grid automatically when it is present in `$PROJ_DATA`.

## Verification

After running either workflow, confirm the transformation succeeded before the file enters any downstream pipeline or is delivered to a client.

**Check the output header CRS:**

```bash
pdal info --metadata output_wgs84.laz | python -m json.tool | grep -i "srs\|epsg\|wkt"
```

Expect to see `EPSG:4326` or a WKT2 string containing `"GEOGCRS["WGS 84"` in the metadata output.

**Assert point count parity:**

```python
import pdal, json

def verify_reprojection(input_path: str, output_path: str) -> None:
    def count_points(path: str) -> int:
        p = pdal.Pipeline(json.dumps({"pipeline": [path]}))
        p.execute()
        return p.arrays[0].shape[0]

    n_in  = count_points(input_path)
    n_out = count_points(output_path)

    assert n_in == n_out, (
        f"Point count mismatch: {n_in:,} in vs {n_out:,} out. "
        "A filter stage may have been unintentionally applied."
    )
    print(f"OK: {n_out:,} points, CRS updated to EPSG:4326.")
```

**Spot-check coordinate range:**

WGS84 decimal degrees are always in the range `[-180, 180]` for longitude and `[-90, 90]` for latitude. If output X values are still in the millions, the header was read but coordinates were not actually transformed — a sign that `in_srs` was silently ignored because it matched an already-geographic header.

```python
p = pdal.Pipeline(json.dumps({"pipeline": ["output_wgs84.laz"]}))
p.execute()
pts = p.arrays[0]
assert pts["X"].min() > -180 and pts["X"].max() < 180, "X outside WGS84 longitude range"
assert pts["Y"].min() >  -90 and pts["Y"].max() <  90, "Y outside WGS84 latitude range"
```

## Gotchas and Edge Cases

**1. Header says UTM but coordinates are already geographic.**
Some LAZ files created by third-party exporters embed the wrong CRS in the header while the stored X/Y are already in decimal degrees. If you apply UTM to WGS84 to these, the output is garbage. Always run `pdal info --stats` and eyeball the `X`/`Y` ranges: UTM easting typically falls between 160,000 and 834,000 m; values below 180 almost certainly indicate geographic coordinates already.

**2. Missing PROJ datum grid files produce silent metre-scale errors.**
When PROJ cannot find a required transformation grid (e.g. `us_noaa_conus.tif` for NAD27 to WGS84), it silently falls back to an approximate 7-parameter Helmert transformation, introducing errors of 1–10 m. Install the full PROJ grid package before running survey-grade reprojection:

```bash
conda install -c conda-forge proj-data
# or
pip install pyproj[grids]
```

Verify available transformations with:

```bash
projinfo -s EPSG:32618 -t EPSG:4326 --summary
```

**3. Scale/offset corruption in the laspy fallback.**
The `laspy` fallback assigns decimal-degree values to `las.x` and `las.y`, which triggers automatic scale/offset recalculation. However, if the original LAS file had a large UTM northing offset (e.g. 4,500,000 m), the auto-offset may store coordinates with insufficient decimal places. Check `las.header.offsets` and `las.header.scales` after assignment and confirm the stored precision is no larger than `1e-7` degrees (about 1 cm at the equator).

**4. Mixing horizontal WGS84 degrees with vertical metre values.**
A common oversight in survey workflows: horizontal units shift to decimal degrees while Z remains in metres. Downstream tools that compute 3D distances will produce wildly incorrect results if they assume a single unit system. Document this in the output file's VLR description, or apply the compound CRS approach in the parameter table above to convert Z to ellipsoidal heights in the same pass.

## Frequently Asked Questions

**Does `filters.reprojection` require the input file to have a valid CRS in its header?**

No. If you supply `in_srs` explicitly in the pipeline JSON, PDAL uses that value regardless of what the header says. This is the correct approach for files with empty or incorrect CRS metadata — a situation that [fixing CRS mismatches in point clouds](https://www.pythonlidar.com/point-cloud-data-standards-fundamentals/coordinate-reference-systems/fixing-crs-mismatches-in-point-clouds/) covers in depth.

**Does PDAL automatically update the LAS header CRS after reprojection?**

Yes — when you set `a_srs` on `writers.las`, PDAL writes a WKT2 VLR into the output header. Without `a_srs` the header retains the source CRS, which will confuse downstream GIS tools. Parsing and checking that VLR is covered in [how to parse LAS headers with Python](https://www.pythonlidar.com/point-cloud-data-standards-fundamentals/laslaz-file-structure/how-to-parse-las-headers-with-python/).

**Are Z values transformed when reprojecting from UTM to WGS84?**

Only if you include a compound CRS (e.g. `EPSG:32618+5703`) in `out_srs`. A plain `EPSG:4326` target leaves Z values in their original vertical datum (NAVD88, EGM96, etc.) untouched, as shown in the diagram above.

**Can I chain reprojection with other filters in the same pipeline?**

Yes, and that is the normal pattern. You can combine reprojection with statistical outlier removal in a single pipeline pass — see [applying statistical outlier filters in PDAL](https://www.pythonlidar.com/pdal-pipeline-architecture-execution/pipeline-filtering-logic/applying-statistical-outlier-filters-in-pdal/). Place `filters.reprojection` before any filter that operates in geographic space (e.g. spatial bounds filtering) but after filters that work on raw intensity or classification dimensions.

**What if I need to reproject to a different UTM zone rather than WGS84?**

Change `out_srs` to the target UTM EPSG code (e.g. `"EPSG:32619"` for UTM Zone 19N). The same pipeline structure applies; set `a_srs` on the writer to match the output zone.

---

## Related

- [Spatial Reprojection in PDAL](https://www.pythonlidar.com/pdal-pipeline-architecture-execution/spatial-reprojection/) — parent guide covering CRS concepts, reprojection stage parameters, and batch reprojection patterns
- [PDAL Pipeline Architecture & Execution](https://www.pythonlidar.com/pdal-pipeline-architecture-execution/) — how readers, filters, and writers chain together into a streaming execution model
- [Fixing CRS Mismatches in Point Clouds](https://www.pythonlidar.com/point-cloud-data-standards-fundamentals/coordinate-reference-systems/fixing-crs-mismatches-in-point-clouds/) — diagnose and repair embedded CRS errors before reprojection
- [Applying Statistical Outlier Filters in PDAL](https://www.pythonlidar.com/pdal-pipeline-architecture-execution/pipeline-filtering-logic/applying-statistical-outlier-filters-in-pdal/) — combine with reprojection in a single pipeline pass
- [LAS/LAZ File Structure](https://www.pythonlidar.com/point-cloud-data-standards-fundamentals/laslaz-file-structure/) — VLR layout and header fields that carry the CRS after transformation
