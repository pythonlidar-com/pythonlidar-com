---
title: "Tuning SMRF for Forested Terrain"
description: "Parameter tuning recipe for filters.smrf on densely vegetated LiDAR: raising window and slope, using last returns only, and elevation thresholds to recover bare earth under forest canopy."
slug: "tuning-smrf-for-forested-terrain"
type: "howto"
breadcrumb: "Tuning SMRF for Forested Terrain"
datePublished: "2024-06-18"
dateModified: "2026-07-12"
---

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Article",
      "headline": "Tuning SMRF for Forested Terrain",
      "description": "Parameter tuning recipe for filters.smrf on densely vegetated LiDAR: raising window and slope, using last returns only, and elevation thresholds to recover bare earth under forest canopy.",
      "datePublished": "2024-06-18",
      "dateModified": "2026-07-12",
      "author": {"@type": "Organization", "name": "pythonlidar.com"}
    },
    {
      "@type": "BreadcrumbList",
      "itemListElement": [
        {"@type": "ListItem", "position": 1, "name": "Home", "item": "https://www.pythonlidar.com/"},
        {"@type": "ListItem", "position": 2, "name": "Ground Filtering and DTM/DSM Generation with PDAL", "item": "https://www.pythonlidar.com/ground-filtering-dtm-dsm-generation/"},
        {"@type": "ListItem", "position": 3, "name": "SMRF Ground Classification", "item": "https://www.pythonlidar.com/ground-filtering-dtm-dsm-generation/smrf-ground-classification/"},
        {"@type": "ListItem", "position": 4, "name": "Tuning SMRF for Forested Terrain", "item": "https://www.pythonlidar.com/ground-filtering-dtm-dsm-generation/smrf-ground-classification/tuning-smrf-for-forested-terrain/"}
      ]
    },
    {
      "@type": "HowTo",
      "name": "Tune filters.smrf to recover ground under forest canopy",
      "step": [
        {"@type": "HowToStep", "name": "Restrict to last returns", "text": "Set returns to last, only so mid-canopy pulses are excluded from the minimum surface."},
        {"@type": "HowToStep", "name": "Widen the window", "text": "Raise window toward 33 m so large tree clusters are removed by the morphological opening."},
        {"@type": "HowToStep", "name": "Relax slope and scalar", "text": "Increase slope to 0.2 to 0.3 and scalar so terrain on forested hillsides survives."},
        {"@type": "HowToStep", "name": "Pre-clean with filters.outlier", "text": "Remove sub-canopy noise before SMRF so it does not anchor the surface below true ground."},
        {"@type": "HowToStep", "name": "Verify ground continuity", "text": "Rasterize the ground class and check for voids under dense canopy where point density is low."}
      ]
    },
    {
      "@type": "FAQPage",
      "mainEntity": [
        {
          "@type": "Question",
          "name": "Why does SMRF miss ground under dense forest canopy?",
          "acceptedAnswer": {"@type": "Answer", "text": "Under closed canopy few pulses reach the forest floor, so cells have sparse or no bare-earth returns and the minimum surface floats up into low vegetation. Restricting returns to last and only, widening the window, and relaxing slope help SMRF reconstruct terrain from the returns that do penetrate."}
        },
        {
          "@type": "Question",
          "name": "Should I use last returns or only returns for forest ground filtering?",
          "acceptedAnswer": {"@type": "Answer", "text": "Use both — the returns value last, only tells SMRF to consider last-of-many returns plus single-return pulses, which together are the returns most likely to have reached the ground. First and intermediate returns almost always struck canopy and would inflate the surface."}
        },
        {
          "@type": "Question",
          "name": "What window size works best for forested SMRF?",
          "acceptedAnswer": {"@type": "Answer", "text": "Larger than open-terrain defaults. A window around 33 m lets the morphological opening remove wide tree clusters that a smaller window would leave standing. Push higher for continuous old-growth stands and lower toward 20 m for scattered trees over pasture."}
        },
        {
          "@type": "Question",
          "name": "Can low point density under canopy be fixed by tuning alone?",
          "acceptedAnswer": {"@type": "Answer", "text": "No. If almost no pulses reached the ground in an area, no parameter set can invent bare-earth returns. Tuning recovers ground where sparse returns exist; genuine voids must be filled at the raster stage with interpolation when the DTM is built."}
        }
      ]
    }
  ]
}
</script>

**TL;DR:** For forested LiDAR, run `filters.smrf` with `returns: "last, only"`, a wider `window` around 33 m, `slope` raised to 0.2–0.3, and a modest `threshold` after stripping sub-canopy noise with `filters.outlier` — this reconstructs bare earth from the few pulses that reached the forest floor instead of floating the surface up into the understory.

## Context and Motivation

This guide is part of [SMRF Ground Classification in PDAL](https://www.pythonlidar.com/ground-filtering-dtm-dsm-generation/smrf-ground-classification/), which covers the algorithm and its parameters in general. Here the focus narrows to one hard case: closed-canopy forest, where the default settings that work beautifully over farmland produce a terrain model riddled with vegetation.

Forest breaks SMRF's most basic assumption — that each grid cell contains at least one return that actually touched the ground. Under a continuous canopy, most laser pulses are intercepted metres above the soil, and only a thin trickle of energy filters through gaps to the floor. When a cell holds no true bare-earth return, the minimum-elevation surface latches onto the lowest understory hit instead, and the reconstructed terrain rises into the shrub layer. The result is a digital terrain model that is systematically too high in wooded areas, with knock-on errors in slope, drainage, and canopy-height calculations. Recovering the real ground is a matter of steering SMRF toward the penetrating returns and giving it enough spatial reach to bridge the vegetation.

<svg viewBox="0 0 720 300" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Cross-section of forest canopy showing which laser returns SMRF should keep for ground classification" style="width:100%;max-width:720px;display:block;margin:1.5rem auto">
  <title>Forest Canopy Return Selection</title>
  <desc>A side-view cross section under a tree. First returns strike the canopy top, intermediate returns hit branches, and last or only returns reach the forest floor. A dashed line marks the reconstructed ground surface built only from the penetrating last and only returns, sitting on true terrain rather than floating in the understory.</desc>
  <defs>
    <marker id="frt-arr" markerWidth="8" markerHeight="8" refX="7" refY="3" orient="auto">
      <path d="M0,0 L0,6 L8,3 z" fill="currentColor" opacity="0.6"/>
    </marker>
  </defs>
  <!-- ground line -->
  <path d="M20 250 Q 200 240 360 252 T 700 246" fill="none" stroke="currentColor" stroke-width="2" opacity="0.85"/>
  <text x="600" y="272" font-size="11" fill="currentColor" opacity="0.7">true terrain</text>
  <!-- reconstructed surface (dashed) -->
  <path d="M20 246 Q 200 236 360 248 T 700 242" fill="none" stroke="currentColor" stroke-width="1.3" stroke-dasharray="5 4" opacity="0.6"/>
  <text x="60" y="230" font-size="10" fill="currentColor" opacity="0.6">SMRF surface (last, only)</text>
  <!-- canopy blobs -->
  <ellipse cx="200" cy="90" rx="90" ry="55" fill="currentColor" opacity="0.08"/>
  <ellipse cx="470" cy="80" rx="100" ry="60" fill="currentColor" opacity="0.08"/>
  <text x="200" y="40" text-anchor="middle" font-size="11" fill="currentColor" opacity="0.7">canopy</text>
  <!-- return dots: first (top), intermediate (mid), last (floor) -->
  <circle cx="170" cy="70" r="4" fill="currentColor" opacity="0.4"/>
  <circle cx="230" cy="85" r="4" fill="currentColor" opacity="0.4"/>
  <text x="255" y="74" font-size="10" fill="currentColor" opacity="0.55">first → canopy (discard)</text>
  <circle cx="190" cy="150" r="4" fill="currentColor" opacity="0.55"/>
  <circle cx="450" cy="140" r="4" fill="currentColor" opacity="0.55"/>
  <text x="470" y="150" font-size="10" fill="currentColor" opacity="0.6">intermediate → branches (discard)</text>
  <circle cx="150" cy="245" r="4.5" fill="currentColor"/>
  <circle cx="360" cy="247" r="4.5" fill="currentColor"/>
  <circle cx="560" cy="243" r="4.5" fill="currentColor"/>
  <text x="360" y="292" text-anchor="middle" font-size="10" fill="currentColor" opacity="0.7">last / only → floor (keep for ground)</text>
  <line x1="170" y1="74" x2="152" y2="240" stroke="currentColor" stroke-width="0.8" stroke-dasharray="2 3" opacity="0.3" marker-end="url(#frt-arr)"/>
</svg>

## Prerequisites and Assumptions

| Requirement | Detail |
|---|---|
| PDAL | 2.4+ with Python bindings |
| Input cloud | Airborne LiDAR with multiple returns per pulse recorded |
| `ReturnNumber` / `NumberOfReturns` | Populated — return-based filtering is impossible without them |
| CRS | Projected, metric (window and cell are in metres) |
| Point density | Ideally 8+ pulses/m²; sparse acquisitions leave unavoidable voids |

Confirm the file actually records multiple returns before tuning — single-return systems give SMRF nothing to select from:

```bash
pdal info --stats forest_tile.laz | python -m json.tool | grep -iA2 NumberOfReturns
```

If `NumberOfReturns` maxes out at 1, the acquisition cannot see under canopy and no SMRF tuning will help.

## Step-by-Step Implementation

### Step 1 — Keep only the penetrating returns

The single most effective change is telling SMRF to consider only the returns likely to have reached the floor. First and intermediate returns almost always struck canopy or branches.

```json
{
  "type": "filters.smrf",
  "returns": "last, only"
}
```

`last` selects the final return of each multi-return pulse; `only` selects single-return pulses. Together they are the subset that most plausibly represents ground.

### Step 2 — Widen the window to remove tree clusters

Open-terrain defaults use an 18 m window. Wooded stands need more reach so the morphological opening can erase wide clumps of trees rather than mistaking them for terrain.

```json
{
  "type": "filters.smrf",
  "returns": "last, only",
  "window": 33.0
}
```

### Step 3 — Relax slope and scalar for wooded hillsides

Forest often grows on terrain that is anything but flat. Raise `slope` so genuine hillside is not read as an object edge, and lift `scalar` so steep cells inherit extra vertical tolerance.

```json
{
  "type": "filters.smrf",
  "returns": "last, only",
  "window": 33.0,
  "slope": 0.25,
  "scalar": 1.5,
  "threshold": 0.45
}
```

### Step 4 — Strip sub-canopy noise before SMRF

Birds, low blunders, and multipath artefacts under the canopy are especially damaging in forest because they can become the cell minimum in a cell that has no true ground return. Remove them first and have SMRF ignore anything left flagged.

```json
[
  { "type": "readers.las", "filename": "forest_tile.laz" },
  { "type": "filters.outlier", "method": "statistical", "mean_k": 8, "multiplier": 2.0 },
  {
    "type": "filters.smrf",
    "returns": "last, only",
    "window": 33.0,
    "slope": 0.25,
    "scalar": 1.5,
    "threshold": 0.45,
    "ignore": "Classification[7:7]"
  }
]
```

## Complete Working Example

Save as `smrf_forest.py`. It classifies a forested tile, reports the ground fraction, and warns when density is too low for a reliable result.

```python
#!/usr/bin/env python3
"""
smrf_forest.py — Recover bare earth under forest canopy with filters.smrf.

Usage:
    python smrf_forest.py forest_tile.laz forest_ground.laz
"""

import json
import sys

import numpy as np
import pdal


def classify_forest_ground(
    input_path: str,
    output_path: str,
    window: float = 33.0,
    slope: float = 0.25,
    scalar: float = 1.5,
    threshold: float = 0.45,
    cell: float = 1.0,
) -> dict:
    """Classify ground under canopy using last/only returns and a wide window."""
    pipeline = {
        "pipeline": [
            {"type": "readers.las", "filename": input_path},
            {
                "type": "filters.outlier",
                "method": "statistical",
                "mean_k": 8,
                "multiplier": 2.0,
            },
            {
                "type": "filters.smrf",
                "returns": "last, only",
                "window": window,
                "slope": slope,
                "scalar": scalar,
                "threshold": threshold,
                "cell": cell,
                "ignore": "Classification[7:7]",
            },
            {
                "type": "writers.las",
                "filename": output_path,
                "forward": "all",
                "compression": "laszip",
            },
        ]
    }

    p = pdal.Pipeline(json.dumps(pipeline))
    total = p.execute()
    if total == 0:
        raise RuntimeError(f"No points processed from {input_path}.")

    arr = p.arrays[0]
    ground = int(np.count_nonzero(arr["Classification"] == 2))
    frac = ground / total

    # Forest ground fractions run lower than open terrain; flag suspiciously low.
    if frac < 0.10:
        print(
            f"WARNING: ground fraction {frac:.1%} is very low — check point "
            "density under canopy and consider widening the window further."
        )

    return {"total": total, "ground": ground, "ground_fraction": frac}


def main() -> None:
    if len(sys.argv) != 3:
        print("Usage: python smrf_forest.py <input.laz> <output.laz>")
        sys.exit(1)

    stats = classify_forest_ground(sys.argv[1], sys.argv[2])
    print(
        f"Ground: {stats['ground']:,}/{stats['total']:,} "
        f"({stats['ground_fraction']:.1%})"
    )


if __name__ == "__main__":
    main()
```

## Key Parameter Table

| Parameter | Open-terrain default | Forested value | Why it changes |
|-----------|----------------------|----------------|----------------|
| `returns` | `"last, only"` | `"last, only"` | Explicitly exclude first/intermediate canopy hits |
| `window` | 18.0 m | 33.0 m | Remove wider tree clusters via the opening |
| `slope` | 0.15 | 0.20–0.30 | Preserve terrain on forested hillsides |
| `scalar` | 1.25 | 1.5 | Grant steep cells more vertical tolerance |
| `threshold` | 0.5 m | 0.4–0.5 m | Keep close to the floor to reject understory |
| `ignore` | — | `Classification[7:7]` | Skip sub-canopy noise flagged by `filters.outlier` |

## Verification

Ground fractions under forest run lower than the 20–60 % typical of open airborne data — a heavily wooded tile may legitimately classify only 10–20 % of returns as ground because so few pulses reached the floor. Judge the result by continuity, not just count.

```python
import numpy as np, pdal, json

p = pdal.Pipeline(json.dumps({"pipeline": ["forest_ground.laz"]}))
p.execute()
arr = p.arrays[0]
ground = arr[arr["Classification"] == 2]

print(f"Ground points: {len(ground):,}")
print(f"Ground Z range: {ground['Z'].min():.1f} – {ground['Z'].max():.1f} m")

# Coarse void check: bin ground into a 10 m grid and count empty interior cells.
gx = ((ground["X"] - ground["X"].min()) // 10).astype(int)
gy = ((ground["Y"] - ground["Y"].min()) // 10).astype(int)
occupied = set(zip(gx.tolist(), gy.tolist()))
nx, ny = gx.max() + 1, gy.max() + 1
empty = nx * ny - len(occupied)
print(f"Empty 10 m ground cells: {empty} of {nx * ny}")
```

A scattering of empty cells is normal under closed canopy; large contiguous voids mean either the window is still too small or the ground was simply never sampled there — a gap the DTM interpolation must bridge later.

## Gotchas and Edge Cases

**Canopy penetration is a hard physical limit.** No `returns` or `window` setting can recover ground the laser never reached. In genuinely occluded areas the honest outcome is a void that gets filled during raster generation, not a fabricated ground surface. Distinguish "SMRF missed existing returns" (a tuning problem) from "there are no returns" (a sampling problem).

**Low density inflates the effect of every stray point.** When only a handful of returns reach a cell, a single mislabelled understory hit skews the local surface badly. Aggressive pre-cleaning with `filters.outlier` matters far more in forest than in open terrain.

**Over-widening the window flattens real terrain.** A window pushed to 60 m to chase stubborn tree clumps will also erase legitimate terrain relief such as narrow ridges and gully edges, because the opening can no longer distinguish them from vegetation. Widen only as far as the vegetation demands.

**Dense understory mimics ground.** Where a continuous shrub layer sits close to the floor, `last` returns from the shrubs and from the ground are nearly coincident, and no morphological filter separates them cleanly. Lower `threshold` toward 0.3 m to bias toward the true minimum, and accept that a thin vegetation bias may remain.

## Frequently Asked Questions

**Why does SMRF miss ground under dense forest canopy?**

Under closed canopy few pulses reach the forest floor, so cells have sparse or no bare-earth returns and the minimum surface floats up into low vegetation. Restricting `returns` to last and only, widening the `window`, and relaxing `slope` help SMRF reconstruct terrain from the returns that do penetrate.

**Should I use last returns or only returns for forest ground filtering?**

Use both — the value `"last, only"` tells SMRF to consider last-of-many returns plus single-return pulses, which together are the returns most likely to have reached the ground. First and intermediate returns almost always struck canopy and would inflate the surface.

**What window size works best for forested SMRF?**

Larger than open-terrain defaults. A `window` around 33 m lets the morphological opening remove wide tree clusters that a smaller window would leave standing. Push higher for continuous old-growth stands and lower toward 20 m for scattered trees over pasture.

**Can low point density under canopy be fixed by tuning alone?**

No. If almost no pulses reached the ground in an area, no parameter set can invent bare-earth returns. Tuning recovers ground where sparse returns exist; genuine voids must be filled at the raster stage with interpolation when the DTM is built.

---

## Related

- [SMRF Ground Classification in PDAL](https://www.pythonlidar.com/ground-filtering-dtm-dsm-generation/smrf-ground-classification/) — parent guide to the algorithm and its full parameter set
- [SMRF vs PMF for Dense Urban LiDAR](https://www.pythonlidar.com/ground-filtering-dtm-dsm-generation/smrf-ground-classification/smrf-vs-pmf-for-dense-urban-lidar/) — how the same filter behaves in the opposite (built-up) setting
- [Ground Filtering and DTM/DSM Generation with PDAL](https://www.pythonlidar.com/ground-filtering-dtm-dsm-generation/) — the broader terrain-modelling workflow this feeds
- [Applying Statistical Outlier Filters in PDAL](https://www.pythonlidar.com/pdal-pipeline-architecture-execution/pipeline-filtering-logic/applying-statistical-outlier-filters-in-pdal/) — strip sub-canopy noise before classifying
