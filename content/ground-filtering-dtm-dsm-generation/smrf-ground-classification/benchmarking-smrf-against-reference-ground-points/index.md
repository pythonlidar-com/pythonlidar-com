---
title: "Benchmarking SMRF Against Reference Ground Points"
description: "Interpolate the classified surface at surveyed control points and report bias, RMSE and the tail by terrain class — because a single aggregate number hides the trade every parameter change makes."
slug: "benchmarking-smrf-against-reference-ground-points"
type: "howto"
breadcrumb: "Benchmarking SMRF Against Control"
datePublished: "2026-08-07"
dateModified: "2026-08-07"
---

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Article",
      "headline": "Benchmarking SMRF Against Reference Ground Points",
      "description": "Interpolate the classified surface at surveyed control points and report bias, RMSE and the tail by terrain class \u2014 because a single aggregate number hides the trade every parameter change makes.",
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
          "name": "SMRF Ground Classification",
          "item": "https://www.pythonlidar.com/ground-filtering-dtm-dsm-generation/smrf-ground-classification/"
        },
        {
          "@type": "ListItem",
          "position": 4,
          "name": "Benchmarking SMRF Against Control",
          "item": "https://www.pythonlidar.com/ground-filtering-dtm-dsm-generation/smrf-ground-classification/benchmarking-smrf-against-reference-ground-points/"
        }
      ]
    },
    {
      "@type": "HowTo",
      "name": "Benchmark a ground classification against surveyed control points",
      "step": [
        {
          "@type": "HowToStep",
          "name": "Match the vertical datums",
          "text": "Confirm control and cloud share a vertical CRS before comparing anything."
        },
        {
          "@type": "HowToStep",
          "name": "Keep only ground-classified points",
          "text": "Select Classification 2 so the surface being tested is the one the pipeline produced."
        },
        {
          "@type": "HowToStep",
          "name": "Interpolate the surface at each control point",
          "text": "Average ground returns within a small radius, and record control points with no ground nearby rather than dropping them."
        },
        {
          "@type": "HowToStep",
          "name": "Difference and group by terrain class",
          "text": "Compute signed differences and split them into open, sloped and vegetated groups."
        },
        {
          "@type": "HowToStep",
          "name": "Report bias, RMSE and the 95th percentile",
          "text": "Three statistics per class, because each exposes a different failure."
        }
      ]
    },
    {
      "@type": "FAQPage",
      "mainEntity": [
        {
          "@type": "Question",
          "name": "Why report errors by terrain class?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Because ground classification has two opposing error modes and one aggregate number cannot express both. Two parameter sets can produce almost identical overall RMSE while one is twice as accurate on open ground and far worse on slopes. The breakdown is what makes the comparison actionable."
          }
        },
        {
          "@type": "Question",
          "name": "What should I do with control points where no ground was found?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Count them. A control point with no ground return nearby is the clearest possible omission signal, and dropping it from the statistics converts the worst failure mode into a better-looking RMSE."
          }
        },
        {
          "@type": "Question",
          "name": "My benchmark shows a uniform 30 metre bias \u2014 what is wrong?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "The datums, almost certainly. Control in orthometric heights compared against a cloud in ellipsoidal heights produces exactly this, and it looks like a catastrophic classification failure. Check the vertical CRS on both sides before touching any parameter."
          }
        },
        {
          "@type": "Question",
          "name": "How many control points do I need?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "At least thirty per terrain class for the RMSE to mean anything. A benchmark with ten points in a class reports noise, and a benchmark made entirely of road-centreline points reports a flattering number that says nothing about vegetated ground."
          }
        }
      ]
    }
  ]
}
</script>

**TL;DR:** Interpolate the classified ground surface at each control point, difference it against the surveyed elevation, and report RMSE, mean bias and the 95th percentile separately for open, sloped and vegetated terrain — a single aggregate number hides exactly the failure you are looking for.

## Context and Motivation

This guide is part of [SMRF Ground Classification in PDAL](https://www.pythonlidar.com/ground-filtering-dtm-dsm-generation/smrf-ground-classification/). Tuning without measurement is guesswork with confidence, and the measurement is not difficult — it just has to be set up so it can fail.

The subtlety is that ground classification has two independent error modes and one aggregate statistic cannot express both. Omission is real ground rejected, which shows up as voids and, where interpolation fills them, as a surface pulled toward whatever survived. Commission is objects accepted, which shows up as a surface pulled up. A parameter change that halves one usually increases the other, so an RMSE that improved tells you nothing about which trade you made. Reporting them separately, and by terrain class, is what makes the number actionable.

<svg viewBox="0 0 720 262" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Ground surface error broken down by terrain class for two parameter sets" style="width:100%;max-width:720px;display:block;margin:1.6rem auto">
  <title>One aggregate number, three different stories</title>
  <desc>Ground surface RMSE for two SMRF parameter sets, broken down by terrain class. The aggregate RMSE is nearly identical at 0.13 and 0.14 metres. Underneath, the conservative settings are twice as accurate on open ground and much worse on steep slopes, while the relaxed settings are the reverse. The aggregate figure conceals the whole comparison.</desc>
  <rect x="0" y="0" width="720" height="262" fill="var(--dg-bg)" rx="10"/>
  <text x="200" y="38" font-size="10.5" fill="var(--dg-muted)">RMSE against 412 surveyed control points</text>
  <rect x="480" y="28" width="14" height="12" rx="2" fill="var(--dg-a-soft)" stroke="var(--dg-a)" stroke-width="1.2"/>
  <text x="500" y="38" font-size="10.5" fill="var(--dg-muted)">slope 0.15</text>
  <rect x="600" y="28" width="14" height="12" rx="2" fill="var(--dg-c-soft)" stroke="var(--dg-c)" stroke-width="1.2"/>
  <text x="620" y="38" font-size="10.5" fill="var(--dg-muted)">slope 0.35</text>
  <text x="180" y="72" text-anchor="end" font-size="11.5" fill="var(--dg-text)">aggregate</text>
  <rect x="190" y="56" width="130" height="16" rx="3" fill="var(--dg-a-soft)" stroke="var(--dg-a)" stroke-width="1.1"/>
  <text x="330" y="68" font-size="10" fill="var(--dg-muted)">0.13 m</text>
  <rect x="190" y="76" width="140" height="16" rx="3" fill="var(--dg-c-soft)" stroke="var(--dg-c)" stroke-width="1.1"/>
  <text x="340" y="88" font-size="10" fill="var(--dg-muted)">0.14 m</text>
  <text x="180" y="126" text-anchor="end" font-size="11.5" fill="var(--dg-text)">open, flat</text>
  <rect x="190" y="110" width="60" height="16" rx="3" fill="var(--dg-a-soft)" stroke="var(--dg-a)" stroke-width="1.1"/>
  <text x="260" y="122" font-size="10" fill="var(--dg-muted)">0.06 m</text>
  <rect x="190" y="130" width="120" height="16" rx="3" fill="var(--dg-c-soft)" stroke="var(--dg-c)" stroke-width="1.1"/>
  <text x="320" y="142" font-size="10" fill="var(--dg-muted)">0.12 m</text>
  <text x="180" y="180" text-anchor="end" font-size="11.5" fill="var(--dg-text)">steep slope</text>
  <rect x="190" y="164" width="290" height="16" rx="3" fill="var(--dg-a-soft)" stroke="var(--dg-a)" stroke-width="1.1"/>
  <text x="490" y="176" font-size="10" fill="var(--dg-e)">0.29 m — ridges stripped</text>
  <rect x="190" y="184" width="110" height="16" rx="3" fill="var(--dg-c-soft)" stroke="var(--dg-c)" stroke-width="1.1"/>
  <text x="310" y="196" font-size="10" fill="var(--dg-muted)">0.11 m</text>
  <text x="180" y="234" text-anchor="end" font-size="11.5" fill="var(--dg-text)">under canopy</text>
  <rect x="190" y="218" width="180" height="16" rx="3" fill="var(--dg-a-soft)" stroke="var(--dg-a)" stroke-width="1.1"/>
  <text x="380" y="230" font-size="10" fill="var(--dg-muted)">0.18 m</text>
  <rect x="190" y="238" width="240" height="16" rx="3" fill="var(--dg-c-soft)" stroke="var(--dg-c)" stroke-width="1.1"/>
  <text x="440" y="250" font-size="10" fill="var(--dg-muted)">0.24 m</text>
</svg>

## Prerequisites and Assumptions

| Requirement | Detail |
|---|---|
| Control points | surveyed elevations, with a documented vertical datum |
| Matching datums | control and cloud in the same vertical CRS, per [setting a vertical CRS](https://www.pythonlidar.com/point-cloud-data-standards-fundamentals/coordinate-reference-systems/setting-a-vertical-crs-on-a-point-cloud/) |
| Terrain classes | each control point labelled open, sloped or vegetated |
| PDAL and `numpy` | for interpolation and statistics |
| Enough points per class | 30 is a working minimum; 10 tells you nothing |

The datum row is where most benchmarks go wrong before they start. Control in orthometric heights against a cloud in ellipsoidal heights produces a uniform thirty-metre bias that looks like a catastrophic classification failure.

## Step-by-Step Implementation

### Step 1 — Classify and keep ground only

```json
{"type": "filters.range", "limits": "Classification[2:2]"}
```

### Step 2 — Interpolate the surface at each control location

Take the mean elevation of ground returns within a small radius — one metre is typical — of each control point. A control point with no ground returns nearby is an omission failure and must be counted as such rather than dropped.

### Step 3 — Difference and split by class

Signed differences, so the mean is a bias and not another magnitude.

### Step 4 — Report bias, RMSE and the tail, per class

The 95th percentile of absolute error is what a client notices; the mean bias is what a systematic problem looks like.

## Complete Working Example

```python
"""Benchmark a classified ground surface against surveyed control points."""
from __future__ import annotations

import json
from pathlib import Path

import numpy as np
import pdal


def ground_points(src: Path) -> np.ndarray:
    p = pdal.Pipeline(json.dumps({"pipeline": [
        {"type": "readers.las", "filename": str(src)},
        {"type": "filters.range", "limits": "Classification[2:2]"},
    ]}))
    p.execute()
    return p.arrays[0]


def surface_at(ground: np.ndarray, x: float, y: float, radius: float = 1.0) -> float | None:
    dx = ground["X"] - x
    dy = ground["Y"] - y
    near = (dx * dx + dy * dy) <= radius * radius
    if not near.any():
        return None
    return float(ground["Z"][near].mean())


def benchmark(src: Path, control: list[dict], radius: float = 1.0) -> dict:
    ground = ground_points(src)
    per_class: dict[str, list[float]] = {}
    missing: dict[str, int] = {}

    for pt in control:
        cls = pt["terrain"]
        z = surface_at(ground, pt["x"], pt["y"], radius)
        if z is None:
            missing[cls] = missing.get(cls, 0) + 1
            continue
        per_class.setdefault(cls, []).append(z - pt["z"])

    out = {}
    for cls, diffs in sorted(per_class.items()):
        d = np.asarray(diffs)
        out[cls] = {
            "n": int(d.size),
            "no_ground_nearby": missing.get(cls, 0),
            "bias_m": round(float(d.mean()), 3),
            "rmse_m": round(float(np.sqrt((d ** 2).mean())), 3),
            "p95_abs_m": round(float(np.percentile(np.abs(d), 95)), 3),
        }
    all_diffs = np.concatenate([np.asarray(v) for v in per_class.values()])
    out["aggregate"] = {
        "n": int(all_diffs.size),
        "bias_m": round(float(all_diffs.mean()), 3),
        "rmse_m": round(float(np.sqrt((all_diffs ** 2).mean())), 3),
    }
    return out


if __name__ == "__main__":
    control = json.loads(Path("control.json").read_text())
    print(json.dumps(benchmark(Path("classified.laz"), control), indent=2))
```

<svg viewBox="0 0 720 258" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Omission against commission for six SMRF parameter sets" style="width:100%;max-width:720px;display:block;margin:1.6rem auto">
  <title>Every parameter set is a point on one trade-off</title>
  <desc>Six SMRF parameter sets plotted with omission — real ground rejected — on one axis and commission — objects accepted as ground — on the other. They fall along a curve: no setting reduces both at once. The set closest to the origin is the best compromise for this terrain, and which point on the curve you want depends on whether voids or bumps hurt more downstream.</desc>
  <rect x="0" y="0" width="720" height="258" fill="var(--dg-bg)" rx="10"/>
  <line x1="90" y1="40" x2="90" y2="200" stroke="var(--dg-line)" stroke-width="1.5"/>
  <line x1="90" y1="200" x2="670" y2="200" stroke="var(--dg-line)" stroke-width="1.5"/>
  <polyline points="130,58 200,92 290,126 390,152 500,172 620,186" fill="none" stroke="var(--dg-line-soft)" stroke-width="1.6" stroke-dasharray="6 4"/>
  <circle cx="130" cy="58" r="6" fill="var(--dg-e-soft)" stroke="var(--dg-e)" stroke-width="2"/>
  <text x="142" y="54" font-size="10" fill="var(--dg-muted)">slope 0.05</text>
  <circle cx="200" cy="92" r="6" fill="var(--dg-c-soft)" stroke="var(--dg-c)" stroke-width="2"/>
  <text x="212" y="88" font-size="10" fill="var(--dg-muted)">0.10</text>
  <circle cx="290" cy="126" r="7" fill="var(--dg-d-soft)" stroke="var(--dg-d)" stroke-width="2.4"/>
  <text x="302" y="122" font-size="10" fill="var(--dg-d)">0.15 — best compromise here</text>
  <circle cx="390" cy="152" r="6" fill="var(--dg-c-soft)" stroke="var(--dg-c)" stroke-width="2"/>
  <text x="402" y="148" font-size="10" fill="var(--dg-muted)">0.25</text>
  <circle cx="500" cy="172" r="6" fill="var(--dg-c-soft)" stroke="var(--dg-c)" stroke-width="2"/>
  <text x="512" y="168" font-size="10" fill="var(--dg-muted)">0.35</text>
  <circle cx="620" cy="186" r="6" fill="var(--dg-e-soft)" stroke="var(--dg-e)" stroke-width="2"/>
  <text x="612" y="176" text-anchor="end" font-size="10" fill="var(--dg-muted)">0.50</text>
  <text x="380" y="222" text-anchor="middle" font-size="11.5" fill="var(--dg-text)">commission — objects kept as ground</text>
  <text x="30" y="120" text-anchor="middle" font-size="11.5" fill="var(--dg-text)" transform="rotate(-90 30 120)">omission</text>
  <text x="90" y="246" font-size="10.5" fill="var(--dg-muted)">an RMSE that improved tells you the point moved; it does not tell you which way along the curve</text>
</svg>

## Key Parameter Table

| Choice | Value | Why |
|---|---|---|
| search radius | 1.0 m | Large enough to find returns, small enough not to smooth terrain |
| statistic | bias, RMSE, p95 | Three numbers, three different failures |
| grouping | terrain class | The whole point; aggregates hide the trade |
| missing points | counted, not dropped | A control point with no ground nearby is the omission signal |
| minimum n per class | 30 | Below that the RMSE is noise |

## Verification

**No uniform bias.** A mean of −30 m across every class is a datum problem, not a classifier problem.

**Missing counts are reported.** Silently dropping control points where classification found no ground turns the worst failure into a better-looking number.

**The comparison is fair.** Both parameter sets benchmarked against the same control on the same tile, with only the parameters changed.

<svg viewBox="0 0 720 246" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="How 412 control points are distributed across three terrain classes" style="width:100%;max-width:720px;display:block;margin:1.6rem auto">
  <title>A benchmark is only as honest as its control</title>
  <desc>The 412 control points in this benchmark split unevenly: 268 on open flat ground, 96 on slopes and 48 under canopy. The class that most needs measuring has the fewest points, which is typical because surveying under canopy is hard — and it means the aggregate RMSE is dominated by the easiest terrain.</desc>
  <rect x="0" y="0" width="720" height="246" fill="var(--dg-bg)" rx="10"/>
  <text x="220" y="84" text-anchor="end" font-size="11" fill="var(--dg-text)">open, flat</text>
  <rect x="230" y="64" width="233" height="30" rx="4" fill="var(--dg-d-soft)" stroke="var(--dg-d)" stroke-width="1.2"/>
  <text x="471" y="84" font-size="10.5" fill="var(--dg-muted)">268 — 65% of the control</text>
  <text x="220" y="132" text-anchor="end" font-size="11" fill="var(--dg-text)">sloped</text>
  <rect x="230" y="112" width="84" height="30" rx="4" fill="var(--dg-c-soft)" stroke="var(--dg-c)" stroke-width="1.2"/>
  <text x="322" y="132" font-size="10.5" fill="var(--dg-muted)">96 points</text>
  <text x="220" y="180" text-anchor="end" font-size="11" fill="var(--dg-text)">under canopy</text>
  <rect x="230" y="160" width="42" height="30" rx="4" fill="var(--dg-e-soft)" stroke="var(--dg-e)" stroke-width="1.2"/>
  <text x="280" y="180" font-size="10.5" fill="var(--dg-muted)">48 — the class that matters most</text>
  <text x="250" y="46" font-size="10.5" fill="var(--dg-muted)">where the surveyor could actually stand</text>
  <text x="60" y="222" font-size="10.5" fill="var(--dg-muted)">report per-class statistics and the per-class counts together — a 0.24 m RMSE from 48 points is a</text>
  <text x="60" y="238" font-size="10.5" fill="var(--dg-muted)">different claim from the same number out of 400, and only one of them supports a parameter change.</text>
</svg>

## Gotchas and Edge Cases

**Control points on hard surfaces are easy.** A benchmark made only of road-centreline points reports a flattering RMSE that says nothing about vegetated terrain.

**Interpolation radius interacts with slope.** On steep ground a one-metre radius spans real elevation change, which appears as error. Shrink it or model the local slope.

**A better RMSE can be a worse surface.** Halving commission by rejecting more ground improves nothing if it strips ridges — which is precisely what the per-class breakdown reveals.

## Frequently Asked Questions

**Why report errors by terrain class?**

Because ground classification has two opposing error modes and one aggregate number cannot express both. Two parameter sets can produce almost identical overall RMSE while one is twice as accurate on open ground and far worse on slopes. The breakdown is what makes the comparison actionable.

**What should I do with control points where no ground was found?**

Count them. A control point with no ground return nearby is the clearest possible omission signal, and dropping it from the statistics converts the worst failure mode into a better-looking RMSE.

**My benchmark shows a uniform 30 metre bias — what is wrong?**

The datums, almost certainly. Control in orthometric heights compared against a cloud in ellipsoidal heights produces exactly this, and it looks like a catastrophic classification failure. Check the vertical CRS on both sides before touching any parameter.

**How many control points do I need?**

At least thirty per terrain class for the RMSE to mean anything. A benchmark with ten points in a class reports noise, and a benchmark made entirely of road-centreline points reports a flattering number that says nothing about vegetated ground.

---

## Related

- [SMRF Ground Classification](https://www.pythonlidar.com/ground-filtering-dtm-dsm-generation/smrf-ground-classification/) — the classifier being measured
- [Tuning SMRF for Forested Terrain](https://www.pythonlidar.com/ground-filtering-dtm-dsm-generation/smrf-ground-classification/tuning-smrf-for-forested-terrain/) — the parameter changes this benchmark evaluates
- [SMRF vs PMF for Dense Urban LiDAR](https://www.pythonlidar.com/ground-filtering-dtm-dsm-generation/smrf-ground-classification/smrf-vs-pmf-for-dense-urban-lidar/) — the same comparison between two algorithms
- [Setting a Vertical CRS on a Point Cloud](https://www.pythonlidar.com/point-cloud-data-standards-fundamentals/coordinate-reference-systems/setting-a-vertical-crs-on-a-point-cloud/) — the datum agreement every benchmark depends on
- [Ground Filtering and DTM/DSM Generation with PDAL](https://www.pythonlidar.com/ground-filtering-dtm-dsm-generation/) — the section overview
