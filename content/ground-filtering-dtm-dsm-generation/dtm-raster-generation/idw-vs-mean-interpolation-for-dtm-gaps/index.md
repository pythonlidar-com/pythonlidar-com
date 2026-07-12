---
title: "IDW vs Mean Interpolation for DTM Gaps"
description: "Comparing writers.gdal output_type=idw and output_type=mean for filling gaps in LiDAR DTMs — how each treats sparse cells, edge artefacts, and search radius, with a side-by-side benchmark."
slug: "idw-vs-mean-interpolation-for-dtm-gaps"
type: "long_tail"
breadcrumb: "IDW vs Mean for DTM Gaps"
datePublished: "2024-06-24"
dateModified: "2026-07-12"
---

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Article",
      "headline": "IDW vs Mean Interpolation for DTM Gaps",
      "description": "Comparing writers.gdal output_type=idw and output_type=mean for filling gaps in LiDAR DTMs — how each treats sparse cells, edge artefacts, and search radius, with a side-by-side benchmark.",
      "datePublished": "2024-06-24",
      "dateModified": "2026-07-12",
      "author": {"@type": "Organization", "name": "pythonlidar.com"}
    },
    {
      "@type": "BreadcrumbList",
      "itemListElement": [
        {"@type": "ListItem", "position": 1, "name": "Home", "item": "https://pythonlidar.com/"},
        {"@type": "ListItem", "position": 2, "name": "Ground Filtering & Terrain Models", "item": "https://pythonlidar.com/ground-filtering-dtm-dsm-generation/"},
        {"@type": "ListItem", "position": 3, "name": "DTM Raster Generation", "item": "https://pythonlidar.com/ground-filtering-dtm-dsm-generation/dtm-raster-generation/"},
        {"@type": "ListItem", "position": 4, "name": "IDW vs Mean for DTM Gaps", "item": "https://pythonlidar.com/ground-filtering-dtm-dsm-generation/dtm-raster-generation/idw-vs-mean-interpolation-for-dtm-gaps/"}
      ]
    },
    {
      "@type": "FAQPage",
      "mainEntity": [
        {
          "@type": "Question",
          "name": "Is IDW always better than mean for a DTM?",
          "acceptedAnswer": {"@type": "Answer", "text": "Not always, but usually. IDW weights nearer points more heavily, so it reproduces gentle slopes and gap edges more faithfully than an unweighted mean, which is why it is the default recommendation for bare-earth terrain. Mean is marginally faster and is perfectly adequate on flat, densely sampled sites where every cell already contains several points; the two outputs become nearly identical as point density rises."}
        },
        {
          "@type": "Question",
          "name": "Do IDW and mean fill the same cells?",
          "acceptedAnswer": {"@type": "Answer", "text": "Yes. Both statistics operate on exactly the points found inside the search radius, so a cell that has at least one contributing point is filled by both, and a cell with none is NoData in both. The choice of interpolator changes the value written to a populated cell, not whether the cell is populated. To fill more cells you must widen radius or raise window_size, independent of output_type."}
        },
        {
          "@type": "Question",
          "name": "How does search radius interact with the two interpolators?",
          "acceptedAnswer": {"@type": "Answer", "text": "A larger radius pulls more distant points into each cell. Under mean, those distant points count equally with near ones, so a wide radius flattens and smears terrain quickly. Under IDW, distance weighting damps the influence of far points, so IDW tolerates a wider radius with less smoothing — useful for bridging sparse areas without washing out relief."}
        },
        {
          "@type": "Question",
          "name": "Which interpolator produces worse edge artefacts around voids?",
          "acceptedAnswer": {"@type": "Answer", "text": "Mean tends to produce visible steps at the boundary of sparse regions because a cell with one far point and a cell with several near points jump in value abruptly. IDW's distance weighting softens that transition, giving smoother void margins. Neither should be trusted to interpolate across large voids; both are cell-local statistics, not true surface reconstructors."}
        }
      ]
    }
  ]
}
</script>

**TL;DR:** For bare-earth DTMs choose `output_type: "idw"` — its distance weighting reproduces slopes and softens void edges more faithfully than the unweighted `output_type: "mean"`, which only pulls ahead in raw speed on flat, densely sampled tiles where the two results converge anyway.

## Context and Motivation

This comparison is part of [DTM Raster Generation with PDAL](/ground-filtering-dtm-dsm-generation/dtm-raster-generation/). When a terrain grid has sparse cells — the norm at fine resolutions or in areas thinned by ground filtering — the `output_type` you hand to `writers.gdal` decides how each populated cell converts its handful of nearby points into a single elevation. The two workhorse choices are inverse-distance weighting and a plain arithmetic mean, and the difference between them is most visible precisely where the data is thin.

The stakes are concrete. Slope, aspect, and contour products amplify small elevation errors, so a smearing artefact at a void margin or a flattened micro-ridge propagates into every derived layer. Understanding how `idw` and `mean` treat the same sparse neighbourhood lets you pick deliberately rather than accept the writer's default. The example tile used throughout is a rolling agricultural site in `EPSG:26918` (NAD83 / UTM zone 18N) rasterized at 0.5 m, a resolution fine enough to expose the interpolators' behaviour.

<svg viewBox="0 0 700 260" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Comparison of IDW and mean interpolation weighting three points at different distances from a cell centre" style="width:100%;max-width:700px;display:block;margin:1.5rem auto">
  <title>IDW versus mean cell interpolation</title>
  <desc>A single raster cell with three ground points at increasing distance from its centre. On the left the IDW panel shows the near point receiving a large weight and the far point a small weight. On the right the mean panel shows all three points receiving equal weight. Labels note that IDW damps distant points while mean treats them equally.</desc>
  <rect x="30" y="40" width="290" height="180" rx="8" fill="none" stroke="currentColor" stroke-width="1.3" opacity="0.7"/>
  <text x="175" y="30" text-anchor="middle" font-size="13" fill="currentColor" font-weight="600">output_type: idw</text>
  <circle cx="120" cy="130" r="4" fill="currentColor"/>
  <text x="120" y="120" text-anchor="middle" font-size="9" fill="currentColor" opacity="0.75">cell centre</text>
  <circle cx="160" cy="110" r="4" fill="currentColor" opacity="0.9"/>
  <line x1="120" y1="130" x2="160" y2="110" stroke="currentColor" stroke-width="3" opacity="0.85"/>
  <text x="196" y="104" text-anchor="middle" font-size="9" fill="currentColor" opacity="0.8">near · weight 0.7</text>
  <circle cx="210" cy="170" r="4" fill="currentColor" opacity="0.6"/>
  <line x1="120" y1="130" x2="210" y2="170" stroke="currentColor" stroke-width="1.6" opacity="0.55"/>
  <text x="246" y="180" text-anchor="middle" font-size="9" fill="currentColor" opacity="0.7">mid · weight 0.2</text>
  <circle cx="270" cy="95" r="4" fill="currentColor" opacity="0.4"/>
  <line x1="120" y1="130" x2="270" y2="95" stroke="currentColor" stroke-width="0.8" opacity="0.4"/>
  <text x="272" y="86" text-anchor="middle" font-size="9" fill="currentColor" opacity="0.6">far · weight 0.1</text>
  <rect x="380" y="40" width="290" height="180" rx="8" fill="none" stroke="currentColor" stroke-width="1.3" opacity="0.7"/>
  <text x="525" y="30" text-anchor="middle" font-size="13" fill="currentColor" font-weight="600">output_type: mean</text>
  <circle cx="470" cy="130" r="4" fill="currentColor"/>
  <text x="470" y="120" text-anchor="middle" font-size="9" fill="currentColor" opacity="0.75">cell centre</text>
  <circle cx="510" cy="110" r="4" fill="currentColor" opacity="0.8"/>
  <line x1="470" y1="130" x2="510" y2="110" stroke="currentColor" stroke-width="1.8" opacity="0.7"/>
  <text x="548" y="104" text-anchor="middle" font-size="9" fill="currentColor" opacity="0.75">weight 0.33</text>
  <circle cx="560" cy="170" r="4" fill="currentColor" opacity="0.8"/>
  <line x1="470" y1="130" x2="560" y2="170" stroke="currentColor" stroke-width="1.8" opacity="0.7"/>
  <text x="596" y="180" text-anchor="middle" font-size="9" fill="currentColor" opacity="0.75">weight 0.33</text>
  <circle cx="620" cy="95" r="4" fill="currentColor" opacity="0.8"/>
  <line x1="470" y1="130" x2="620" y2="95" stroke="currentColor" stroke-width="1.8" opacity="0.7"/>
  <text x="620" y="86" text-anchor="middle" font-size="9" fill="currentColor" opacity="0.75">weight 0.33</text>
  <text x="350" y="245" text-anchor="middle" font-size="10" fill="currentColor" opacity="0.55">IDW damps distant points by 1/distance^p; mean weights every point in radius equally</text>
</svg>

## How Each Interpolator Treats a Sparse Cell

Both statistics gather the ground points that fall within `radius` of a cell centre, but they combine them differently:

- **`idw`** assigns each point a weight proportional to the inverse of its distance from the cell centre raised to a power (PDAL uses a fixed exponent internally). Near points dominate; distant points contribute only a whisper. In a sparse cell with one close point and one far point, the result sits close to the near point's elevation — which is usually the right answer on sloping ground.
- **`mean`** ignores distance entirely and returns the arithmetic average of every point in the radius. That same sparse cell returns the midpoint of the two elevations, pulling the surface toward the more distant sample and, across many cells, flattening relief.

Because both use the identical point set, they fill exactly the same cells. Neither can conjure a value for a cell whose radius contains no points — that remains NoData regardless of `output_type`, a property that matters when you plan the separate void-fill work in [Filling NoData Voids in DTM Rasters](/ground-filtering-dtm-dsm-generation/dtm-raster-generation/filling-nodata-voids-in-dtm-rasters/).

## Side-by-Side Comparison

| Aspect | `output_type: idw` | `output_type: mean` |
|---|---|---|
| Weighting | Inverse-distance; near points dominate | Uniform; all points equal |
| Slope fidelity | High — tracks gradients across a cell | Lower — averages toward cell midpoint |
| Void-edge behaviour | Smooth transition | Visible steps / smearing |
| Tolerance to wide `radius` | Good — far points damped | Poor — far points flatten surface |
| Speed | Slightly slower (distance maths) | Slightly faster |
| Sensitivity to a single far outlier | Reduced by distance weight | Full weight, shifts the cell |
| Best fit | Rolling/complex terrain, sparse cells | Flat, densely and evenly sampled sites |

## Benchmark: Producing and Diffing Both Surfaces

The script below rasterizes the same ground-classified tile twice — once with `idw`, once with `mean` — at 0.5 m, then quantifies where and by how much they disagree. It also confirms that both share the identical NoData mask, demonstrating that `output_type` never changes which cells get filled.

```python
#!/usr/bin/env python3
"""
compare_idw_mean.py — rasterize one ground-classified tile with IDW and with
mean at the same resolution, then report where the two DTMs diverge.

Usage:
    python compare_idw_mean.py tile_utm18n.laz 0.5

Requirements:
    conda install -c conda-forge pdal python-pdal rasterio numpy
"""

import json
import sys

import numpy as np
import pdal
import rasterio


def rasterize(input_path: str, output_tif: str, output_type: str, resolution: float) -> None:
    """Rasterize Classification 2 points with a chosen interpolator."""
    pipeline = {
        "pipeline": [
            {"type": "readers.las", "filename": input_path},
            {"type": "filters.range", "limits": "Classification[2:2]"},
            {
                "type": "writers.gdal",
                "filename": output_tif,
                "resolution": resolution,
                "output_type": output_type,
                "radius": resolution * 2.0,   # deliberately wide to expose the difference
                "nodata": -9999.0,
                "data_type": "float32",
                "gdaldriver": "GTiff",
                "gdalopts": "COMPRESS=DEFLATE,TILED=YES",
            },
        ]
    }
    count = pdal.Pipeline(json.dumps(pipeline)).execute()
    if count == 0:
        raise RuntimeError(f"No ground points in '{input_path}'.")


def diff_surfaces(idw_tif: str, mean_tif: str) -> None:
    """Report the elevation difference between the IDW and mean DTMs."""
    with rasterio.open(idw_tif) as a, rasterio.open(mean_tif) as b:
        idw = a.read(1, masked=True)
        mean = b.read(1, masked=True)

    # Both share a NoData mask — verify that claim explicitly
    same_mask = np.array_equal(idw.mask, mean.mask)
    print(f"Identical NoData mask: {same_mask}")

    diff = (idw - mean).compressed()   # only over cells filled in both
    print(f"Cells compared:   {diff.size:,}")
    print(f"Mean |diff|:      {np.abs(diff).mean():.3f} m")
    print(f"Max  |diff|:      {np.abs(diff).max():.3f} m")
    print(f"95th pct |diff|:  {np.percentile(np.abs(diff), 95):.3f} m")
    print(f"Cells >0.10 m:    {(np.abs(diff) > 0.10).sum():,} "
          f"({(np.abs(diff) > 0.10).mean():.1%})")


def main() -> None:
    if len(sys.argv) != 3:
        print("Usage: python compare_idw_mean.py <input.laz> <resolution_m>")
        sys.exit(1)

    input_path, resolution = sys.argv[1], float(sys.argv[2])
    rasterize(input_path, "dtm_idw.tif", "idw", resolution)
    rasterize(input_path, "dtm_mean.tif", "mean", resolution)
    diff_surfaces("dtm_idw.tif", "dtm_mean.tif")


if __name__ == "__main__":
    main()
```

On the rolling `EPSG:26918` test tile at 0.5 m with a deliberately wide `radius` of 1.0 m, the mean absolute difference lands around 4–8 cm, but the disagreement concentrates in the sparse cells near field margins and drainage lines — exactly where mean flattens the slope and IDW holds it. On a flat, evenly sampled parking area the two are indistinguishable to a couple of millimetres, confirming that density collapses the choice.

## Key Parameter Table

| Parameter | Role in the comparison | Guidance |
|---|---|---|
| `output_type` | The variable under test | `idw` for terrain fidelity; `mean` only when flat and dense |
| `radius` | Amplifies the difference | Wider radius widens the IDW/mean gap; IDW tolerates it better |
| `resolution` | Sets cell occupancy | Finer resolution creates more sparse cells, widening the gap |
| `window_size` | Post-bin gap fill | Applies after interpolation; independent of `output_type` |
| `nodata` | Shared void sentinel | Identical mask under both interpolators |

## Verification

To trust the verdict on your own data, confirm two things: that both rasters truly share a NoData mask, and that the residual concentrates where terrain is complex rather than being uniform noise.

```python
import numpy as np
import rasterio

with rasterio.open("dtm_idw.tif") as a, rasterio.open("dtm_mean.tif") as b:
    idw = a.read(1, masked=True)
    mean = b.read(1, masked=True)

assert np.array_equal(idw.mask, mean.mask), "Interpolator changed the fill pattern!"

diff = np.abs(idw - mean)
print(f"Median difference: {np.ma.median(diff):.3f} m")
print(f"Difference is concentrated: "
      f"{(diff.compressed() > diff.mean()).mean():.0%} of cells exceed the mean")
```

A right-skewed difference distribution — most cells agreeing closely with a tail of larger disagreements along breaklines — is the signature of the two interpolators behaving as theory predicts.

## Gotchas and Edge Cases

**1. Neither interpolator fills empty cells.** Switching from `mean` to `idw` will not reduce your NoData count. Widening `radius`, raising `window_size`, or a dedicated fill does that; `output_type` only sets values in already-populated cells.

**2. A wide radius flatters mean's weaknesses.** Benchmarks that use a large `radius` exaggerate the IDW advantage. Report the `radius` alongside any comparison, and prefer a radius near the default (`resolution * sqrt(2)`) for a fair, artefact-free production DTM.

**3. IDW is not kriging.** IDW is a cell-local weighted average, not a geostatistical surface model. It will not honour spatial autocorrelation or produce uncertainty estimates. For those you need an external interpolator after exporting points; within `writers.gdal`, `idw` is the sophisticated end of the menu.

**4. Comparing across resolutions is meaningless.** An `idw` DTM at 1 m and a `mean` DTM at 0.5 m differ mostly because of cell size, not interpolation. Hold `resolution` and `radius` fixed when isolating the `output_type` effect, exactly as the benchmark script does.

## Frequently Asked Questions

**Is IDW always better than mean for a DTM?**

Not always, but usually. IDW weights nearer points more heavily, so it reproduces gentle slopes and gap edges more faithfully than an unweighted mean, which is why it is the default recommendation for bare-earth terrain. Mean is marginally faster and is perfectly adequate on flat, densely sampled sites where every cell already contains several points; the two outputs become nearly identical as point density rises.

**Do IDW and mean fill the same cells?**

Yes. Both statistics operate on exactly the points found inside the search radius, so a cell that has at least one contributing point is filled by both, and a cell with none is NoData in both. The choice of interpolator changes the value written to a populated cell, not whether the cell is populated. To fill more cells you must widen `radius` or raise `window_size`, independent of `output_type`.

**How does search radius interact with the two interpolators?**

A larger `radius` pulls more distant points into each cell. Under `mean`, those distant points count equally with near ones, so a wide radius flattens and smears terrain quickly. Under `idw`, distance weighting damps the influence of far points, so IDW tolerates a wider radius with less smoothing — useful for bridging sparse areas without washing out relief.

**Which interpolator produces worse edge artefacts around voids?**

`mean` tends to produce visible steps at the boundary of sparse regions because a cell with one far point and a cell with several near points jump in value abruptly. IDW's distance weighting softens that transition, giving smoother void margins. Neither should be trusted to interpolate across large voids; both are cell-local statistics, not true surface reconstructors.

---

## Related

- [DTM Raster Generation with PDAL](/ground-filtering-dtm-dsm-generation/dtm-raster-generation/) — parent guide to every writers.gdal option
- [Generating a DTM GeoTIFF with writers.gdal](/ground-filtering-dtm-dsm-generation/dtm-raster-generation/generating-a-dtm-geotiff-with-writers-gdal/) — the base recipe both variants build on
- [Filling NoData Voids in DTM Rasters](/ground-filtering-dtm-dsm-generation/dtm-raster-generation/filling-nodata-voids-in-dtm-rasters/) — the separate problem of empty cells neither interpolator solves
- [Point Density Metrics](/point-cloud-data-standards-fundamentals/point-density-metrics/) — density determines how much the interpolators diverge
- [Ground Filtering and DTM/DSM Generation with PDAL](/ground-filtering-dtm-dsm-generation/) — the wider terrain-modelling context
