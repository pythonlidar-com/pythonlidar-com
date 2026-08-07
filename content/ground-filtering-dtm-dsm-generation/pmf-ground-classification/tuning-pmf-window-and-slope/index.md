---
title: "Tuning PMF Window and Slope Parameters"
description: "How to choose max_window_size, slope, and distance thresholds for filters.pmf across flat, rolling, and steep terrain, and how point density changes the ideal cell_size."
slug: "tuning-pmf-window-and-slope"
type: "howto"
breadcrumb: "Tuning PMF Window and Slope"
datePublished: "2024-06-26"
dateModified: "2026-07-12"
---

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Article",
      "headline": "Tuning PMF Window and Slope Parameters",
      "description": "How to choose max_window_size, slope, and distance thresholds for filters.pmf across flat, rolling, and steep terrain, and how point density changes the ideal cell_size.",
      "datePublished": "2024-06-26",
      "dateModified": "2026-07-12",
      "author": {"@type": "Organization", "name": "pythonlidar.com"}
    },
    {
      "@type": "BreadcrumbList",
      "itemListElement": [
        {"@type": "ListItem", "position": 1, "name": "Home", "item": "https://www.pythonlidar.com/"},
        {"@type": "ListItem", "position": 2, "name": "Ground Filtering & Terrain Models", "item": "https://www.pythonlidar.com/ground-filtering-dtm-dsm-generation/"},
        {"@type": "ListItem", "position": 3, "name": "PMF Ground Classification", "item": "https://www.pythonlidar.com/ground-filtering-dtm-dsm-generation/pmf-ground-classification/"},
        {"@type": "ListItem", "position": 4, "name": "Tuning PMF Window and Slope", "item": "https://www.pythonlidar.com/ground-filtering-dtm-dsm-generation/pmf-ground-classification/tuning-pmf-window-and-slope/"}
      ]
    },
    {
      "@type": "HowTo",
      "name": "Tune filters.pmf for a given terrain and point density",
      "step": [
        {"@type": "HowToStep", "position": 1, "name": "Size the window to the largest object", "text": "Set max_window_size in cells to just exceed the widest non-ground footprint you must remove."},
        {"@type": "HowToStep", "position": 2, "name": "Set slope to the terrain", "text": "Use a low slope on flat ground and a higher slope on steep ground so real relief is not stripped."},
        {"@type": "HowToStep", "position": 3, "name": "Bound the thresholds", "text": "Pick initial_distance for the smallest feature to keep out and max_distance to clamp tall objects."},
        {"@type": "HowToStep", "position": 4, "name": "Match cell_size to density", "text": "Choose cell_size near the average point spacing so the surface is neither starved nor oversampled."},
        {"@type": "HowToStep", "position": 5, "name": "Sweep and score", "text": "Run a small parameter sweep and compare ground fractions and surface smoothness."}
      ]
    },
    {
      "@type": "FAQPage",
      "mainEntity": [
        {
          "@type": "Question",
          "name": "How do I set max_window_size for PMF?",
          "acceptedAnswer": {"@type": "Answer", "text": "Take the widest non-ground object you must remove, divide its footprint in metres by cell_size to get cells, and set max_window_size a little above that. If the biggest building is 30 m across at a 1 m cell_size, use about 33; anything smaller leaves the roof classified as ground."}
        },
        {
          "@type": "Question",
          "name": "Should slope be higher for steep terrain or lower?",
          "acceptedAnswer": {"@type": "Answer", "text": "Higher. slope scales how much the height threshold grows as the window widens, so a larger slope tolerates the genuine elevation change across a wide window on a hillside. On flat ground a small slope is safer because it keeps low objects out of the ground surface."}
        },
        {
          "@type": "Question",
          "name": "When should I switch exponential window growth off?",
          "acceptedAnswer": {"@type": "Answer", "text": "Turn exponential off when you need fine control over which object sizes are removed. Linear growth adds one window step at a time, so you can stop between, say, 9 and 15 cells; exponential growth doubles and may skip past the size that matters. The cost is many more iterations and longer runtimes."}
        },
        {
          "@type": "Question",
          "name": "How does point density affect cell_size?",
          "acceptedAnswer": {"@type": "Answer", "text": "cell_size should sit near the mean point spacing. Dense UAV data at tens of points per square metre supports a 0.25 to 0.5 m cell that resolves fine breaklines; sparse airborne data at 1 to 2 points per square metre needs a 1 to 2 m cell or the surface will be full of empty cells and gaps."}
        }
      ]
    }
  ]
}
</script>

**TL;DR:** Size `max_window_size` to just beyond the widest object you must remove, raise `slope` and `max_distance` as terrain gets steeper, drop `initial_distance` where low vegetation must go, and set `cell_size` near the mean point spacing — then verify with a short sweep rather than trusting the defaults.

## Context and Motivation

This guide belongs to [PMF Ground Classification in PDAL](https://www.pythonlidar.com/ground-filtering-dtm-dsm-generation/pmf-ground-classification/) and focuses on the one thing that decides whether the Progressive Morphological Filter succeeds or fails on your data: the numbers you hand it. The default `filters.pmf` parameters were chosen for gently varied airborne scenes at roughly one-metre spacing. Feed them a coastal dune field, a forested mountain, or a dense drone survey and they will either bulldoze real relief or leave whole rooftops labelled as ground.

Unlike a single-threshold classifier, PMF has two coupled schedules to reason about — how fast the window grows and how fast the height tolerance grows with it — plus a grid resolution that must match your point density. Getting them into balance is less about memorising values and more about understanding what each knob trades away. This page walks through that reasoning, gives concrete recipes for flat, rolling, and steep terrain, explains when exponential window growth helps or hurts, and ends with a small sweep harness you can point at any tile.

## Prerequisites and Assumptions

| Requirement | Detail |
|---|---|
| PDAL | 2.4+ with `filters.pmf` |
| Python `pdal` + `numpy` | for the sweep harness |
| A representative tile | ideally one containing your worst-case object and worst-case slope |
| Known point density | run `pdal info --stats` or estimate from the acquisition spec |
| Projected CRS in metres | e.g. `EPSG:6339` (NAD83(2011) / UTM 11N) for a US Southwest tile |

The core walkthrough of building the pipeline is in [classifying ground with the Progressive Morphological Filter](https://www.pythonlidar.com/ground-filtering-dtm-dsm-generation/pmf-ground-classification/classifying-ground-with-progressive-morphological-filter/); here we assume that pipeline exists and only vary its numbers.

## The Two Knobs and What They Trade

Every PMF parameter pulls against another. Understanding the tension is faster than trial and error.

- **`max_window_size` vs terrain preservation.** A bigger window removes bigger objects but also flattens broader real landforms. You want it *just* large enough to span your worst object and no larger.
- **`slope` vs object leakage.** A bigger slope raises the height tolerance on wide windows, protecting hillsides — but too high and it lets low buildings survive as ground. It is the single most terrain-dependent value.
- **`initial_distance` vs vegetation.** Small values on the tightest window exclude low shrubs and curbs; too small and they reject legitimate ground roughness.
- **`max_distance` vs tall structures.** This clamp stops the growing threshold from ever admitting a tall object on a wide window. Raise it on flat sites with tall isolated structures; lower it where objects are short.
- **`cell_size` vs density.** Too fine for the data and the surface is riddled with empty cells; too coarse and fine breaklines vanish.

### Window growth: exponential vs linear

With `exponential: true` the window side roughly follows `2 * base^k + 1` cells, doubling each pass so `max_window_size` is reached in a handful of iterations. With `exponential: false` it grows linearly, `2 * k * cell_size + 1`, adding one step at a time. Linear growth gives you finer control over exactly which object sizes get removed — useful when a scene has objects clustered at one awkward size — at the cost of many more iterations. Exponential is the right default for speed; switch to linear only when a specific object size keeps slipping through the doubling gaps.

<svg viewBox="0 0 720 300" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Slope against window size, with four terrain recipes plotted and the two failure corners named" style="width:100%;max-width:720px;display:block;margin:1.6rem auto">
  <title>Where each terrain recipe sits in the slope–window plane</title>
  <desc>A scatter plot with slope on the horizontal axis from 0 to 1.6 and max_window_size in cells on the vertical axis from 10 to 65. Four recipes are marked: dense UAV survey high on the window axis, flat floodplain at low slope, rolling suburban in the middle, and steep mountain at high slope with a small window. The top-left corner is labelled as over-filtering and the bottom-right as under-filtering.</desc>
  <rect x="0" y="0" width="720" height="300" fill="var(--dg-bg)" rx="10"/>
  <line x1="240" y1="40" x2="240" y2="240" stroke="var(--dg-line-soft)" stroke-width="1" stroke-dasharray="3 4"/>
  <line x1="390" y1="40" x2="390" y2="240" stroke="var(--dg-line-soft)" stroke-width="1" stroke-dasharray="3 4"/>
  <line x1="540" y1="40" x2="540" y2="240" stroke="var(--dg-line-soft)" stroke-width="1" stroke-dasharray="3 4"/>
  <line x1="90" y1="186" x2="690" y2="186" stroke="var(--dg-line-soft)" stroke-width="1" stroke-dasharray="3 4"/>
  <line x1="90" y1="131" x2="690" y2="131" stroke="var(--dg-line-soft)" stroke-width="1" stroke-dasharray="3 4"/>
  <line x1="90" y1="76" x2="690" y2="76" stroke="var(--dg-line-soft)" stroke-width="1" stroke-dasharray="3 4"/>
  <line x1="90" y1="40" x2="90" y2="240" stroke="var(--dg-line)" stroke-width="1.5"/>
  <line x1="90" y1="240" x2="690" y2="240" stroke="var(--dg-line)" stroke-width="1.5"/>
  <text x="90" y="258" text-anchor="middle" font-size="10.5" fill="var(--dg-muted)">0.0</text>
  <text x="240" y="258" text-anchor="middle" font-size="10.5" fill="var(--dg-muted)">0.4</text>
  <text x="390" y="258" text-anchor="middle" font-size="10.5" fill="var(--dg-muted)">0.8</text>
  <text x="540" y="258" text-anchor="middle" font-size="10.5" fill="var(--dg-muted)">1.2</text>
  <text x="690" y="258" text-anchor="middle" font-size="10.5" fill="var(--dg-muted)">1.6</text>
  <text x="82" y="244" text-anchor="end" font-size="10.5" fill="var(--dg-muted)">10</text>
  <text x="82" y="190" text-anchor="end" font-size="10.5" fill="var(--dg-muted)">25</text>
  <text x="82" y="135" text-anchor="end" font-size="10.5" fill="var(--dg-muted)">40</text>
  <text x="82" y="80" text-anchor="end" font-size="10.5" fill="var(--dg-muted)">55</text>
  <text x="390" y="278" text-anchor="middle" font-size="11.5" fill="var(--dg-text)">slope</text>
  <text x="26" y="140" text-anchor="middle" font-size="11.5" fill="var(--dg-text)" transform="rotate(-90 26 140)">max_window_size (cells)</text>
  <text x="112" y="62" font-size="10.5" fill="var(--dg-e)">wide window, low slope → ridges stripped</text>
  <text x="672" y="222" text-anchor="end" font-size="10.5" fill="var(--dg-c)">narrow window, high slope → roofs survive</text>
  <circle cx="146" cy="156" r="7" fill="var(--dg-b-soft)" stroke="var(--dg-b)" stroke-width="2"/>
  <text x="158" y="152" font-size="11" fill="var(--dg-text)">flat — floodplain</text>
  <circle cx="352" cy="178" r="7" fill="var(--dg-a-soft)" stroke="var(--dg-a)" stroke-width="2"/>
  <text x="364" y="174" font-size="11" fill="var(--dg-text)">rolling — suburban</text>
  <circle cx="615" cy="211" r="7" fill="var(--dg-c-soft)" stroke="var(--dg-c)" stroke-width="2"/>
  <text x="603" y="207" text-anchor="end" font-size="11" fill="var(--dg-text)">steep — mountain</text>
  <circle cx="278" cy="58" r="7" fill="var(--dg-d-soft)" stroke="var(--dg-d)" stroke-width="2"/>
  <text x="290" y="54" font-size="11" fill="var(--dg-text)">dense UAV survey</text>
</svg>

## Terrain-Specific Recipes

The values below assume ~1 m spacing airborne data; scale `cell_size` and the window with density.

### Flat terrain (floodplain, airfield, coastal flat)

Low relief means a small `slope` is safe and keeps low clutter out. Buildings may be large, so keep the window generous.

```json
{
  "type": "filters.pmf",
  "max_window_size": 33,
  "slope": 0.15,
  "initial_distance": 0.12,
  "max_distance": 2.0,
  "cell_size": 1.0,
  "exponential": true
}
```

### Rolling terrain (farmland hills, suburban mixed)

Moderate relief needs more height tolerance so gentle slopes are not read as objects.

```json
{
  "type": "filters.pmf",
  "max_window_size": 27,
  "slope": 0.7,
  "initial_distance": 0.2,
  "max_distance": 2.5,
  "cell_size": 1.0,
  "exponential": true
}
```

### Steep terrain (mountain slopes, quarry walls)

Here real elevation changes fast across a window, so `slope` and `max_distance` must both rise or ridgelines get stripped. Shrink the window so it does not span whole landforms.

```json
{
  "type": "filters.pmf",
  "max_window_size": 18,
  "slope": 1.4,
  "initial_distance": 0.3,
  "max_distance": 4.0,
  "cell_size": 1.0,
  "exponential": true
}
```

### Dense UAV survey (tens of pts/m²)

Fine spacing lets a small cell resolve breaklines; keep the window in metres constant by raising its cell count.

```json
{
  "type": "filters.pmf",
  "max_window_size": 60,
  "slope": 0.5,
  "initial_distance": 0.1,
  "max_distance": 2.0,
  "cell_size": 0.35,
  "exponential": true
}
```

At `cell_size: 0.35`, a `max_window_size` of 60 still only spans ~21 m — matching the objects, not the density. Point density is worth measuring properly; the [point density metrics](https://www.pythonlidar.com/point-cloud-data-standards-fundamentals/point-density-metrics/) guide shows how.

<svg viewBox="0 0 720 280" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Window side in cells against opening pass for exponential and linear growth" style="width:100%;max-width:720px;display:block;margin:1.6rem auto">
  <title>Exponential against linear window growth</title>
  <desc>A line chart over eight morphological opening passes. With exponential growth the window side roughly doubles each pass and reaches the max_window_size clamp of 27 cells by the fifth pass. With linear growth it adds two cells per pass and only reaches 17 cells after eight passes, giving finer control over which object sizes are removed.</desc>
  <rect x="0" y="0" width="720" height="280" fill="var(--dg-bg)" rx="10"/>
  <line x1="80" y1="59" x2="690" y2="59" stroke="var(--dg-line-soft)" stroke-width="1.2" stroke-dasharray="6 4"/>
  <text x="684" y="52" text-anchor="end" font-size="10.5" fill="var(--dg-muted)">max_window_size 27</text>
  <line x1="80" y1="40" x2="80" y2="230" stroke="var(--dg-line)" stroke-width="1.5"/>
  <line x1="80" y1="230" x2="690" y2="230" stroke="var(--dg-line)" stroke-width="1.5"/>
  <text x="72" y="234" text-anchor="end" font-size="10.5" fill="var(--dg-muted)">0</text>
  <text x="72" y="171" text-anchor="end" font-size="10.5" fill="var(--dg-muted)">10</text>
  <text x="72" y="107" text-anchor="end" font-size="10.5" fill="var(--dg-muted)">20</text>
  <text x="72" y="44" text-anchor="end" font-size="10.5" fill="var(--dg-muted)">30</text>
  <polyline points="80,211 167,198 254,173 341,122 428,59 516,59 603,59 690,59" fill="none" stroke="var(--dg-a)" stroke-width="2.4"/>
  <polyline points="80,211 167,198 254,186 341,173 428,160 516,148 603,135 690,122" fill="none" stroke="var(--dg-b)" stroke-width="2.4" stroke-dasharray="7 4"/>
  <circle cx="341" cy="122" r="3.6" fill="var(--dg-a)"/>
  <circle cx="428" cy="59" r="3.6" fill="var(--dg-a)"/>
  <circle cx="341" cy="173" r="3.6" fill="var(--dg-b)"/>
  <circle cx="690" cy="122" r="3.6" fill="var(--dg-b)"/>
  <line x1="95" y1="86" x2="125" y2="86" stroke="var(--dg-a)" stroke-width="2.4"/>
  <text x="133" y="90" font-size="11" fill="var(--dg-text)">exponential: true — 5 passes to 27</text>
  <line x1="95" y1="106" x2="125" y2="106" stroke="var(--dg-b)" stroke-width="2.4" stroke-dasharray="7 4"/>
  <text x="133" y="110" font-size="11" fill="var(--dg-text)">exponential: false — two cells per pass</text>
  <text x="80" y="248" text-anchor="middle" font-size="10.5" fill="var(--dg-muted)">1</text>
  <text x="254" y="248" text-anchor="middle" font-size="10.5" fill="var(--dg-muted)">3</text>
  <text x="428" y="248" text-anchor="middle" font-size="10.5" fill="var(--dg-muted)">5</text>
  <text x="603" y="248" text-anchor="middle" font-size="10.5" fill="var(--dg-muted)">7</text>
  <text x="385" y="268" text-anchor="middle" font-size="11.5" fill="var(--dg-text)">morphological opening pass</text>
  <text x="26" y="135" text-anchor="middle" font-size="11.5" fill="var(--dg-text)" transform="rotate(-90 26 135)">window side (cells)</text>
</svg>

## Complete Working Example: a parameter sweep

Rather than guess, sweep a couple of values and score each run by ground fraction. Save as `pmf_sweep.py`.

```python
#!/usr/bin/env python3
"""
pmf_sweep.py
Sweep PMF slope and max_window_size, reporting the ground fraction for each.

Usage:
    python pmf_sweep.py tile_utm11n.laz 6339
"""

import json
import sys
from itertools import product

import numpy as np
import pdal


def ground_fraction(input_path: str, epsg: int, max_window: int, slope: float,
                    initial_distance: float = 0.2, max_distance: float = 2.5,
                    cell_size: float = 1.0) -> float:
    """Run PMF once and return the fraction of points classified as ground."""
    pipe = {
        "pipeline": [
            {"type": "readers.las", "filename": input_path,
             "spatialreference": f"EPSG:{epsg}"},
            {"type": "filters.outlier", "method": "statistical",
             "mean_k": 12, "multiplier": 2.5},
            {"type": "filters.range", "limits": "Classification![7:7]"},
            {"type": "filters.pmf", "max_window_size": max_window, "slope": slope,
             "initial_distance": initial_distance, "max_distance": max_distance,
             "cell_size": cell_size, "exponential": True},
        ]
    }
    p = pdal.Pipeline(json.dumps(pipe))
    p.execute()
    a = p.arrays[0]
    return float(np.count_nonzero(a["Classification"] == 2) / len(a))


def main() -> None:
    if len(sys.argv) != 3:
        print("Usage: python pmf_sweep.py <input.laz> <source_epsg>")
        sys.exit(1)

    src, epsg = sys.argv[1], int(sys.argv[2])
    windows = [18, 27, 33]
    slopes = [0.3, 0.7, 1.2]

    print(f"{'max_window':>10} {'slope':>7} {'ground %':>9}")
    for w, s in product(windows, slopes):
        frac = ground_fraction(src, epsg, w, s)
        print(f"{w:>10} {s:>7.2f} {100 * frac:>8.1f}%")


if __name__ == "__main__":
    main()
```

Read the grid: ground fraction should rise smoothly with `slope` and fall as `max_window_size` shrinks. A cell that jumps far off the trend usually marks the point where buildings started leaking in (fraction too high) or ridgelines started being cut (fraction too low against the neighbours).

## Key Parameter Table

| Parameter | Flat | Rolling | Steep | Effect of increasing |
|---|---|---|---|---|
| `max_window_size` | 33 | 27 | 18 | Removes larger objects but flattens broader landforms |
| `slope` | 0.15 | 0.7 | 1.4 | More height tolerance on wide windows; protects relief but risks object leakage |
| `initial_distance` | 0.12 | 0.2 | 0.3 | Larger admits more low roughness as ground |
| `max_distance` | 2.0 | 2.5 | 4.0 | Larger lets taller objects survive on wide windows |
| `cell_size` | 1.0 | 1.0 | 1.0 | Larger is faster and coarser; match to point spacing |
| `exponential` | true | true | true | false gives finer size control at higher cost |

<svg viewBox="0 0 720 250" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Three terrain cross-sections showing over-filtered, balanced and under-filtered PMF results" style="width:100%;max-width:720px;display:block;margin:1.6rem auto">
  <title>The three ways a slope value shows up in the surface</title>
  <desc>Three panels each show the same cross-section: a ridge with a building on its flank. With slope too low the returned ground surface cuts straight across and the ridge is lost. Balanced, it follows the ridge and excludes the roof. With slope too high the roof is admitted as ground and the terrain model inherits a flat plateau.</desc>
  <rect x="0" y="0" width="720" height="250" fill="var(--dg-bg)" rx="10"/>
  <text x="126" y="22" text-anchor="middle" font-size="12" font-weight="600" fill="var(--dg-text)">slope too low</text>
  <text x="360" y="22" text-anchor="middle" font-size="12" font-weight="600" fill="var(--dg-text)">balanced</text>
  <text x="594" y="22" text-anchor="middle" font-size="12" font-weight="600" fill="var(--dg-text)">slope too high</text>
  <rect x="20" y="30" width="213" height="160" rx="8" fill="var(--dg-surface)" stroke="var(--dg-line-soft)" stroke-width="1.2"/>
  <path d="M34 160 L80 150 Q126 92 170 140 L219 150" fill="none" stroke="var(--dg-line)" stroke-width="2"/>
  <path d="M34 163 L219 153" fill="none" stroke="var(--dg-e)" stroke-width="2.2" stroke-dasharray="6 4"/>
  <text x="126" y="180" text-anchor="middle" font-size="10.5" fill="var(--dg-e)">ridge flattened out</text>
  <rect x="253" y="30" width="213" height="160" rx="8" fill="var(--dg-surface)" stroke="var(--dg-line-soft)" stroke-width="1.2"/>
  <path d="M267 160 L313 150 Q359 92 403 140 L452 150" fill="none" stroke="var(--dg-line)" stroke-width="2"/>
  <path d="M267 163 L313 153 Q359 95 403 143 L452 153" fill="none" stroke="var(--dg-d)" stroke-width="2.2" stroke-dasharray="6 4"/>
  <rect x="408" y="118" width="38" height="24" fill="var(--dg-c-soft)" stroke="var(--dg-c)" stroke-width="1.4"/>
  <text x="360" y="180" text-anchor="middle" font-size="10.5" fill="var(--dg-d)">ridge kept, roof rejected</text>
  <rect x="487" y="30" width="213" height="160" rx="8" fill="var(--dg-surface)" stroke="var(--dg-line-soft)" stroke-width="1.2"/>
  <path d="M501 160 L547 150 Q593 92 637 140 L686 150" fill="none" stroke="var(--dg-line)" stroke-width="2"/>
  <path d="M501 163 L547 153 Q590 96 642 121 L686 153" fill="none" stroke="var(--dg-c)" stroke-width="2.2" stroke-dasharray="6 4"/>
  <rect x="642" y="118" width="38" height="24" fill="var(--dg-c-soft)" stroke="var(--dg-c)" stroke-width="1.4"/>
  <text x="594" y="180" text-anchor="middle" font-size="10.5" fill="var(--dg-c)">roof admitted as ground</text>
  <text x="126" y="212" text-anchor="middle" font-size="10.5" fill="var(--dg-muted)">omission: real terrain deleted</text>
  <text x="360" y="212" text-anchor="middle" font-size="10.5" fill="var(--dg-muted)">both error types near zero</text>
  <text x="594" y="212" text-anchor="middle" font-size="10.5" fill="var(--dg-muted)">commission: 6 m plateau in DTM</text>
  <text x="126" y="230" text-anchor="middle" font-size="10.5" fill="var(--dg-muted)">raise slope and max_distance</text>
  <text x="360" y="230" text-anchor="middle" font-size="10.5" fill="var(--dg-muted)">keep this recipe</text>
  <text x="594" y="230" text-anchor="middle" font-size="10.5" fill="var(--dg-muted)">lower slope, widen window</text>
</svg>

## Verification

After a sweep, pick the parameter set whose ground fraction matches expectation for the terrain (70–95 % flat, 30–55 % suburban, 10–40 % steep-forested) and confirm the ground surface is smooth:

```python
import json, pdal, numpy as np

p = pdal.Pipeline(json.dumps({"pipeline": [
    {"type": "readers.las", "filename": "tile_utm11n.laz", "spatialreference": "EPSG:6339"},
    {"type": "filters.pmf", "max_window_size": 27, "slope": 0.7,
     "initial_distance": 0.2, "max_distance": 2.5, "cell_size": 1.0, "exponential": True},
]}))
p.execute()
g = p.arrays[0]
g = g[g["Classification"] == 2]
# Local Z variance in a coarse grid flags rooftop leakage as high-variance cells.
print(f"Ground Z spread: {g['Z'].max() - g['Z'].min():.2f} m over {len(g):,} points")
```

Cross-check a suspect tile against the sibling algorithm; the parent page discusses when [SMRF ground classification](https://www.pythonlidar.com/ground-filtering-dtm-dsm-generation/smrf-ground-classification/) preserves relief that PMF planes off.

## Gotchas and Edge Cases

**1. Window measured in cells, thresholds measured in metres.** `max_window_size` is a *cell* count; `initial_distance` and `max_distance` are *metres*. Change `cell_size` and the window's metric footprint changes even though the number is unchanged — a frequent cause of "the same parameters behave differently on the dense tile".

**2. Slope is a factor, not an angle.** PMF's `slope` scales the threshold growth; it is not a degree or a percent grade. Reaching for `35` because the hill is 35° will reject nearly everything. Keep it in the 0.1–2.0 band and tune from there.

**3. One parameter set rarely fits a whole survey.** A project spanning valley floor and mountain flank may need per-tile parameters. Classify by terrain zone, or accept a compromise set validated on the hardest tile.

**4. Chasing the last percent of ground is a trap.** Beyond a point, loosening thresholds to recover a few more ground points admits low vegetation and clutter that a later [pipeline filtering](https://www.pythonlidar.com/pdal-pipeline-architecture-execution/pipeline-filtering-logic/) step then has to clean up. Stop when the surface is smooth, not when the count peaks.

## Frequently Asked Questions

**How do I set max_window_size for PMF?**

Take the widest non-ground object you must remove, divide its footprint in metres by `cell_size` to get cells, and set `max_window_size` a little above that. If the biggest building is 30 m across at a 1 m `cell_size`, use about 33; anything smaller leaves the roof classified as ground.

**Should slope be higher for steep terrain or lower?**

Higher. `slope` scales how much the height threshold grows as the window widens, so a larger slope tolerates the genuine elevation change across a wide window on a hillside. On flat ground a small slope is safer because it keeps low objects out of the ground surface.

**When should I switch exponential window growth off?**

Turn `exponential` off when you need fine control over which object sizes are removed. Linear growth adds one window step at a time, so you can stop between, say, 9 and 15 cells; exponential growth doubles and may skip past the size that matters. The cost is many more iterations and longer runtimes.

**How does point density affect cell_size?**

`cell_size` should sit near the mean point spacing. Dense UAV data at tens of points per square metre supports a 0.25 to 0.5 m cell that resolves fine breaklines; sparse airborne data at 1 to 2 points per square metre needs a 1 to 2 m cell or the surface will be full of empty cells and gaps.

---

## Related

- [PMF Ground Classification in PDAL](https://www.pythonlidar.com/ground-filtering-dtm-dsm-generation/pmf-ground-classification/) — parent guide to the algorithm and full parameter reference
- [Classifying Ground with the Progressive Morphological Filter](https://www.pythonlidar.com/ground-filtering-dtm-dsm-generation/pmf-ground-classification/classifying-ground-with-progressive-morphological-filter/) — the end-to-end pipeline these parameters plug into
- [Point Density Metrics](https://www.pythonlidar.com/point-cloud-data-standards-fundamentals/point-density-metrics/) — measure spacing before choosing cell_size
- [SMRF Ground Classification](https://www.pythonlidar.com/ground-filtering-dtm-dsm-generation/smrf-ground-classification/) — the sibling filter to fall back on where PMF planes off relief
- [Ground Filtering and DTM/DSM Generation with PDAL](https://www.pythonlidar.com/ground-filtering-dtm-dsm-generation/) — where tuned ground classification feeds the terrain-model workflow
