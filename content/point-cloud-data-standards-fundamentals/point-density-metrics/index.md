---
title: "Point Density Metrics in Python LiDAR Workflows"
description: "Compute, validate, and normalize point density metrics from LAS/LAZ files using Python. Grid-based binning, statistical QA, classification filtering, and CI/CD integration for production LiDAR pipelines."
slug: "point-density-metrics"
type: "topic"
breadcrumb: "Point Density Metrics"
datePublished: "2024-01-15"
dateModified: "2026-06-24"
---

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Article",
      "headline": "Point Density Metrics in Python LiDAR Workflows",
      "description": "Compute, validate, and normalize point density metrics from LAS/LAZ files using Python. Grid-based binning, statistical QA, classification filtering, and CI/CD integration for production LiDAR pipelines.",
      "datePublished": "2024-01-15",
      "dateModified": "2026-06-24",
      "author": { "@type": "Organization", "name": "pythonlidar.com" },
      "publisher": { "@type": "Organization", "name": "pythonlidar.com" }
    },
    {
      "@type": "BreadcrumbList",
      "itemListElement": [
        { "@type": "ListItem", "position": 1, "name": "Home", "item": "https://www.pythonlidar.com/" },
        { "@type": "ListItem", "position": 2, "name": "Point Cloud Data Standards & Fundamentals", "item": "https://www.pythonlidar.com/point-cloud-data-standards-fundamentals/" },
        { "@type": "ListItem", "position": 3, "name": "Point Density Metrics", "item": "https://www.pythonlidar.com/point-cloud-data-standards-fundamentals/point-density-metrics/" }
      ]
    },
    {
      "@type": "HowTo",
      "name": "Compute Point Density Metrics from LAS/LAZ Files in Python",
      "description": "A step-by-step workflow for computing, normalizing, and validating point density metrics using laspy and NumPy.",
      "step": [
        { "@type": "HowToStep", "position": 1, "name": "Validate CRS and Header", "text": "Open the LAS file with laspy, extract the CRS from VLRs, and confirm the projection is metric before any spatial calculation." },
        { "@type": "HowToStep", "position": 2, "name": "Apply Classification Filters", "text": "Mask out noise classes (7, 18) and optional withheld points before binning to prevent inflated density counts." },
        { "@type": "HowToStep", "position": 3, "name": "Grid-Bin XY Coordinates", "text": "Two-pass chunked I/O: first pass determines the bounding box; second pass accumulates per-cell point counts into a uint32 NumPy array." },
        { "@type": "HowToStep", "position": 4, "name": "Normalize to pts/m²", "text": "Divide the raw count grid by cell_size² to convert raw counts to points per square meter." },
        { "@type": "HowToStep", "position": 5, "name": "Derive QA Statistics", "text": "Compute mean, median, p5, p95, and coverage percentage over non-zero cells. Flag cells below the project-specific threshold." },
        { "@type": "HowToStep", "position": 6, "name": "Export and Sync Metadata", "text": "Write the density raster as a GeoTIFF and update LAS VLRs with the empirical density values for downstream traceability." }
      ]
    },
    {
      "@type": "FAQPage",
      "mainEntity": [
        {
          "@type": "Question",
          "name": "Why does point density vary so much across a single LiDAR tile?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Natural causes include flight-line overlap (double coverage at swath edges), terrain slope (steep faces receive fewer returns per horizontal area), scan angle variation, and atmospheric attenuation. Systematic striping usually indicates calibration drift or an incomplete flight plan."
          }
        },
        {
          "@type": "Question",
          "name": "Can I use the nominal point spacing from the LAS header instead of computing density?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "No. Header fields like file_source_id and the point spacing noted in VLRs are often static pre-flight estimates or manufacturer defaults. Always derive empirical density from the actual XYZ coordinates before reporting to a client or running terrain models."
          }
        },
        {
          "@type": "Question",
          "name": "What minimum density is required for topographic mapping versus vegetation analysis?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "ASPRS accuracy standards for topographic mapping typically require 2–8 pts/m² depending on the vertical accuracy class. Canopy structure and individual-tree detection generally need 10–25 pts/m², while high-resolution urban modeling or façade scanning can demand 50–200 pts/m²."
          }
        },
        {
          "@type": "Question",
          "name": "How do I handle files too large to fit in RAM?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Use laspy's chunk_iterator with a chunk_size of 5–10 million points. The two-pass approach in this guide reads only coordinates per chunk and never loads the full point cloud. For files over 10 GB, consider Dask arrays or PDAL's filters.stats for distributed processing."
          }
        }
      ]
    }
  ]
}
</script>

Point density metrics quantify the spatial distribution of laser returns across a survey extent and are the primary quality gate before any downstream LiDAR analysis. When density falls below spec—or varies systematically across a tile—terrain models, canopy height estimates, and volumetric calculations all degrade in predictable ways. This guide is part of [Point Cloud Data Standards & Fundamentals](https://www.pythonlidar.com/point-cloud-data-standards-fundamentals/) and covers the complete Python workflow: header validation, classification-aware binning, statistical normalization, threshold enforcement, and metadata synchronization for production pipelines.

<svg viewBox="0 0 780 220" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Six-stage point density workflow: validate CRS, filter classifications, grid-bin XY, normalize to pts/m², derive QA statistics, export and sync metadata" style="width:100%;max-width:780px;display:block;margin:1.5rem auto;">
  <title>Point Density Metrics Workflow — Six Stages</title>
  <desc>Six sequential stages for computing point density metrics from a LAS/LAZ file: (1) Validate CRS and header, (2) Filter classification codes, (3) Grid-bin XY coordinates with chunk-based I/O, (4) Normalize counts to pts per square metre, (5) Derive QA statistics including mean, p5, and p95, (6) Export GeoTIFF and sync LAS VLR metadata.</desc>
  <rect x="0" y="0" width="780" height="220" fill="var(--dg-bg)" rx="10"/>
  <defs>
    <marker id="pdm-arr" markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto">
      <polygon points="0 0, 8 3, 0 6" fill="currentColor" opacity="0.55"/>
    </marker>
  </defs>
  <!-- Stage 1 -->
  <rect x="6" y="40" width="112" height="60" rx="6" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.75"/>
  <text x="62" y="63" text-anchor="middle" font-size="10.5" fill="currentColor" font-family="sans-serif" font-weight="600">Validate CRS</text>
  <text x="62" y="78" text-anchor="middle" font-size="9.5" fill="currentColor" opacity="0.65" font-family="sans-serif">VLR + metric</text>
  <text x="62" y="91" text-anchor="middle" font-size="9.5" fill="currentColor" opacity="0.65" font-family="sans-serif">projection</text>
  <!-- Stage 2 -->
  <rect x="136" y="40" width="112" height="60" rx="6" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.75"/>
  <text x="192" y="63" text-anchor="middle" font-size="10.5" fill="currentColor" font-family="sans-serif" font-weight="600">Filter Classes</text>
  <text x="192" y="78" text-anchor="middle" font-size="9.5" fill="currentColor" opacity="0.65" font-family="sans-serif">exclude noise</text>
  <text x="192" y="91" text-anchor="middle" font-size="9.5" fill="currentColor" opacity="0.65" font-family="sans-serif">cls 7, 12, 18</text>
  <!-- Stage 3 -->
  <rect x="266" y="40" width="112" height="60" rx="6" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.75"/>
  <text x="322" y="63" text-anchor="middle" font-size="10.5" fill="currentColor" font-family="sans-serif" font-weight="600">Grid-Bin XY</text>
  <text x="322" y="78" text-anchor="middle" font-size="9.5" fill="currentColor" opacity="0.65" font-family="sans-serif">2-pass chunked</text>
  <text x="322" y="91" text-anchor="middle" font-size="9.5" fill="currentColor" opacity="0.65" font-family="sans-serif">I/O, uint32</text>
  <!-- Stage 4 -->
  <rect x="396" y="40" width="112" height="60" rx="6" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.75"/>
  <text x="452" y="63" text-anchor="middle" font-size="10.5" fill="currentColor" font-family="sans-serif" font-weight="600">Normalize</text>
  <text x="452" y="78" text-anchor="middle" font-size="9.5" fill="currentColor" opacity="0.65" font-family="sans-serif">count / cell_size²</text>
  <text x="452" y="91" text-anchor="middle" font-size="9.5" fill="currentColor" opacity="0.65" font-family="sans-serif">→ pts/m²</text>
  <!-- Stage 5 -->
  <rect x="526" y="40" width="112" height="60" rx="6" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.75"/>
  <text x="582" y="63" text-anchor="middle" font-size="10.5" fill="currentColor" font-family="sans-serif" font-weight="600">QA Statistics</text>
  <text x="582" y="78" text-anchor="middle" font-size="9.5" fill="currentColor" opacity="0.65" font-family="sans-serif">mean, p5, p95</text>
  <text x="582" y="91" text-anchor="middle" font-size="9.5" fill="currentColor" opacity="0.65" font-family="sans-serif">threshold flags</text>
  <!-- Stage 6 -->
  <rect x="656" y="40" width="118" height="60" rx="6" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.75"/>
  <text x="715" y="63" text-anchor="middle" font-size="10.5" fill="currentColor" font-family="sans-serif" font-weight="600">Export + Sync</text>
  <text x="715" y="78" text-anchor="middle" font-size="9.5" fill="currentColor" opacity="0.65" font-family="sans-serif">GeoTIFF raster</text>
  <text x="715" y="91" text-anchor="middle" font-size="9.5" fill="currentColor" opacity="0.65" font-family="sans-serif">+ VLR update</text>
  <!-- Arrows -->
  <line x1="118" y1="70" x2="134" y2="70" stroke="currentColor" stroke-width="1.5" marker-end="url(#pdm-arr)" opacity="0.55"/>
  <line x1="248" y1="70" x2="264" y2="70" stroke="currentColor" stroke-width="1.5" marker-end="url(#pdm-arr)" opacity="0.55"/>
  <line x1="378" y1="70" x2="394" y2="70" stroke="currentColor" stroke-width="1.5" marker-end="url(#pdm-arr)" opacity="0.55"/>
  <line x1="508" y1="70" x2="524" y2="70" stroke="currentColor" stroke-width="1.5" marker-end="url(#pdm-arr)" opacity="0.55"/>
  <line x1="638" y1="70" x2="654" y2="70" stroke="currentColor" stroke-width="1.5" marker-end="url(#pdm-arr)" opacity="0.55"/>
  <!-- Bottom note -->
  <text x="390" y="185" text-anchor="middle" font-size="9" fill="currentColor" opacity="0.45" font-family="sans-serif">chunked I/O at stages 3–4 keeps RAM flat regardless of file size</text>
</svg>

## Prerequisites

Before implementing density calculations, confirm that your environment and input data meet these baseline requirements.

- **Python 3.10+** with a managed virtual environment (`venv` or `conda`)
- **Core libraries:** `laspy` (v2.4+), `numpy` (≥1.24), `scipy` (≥1.11), `rasterio` (≥1.3), `pyproj` (≥3.6)
- **Input data:** LAS 1.2–1.4 or LAZ files with populated VLRs, a consistent scale/offset header, and `Classification` dimension present
- **CRS:** Input must be in a projected metric coordinate system (e.g., EPSG:32632 for UTM zone 32N). Geographic CRS (EPSG:4326) will produce incorrect area calculations. See [Coordinate Reference Systems](https://www.pythonlidar.com/point-cloud-data-standards-fundamentals/coordinate-reference-systems/) for reprojection guidance.
- **LAS knowledge:** Familiarity with how the [LAS/LAZ file structure](https://www.pythonlidar.com/point-cloud-data-standards-fundamentals/laslaz-file-structure/) encodes scale/offset and VLRs — these fields are read in Stage 1
- **Test dataset:** Any publicly available USGS 3DEP tile (`.laz`) works for development; download via the [USGS LidarExplorer](https://apps.nationalmap.gov/lidarexplorer/)
- **System resources:** ≥ 8 GB RAM for files up to 200 M points using the chunked approach below; NVMe storage recommended for sequential reads

## Core Workflow Architecture

The density computation follows a six-phase execution lifecycle designed to be memory-flat regardless of file size:

1. **CRS validation** — parse VLRs with `laspy`, confirm metric projection, reject geographic CRS early
2. **Classification filtering** — build a boolean mask that excludes noise returns (ASPRS classes 7, 12, 18) and withheld points (class 22) before any spatial binning
3. **Bounding-box sweep** — first chunked pass over XY coordinates to determine `x_min`, `y_min`, `x_max`, `y_max` without loading Z or attribute dimensions
4. **Density accumulation** — second chunked pass: bin filtered XY points into a `uint32` grid using `np.add.at`; `cell_size` defaults to 1.0 m
5. **Normalization and statistics** — divide raw counts by `cell_size²`, then compute descriptive statistics over non-zero cells; flag cells below the project threshold
6. **Export and metadata sync** — write the density raster as a GeoTIFF (via `rasterio`) and update the LAS VLR with the empirical density values for downstream [metadata-header synchronization](https://www.pythonlidar.com/point-cloud-data-standards-fundamentals/metadata-header-sync/)

## Full Implementation

The following module is production-ready: typed signatures, structured logging, explicit error handling, and realistic defaults throughout.

```python
"""
point_density.py — Grid-based point density metrics for LAS/LAZ files.
Requires: laspy>=2.4, numpy>=1.24, rasterio>=1.3, pyproj>=3.6
"""

from __future__ import annotations

import logging
from pathlib import Path

import laspy
import numpy as np
import pyproj
import rasterio
from rasterio.transform import from_origin

log = logging.getLogger(__name__)
logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")

# ── Classification masks ─────────────────────────────────────────────────────
# ASPRS LAS 1.4 classes to exclude before density computation.
# 7 = Low point (noise), 12 = Overlap, 18 = High noise, 22 = Withheld
EXCLUDE_CLASSES: frozenset[int] = frozenset({7, 12, 18, 22})


def validate_las_crs(file_path: Path) -> pyproj.CRS:
    """Parse and validate the CRS embedded in LAS VLRs.

    Raises:
        ValueError: If no VLRs are found, CRS cannot be parsed, or the
                    projection is not metric (geographic CRS rejected).
    """
    with laspy.open(file_path) as f:
        if not f.header.vlrs:
            raise ValueError(
                f"{file_path.name}: No VLRs found — CRS metadata is missing. "
                "Re-export the file with a WKT or GeoTIFF CRS VLR."
            )

        crs = f.header.parse_crs()
        if crs is None:
            raise ValueError(
                f"{file_path.name}: Could not parse a CRS from VLRs. "
                "Inspect the VLR records with laspy.open().header.vlrs."
            )

        if not crs.is_projected:
            raise ValueError(
                f"{file_path.name}: Geographic CRS '{crs.name}' detected. "
                "Density calculations require a planar metric projection. "
                "Reproject to e.g. EPSG:32632 (UTM 32N) first."
            )

        log.info("CRS validated: %s (EPSG:%s)", crs.name, crs.to_epsg())
        return crs


def compute_grid_density(
    file_path: Path,
    cell_size: float = 1.0,
    chunk_size: int = 5_000_000,
    exclude_classes: frozenset[int] = EXCLUDE_CLASSES,
) -> tuple[np.ndarray, tuple[float, float, float, float]]:
    """Compute per-cell point density via two-pass chunked I/O.

    Pass 1: determine bounding box without loading Z or attributes.
    Pass 2: accumulate filtered XY counts into a uint32 grid.

    Args:
        file_path:       Path to a LAS or LAZ file.
        cell_size:       Grid cell edge length in the file's projection units
                         (metres for metric CRS). Default 1.0 m.
        chunk_size:      Points read per I/O chunk. 5 M ≈ 120 MB RAM peak.
        exclude_classes: Set of ASPRS classification codes to ignore.

    Returns:
        density_grid: uint32 NumPy array, shape (rows, cols), raw counts.
        bounds:       (x_min, y_min, x_max, y_max) in projection units.
    """
    log.info("Pass 1/2: scanning bounding box — %s", file_path.name)
    x_min, y_min = np.inf, np.inf
    x_max, y_max = -np.inf, -np.inf

    with laspy.open(file_path) as f:
        for chunk in f.chunk_iterator(chunk_size):
            cls = np.array(chunk.classification, dtype=np.uint8)
            keep = ~np.isin(cls, list(exclude_classes))
            if not keep.any():
                continue
            x, y = np.asarray(chunk.x)[keep], np.asarray(chunk.y)[keep]
            x_min, y_min = min(x_min, x.min()), min(y_min, y.min())
            x_max, y_max = max(x_max, x.max()), max(y_max, y.max())

    if not np.isfinite(x_min):
        raise RuntimeError(
            "No valid points remain after classification filtering. "
            "Check EXCLUDE_CLASSES against the file's actual class codes."
        )

    cols = max(1, int(np.ceil((x_max - x_min) / cell_size)))
    rows = max(1, int(np.ceil((y_max - y_min) / cell_size)))
    log.info("Grid: %d rows × %d cols at %.2f m cell size", rows, cols, cell_size)

    density_grid = np.zeros((rows, cols), dtype=np.uint32)

    log.info("Pass 2/2: accumulating density counts")
    with laspy.open(file_path) as f:
        for chunk in f.chunk_iterator(chunk_size):
            cls = np.array(chunk.classification, dtype=np.uint8)
            keep = ~np.isin(cls, list(exclude_classes))
            if not keep.any():
                continue
            x, y = np.asarray(chunk.x)[keep], np.asarray(chunk.y)[keep]

            col_idx = np.clip(
                ((x - x_min) / cell_size).astype(np.intp), 0, cols - 1
            )
            row_idx = np.clip(
                ((y - y_min) / cell_size).astype(np.intp), 0, rows - 1
            )
            np.add.at(density_grid, (row_idx, col_idx), 1)

    return density_grid, (x_min, y_min, x_max, y_max)


def normalize_density(
    density_grid: np.ndarray, cell_size: float
) -> np.ndarray:
    """Convert raw count grid to points per square metre (pts/m²)."""
    return density_grid.astype(np.float32) / (cell_size ** 2)


def generate_density_stats(
    density_pts_m2: np.ndarray, threshold: float = 8.0
) -> dict:
    """Compute QA statistics over non-empty cells.

    Args:
        density_pts_m2: Normalized density grid (pts/m²).
        threshold:       Minimum acceptable density for the project spec.

    Returns:
        Dictionary of descriptive statistics and a low-density flag.
    """
    valid = density_pts_m2[density_pts_m2 > 0]
    total_cells = density_pts_m2.size

    if len(valid) == 0:
        log.warning("All cells are empty — check CRS and classification filter.")
        return {
            "mean_pts_m2": 0.0, "median_pts_m2": 0.0,
            "p5_pts_m2": 0.0, "p95_pts_m2": 0.0,
            "std_dev": 0.0, "min_pts_m2": 0.0, "max_pts_m2": 0.0,
            "coverage_pct": 0.0, "low_density_cells_pct": 100.0,
            "passes_threshold": False,
        }

    low_count = int((density_pts_m2 > 0) & (density_pts_m2 < threshold)).sum()

    stats = {
        "mean_pts_m2":          float(np.mean(valid)),
        "median_pts_m2":        float(np.median(valid)),
        "p5_pts_m2":            float(np.percentile(valid, 5)),
        "p95_pts_m2":           float(np.percentile(valid, 95)),
        "std_dev":              float(np.std(valid)),
        "min_pts_m2":           float(valid.min()),
        "max_pts_m2":           float(valid.max()),
        "coverage_pct":         float(len(valid) / total_cells * 100),
        "low_density_cells_pct": float(low_count / total_cells * 100),
        "passes_threshold":      float(np.mean(valid)) >= threshold,
    }
    log.info(
        "Density — mean: %.2f, p5: %.2f, p95: %.2f pts/m² | "
        "coverage: %.1f%% | passes %.1f threshold: %s",
        stats["mean_pts_m2"], stats["p5_pts_m2"], stats["p95_pts_m2"],
        stats["coverage_pct"], threshold, stats["passes_threshold"],
    )
    return stats


def export_density_geotiff(
    density_pts_m2: np.ndarray,
    bounds: tuple[float, float, float, float],
    cell_size: float,
    crs: pyproj.CRS,
    output_path: Path,
) -> None:
    """Write the density raster to a cloud-optimised GeoTIFF.

    Uses a north-up transform derived from the grid's top-left corner.
    NoData value is -9999.0 (empty cells).
    """
    x_min, y_min, _x_max, y_max = bounds
    transform = from_origin(x_min, y_max, cell_size, cell_size)

    # Flip vertically: row 0 in the array is y_min; GeoTIFF expects y_max at top
    flipped = np.flipud(density_pts_m2.copy())
    flipped[flipped == 0] = -9999.0

    with rasterio.open(
        output_path,
        mode="w",
        driver="GTiff",
        height=density_pts_m2.shape[0],
        width=density_pts_m2.shape[1],
        count=1,
        dtype="float32",
        crs=crs.to_wkt(),
        transform=transform,
        nodata=-9999.0,
        compress="deflate",
        tiled=True,
        blockxsize=256,
        blockysize=256,
    ) as dst:
        dst.write(flipped, 1)

    log.info("Density raster written to %s", output_path)


# ── Orchestrator ─────────────────────────────────────────────────────────────

def run_density_pipeline(
    input_path: Path,
    output_dir: Path,
    cell_size: float = 1.0,
    threshold: float = 8.0,
    chunk_size: int = 5_000_000,
) -> dict:
    """End-to-end density pipeline: validate → filter → bin → export.

    Returns:
        QA statistics dictionary; raises on CRS or empty-cloud errors.
    """
    output_dir.mkdir(parents=True, exist_ok=True)
    crs = validate_las_crs(input_path)

    raw_grid, bounds = compute_grid_density(
        input_path, cell_size=cell_size, chunk_size=chunk_size
    )
    density = normalize_density(raw_grid, cell_size)
    stats = generate_density_stats(density, threshold=threshold)

    geotiff_path = output_dir / (input_path.stem + "_density.tif")
    export_density_geotiff(density, bounds, cell_size, crs, geotiff_path)

    if not stats["passes_threshold"]:
        log.warning(
            "FAIL: mean density %.2f pts/m² is below project threshold %.2f pts/m²",
            stats["mean_pts_m2"], threshold,
        )

    return stats


if __name__ == "__main__":
    import json, sys
    result = run_density_pipeline(
        input_path=Path(sys.argv[1]),
        output_dir=Path(sys.argv[2]) if len(sys.argv) > 2 else Path("."),
        cell_size=float(sys.argv[3]) if len(sys.argv) > 3 else 1.0,
        threshold=float(sys.argv[4]) if len(sys.argv) > 4 else 8.0,
    )
    print(json.dumps(result, indent=2))
```

<svg viewBox="0 0 720 258" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Pulse density, point density and per-cell counts measured on the same patch" style="width:100%;max-width:720px;display:block;margin:1.6rem auto">
  <title>Three numbers that all get called density</title>
  <desc>The same patch of a multi-return tile measured three ways. Pulse density counts emitted pulses per square metre and is what the flight plan promised. Point density counts every return, so a canopy scene inflates it. Per-cell counts show how unevenly either is distributed, which is what actually decides the grid resolution you can support.</desc>
  <rect x="0" y="0" width="720" height="258" fill="var(--dg-bg)" rx="10"/>
  <rect x="24" y="52" width="216" height="130" rx="8" fill="var(--dg-surface)" stroke="var(--dg-line-soft)" stroke-width="1.2"/>
  <text x="132" y="42" text-anchor="middle" font-size="11.5" font-weight="600" fill="var(--dg-text)">pulse density</text>
  <circle cx="46" cy="78" r="3" fill="var(--dg-b)"/>
  <circle cx="98" cy="78" r="3" fill="var(--dg-b)"/>
  <circle cx="150" cy="78" r="3" fill="var(--dg-b)"/>
  <circle cx="202" cy="78" r="3" fill="var(--dg-b)"/>
  <circle cx="46" cy="108" r="3" fill="var(--dg-b)"/>
  <circle cx="98" cy="108" r="3" fill="var(--dg-b)"/>
  <circle cx="150" cy="108" r="3" fill="var(--dg-b)"/>
  <circle cx="202" cy="108" r="3" fill="var(--dg-b)"/>
  <circle cx="46" cy="138" r="3" fill="var(--dg-b)"/>
  <circle cx="98" cy="138" r="3" fill="var(--dg-b)"/>
  <circle cx="150" cy="138" r="3" fill="var(--dg-b)"/>
  <circle cx="202" cy="138" r="3" fill="var(--dg-b)"/>
  <circle cx="46" cy="168" r="3" fill="var(--dg-b)"/>
  <circle cx="98" cy="168" r="3" fill="var(--dg-b)"/>
  <circle cx="150" cy="168" r="3" fill="var(--dg-b)"/>
  <circle cx="202" cy="168" r="3" fill="var(--dg-b)"/>
  <text x="132" y="200" text-anchor="middle" font-size="12" font-weight="600" fill="var(--dg-c)">8.1 /m²</text>
  <text x="132" y="220" text-anchor="middle" font-size="10.5" fill="var(--dg-muted)">first returns only</text>
  <rect x="256" y="52" width="216" height="130" rx="8" fill="var(--dg-surface)" stroke="var(--dg-line-soft)" stroke-width="1.2"/>
  <text x="364" y="42" text-anchor="middle" font-size="11.5" font-weight="600" fill="var(--dg-text)">point density</text>
  <circle cx="278" cy="78" r="3" fill="var(--dg-b)"/>
  <circle cx="285" cy="86" r="2.4" fill="var(--dg-a)"/>
  <circle cx="330" cy="78" r="3" fill="var(--dg-b)"/>
  <circle cx="337" cy="86" r="2.4" fill="var(--dg-a)"/>
  <circle cx="344" cy="91" r="2.4" fill="var(--dg-a)"/>
  <circle cx="382" cy="78" r="3" fill="var(--dg-b)"/>
  <circle cx="389" cy="86" r="2.4" fill="var(--dg-a)"/>
  <circle cx="434" cy="78" r="3" fill="var(--dg-b)"/>
  <circle cx="441" cy="86" r="2.4" fill="var(--dg-a)"/>
  <circle cx="278" cy="108" r="3" fill="var(--dg-b)"/>
  <circle cx="330" cy="108" r="3" fill="var(--dg-b)"/>
  <circle cx="382" cy="108" r="3" fill="var(--dg-b)"/>
  <circle cx="389" cy="116" r="2.4" fill="var(--dg-a)"/>
  <circle cx="396" cy="121" r="2.4" fill="var(--dg-a)"/>
  <circle cx="434" cy="108" r="3" fill="var(--dg-b)"/>
  <circle cx="278" cy="138" r="3" fill="var(--dg-b)"/>
  <circle cx="285" cy="146" r="2.4" fill="var(--dg-a)"/>
  <circle cx="330" cy="138" r="3" fill="var(--dg-b)"/>
  <circle cx="337" cy="146" r="2.4" fill="var(--dg-a)"/>
  <circle cx="344" cy="151" r="2.4" fill="var(--dg-a)"/>
  <circle cx="382" cy="138" r="3" fill="var(--dg-b)"/>
  <circle cx="389" cy="146" r="2.4" fill="var(--dg-a)"/>
  <circle cx="434" cy="138" r="3" fill="var(--dg-b)"/>
  <circle cx="441" cy="146" r="2.4" fill="var(--dg-a)"/>
  <circle cx="448" cy="151" r="2.4" fill="var(--dg-a)"/>
  <circle cx="278" cy="168" r="3" fill="var(--dg-b)"/>
  <circle cx="330" cy="168" r="3" fill="var(--dg-b)"/>
  <circle cx="337" cy="176" r="2.4" fill="var(--dg-a)"/>
  <circle cx="382" cy="168" r="3" fill="var(--dg-b)"/>
  <circle cx="389" cy="176" r="2.4" fill="var(--dg-a)"/>
  <circle cx="396" cy="181" r="2.4" fill="var(--dg-a)"/>
  <circle cx="434" cy="168" r="3" fill="var(--dg-b)"/>
  <circle cx="441" cy="176" r="2.4" fill="var(--dg-a)"/>
  <circle cx="448" cy="181" r="2.4" fill="var(--dg-a)"/>
  <text x="364" y="200" text-anchor="middle" font-size="12" font-weight="600" fill="var(--dg-c)">19.4 /m²</text>
  <text x="364" y="220" text-anchor="middle" font-size="10.5" fill="var(--dg-muted)">every return</text>
  <rect x="488" y="52" width="216" height="130" rx="8" fill="var(--dg-surface)" stroke="var(--dg-line-soft)" stroke-width="1.2"/>
  <text x="596" y="42" text-anchor="middle" font-size="11.5" font-weight="600" fill="var(--dg-text)">per-cell count</text>
  <rect x="494" y="62" width="34" height="30" fill="var(--dg-c)" fill-opacity="0.1" stroke="var(--dg-line-soft)" stroke-width="0.7"/>
  <rect x="528" y="62" width="34" height="30" fill="var(--dg-c)" fill-opacity="0.58" stroke="var(--dg-line-soft)" stroke-width="0.7"/>
  <rect x="562" y="62" width="34" height="30" fill="var(--dg-c)" fill-opacity="0.26" stroke="var(--dg-line-soft)" stroke-width="0.7"/>
  <rect x="596" y="62" width="34" height="30" fill="var(--dg-c)" fill-opacity="0.58" stroke="var(--dg-line-soft)" stroke-width="0.7"/>
  <rect x="630" y="62" width="34" height="30" fill="var(--dg-c)" fill-opacity="0.58" stroke="var(--dg-line-soft)" stroke-width="0.7"/>
  <rect x="664" y="62" width="34" height="30" fill="var(--dg-c)" fill-opacity="0.26" stroke="var(--dg-line-soft)" stroke-width="0.7"/>
  <rect x="494" y="92" width="34" height="30" fill="var(--dg-c)" fill-opacity="0.26" stroke="var(--dg-line-soft)" stroke-width="0.7"/>
  <rect x="528" y="92" width="34" height="30" fill="var(--dg-c)" fill-opacity="0.26" stroke="var(--dg-line-soft)" stroke-width="0.7"/>
  <rect x="562" y="92" width="34" height="30" fill="var(--dg-c)" fill-opacity="0.1" stroke="var(--dg-line-soft)" stroke-width="0.7"/>
  <rect x="596" y="92" width="34" height="30" fill="var(--dg-c)" fill-opacity="0.1" stroke="var(--dg-line-soft)" stroke-width="0.7"/>
  <rect x="630" y="92" width="34" height="30" fill="var(--dg-c)" fill-opacity="0.26" stroke="var(--dg-line-soft)" stroke-width="0.7"/>
  <rect x="664" y="92" width="34" height="30" fill="var(--dg-c)" fill-opacity="0.74" stroke="var(--dg-line-soft)" stroke-width="0.7"/>
  <rect x="494" y="122" width="34" height="30" fill="var(--dg-c)" fill-opacity="0.74" stroke="var(--dg-line-soft)" stroke-width="0.7"/>
  <rect x="528" y="122" width="34" height="30" fill="var(--dg-c)" fill-opacity="0.1" stroke="var(--dg-line-soft)" stroke-width="0.7"/>
  <rect x="562" y="122" width="34" height="30" fill="var(--dg-c)" fill-opacity="0.58" stroke="var(--dg-line-soft)" stroke-width="0.7"/>
  <rect x="596" y="122" width="34" height="30" fill="var(--dg-c)" fill-opacity="0.1" stroke="var(--dg-line-soft)" stroke-width="0.7"/>
  <rect x="630" y="122" width="34" height="30" fill="var(--dg-c)" fill-opacity="0.42" stroke="var(--dg-line-soft)" stroke-width="0.7"/>
  <rect x="664" y="122" width="34" height="30" fill="var(--dg-c)" fill-opacity="0.26" stroke="var(--dg-line-soft)" stroke-width="0.7"/>
  <rect x="494" y="152" width="34" height="30" fill="var(--dg-c)" fill-opacity="0.26" stroke="var(--dg-line-soft)" stroke-width="0.7"/>
  <rect x="528" y="152" width="34" height="30" fill="var(--dg-c)" fill-opacity="0.58" stroke="var(--dg-line-soft)" stroke-width="0.7"/>
  <rect x="562" y="152" width="34" height="30" fill="var(--dg-c)" fill-opacity="0.1" stroke="var(--dg-line-soft)" stroke-width="0.7"/>
  <rect x="596" y="152" width="34" height="30" fill="var(--dg-c)" fill-opacity="0.42" stroke="var(--dg-line-soft)" stroke-width="0.7"/>
  <rect x="630" y="152" width="34" height="30" fill="var(--dg-c)" fill-opacity="0.26" stroke="var(--dg-line-soft)" stroke-width="0.7"/>
  <rect x="664" y="152" width="34" height="30" fill="var(--dg-c)" fill-opacity="0.58" stroke="var(--dg-line-soft)" stroke-width="0.7"/>
  <text x="596" y="200" text-anchor="middle" font-size="12" font-weight="600" fill="var(--dg-c)">0–34</text>
  <text x="596" y="220" text-anchor="middle" font-size="10.5" fill="var(--dg-muted)">the distribution</text>
  <text x="24" y="248" font-size="10.5" fill="var(--dg-muted)">a contract written in points per square metre and delivered over forest is met by the canopy, not by the ground</text>
</svg>

## Code Breakdown

**`validate_las_crs`** — reads the file header once without loading any point data, using `laspy.open()` in context-manager mode. `header.parse_crs()` inspects WKT2 and GeoTIFF-key VLRs in that order. Rejecting geographic CRS here prevents the most common silent-failure mode: density values that look plausible but are in degrees² rather than m².

**Two-pass chunked I/O** — the first pass reads only `x` and `y` (laspy decompresses only the requested dimensions for LAZ) and applies the classification mask. This keeps per-chunk RAM to roughly `chunk_size × 16 bytes` (two float64 arrays) regardless of how many extra dimensions the file carries. The `5_000_000` default uses about 80 MB per pass; halve it on memory-constrained systems. The second pass reuses the same iterator and accumulates into a pre-allocated `uint32` grid.

**`np.add.at`** — unlike `np.bincount` or histogram approaches, `np.add.at` handles duplicate `(row, col)` pairs correctly within a single chunk without sorting. The trade-off is O(N) time without vectorisation; for files with more than 500 M filtered points, switch to `scipy.ndimage.labeled_comprehension` or a Dask-backed accumulator.

**`export_density_geotiff`** — `np.flipud` reconciles the array-indexing convention (row 0 = y_min) with GeoTIFF's north-up convention (row 0 = y_max). Compression via Deflate and 256×256 tiling makes the output suitable for direct ingestion by QGIS, GDAL, and cloud raster services without post-processing.

**Classification mask** — excluding [ASPRS classification codes](https://www.pythonlidar.com/point-cloud-data-standards-fundamentals/asprs-classification-codes/) 7 (low noise), 12 (overlap), 18 (high noise), and 22 (withheld) before binning is the single most impactful step for accurate density reporting. Overlap returns (class 12) in particular double-count coverage at flight-line edges and can inflate mean density by 20–40% in multi-swath acquisitions.

## Parameter Reference Table

| Parameter | Type | Default | Valid Range | Effect |
|---|---|---|---|---|
| `cell_size` | `float` | `1.0` | `0.1` – `100.0` m | Smaller cells give finer spatial resolution but require more RAM for the grid array. At 0.25 m the grid is 16× larger than at 1.0 m. |
| `chunk_size` | `int` | `5_000_000` | `500_000` – `50_000_000` | Points per I/O read. Lower values reduce peak RAM; higher values improve throughput on NVMe. |
| `exclude_classes` | `frozenset[int]` | `{7, 12, 18, 22}` | Any ASPRS class codes | Noise and overlap classes must be excluded for accurate ground-truth density. Add class 2 (ground) to isolate canopy returns. |
| `threshold` | `float` | `8.0` pts/m² | Project-specific | The minimum acceptable mean density. ASPRS topographic accuracy QL1 requires ≥ 8 pts/m²; QL2 requires ≥ 2 pts/m². |
| `nodata` | `float` | `-9999.0` | Any finite float | Sentinel for empty cells in the GeoTIFF. Must match the value passed to `rasterio.open(nodata=...)`. |

## Validation and Data Integrity Checks

After running the pipeline, verify outputs with these assertions before accepting a dataset:

```python
import rasterio
import numpy as np

def validate_density_output(
    geotiff_path,
    stats: dict,
    min_coverage_pct: float = 90.0,
    max_low_density_pct: float = 5.0,
) -> None:
    """Assert that density outputs meet project acceptance criteria."""

    # 1. Raster is readable and has a valid CRS
    with rasterio.open(geotiff_path) as src:
        assert src.crs is not None, "GeoTIFF has no CRS"
        assert src.nodata == -9999.0, f"Unexpected nodata: {src.nodata}"
        data = src.read(1)

    # 2. Coverage: at least 90% of the survey area has returns
    valid_cells = data[data != -9999.0]
    coverage = len(valid_cells) / data.size * 100
    assert coverage >= min_coverage_pct, (
        f"Coverage {coverage:.1f}% < required {min_coverage_pct}%"
    )

    # 3. No negative density values (would indicate a count overflow)
    assert valid_cells.min() >= 0.0, "Negative density values detected"

    # 4. Mean density passes the project threshold
    assert stats["passes_threshold"], (
        f"Mean density {stats['mean_pts_m2']:.2f} pts/m² below threshold"
    )

    # 5. Low-density cells are within acceptable fraction
    assert stats["low_density_cells_pct"] <= max_low_density_pct, (
        f"Low-density cells {stats['low_density_cells_pct']:.1f}% "
        f"> allowed {max_low_density_pct}%"
    )

    print("All density validation checks passed.")
```

**Point count reconciliation** — compare the total count of binned points (sum of the raw `uint32` grid) against `laspy.open().header.point_count` minus excluded-class totals. A discrepancy of more than 0.1% indicates a bug in the classification mask logic or a corrupted file.

**CRS round-trip test** — after writing the GeoTIFF, re-open it with `rasterio` and assert that `src.crs.to_epsg()` matches the EPSG code extracted from the LAS file's VLR. CRS mismatch between the source point cloud and the density raster will silently misalign any overlay analysis. See [fixing CRS mismatches in point clouds](https://www.pythonlidar.com/point-cloud-data-standards-fundamentals/coordinate-reference-systems/fixing-crs-mismatches-in-point-clouds/) for remediation steps.

<svg viewBox="0 0 720 250" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="The finest DTM cell size each point density can support without voids" style="width:100%;max-width:720px;display:block;margin:1.6rem auto">
  <title>Density sets the finest grid you can honestly build</title>
  <desc>Supportable cell size against point density. At two points per square metre the finest defensible DTM is about two metres; at eight it is one metre; at thirty-two it is half a metre. The rule of thumb is roughly the square root of two over the square root of the density — build finer than that and the extra cells are interpolation, not measurement.</desc>
  <rect x="0" y="0" width="720" height="250" fill="var(--dg-bg)" rx="10"/>
  <rect x="90" y="56" width="86" height="140" rx="4" fill="var(--dg-a-soft)" stroke="var(--dg-a)" stroke-width="1.3"/>
  <text x="133" y="50" text-anchor="middle" font-size="11" font-weight="600" fill="var(--dg-c)">2.0 m</text>
  <text x="133" y="214" text-anchor="middle" font-size="11" fill="var(--dg-text)">2 pts/m²</text>
  <rect x="222" y="98" width="86" height="98" rx="4" fill="var(--dg-a-soft)" stroke="var(--dg-a)" stroke-width="1.3"/>
  <text x="265" y="92" text-anchor="middle" font-size="11" font-weight="600" fill="var(--dg-c)">1.4 m</text>
  <text x="265" y="214" text-anchor="middle" font-size="11" fill="var(--dg-text)">4</text>
  <rect x="354" y="126" width="86" height="70" rx="4" fill="var(--dg-a-soft)" stroke="var(--dg-a)" stroke-width="1.3"/>
  <text x="397" y="120" text-anchor="middle" font-size="11" font-weight="600" fill="var(--dg-c)">1.0 m</text>
  <text x="397" y="214" text-anchor="middle" font-size="11" fill="var(--dg-text)">8</text>
  <rect x="486" y="147" width="86" height="49" rx="4" fill="var(--dg-a-soft)" stroke="var(--dg-a)" stroke-width="1.3"/>
  <text x="529" y="141" text-anchor="middle" font-size="11" font-weight="600" fill="var(--dg-c)">0.7 m</text>
  <text x="529" y="214" text-anchor="middle" font-size="11" fill="var(--dg-text)">16</text>
  <rect x="618" y="161" width="86" height="35" rx="4" fill="var(--dg-a-soft)" stroke="var(--dg-a)" stroke-width="1.3"/>
  <text x="661" y="155" text-anchor="middle" font-size="11" font-weight="600" fill="var(--dg-c)">0.5 m</text>
  <text x="661" y="214" text-anchor="middle" font-size="11" fill="var(--dg-text)">32</text>
  <line x1="80" y1="196" x2="700" y2="196" stroke="var(--dg-line)" stroke-width="1.5"/>
  <text x="80" y="40" font-size="10.5" fill="var(--dg-muted)">finest DTM cell size supportable without systematic voids</text>
  <text x="80" y="240" font-size="10.5" fill="var(--dg-muted)">ground density, not total point density — under canopy the two differ tenfold, and only the first builds terrain</text>
</svg>

## Performance Tuning

| Scenario | Bottleneck | Remedy |
|---|---|---|
| LAZ file, 10 GB | Decompression CPU-bound | Use `laspy.LasAppender` or PDAL `readers.las` with `threads=4` for parallel decompression |
| Very fine cell (0.1 m), large tile | Grid array too large for RAM | Switch to Dask: `da.zeros((rows, cols), chunks=(1000,1000))` |
| Many small files in a batch | Per-file open overhead dominates | Pre-sort files spatially and use `concurrent.futures.ThreadPoolExecutor` |
| Iterative development on large file | Slow re-read on each run | Cache the raw `uint32` grid to `.npy` after pass 2; reload for stats re-runs |
| OOM on second pass | `chunk_size` too large | Halve `chunk_size`; monitor with `tracemalloc` |

For datasets over 50 GB or in cloud object storage (S3/GCS), replace `laspy` with a PDAL pipeline using `readers.las` → `filters.stats` → `writers.null`. PDAL's `filters.stats` computes density metadata natively and streams results back to Python via `pipeline.metadata`.

## Common Errors and Troubleshooting

**`ValueError: No VLRs found. CRS metadata is missing.`**
The file was exported without a coordinate system. Use `laspy` to add a WKT2 CRS VLR, or run `pdal translate input.las output.las --writers.las.a_srs="EPSG:32632"` to embed the projection before re-running.

**`ValueError: Geographic CRS detected.`**
The file is stored in geographic coordinates (degrees). Apply a [spatial reprojection](https://www.pythonlidar.com/pdal-pipeline-architecture-execution/spatial-reprojection/) stage to convert to a projected metric system before density computation. Using `pyproj.Transformer` directly on the coordinate arrays is an alternative for pure-Python workflows.

**`RuntimeError: No valid points remain after classification filtering.`**
Every point in the file matches an excluded class. Inspect the file's actual class distribution with `laspy.read(path).classification.value_counts()` (laspy 2.4+) and adjust `EXCLUDE_CLASSES` accordingly. A common cause is receiving a file where all points are still class 0 (Created, never classified).

**Density grid shows striping artifacts**
Systematic low-density bands across the tile indicate flight-line gaps or missed overlap. Run a spatial autocorrelation check with `scipy.stats.spearmanr` on row-level density means to confirm systematic vs. random variation. If striping correlates with scan-angle, the acquisition vendor needs to refly.

**`np.add.at` is extremely slow on large chunks**
`np.add.at` disables NumPy's internal buffering for safety. When handling duplicate indices, consider splitting the chunk into sub-batches and using `np.bincount` with `minlength=rows*cols` on linearised indices: `flat_idx = row_idx * cols + col_idx; counts = np.bincount(flat_idx, minlength=rows*cols).reshape(rows, cols)`. This is 5–20× faster on large chunks.

**GeoTIFF shows no-data stripes on the northern edge**
This typically means `y_max` was derived from the raw chunk maximum, which may be slightly below the true tile boundary due to point sampling. Add a 0.5 × `cell_size` buffer to `y_max` before computing `rows` and the raster transform.

---

## Related

- [Calculating Point Density for Drone Surveys](https://www.pythonlidar.com/point-cloud-data-standards-fundamentals/point-density-metrics/calculating-point-density-for-drone-surveys/) — UAV-specific overlap requirements and empirical density cross-referencing
- [LAS/LAZ File Structure](https://www.pythonlidar.com/point-cloud-data-standards-fundamentals/laslaz-file-structure/) — how point records, VLRs, and header fields organize the data this workflow reads
- [ASPRS Classification Codes](https://www.pythonlidar.com/point-cloud-data-standards-fundamentals/asprs-classification-codes/) — the full class taxonomy driving the noise-exclusion masks above
- [Coordinate Reference Systems](https://www.pythonlidar.com/point-cloud-data-standards-fundamentals/coordinate-reference-systems/) — CRS validation, reprojection strategies, and fixing projection mismatches
- [Metadata & Header Synchronization](https://www.pythonlidar.com/point-cloud-data-standards-fundamentals/metadata-header-sync/) — updating LAS VLRs with empirical density values after pipeline completion
