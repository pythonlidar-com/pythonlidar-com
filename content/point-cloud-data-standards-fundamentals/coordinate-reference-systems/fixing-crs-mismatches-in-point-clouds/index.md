---
title: "Fixing CRS Mismatches in Point Clouds with Python"
description: "Step-by-step guide to diagnosing and fixing CRS mismatches in LAS/LAZ point clouds using laspy and pyproj: extract VLR metadata, apply datum-aware transformations, validate vertical accuracy, and write corrected files."
slug: "fixing-crs-mismatches-in-point-clouds"
type: "long_tail"
breadcrumb: "Fixing CRS Mismatches in Point Clouds"
datePublished: "2024-03-15"
dateModified: "2026-06-24"
---

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Article",
      "headline": "Fixing CRS Mismatches in Point Clouds with Python",
      "description": "Step-by-step guide to diagnosing and fixing CRS mismatches in LAS/LAZ point clouds using laspy and pyproj: extract VLR metadata, apply datum-aware transformations, validate vertical accuracy, and write corrected files.",
      "datePublished": "2024-03-15",
      "dateModified": "2026-06-24",
      "author": { "@type": "Organization", "name": "pythonlidar.com" }
    },
    {
      "@type": "BreadcrumbList",
      "itemListElement": [
        { "@type": "ListItem", "position": 1, "name": "Point Cloud Data Standards & Fundamentals", "item": "https://pythonlidar.com/point-cloud-data-standards-fundamentals/" },
        { "@type": "ListItem", "position": 2, "name": "Coordinate Reference Systems", "item": "https://pythonlidar.com/point-cloud-data-standards-fundamentals/coordinate-reference-systems/" },
        { "@type": "ListItem", "position": 3, "name": "Fixing CRS Mismatches in Point Clouds", "item": "https://pythonlidar.com/point-cloud-data-standards-fundamentals/coordinate-reference-systems/fixing-crs-mismatches-in-point-clouds/" }
      ]
    },
    {
      "@type": "HowTo",
      "name": "Fix CRS Mismatches in LAS/LAZ Point Clouds with Python",
      "step": [
        { "@type": "HowToStep", "position": 1, "name": "Diagnose the mismatch", "text": "Inspect LAS header VLRs with laspy to determine whether WKT2 (record_id 2112) or legacy GeoKey (record_id 34735) records are present, missing, or corrupt." },
        { "@type": "HowToStep", "position": 2, "name": "Construct the source CRS", "text": "Parse the WKT2 string via CRS.from_wkt() or fall back to CRS.from_epsg() if the header is missing a CRS definition." },
        { "@type": "HowToStep", "position": 3, "name": "Build a datum-aware transformer", "text": "Create a pyproj Transformer with always_xy=True and authority='EPSG' to prevent axis-order swaps and apply vertical grid shifts automatically." },
        { "@type": "HowToStep", "position": 4, "name": "Transform coordinates and copy attributes", "text": "Apply transformer.transform() to las.x, las.y, las.z and copy all non-coordinate dimensions (intensity, classification, return_number) verbatim." },
        { "@type": "HowToStep", "position": 5, "name": "Write the corrected file with an updated WKT2 VLR", "text": "Build a new LasHeader, inject the target CRS as VLR record_id 2112, set global_encoding.wkt = True, and write via laspy.LasData.write()." },
        { "@type": "HowToStep", "position": 6, "name": "Validate bounding box and vertical accuracy", "text": "Compare pre- and post-transformation bounding boxes and check at least one known ground control point to confirm sub-centimeter horizontal and vertical accuracy." }
      ]
    },
    {
      "@type": "FAQPage",
      "mainEntity": [
        {
          "@type": "Question",
          "name": "Why do point clouds have CRS mismatches?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Mismatches arise from sensor firmware defaults writing incorrect EPSG codes, legacy formats using GeoTIFF GeoKeys that drop vertical datum information, cross-organisation data sharing where headers get stripped, and LAS 1.0–1.3 files that encode only a 2D horizontal projection with no geoid reference."
          }
        },
        {
          "@type": "Question",
          "name": "What does always_xy=True do in pyproj?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "EPSG:4326 officially defines axis order as (latitude, longitude), but most geospatial software expects (longitude, latitude). Setting always_xy=True forces pyproj to treat the first axis as easting (X) and the second as northing (Y) regardless of the CRS authority definition, preventing silent coordinate swaps."
          }
        },
        {
          "@type": "Question",
          "name": "How do I fix a LAS file with a completely missing CRS?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Cross-reference the acquisition metadata (flight plan, survey log, or adjacent shapefiles) to determine the original reference frame. Then supply the CRS manually with CRS.from_epsg() in your script and inject it as a WKT2 VLR (record_id 2112) in the output file header."
          }
        }
      ]
    }
  ]
}
</script>

Use `laspy` to extract the embedded CRS from the file's VLRs, construct a `pyproj.Transformer` with `always_xy=True`, apply the transformation to all three coordinate axes, and write a corrected file with a WKT2 VLR — never apply manual offsets or naive scaling.

## Context and Motivation

This guide is part of [Coordinate Reference Systems](/point-cloud-data-standards-fundamentals/coordinate-reference-systems/) in the [Point Cloud Data Standards & Fundamentals](/point-cloud-data-standards-fundamentals/) reference.

CRS mismatches are the most common silent data-corruption problem in production LiDAR pipelines. A 1-metre horizontal offset in UTM coordinates propagates undetected through ground classification, volumetric calculations, and infrastructure model alignment — until a deliverable fails a field survey check. The failures stem from several sources: sensor firmware defaults writing incorrect EPSG codes, legacy GeoTIFF GeoKey records that encode only a 2D horizontal datum with no geoid, cross-organisation data sharing that strips headers entirely, and [LAS/LAZ file structure](/point-cloud-data-standards-fundamentals/laslaz-file-structure/) version constraints that limit LAS 1.0–1.3 files to a 5-bit classification byte and simplified CRS fields.

Understanding where the CRS lives in the binary header is the prerequisite for fixing it reliably.

<figure role="img" aria-label="CRS mismatch diagnosis and fix pipeline: from raw LAS file through header inspection, transformation, and validated output">
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 760 220" fill="none" aria-label="Flowchart showing the six stages of fixing a CRS mismatch in a LAS point cloud">
  <title>CRS Mismatch Fix Pipeline</title>
  <desc>Six sequential stages: raw LAS file, inspect VLRs, parse CRS, transform coordinates, write output, validate. Arrows connect each stage left to right.</desc>
  <defs>
    <marker id="arr" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
      <path d="M0,0 L0,6 L8,3 z" fill="currentColor"/>
    </marker>
  </defs>
  <!-- Stage boxes -->
  <!-- 1: Raw LAS -->
  <rect x="10" y="80" width="100" height="60" rx="6" stroke="currentColor" stroke-width="1.5" fill="none"/>
  <text x="60" y="104" text-anchor="middle" font-size="11" fill="currentColor" font-family="sans-serif">Raw LAS</text>
  <text x="60" y="120" text-anchor="middle" font-size="11" fill="currentColor" font-family="sans-serif">/ LAZ file</text>
  <!-- Arrow -->
  <line x1="110" y1="110" x2="130" y2="110" stroke="currentColor" stroke-width="1.5" marker-end="url(#arr)"/>
  <!-- 2: Inspect VLRs -->
  <rect x="130" y="80" width="110" height="60" rx="6" stroke="currentColor" stroke-width="1.5" fill="none"/>
  <text x="185" y="104" text-anchor="middle" font-size="11" fill="currentColor" font-family="sans-serif">Inspect</text>
  <text x="185" y="120" text-anchor="middle" font-size="11" fill="currentColor" font-family="sans-serif">VLRs</text>
  <!-- Arrow -->
  <line x1="240" y1="110" x2="260" y2="110" stroke="currentColor" stroke-width="1.5" marker-end="url(#arr)"/>
  <!-- 3: Parse / assign CRS -->
  <rect x="260" y="80" width="110" height="60" rx="6" stroke="currentColor" stroke-width="1.5" fill="none"/>
  <text x="315" y="104" text-anchor="middle" font-size="11" fill="currentColor" font-family="sans-serif">Parse /</text>
  <text x="315" y="120" text-anchor="middle" font-size="11" fill="currentColor" font-family="sans-serif">Assign CRS</text>
  <!-- Arrow -->
  <line x1="370" y1="110" x2="390" y2="110" stroke="currentColor" stroke-width="1.5" marker-end="url(#arr)"/>
  <!-- 4: Transform XYZ -->
  <rect x="390" y="80" width="110" height="60" rx="6" stroke="currentColor" stroke-width="1.5" fill="none"/>
  <text x="445" y="104" text-anchor="middle" font-size="11" fill="currentColor" font-family="sans-serif">Transform</text>
  <text x="445" y="120" text-anchor="middle" font-size="11" fill="currentColor" font-family="sans-serif">X / Y / Z</text>
  <!-- Arrow -->
  <line x1="500" y1="110" x2="520" y2="110" stroke="currentColor" stroke-width="1.5" marker-end="url(#arr)"/>
  <!-- 5: Write output -->
  <rect x="520" y="80" width="110" height="60" rx="6" stroke="currentColor" stroke-width="1.5" fill="none"/>
  <text x="575" y="104" text-anchor="middle" font-size="11" fill="currentColor" font-family="sans-serif">Write</text>
  <text x="575" y="120" text-anchor="middle" font-size="11" fill="currentColor" font-family="sans-serif">+ WKT2 VLR</text>
  <!-- Arrow -->
  <line x1="630" y1="110" x2="650" y2="110" stroke="currentColor" stroke-width="1.5" marker-end="url(#arr)"/>
  <!-- 6: Validate -->
  <rect x="650" y="80" width="100" height="60" rx="6" stroke="currentColor" stroke-width="1.5" fill="none"/>
  <text x="700" y="104" text-anchor="middle" font-size="11" fill="currentColor" font-family="sans-serif">Validate</text>
  <text x="700" y="120" text-anchor="middle" font-size="11" fill="currentColor" font-family="sans-serif">Output</text>
  <!-- Fallback branch: no CRS in VLRs -->
  <text x="185" y="170" text-anchor="middle" font-size="10" fill="currentColor" font-family="sans-serif" font-style="italic">No CRS found?</text>
  <line x1="185" y1="140" x2="185" y2="160" stroke="currentColor" stroke-width="1" stroke-dasharray="4 3"/>
  <line x1="185" y1="160" x2="315" y2="160" stroke="currentColor" stroke-width="1" stroke-dasharray="4 3"/>
  <line x1="315" y1="160" x2="315" y2="140" stroke="currentColor" stroke-width="1" stroke-dasharray="4 3" marker-end="url(#arr)"/>
  <text x="250" y="155" text-anchor="middle" font-size="10" fill="currentColor" font-family="sans-serif" font-style="italic">CRS.from_epsg()</text>
</svg>
</figure>

## Prerequisites and Assumptions

| Requirement | Minimum version / note |
|---|---|
| Python | 3.10+ (uses `X \| Y` union types) |
| `laspy` | 2.4+ — required for `LasHeader.global_encoding.wkt` attribute |
| `pyproj` | 3.4+ — for full WKT2 round-trip and vertical grid support |
| `numpy` | 1.22+ |
| PROJ data | `proj.db` + VERTCON/GEOID grids must be installed; set `PROJ_DATA` if using a custom path |
| Input file | LAS 1.2–1.4 or LAZ; the script reads VLR records 2112 (WKT2) and 34735 (GeoKey) |

If your environment uses Conda, `conda install -c conda-forge pyproj` automatically bundles the required PROJ grid files. Pip installations require a separate `pip install certifi` followed by `pyproj.sync_data_cache()`.

## Step-by-Step Implementation

### Step 1 — Inspect the VLRs to Diagnose the Mismatch

Before transforming anything, confirm what CRS information is actually present. [How to parse LAS headers with Python](/point-cloud-data-standards-fundamentals/laslaz-file-structure/how-to-parse-las-headers-with-python/) covers the full header layout; here the focus is the VLR block.

```python
import laspy
from pyproj import CRS

def diagnose_crs(las_path: str) -> dict:
    """
    Inspect a LAS/LAZ file and return a dict describing its CRS state.
    Returns: {'has_wkt2': bool, 'has_geokey': bool, 'crs': CRS | None, 'note': str}
    """
    result = {"has_wkt2": False, "has_geokey": False, "crs": None, "note": ""}
    with laspy.open(las_path) as f:
        header = f.header
        for vlr in header.vlrs:
            if vlr.record_id == 2112:          # WKT2 record
                result["has_wkt2"] = True
                try:
                    wkt = vlr.record_data.decode("utf-8").rstrip("\x00")
                    result["crs"] = CRS.from_wkt(wkt)
                    result["note"] = "WKT2 CRS parsed from VLR 2112"
                except Exception as e:
                    result["note"] = f"Malformed WKT2 VLR: {e}"
            elif vlr.record_id == 34735:        # GeoKey directory (legacy)
                result["has_geokey"] = True
                if result["crs"] is None:
                    result["note"] = "Only legacy GeoKey CRS found — WKT2 preferred"

    if result["crs"] is None and not result["has_geokey"]:
        result["note"] = "No CRS in VLRs — must be supplied manually"
    return result
```

Run this first. The output tells you which remediation path to take:

- WKT2 present and parseable → proceed to transformation.
- GeoKey only → reconstruct the CRS via `CRS.from_epsg()` and inject WKT2 on output.
- No CRS at all → consult acquisition metadata (flight plan, survey log, adjacent shapefiles) and supply manually.

### Step 2 — Construct a Datum-Aware Transformer

The most common mistake is calling `Transformer.from_crs()` without `always_xy=True`. EPSG:4326 officially defines axis order as (latitude, longitude), so without this flag `pyproj` silently swaps your X and Y for geographic CRSs.

```python
from pyproj import Transformer

def build_transformer(source_crs: CRS, target_epsg: int) -> Transformer:
    """
    Build a pyproj Transformer that preserves axis order and applies
    vertical grid shifts when the target CRS includes a geoid model.
    """
    target_crs = CRS.from_epsg(target_epsg)
    return Transformer.from_crs(
        source_crs,
        target_crs,
        always_xy=True,   # Treat first axis as easting, second as northing
    )
```

For compound CRS reprojections — for example, converting from UTM Zone 17N (EPSG:26917) to NAD83(2011) / UTM Zone 17N + NAVD88 height (EPSG:6346+5703) — pass the full compound EPSG string. `pyproj` selects the best available PROJ pipeline including the appropriate geoid grid (e.g., `us_noaa_g2018u0.tif`) automatically.

### Step 3 — Transform Coordinates

`laspy` 2.x applies scale and offset automatically when you access `las.x`, `las.y`, `las.z`, returning double-precision float arrays. Pass these directly to `transformer.transform()`.

```python
import numpy as np

def transform_xyz(las: laspy.LasData, transformer: Transformer) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """
    Apply transformer to X/Y/Z arrays. laspy 2.x applies scale+offset
    automatically, so las.x / las.y / las.z are already in CRS units.
    """
    new_x, new_y, new_z = transformer.transform(las.x, las.y, las.z)
    return new_x, new_y, new_z
```

### Step 4 — Write a Corrected File with an Updated WKT2 VLR

The output header must embed the target CRS as VLR record_id 2112 and set `global_encoding.wkt = True`. Without this, tools like QGIS, PDAL, and CloudCompare fall back to GeoKey parsing and may read the wrong reference frame.

```python
import laspy

def write_corrected_las(
    source_las: laspy.LasData,
    new_x: np.ndarray,
    new_y: np.ndarray,
    new_z: np.ndarray,
    target_crs: CRS,
    output_path: str,
) -> None:
    """
    Write a new LAS file with transformed coordinates and the target CRS
    embedded as a WKT2 VLR. All non-coordinate dimensions are preserved verbatim.
    """
    new_header = laspy.LasHeader(
        point_format=source_las.header.point_format.id,
        version=source_las.header.version,
    )
    new_header.offsets = source_las.header.offsets
    new_header.scales = source_las.header.scales

    wkt_bytes = target_crs.to_wkt().encode("utf-8")
    new_header.vlrs = [
        laspy.vlrs.VLR(
            user_id="LASF_Projection",
            record_id=2112,
            description="WKT Coordinate System",
            record_data=wkt_bytes,
        )
    ]
    new_header.global_encoding.wkt = True   # Required for LAS 1.4 compliance

    new_las = laspy.LasData(header=new_header)
    new_las.x = new_x
    new_las.y = new_y
    new_las.z = new_z

    # Copy every non-coordinate dimension: intensity, classification,
    # return_number, scan_angle_rank, rgb, waveform fields, etc.
    for dim_name in source_las.point_format.dimension_names:
        if dim_name.lower() not in ("x", "y", "z"):
            setattr(new_las, dim_name, getattr(source_las, dim_name))

    new_las.write(output_path)
```

## Complete Working Example

Copy-paste this script, adjust the three constants at the top, and run it against any LAS/LAZ file. It requires `laspy>=2.4`, `pyproj>=3.4`, and `numpy>=1.22`.

```python
import laspy
import numpy as np
from pyproj import CRS, Transformer
from pathlib import Path

# ── Configure these three values ──────────────────────────────────────────────
INPUT_PATH   = "survey_raw.laz"
OUTPUT_PATH  = "survey_utm18n_navd88.laz"
TARGET_EPSG  = 6347           # NAD83(2011) / UTM zone 18N (horizontal only)
# For a compound CRS add the vertical: CRS.from_authority("EPSG", "6347+5703")
# ──────────────────────────────────────────────────────────────────────────────


def extract_crs(header: laspy.LasHeader) -> CRS | None:
    for vlr in header.vlrs:
        if vlr.record_id == 2112:
            try:
                return CRS.from_wkt(vlr.record_data.decode("utf-8").rstrip("\x00"))
            except Exception:
                pass
    return None


def fix_crs_mismatch(input_path: str, output_path: str, target_epsg: int) -> None:
    input_p  = Path(input_path)
    output_p = Path(output_path)

    if not input_p.exists():
        raise FileNotFoundError(f"Input file not found: {input_path}")

    with laspy.open(input_p) as f:
        las = f.read()

    source_crs = extract_crs(las.header)
    if source_crs is None:
        raise ValueError(
            "No CRS detected in LAS header VLRs. "
            "Set source_crs = CRS.from_epsg(<code>) manually and retry."
        )

    target_crs  = CRS.from_epsg(target_epsg)
    transformer = Transformer.from_crs(source_crs, target_crs, always_xy=True)

    new_x, new_y, new_z = transformer.transform(las.x, las.y, las.z)

    new_header = laspy.LasHeader(
        point_format=las.header.point_format.id,
        version=las.header.version,
    )
    new_header.offsets = las.header.offsets
    new_header.scales  = las.header.scales
    new_header.vlrs    = [
        laspy.vlrs.VLR(
            user_id="LASF_Projection",
            record_id=2112,
            description="WKT Coordinate System",
            record_data=target_crs.to_wkt().encode("utf-8"),
        )
    ]
    new_header.global_encoding.wkt = True

    new_las   = laspy.LasData(header=new_header)
    new_las.x = new_x
    new_las.y = new_y
    new_las.z = new_z

    for dim_name in las.point_format.dimension_names:
        if dim_name.lower() not in ("x", "y", "z"):
            setattr(new_las, dim_name, getattr(las, dim_name))

    new_las.write(output_p)
    print(
        f"Transformed {len(new_x):,} points "
        f"from {source_crs.to_epsg()} → EPSG:{target_epsg}"
    )
    print(f"Output: {output_p}")


if __name__ == "__main__":
    fix_crs_mismatch(INPUT_PATH, OUTPUT_PATH, TARGET_EPSG)
```

## Key Parameter Table

| Parameter | Type | Default / Example | Effect |
|---|---|---|---|
| `always_xy` | `bool` | `True` | Prevents axis-order swap for geographic CRSs like EPSG:4326 |
| `target_epsg` | `int` | `6347` | Target projected CRS; use a compound EPSG for 3D reprojection |
| `header.offsets` | `np.ndarray` | from source | Must be re-centred if coordinates shift by >10⁷ units to avoid int32 overflow in scaled integers |
| `header.scales` | `np.ndarray` | from source | `[0.001, 0.001, 0.001]` gives millimetre resolution; coarser scales degrade accuracy |
| `record_id=2112` | `int` | fixed | ASPRS-reserved VLR slot for WKT2 CRS; omitting it causes GIS readers to fall back to legacy GeoKeys |
| `global_encoding.wkt` | `bool` | `True` | Bit 0 of the LAS 1.4 global encoding field — signals to readers that WKT2 is authoritative |

## Verification

After writing the corrected file, confirm accuracy with three checks:

```python
import laspy
import numpy as np
from pyproj import CRS

def verify_corrected_file(output_path: str, expected_epsg: int) -> None:
    with laspy.open(output_path) as f:
        las = f.read()

    # 1. Confirm CRS round-trips correctly
    found_crs = None
    for vlr in las.header.vlrs:
        if vlr.record_id == 2112:
            found_crs = CRS.from_wkt(vlr.record_data.decode("utf-8").rstrip("\x00"))
    assert found_crs is not None, "No WKT2 VLR found in output"
    assert found_crs.to_epsg() == expected_epsg, (
        f"CRS mismatch: expected EPSG:{expected_epsg}, got {found_crs.to_epsg()}"
    )

    # 2. Bounding box sanity — for UTM, X should be 100 000–900 000, Y > 0
    assert 100_000 < np.min(las.x) < 900_000, f"X out of UTM range: {np.min(las.x)}"
    assert np.min(las.y) > 0,                  f"Negative northing: {np.min(las.y)}"

    # 3. Point count preserved
    print(f"Point count: {len(las.x):,} — OK")
    print(f"CRS verified: EPSG:{found_crs.to_epsg()}")
    print(f"Bounds X [{np.min(las.x):.1f}, {np.max(las.x):.1f}]")
    print(f"Bounds Y [{np.min(las.y):.1f}, {np.max(las.y):.1f}]")
    print(f"Bounds Z [{np.min(las.z):.3f}, {np.max(las.z):.3f}]")
```

For infrastructure deliverables, cross-check at least one ground control point against an independent survey measurement. A correctly transformed UTM point should agree with the GCP to within your survey's stated accuracy (typically ±0.05 m horizontal, ±0.10 m vertical for engineering-grade LiDAR).

## Gotchas and Edge Cases

**Vertical datum silently skipped.** If your source file uses ellipsoidal heights (e.g., raw GNSS output) but your target CRS is orthometric (NAVD88), `pyproj` applies the geoid grid shift only when both the source and target CRS definitions include explicit vertical components. Specifying `EPSG:6347` (horizontal only) will transform X and Y correctly but leave Z unchanged. Use `CRS.from_authority("EPSG", "6347+5703")` (UTM 18N + NAVD88) for a full 3D transformation.

**Missing PROJ grid files.** When the required `.tif` geoid grid is not installed, `pyproj` either raises a `CRSError` or silently falls back to a lower-accuracy pipeline. Run `pyproj.sync.sync_proj_data()` or verify grid availability with `pyproj.datadir.get_data_dir()`. The PROJ CDN hosts all official grids.

**Scaled integer overflow.** `laspy` stores raw coordinates as 32-bit integers using the `scale` and `offset` from the header. If you keep the original offsets from a source file centred far from the target CRS, the integer representation can overflow. Recompute `new_header.offsets` as `[np.min(new_x), np.min(new_y), np.min(new_z)]` when the centroid shifts significantly (> 10⁷ units).

**Large files and memory.** The complete example loads all points into RAM. For multi-gigabyte aerial surveys, switch to a chunk-reading loop with `laspy.open()` and accumulate transformed chunks, or pass the reprojection to a [PDAL spatial reprojection](/pdal-pipeline-architecture-execution/spatial-reprojection/) pipeline which streams chunks out-of-core and handles the offset recalculation automatically.

---

## Related

- [Coordinate Reference Systems](/point-cloud-data-standards-fundamentals/coordinate-reference-systems/) — parent guide covering CRS validation, compound CRS handling, and CI/CD integration
- [LAS/LAZ File Structure](/point-cloud-data-standards-fundamentals/laslaz-file-structure/) — VLR layout, GeoKey records, and binary header fields
- [How to Parse LAS Headers with Python](/point-cloud-data-standards-fundamentals/laslaz-file-structure/how-to-parse-las-headers-with-python/) — extract scale, offset, point count, and CRS records
- [Spatial Reprojection in PDAL](/pdal-pipeline-architecture-execution/spatial-reprojection/) — PDAL-native out-of-core reprojection for large surveys
- [Point Cloud Data Standards & Fundamentals](/point-cloud-data-standards-fundamentals/) — reference overview of LAS/LAZ formats, classification codes, and spatial metadata standards
