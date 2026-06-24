---
title: "LAS/LAZ File Structure: Binary Layout, Python Parsing & Production Ingestion"
description: "A practitioner's guide to the LAS/LAZ binary specification — Public Header Block, VLRs, point record formats, and coordinate reconstruction — with complete Python code, parameter tables, and production validation patterns."
slug: "laslaz-file-structure"
type: "cluster"
breadcrumb: "LAS/LAZ File Structure"
datePublished: "2024-10-01"
dateModified: "2026-06-24"
---

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Article",
      "headline": "LAS/LAZ File Structure: Binary Layout, Python Parsing & Production Ingestion",
      "description": "A practitioner's guide to the LAS/LAZ binary specification — Public Header Block, VLRs, point record formats, and coordinate reconstruction — with complete Python code, parameter tables, and production validation patterns.",
      "datePublished": "2024-10-01",
      "dateModified": "2026-06-24",
      "author": { "@type": "Organization", "name": "pythonlidar.com" }
    },
    {
      "@type": "BreadcrumbList",
      "itemListElement": [
        { "@type": "ListItem", "position": 1, "name": "Home", "item": "https://pythonlidar.com/" },
        { "@type": "ListItem", "position": 2, "name": "Point Cloud Data Standards & Fundamentals", "item": "https://pythonlidar.com/point-cloud-data-standards-fundamentals/" },
        { "@type": "ListItem", "position": 3, "name": "LAS/LAZ File Structure", "item": "https://pythonlidar.com/point-cloud-data-standards-fundamentals/laslaz-file-structure/" }
      ]
    },
    {
      "@type": "HowTo",
      "name": "Parse and validate LAS/LAZ files with Python",
      "step": [
        { "@type": "HowToStep", "name": "Inspect Public Header Block", "text": "Open the file with laspy and extract version, point format ID, scale, offset, and bounding box from the header." },
        { "@type": "HowToStep", "name": "Parse VLR records", "text": "Iterate header.vlrs to extract CRS definitions (WKT record_id 2112 or legacy GeoKeys record_id 34735)." },
        { "@type": "HowToStep", "name": "Stream point data in chunks", "text": "Use laspy.open with chunk_iterator to read points without loading the full dataset into RAM." },
        { "@type": "HowToStep", "name": "Reconstruct coordinates", "text": "Apply the LAS scale/offset formula: coordinate = raw_integer * scale + offset using 64-bit float arithmetic." },
        { "@type": "HowToStep", "name": "Validate bounds", "text": "Assert that reconstructed coordinates fall within the declared header bounding box after each chunk." }
      ]
    },
    {
      "@type": "FAQPage",
      "mainEntity": [
        {
          "@type": "Question",
          "name": "What is the difference between LAS and LAZ?",
          "acceptedAnswer": { "@type": "Answer", "text": "LAS is the uncompressed binary format; LAZ applies lossless LASzip compression to reduce file size by 70–90% while preserving exact numerical precision. Both share the same header structure and point record layout." }
        },
        {
          "@type": "Question",
          "name": "Why are LAS coordinates stored as integers?",
          "acceptedAnswer": { "@type": "Answer", "text": "Raw coordinates are stored as 32-bit (formats 0–5) or 64-bit (formats 6–10) scaled integers to minimize file size while preserving sub-millimetre precision. The header's scale and offset fields define the conversion formula back to real-world coordinates." }
        },
        {
          "@type": "Question",
          "name": "How many point formats does LAS 1.4 support?",
          "acceptedAnswer": { "@type": "Answer", "text": "LAS 1.4 defines point formats 0–10. Formats 0–5 are legacy with 32-bit integer coordinates. Formats 6–10 use 64-bit integers and add extended return numbers, an 8-bit classification field, and optional NIR channels (formats 8 and 10)." }
        },
        {
          "@type": "Question",
          "name": "Where is CRS information stored in a LAS file?",
          "acceptedAnswer": { "@type": "Answer", "text": "CRS data lives in Variable Length Records (VLRs), not the Public Header Block. Modern files use WKT2 (record_id 2112 under user_id LASF_Projection). Legacy files use GeoKey VLRs (record_ids 34735–34737)." }
        }
      ]
    }
  ]
}
</script>

Misaligned scale factors, missing CRS VLRs, or incorrect point format assumptions silently corrupt LiDAR pipelines long before errors surface in downstream models. This guide covers the complete binary architecture of the LAS/LAZ specification, provides a production-tested Python ingestion workflow using `laspy`, and delivers the parameter tables and validation checks your team needs to ingest diverse survey datasets reliably. It is part of [Point Cloud Data Standards & Fundamentals](/point-cloud-data-standards-fundamentals/), the reference section covering specifications, coordinate systems, and classification schemes for Python-based LiDAR workflows.

## Prerequisites

Before parsing binary point clouds, confirm your environment meets these requirements:

- **Python 3.10+** with `laspy` ≥ 2.4 and `numpy` ≥ 1.22 installed (`pip install laspy[lazrs] numpy`)
- **lazrs or laszip backend** for LAZ decompression — `laspy[lazrs]` installs the Rust-based backend; `laspy[laszip]` uses the C++ library. Verify with `python -c "import lazrs; print(lazrs.__version__)"`
- **Test dataset:** USGS 3DEP tiles (available via `py3dep`) or OpenTopography `.laz` downloads provide real-world diversity in point formats and VLR structures
- **Baseline knowledge:** familiarity with little-endian binary encoding, fixed-width record layouts, and how [Coordinate Reference Systems](/point-cloud-data-standards-fundamentals/coordinate-reference-systems/) are embedded in spatial file formats

## LAS/LAZ Binary Architecture

The format is divided into four sequential, non-overlapping blocks. Every parser must honour their exact byte boundaries or corrupt all subsequent reads.

<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 760 200" role="img" aria-label="LAS/LAZ file layout showing the four sequential blocks: Public Header Block, Variable Length Records, Point Data Records, and Extended Variable Length Records" style="max-width:100%;height:auto;display:block;margin:1.5rem 0;">
  <title>LAS/LAZ File Block Layout</title>
  <desc>Four contiguous horizontal blocks representing the binary layout of a LAS or LAZ file from left to right: Public Header Block (PHB), Variable Length Records (VLRs), Point Data Records, and Extended Variable Length Records (EVLRs, LAS 1.4 only).</desc>
  <defs>
    <style>
      .las-label { font: 600 11px/1.3 system-ui, sans-serif; fill: currentColor; }
      .las-sub   { font: 400 9.5px/1.4 system-ui, sans-serif; fill: currentColor; opacity: 0.72; }
      .las-box   { rx: 6; ry: 6; stroke-width: 1.5; }
    </style>
  </defs>
  <!-- PHB -->
  <rect class="las-box" x="8" y="24" width="148" height="148" fill="none" stroke="#3b82f6"/>
  <text class="las-label" x="82" y="80" text-anchor="middle">Public Header</text>
  <text class="las-label" x="82" y="96" text-anchor="middle">Block (PHB)</text>
  <text class="las-sub"  x="82" y="114" text-anchor="middle">227 – 375 bytes</text>
  <text class="las-sub"  x="82" y="130" text-anchor="middle">scale · offset · bbox</text>
  <text class="las-sub"  x="82" y="145" text-anchor="middle">point format ID</text>
  <!-- Arrow -->
  <line x1="156" y1="98" x2="172" y2="98" stroke="currentColor" stroke-width="1.5" marker-end="url(#arr)"/>
  <!-- VLRs -->
  <rect class="las-box" x="174" y="24" width="148" height="148" fill="none" stroke="#8b5cf6"/>
  <text class="las-label" x="248" y="80" text-anchor="middle">Variable Length</text>
  <text class="las-label" x="248" y="96" text-anchor="middle">Records (VLRs)</text>
  <text class="las-sub"  x="248" y="114" text-anchor="middle">54-byte descriptor</text>
  <text class="las-sub"  x="248" y="130" text-anchor="middle">CRS · WKT · GeoKeys</text>
  <text class="las-sub"  x="248" y="145" text-anchor="middle">user metadata</text>
  <!-- Arrow -->
  <line x1="322" y1="98" x2="338" y2="98" stroke="currentColor" stroke-width="1.5" marker-end="url(#arr)"/>
  <!-- Point Data -->
  <rect class="las-box" x="340" y="24" width="226" height="148" fill="none" stroke="#10b981"/>
  <text class="las-label" x="453" y="80" text-anchor="middle">Point Data Records</text>
  <text class="las-sub"  x="453" y="98" text-anchor="middle">fixed-length per format ID</text>
  <text class="las-sub"  x="453" y="114" text-anchor="middle">formats 0–5: 32-bit int coords</text>
  <text class="las-sub"  x="453" y="130" text-anchor="middle">formats 6–10: 64-bit int coords</text>
  <text class="las-sub"  x="453" y="145" text-anchor="middle">X · Y · Z · intensity · class · …</text>
  <!-- Arrow -->
  <line x1="566" y1="98" x2="582" y2="98" stroke="currentColor" stroke-width="1.5" marker-end="url(#arr)"/>
  <!-- EVLRs -->
  <rect class="las-box" x="584" y="24" width="168" height="148" fill="none" stroke="#f59e0b"/>
  <text class="las-label" x="668" y="80" text-anchor="middle">Extended VLRs</text>
  <text class="las-label" x="668" y="96" text-anchor="middle">(EVLRs)</text>
  <text class="las-sub"  x="668" y="114" text-anchor="middle">LAS 1.4 only</text>
  <text class="las-sub"  x="668" y="130" text-anchor="middle">8-byte length field</text>
  <text class="las-sub"  x="668" y="145" text-anchor="middle">payloads &gt; 65 535 bytes</text>
  <!-- Arrow marker -->
  <defs>
    <marker id="arr" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto">
      <path d="M0,0 L0,7 L7,3.5 Z" fill="currentColor"/>
    </marker>
  </defs>
  <!-- Byte-offset ruler -->
  <text class="las-sub" x="8"   y="192" text-anchor="start">byte 0</text>
  <text class="las-sub" x="174" y="192" text-anchor="start">≈ byte 375</text>
  <text class="las-sub" x="340" y="192" text-anchor="start">offset_to_point_data</text>
  <text class="las-sub" x="584" y="192" text-anchor="start">start_of_EVLR</text>
</svg>

### 1. Public Header Block (PHB)

The PHB occupies the first 227 bytes in LAS 1.0–1.2, 235 bytes in LAS 1.3, and 375 bytes in LAS 1.4. It is the schema manifest for every subsequent byte in the file.

Key fields engineers must validate at ingestion:

| Field | Type | Description |
|---|---|---|
| `file_signature` | 4 bytes | Must equal `LASF` exactly; any other value means the file is not LAS |
| `version_major` / `version_minor` | uint8 | Together determine block sizes and which features are available |
| `point_data_format_id` | uint8 | Selects the fixed record schema for all point data (formats 0–10) |
| `point_data_record_length` | uint16 | Byte size of one point record; must match the format's spec |
| `legacy_point_count` | uint32 | Valid for LAS 1.0–1.3; zero in LAS 1.4 (use 64-bit field instead) |
| `x_scale`, `y_scale`, `z_scale` | float64 | Multiplier applied to stored integers to recover real-world units |
| `x_offset`, `y_offset`, `z_offset` | float64 | Origin shift; subtracted before integer storage |
| `x_min`/`x_max`, `y_min`/`y_max`, `z_min`/`z_max` | float64 | Declared bounding box; use to validate reconstructed coordinates |
| `offset_to_point_data` | uint32 | Byte position where point records begin; skip here after parsing VLRs |

Scale and offset values are stored as 64-bit doubles but are never applied to coordinates at rest — they define the round-trip formula. Choosing scale values too coarse (e.g., `0.01` instead of `0.001`) permanently degrades coordinate precision for the life of the file.

### 2. Variable Length Records (VLRs)

VLRs immediately follow the PHB. Each begins with a 54-byte descriptor:

- **Reserved** (2 bytes)
- **User ID** (16 bytes, null-padded ASCII)
- **Record ID** (2 bytes)
- **Record length after header** (2 bytes — the payload size, not the descriptor size)
- **Description** (32 bytes, null-padded ASCII)

Parsers must read `record_length_after_header` before advancing the file pointer. Hardcoding any offset assumption will misalign every subsequent VLR and corrupt the `offset_to_point_data` calculation.

Critical VLR record IDs under `LASF_Projection`:

| Record ID | Content |
|---|---|
| 34735 | GeoKey Directory (legacy CRS, LAS 1.0–1.3) |
| 34736 | GeoDouble Parameters |
| 34737 | GeoAscii Parameters |
| 2112 | WKT2 Coordinate System (LAS 1.4, preferred) |

The [Coordinate Reference Systems](/point-cloud-data-standards-fundamentals/coordinate-reference-systems/) guide details how to parse both GeoKey and WKT2 VLRs and handle files that carry neither.

### 3. Point Data Records

Point records form the bulk payload. Each record is `point_data_record_length` bytes, stored contiguously with no padding or alignment gaps. The Point Data Format ID selects the record schema:

| Format | Coords | GPS Time | RGB | NIR | Extra Bytes | Notes |
|---|---|---|---|---|---|---|
| 0 | 32-bit int | — | — | — | Allowed | Smallest legacy format |
| 1 | 32-bit int | Yes | — | — | Allowed | Adds GPS time |
| 2 | 32-bit int | — | Yes | — | Allowed | Adds RGB |
| 3 | 32-bit int | Yes | Yes | — | Allowed | GPS + RGB |
| 6 | 64-bit int | Yes | — | — | Allowed | LAS 1.4 baseline |
| 7 | 64-bit int | Yes | Yes | — | Allowed | LAS 1.4 + RGB |
| 8 | 64-bit int | Yes | Yes | Yes | Allowed | LAS 1.4 + NIR |
| 10 | 64-bit int | Yes | Yes | Yes | Allowed | LAS 1.4 waveform + NIR |

Formats 4, 5, 9, and 10 include waveform data pointers. Formats 0–5 are legacy and use a 1-byte classification field with the high 3 bits encoding scan flags; formats 6–10 use a dedicated 8-bit classification field, freeing the flags to separate bytes.

Coordinate reconstruction follows the LAS specification formula exactly:

```
real_coordinate = stored_integer * scale + offset
```

For storage: `stored_integer = round((real_coordinate - offset) / scale)`

Always use `float64` (not `float32`) for this arithmetic. A survey covering a UTM zone with `x_offset = 500000.0` and `x_scale = 0.001` will silently lose millimetre precision if cast to 32-bit at any intermediate step.

When assessing return distributions and point spacing for downstream use, consult [Point Density Metrics](/point-cloud-data-standards-fundamentals/point-density-metrics/) before building classification or filtering routines.

### 4. Extended Variable Length Records (EVLRs)

Introduced in LAS 1.4, EVLRs sit after the point data block. Their descriptor replaces the 2-byte payload-length field with an 8-byte `uint64`, lifting the 65,535-byte payload cap. This accommodates large WKT2 strings, sensor calibration tables, and custom processing histories without vendor-specific hacks. The PHB's `number_of_evlrs` and `start_of_waveform_data_packet_record` fields locate them.

## Full Implementation: Validated LAS/LAZ Ingestion

The following module covers all five stages of robust ingestion: header extraction, VLR parsing, streaming point reads, coordinate reconstruction, and bounds validation.

```python
import laspy
import numpy as np
import logging
from dataclasses import dataclass, field
from concurrent.futures import ProcessPoolExecutor
from pathlib import Path
from typing import Iterator

logger = logging.getLogger(__name__)

@dataclass
class LASMetadata:
    path: str
    version: str
    point_format: int
    point_count: int
    scale: tuple[float, float, float]
    offset: tuple[float, float, float]
    bbox_min: tuple[float, float, float]
    bbox_max: tuple[float, float, float]
    vlrs: list[dict] = field(default_factory=list)
    crs_wkt: str | None = None
    errors: list[str] = field(default_factory=list)


def extract_metadata(file_path: str) -> LASMetadata:
    """
    Extract and validate Public Header Block and VLR metadata.
    Does NOT load point data; safe to run on arbitrarily large files.
    """
    path = Path(file_path)
    if not path.exists():
        raise FileNotFoundError(f"LAS/LAZ file not found: {file_path}")

    with laspy.open(file_path) as lf:
        h = lf.header
        meta = LASMetadata(
            path=str(path),
            version=f"{h.version.major}.{h.version.minor}",
            point_format=h.point_format.id,
            point_count=h.point_count,
            scale=(h.x_scale, h.y_scale, h.z_scale),
            offset=(h.x_offset, h.y_offset, h.z_offset),
            bbox_min=(h.x_min, h.y_min, h.z_min),
            bbox_max=(h.x_max, h.y_max, h.z_max),
        )

        # Validate header invariants
        if h.point_count == 0:
            meta.errors.append("point_count is zero — file may be empty or corrupt")
        if any(s <= 0 for s in meta.scale):
            meta.errors.append(f"Non-positive scale factor detected: {meta.scale}")

        # Parse VLRs and extract CRS
        for vlr in h.vlrs:
            vlr_entry = {
                "user_id": vlr.user_id,
                "record_id": vlr.record_id,
                "length": vlr.record_data_len,
            }
            # WKT2 CRS record (LAS 1.4)
            if vlr.record_id == 2112 and vlr.user_id == "LASF_Projection":
                try:
                    meta.crs_wkt = vlr.record_data.decode("utf-8").rstrip("\x00")
                    vlr_entry["type"] = "WKT2_CRS"
                except Exception as e:
                    meta.errors.append(f"Malformed WKT2 VLR: {e}")
            # Legacy GeoKey directory
            elif vlr.record_id == 34735:
                vlr_entry["type"] = "GeoKeyDirectory_legacy"
            meta.vlrs.append(vlr_entry)

        if meta.crs_wkt is None:
            logger.warning("No WKT2 VLR (record_id 2112) found in %s", path.name)

    return meta


def stream_points(
    file_path: str,
    chunk_size: int = 250_000,
) -> Iterator[dict[str, np.ndarray]]:
    """
    Yield point attribute dictionaries in fixed-size chunks.

    chunk_size of 250 000 balances memory (~24 MB per chunk for XYZ + 4 attrs)
    against the overhead of Python loop iterations. Reduce to 50 000 for
    machines with <8 GB RAM or increase to 500 000 on 32 GB+ servers.
    """
    with laspy.open(file_path) as lf:
        h = lf.header
        sx, sy, sz = h.x_scale, h.y_scale, h.z_scale
        ox, oy, oz = h.x_offset, h.y_offset, h.z_offset

        available_dims = {d.name for d in h.point_format.dimensions}
        logger.debug("Point format %d dims: %s", h.point_format.id, available_dims)

        for chunk in lf.chunk_iterator(chunk_size):
            # Coordinate reconstruction — must use float64 throughout
            x = chunk.X.astype(np.float64) * sx + ox
            y = chunk.Y.astype(np.float64) * sy + oy
            z = chunk.Z.astype(np.float64) * sz + oz

            record: dict[str, np.ndarray] = {"x": x, "y": y, "z": z}

            # Only access dims that exist in this format
            for dim in ("intensity", "classification", "return_number",
                        "number_of_returns", "gps_time", "scan_angle_rank"):
                if dim in available_dims:
                    record[dim] = getattr(chunk, dim)

            yield record


def validate_bounds(
    chunk: dict[str, np.ndarray],
    meta: LASMetadata,
    tolerance: float = 0.01,
) -> bool:
    """
    Assert reconstructed coordinates fall within declared header extents.
    tolerance (metres) absorbs floating-point rounding from the int→float conversion.
    """
    xmin, ymin, zmin = meta.bbox_min
    xmax, ymax, zmax = meta.bbox_max

    checks = [
        np.all(chunk["x"] >= xmin - tolerance) and np.all(chunk["x"] <= xmax + tolerance),
        np.all(chunk["y"] >= ymin - tolerance) and np.all(chunk["y"] <= ymax + tolerance),
        np.all(chunk["z"] >= zmin - tolerance) and np.all(chunk["z"] <= zmax + tolerance),
    ]
    if not all(checks):
        logger.error(
            "Coordinate bounds violation: chunk extents exceed header bbox "
            "(scale/offset mismatch or bake-in error)"
        )
    return all(checks)


def ingest_tile(file_path: str, chunk_size: int = 250_000) -> dict:
    """
    Full single-tile ingestion: validate header, stream points, check bounds.
    Returns a summary dict suitable for writing to a metadata database.
    """
    meta = extract_metadata(file_path)
    if meta.errors:
        logger.error("Header errors in %s: %s", file_path, meta.errors)
        return {"file": file_path, "status": "header_error", "errors": meta.errors}

    point_counts = []
    bounds_ok = True

    for chunk in stream_points(file_path, chunk_size=chunk_size):
        point_counts.append(len(chunk["x"]))
        if not validate_bounds(chunk, meta):
            bounds_ok = False
            break  # Fail fast on first violation

    return {
        "file": file_path,
        "status": "ok" if bounds_ok else "bounds_error",
        "version": meta.version,
        "point_format": meta.point_format,
        "point_count_declared": meta.point_count,
        "point_count_actual": sum(point_counts),
        "crs_present": meta.crs_wkt is not None,
    }
```

## Code Breakdown

**`extract_metadata`** opens the file header only — no point data is read. This makes it safe to run as a pre-flight check on thousands of tiles without RAM pressure. The VLR loop distinguishes WKT2 CRS records (record_id 2112) from legacy GeoKey records (34735–34737) and logs a warning when neither is present, because missing CRS data will silently corrupt any downstream spatial join.

**`stream_points`** uses `chunk_iterator` instead of loading the full `LasData` object, keeping RAM usage proportional to `chunk_size` rather than to file size. The `available_dims` check before every optional attribute access prevents `AttributeError` crashes on mixed-format tile sets — a common production failure when ingesting data from multiple survey vendors. Casting raw integers to `float64` before applying scale and offset is mandatory: Python's default integer promotion is insufficient when offsets exceed `2³¹` (common in UTM-northing coordinates like `4 500 000`).

**`validate_bounds`** applies a small tolerance (`0.01` metres by default) to absorb rounding artefacts from the integer-to-float conversion. A violation almost always signals that a conversion tool baked offset values into raw coordinates — a spec violation that cannot be corrected automatically. Flagging and quarantining such files is safer than forcing alignment.

**`ingest_tile`** combines the three stages into a single callable suitable for parallel dispatch. Returning a plain dict (not a file handle or numpy array) avoids multiprocessing serialisation errors when using `ProcessPoolExecutor`.

## Parameter Reference

| Parameter | Type | Default | Range / Notes |
|---|---|---|---|
| `chunk_size` | int | 250 000 | 50 000–1 000 000; lower reduces peak RAM, higher reduces loop overhead |
| `tolerance` | float | 0.01 | Metres; increase to 0.1 for legacy files with known rounding in declared bbox |
| `max_workers` | int | 4 | Match to physical CPU cores; I/O-bound tasks rarely benefit beyond 8 |
| `x_scale` / `y_scale` | float64 | source-defined | 0.001 for millimetre precision; 0.0001 for sub-millimetre surveys |
| `x_offset` / `y_offset` | float64 | source-defined | Typically the tile's SW corner in projected units |
| `point_data_format_id` | uint8 | source-defined | 0–10; determines available dimensions and record byte length |

## Validation and Data Integrity Checks

A production ingestion gate should assert all of the following before the file enters the processing queue:

```python
def gate_las_file(file_path: str) -> list[str]:
    """Return a list of gate failures; empty list means the file passed."""
    failures: list[str] = []
    meta = extract_metadata(file_path)

    # 1. File signature and version
    if meta.version not in ("1.2", "1.3", "1.4"):
        failures.append(f"Unsupported LAS version: {meta.version}")

    # 2. Non-zero point count
    if meta.point_count == 0:
        failures.append("Empty file: point_count == 0")

    # 3. CRS must be declared
    if meta.crs_wkt is None and not any(
        v["record_id"] in (34735, 34736, 34737) for v in meta.vlrs
    ):
        failures.append("No CRS VLR (WKT2 or GeoKey) found")

    # 4. Scale factors must be positive and non-trivial
    for axis, s in zip(("x", "y", "z"), meta.scale):
        if s <= 0 or s > 1.0:
            failures.append(f"Suspicious {axis}_scale={s} (expected 0.0001–0.01)")

    # 5. Bounding box sanity
    for axis, lo, hi in zip(("x","y","z"), meta.bbox_min, meta.bbox_max):
        if lo >= hi:
            failures.append(f"Degenerate bbox: {axis}_min={lo} >= {axis}_max={hi}")

    return failures
```

Run `gate_las_file` before committing any tile to your processing queue. Log failures to a dedicated quarantine table rather than letting them propagate.

For per-file header edge cases — malformed EVLR pointers, truncated VLR chains in legacy 1.2 files, and GPS time epoch mismatches — the dedicated [How to Parse LAS Headers with Python](/point-cloud-data-standards-fundamentals/laslaz-file-structure/how-to-parse-las-headers-with-python/) guide covers each failure mode with corrective code.

## Performance Tuning

### chunk_size vs. RAM vs. Throughput

| chunk_size | Peak RAM per tile | Chunks per 10M-point file | Recommended use |
|---|---|---|---|
| 50 000 | ~5 MB | 200 | Edge devices, ≤8 GB RAM |
| 250 000 | ~24 MB | 40 | General server workloads |
| 500 000 | ~48 MB | 20 | High-memory batch servers |
| 1 000 000 | ~96 MB | 10 | Memory-mapped NVMe arrays |

Estimates assume XYZ (float64) + intensity + classification + return_number + number_of_returns.

### LAZ Decompression Backend

`laspy[lazrs]` (Rust) consistently outperforms `laspy[laszip]` (C++ via ctypes) for multi-threaded reads because `lazrs` releases the GIL during decompression. On a 500 MB LAZ file, `lazrs` completes in ~8 s versus ~22 s for pure-Python fallback. Verify your backend:

```python
import laspy
print(laspy.LazBackend.detect_available())
# Expected on a properly configured system:
# [<LazBackend.Laszip: 'laszip'>, <LazBackend.LazrsParallel: 'lazrs_parallel'>]
```

### Parallel Tile Processing

```python
from concurrent.futures import ProcessPoolExecutor
from pathlib import Path

def process_tile_batch(
    file_paths: list[str],
    max_workers: int = 4,
    chunk_size: int = 250_000,
) -> list[dict]:
    """
    Dispatch tile ingestion across worker processes.
    Pass only file paths — not open file handles or numpy arrays — to workers.
    """
    with ProcessPoolExecutor(max_workers=max_workers) as pool:
        futures = {pool.submit(ingest_tile, fp, chunk_size): fp for fp in file_paths}
        results = []
        for future, fp in futures.items():
            try:
                results.append(future.result(timeout=300))
            except Exception as e:
                results.append({"file": fp, "status": "worker_error", "error": str(e)})
    return results
```

Avoid sharing open `laspy` file handles between processes — each worker must open its own file. For ASPRS classification interpretation of the classification codes written into point records, see [ASPRS Classification Codes](/point-cloud-data-standards-fundamentals/asprs-classification-codes/).

## Common Errors and Troubleshooting

**`AttributeError: 'PointRecord' object has no attribute 'gps_time'`**
Root cause: the file uses Point Format 0 or 2, which does not include a GPS time field. Fix: check `header.point_format.id` or inspect `header.point_format.dimensions` before accessing any optional attribute. The `stream_points` function above uses `available_dims` to guard every optional access.

**`LaspyException: File signature 'XXXX' is not valid`**
Root cause: the file is not a LAS file, or the first 4 bytes are corrupt. Common cause: partial download or a `.laz` archive wrapped in an outer ZIP without extraction. Fix: verify the raw bytes with `open(path, 'rb').read(4)` and confirm it equals `b'LASF'`.

**Reconstructed coordinates outside expected UTM range (e.g., X = 5 000 000 when expecting ~500 000)**
Root cause: a conversion tool applied the offset twice, baking it into raw integers. This produces `real = stored_int * scale + offset` values that are offset-shifted by one extra `offset` unit. Fix: check `x_raw * scale` (without adding offset) against the declared bbox. If that matches, the offset was baked. Correct by re-exporting from the original source rather than patching the header.

**`MemoryError` when opening large `.las` files**
Root cause: calling `laspy.read()` instead of `laspy.open()` loads all point data at once. Fix: always use `laspy.open()` combined with `chunk_iterator`. The streaming pattern in `stream_points` above never materialises more than `chunk_size` points at once.

**Silent spatial drift after CRS-aware processing**
Root cause: the pipeline consumed the WKT2 VLR but the transformation library defaulted to the legacy GeoKey EPSG code when both were present, causing a datum mismatch. Fix: explicitly pass `always_xy=True` to `pyproj.Transformer` and prefer WKT2 over legacy GeoKeys. See [Coordinate Reference Systems](/point-cloud-data-standards-fundamentals/coordinate-reference-systems/) for the authoritative extraction order.

---

## Related

- [How to Parse LAS Headers with Python](/point-cloud-data-standards-fundamentals/laslaz-file-structure/how-to-parse-las-headers-with-python/) — deep dive on legacy 1.2 headers, malformed EVLR pointers, and edge-case VLR handling
- [Coordinate Reference Systems](/point-cloud-data-standards-fundamentals/coordinate-reference-systems/) — extract, validate, and transform CRS data embedded in LAS VLRs
- [ASPRS Classification Codes](/point-cloud-data-standards-fundamentals/asprs-classification-codes/) — interpret the classification integers written into each point record
- [Point Density Metrics](/point-cloud-data-standards-fundamentals/point-density-metrics/) — verify that a parsed tile meets density requirements before downstream modelling
- [Point Cloud Data Standards & Fundamentals](/point-cloud-data-standards-fundamentals/) — parent section covering LAS/LAZ, CRS management, metadata, and classification standards
