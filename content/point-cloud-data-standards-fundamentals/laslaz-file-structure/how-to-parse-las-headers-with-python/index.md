---
title: "How to Parse LAS Headers with Python"
description: "Step-by-step guide to extracting LAS/LAZ header fields with laspy and Python's struct module — covering version detection, VLR inspection, coordinate scale/offset, and validation for production pipelines."
slug: "how-to-parse-las-headers-with-python"
type: "long_tail"
breadcrumb: "How to Parse LAS Headers with Python"
datePublished: "2025-01-15"
dateModified: "2026-06-24"
---

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Article",
      "headline": "How to Parse LAS Headers with Python",
      "description": "Step-by-step guide to extracting LAS/LAZ header fields with laspy and Python's struct module — covering version detection, VLR inspection, coordinate scale/offset, and validation for production pipelines.",
      "datePublished": "2025-01-15",
      "dateModified": "2026-06-24",
      "author": {"@type": "Organization", "name": "pythonlidar.com"}
    },
    {
      "@type": "BreadcrumbList",
      "itemListElement": [
        {"@type": "ListItem", "position": 1, "name": "Point Cloud Data Standards", "item": "https://pythonlidar.com/point-cloud-data-standards-fundamentals/"},
        {"@type": "ListItem", "position": 2, "name": "LAS/LAZ File Structure", "item": "https://pythonlidar.com/point-cloud-data-standards-fundamentals/laslaz-file-structure/"},
        {"@type": "ListItem", "position": 3, "name": "How to Parse LAS Headers with Python", "item": "https://pythonlidar.com/point-cloud-data-standards-fundamentals/laslaz-file-structure/how-to-parse-las-headers-with-python/"}
      ]
    },
    {
      "@type": "HowTo",
      "name": "How to Parse LAS Headers with Python",
      "step": [
        {"@type": "HowToStep", "position": 1, "name": "Install laspy", "text": "pip install laspy[lazrs]"},
        {"@type": "HowToStep", "position": 2, "name": "Open the file and access the header object", "text": "Use laspy.open() to read only the header and VLRs into memory without loading point records."},
        {"@type": "HowToStep", "position": 3, "name": "Extract version, point format, bounding box, scale and offset", "text": "Read h.version, h.point_format.id, h.point_count, spatial extents, and scale/offset fields."},
        {"@type": "HowToStep", "position": 4, "name": "Inspect VLRs for CRS metadata", "text": "Scan VLR record IDs for GeoKey (34735) and WKT2 (2112) CRS definitions."},
        {"@type": "HowToStep", "position": 5, "name": "Validate the extracted metadata", "text": "Assert scale factors are non-zero, bounding box is valid, and point count matches file size."}
      ]
    },
    {
      "@type": "FAQPage",
      "mainEntity": [
        {
          "@type": "Question",
          "name": "What is the difference between laspy.open() and laspy.read()?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "laspy.open() reads only the header and VLRs into memory without loading point records, making it safe for multi-gigabyte files. laspy.read() loads the entire file, including all point data, into RAM at once."
          }
        },
        {
          "@type": "Question",
          "name": "Why is the point_count zero for some LAS 1.4 files?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "In LAS 1.4, the legacy 32-bit point_count field at byte offset 107 is set to zero when the actual count exceeds 2^32 - 1. The true count is stored in the extended_point_count field as a 64-bit integer. laspy normalizes this transparently via header.point_count."
          }
        },
        {
          "@type": "Question",
          "name": "How do I parse a LAZ file header without laspy?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "LAZ files store an identical public header block to LAS files, so reading the first 227 bytes with Python's struct module works for LAS 1.2-formatted LAZ files. However, the point data block is compressed with a LAZ chunk table immediately following the VLRs. Any manual parser that reads past the header must skip this chunk table or it will misread point records."
          }
        }
      ]
    }
  ]
}
</script>

# How to Parse LAS Headers with Python

Use `laspy.open()` to access the header object, which maps every ASPRS-defined metadata field to a Python attribute — or, for zero-dependency environments, read the first 227 bytes with Python's built-in `struct` module and unpack the fields directly.

## Context and Motivation

This guide is part of [LAS/LAZ File Structure](/point-cloud-data-standards-fundamentals/laslaz-file-structure/), which covers the full binary layout of the ASPRS point cloud format. Within the broader [Point Cloud Data Standards & Fundamentals](/point-cloud-data-standards-fundamentals/) framework, header parsing is the entry point to every processing decision: the version number tells you which fields exist, the point format ID defines the record schema, the scale and offset govern coordinate reconstruction, and the VLRs carry the [coordinate reference system](/point-cloud-data-standards-fundamentals/coordinate-reference-systems/) metadata without which spatial queries are meaningless.

Skipping or misreading any of these fields causes silent corruption: coordinates reconstructed with the wrong scale drift by metres; an undetected CRS mismatch in a VLR will pass ingestion validation only to fail at the reprojection stage; a zero legacy point count on a LAS 1.4 file will make pipelines believe they processed an empty dataset.

The diagram below shows how the three major header regions map onto the binary stream before the point data begins.

<svg viewBox="0 0 720 200" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="LAS file binary layout: Public Header Block, Variable Length Records, and Point Data Records" style="width:100%;max-width:720px;display:block;margin:1.5rem auto;">
  <title>LAS file binary layout</title>
  <desc>A horizontal band showing three sequential regions of a LAS file: the Public Header Block (bytes 0–226), Variable Length Records (bytes 227 to point data offset), and Point Data Records (point data offset to end of file).</desc>
  <!-- PHB -->
  <rect x="10" y="40" width="180" height="100" rx="6" fill="none" stroke="currentColor" stroke-width="2"/>
  <text x="100" y="80" text-anchor="middle" font-size="13" fill="currentColor" font-family="inherit" font-weight="600">Public Header Block</text>
  <text x="100" y="98" text-anchor="middle" font-size="11" fill="currentColor" font-family="inherit">Bytes 0–226 (LAS 1.2)</text>
  <text x="100" y="116" text-anchor="middle" font-size="11" fill="currentColor" font-family="inherit">375 bytes (LAS 1.4)</text>
  <!-- VLRs -->
  <rect x="210" y="40" width="200" height="100" rx="6" fill="none" stroke="currentColor" stroke-width="2"/>
  <text x="310" y="80" text-anchor="middle" font-size="13" fill="currentColor" font-family="inherit" font-weight="600">Variable Length Records</text>
  <text x="310" y="98" text-anchor="middle" font-size="11" fill="currentColor" font-family="inherit">CRS (GeoKey / WKT2)</text>
  <text x="310" y="116" text-anchor="middle" font-size="11" fill="currentColor" font-family="inherit">user metadata, waveform</text>
  <!-- Point Data -->
  <rect x="430" y="40" width="280" height="100" rx="6" fill="none" stroke="currentColor" stroke-width="2"/>
  <text x="570" y="80" text-anchor="middle" font-size="13" fill="currentColor" font-family="inherit" font-weight="600">Point Data Records</text>
  <text x="570" y="98" text-anchor="middle" font-size="11" fill="currentColor" font-family="inherit">Fixed-width records per Point Format ID</text>
  <text x="570" y="116" text-anchor="middle" font-size="11" fill="currentColor" font-family="inherit">raw int32/int64 XYZ + attributes</text>
  <!-- Arrows -->
  <line x1="190" y1="90" x2="208" y2="90" stroke="currentColor" stroke-width="2" marker-end="url(#arr)"/>
  <line x1="410" y1="90" x2="428" y2="90" stroke="currentColor" stroke-width="2" marker-end="url(#arr)"/>
  <defs>
    <marker id="arr" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
      <path d="M0,0 L0,6 L8,3 z" fill="currentColor"/>
    </marker>
  </defs>
  <!-- Byte labels -->
  <text x="10" y="160" font-size="10" fill="currentColor" font-family="inherit">0</text>
  <text x="178" y="160" text-anchor="end" font-size="10" fill="currentColor" font-family="inherit">226/374</text>
  <text x="212" y="160" font-size="10" fill="currentColor" font-family="inherit">227/375</text>
  <text x="408" y="160" text-anchor="end" font-size="10" fill="currentColor" font-family="inherit">offset_to_point_data</text>
  <text x="430" y="160" font-size="10" fill="currentColor" font-family="inherit">→ EOF</text>
</svg>

## Prerequisites and Assumptions

- Python 3.10 or later (the code uses PEP 604 union syntax `str | Path`)
- `laspy` 2.0+ installed: `pip install laspy[lazrs]` (the `lazrs` extra adds native LAZ decompression)
- A `.las` or `.laz` test file — USGS 3DEP tiles from [The National Map](https://apps.nationalmap.gov/downloader/) work well
- No assumption about LAS version; the examples handle 1.0 through 1.4

## Step-by-Step Implementation

### Step 1: Open the file without loading point records

`laspy.open()` memory-maps only the header and VLRs. It does not load point records into RAM until you explicitly request them, making it safe for files that are tens of gigabytes.

```python
import laspy
from pathlib import Path

filepath = Path("survey.laz")
with laspy.open(filepath) as f:
    h = f.header
```

### Step 2: Extract version and point format

The version tuple determines which fields exist. LAS 1.4 introduced EVLRs, a 64-bit point count, and point formats 6–10. Point format ID defines the byte layout of every record in the file.

```python
    print(f"LAS version : {h.version.major}.{h.version.minor}")
    print(f"Point format: {h.point_format.id}")
    print(f"Point count : {h.point_count}")   # normalized — correct for LAS 1.4 too
```

### Step 3: Read the bounding box

The header bounding box is stored in real-world coordinates (scale and offset already applied by the writing software). Use it for spatial indexing before touching any point records.

```python
    print(f"X extent: {h.x_min:.4f}  →  {h.x_max:.4f}")
    print(f"Y extent: {h.y_min:.4f}  →  {h.y_max:.4f}")
    print(f"Z extent: {h.z_min:.4f}  →  {h.z_max:.4f}")
```

### Step 4: Inspect scale and offset

Scale and offset are the two most critical header fields for numeric correctness. Every raw XYZ integer stored in the point records must be reconstructed as `real = (raw * scale) + offset`. Pipelines that ignore the offset introduce absolute positional errors equal to the magnitude of the offset value — often hundreds of thousands of metres for UTM-referenced datasets.

```python
    print(f"Scales : X={h.x_scale}  Y={h.y_scale}  Z={h.z_scale}")
    print(f"Offsets: X={h.x_offset}  Y={h.y_offset}  Z={h.z_offset}")
```

### Step 5: Scan VLRs for CRS metadata

VLR record ID 34735 is the GeoKey directory (legacy CRS, used in LAS 1.2/1.3). Record ID 2112 is the WKT2 string (modern, preferred in LAS 1.4). A file with neither is technically unconstrained in projection — always fall back to checking a `.prj` sidecar or the `global_encoding` bit flags.

```python
    if h.vlrs:
        for vlr in h.vlrs:
            print(f"  VLR  user={vlr.user_id!r:20s}  id={vlr.record_id:5d}  len={vlr.record_length_after_header}")
        has_geokey = any(v.record_id == 34735 for v in h.vlrs)
        has_wkt    = any(v.record_id == 2112  for v in h.vlrs)
        print(f"CRS: GeoKey={has_geokey}  WKT2={has_wkt}")
```

## Complete Working Example

This self-contained script runs against any LAS or LAZ file and prints a structured summary to stdout. Copy it into a file named `parse_las_header.py` and run it with `python parse_las_header.py <file>`.

```python
import laspy
import sys
import struct
from pathlib import Path


def parse_las_header(filepath: str | Path) -> laspy.LasHeader | None:
    """
    Extract critical metadata from a LAS/LAZ file header.

    Compatible with laspy >= 2.0.0, Python 3.10+, LAS 1.0–1.4, and LAZ
    (requires the lazrs extra: pip install laspy[lazrs]).
    """
    filepath = Path(filepath)
    if not filepath.exists():
        print(f"ERROR: File not found: {filepath}", file=sys.stderr)
        return None

    try:
        # laspy.open() uses memory-mapped I/O and reads only the header + VLRs.
        # Point records are NOT loaded here — safe for multi-gigabyte files.
        with laspy.open(filepath) as f:
            h = f.header

            sep = "-" * 52
            print(sep)
            print(f"File        : {filepath.name}")
            print(f"LAS version : {h.version.major}.{h.version.minor}")
            print(f"Point format: {h.point_format.id}")

            # laspy normalizes point_count across LAS 1.0–1.4.
            # For LAS 1.4, it reads the 64-bit extended count when the
            # legacy 32-bit field is zero.
            print(f"Point count : {h.point_count:,}")

            print(sep)
            print("Bounding box (real-world coordinates):")
            print(f"  X: {h.x_min:.6f}  →  {h.x_max:.6f}")
            print(f"  Y: {h.y_min:.6f}  →  {h.y_max:.6f}")
            print(f"  Z: {h.z_min:.6f}  →  {h.z_max:.6f}")

            print(sep)
            print("Coordinate scale + offset (required for raw-integer reconstruction):")
            print(f"  Scale : X={h.x_scale}  Y={h.y_scale}  Z={h.z_scale}")
            print(f"  Offset: X={h.x_offset}  Y={h.y_offset}  Z={h.z_offset}")

            print(sep)
            print(f"VLR count: {len(h.vlrs)}")
            if h.vlrs:
                has_geokey = any(v.record_id == 34735 for v in h.vlrs)
                has_wkt    = any(v.record_id == 2112  for v in h.vlrs)
                print(f"  GeoKey CRS (id=34735): {has_geokey}")
                print(f"  WKT2   CRS (id=2112) : {has_wkt}")
                for vlr in h.vlrs:
                    print(f"  VLR user={vlr.user_id!r:20s}  id={vlr.record_id:5d}  "
                          f"len={vlr.record_length_after_header}")
            print(sep)

            return h

    except Exception as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        return None


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python parse_las_header.py <path/to/file.las>")
        sys.exit(1)
    parse_las_header(sys.argv[1])
```

## Zero-Dependency Fallback with `struct`

When third-party packages are prohibited (air-gapped servers, minimal containers), parse the public header manually. The ASPRS specification defines a fixed 227-byte layout for LAS 1.0–1.3.

**Important axis ordering:** the specification stores the bounding box as max before min for each axis pair. Reversing this silently corrupts spatial queries.

```python
import struct
from pathlib import Path


def parse_las_header_struct(filepath: str | Path) -> dict:
    """
    Parse the LAS 1.2 public header block using only Python built-ins.

    Byte offsets are per the ASPRS LAS 1.2 specification.
    Not suitable for LAZ point data or LAS 1.4 EVLRs.
    """
    filepath = Path(filepath)
    with open(filepath, "rb") as f:
        data = f.read(227)

    if data[:4] != b"LASF":
        raise ValueError(f"Not a valid LAS file (bad signature): {filepath}")

    version_major  = struct.unpack_from("B",    data,   24)[0]
    version_minor  = struct.unpack_from("B",    data,   25)[0]
    point_format   = struct.unpack_from("B",    data,  104)[0]
    # 32-bit count — set to 0 in LAS 1.4 files with >2^32 points
    point_count    = struct.unpack_from("<I",   data,  107)[0]
    x_scale, y_scale, z_scale    = struct.unpack_from("<ddd", data, 131)
    x_offset, y_offset, z_offset = struct.unpack_from("<ddd", data, 155)
    # ASPRS spec: max is stored BEFORE min for each axis
    x_max, x_min  = struct.unpack_from("<dd",  data,  179)
    y_max, y_min  = struct.unpack_from("<dd",  data,  195)
    z_max, z_min  = struct.unpack_from("<dd",  data,  211)

    return {
        "version"     : f"{version_major}.{version_minor}",
        "point_format": point_format,
        "point_count" : point_count,
        "scales"      : (x_scale, y_scale, z_scale),
        "offsets"     : (x_offset, y_offset, z_offset),
        "bounds_x"    : (x_min, x_max),
        "bounds_y"    : (y_min, y_max),
        "bounds_z"    : (z_min, z_max),
    }
```

## Key Parameter Reference

| Header field | Type | Byte offset (LAS 1.2) | Notes |
|---|---|---|---|
| File signature | `char[4]` | 0 | Must equal `LASF` |
| Version major | `uint8` | 24 | 1 for all current versions |
| Version minor | `uint8` | 25 | 0–4; LAS 1.4 adds EVLRs and 64-bit point count |
| Point Data Format ID | `uint8` | 104 | 0–5 (LAS 1.2), 0–10 (LAS 1.4) |
| Legacy point count | `uint32` | 107 | Zero when actual count exceeds 2³² − 1 in LAS 1.4 |
| X/Y/Z scale | `float64` each | 131, 139, 147 | Applied as `real = (raw * scale) + offset` |
| X/Y/Z offset | `float64` each | 155, 163, 171 | Subtracted before storage; re-added on read |
| X max / X min | `float64` each | 179, 187 | Max is stored first — reversed from intuition |
| Y max / Y min | `float64` each | 195, 203 | Same ordering |
| Z max / Z min | `float64` each | 211, 219 | Same ordering |

## Verification

After parsing, validate the extracted metadata before handing it to downstream stages:

```python
def validate_header(h: laspy.LasHeader) -> list[str]:
    """Return a list of validation warnings. Empty list = clean."""
    warnings = []

    # Scale factors of zero cause division-by-zero in coordinate reconstruction
    for axis, scale in [("X", h.x_scale), ("Y", h.y_scale), ("Z", h.z_scale)]:
        if scale == 0.0:
            warnings.append(f"Scale factor for {axis} is zero — coordinate reconstruction will fail.")

    # Inverted bounding box indicates the header was not updated after writing
    if h.x_min > h.x_max:
        warnings.append("X bounding box is inverted (x_min > x_max).")
    if h.y_min > h.y_max:
        warnings.append("Y bounding box is inverted (y_min > y_max).")

    # Empty file check
    if h.point_count == 0:
        warnings.append("Point count is zero — file may be empty or use LAS 1.4 extended count.")

    # CRS presence
    has_crs = any(v.record_id in (34735, 2112) for v in h.vlrs)
    if not has_crs:
        warnings.append("No CRS VLR found (GeoKey id=34735 or WKT2 id=2112). Check .prj sidecar.")

    return warnings
```

Cross-check point count against file size: for an uncompressed LAS file, `(file_size_bytes - offset_to_point_data) / point_data_record_length` should equal `point_count`. Any discrepancy suggests a truncated or corrupted file.

## Gotchas and Edge Cases

**Axis ordering in `struct` parsing.** The ASPRS spec stores the bounding box with max before min for each axis — `x_max` at offset 179, `x_min` at 187, `y_max` at 195, and so on. Reversing this produces a valid-looking dictionary that silently inverts every spatial query against that dataset.

**LAS 1.4 point count.** The legacy 32-bit `point_count` field at offset 107 is written as zero whenever the file contains more than 2³² − 1 points. The actual count lives in the `extended_point_count` field (8 bytes starting at offset 247 in the LAS 1.4 header). `laspy` handles this automatically, but any `struct`-based parser that reads only 227 bytes will report zero and silently skip the real count.

**LAZ point data compression.** LAZ files share the identical public header block with LAS, so header parsing with `struct` works correctly. However, the block that follows the VLRs is a LAZ chunk table, not raw point records. A manual parser that reads past the VLRs without handling the chunk table will misinterpret compressed chunk index data as point records. For anything beyond header extraction, use `laspy[lazrs]`.

**Missing CRS in legacy datasets.** Many pre-2015 aerial survey LAS files were delivered without a GeoKey VLR or WKT string. Before assuming EPSG 4326 or a local projection, inspect the `global_encoding` bits (byte offset 6, `uint16`): bit 0 set means GPS time is GPS week time; bit 4 set (LAS 1.4) means OGC WKT is used for the CRS instead of GeoKeys. When both VLR approaches are absent, check for a `.prj` sidecar with the same base filename. Treating an unconstrained file as georeferenced causes silent drift that accumulates across [coordinate reference system](/point-cloud-data-standards-fundamentals/coordinate-reference-systems/) transformations downstream.

**Scale precision and floating-point arithmetic.** LAS coordinates are raw 32-bit integers (point formats 0–5) or 32-bit integers in a 64-bit-capable container (formats 6–10 in LAS 1.4). The scale and offset are 64-bit doubles. Always reconstruct real-world coordinates using `float64` arithmetic. Reducing to `float32` introduces rounding errors of roughly ±0.01 m for UTM datasets with kilometre-scale offsets.

---

## Related

- [LAS/LAZ File Structure](/point-cloud-data-standards-fundamentals/laslaz-file-structure/) — binary architecture, VLR layout, and point record schemas
- [Point Cloud Data Standards & Fundamentals](/point-cloud-data-standards-fundamentals/) — the parent reference covering format interoperability, ASPRS classification codes, and metadata standards
- [Coordinate Reference Systems](/point-cloud-data-standards-fundamentals/coordinate-reference-systems/) — how VLR CRS metadata maps to EPSG codes and projection workflows
- [Fixing CRS Mismatches in Point Clouds](/point-cloud-data-standards-fundamentals/coordinate-reference-systems/fixing-crs-mismatches-in-point-clouds/) — what happens when the VLR CRS does not match the actual data projection
- [ASPRS Classification Codes](/point-cloud-data-standards-fundamentals/asprs-classification-codes/) — the classification dimension stored in every point record alongside XYZ
