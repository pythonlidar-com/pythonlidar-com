---
title: "Computing Height Above Ground with filters.hag_nn"
description: "What filters.hag_nn actually computes, why count and max_distance matter more than the defaults suggest, and the ground-at-zero assertion that catches a bad classification immediately."
slug: "computing-height-above-ground-with-filters-hag-nn"
type: "howto"
breadcrumb: "Computing Height Above Ground"
datePublished: "2026-08-07"
dateModified: "2026-08-07"
---

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Article",
      "headline": "Computing Height Above Ground with filters.hag_nn",
      "description": "What filters.hag_nn actually computes, why count and max_distance matter more than the defaults suggest, and the ground-at-zero assertion that catches a bad classification immediately.",
      "datePublished": "2026-08-07",
      "dateModified": "2026-08-07",
      "author": {
        "@type": "Organization",
        "name": "pythonlidar.com"
      }
    },
    {
      "@type": "BreadcrumbList",
      "itemListElement": [
        {
          "@type": "ListItem",
          "position": 1,
          "name": "Home",
          "item": "https://www.pythonlidar.com/"
        },
        {
          "@type": "ListItem",
          "position": 2,
          "name": "Ground Filtering and DTM/DSM Generation with PDAL",
          "item": "https://www.pythonlidar.com/ground-filtering-dtm-dsm-generation/"
        },
        {
          "@type": "ListItem",
          "position": 3,
          "name": "Canopy Height Models",
          "item": "https://www.pythonlidar.com/ground-filtering-dtm-dsm-generation/canopy-height-models/"
        },
        {
          "@type": "ListItem",
          "position": 4,
          "name": "Computing Height Above Ground",
          "item": "https://www.pythonlidar.com/ground-filtering-dtm-dsm-generation/canopy-height-models/computing-height-above-ground-with-filters-hag-nn/"
        }
      ]
    },
    {
      "@type": "HowTo",
      "name": "Compute a per-point height above ground with filters.hag_nn",
      "step": [
        {
          "@type": "HowToStep",
          "name": "Confirm the ground class exists",
          "text": "Check that Classification 2 is present, because the filter writes zero everywhere and reports success without it."
        },
        {
          "@type": "HowToStep",
          "name": "Choose a neighbour count",
          "text": "Use about six ground neighbours so one bad return cannot set a whole neighbourhood of heights."
        },
        {
          "@type": "HowToStep",
          "name": "Bound the search distance",
          "text": "Set max_distance so points over large ground-free areas are not measured against distant terrain."
        },
        {
          "@type": "HowToStep",
          "name": "Disable extrapolation",
          "text": "Leave allow_extrapolation false so gaps stay visible rather than being filled with invented ground."
        },
        {
          "@type": "HowToStep",
          "name": "Persist the dimension",
          "text": "List HeightAboveGround in extra_dims on a LAS 1.4 writer or the values never reach the file."
        }
      ]
    },
    {
      "@type": "FAQPage",
      "mainEntity": [
        {
          "@type": "Question",
          "name": "Why is every height above ground zero?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Because no points carry Classification 2. The filter measures against ground-classified points, and with none present it has nothing to subtract, so it writes zero and the pipeline succeeds. Classification has to happen before the stage, in the same pipeline or an earlier one."
          }
        },
        {
          "@type": "Question",
          "name": "What does the count parameter actually change?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "How many ground returns are averaged to estimate the ground beneath each point. With one, every height inherits that single return\u2019s error at full amplitude. With six the estimate is smooth and still follows real breaks in slope. Above about eight the surface stops improving and starts cutting corners on concave terrain."
          }
        },
        {
          "@type": "Question",
          "name": "Should I set max_distance?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Always. Without it a point over a large ground-free area searches arbitrarily far and ends up measured against terrain a hundred metres away, which produces a confident and meaningless number. Fifteen to thirty metres suits most airborne forestry work."
          }
        },
        {
          "@type": "Question",
          "name": "Why do buildings appear in my canopy height model?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Because height above ground is exactly that \u2014 it does not care what the point struck. Filter to the vegetation classes after normalising if the product is about vegetation; the stage itself is deliberately agnostic."
          }
        }
      ]
    }
  ]
}
</script>

**TL;DR:** `{"type": "filters.hag_nn", "count": 6, "max_distance": 25.0, "allow_extrapolation": false}` after a ground classification, then check that ground points come back at a height of zero — if they do not, the problem is the classifier, not the filter.

## Context and Motivation

This guide is part of [Canopy Height Models with filters.hag_nn](https://www.pythonlidar.com/ground-filtering-dtm-dsm-generation/canopy-height-models/). The parent covers the whole workflow; this page is about the one stage that does the arithmetic, because nearly every bad canopy height traces back to how it was configured.

What the stage does is simple enough to state exactly. For each point not classified as ground, it finds the `count` nearest points that are classified as ground, averages their elevations to get an estimated ground level beneath the point, and writes the difference into a new `HeightAboveGround` dimension. Every part of that sentence is a place where a decision has to be made, and PDAL's defaults are not the right ones for forestry.

<svg viewBox="18 33 694 243" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="How one canopy point's height above ground is computed from its nearest ground neighbours" style="width:100%;max-width:720px;display:block;margin:1.6rem auto">
  <title>One canopy point, six ground neighbours</title>
  <desc>A cross-section with a canopy return above sloping terrain. The six nearest ground-classified points are highlighted, their elevations averaged to give an estimated ground level directly beneath the canopy point, and the height above ground is the difference between the point and that estimate. With a count of one the estimate would be a single ground return and would carry that return's own error at full amplitude.</desc>
  <rect x="18" y="33" width="694" height="243" fill="var(--dg-bg)" rx="10"/>
  <path d="M40 196 L180 190 L320 178 L460 172 L600 162 L690 158" fill="none" stroke="var(--dg-line)" stroke-width="2"/>
  <circle cx="120" cy="193" r="4" fill="var(--dg-d)"/>
  <circle cx="200" cy="188" r="4" fill="var(--dg-d)"/>
  <circle cx="280" cy="182" r="4" fill="var(--dg-d)"/>
  <circle cx="360" cy="176" r="4" fill="var(--dg-d)"/>
  <circle cx="440" cy="173" r="4" fill="var(--dg-d)"/>
  <circle cx="520" cy="168" r="4" fill="var(--dg-d)"/>
  <circle cx="320" cy="70" r="6" fill="var(--dg-c-soft)" stroke="var(--dg-c)" stroke-width="2.2"/>
  <text x="334" y="66" font-size="10.5" fill="var(--dg-c)">canopy return at 148.6 m</text>
  <line x1="320" y1="76" x2="320" y2="176" stroke="var(--dg-a)" stroke-width="1.8" stroke-dasharray="5 4"/>
  <text x="330" y="128" font-size="10.5" fill="var(--dg-a)">HeightAboveGround = 26.4 m</text>
  <line x1="110" y1="210" x2="530" y2="210" stroke="var(--dg-d)" stroke-width="1.6"/>
  <text x="320" y="228" text-anchor="middle" font-size="10.5" fill="var(--dg-d)">the six nearest ground points, averaged → 122.2 m beneath this point</text>
  <text x="40" y="250" font-size="10.5" fill="var(--dg-muted)">with count 1 the estimate is a single return and inherits that one return’s error in full</text>
</svg>

## Prerequisites and Assumptions

| Requirement | Detail |
|---|---|
| PDAL | 2.4+ |
| Classification 2 present | the filter measures against ground-classified points and nothing else |
| Projected metric CRS | `max_distance` is in CRS units |
| Memory | the stage builds an index over the ground points and does not stream |
| Clean input | blunders in the ground class corrupt every neighbour that uses them |

## Step-by-Step Implementation

### Step 1 — Confirm ground exists

```bash
pdal info tile.laz --stats --dimensions Classification | grep -i counts
```

If class 2 is absent, `hag_nn` writes zero everywhere and reports success.

### Step 2 — Choose `count`

Six is a good default. One makes each height depend on a single ground return. Above about eight the surface stops improving and the search cost keeps rising.

### Step 3 — Bound the search with `max_distance`

```json
{"type": "filters.hag_nn", "count": 6, "max_distance": 25.0}
```

Without it, a point over a large ground-free area searches arbitrarily far and produces a height measured against terrain a hundred metres away.

### Step 4 — Decide about extrapolation deliberately

`allow_extrapolation: false` leaves points beyond the ground hull unestimated. That is usually right: a gap you can see beats a number you cannot trust.

### Step 5 — Persist the dimension

```json
{"type": "writers.las", "extra_dims": "HeightAboveGround=float",
 "minor_version": 4, "dataformat_id": 6}
```

## Complete Working Example

```python
"""Compute height above ground and verify it against the ground class."""
from __future__ import annotations

import json
import logging
from pathlib import Path

import numpy as np
import pdal

LOG = logging.getLogger("hag")


def normalise(src: Path, dst: Path, count: int = 6, max_distance: float = 25.0) -> int:
    spec = json.dumps({"pipeline": [
        {"type": "readers.las", "filename": str(src)},
        {"type": "filters.hag_nn", "count": count,
         "max_distance": max_distance, "allow_extrapolation": False},
        {"type": "writers.las", "filename": str(dst), "compression": "laszip",
         "minor_version": 4, "dataformat_id": 6,
         "extra_dims": "HeightAboveGround=float", "forward": "all"},
    ]})
    return pdal.Pipeline(spec).execute()


def verify(path: Path) -> dict:
    p = pdal.Pipeline(json.dumps({"pipeline": [
        {"type": "readers.las", "filename": str(path)}]}))
    p.execute()
    arr = p.arrays[0]

    if "HeightAboveGround" not in arr.dtype.names:
        raise AssertionError("dimension absent — extra_dims was not set on the writer")

    hag = arr["HeightAboveGround"]
    ground = hag[arr["Classification"] == 2]
    if len(ground) == 0:
        raise AssertionError("no ground-classified points — classify before running hag_nn")

    ground_median = float(np.median(ground))
    if abs(ground_median) > 0.10:
        raise AssertionError(
            f"ground sits at {ground_median:.2f} m rather than zero — the classifier is suspect"
        )

    return {
        "points": int(len(hag)),
        "ground_median": round(ground_median, 3),
        "negative_fraction": round(float((hag < -0.5).mean()), 5),
        "p99": round(float(np.percentile(hag, 99)), 2),
        "max": round(float(hag.max()), 2),
    }


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    normalise(Path("classified.laz"), Path("normalised.laz"))
    print(json.dumps(verify(Path("normalised.laz")), indent=2))
```

<svg viewBox="0 0 720 250" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="A canopy point over a large ground-free area, searched with and without a distance cap" style="width:100%;max-width:720px;display:block;margin:1.6rem auto">
  <title>What max_distance stops happening</title>
  <desc>A canopy point in the middle of a wide closed-canopy patch. Without a distance cap the nearest ground neighbours are eighty metres away on the far side of a slope, and the height is computed against terrain that has nothing to do with this location. With a twenty-five metre cap the point is simply left unestimated, which is visible rather than plausible.</desc>
  <rect x="0" y="0" width="720" height="250" fill="var(--dg-bg)" rx="10"/>
  <path d="M40 190 L200 176 L360 150 L520 120 L680 104" fill="none" stroke="var(--dg-line)" stroke-width="2"/>
  <ellipse cx="360" cy="120" rx="150" ry="40" fill="var(--dg-d-soft)" stroke="var(--dg-d)" stroke-width="1.3"/>
  <text x="360" y="124" text-anchor="middle" font-size="10.5" fill="var(--dg-text)">closed canopy — no ground returns</text>
  <circle cx="360" cy="76" r="6" fill="var(--dg-c-soft)" stroke="var(--dg-c)" stroke-width="2"/>
  <circle cx="150" cy="182" r="4" fill="var(--dg-d)"/>
  <circle cx="570" cy="114" r="4" fill="var(--dg-d)"/>
  <line x1="360" y1="82" x2="152" y2="178" stroke="var(--dg-e)" stroke-width="1.5" stroke-dasharray="5 4"/>
  <line x1="360" y1="82" x2="566" y2="112" stroke="var(--dg-e)" stroke-width="1.5" stroke-dasharray="5 4"/>
  <text x="240" y="60" font-size="10.5" fill="var(--dg-e)">nearest ground: 80 m away, and 12 m lower</text>
  <text x="40" y="222" font-size="10.5" fill="var(--dg-muted)">without max_distance this point reports a canopy height of 34 m; with a 25 m cap it reports nothing,</text>
  <text x="40" y="240" font-size="10.5" fill="var(--dg-muted)">and the gap in the raster tells the truth about what the acquisition captured.</text>
</svg>

## Key Parameter Table

| Parameter | Type | Default | Guidance |
|---|---|---|---|
| `count` | int | 1 | 4–8; one makes every height depend on a single return |
| `max_distance` | float | unbounded | 15–30 m for airborne forestry; always set it |
| `allow_extrapolation` | bool | false | Leave false unless you can defend an invented ground surface |
| `ground_class` | int | 2 | Change only if your schema differs from ASPRS |
| output dimension | — | `HeightAboveGround` | Must be listed in `extra_dims` to reach the file |

## Verification

**Ground is at zero.** The strongest single check, asserted above. A systematic offset means the ground class is wrong, not the filter.

**The dimension reached the file.** Also asserted — the failure mode where everything works in memory and nothing is written.

**Negative heights are rare.** A handful is normal around breaklines. A percent or more below −0.5 m means blunders in the ground class.

**Heights are physically plausible.** The 99th percentile against the tallest species locally.

<svg viewBox="28 95 660 183" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Estimated ground surface under four values of the count parameter" style="width:100%;max-width:720px;display:block;margin:1.6rem auto">
  <title>What count does to the interpolated ground</title>
  <desc>The interpolated ground surface beneath a canopy patch, drawn for four values of count. With one neighbour the surface is jagged and follows every individual ground return, including a low blunder. With four it is smoother. With eight it is smooth but has begun to cut the corner on a real break in slope. The true terrain is drawn for comparison.</desc>
  <rect x="28" y="95" width="660" height="183" fill="var(--dg-bg)" rx="10"/>
  <path d="M50 176 L150 172 L250 166 L330 148 L420 142 L520 138 L660 132" fill="none" stroke="var(--dg-line)" stroke-width="2.4"/>
  <text x="666" y="128" text-anchor="end" font-size="10.5" fill="var(--dg-text)">true terrain</text>
  <path d="M50 180 L110 168 L150 186 L210 170 L250 164 L300 178 L330 146 L380 152 L420 140 L470 144 L520 136 L580 142 L660 130" fill="none" stroke="var(--dg-e)" stroke-width="1.8"/>
  <text x="60" y="206" font-size="10.5" fill="var(--dg-e)">count 1 — follows every return, blunders included</text>
  <path d="M50 178 L150 174 L250 168 L330 152 L420 144 L520 139 L660 133" fill="none" stroke="var(--dg-d)" stroke-width="1.8" stroke-dasharray="6 4"/>
  <text x="360" y="206" font-size="10.5" fill="var(--dg-d)">count 6 — smooth, still follows the break</text>
  <path d="M50 176 L200 168 L350 154 L500 142 L660 134" fill="none" stroke="var(--dg-c)" stroke-width="1.8" stroke-dasharray="2 4"/>
  <text x="60" y="228" font-size="10.5" fill="var(--dg-c)">count 20 — smoother, and has cut the corner on a real slope break</text>
  <text x="60" y="252" font-size="10.5" fill="var(--dg-muted)">smoothing the ground raises canopy heights above concave terrain</text>
</svg>

## Gotchas and Edge Cases

**All heights zero, no error.** No ground class. This is the single most common report, and the fix is upstream.

**A ring of tall values around a clearing.** Extrapolation at the hull edge. Turn it off.

**The stage dominates the runtime.** Expected: it is a nearest-neighbour search per non-ground point. Reduce the input before it rather than tuning it.

**Buildings become "canopy".** `hag_nn` measures height above ground regardless of what the point struck. If the product is about vegetation, filter to the vegetation classes after normalising — the codes are in [understanding ASPRS classification codes](https://www.pythonlidar.com/point-cloud-data-standards-fundamentals/asprs-classification-codes/understanding-asprs-classification-codes/).

## Frequently Asked Questions

**Why is every height above ground zero?**

Because no points carry Classification 2. The filter measures against ground-classified points, and with none present it has nothing to subtract, so it writes zero and the pipeline succeeds. Classification has to happen before the stage, in the same pipeline or an earlier one.

**What does the count parameter actually change?**

How many ground returns are averaged to estimate the ground beneath each point. With one, every height inherits that single return’s error at full amplitude. With six the estimate is smooth and still follows real breaks in slope. Above about eight the surface stops improving and starts cutting corners on concave terrain.

**Should I set max_distance?**

Always. Without it a point over a large ground-free area searches arbitrarily far and ends up measured against terrain a hundred metres away, which produces a confident and meaningless number. Fifteen to thirty metres suits most airborne forestry work.

**Why do buildings appear in my canopy height model?**

Because height above ground is exactly that — it does not care what the point struck. Filter to the vegetation classes after normalising if the product is about vegetation; the stage itself is deliberately agnostic.

---

## Related

- [Canopy Height Models with filters.hag_nn](https://www.pythonlidar.com/ground-filtering-dtm-dsm-generation/canopy-height-models/) — the parent workflow this stage sits inside
- [Rasterizing a Canopy Height Model from HAG](https://www.pythonlidar.com/ground-filtering-dtm-dsm-generation/canopy-height-models/rasterizing-a-canopy-height-model-from-hag/) — turning the normalised cloud into a raster
- [Extracting Individual Tree Heights from a CHM](https://www.pythonlidar.com/ground-filtering-dtm-dsm-generation/canopy-height-models/extracting-individual-tree-heights-from-a-chm/) — what the raster can and cannot tell you about single trees
- [SMRF Ground Classification](https://www.pythonlidar.com/ground-filtering-dtm-dsm-generation/smrf-ground-classification/) — the classification every height is measured against
- [Measuring Ground Point Density Under Canopy](https://www.pythonlidar.com/point-cloud-data-standards-fundamentals/point-density-metrics/measuring-ground-point-density-under-canopy/) — whether enough ground returns exist to measure against at all
