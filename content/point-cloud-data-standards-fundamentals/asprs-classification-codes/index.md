---
title: "ASPRS Classification Codes: Python Workflows for Point Cloud Processing"
description: "Complete guide to reading, validating, reclassifying, and exporting ASPRS classification codes in LAS/LAZ files using Python, laspy, and NumPy — with parameter tables, troubleshooting, and production pipeline patterns."
slug: "asprs-classification-codes"
type: "cluster"
breadcrumb: "ASPRS Classification Codes"
datePublished: "2024-03-15"
dateModified: "2026-06-24"
---

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Article",
      "headline": "ASPRS Classification Codes: Python Workflows for Point Cloud Processing",
      "description": "Complete guide to reading, validating, reclassifying, and exporting ASPRS classification codes in LAS/LAZ files using Python, laspy, and NumPy — with parameter tables, troubleshooting, and production pipeline patterns.",
      "datePublished": "2024-03-15",
      "dateModified": "2026-06-24",
      "author": {"@type": "Organization", "name": "pythonlidar.com"}
    },
    {
      "@type": "BreadcrumbList",
      "itemListElement": [
        {"@type": "ListItem", "position": 1, "name": "Home", "item": "https://pythonlidar.com/"},
        {"@type": "ListItem", "position": 2, "name": "Point Cloud Data Standards & Fundamentals", "item": "https://pythonlidar.com/point-cloud-data-standards-fundamentals/"},
        {"@type": "ListItem", "position": 3, "name": "ASPRS Classification Codes", "item": "https://pythonlidar.com/point-cloud-data-standards-fundamentals/asprs-classification-codes/"}
      ]
    },
    {
      "@type": "HowTo",
      "name": "Reclassify LiDAR Point Clouds Using ASPRS Codes in Python",
      "step": [
        {"@type": "HowToStep", "name": "Install dependencies", "text": "Install laspy[lazrs], numpy, and pyproj in Python 3.10+."},
        {"@type": "HowToStep", "name": "Load and validate classification array", "text": "Open the LAS/LAZ file with laspy, read the classification array, and check for reserved or out-of-range codes."},
        {"@type": "HowToStep", "name": "Apply reclassification logic", "text": "Use NumPy boolean masks to assign ASPRS standard codes or user-defined codes in the 64–255 range."},
        {"@type": "HowToStep", "name": "Synchronize header metadata", "text": "Call las.update_header() to recalculate bounding box and point count before writing."},
        {"@type": "HowToStep", "name": "Export and validate output", "text": "Write the file, then assert classification bounds, VLR count, and point totals match expectations."}
      ]
    },
    {
      "@type": "FAQPage",
      "mainEntity": [
        {
          "@type": "Question",
          "name": "What is the difference between classification code 0 and code 1 in LAS files?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Code 0 (Never Classified) means no classification algorithm has touched the point. Code 1 (Unclassified) means a classification step ran but could not assign a semantic category. Keeping them distinct matters for QA/QC: a point with code 0 in a supposedly fully-classified dataset signals a processing gap."
          }
        },
        {
          "@type": "Question",
          "name": "Can I store user-defined classification codes in a LAS 1.2 file?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "No. LAS 1.2 point formats pack the classification into 5 bits, supporting only values 0–31. User-defined codes in the 64–255 range require LAS 1.4 point formats (6–10). Attempting to store higher codes in a legacy format results in silent truncation or bit corruption."
          }
        },
        {
          "@type": "Question",
          "name": "Why do classification boundaries shift after a coordinate reprojection?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Classification codes are stored as integer attributes on individual points. Reprojection changes each point's XYZ coordinates but leaves its classification integer unchanged. The problem arises when tiling or spatial indexing operations are run before reprojection: points near tile boundaries may be spatially reassigned to a different tile, making class distributions appear to shift. Always reproject before tiling, and verify CRS metadata in the header matches the actual coordinate values."
          }
        }
      ]
    }
  ]
}
</script>

ASPRS Classification Codes define the semantic taxonomy that separates raw LiDAR returns into actionable categories: ground, vegetation, buildings, water, noise, and infrastructure. Every downstream workflow — terrain modeling, canopy height estimation, utility corridor analysis, or flood mapping — depends on these integer labels being correct and consistent. For LiDAR analysts, Python GIS developers, and infrastructure engineering teams, building reliable programmatic workflows around these codes is the prerequisite for scalable point cloud processing.

This page is part of [Point Cloud Data Standards & Fundamentals](/point-cloud-data-standards-fundamentals/), which covers the file formats, metadata structures, and coordinate systems that underpin all Python LiDAR work. For a detailed history of each code's semantics across LAS versions, see [Understanding ASPRS Classification Codes](/point-cloud-data-standards-fundamentals/asprs-classification-codes/understanding-asprs-classification-codes/).

---

## The ASPRS Classification System

<svg viewBox="0 0 780 320" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="ASPRS classification code ranges diagram" style="width:100%;max-width:780px;display:block;margin:1.5rem auto;">
  <title>ASPRS LAS 1.4 Classification Code Ranges</title>
  <desc>Diagram showing the three classification code ranges in LAS 1.4: standard codes 0–18, reserved codes 19–63, and user-defined codes 64–255, each with representative examples.</desc>
  <!-- Background -->
  <rect width="780" height="320" rx="8" fill="none"/>
  <!-- Title -->
  <text x="390" y="28" text-anchor="middle" font-family="system-ui,sans-serif" font-size="14" font-weight="600" fill="currentColor">LAS 1.4 Classification Field — 8-bit unsigned integer (0–255)</text>
  <!-- Range bar -->
  <rect x="30" y="48" width="720" height="36" rx="4" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.3"/>
  <!-- Standard range 0-18: ~7% of 720 = 50px -->
  <rect x="30" y="48" width="50" height="36" rx="4" fill="currentColor" opacity="0.18"/>
  <text x="55" y="71" text-anchor="middle" font-family="system-ui,sans-serif" font-size="11" font-weight="600" fill="currentColor">0–18</text>
  <!-- Reserved range 19-63: ~17.6% = 127px -->
  <rect x="80" y="48" width="127" height="36" fill="currentColor" opacity="0.08"/>
  <text x="143" y="71" text-anchor="middle" font-family="system-ui,sans-serif" font-size="11" fill="currentColor">19–63</text>
  <!-- User-defined range 64-255: remaining 563px -->
  <rect x="207" y="48" width="543" height="36" rx="4" fill="currentColor" opacity="0.05"/>
  <text x="478" y="71" text-anchor="middle" font-family="system-ui,sans-serif" font-size="11" fill="currentColor">64–255</text>
  <!-- Labels below bar -->
  <text x="55" y="102" text-anchor="middle" font-family="system-ui,sans-serif" font-size="11" font-weight="700" fill="currentColor">Standard</text>
  <text x="143" y="102" text-anchor="middle" font-family="system-ui,sans-serif" font-size="11" fill="currentColor" opacity="0.75">Reserved</text>
  <text x="478" y="102" text-anchor="middle" font-family="system-ui,sans-serif" font-size="11" fill="currentColor" opacity="0.75">User-Defined</text>
  <!-- Standard codes detail boxes -->
  <!-- Ground 2 -->
  <rect x="30" y="124" width="100" height="48" rx="4" fill="currentColor" opacity="0.12" stroke="currentColor" stroke-width="1" stroke-opacity="0.3"/>
  <text x="80" y="143" text-anchor="middle" font-family="system-ui,sans-serif" font-size="12" font-weight="600" fill="currentColor">2</text>
  <text x="80" y="160" text-anchor="middle" font-family="system-ui,sans-serif" font-size="10" fill="currentColor">Ground</text>
  <!-- Vegetation 3-5 -->
  <rect x="140" y="124" width="100" height="48" rx="4" fill="currentColor" opacity="0.12" stroke="currentColor" stroke-width="1" stroke-opacity="0.3"/>
  <text x="190" y="143" text-anchor="middle" font-family="system-ui,sans-serif" font-size="12" font-weight="600" fill="currentColor">3–5</text>
  <text x="190" y="160" text-anchor="middle" font-family="system-ui,sans-serif" font-size="10" fill="currentColor">Vegetation</text>
  <!-- Building 6 -->
  <rect x="250" y="124" width="100" height="48" rx="4" fill="currentColor" opacity="0.12" stroke="currentColor" stroke-width="1" stroke-opacity="0.3"/>
  <text x="300" y="143" text-anchor="middle" font-family="system-ui,sans-serif" font-size="12" font-weight="600" fill="currentColor">6</text>
  <text x="300" y="160" text-anchor="middle" font-family="system-ui,sans-serif" font-size="10" fill="currentColor">Building</text>
  <!-- Noise 7/18 -->
  <rect x="360" y="124" width="100" height="48" rx="4" fill="currentColor" opacity="0.12" stroke="currentColor" stroke-width="1" stroke-opacity="0.3"/>
  <text x="410" y="143" text-anchor="middle" font-family="system-ui,sans-serif" font-size="12" font-weight="600" fill="currentColor">7 / 18</text>
  <text x="410" y="160" text-anchor="middle" font-family="system-ui,sans-serif" font-size="10" fill="currentColor">Noise</text>
  <!-- Utility 13-16 -->
  <rect x="470" y="124" width="110" height="48" rx="4" fill="currentColor" opacity="0.12" stroke="currentColor" stroke-width="1" stroke-opacity="0.3"/>
  <text x="525" y="143" text-anchor="middle" font-family="system-ui,sans-serif" font-size="12" font-weight="600" fill="currentColor">13–16</text>
  <text x="525" y="160" text-anchor="middle" font-family="system-ui,sans-serif" font-size="10" fill="currentColor">Utility wires</text>
  <!-- Water 9 -->
  <rect x="590" y="124" width="100" height="48" rx="4" fill="currentColor" opacity="0.12" stroke="currentColor" stroke-width="1" stroke-opacity="0.3"/>
  <text x="640" y="143" text-anchor="middle" font-family="system-ui,sans-serif" font-size="12" font-weight="600" fill="currentColor">9</text>
  <text x="640" y="160" text-anchor="middle" font-family="system-ui,sans-serif" font-size="10" fill="currentColor">Water</text>
  <!-- Workflow arrow row -->
  <text x="30" y="216" font-family="system-ui,sans-serif" font-size="11" fill="currentColor" opacity="0.7">LAS 1.2 (legacy)</text>
  <rect x="30" y="222" width="160" height="24" rx="3" fill="currentColor" opacity="0.08" stroke="currentColor" stroke-width="1" stroke-opacity="0.25"/>
  <text x="110" y="238" text-anchor="middle" font-family="system-ui,sans-serif" font-size="10" fill="currentColor">5-bit field → codes 0–31 only</text>
  <text x="220" y="216" font-family="system-ui,sans-serif" font-size="11" fill="currentColor" opacity="0.7">LAS 1.4 (current)</text>
  <rect x="220" y="222" width="200" height="24" rx="3" fill="currentColor" opacity="0.08" stroke="currentColor" stroke-width="1" stroke-opacity="0.25"/>
  <text x="320" y="238" text-anchor="middle" font-family="system-ui,sans-serif" font-size="10" fill="currentColor">8-bit field → full 0–255 range</text>
  <text x="450" y="216" font-family="system-ui,sans-serif" font-size="11" fill="currentColor" opacity="0.7">User-defined (project-specific)</text>
  <rect x="450" y="222" width="300" height="24" rx="3" fill="currentColor" opacity="0.08" stroke="currentColor" stroke-width="1" stroke-opacity="0.25"/>
  <text x="600" y="238" text-anchor="middle" font-family="system-ui,sans-serif" font-size="10" fill="currentColor">Codes 64–255, LAS 1.4 only</text>
  <!-- Bit-packing note -->
  <text x="390" y="295" text-anchor="middle" font-family="system-ui,sans-serif" font-size="10" fill="currentColor" opacity="0.6">laspy .classification property handles LAS 1.2 bit-packing transparently</text>
</svg>

The American Society for Photogrammetry and Remote Sensing defines a standardized integer mapping stored in each point record. Under LAS 1.4, the classification field is a full 8-bit unsigned integer (0–255). Standard codes run from 0 to 18; codes 19–63 are reserved for future ASPRS use; codes 64–255 are designated for user-defined project classes.

| Code | Classification | Typical Use Case |
|------|----------------|-----------------|
| 0 | Never Classified | Raw/unprocessed returns |
| 1 | Unclassified | Default after initial ingestion |
| 2 | Ground | DTM generation, hydrology |
| 3 | Low Vegetation | Understory analysis |
| 4 | Medium Vegetation | Canopy height modeling |
| 5 | High Vegetation | Forest inventory, biomass estimation |
| 6 | Building | Urban modeling, solar potential |
| 7 | Low Point (Noise) | Outlier filtering |
| 8 | Reserved | Was Model Key in LAS 1.1–1.3 |
| 9 | Water | Floodplain mapping, bathymetry |
| 10 | Rail | Transportation corridor modeling |
| 11 | Road Surface | Pavement analysis, autonomous navigation |
| 12 | Reserved | Was Overlap in LAS 1.1–1.3 |
| 13 | Wire – Guard | Power line safety clearance |
| 14 | Wire – Conductor | Transmission line modeling |
| 15 | Transmission Tower | Utility asset inventory |
| 16 | Wire-Structure Connector | Insulator/fitting detection |
| 17 | Bridge Deck | Structural engineering, clearance checks |
| 18 | High Noise | Severe outlier rejection |
| 19–63 | Reserved | Future ASPRS expansion |
| 64–255 | User-Defined | Custom project taxonomies |

When working with legacy LAS 1.2 files, the classification field is packed into 5 bits of a shared byte — supporting only values 0–31. The remaining 3 bits carry the synthetic, key-point, and withheld flags. The `laspy` property `.classification` unpacks this transparently, but you must stay aware of the constraint when writing output: values above 31 in a LAS 1.2 point format will be silently truncated. The underlying [LAS/LAZ file structure](/point-cloud-data-standards-fundamentals/laslaz-file-structure/) determines which point formats are available and what the field can hold.

---

## Prerequisites

| Requirement | Minimum version | Notes |
|-------------|----------------|-------|
| Python | 3.10 | f-string walrus operator patterns, typing improvements |
| laspy | 2.4.0 | LAS 1.4 full support; `laspy[lazrs]` for LAZ |
| numpy | 1.24.0 | Vectorized boolean masking, `np.copyto` in-place ops |
| pyproj | 3.5.0 | CRS validation against header authority string |
| Input file | LAS 1.4 preferred | LAS 1.2 supported with 5-bit classification caveat |

Install the stack:

```bash
pip install "laspy[lazrs]>=2.4.0" "numpy>=1.24.0" "pyproj>=3.5.0"
```

For test data, the [OpenTopography portal](https://opentopography.org/) provides freely downloadable LAZ files of 5–50 M points across diverse terrain types — a good baseline for exercising all standard classification codes.

---

## Core Workflow Architecture

The classification lifecycle for a LAS/LAZ file follows six distinct phases. Each phase has a clear point of failure, which makes the ordered execution important:

1. **Open and inspect** — read the header to confirm LAS version and point format before loading the full array.
2. **Load classification** — pull the classification array via `las.classification`; `laspy` returns a `uint8` NumPy array regardless of the underlying bit-packing.
3. **Validate codes** — check for reserved codes (19–63), out-of-range values, and consistency between the array shape and the header's `point_count`.
4. **Apply reclassification** — use vectorized boolean masks to assign standard codes (0–18) or project-specific codes (64–255).
5. **Synchronize header** — call `las.update_header()` to recalculate bounding box extents and point count before writing.
6. **Export and assert** — write the file and run post-write assertions to confirm the output matches expectations.

---

## Full Implementation

The function below implements all six phases as a single pipeline entry point with typed signatures, structured logging, and explicit error handling:

```python
import logging
import laspy
import numpy as np
from pathlib import Path

logging.basicConfig(level=logging.INFO, format="%(levelname)s | %(message)s")
log = logging.getLogger(__name__)


def classify_point_cloud(
    input_path: str,
    output_path: str,
    noise_z_min: float,
    noise_z_max: float,
    ground_mask: np.ndarray | None = None,
    user_mapping: dict[int, int] | None = None,
) -> dict:
    """
    Full classification pipeline: validate → reclassify → export.

    Args:
        input_path:   Path to input LAS/LAZ file.
        output_path:  Path for reclassified output (extension sets compression).
        noise_z_min:  Z below this value → code 18 (High Noise).
        noise_z_max:  Z above this value → code 18 (High Noise).
        ground_mask:  Boolean array of length point_count; True → code 2.
        user_mapping: Dict of {existing_code: new_code} for user-defined (64–255) mapping.

    Returns:
        Dict with keys: point_count, unique_codes, reserved_count, output_path.
    """
    # Phase 1: Open and inspect header before loading full array
    with laspy.open(input_path) as fh:
        header = fh.header
        las_version = f"{header.version.major}.{header.version.minor}"
        point_format = header.point_format.id
        header_count = int(header.point_count)
        log.info("LAS %s, point format %d, %s points declared in header",
                 las_version, point_format, f"{header_count:,}")

        if point_format < 6 and header.version.major == 1 and header.version.minor < 4:
            log.warning("LAS 1.2 format: classification field is 5-bit; "
                        "user-defined codes (64–255) will be truncated on write.")

        las = fh.read()

    # Phase 2: Load classification (laspy unpacks bit-packing transparently)
    classification = las.classification.copy()  # Always work on a copy
    array_count = len(classification)

    if array_count != header_count:
        raise ValueError(
            f"Header declares {header_count} points but classification array "
            f"has {array_count} elements — file may be corrupt."
        )

    log.info("Unique codes in input: %s", np.unique(classification).tolist())

    # Phase 3: Validate — flag reserved codes (19-63)
    reserved_mask = (classification >= 19) & (classification <= 63)
    reserved_count = int(np.count_nonzero(reserved_mask))
    if reserved_count > 0:
        log.warning("%s points carry reserved codes 19–63.", f"{reserved_count:,}")

    # Phase 4a: Noise flagging by elevation bounds
    noise_mask = (las.z < noise_z_min) | (las.z > noise_z_max)
    noise_count = int(np.count_nonzero(noise_mask))
    np.copyto(classification, 18, where=noise_mask)  # in-place; avoids temp array
    log.info("Flagged %s points as High Noise (18).", f"{noise_count:,}")

    # Phase 4b: Ground classification from external mask
    if ground_mask is not None:
        if len(ground_mask) != array_count:
            raise ValueError(
                f"ground_mask length {len(ground_mask)} does not match "
                f"point count {array_count}."
            )
        ground_count = int(np.count_nonzero(ground_mask))
        np.copyto(classification, 2, where=ground_mask)
        log.info("Applied ground classification (2) to %s points.", f"{ground_count:,}")

    # Phase 4c: User-defined remapping (codes must land in 64–255)
    if user_mapping:
        for old_code, new_code in user_mapping.items():
            if not (64 <= new_code <= 255):
                raise ValueError(
                    f"User-defined codes must be 64–255, got {new_code} "
                    f"for source code {old_code}."
                )
            mask = classification == old_code
            changed = int(np.count_nonzero(mask))
            np.copyto(classification, new_code, where=mask)
            log.info("Remapped code %d → %d (%s points).", old_code, new_code, f"{changed:,}")

    las.classification = classification

    # Phase 5: Synchronize header
    las.update_header()

    # Phase 6: Export and assert
    out = Path(output_path)
    out.parent.mkdir(parents=True, exist_ok=True)
    las.write(str(out))

    unique_codes = np.unique(classification).tolist()
    log.info("Exported %s points → %s", f"{array_count:,}", output_path)
    log.info("Final unique codes: %s", unique_codes)

    return {
        "point_count": array_count,
        "unique_codes": unique_codes,
        "reserved_count": reserved_count,
        "output_path": str(out),
    }
```

---

## Code Breakdown

### Why `np.copyto` instead of boolean-indexed assignment

`classification[noise_mask] = 18` creates an intermediate index array, which can spike memory usage on datasets of 100 M+ points. `np.copyto(classification, 18, where=noise_mask)` writes in-place without allocating that index. The effect is identical but peak RAM usage can be 10–15% lower on large arrays.

### Why copy the array before modifying it

`las.classification.copy()` decouples the working array from `laspy`'s internal view. Without the copy, modifications propagate back through the view immediately, which makes rollback impossible and can corrupt the object state if a later validation step raises an exception.

### Why validate `array_count != header_count` before any processing

Silently processing a truncated array leads to classification results that do not cover the full point cloud. Failing fast here prevents partial writes that appear valid but miss a percentage of points — a particularly insidious failure mode in batch pipelines.

### Why call `las.update_header()` before writing

Modifying the `classification` array does not recalculate the bounding box extents stored in the LAS header. `update_header()` recomputes min/max X, Y, Z and the exact `point_count`. Skipping this step produces headers that disagree with the actual data, causing downstream tools (PDAL, QGIS, ArcGIS Pro) to misreport extents or refuse to open the file.

---

## Parameter Reference Table

| Parameter | Type | Default | Valid range | Effect |
|-----------|------|---------|-------------|--------|
| `noise_z_min` | `float` | — | Any float (project CRS units) | Points with Z below this are assigned code 18 (High Noise) |
| `noise_z_max` | `float` | — | Any float (project CRS units) | Points with Z above this are assigned code 18 (High Noise) |
| `ground_mask` | `np.ndarray[bool]` | `None` | Shape `(point_count,)`, dtype `bool` | Boolean mask from an external ground filter; `True` → code 2 |
| `user_mapping` | `dict[int,int]` | `None` | Values must be 64–255 | Remaps existing code keys to user-defined code values |
| `output_path` extension | `str` | — | `.las` or `.laz` | `laspy` infers compression from extension; `.laz` requires `lazrs` |

For `noise_z_min` and `noise_z_max`, realistic values depend on the survey datum. For NAD83/NAVD88 (EPSG:6360) urban surveys, values like `-5.0` and `500.0` (meters) are typical starting points. Always derive bounds from the point cloud's actual Z distribution (`np.percentile`) rather than hard-coding them.

---

## Validation and Data Integrity Checks

After writing the output file, run an independent read-back to confirm the classification array round-tripped correctly:

```python
def validate_classification_output(
    output_path: str,
    expected_codes: list[int],
    expected_point_count: int,
) -> bool:
    """Post-write integrity check: codes, count, and header alignment."""
    with laspy.open(output_path) as fh:
        header = fh.header
        actual_count = int(header.point_count)
        las = fh.read()

    classification = las.classification

    # 1. Point count matches expectation
    assert actual_count == expected_point_count, (
        f"Point count mismatch: header={actual_count}, expected={expected_point_count}"
    )
    assert len(classification) == expected_point_count, (
        f"Array length mismatch: {len(classification)} != {expected_point_count}"
    )

    # 2. Only expected codes are present (no unintended codes)
    found_codes = set(np.unique(classification).tolist())
    unexpected = found_codes - set(expected_codes)
    assert not unexpected, f"Unexpected classification codes in output: {unexpected}"

    # 3. No codes in the reserved range slipped through
    reserved = classification[(classification >= 19) & (classification <= 63)]
    assert len(reserved) == 0, f"{len(reserved)} points still carry reserved codes."

    # 4. Header bounding box is not all zeros (update_header was called)
    assert las.header.x_max > las.header.x_min, "Bounding box X extents appear uncalculated."

    log.info("Validation passed: %s points, codes %s", f"{actual_count:,}", sorted(found_codes))
    return True
```

For pipelines that integrate with [coordinate reference system](/point-cloud-data-standards-fundamentals/coordinate-reference-systems/) validation, add a CRS round-trip check: extract the authority string from the header's WKT VLR and confirm it matches the expected EPSG code using `pyproj.CRS.from_wkt().to_epsg()`.

---

## Performance Tuning

### Chunked reading for large files

Loading a 500 M point dataset entirely into memory is not always feasible. When classification is the only dimension required, use `laspy.open()` in chunk mode to read and write concurrently:

```python
def reclassify_chunked(
    input_path: str,
    output_path: str,
    chunk_size: int = 5_000_000,
    noise_z_min: float = -10.0,
    noise_z_max: float = 1000.0,
) -> int:
    """Memory-efficient chunked reclassification for very large LAS/LAZ files."""
    total_points = 0
    with laspy.open(input_path) as reader:
        header = reader.header
        with laspy.LasWriter(output_path, header=header) as writer:
            for chunk in reader.chunk_iterator(chunk_size):
                cls = chunk.classification.copy()
                noise_mask = (chunk.z < noise_z_min) | (chunk.z > noise_z_max)
                np.copyto(cls, 18, where=noise_mask)
                chunk.classification = cls
                writer.write_points(chunk)
                total_points += len(chunk)
    log.info("Chunked write complete: %s points total.", f"{total_points:,}")
    return total_points
```

### Chunk size vs. memory vs. throughput

| Chunk size (points) | Approx. RAM per chunk | Typical throughput | Best for |
|--------------------|-----------------------|--------------------|----------|
| 1,000,000 | ~40 MB | Moderate | Memory-constrained environments |
| 5,000,000 | ~200 MB | Fast | General production use |
| 20,000,000 | ~800 MB | Fastest | High-RAM servers, NVMe storage |

Throughput scales approximately linearly with chunk size up to the point where the chunk no longer fits in CPU cache — typically around 10–20 M points for classification-only operations. For mixed-dimension operations (classification + RGB + intensity), reduce chunk size proportionally.

### Compression choices

Writing `.laz` instead of `.las` reduces file size by 70–85% at a cost of roughly 30–40% additional CPU time for both write and read. For iterative re-processing passes (e.g., running multiple classification experiments), keep intermediate outputs as uncompressed `.las` to minimize read latency. Use `.laz` for archival and data delivery. See the [LAS/LAZ file structure](/point-cloud-data-standards-fundamentals/laslaz-file-structure/) page for a full comparison of point format options and compression tradeoffs.

---

## Common Errors and Troubleshooting

### `ValueError: Classification values must be in [0, 255]`

**Root cause:** Attempting to assign a negative integer or a value above 255 to `las.classification`. `laspy` enforces dtype bounds on assignment.

**Fix:** Validate your `mapping` dictionary and any external mask arrays before assignment. Use `np.clip(classification, 0, 255)` as a final guard before writing if integrating with external tools that produce unconstrained integer outputs.

---

### `LaspyException: Mismatch between header point_count and actual point_count`

**Root cause:** The file header's `point_count` field was not updated after filtering or appending points. This surfaces at read time in downstream tools, not during the `laspy` write itself.

**Fix:** Always call `las.update_header()` before `las.write()`. If using `LasWriter` in chunked mode, `laspy` handles point count automatically during the chunked write.

---

### `AssertionError: Point count mismatch: header=50000000, expected=49998234`

**Root cause:** A filter step removed points without updating the expected count assertion. Common when applying a boolean filter (`las.points = las.points[mask]`) and then running the validation function with the original count.

**Fix:** Derive `expected_point_count` from the post-filter array length, not the original header count. Make the validation function accept the actual output rather than the input expectation.

---

### Classification codes revert to 0 after writing

**Root cause:** Calling `las.classification = classification` after `las.write()` rather than before. The `LasData.write()` method snapshots the object state at call time.

**Fix:** Assign all modified arrays to the `LasData` object before calling `write()` or `update_header()`. A safe pattern: validate → modify array → assign back → `update_header()` → `write()`.

---

### User-defined codes (64–255) appear as 0 in QGIS or ArcGIS

**Root cause:** The output file was written in LAS 1.2 point format (formats 0–5), which uses a 5-bit classification field. Values above 31 are silently truncated during write.

**Fix:** Confirm `header.version.major == 1` and `header.version.minor == 4` before assigning user-defined codes. If the source file is LAS 1.2, create a new `laspy.LasHeader` with `version=laspy.LasVersion(1, 4)` and `point_format=laspy.PointFormat(6)` to upgrade the output.

---

## Frequently Asked Questions

**What is the difference between code 0 and code 1?**

Code 0 (Never Classified) means no classification algorithm has processed the point at all. Code 1 (Unclassified) means a classification step ran but could not assign a semantic label. Keeping them distinct matters for QA: a code-0 point in a nominally fully-classified dataset signals a processing gap rather than a point the algorithm was uncertain about.

**Can I store user-defined codes in a LAS 1.2 file?**

No. The 5-bit classification field in LAS 1.2 point formats supports only values 0–31. User-defined codes in the 64–255 range require LAS 1.4 point formats (6–10). Downgrading a LAS 1.4 file to LAS 1.2 truncates any codes above 31 silently.

**Why do classification boundaries shift after reprojection?**

Classification codes are integer attributes on individual points; they do not change during reprojection. The apparent shift happens when tiling or spatial indexing runs before reprojection: points near tile boundaries get reassigned to a different tile based on their pre-projection coordinates, making class distributions appear to shift spatially. Always reproject before tiling. For full details on resolving these mismatches, see the guide to [fixing CRS mismatches in point clouds](/point-cloud-data-standards-fundamentals/coordinate-reference-systems/fixing-crs-mismatches-in-point-clouds/).

---

## Related

- [Understanding ASPRS Classification Codes](/point-cloud-data-standards-fundamentals/asprs-classification-codes/understanding-asprs-classification-codes/) — per-code semantics, historical changes across LAS versions, and the LAS 1.4 specification reference
- [LAS/LAZ File Structure](/point-cloud-data-standards-fundamentals/laslaz-file-structure/) — point record formats, VLR layout, header fields, and bit-packing in legacy formats
- [Coordinate Reference Systems](/point-cloud-data-standards-fundamentals/coordinate-reference-systems/) — CRS validation, authority string extraction, and datum-aware spatial operations
- [Fixing CRS Mismatches in Point Clouds](/point-cloud-data-standards-fundamentals/coordinate-reference-systems/fixing-crs-mismatches-in-point-clouds/) — practical steps to detect and correct misaligned projections before or after classification
- [Point Cloud Data Standards & Fundamentals](/point-cloud-data-standards-fundamentals/) — parent section covering all LAS/LAZ standards, metadata, and Python workflows
