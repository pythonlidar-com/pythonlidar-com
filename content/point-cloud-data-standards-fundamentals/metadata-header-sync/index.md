---
title: "Metadata & Header Sync in Python LiDAR Workflows"
description: "How to validate, correct, and reconcile LAS/LAZ header fields, VLRs, and EVLRs with actual point data using Python and laspy — a repeatable synchronization workflow for LiDAR analysts and GIS engineers."
slug: "point-cloud-data-standards-fundamentals/metadata-header-sync"
type: "topic"
breadcrumb: "Metadata & Header Sync"
datePublished: "2024-01-15"
dateModified: "2026-06-24"
---

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Article",
      "headline": "Metadata & Header Sync in Python LiDAR Workflows",
      "description": "How to validate, correct, and reconcile LAS/LAZ header fields, VLRs, and EVLRs with actual point data using Python and laspy — a repeatable synchronization workflow for LiDAR analysts and GIS engineers.",
      "datePublished": "2024-01-15",
      "dateModified": "2026-06-24",
      "author": {"@type": "Organization", "name": "pythonlidar.com"},
      "publisher": {"@type": "Organization", "name": "pythonlidar.com"}
    },
    {
      "@type": "BreadcrumbList",
      "itemListElement": [
        {"@type": "ListItem", "position": 1, "name": "Home", "item": "https://www.pythonlidar.com/"},
        {"@type": "ListItem", "position": 2, "name": "Point Cloud Data Standards & Fundamentals", "item": "https://www.pythonlidar.com/point-cloud-data-standards-fundamentals/"},
        {"@type": "ListItem", "position": 3, "name": "Metadata & Header Sync", "item": "https://www.pythonlidar.com/point-cloud-data-standards-fundamentals/metadata-header-sync/"}
      ]
    },
    {
      "@type": "HowTo",
      "name": "Synchronize LAS/LAZ Header Metadata with Point Data",
      "description": "Validate, correct, and reconcile LAS/LAZ header fields and VLRs against the actual point payload using laspy and pyproj.",
      "step": [
        {"@type": "HowToStep", "position": 1, "name": "Ingest and parse header state", "text": "Open the file in read-only mode, extract all header fields and VLR payloads without loading point data."},
        {"@type": "HowToStep", "position": 2, "name": "Validate against ground truth", "text": "Compare header values to project specifications; recompute actual bounding box and point count from the point array."},
        {"@type": "HowToStep", "position": 3, "name": "Apply corrections and reconcile VLRs", "text": "Rewrite scale, offset, bounds, and CRS VLRs; strip redundant legacy records; preserve extra-bytes definitions."},
        {"@type": "HowToStep", "position": 4, "name": "Write atomically and verify", "text": "Write to a temporary path, rename on success, then reopen and assert point count and bounding-box values."}
      ]
    },
    {
      "@type": "FAQPage",
      "mainEntity": [
        {
          "@type": "Question",
          "name": "Why does my LAS file have a wrong point count in the header?",
          "acceptedAnswer": {"@type": "Answer", "text": "The most common cause is a crash or forced termination during writing. The LAS header is written first; if the process dies before the final byte count is flushed, the stored point_count stays at zero or its initial value. Re-run update_header() via laspy on the written file to recompute the correct count from the actual data length."}
        },
        {
          "@type": "Question",
          "name": "Can I change scale/offset after the point data is already written?",
          "acceptedAnswer": {"@type": "Answer", "text": "Not safely in place. Scale and offset define how raw integer XYZ values convert to real-world coordinates. Changing them without rewriting the integer arrays corrupts the geometry. The correct approach is to read all points as scaled floats, create a new LasHeader with the desired scale/offset, assign the float coordinates to the new file (laspy will re-encode them), then write the new file."}
        },
        {
          "@type": "Question",
          "name": "What is the difference between a VLR and an EVLR?",
          "acceptedAnswer": {"@type": "Answer", "text": "Variable-Length Records (VLRs) appear before the point block and are capped at 65,535 bytes of payload — enough for GeoTIFF key tags but too small for complex WKT2 strings. Extended VLRs (EVLRs), introduced in LAS 1.4, live after the point block and support payloads up to 2^64 bytes, making them the correct location for OGC WKT2 CRS definitions. Always write CRS as WKT2 in an EVLR (record_id 2112) for LAS 1.4 files."}
        },
        {
          "@type": "Question",
          "name": "How do I handle files that have both GeoTIFF VLRs and WKT2 VLRs?",
          "acceptedAnswer": {"@type": "Answer", "text": "Modern GIS software (PDAL, QGIS, ArcGIS Pro) prioritizes WKT2 (record_id 2112) over legacy GeoKey VLRs (user_id LASF_Projection, record_id 34736/34737). During sync, strip the legacy GeoKey records and retain only the WKT2 record to avoid ambiguous CRS interpretation. Log which records were removed for audit purposes."}
        }
      ]
    }
  ]
}
</script>

Point cloud integrity begins at the file header. When processing LiDAR data at scale, mismatched metadata between the binary payload and the header record is one of the most frequent causes of downstream GIS failures, misaligned spatial joins, and corrupted classification pipelines. Metadata and header synchronization is the systematic validation, transformation, and reconciliation of LAS/LAZ header fields, variable-length records (VLRs), and extended VLRs (EVLRs) against the actual point data and project specifications. This workflow sits within the broader context of [Point Cloud Data Standards & Fundamentals](https://www.pythonlidar.com/point-cloud-data-standards-fundamentals/), where strict adherence to ASPRS specifications prevents costly reprocessing and ensures interoperability across commercial and open-source toolchains.

---

<svg viewBox="-12 38 764 162" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Four-phase LAS header synchronization pipeline: ingest, validate, correct and sync, write and verify" style="width:100%;max-width:780px;display:block;margin:1.5rem auto;">
  <title>LAS Metadata and Header Sync Workflow</title>
  <desc>Four sequential stages for synchronizing LAS/LAZ file headers with point data: (1) Ingest + Parse header fields and VLRs, (2) Validate bounds, scale, and CRS against ground truth, (3) Correct + Sync offsets and inject updated VLRs, (4) Write atomically and verify point count and bounding box.</desc>
  <rect x="-12" y="38" width="764" height="162" fill="var(--dg-bg)" rx="10"/>
  <defs>
    <marker id="mhsarr" markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto">
      <polygon points="0 0, 8 3, 0 6" fill="currentColor" opacity="0.55"/>
    </marker>
  </defs>
  <!-- Stage 1 -->
  <rect x="10" y="60" width="162" height="72" rx="7" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.7"/>
  <text x="91" y="84" text-anchor="middle" font-size="12" font-weight="600" fill="currentColor" font-family="monospace">1. Ingest + Parse</text>
  <text x="91" y="101" text-anchor="middle" font-size="10" fill="currentColor" opacity="0.7">header fields</text>
  <text x="91" y="116" text-anchor="middle" font-size="10" fill="currentColor" opacity="0.7">VLRs / EVLRs</text>
  <!-- Arrow 1→2 -->
  <line x1="172" y1="96" x2="194" y2="96" stroke="currentColor" stroke-width="1.5" marker-end="url(#mhsarr)" opacity="0.55"/>
  <!-- Stage 2 -->
  <rect x="196" y="60" width="162" height="72" rx="7" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.7"/>
  <text x="277" y="84" text-anchor="middle" font-size="12" font-weight="600" fill="currentColor" font-family="monospace">2. Validate</text>
  <text x="277" y="101" text-anchor="middle" font-size="10" fill="currentColor" opacity="0.7">bounds / scale / CRS</text>
  <text x="277" y="116" text-anchor="middle" font-size="10" fill="currentColor" opacity="0.7">vs ground truth</text>
  <!-- Arrow 2→3 -->
  <line x1="358" y1="96" x2="380" y2="96" stroke="currentColor" stroke-width="1.5" marker-end="url(#mhsarr)" opacity="0.55"/>
  <!-- Stage 3 -->
  <rect x="382" y="60" width="162" height="72" rx="7" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.7"/>
  <text x="463" y="84" text-anchor="middle" font-size="12" font-weight="600" fill="currentColor" font-family="monospace">3. Correct + Sync</text>
  <text x="463" y="101" text-anchor="middle" font-size="10" fill="currentColor" opacity="0.7">offsets / VLR inject</text>
  <text x="463" y="116" text-anchor="middle" font-size="10" fill="currentColor" opacity="0.7">strip legacy records</text>
  <!-- Arrow 3→4 -->
  <line x1="544" y1="96" x2="566" y2="96" stroke="currentColor" stroke-width="1.5" marker-end="url(#mhsarr)" opacity="0.55"/>
  <!-- Stage 4 -->
  <rect x="568" y="60" width="162" height="72" rx="7" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.7"/>
  <text x="649" y="84" text-anchor="middle" font-size="12" font-weight="600" fill="currentColor" font-family="monospace">4. Write + Verify</text>
  <text x="649" y="101" text-anchor="middle" font-size="10" fill="currentColor" opacity="0.7">atomic rename</text>
  <text x="649" y="116" text-anchor="middle" font-size="10" fill="currentColor" opacity="0.7">assert counts + CRS</text>
  <!-- Warning note at bottom -->
  <text x="390" y="175" text-anchor="middle" font-size="10" fill="currentColor" opacity="0.45">never modify scale/offset after point data is written — set them before encoding integers</text>
</svg>

## Prerequisites

Before implementing a synchronization routine, ensure your environment meets these requirements:

- **Python 3.10+** with `pip` or `conda`
- `laspy>=2.4.0` — modern API with native VLR/EVLR handling and LAZ support via `lazrs` or `laszip`
- `pyproj>=3.3` — robust coordinate reference system validation and WKT2 round-trip checks
- `numpy` — vectorized point array operations and running bounding-box accumulators
- A reference LAS/LAZ file containing known-good metadata for comparison
- Read/write permissions on both the source and output directories

```bash
pip install "laspy[lazrs]" pyproj numpy
```

Familiarity with the underlying [LAS/LAZ file structure](https://www.pythonlidar.com/point-cloud-data-standards-fundamentals/laslaz-file-structure/) is highly recommended, particularly the distinction between legacy VLRs (GeoTIFF key tags) and EVLRs (OGC WKT2). Modern pipelines must prioritize WKT2 records (`record_id` 2112) for CRS storage — they support unambiguous spatial definitions and bypass the 65 KB legacy VLR payload limit. For background on CRS definitions and datum handling, see [Coordinate Reference Systems](https://www.pythonlidar.com/point-cloud-data-standards-fundamentals/coordinate-reference-systems/).

## Core Workflow Architecture

A production-ready synchronization routine follows a deterministic four-phase sequence. Deviating from this order — particularly modifying scale or offset parameters after point integer values have been written — produces silent coordinate corruption that survives all downstream file-open checks.

**Phase 1 — Ingest and parse** without loading point data into memory. Read only header fields and VLR payloads so the operation remains fast even for multi-gigabyte LAZ files.

**Phase 2 — Validate** header values against project ground truth: expected EPSG code, delivery bounding box, nominal point count from a flight-plan manifest, and point record format. Flag every discrepancy before touching any data.

**Phase 3 — Correct and sync** by constructing a new `LasHeader`, propagating corrections, injecting updated VLRs, and stripping conflicting legacy records.

**Phase 4 — Write atomically and verify** by writing to a `.tmp` suffix, then renaming. On success, reopen the output and assert that header values exactly match the computed ground truth.

## Full Implementation

The following module encapsulates all four phases in typed, logged functions. It can be imported into a batch pipeline or run directly on a single file.

```python
"""
las_header_sync.py
Validate, correct, and verify LAS/LAZ header metadata using laspy + pyproj.
"""
from __future__ import annotations

import logging
import os
import tempfile
from pathlib import Path
from typing import NamedTuple

import laspy
import numpy as np
import pyproj

logger = logging.getLogger(__name__)


class HeaderSnapshot(NamedTuple):
    version: str
    point_format: int
    point_count: int
    x_scale: float
    y_scale: float
    z_scale: float
    x_min: float; x_max: float
    y_min: float; y_max: float
    z_min: float; z_max: float
    vlr_count: int
    crs_wkt: str | None


# ── Phase 1: Ingest ──────────────────────────────────────────────────────────

def parse_header(filepath: str | Path) -> HeaderSnapshot:
    """Extract header state without loading point data."""
    with laspy.open(str(filepath), mode="r") as reader:
        h = reader.header
        wkt = None
        for vlr in h.vlrs:
            # OGC WKT2 lives in user_id LASF_Projection, record_id 2112
            if vlr.user_id == "LASF_Projection" and vlr.record_id == 2112:
                wkt = vlr.parsed_record  # may be bytes or str depending on laspy version
                if isinstance(wkt, (bytes, bytearray)):
                    wkt = wkt.decode("utf-8", errors="replace")
                break
        return HeaderSnapshot(
            version=f"{h.version.major}.{h.version.minor}",
            point_format=h.point_format.id,
            point_count=h.point_count,
            x_scale=float(h.x_scale),
            y_scale=float(h.y_scale),
            z_scale=float(h.z_scale),
            x_min=float(h.x_min), x_max=float(h.x_max),
            y_min=float(h.y_min), y_max=float(h.y_max),
            z_min=float(h.z_min), z_max=float(h.z_max),
            vlr_count=len(h.vlrs),
            crs_wkt=wkt,
        )


# ── Phase 2: Validate ─────────────────────────────────────────────────────────

def compute_actual_bounds(filepath: str | Path) -> tuple[int, np.ndarray, np.ndarray]:
    """
    Stream all points to compute true count and bounding box.
    Uses chunk iteration to avoid loading the full array into RAM.
    """
    actual_count = 0
    mins = np.array([np.inf, np.inf, np.inf], dtype=np.float64)
    maxs = np.array([-np.inf, -np.inf, -np.inf], dtype=np.float64)

    with laspy.open(str(filepath), mode="r") as reader:
        for chunk in reader.chunk_iterator(chunk_size=500_000):
            xs = chunk.x.astype(np.float64)
            ys = chunk.y.astype(np.float64)
            zs = chunk.z.astype(np.float64)
            mins[0] = min(mins[0], float(xs.min()))
            mins[1] = min(mins[1], float(ys.min()))
            mins[2] = min(mins[2], float(zs.min()))
            maxs[0] = max(maxs[0], float(xs.max()))
            maxs[1] = max(maxs[1], float(ys.max()))
            maxs[2] = max(maxs[2], float(zs.max()))
            actual_count += len(chunk)

    logger.info("Actual point count: %d  bounds X[%.3f, %.3f]", actual_count, mins[0], maxs[0])
    return actual_count, mins, maxs


def validate_crs(wkt: str | None, expected_epsg: int) -> list[str]:
    """Return a list of CRS discrepancy messages (empty = clean)."""
    issues: list[str] = []
    if wkt is None:
        issues.append("No WKT2 CRS VLR found (record_id 2112 missing)")
        return issues
    try:
        crs = pyproj.CRS.from_wkt(wkt)
        auth, code = crs.to_authority()
        if auth != "EPSG" or int(code) != expected_epsg:
            issues.append(
                f"CRS mismatch: header says {auth}:{code}, expected EPSG:{expected_epsg}"
            )
    except Exception as exc:
        issues.append(f"Cannot parse WKT2 CRS: {exc}")
    return issues


# ── Phase 3: Correct + Sync ───────────────────────────────────────────────────

def sync_header(
    filepath: str | Path,
    output_path: str | Path,
    *,
    target_epsg: int,
    new_scale: float = 0.001,
    strip_legacy_geokeys: bool = True,
) -> None:
    """
    Rewrite filepath to output_path with corrected header and CRS VLRs.

    Parameters
    ----------
    filepath : source LAS/LAZ file (read-only)
    output_path : destination path (written atomically via tmp file + rename)
    target_epsg : EPSG code to embed as WKT2 in the EVLR/VLR
    new_scale : XYZ scale factor in metres (0.001 = 1 mm resolution)
    strip_legacy_geokeys : remove obsolete GeoTIFF key VLRs if a WKT2 record exists
    """
    filepath = Path(filepath)
    output_path = Path(output_path)

    with laspy.open(str(filepath), mode="r") as reader:
        las = reader.read()

    x, y, z = las.x, las.y, las.z

    # Build new header with corrected scale
    new_header = laspy.LasHeader(
        point_format=las.header.point_format.id,
        version=las.header.version,
    )
    new_header.x_scale = new_scale
    new_header.y_scale = new_scale
    new_header.z_scale = new_scale
    # Preserve existing offsets (re-encoding from float handles precision)
    new_header.x_offset = las.header.x_offset
    new_header.y_offset = las.header.y_offset
    new_header.z_offset = las.header.z_offset

    # Build authoritative WKT2 VLR from target EPSG
    crs = pyproj.CRS.from_epsg(target_epsg)
    wkt2_bytes = crs.to_wkt(version="WKT2_2019").encode("utf-8")
    wkt2_vlr = laspy.VLR(
        user_id="LASF_Projection",
        record_id=2112,
        description="OGC Transformation Record",
        record_data=wkt2_bytes,
    )

    # Filter existing VLRs: keep extra-bytes definitions; optionally strip legacy GeoKeys
    legacy_ids = {34736, 34737, 34735}  # GeoDoubleParamsTag, GeoAsciiParamsTag, GeoKeyDirectoryTag
    retained_vlrs = []
    for vlr in las.header.vlrs:
        is_legacy_geokey = (
            vlr.user_id == "LASF_Projection" and vlr.record_id in legacy_ids
        )
        is_old_wkt = (
            vlr.user_id == "LASF_Projection" and vlr.record_id == 2112
        )
        if is_old_wkt:
            continue  # will be replaced by the fresh one below
        if is_legacy_geokey and strip_legacy_geokeys:
            logger.info("Stripping legacy GeoKey VLR record_id=%d", vlr.record_id)
            continue
        retained_vlrs.append(vlr)

    retained_vlrs.append(wkt2_vlr)
    new_header.vlrs = retained_vlrs

    # Construct output LasData and copy all dimensions
    new_las = laspy.LasData(header=new_header)
    new_las.x = x
    new_las.y = y
    new_las.z = z
    for dim_name in las.point_format.dimension_names:
        if dim_name.lower() not in ("x", "y", "z"):
            try:
                setattr(new_las, dim_name, getattr(las, dim_name))
            except Exception as exc:
                logger.warning("Could not copy dimension %s: %s", dim_name, exc)

    new_las.update_header()  # recalculates min/max bounds and point count

    # Atomic write: temp file in same directory → rename
    tmp_fd, tmp_path = tempfile.mkstemp(
        dir=output_path.parent, suffix=".las.tmp"
    )
    os.close(tmp_fd)
    try:
        new_las.write(tmp_path)
        os.replace(tmp_path, output_path)
        logger.info("Wrote synchronized file: %s", output_path)
    except Exception:
        Path(tmp_path).unlink(missing_ok=True)
        raise


# ── Phase 4: Verify ───────────────────────────────────────────────────────────

def verify_sync(
    filepath: str | Path,
    *,
    expected_count: int,
    expected_mins: np.ndarray,
    expected_maxs: np.ndarray,
    expected_epsg: int,
    tol: float = 1e-3,
) -> None:
    """Assert that the written file's header matches computed ground truth."""
    with laspy.open(str(filepath), mode="r") as reader:
        h = reader.header

    assert h.point_count == expected_count, (
        f"Point count mismatch: header={h.point_count} expected={expected_count}"
    )
    header_mins = np.array([h.x_min, h.y_min, h.z_min])
    header_maxs = np.array([h.x_max, h.y_max, h.z_max])
    assert np.allclose(header_mins, expected_mins, atol=tol), (
        f"Bounding box min drift: header={header_mins} expected={expected_mins}"
    )
    assert np.allclose(header_maxs, expected_maxs, atol=tol), (
        f"Bounding box max drift: header={header_maxs} expected={expected_maxs}"
    )

    snap = parse_header(filepath)
    crs_issues = validate_crs(snap.crs_wkt, expected_epsg)
    if crs_issues:
        raise AssertionError(f"CRS verification failed: {crs_issues}")

    logger.info("Verification passed: %s is fully synchronized.", filepath)
```

### Putting it together: a batch entry point

```python
import logging
from las_header_sync import (
    parse_header, compute_actual_bounds, validate_crs,
    sync_header, verify_sync,
)

logging.basicConfig(level=logging.INFO)

SOURCE = "survey_tile_32N.laz"
OUTPUT = "survey_tile_32N_synced.laz"
EPSG   = 32632   # UTM zone 32N

# Phase 1: inspect current state
snap = parse_header(SOURCE)
print(f"Version {snap.version} | format {snap.point_format} | {snap.point_count:,} points")

# Phase 2: compute real count + bounds; validate CRS
actual_count, mins, maxs = compute_actual_bounds(SOURCE)
issues = validate_crs(snap.crs_wkt, EPSG)
if issues:
    print("Header discrepancies:", issues)

# Phase 3: correct and sync
sync_header(SOURCE, OUTPUT, target_epsg=EPSG, new_scale=0.001)

# Phase 4: verify
verify_sync(OUTPUT, expected_count=actual_count,
            expected_mins=mins, expected_maxs=maxs, expected_epsg=EPSG)
```

<svg viewBox="0 0 720 298" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Header fields that go stale during a pipeline and who is responsible for each" style="width:100%;max-width:720px;display:block;margin:1.6rem auto">
  <title>Which header fields go stale, and who fixes them</title>
  <desc>Seven header fields, what invalidates each, and who updates it. Point counts, the bounding box and the return histogram are recomputed by the writer without being asked. The CRS record follows the last stage. Scale and offset are the exception: nothing recomputes them, so a reprojection into a different unit leaves a header that quietly quantises every coordinate.</desc>
  <rect x="0" y="0" width="720" height="298" fill="var(--dg-bg)" rx="10"/>
  <rect x="20" y="50" width="180" height="28" rx="5" fill="var(--dg-surface)" stroke="var(--dg-line-soft)" stroke-width="1"/>
  <text x="32" y="69" font-size="11" fill="var(--dg-text)">point count</text>
  <rect x="212" y="50" width="250" height="28" rx="5" fill="var(--dg-c-soft)" stroke="var(--dg-c)" stroke-width="1.1"/>
  <text x="337" y="69" text-anchor="middle" font-size="10.5" fill="var(--dg-text)">any filter that drops points</text>
  <rect x="474" y="50" width="212" height="28" rx="5" fill="var(--dg-d-soft)" stroke="var(--dg-d)" stroke-width="1.1"/>
  <text x="580" y="69" text-anchor="middle" font-size="10.5" fill="var(--dg-text)">writer, automatically</text>
  <rect x="20" y="84" width="180" height="28" rx="5" fill="var(--dg-surface)" stroke="var(--dg-line-soft)" stroke-width="1"/>
  <text x="32" y="103" font-size="11" fill="var(--dg-text)">bounding box</text>
  <rect x="212" y="84" width="250" height="28" rx="5" fill="var(--dg-c-soft)" stroke="var(--dg-c)" stroke-width="1.1"/>
  <text x="337" y="103" text-anchor="middle" font-size="10.5" fill="var(--dg-text)">crop, reprojection, outlier</text>
  <rect x="474" y="84" width="212" height="28" rx="5" fill="var(--dg-d-soft)" stroke="var(--dg-d)" stroke-width="1.1"/>
  <text x="580" y="103" text-anchor="middle" font-size="10.5" fill="var(--dg-text)">writer, automatically</text>
  <rect x="20" y="118" width="180" height="28" rx="5" fill="var(--dg-surface)" stroke="var(--dg-line-soft)" stroke-width="1"/>
  <text x="32" y="137" font-size="11" fill="var(--dg-text)">return count histogram</text>
  <rect x="212" y="118" width="250" height="28" rx="5" fill="var(--dg-c-soft)" stroke="var(--dg-c)" stroke-width="1.1"/>
  <text x="337" y="137" text-anchor="middle" font-size="10.5" fill="var(--dg-text)">any filter that drops points</text>
  <rect x="474" y="118" width="212" height="28" rx="5" fill="var(--dg-d-soft)" stroke="var(--dg-d)" stroke-width="1.1"/>
  <text x="580" y="137" text-anchor="middle" font-size="10.5" fill="var(--dg-text)">writer, automatically</text>
  <rect x="20" y="152" width="180" height="28" rx="5" fill="var(--dg-surface)" stroke="var(--dg-line-soft)" stroke-width="1"/>
  <text x="32" y="171" font-size="11" fill="var(--dg-text)">CRS record</text>
  <rect x="212" y="152" width="250" height="28" rx="5" fill="var(--dg-c-soft)" stroke="var(--dg-c)" stroke-width="1.1"/>
  <text x="337" y="171" text-anchor="middle" font-size="10.5" fill="var(--dg-text)">reprojection</text>
  <rect x="474" y="152" width="212" height="28" rx="5" fill="var(--dg-d-soft)" stroke="var(--dg-d)" stroke-width="1.1"/>
  <text x="580" y="171" text-anchor="middle" font-size="10.5" fill="var(--dg-text)">writer, from the last stage</text>
  <rect x="20" y="186" width="180" height="28" rx="5" fill="var(--dg-surface)" stroke="var(--dg-line-soft)" stroke-width="1"/>
  <text x="32" y="205" font-size="11" fill="var(--dg-text)">scale and offset</text>
  <rect x="212" y="186" width="250" height="28" rx="5" fill="var(--dg-c-soft)" stroke="var(--dg-c)" stroke-width="1.1"/>
  <text x="337" y="205" text-anchor="middle" font-size="10.5" fill="var(--dg-text)">reprojection to a new unit</text>
  <rect x="474" y="186" width="212" height="28" rx="5" fill="var(--dg-e-soft)" stroke="var(--dg-e)" stroke-width="1.1"/>
  <text x="580" y="205" text-anchor="middle" font-size="10.5" fill="var(--dg-text)">you, explicitly</text>
  <rect x="20" y="220" width="180" height="28" rx="5" fill="var(--dg-surface)" stroke="var(--dg-line-soft)" stroke-width="1"/>
  <text x="32" y="239" font-size="11" fill="var(--dg-text)">generating software</text>
  <rect x="212" y="220" width="250" height="28" rx="5" fill="var(--dg-c-soft)" stroke="var(--dg-c)" stroke-width="1.1"/>
  <text x="337" y="239" text-anchor="middle" font-size="10.5" fill="var(--dg-text)">every run</text>
  <rect x="474" y="220" width="212" height="28" rx="5" fill="var(--dg-d-soft)" stroke="var(--dg-d)" stroke-width="1.1"/>
  <text x="580" y="239" text-anchor="middle" font-size="10.5" fill="var(--dg-text)">writer, as PDAL</text>
  <rect x="20" y="254" width="180" height="28" rx="5" fill="var(--dg-surface)" stroke="var(--dg-line-soft)" stroke-width="1"/>
  <text x="32" y="273" font-size="11" fill="var(--dg-text)">file creation date</text>
  <rect x="212" y="254" width="250" height="28" rx="5" fill="var(--dg-c-soft)" stroke="var(--dg-c)" stroke-width="1.1"/>
  <text x="337" y="273" text-anchor="middle" font-size="10.5" fill="var(--dg-text)">every run</text>
  <rect x="474" y="254" width="212" height="28" rx="5" fill="var(--dg-d-soft)" stroke="var(--dg-d)" stroke-width="1.1"/>
  <text x="580" y="273" text-anchor="middle" font-size="10.5" fill="var(--dg-text)">writer, as today</text>
  <text x="20" y="36" font-size="10.5" fill="var(--dg-muted)">field · what invalidates it · who puts it right</text>
  <text x="20" y="292" font-size="10.5" fill="var(--dg-muted)">the single red row is where most header bugs live</text>
</svg>

## Code Breakdown

**`parse_header`** opens the file with `laspy.open()` in read-only mode and never reads the point block, so it completes in milliseconds regardless of file size. It explicitly hunts for `record_id` 2112 because `laspy` does not yet expose a dedicated WKT2 accessor across all versions.

**`compute_actual_bounds`** uses `chunk_iterator(chunk_size=500_000)` rather than a full `f.read()` to avoid `MemoryError` on multi-gigabyte LAZ files. Each chunk's `x`, `y`, `z` arrays are cast to `float64` before calling `min()`/`max()`, because the raw integer arrays exposed before scaling can silently truncate to `int32` depending on the point format.

**`sync_header`** constructs a fresh `LasHeader` rather than mutating the existing one. Mutation can preserve stale cached values that `update_header()` does not always overwrite. Generating the WKT2 string via `pyproj.CRS.from_epsg(target_epsg).to_wkt("WKT2_2019")` guarantees the latest OGC encoding — not a hand-crafted string that might omit the authority citation.

The legacy GeoKey strip (`record_id` 34735, 34736, 34737) is deliberate. Retaining both GeoTIFF key tags and a WKT2 VLR forces every consumer to implement tie-breaking logic; removing the legacy records means the CRS is unambiguous. Extra-bytes VLRs (`user_id "LASF_Spec"`, `record_id 4`) are always retained because they define custom dimension types needed to read the point block.

The atomic rename (`os.replace`) makes the write crash-safe: if the process is killed during the write, the original file is untouched and only the `.las.tmp` file is orphaned.

**`verify_sync`** uses `np.allclose` with `atol=1e-3` (1 mm) rather than strict equality because laspy re-encodes coordinates through the integer round-trip, introducing up to ±0.5× scale (0.5 mm at 1 mm resolution).

## Parameter Reference Table

| Parameter | Type | Default | Valid Range | Effect |
|-----------|------|---------|-------------|--------|
| `new_scale` | `float` | `0.001` | `0.0001–0.01` | XYZ resolution in metres; 0.001 = 1 mm, 0.01 = 1 cm. Smaller values require larger integer ranges — verify offsets keep integers within `int32` bounds. |
| `chunk_size` | `int` | `500_000` | `50_000–2_000_000` | Points loaded per iteration in `compute_actual_bounds`. Increase for faster processing on machines with > 16 GB RAM; decrease for memory-constrained batch nodes. |
| `strip_legacy_geokeys` | `bool` | `True` | `True/False` | Remove obsolete GeoTIFF key VLRs when a WKT2 record is present. Set to `False` only if a legacy consumer (ArcMap < 10.8, TerraScan < 019) must read the file. |
| `target_epsg` | `int` | required | any valid EPSG | EPSG code written as WKT2 into `LASF_Projection` VLR `record_id` 2112. Use 4326 for geographic WGS 84, 32601–32660 for UTM North, 32701–32760 for UTM South. |
| `tol` | `float` | `1e-3` | `1e-4–0.01` | Absolute tolerance in metres for bounding-box assertion in `verify_sync`. Should equal `new_scale` or be slightly larger. |

## Validation and Data Integrity Checks

After writing a synchronized file, a three-layer check closes the loop:

**Layer 1 — Count assertion.** The output `h.point_count` must equal the `actual_count` returned by `compute_actual_bounds`. A mismatch indicates truncation during write or a LAZ compression error.

**Layer 2 — Bounding box round-trip.** Compare header `x_min/x_max/y_min/y_max/z_min/z_max` against the streaming min/max from Phase 2. Discrepancies larger than `new_scale / 2` indicate that the integer encoding drifted — typically caused by an offset that leaves some coordinates negative with insufficient `int32` headroom.

**Layer 3 — CRS round-trip.** Parse the written WKT2 VLR back through `pyproj.CRS.from_wkt()` and assert `to_authority()` returns the expected EPSG. This catches encoding bugs where the WKT2 string is written but fails to parse on the read side.

For files that also carry [ASPRS classification codes](https://www.pythonlidar.com/point-cloud-data-standards-fundamentals/asprs-classification-codes/), add a fourth assertion: enumerate unique `classification` values in the output and verify they fall within the expected set (e.g., 1–6 for standard aerial LiDAR). Classification arrays that survive the sync unchanged confirm that the dimension-copy loop did not silently drop the `Classification` field.

<svg viewBox="0 0 720 262" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Header claims and actual tile contents diverging across four pipeline stages" style="width:100%;max-width:720px;display:block;margin:1.6rem auto">
  <title>Where the header stops describing the file</title>
  <desc>Four stages of one pipeline with what the header claims and what the tile actually holds at each point. They agree after the read. The crop removes points but an in-place header edit does not, so the count diverges. The reprojection moves the coordinates while the bounding box stays where it was. Only a full rewrite through a writer brings the two back together.</desc>
  <rect x="0" y="0" width="720" height="262" fill="var(--dg-bg)" rx="10"/>
  <line x1="60" y1="80" x2="680" y2="80" stroke="var(--dg-line-soft)" stroke-width="1.4"/>
  <line x1="60" y1="176" x2="680" y2="176" stroke="var(--dg-line-soft)" stroke-width="1.4"/>
  <text x="60" y="60" font-size="11" font-weight="600" fill="var(--dg-c)">what the header claims</text>
  <text x="60" y="212" font-size="11" font-weight="600" fill="var(--dg-b)">what the tile holds</text>
  <circle cx="120" cy="80" r="7" fill="var(--dg-c-soft)" stroke="var(--dg-c)" stroke-width="2"/>
  <circle cx="120" cy="176" r="7" fill="var(--dg-b-soft)" stroke="var(--dg-b)" stroke-width="2"/>
  <text x="120" y="104" text-anchor="middle" font-size="10" fill="var(--dg-muted)">18.4 M</text>
  <text x="120" y="164" text-anchor="middle" font-size="10" fill="var(--dg-muted)">18.4 M</text>
  <text x="120" y="234" text-anchor="middle" font-size="10.5" fill="var(--dg-text)">read</text>
  <circle cx="310" cy="80" r="7" fill="var(--dg-c-soft)" stroke="var(--dg-c)" stroke-width="2"/>
  <circle cx="310" cy="176" r="7" fill="var(--dg-e-soft)" stroke="var(--dg-e)" stroke-width="2"/>
  <text x="310" y="104" text-anchor="middle" font-size="10" fill="var(--dg-muted)">18.4 M</text>
  <text x="310" y="164" text-anchor="middle" font-size="10" fill="var(--dg-e)">12.6 M</text>
  <text x="310" y="234" text-anchor="middle" font-size="10.5" fill="var(--dg-text)">crop</text>
  <circle cx="500" cy="80" r="7" fill="var(--dg-c-soft)" stroke="var(--dg-c)" stroke-width="2"/>
  <circle cx="500" cy="176" r="7" fill="var(--dg-e-soft)" stroke="var(--dg-e)" stroke-width="2"/>
  <text x="500" y="104" text-anchor="middle" font-size="10" fill="var(--dg-muted)">UTM bbox</text>
  <text x="500" y="164" text-anchor="middle" font-size="10" fill="var(--dg-e)">degrees</text>
  <text x="500" y="234" text-anchor="middle" font-size="10.5" fill="var(--dg-text)">reproject</text>
  <circle cx="660" cy="80" r="7" fill="var(--dg-d-soft)" stroke="var(--dg-d)" stroke-width="2"/>
  <circle cx="660" cy="176" r="7" fill="var(--dg-d-soft)" stroke="var(--dg-d)" stroke-width="2"/>
  <text x="660" y="104" text-anchor="middle" font-size="10" fill="var(--dg-d)">12.6 M</text>
  <text x="660" y="164" text-anchor="middle" font-size="10" fill="var(--dg-d)">12.6 M</text>
  <text x="660" y="234" text-anchor="middle" font-size="10.5" fill="var(--dg-text)">write</text>
  <text x="60" y="34" font-size="10.5" fill="var(--dg-muted)">the gap between the two lines is the bug, and nothing in the run reports it</text>
</svg>

## Performance Tuning

| Scenario | Bottleneck | Remedy |
|----------|------------|--------|
| Single 10 GB LAZ, 8-core workstation | Single-threaded decompression | `lazrs` decompresses with multiple threads; ensure `pip install lazrs` is preferred over `laszip` binding. Set `RAYON_NUM_THREADS=8` before the Python process. |
| 500-tile batch job | Repeated full reads for bounds | Run Phase 2 (`compute_actual_bounds`) in parallel with `concurrent.futures.ProcessPoolExecutor`; collect results before the sequential Phase 3/4 loop. |
| NVMe SSD, 64 GB RAM | CPU-bound decompression | Increase `chunk_size` to 2,000,000; larger chunks amortize Python loop overhead over more points per iteration. |
| Network-attached storage | I/O-bound writes | Write temp files locally, then move to NAS. Avoids LAZ write stalls from high-latency random I/O mid-stream. |
| Mixed LAS 1.2 + LAS 1.4 tiles | VLR schema differences | Detect `h.version.minor` before VLR filtering: LAS 1.2/1.3 files do not support EVLRs; write WKT2 as a standard VLR (not EVLR) for those versions. |

## Common Errors and Troubleshooting

**`LaspyException: Not a LAS file`**
The file header magic bytes (`LASF`) are missing or corrupted. This usually means the file was truncated during transfer. Verify with `xxd survey.las | head -1` — the first four bytes must be `4c 41 53 46`. Recover from source rather than attempting repair.

**`AssertionError: Point count mismatch: header=0 expected=2847193`**
The header `point_count` was never written (zero-initialized). This happens when a writer process was killed before flushing. Use `sync_header` with the source file as both input and output (via tmp rename) to recompute and overwrite the count.

**`pyproj.exceptions.CRSError: Input is not a CRS`**
The WKT string extracted from the VLR is malformed — often caused by a null byte at the end of the payload or encoding mismatch. Add `wkt.rstrip("\x00")` before passing to `pyproj.CRS.from_wkt()`.

**`OverflowError: Python int too large to convert to C long`**
The raw integer X/Y values exceed `int32` bounds. This means the chosen scale/offset combination places some coordinates outside `[-2^31, 2^31-1]`. Increase `x_offset`/`y_offset` to the centroid of the point cloud so integer deltas are small: `x_offset = (x_min + x_max) / 2`.

**Bounding box drift > 0.01 m after sync**
Scale was set too coarse (e.g., `new_scale=0.01`) relative to the actual coordinate spread. Tighten the scale to `0.001` or verify that offsets are centred on the data. If the drift is reproducible and equals exactly `new_scale / 2`, the source data has sub-centimetre precision that is being quantised — this is expected, not a bug.

## Integrating into Automated Pipelines

Once validated, header synchronization routines become mandatory gates at key pipeline boundaries:

- **Pre-ingestion validation** — reject files with mismatched point counts or invalid CRS before loading them into a database or object-store tile index
- **Post-filtering normalization** — after removing noise or isolating ground returns, recalculate bounds and embed the updated CRS before handing off to raster conversion
- **Cross-format translation** — when exporting adjacent vector layers, the point cloud CRS must exactly match the vector source; [fixing CRS mismatches](https://www.pythonlidar.com/point-cloud-data-standards-fundamentals/coordinate-reference-systems/fixing-crs-mismatches-in-point-clouds/) describes the complementary vector-side workflow

For teams managing mixed spatial formats, aligning point cloud metadata with adjacent vector feature attributes is covered in [Syncing Metadata Between LAS and Shapefiles](https://www.pythonlidar.com/point-cloud-data-standards-fundamentals/metadata-header-sync/syncing-metadata-between-las-and-shapefiles/).

---

## FAQ

**Why does my LAS file have a wrong point count in the header?**
The most common cause is a crash or forced termination during writing. The LAS header is written first; if the process dies before the final byte count is flushed, the stored `point_count` stays at zero or its initial value. Re-run `update_header()` via laspy on the written file to recompute the correct count from the actual data length.

**Can I change scale/offset after the point data is already written?**
Not safely in place. Scale and offset define how raw integer XYZ values convert to real-world coordinates. Changing them without rewriting the integer arrays corrupts the geometry. The correct approach is to read all points as scaled floats, create a new `LasHeader` with the desired scale/offset, assign the float coordinates to the new file (laspy will re-encode them as integers), then write the new file. That is exactly what `sync_header` does above.

**What is the difference between a VLR and an EVLR?**
Variable-Length Records (VLRs) appear before the point block and are capped at 65,535 bytes of payload — enough for GeoTIFF key tags but too small for complex WKT2 strings. Extended VLRs (EVLRs), introduced in LAS 1.4, live after the point block and support payloads up to 2^64 bytes, making them the correct location for OGC WKT2 CRS definitions. Always write CRS as WKT2 in an EVLR (`record_id` 2112) for LAS 1.4 files.

**How do I handle files that have both GeoTIFF VLRs and WKT2 VLRs?**
Modern GIS software (PDAL, QGIS, ArcGIS Pro) prioritizes WKT2 (`record_id` 2112) over legacy GeoKey VLRs (`user_id LASF_Projection`, `record_id` 34736/34737). During sync, strip the legacy GeoKey records and retain only the WKT2 record to avoid ambiguous CRS interpretation. Log which records were removed for audit purposes.

---

## Related

- [Point Cloud Data Standards & Fundamentals](https://www.pythonlidar.com/point-cloud-data-standards-fundamentals/) — parent reference covering all LAS/LAZ standards topics
- [LAS/LAZ File Structure](https://www.pythonlidar.com/point-cloud-data-standards-fundamentals/laslaz-file-structure/) — how to parse LAS headers, VLR layouts, and point record formats
- [Coordinate Reference Systems](https://www.pythonlidar.com/point-cloud-data-standards-fundamentals/coordinate-reference-systems/) — CRS definition, validation, and fixing projection mismatches
- [Syncing Metadata Between LAS and Shapefiles](https://www.pythonlidar.com/point-cloud-data-standards-fundamentals/metadata-header-sync/syncing-metadata-between-las-and-shapefiles/) — aligning point cloud metadata with adjacent vector datasets
- [ASPRS Classification Codes](https://www.pythonlidar.com/point-cloud-data-standards-fundamentals/asprs-classification-codes/) — standard class values and how to validate them during post-sync integrity checks
