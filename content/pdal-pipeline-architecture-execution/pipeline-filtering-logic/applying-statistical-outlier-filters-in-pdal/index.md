# Applying Statistical Outlier Filters in PDAL

Applying Statistical Outlier Filters in PDAL is accomplished by inserting the `filters.statistical` stage into your processing pipeline. This stage removes isolated noise points—such as atmospheric scatter, bird strikes, or multipath reflections—by calculating the mean distance to each point’s *k* nearest neighbors and discarding those exceeding a configurable standard deviation threshold. In Python workflows, you define filter parameters in a JSON-compatible dictionary, instantiate `pdal.Pipeline`, and execute it to return cleaned point cloud arrays or write directly to disk. The operation runs in-memory by default, making it highly efficient for datasets under ~50 million points, though regional-scale airborne surveys require explicit chunking or tiling strategies to prevent memory exhaustion.

## Algorithm Mechanics & Parameter Tuning

The statistical outlier removal (SOR) routine relies on a k-d tree neighborhood search. For every point in the cloud, PDAL computes the Euclidean distance to its `mean_k` nearest neighbors, averages those distances, and compares the result against the global mean plus `multiplier` × standard deviation. Points falling outside this envelope are flagged and removed. Unlike fixed-radius filters, SOR adapts to local density variations, which is critical when processing mixed-resolution LiDAR across overlapping flight lines or urban-to-rural transitions.

| Parameter | Type | Recommended Range | Effect |
|---|---|---|---|
| `mean_k` | `int` | `10`–`30` (airborne), `30`–`60` (terrestrial/mobile) | Controls neighborhood size. Too low amplifies local noise; too high smooths legitimate edges. |
| `multiplier` | `float` | `2.0`–`3.0` | Sigma threshold. `<1.5` aggressively prunes vegetation/power lines; `>4.0` rarely removes meaningful noise. |
| `remove` | `bool` | `true` (default) | When `true`, flagged points are discarded. Set to `false` to output a classification mask instead. |

Improper tuning can strip legitimate sparse features. Always validate results against a small subset before scaling to full project extents.

## Pipeline Placement & Architecture

When designing your [PDAL Pipeline Architecture & Execution](/pdal-pipeline-architecture-execution/) strategy, place the statistical filter immediately after coordinate reference system (CRS) assignment and before ground classification or rasterization. Running SOR on raw, unclassified LAS/LAZ data prevents outlier points from skewing triangulated irregular networks (TINs), height normalization, or feature extraction routines. For deeper context on stage sequencing and dependency mapping, review the [Pipeline Filtering Logic](/pdal-pipeline-architecture-execution/pipeline-filtering-logic/) documentation. 

Always validate filter order: applying SOR *after* classification can inadvertently remove valid sparse classes (e.g., transmission towers, isolated trees, or low-lying infrastructure). If your workflow requires preserving classified points, run SOR on a pre-classified subset or use the `remove: false` flag to generate a binary mask for manual review.

## Python Implementation

The following production-ready workflow demonstrates how to apply the filter, validate the pipeline, extract execution metadata, and optionally return in-memory arrays. It uses the official `pdal` Python bindings and follows modern error-handling practices.

```python
import pdal
import numpy as np
import sys
from typing import Optional, Dict, Any

def apply_statistical_filter(
    input_path: str,
    output_path: Optional[str] = None,
    mean_k: int = 20,
    multiplier: float = 3.0
) -> Dict[str, Any]:
    """
    Applies PDAL's statistical outlier filter to a point cloud.
    Returns pipeline execution metadata and optionally writes to disk.
    """
    pipeline_dict = [
        {
            "type": "readers.las",
            "filename": input_path
        },
        {
            "type": "filters.statistical",
            "mean_k": mean_k,
            "multiplier": multiplier,
            "remove": True
        }
    ]

    # Append writer only if output path is provided
    if output_path:
        pipeline_dict.append({
            "type": "writers.las",
            "filename": output_path,
            "forward": "all"
        })

    pipeline = pdal.Pipeline(pipeline_dict)

    try:
        count = pipeline.execute()
        metadata = pipeline.metadata

        # Safely extract filter statistics
        stats = metadata.get("metadata", {}).get("filters.statistical", {}).get("Stats", {})
        removed = stats.get("count_removed", 0)
        kept = stats.get("count_kept", count)

        print(f"Processed {count} points. Removed {removed} outliers ({(removed/count)*100:.2f}%).")

        return metadata

    except RuntimeError as e:
        print(f"Pipeline execution failed: {e}", file=sys.stderr)
        sys.exit(1)

def get_cleaned_array(input_path: str, mean_k: int = 20, multiplier: float = 3.0) -> np.ndarray:
    """Returns filtered point cloud as a NumPy array for in-memory processing."""
    pipeline_dict = [
        {"type": "readers.las", "filename": input_path},
        {"type": "filters.statistical", "mean_k": mean_k, "multiplier": multiplier, "remove": True},
        {"type": "filters.array", "array": "output"}
    ]
    pipeline = pdal.Pipeline(pipeline_dict)
    pipeline.execute()
    return pipeline.arrays[0]

if __name__ == "__main__":
    apply_statistical_filter("input_raw.laz", "output_clean.laz", mean_k=20, multiplier=3.0)
```

### Key Implementation Notes
- **Metadata Extraction:** The `pipeline.metadata` dictionary contains execution stats. Always verify `count_removed` ratios before committing to downstream processing.
- **Forwarding Attributes:** The `"forward": "all"` directive preserves original point attributes (intensity, return number, classification) that aren't modified by the filter.
- **In-Memory Arrays:** Use `filters.array` or `pipeline.arrays` when integrating with `numpy`, `scipy`, or `open3d` for custom analysis without intermediate disk I/O.

## Memory Management & Scaling

The `filters.statistical` stage builds an in-memory k-d tree for neighborhood queries. While highly optimized, memory consumption scales non-linearly with point count. For datasets exceeding ~50 million points, consider:
- **Tiling/Chunking:** Use `filters.splitter` or external tiling tools (e.g., `entwine`) to process manageable blocks in parallel.
- **Streaming Execution:** PDAL supports streaming via CLI (`pdal --stream`), though Python bindings require explicit pipeline segmentation or generator-based chunking.
- **Hardware Allocation:** Ensure sufficient RAM (typically 16–32 GB for 100M+ points) and disable system swap to prevent k-d tree construction bottlenecks. Monitor peak usage with `psutil` or `tracemalloc` during development.

## Validation & Quality Control

After filtering, always cross-check results against known ground truth or visual inspection in a point cloud viewer (e.g., CloudCompare, QGIS, or PDAL's `pdal info --stats`). Common issues include:
- **Over-filtering:** Reduce `multiplier` or increase `mean_k` if legitimate sparse features disappear.
- **Under-filtering:** Lower `multiplier` to `2.0` or verify that input data isn't already pre-filtered by the sensor manufacturer.
- **Boundary Artifacts:** SOR struggles at tile edges due to truncated neighbor searches. Apply a 5–10 meter overlap buffer during tiling, or use `filters.hexbin` for density-aware preprocessing.

For official parameter documentation, version-specific behavior, and advanced stage configurations, consult the [PDAL `filters.statistical` reference](https://pdal.io/en/stable/stages/filters.html). The [ASPRS LAS specification](https://github.com/ASPRSorg/LAS) also outlines standard point record formats that influence how PDAL reads, filters, and writes attributes. When integrating with Python GIS stacks, verify compatibility using the official [pdal package on PyPI](https://pypi.org/project/pdal/).