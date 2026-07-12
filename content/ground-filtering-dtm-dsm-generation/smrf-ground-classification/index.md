---
title: "SMRF Ground Classification in PDAL"
description: "How the Simple Morphological Filter (filters.smrf) classifies ground returns in PDAL — the scalar/slope/window/threshold parameters, a runnable Python workflow, validation of ground fraction, and troubleshooting over-/under-classification."
slug: "smrf-ground-classification"
type: "topic"
breadcrumb: "SMRF Ground Classification"
datePublished: "2024-06-18"
dateModified: "2026-07-12"
---

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Article",
      "headline": "SMRF Ground Classification in PDAL",
      "description": "How the Simple Morphological Filter (filters.smrf) classifies ground returns in PDAL — the scalar/slope/window/threshold parameters, a runnable Python workflow, validation of ground fraction, and troubleshooting over-/under-classification.",
      "datePublished": "2024-06-18",
      "dateModified": "2026-07-12",
      "author": {"@type": "Organization", "name": "pythonlidar.com"}
    },
    {
      "@type": "BreadcrumbList",
      "itemListElement": [
        {"@type": "ListItem", "position": 1, "name": "Home", "item": "https://www.pythonlidar.com/"},
        {"@type": "ListItem", "position": 2, "name": "Ground Filtering and DTM/DSM Generation with PDAL", "item": "https://www.pythonlidar.com/ground-filtering-dtm-dsm-generation/"},
        {"@type": "ListItem", "position": 3, "name": "SMRF Ground Classification", "item": "https://www.pythonlidar.com/ground-filtering-dtm-dsm-generation/smrf-ground-classification/"}
      ]
    },
    {
      "@type": "HowTo",
      "name": "Classify ground returns with filters.smrf in PDAL",
      "step": [
        {"@type": "HowToStep", "name": "Read the source point cloud", "text": "Declare readers.las with the correct spatialreference so the morphological surface is built in metric units."},
        {"@type": "HowToStep", "name": "Remove gross noise first", "text": "Insert filters.outlier before SMRF so low noise points do not anchor the minimum-elevation surface."},
        {"@type": "HowToStep", "name": "Run filters.smrf", "text": "Set scalar, slope, window, threshold, and cell to match terrain and point density, and let SMRF write Classification code 2 for ground."},
        {"@type": "HowToStep", "name": "Validate the ground fraction", "text": "Count points with Classification == 2 and confirm the ground fraction falls in a plausible 20 to 60 percent band."},
        {"@type": "HowToStep", "name": "Write labelled output", "text": "Serialise with writers.las using forward: all so the new Classification codes and every source dimension are preserved."}
      ]
    },
    {
      "@type": "FAQPage",
      "mainEntity": [
        {
          "@type": "Question",
          "name": "What ASPRS classification code does filters.smrf assign to ground?",
          "acceptedAnswer": {"@type": "Answer", "text": "SMRF writes ASPRS Classification code 2 (Ground) to every point it accepts as bare earth and leaves all other points at code 1 (Unassigned) unless they already carried a class. It never touches codes such as 7 (Noise) that an upstream filter set, so run outlier removal before SMRF to keep those labels intact."}
        },
        {
          "@type": "Question",
          "name": "What does the SMRF scalar parameter actually control?",
          "acceptedAnswer": {"@type": "Answer", "text": "The scalar multiplies the elevation threshold as a function of local slope, letting SMRF tolerate more vertical deviation on steep cells than on flat ones. Raising scalar keeps more points on rugged terrain but risks admitting low vegetation; lowering it tightens the surface and can carve valid ground out of slopes."}
        },
        {
          "@type": "Question",
          "name": "How large should the SMRF window be?",
          "acceptedAnswer": {"@type": "Answer", "text": "The window is the maximum diameter of a non-ground object SMRF can remove, so set it slightly larger than the widest building or tree cluster in the scene. A default of 18 m suits mixed suburban terrain; open fields tolerate smaller windows while dense forest or large industrial roofs need 30 m or more."}
        },
        {
          "@type": "Question",
          "name": "Why is my SMRF ground fraction only a few percent?",
          "acceptedAnswer": {"@type": "Answer", "text": "A collapsed ground fraction almost always means the threshold or scalar is too tight for the terrain, or a low noise point pulled the minimum surface far below true ground so real returns now sit above threshold. Remove outliers first, then raise threshold and scalar incrementally until the ground fraction returns to a realistic band."}
        }
      ]
    }
  ]
}
</script>

# SMRF Ground Classification in PDAL

Separating bare-earth returns from everything the laser also hit — canopy, rooftops, vehicles, wires — is the first real decision in any terrain-modelling workflow, and the Simple Morphological Filter is the tool PDAL reaches for by default. Exposed as `filters.smrf`, it turns an unstructured point cloud into a labelled one where every bare-earth return carries ASPRS Classification code 2, ready to feed a digital terrain model. This guide sits within [Ground Filtering and DTM/DSM Generation with PDAL](https://www.pythonlidar.com/ground-filtering-dtm-dsm-generation/) and focuses on how SMRF works internally, how its four core parameters interact, and how to prove the result is trustworthy before it flows downstream.

SMRF earns its "simple" name honestly: compared with iterative surface-fitting classifiers it exposes a small, interpretable parameter set and behaves predictably across acquisition types, from dense terrestrial scans to sparse airborne swaths. That predictability is exactly why it is worth understanding the mechanism rather than copying default values — the same four numbers that produce a clean DTM over farmland will shave hillsides bald or leave shrubs standing over rough ground.

<svg viewBox="0 0 760 320" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="SMRF ground classification algorithm stages from raster minimum surface to labelled ground points" style="width:100%;max-width:760px;display:block;margin:1.5rem auto">
  <title>SMRF Algorithm Stages</title>
  <desc>A vertical flow of five stages: rasterize points to a minimum-elevation grid, apply progressive morphological opening with increasing window sizes, compute a per-cell slope threshold, apply the scalar-scaled elevation threshold, and label accepted points as ASPRS Classification code 2 ground. A side panel lists the four governing parameters cell, window, slope, and scalar with threshold.</desc>
  <defs>
    <marker id="smrf-arr" markerWidth="8" markerHeight="8" refX="7" refY="3" orient="auto">
      <path d="M0,0 L0,6 L8,3 z" fill="currentColor" opacity="0.6"/>
    </marker>
  </defs>
  <rect x="30" y="18" width="300" height="48" rx="6" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.75"/>
  <text x="180" y="40" text-anchor="middle" font-size="12" fill="currentColor" font-weight="600">1 · Rasterize to minimum surface</text>
  <text x="180" y="56" text-anchor="middle" font-size="10" fill="currentColor" opacity="0.65">lowest Z per cell (cell size)</text>
  <rect x="30" y="80" width="300" height="48" rx="6" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.75"/>
  <text x="180" y="102" text-anchor="middle" font-size="12" fill="currentColor" font-weight="600">2 · Progressive morphological open</text>
  <text x="180" y="118" text-anchor="middle" font-size="10" fill="currentColor" opacity="0.65">erode then dilate, window grows</text>
  <rect x="30" y="142" width="300" height="48" rx="6" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.75"/>
  <text x="180" y="164" text-anchor="middle" font-size="12" fill="currentColor" font-weight="600">3 · Per-cell slope threshold</text>
  <text x="180" y="180" text-anchor="middle" font-size="10" fill="currentColor" opacity="0.65">flags cells rising faster than slope</text>
  <rect x="30" y="204" width="300" height="48" rx="6" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.75"/>
  <text x="180" y="226" text-anchor="middle" font-size="12" fill="currentColor" font-weight="600">4 · Scalar · elevation threshold</text>
  <text x="180" y="242" text-anchor="middle" font-size="10" fill="currentColor" opacity="0.65">accept if Z − surface ≤ scaled thr.</text>
  <rect x="30" y="266" width="300" height="48" rx="6" fill="none" stroke="currentColor" stroke-width="1.5"/>
  <text x="180" y="288" text-anchor="middle" font-size="12" fill="currentColor" font-weight="700">5 · Label Classification = 2</text>
  <text x="180" y="304" text-anchor="middle" font-size="10" fill="currentColor" opacity="0.65">bare-earth ground returns</text>
  <line x1="180" y1="66" x2="180" y2="78" stroke="currentColor" stroke-width="1.5" opacity="0.6" marker-end="url(#smrf-arr)"/>
  <line x1="180" y1="128" x2="180" y2="140" stroke="currentColor" stroke-width="1.5" opacity="0.6" marker-end="url(#smrf-arr)"/>
  <line x1="180" y1="190" x2="180" y2="202" stroke="currentColor" stroke-width="1.5" opacity="0.6" marker-end="url(#smrf-arr)"/>
  <line x1="180" y1="252" x2="180" y2="264" stroke="currentColor" stroke-width="1.5" opacity="0.6" marker-end="url(#smrf-arr)"/>
  <rect x="400" y="80" width="320" height="180" rx="8" fill="none" stroke="currentColor" stroke-width="1" stroke-dasharray="4 3" opacity="0.6"/>
  <text x="560" y="104" text-anchor="middle" font-size="12" fill="currentColor" font-weight="600" opacity="0.8">Governing parameters</text>
  <text x="420" y="130" font-size="11" fill="currentColor" opacity="0.75" font-family="monospace">cell</text>
  <text x="470" y="130" font-size="10" fill="currentColor" opacity="0.6">raster resolution (m)</text>
  <text x="420" y="158" font-size="11" fill="currentColor" opacity="0.75" font-family="monospace">window</text>
  <text x="490" y="158" font-size="10" fill="currentColor" opacity="0.6">max object width (m)</text>
  <text x="420" y="186" font-size="11" fill="currentColor" opacity="0.75" font-family="monospace">slope</text>
  <text x="480" y="186" font-size="10" fill="currentColor" opacity="0.6">rise / run tolerance</text>
  <text x="420" y="214" font-size="11" fill="currentColor" opacity="0.75" font-family="monospace">scalar</text>
  <text x="485" y="214" font-size="10" fill="currentColor" opacity="0.6">scales threshold by slope</text>
  <text x="420" y="242" font-size="11" fill="currentColor" opacity="0.75" font-family="monospace">threshold</text>
  <text x="505" y="242" font-size="10" fill="currentColor" opacity="0.6">base elevation tol. (m)</text>
</svg>

## Prerequisites

Have the following in place before running a ground-classification pass:

- **PDAL 2.4 or later** with Python bindings (`pip install pdal` or `conda install -c conda-forge python-pdal`).
- **Python 3.10+** with `numpy` available for validating the labelled output array.
- **A point cloud with metric horizontal units** — SMRF interprets `window`, `cell`, and `threshold` in the same units as X/Y. A geographic (degree) CRS will make these values meaningless, so reproject first if needed; see [Spatial Reprojection](https://www.pythonlidar.com/pdal-pipeline-architecture-execution/spatial-reprojection/).
- **Gross noise removed** — an understanding of how [Applying Statistical Outlier Filters in PDAL](https://www.pythonlidar.com/pdal-pipeline-architecture-execution/pipeline-filtering-logic/applying-statistical-outlier-filters-in-pdal/) strips the low blunders that would otherwise anchor the minimum surface.
- **A sense of the terrain** — approximate maximum slope, the widest building or tree footprint, and the point density (points per square metre) of the scan.

## How SMRF Classifies Ground

SMRF is a raster-based morphological classifier. Rather than fitting a continuous surface to the points, it projects them onto a grid and reasons about that grid with image-processing operations. Five conceptual stages carry a raw cloud to a labelled one.

1. **Rasterize to a minimum-elevation surface.** SMRF lays a regular grid over the scene at the `cell` resolution and records the lowest Z in each cell. This minimum surface is a deliberately pessimistic first guess at the ground — it clings to the true terrain wherever a bare-earth return reached the cell, and floats up only where the ground was fully occluded.
2. **Progressive morphological opening.** SMRF repeatedly applies a morphological *opening* (an erosion followed by a dilation) using a structuring element whose diameter grows from one cell up to the `window` limit. Each successively larger opening removes objects that fit inside it — a car at a small window, a house at a medium window, a copse of trees at the largest. Points that rise above the opened surface by more than the tolerance at the window size that removed them are marked non-ground.
3. **Per-cell slope threshold.** The `slope` parameter sets how steeply the accepted surface is allowed to climb between neighbouring cells. Where the reconstructed surface rises faster than `slope` (expressed as rise over run), SMRF treats the jump as the edge of an object rather than natural terrain, which is what lets it cut cleanly around vertical building walls.
4. **Scalar-scaled elevation threshold.** A point survives as ground only if its height above the reconstructed surface is at most `threshold`, but that allowance is not constant. The `scalar` multiplies `threshold` as a function of local slope, granting steeper cells more vertical latitude so genuine terrain on a hillside is not sheared off while flat cells stay tight against low vegetation.
5. **Label the survivors.** Every accepted point receives ASPRS Classification code 2 (Ground). Everything else is left as code 1 (Unassigned) unless a prior stage already assigned it a class such as 7 (Noise). Because the codes follow the [ASPRS standard](https://www.pythonlidar.com/point-cloud-data-standards-fundamentals/asprs-classification-codes/understanding-asprs-classification-codes/), downstream DTM and DSM tooling can select ground with a single range expression.

The order of these stages is why SMRF wants a clean input. If a spurious point sits several metres below true ground, it becomes the cell minimum in stage one, drags the reconstructed surface down with it, and pushes every honest return in that cell above `threshold` — a local hole of missing ground. Running outlier removal beforehand, as the [Pipeline Filtering Logic](https://www.pythonlidar.com/pdal-pipeline-architecture-execution/pipeline-filtering-logic/) guide describes, prevents this class of failure entirely.

## Full Implementation

The module below runs a complete SMRF pass: it reads a LAS/LAZ file, strips statistical noise, classifies ground, asserts that the ground fraction is plausible, and writes a labelled LAZ. It uses a typed signature, structured logging, and explicit error handling so it can drop into a production job.

```python
import json
import logging
from pathlib import Path

import numpy as np
import pdal

logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")


def classify_ground_smrf(
    input_path: str,
    output_path: str,
    cell: float = 1.0,
    window: float = 18.0,
    slope: float = 0.15,
    scalar: float = 1.25,
    threshold: float = 0.5,
    min_ground_fraction: float = 0.20,
    max_ground_fraction: float = 0.60,
) -> dict:
    """
    Classify bare-earth ground returns with filters.smrf and validate the result.

    Parameters
    ----------
    input_path   : source LAS/LAZ file (metric horizontal CRS)
    output_path  : destination LAZ with Classification code 2 written
    cell         : minimum-surface raster resolution in metres
    window       : maximum non-ground object diameter in metres
    slope        : maximum terrain slope as rise/run
    scalar       : multiplies the elevation threshold by local slope
    threshold    : base elevation tolerance above the surface in metres
    min_ground_fraction / max_ground_fraction : accepted ground share band

    Returns
    -------
    dict with total, ground, and ground_fraction keys.

    Raises
    ------
    FileNotFoundError : if the input path does not exist.
    RuntimeError      : if execution yields zero points or an implausible ground share.
    """
    src = Path(input_path)
    if not src.exists():
        raise FileNotFoundError(f"Input point cloud not found: {src}")

    pipeline_def = {
        "pipeline": [
            {"type": "readers.las", "filename": str(src)},
            {
                # Strip low blunders so they cannot anchor the minimum surface.
                "type": "filters.outlier",
                "method": "statistical",
                "mean_k": 12,
                "multiplier": 2.5,
            },
            {
                # Keep the noise labels SMRF should ignore, drop nothing yet.
                "type": "filters.smrf",
                "cell": cell,
                "window": window,
                "slope": slope,
                "scalar": scalar,
                "threshold": threshold,
                "ignore": "Classification[7:7]",
            },
            {
                "type": "writers.las",
                "filename": str(output_path),
                "forward": "all",
                "compression": "laszip",
            },
        ]
    }

    pipeline = pdal.Pipeline(json.dumps(pipeline_def))
    try:
        pipeline.validate()
    except RuntimeError as exc:
        logging.error("SMRF pipeline failed validation: %s", exc)
        raise

    total = pipeline.execute()
    if total == 0:
        raise RuntimeError(
            f"Pipeline processed 0 points from '{src}'. "
            "Check the file and that filters.outlier did not remove everything."
        )

    arr = pipeline.arrays[0]
    ground = int(np.count_nonzero(arr["Classification"] == 2))
    fraction = ground / total
    logging.info(
        "Classified %d of %d points as ground (%.1f%%).",
        ground, total, fraction * 100,
    )

    if not (min_ground_fraction <= fraction <= max_ground_fraction):
        raise RuntimeError(
            f"Ground fraction {fraction:.1%} is outside the expected "
            f"{min_ground_fraction:.0%}-{max_ground_fraction:.0%} band. "
            "Tune scalar/threshold/window for this terrain before trusting the DTM."
        )

    return {"total": total, "ground": ground, "ground_fraction": fraction}


if __name__ == "__main__":
    stats = classify_ground_smrf(
        input_path="survey_tile.laz",
        output_path="survey_tile_ground.laz",
    )
    print(
        f"OK: {stats['ground']:,}/{stats['total']:,} ground "
        f"({stats['ground_fraction']:.1%})"
    )
```

## Code Breakdown

**Reader and unit assumptions.** `readers.las` ingests the cloud and carries its CRS forward. SMRF never reprojects, so if the file is in a geographic CRS the `cell` and `window` values — nominally metres — would be interpreted as degrees and the filter would misbehave silently. Verify the CRS is projected before running.

**Outlier stage placement.** `filters.outlier` runs first in `statistical` mode, flagging blunders as Classification 7 rather than deleting them. Keeping the points but labelling them lets SMRF exclude them from the minimum surface via the `ignore` expression while still counting them honestly in the total.

**The SMRF stage.** All five governing parameters are exposed as arguments so the same function serves flat farmland (`slope` near 0.1) and rolling terrain (`slope` near 0.3). `ignore: "Classification[7:7]"` tells SMRF to skip points already flagged as noise, which is what prevents a single sub-ground blunder from carving a hole in the classified surface. This mirrors the range-selection syntax covered in [Pipeline Filtering Logic](https://www.pythonlidar.com/pdal-pipeline-architecture-execution/pipeline-filtering-logic/).

**Writer and dimension preservation.** `writers.las` with `forward: "all"` re-emits every source dimension plus the freshly written `Classification` codes, and `compression: "laszip"` produces a LAZ. Dropping `forward: "all"` would strip intensity, return numbers, and any custom dimensions from the output.

**Validation inside the function.** Rather than trusting the run blindly, the function counts ground points from the in-memory array and raises if the fraction leaves a plausible band. That single assertion catches the majority of misconfigured passes before the file is ever handed to a raster step.

## Parameter Reference

| Parameter | Type | Default | Typical range | Effect |
|-----------|------|---------|---------------|--------|
| `cell` | float | 1.0 | 0.5–2.0 m | Minimum-surface raster resolution. Match to point spacing; too small leaves gaps, too large blurs terrain detail. |
| `window` | float | 18.0 | 8–40 m | Maximum diameter of a removable non-ground object. Set just above the widest building or tree cluster. |
| `slope` | float | 0.15 | 0.05–0.5 | Maximum accepted terrain slope as rise/run. Raise for hills, lower for flats. |
| `scalar` | float | 1.25 | 0.5–2.5 | Multiplies `threshold` by local slope, adding vertical tolerance on steep cells. |
| `threshold` | float | 0.5 | 0.1–2.0 m | Base height above the reconstructed surface still accepted as ground. |
| `ignore` | range string | — | any dimension range | Points to exclude from the surface, e.g. `Classification[7:7]` for noise. |
| `returns` | string | `"last, only"` | `last`, `first`, `only`, `intermediate` | Which return types SMRF considers; last/only favours ground under canopy. |

The `returns` parameter is the lever that makes SMRF work under vegetation: restricting it to last and only returns discards mid-canopy hits that would otherwise inflate the minimum surface. That tuning is the subject of a dedicated recipe, [Tuning SMRF for Forested Terrain](https://www.pythonlidar.com/ground-filtering-dtm-dsm-generation/smrf-ground-classification/tuning-smrf-for-forested-terrain/).

## Validation and Integrity Checks

A ground classifier that runs without error can still be wrong, so treat the ground fraction as the primary health signal. For clean airborne LiDAR over mixed land cover, expect **20–60 % of returns to be classified as ground**. Open, treeless terrain trends toward the upper end; dense forest or heavily built environments trend lower.

```python
import numpy as np
import pdal, json

def ground_fraction(path: str) -> float:
    p = pdal.Pipeline(json.dumps({"pipeline": [path]}))
    p.execute()
    arr = p.arrays[0]
    return float(np.count_nonzero(arr["Classification"] == 2) / len(arr))

frac = ground_fraction("survey_tile_ground.laz")
assert 0.20 <= frac <= 0.60, f"Implausible ground fraction: {frac:.1%}"
```

Beyond the aggregate fraction, two spatial checks catch subtler failures:

- **Hole detection.** Rasterize the ground points to a coarse grid and look for empty cells inside the tile interior. Systematic voids point to a `window` that is too small to bridge large roofs, or to sub-ground noise that was not ignored.
- **Elevation sanity.** The minimum and maximum Z of the ground class should track the real terrain envelope. A ground point tens of metres below its neighbours is a surviving blunder; a suspiciously high one is misclassified canopy.

For a full audit you can chain the classified cloud straight into a DTM step and inspect the resulting raster — a noisy or pockmarked terrain surface exposes classification problems the point counts alone will not.

## Performance Tuning

SMRF's cost is dominated by the morphological openings, which parallelise well across cores:

- **`OMP_NUM_THREADS`.** SMRF respects OpenMP threading; set `OMP_NUM_THREADS` to the physical core count before launching Python. On a 16-core workstation this roughly halves classification time versus single-threaded for large tiles. Hyperthreads add little because the openings are memory-bandwidth bound.
- **`cell` size.** The raster resolution is the strongest single throughput lever — doubling `cell` from 1.0 to 2.0 m quarters the number of grid cells and the opening cost, at the price of coarser terrain detail. For a first-pass classification on a huge regional tile, a larger cell is a reasonable trade; refine on smaller AOIs.
- **Tile the work.** Very large acquisitions should be split into overlapping tiles and classified independently, then merged. Keep an overlap buffer at least as wide as `window` so objects straddling a tile edge are still removed correctly. The [Parallel Execution](https://www.pythonlidar.com/pdal-pipeline-architecture-execution/parallel-execution/) guide covers driving many tiles concurrently.

| Configuration | `cell` | `OMP_NUM_THREADS` | Relative time | Notes |
|---------------|--------|-------------------|---------------|-------|
| Detailed | 0.5 m | 4 | 1.00× | Highest fidelity, slowest |
| Balanced | 1.0 m | 8 | 0.34× | Good default for airborne data |
| Fast first pass | 2.0 m | 16 | 0.09× | Coarse DTM, large-area triage |

## Common Errors and Troubleshooting

**Ground fraction collapses to near zero.** The reconstructed surface has been dragged below true ground by low noise, or `threshold`/`scalar` are too tight. Insert `filters.outlier` before SMRF and set `ignore: "Classification[7:7]"`, then raise `threshold` toward 1.0 m and `scalar` toward 1.5 until the fraction recovers.

**Buildings survive as ground.** The `window` is smaller than the building footprint, so the morphological opening never removes the roof. Increase `window` to exceed the widest structure — 30–40 m for large industrial or commercial roofs — and verify the roofs disappear from the ground class.

**Hillsides are shaved off (under-classification on slopes).** `slope` is too low, so genuine terrain reads as an object edge. Raise `slope` to 0.3–0.5 for steep ground and increase `scalar` so steep cells inherit more vertical tolerance.

**Low vegetation classified as ground.** `threshold` is too generous for the point density. Lower `threshold` toward 0.2 m and reduce `scalar`; if shrubs persist, restrict `returns` to `"last, only"` so mid-vegetation hits are excluded from the surface.

**`RuntimeError: Dimension 'Classification' not found`.** The reader is a bare XYZ format with no classification dimension. Insert `filters.assign` with `"value": "Classification = 0"` before SMRF to create the field, as shown in the stage-composition patterns in [PDAL Stage Chaining](https://www.pythonlidar.com/pdal-pipeline-architecture-execution/pdal-stage-chaining/).

## Frequently Asked Questions

**What ASPRS classification code does `filters.smrf` assign to ground?**

SMRF writes ASPRS Classification code 2 (Ground) to every point it accepts as bare earth and leaves all other points at code 1 (Unassigned) unless they already carried a class. It never overwrites codes such as 7 (Noise) that an upstream filter set, which is why you should run outlier removal before SMRF and reference those labels through `ignore`.

**What does the SMRF `scalar` parameter actually control?**

The `scalar` multiplies the elevation threshold as a function of local slope, letting SMRF tolerate more vertical deviation on steep cells than on flat ones. Raising `scalar` keeps more points on rugged terrain but risks admitting low vegetation; lowering it tightens the surface and can carve valid ground out of slopes.

**How large should the SMRF `window` be?**

The `window` is the maximum diameter of a non-ground object SMRF can remove, so set it slightly larger than the widest building or tree cluster in the scene. A default of 18 m suits mixed suburban terrain; open fields tolerate smaller windows while dense forest or large industrial roofs need 30 m or more.

**Why is my SMRF ground fraction only a few percent?**

A collapsed ground fraction almost always means the `threshold` or `scalar` is too tight for the terrain, or a low noise point pulled the minimum surface far below true ground so real returns now sit above threshold. Remove outliers first, then raise `threshold` and `scalar` incrementally until the ground fraction returns to a realistic band.

**Should I use SMRF or PMF for my data?**

Both are morphological ground filters and share a similar parameter vocabulary. SMRF is the more robust default across mixed terrain; the Progressive Morphological Filter can be preferable where you want tighter control of the growing window schedule. See [PMF Ground Classification](https://www.pythonlidar.com/ground-filtering-dtm-dsm-generation/pmf-ground-classification/) and the side-by-side [SMRF vs PMF for Dense Urban LiDAR](https://www.pythonlidar.com/ground-filtering-dtm-dsm-generation/smrf-ground-classification/smrf-vs-pmf-for-dense-urban-lidar/) comparison.

---

## Related

- [Ground Filtering and DTM/DSM Generation with PDAL](https://www.pythonlidar.com/ground-filtering-dtm-dsm-generation/) — parent overview of ground filtering and terrain-model workflows
- [Tuning SMRF for Forested Terrain](https://www.pythonlidar.com/ground-filtering-dtm-dsm-generation/smrf-ground-classification/tuning-smrf-for-forested-terrain/) — parameter recipe for recovering bare earth under dense canopy
- [SMRF vs PMF for Dense Urban LiDAR](https://www.pythonlidar.com/ground-filtering-dtm-dsm-generation/smrf-ground-classification/smrf-vs-pmf-for-dense-urban-lidar/) — decision guide for buildings, bridges, and abrupt breaklines
- [PMF Ground Classification](https://www.pythonlidar.com/ground-filtering-dtm-dsm-generation/pmf-ground-classification/) — the sibling Progressive Morphological Filter approach
- [Applying Statistical Outlier Filters in PDAL](https://www.pythonlidar.com/pdal-pipeline-architecture-execution/pipeline-filtering-logic/applying-statistical-outlier-filters-in-pdal/) — remove blunders before they anchor the minimum surface
- [Spatial Reprojection](https://www.pythonlidar.com/pdal-pipeline-architecture-execution/spatial-reprojection/) — get the cloud into a metric CRS so window and cell are meaningful
