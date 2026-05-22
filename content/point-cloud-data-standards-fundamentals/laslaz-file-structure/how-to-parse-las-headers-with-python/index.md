# How to Parse LAS Headers with Python

To parse LAS headers with Python, use the `laspy` library’s `.header` object, which maps ASPRS-defined metadata fields directly to Python attributes. For restricted or zero-dependency environments, read the first 227 bytes of the file and unpack them using Python’s built-in `struct` module according to the public header layout.

## Why Header Parsing Matters
The LAS header is the control plane for every point cloud. It stores coordinate reference system (CRS) parameters, spatial extents, point counts, version identifiers, and variable-length records (VLRs). Extracting these values correctly prevents downstream failures in filtering, tiling, or coordinate transformation workflows. Understanding how metadata aligns with point record layouts is critical when designing ingestion pipelines. For a deeper breakdown of how header fields map to binary offsets and record types, review the [LAS/LAZ File Structure](/point-cloud-data-standards-fundamentals/laslaz-file-structure/) documentation. This parsing step sits within the broader [Point Cloud Data Standards & Fundamentals](/point-cloud-data-standards-fundamentals/) framework that governs spatial data serialization, validation, and interoperability across surveying and GIS ecosystems.

## Method 1: Production-Ready Parsing with `laspy`
The `laspy` package is the industry standard for Python-based LiDAR I/O. It handles memory mapping, LAZ decompression, and version-specific header differences automatically. Install it via `pip install laspy`.

```python
import laspy
import sys
from pathlib import Path

def parse_las_header(filepath: str | Path) -> laspy.header.Header | None:
    """
    Extract critical metadata from a LAS/LAZ file header.
    Compatible with laspy >= 2.0.0, Python 3.8+, LAS 1.0–1.4, and LAZ.
    """
    filepath = Path(filepath)
    if not filepath.exists():
        print(f"File not found: {filepath}", file=sys.stderr)
        return None

    try:
        # laspy.open() uses memory-mapped I/O for fast header access
        with laspy.open(filepath) as f:
            h = f.header

            print(f"File Version: {h.version}")
            print(f"Point Format ID: {h.point_format.id}")
            print(f"Point Count: {h.point_count}")

            # Bounding box
            print(f"Bounding Box (X): {h.x_min} to {h.x_max}")
            print(f"Bounding Box (Y): {h.y_min} to {h.y_max}")
            print(f"Bounding Box (Z): {h.z_min} to {h.z_max}")

            # Scale/offset required for coordinate reconstruction
            print(f"Scales: X={h.x_scale}, Y={h.y_scale}, Z={h.z_scale}")
            print(f"Offsets: X={h.x_offset}, Y={h.y_offset}, Z={h.z_offset}")

            # Check for CRS metadata in VLRs (GeoTIFF keys)
            if hasattr(h, 'vlrs') and h.vlrs:
                crs_found = any(vlr.record_id == 34735 for vlr in h.vlrs)
                print(f"VLR Count: {len(h.vlrs)} | GeoKey CRS Present: {crs_found}")

            return h
    except Exception as e:
        print(f"Error parsing header: {e}", file=sys.stderr)
        return None

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python parse_las_header.py <path_to_file.las>")
        sys.exit(1)
    parse_las_header(sys.argv[1])
```

### Implementation Notes
- **Memory Efficiency:** `laspy.open()` reads only the header and VLRs into memory initially. It does not load point records until explicitly requested, making it safe for multi-gigabyte files.
- **Coordinate Reconstruction:** Raw X, Y, Z integers in LAS files are meaningless without scale and offset. Always apply `coordinate = (raw_value * scale) + offset` before spatial operations.
- **VLR Handling:** VLRs store projection data, user metadata, and waveform records. The GeoKey directory (record ID 34735) is the standard location for CRS definitions in LAS 1.4 files.
- **Version Compatibility:** LAS 1.4 introduces extended variable-length records (EVLRs) and changes how point counts are stored. `laspy` abstracts these differences, but legacy scripts should verify `header.version.major` before assuming field availability.

## Method 2: Zero-Dependency Fallback with `struct`
When third-party packages are prohibited (e.g., air-gapped servers, containerized microservices), you can parse the public header manually. The ASPRS specification defines a fixed 227-byte layout for LAS 1.0–1.4 headers, followed by VLRs.

```python
import struct
from pathlib import Path

def parse_las_header_struct(filepath: str | Path) -> dict:
    """
    Parse the public header using Python's built-in struct module.
    Targets LAS 1.2+ byte offsets. Not recommended for LAZ or LAS 1.4 EVLRs.
    """
    filepath = Path(filepath)
    if not filepath.exists():
        raise FileNotFoundError(filepath)

    with open(filepath, "rb") as f:
        data = f.read(227)

    # Extract key fields by byte offset per ASPRS specification
    version_major = struct.unpack_from("B", data, 24)[0]
    version_minor = struct.unpack_from("B", data, 25)[0]
    point_format = struct.unpack_from("B", data, 104)[0]
    point_count = struct.unpack_from("<I", data, 107)[0]
    x_scale, y_scale, z_scale = struct.unpack_from("<ddd", data, 131)
    x_offset, y_offset, z_offset = struct.unpack_from("<ddd", data, 155)
    x_min, x_max = struct.unpack_from("<dd", data, 179)
    y_min, y_max = struct.unpack_from("<dd", data, 195)
    z_min, z_max = struct.unpack_from("<dd", data, 211)

    return {
        "version": f"{version_major}.{version_minor}",
        "point_format": point_format,
        "point_count": point_count,
        "scales": (x_scale, y_scale, z_scale),
        "offsets": (x_offset, y_offset, z_offset),
        "bounds_x": (x_min, x_max),
        "bounds_y": (y_min, y_max),
        "bounds_z": (z_min, z_max)
    }
```

## Common Pitfalls & Validation Checks
- **Scale/Offset Precision:** LAS stores coordinates as 32-bit integers scaled to 64-bit floats. Rounding errors compound during transformations. Use `decimal.Decimal` or `numpy.float64` for high-precision surveying workflows.
- **LAZ Compression:** Compressed LAZ files store the header identically to LAS, but the point data block is compressed. `laspy` detects this automatically via the file signature. Manual parsers will fail if they attempt to read past the header without handling the LAZ chunk table.
- **Missing CRS:** Many legacy datasets omit the GeoKey VLR. Always fallback to checking the `.prj` sidecar file or the `global_encoding` bit flags before assuming a dataset is georeferenced.
- **Point Count Mismatch:** In LAS 1.4, `point_count` may be zero while `extended_point_count` holds the true value. Always check `header.version.major >= 1.4` and use `header.point_count` (which `laspy` normalizes) to avoid undercounting.

## Performance & Integration Tips
- **Batch Processing:** For directory scans, wrap `laspy.open()` in a `concurrent.futures.ThreadPoolExecutor`. Header parsing is I/O-bound, not CPU-bound.
- **Validation Pipeline:** Combine header extraction with `pyproj` to verify CRS compatibility before loading points. The [ASPRS LAS Specification](https://github.com/ASPRSorg/LAS) remains the authoritative reference for field definitions and binary layouts.
- **Memory Limits:** Avoid `laspy.read()` on files >2 GB. Stick to `laspy.open()` and iterate over chunks using `f.points[chunk_start:chunk_end]` to keep RAM usage predictable.
- **Custom Parser Reference:** When implementing low-level binary readers, consult the [Python `struct` documentation](https://docs.python.org/3/library/struct.html) for endianness handling, and cross-check against the official [laspy documentation](https://laspy.readthedocs.io/en/latest/) for API stability across minor releases.