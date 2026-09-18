---
title: "Fitting Catenary Curves to Conductor Points"
description: "Fit a catenary to each detected power-line span with SciPy: project points onto the span axis, fit z = z0 + a(cosh((s − s0)/a) − 1) robustly, and report sag, lowest point and residuals for QA."
slug: "fitting-catenary-curves-to-conductor-points"
type: "howto"
breadcrumb: "Catenary Fitting"
datePublished: "2026-09-18"
dateModified: "2026-09-18"
---

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Article",
      "headline": "Fitting Catenary Curves to Conductor Points",
      "description": "Fit a catenary to each detected power-line span with SciPy: project points onto the span axis, fit z = z0 + a(cosh((s \u2212 s0)/a) \u2212 1) robustly, and report sag, lowest point and residuals for QA.",
      "datePublished": "2026-09-18",
      "dateModified": "2026-09-18",
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
          "name": "Classification & Feature Extraction",
          "item": "https://www.pythonlidar.com/lidar-classification-feature-extraction/"
        },
        {
          "@type": "ListItem",
          "position": 3,
          "name": "Power Line Detection",
          "item": "https://www.pythonlidar.com/lidar-classification-feature-extraction/power-line-detection/"
        },
        {
          "@type": "ListItem",
          "position": 4,
          "name": "Catenary Fitting",
          "item": "https://www.pythonlidar.com/lidar-classification-feature-extraction/power-line-detection/fitting-catenary-curves-to-conductor-points/"
        }
      ]
    },
    {
      "@type": "HowTo",
      "name": "Fit catenary curves to LiDAR conductor points",
      "step": [
        {
          "@type": "HowToStep",
          "name": "Find the span axis",
          "text": "Centre the plan coordinates and take the first right singular vector; it points along the span. Project each point onto it to get s, the horizontal distance along the span."
        },
        {
          "@type": "HowToStep",
          "name": "Separate parallel conductors",
          "text": "Project onto the perpendicular vector as well. Several phases show up as distinct bands in that offset; split them with a 1D clustering (a histogram with a 0.3 m bin and gaps between peaks is enough) and fit each separately."
        },
        {
          "@type": "HowToStep",
          "name": "Seed the fit",
          "text": "Good starting values make the fit fast and stable: s0 at the s of the lowest point, z0 at the minimum z, and a from a parabola fit, since for shallow sag z \u2248 z0 + (s \u2212 s0)\u00b2 / (2a)."
        },
        {
          "@type": "HowToStep",
          "name": "Fit robustly",
          "text": "Use least_squares with loss=\"soft_l1\" and f_scale=0.1, which down-weights the occasional canopy or insulator point that slipped through detection."
        },
        {
          "@type": "HowToStep",
          "name": "Derive engineering quantities",
          "text": "Evaluate the curve at the span ends, compute sag as the largest vertical distance between the chord and the curve, and record the residual RMS."
        }
      ]
    },
    {
      "@type": "FAQPage",
      "mainEntity": [
        {
          "@type": "Question",
          "name": "Why fit a catenary instead of a parabola?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "A parabola is a good approximation for shallow sag and is used to seed the fit, but it diverges from the true shape on long or slack spans. The catenary is the physically correct shape for a uniform cable under its own weight and costs almost nothing extra to fit."
          }
        },
        {
          "@type": "Question",
          "name": "How many points does a span need for a reliable fit?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "A dozen well-distributed points will fit, but thirty or more spread along the whole span give stable sag and low-point estimates. Points clustered at one end constrain the curve poorly, however many there are."
          }
        },
        {
          "@type": "Question",
          "name": "What does a large residual mean?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Usually that the span group contains something else: a second conductor, an insulator string, or canopy points below the wire. Inspect the residual pattern along the span; clustered negative residuals point to vegetation."
          }
        },
        {
          "@type": "Question",
          "name": "Can the fit tell me the conductor tension?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Only in combination with the conductor's weight per metre, which the point cloud does not know. With that value, horizontal tension equals a times the weight per unit length."
          }
        }
      ]
    }
  ]
}
</script>

**TL;DR:** For each span, find the horizontal axis with an SVD of the plan coordinates, project points to a distance `s` along it, fit `z = z0 + a·(cosh((s − s0)/a) − 1)` with `scipy.optimize.least_squares` using a soft-L1 loss, then report the low point `(s0, z0)`, the sag relative to the chord between the ends, and the residual RMS — which should be a few centimetres for a clean span.

## Context and Motivation

This guide is part of [Power Line Detection in LiDAR Point Clouds](https://www.pythonlidar.com/lidar-classification-feature-extraction/power-line-detection/). Detected conductor points are a noisy, gappy sample of a curve that physics tells us is a catenary: a flexible cable of uniform weight hanging between two supports. Fitting that curve does three jobs at once. It fills the gaps between returns so clearance can be measured anywhere along the span, not just where the laser happened to hit. It gives engineering numbers — the lowest point and the sag — that utilities track against design values and thermal ratings. And its residuals are a quality check: a span that does not fit a catenary is two spans, or one span with canopy points mixed in.

The catenary parameter `a` is the ratio of horizontal tension to weight per unit length. Large `a` means a tight, flat wire; small `a` means a deep sag. On spans of 50 to 400 metres, `a` typically ranges from several hundred to a few thousand metres.

<svg viewBox="0 0 740 220" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Catenary fitted to conductor points with sag and low point annotated" style="width:100%;max-width:740px;display:block;margin:1.6rem auto">
  <title>The quantities a fit gives you</title>
  <desc>A span between two attachment points at different heights. Scattered conductor returns follow a fitted catenary curve. A dashed chord joins the two attachment points. The lowest point of the curve is marked, offset toward the lower attachment. The sag is shown as the vertical distance from the chord to the curve at mid-span.</desc>
  <rect x="0" y="0" width="740" height="220" fill="var(--dg-bg)" rx="10"/>
  <line x1="60" y1="40" x2="680" y2="70" stroke="var(--dg-line)" stroke-width="1.3" stroke-dasharray="6 4"/>
  <path d="M60 40 C200 150 480 170 680 70" fill="none" stroke="var(--dg-a)" stroke-width="2"/>
  <g fill="var(--dg-c)"><circle cx="100" cy="72" r="3"/><circle cx="150" cy="100" r="3"/><circle cx="205" cy="118" r="3"/><circle cx="260" cy="131" r="3"/><circle cx="330" cy="140" r="3"/><circle cx="400" cy="141" r="3"/><circle cx="470" cy="134" r="3"/><circle cx="560" cy="115" r="3"/><circle cx="620" cy="97" r="3"/></g>
  <circle cx="370" cy="142" r="5" fill="none" stroke="var(--dg-e)" stroke-width="1.8"/>
  <text x="370" y="168" text-anchor="middle" font-size="10.5" fill="var(--dg-e)">low point (s0, z0)</text>
  <line x1="370" y1="55" x2="370" y2="137" stroke="var(--dg-d)" stroke-width="1.6"/>
  <text x="378" y="96" font-size="10.5" fill="var(--dg-d)">sag at mid-span</text>
  <text x="60" y="30" font-size="10.5" fill="var(--dg-muted)">attachment A</text>
  <text x="680" y="58" text-anchor="end" font-size="10.5" fill="var(--dg-muted)">attachment B</text>
  <text x="60" y="206" font-size="10.5" fill="var(--dg-muted)">dashed: chord between attachments · solid: fitted catenary · dots: LiDAR returns</text>
</svg>

## Prerequisites and Assumptions

- Conductor points grouped into spans, each with a span ID — the output of the [detection workflow](https://www.pythonlidar.com/lidar-classification-feature-extraction/power-line-detection/).
- Python with NumPy, SciPy 1.8+ and pandas.
- One conductor per span group. If a group holds several phases, split them first (Step 2).
- A projected CRS in metres, with Z in metres. Mixing feet and metres produces a plausible-looking but wrong `a`.

## Step-by-Step Implementation

### Step 1 — Find the span axis

Centre the plan coordinates and take the first right singular vector; it points along the span. Project each point onto it to get `s`, the horizontal distance along the span.

### Step 2 — Separate parallel conductors

Project onto the perpendicular vector as well. Several phases show up as distinct bands in that offset; split them with a 1D clustering (a histogram with a 0.3 m bin and gaps between peaks is enough) and fit each separately.

### Step 3 — Seed the fit

Good starting values make the fit fast and stable: `s0` at the `s` of the lowest point, `z0` at the minimum `z`, and `a` from a parabola fit, since for shallow sag `z ≈ z0 + (s − s0)² / (2a)`.

### Step 4 — Fit robustly

Use `least_squares` with `loss="soft_l1"` and `f_scale=0.1`, which down-weights the occasional canopy or insulator point that slipped through detection.

### Step 5 — Derive engineering quantities

Evaluate the curve at the span ends, compute sag as the largest vertical distance between the chord and the curve, and record the residual RMS.

## Complete Working Example

```python
"""Fit a catenary to each conductor span and report sag, low point and residuals."""
from __future__ import annotations

from dataclasses import dataclass

import numpy as np
import pandas as pd
from scipy.optimize import least_squares


@dataclass
class SpanFit:
    span: int
    a: float
    s0: float
    z0: float
    sag_m: float
    rms_m: float
    length_m: float
    n: int


def catenary(params: np.ndarray, s: np.ndarray) -> np.ndarray:
    a, s0, z0 = params
    return z0 + a * (np.cosh((s - s0) / a) - 1.0)


def fit_span(span_id: int, x: np.ndarray, y: np.ndarray, z: np.ndarray) -> SpanFit:
    xy = np.column_stack([x, y])
    centre = xy.mean(axis=0)
    _, _, vt = np.linalg.svd(xy - centre, full_matrices=False)
    s = (xy - centre) @ vt[0]

    # Seed from a parabola: z = c2 s^2 + c1 s + c0  ->  a = 1 / (2 c2)
    c2, c1, c0 = np.polyfit(s, z, 2)
    c2 = max(c2, 1e-5)
    s0_seed = -c1 / (2 * c2)
    seed = np.array([1.0 / (2 * c2), s0_seed, np.polyval([c2, c1, c0], s0_seed)])

    res = least_squares(lambda p: catenary(p, s) - z, seed, loss="soft_l1", f_scale=0.1,
                        bounds=([10.0, s.min() - 500, z.min() - 50],
                                [1e5, s.max() + 500, z.max() + 50]))
    a, s0, z0 = res.x
    resid = catenary(res.x, s) - z
    s_lo, s_hi = s.min(), s.max()
    grid = np.linspace(s_lo, s_hi, 500)
    curve = catenary(res.x, grid)
    chord = np.interp(grid, [s_lo, s_hi], [curve[0], curve[-1]])
    return SpanFit(span=span_id, a=float(a), s0=float(s0), z0=float(z0),
                   sag_m=float((chord - curve).max()),
                   rms_m=float(np.sqrt(np.mean(resid ** 2))),
                   length_m=float(s_hi - s_lo), n=len(z))


def fit_all(points: pd.DataFrame) -> pd.DataFrame:
    fits = [fit_span(int(sid), g.X.to_numpy(), g.Y.to_numpy(), g.Z.to_numpy())
            for sid, g in points.groupby("SpanId") if len(g) >= 12]
    df = pd.DataFrame([f.__dict__ for f in fits])
    df["suspect"] = df.rms_m > 0.25
    return df


if __name__ == "__main__":
    pts = pd.read_parquet("corridor_0082_spans.parquet")   # X, Y, Z, SpanId
    report = fit_all(pts)
    print(report.round(3).to_string(index=False))
```

A clean result looks like this — low residuals, `a` in the hundreds to thousands, and sag that scales with span length:

```text
 span        a       s0       z0  sag_m  rms_m  length_m    n  suspect
    3  1184.2   -12.61  212.874  4.912  0.038   214.66  318    False
    4   942.7     8.35  209.117  6.230  0.041   216.02  297    False
    7   611.3    -3.02  198.440  0.844  0.412    64.18  121     True
```

Span 7 is flagged: a short span with a large residual usually means a crown or an insulator string is still in the group.

## Key Parameter Table

| Parameter | Type | Default | Guidance |
|---|---|---|---|
| minimum points per span | int | 12 | Fewer gives unstable `a`; report such spans as unfitted |
| `loss` | string | `soft_l1` | Robust to a few outliers; `linear` for already-clean spans |
| `f_scale` | float, m | 0.1 | Residual size beyond which points are down-weighted |
| `a` bounds | m | 10–100,000 | Guards against runaway fits on nearly straight spans |
| suspect RMS | float, m | 0.25 | Above this, inspect the span for merged phases or clutter |

<svg viewBox="0 0 740 220" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Residuals along a span for a clean fit and a contaminated fit" style="width:100%;max-width:740px;display:block;margin:1.6rem auto">
  <title>Residuals tell you what went wrong</title>
  <desc>Two residual plots against distance along the span. The upper plot for a clean span shows residuals scattered evenly within plus or minus five centimetres of zero. The lower plot for a contaminated span shows a cluster of residuals around minus 0.8 metres over a short stretch, the signature of canopy points below the wire pulling the fit.</desc>
  <rect x="0" y="0" width="740" height="220" fill="var(--dg-bg)" rx="10"/>
  <text x="20" y="30" font-size="11" fill="var(--dg-text)">clean span</text>
  <line x1="120" y1="56" x2="700" y2="56" stroke="var(--dg-line)" stroke-width="1"/>
  <g fill="var(--dg-d)"><circle cx="140" cy="52" r="2.6"/><circle cx="180" cy="59" r="2.6"/><circle cx="220" cy="54" r="2.6"/><circle cx="260" cy="58" r="2.6"/><circle cx="300" cy="53" r="2.6"/><circle cx="340" cy="57" r="2.6"/><circle cx="380" cy="55" r="2.6"/><circle cx="420" cy="59" r="2.6"/><circle cx="460" cy="52" r="2.6"/><circle cx="500" cy="57" r="2.6"/><circle cx="540" cy="54" r="2.6"/><circle cx="580" cy="58" r="2.6"/><circle cx="620" cy="55" r="2.6"/><circle cx="660" cy="53" r="2.6"/></g>
  <text x="120" y="82" font-size="10" fill="var(--dg-muted)">RMS 0.04 m</text>
  <text x="20" y="120" font-size="11" fill="var(--dg-text)">contaminated</text>
  <line x1="120" y1="136" x2="700" y2="136" stroke="var(--dg-line)" stroke-width="1"/>
  <g fill="var(--dg-d)"><circle cx="140" cy="133" r="2.6"/><circle cx="180" cy="139" r="2.6"/><circle cx="220" cy="134" r="2.6"/><circle cx="260" cy="138" r="2.6"/><circle cx="500" cy="137" r="2.6"/><circle cx="540" cy="133" r="2.6"/><circle cx="580" cy="138" r="2.6"/><circle cx="620" cy="135" r="2.6"/><circle cx="660" cy="134" r="2.6"/></g>
  <g fill="var(--dg-e)"><circle cx="330" cy="186" r="2.6"/><circle cx="350" cy="192" r="2.6"/><circle cx="370" cy="184" r="2.6"/><circle cx="390" cy="190" r="2.6"/><circle cx="410" cy="187" r="2.6"/><circle cx="430" cy="193" r="2.6"/></g>
  <text x="450" y="200" font-size="10.5" fill="var(--dg-e)">canopy points ≈ −0.8 m</text>
  <text x="120" y="212" font-size="10" fill="var(--dg-muted)">RMS 0.41 m — flagged</text>
</svg>

## Verification

- **Residual RMS under 0.1 m** on most spans. Clean helicopter corridor data often achieves 0.03 to 0.05 m.
- **Low point between the attachments,** or just beyond the lower one on steeply inclined spans. A low point far outside the span means the fit converged on a nonsensical `a`.
- **Sag plausibility.** Sag scales roughly with the square of span length for a given tension; compare adjacent spans of similar length on the same circuit, which should have similar sag.
- **Re-fit after cleaning.** Drop points with residuals beyond three times the RMS and refit. If `a` changes by more than a few percent, the first fit was being pulled by outliers.

## Gotchas and Edge Cases

**Inclined spans.** When attachments differ in height, the low point can fall outside the span, and the lowest measured point is simply the lower attachment. That is physically correct, and the fit handles it — but report clearance along the whole span rather than at `s0`.

**Near-straight spans.** Very tight or very short spans barely sag, so `a` is poorly constrained and can run to the upper bound. Sag and residuals remain valid; `a` itself should not be reported.

**Temperature and load.** A fit describes the wire at the time of the flight. Engineering assessments rescale sag to maximum operating temperature using the conductor's properties, which is outside what the point cloud can tell you; record the flight time and weather with each fit.

<svg viewBox="0 0 740 190" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="An inclined span whose low point lies beyond the lower attachment" style="width:100%;max-width:740px;display:block;margin:1.6rem auto">
  <title>Low point outside the span</title>
  <desc>A steeply inclined span on a hillside. The upper attachment is high on the left and the lower attachment is low on the right. The fitted catenary continues past the lower attachment as a dashed extension, reaching its mathematical minimum outside the span. Within the span, the lowest point of the wire is the lower attachment itself.</desc>
  <rect x="0" y="0" width="740" height="190" fill="var(--dg-bg)" rx="10"/>
  <path d="M60 170 L700 170" stroke="var(--dg-line)" stroke-width="1.2"/>
  <path d="M80 30 C260 90 420 128 540 140" fill="none" stroke="var(--dg-a)" stroke-width="2"/>
  <path d="M540 140 C600 146 650 147 700 144" fill="none" stroke="var(--dg-a)" stroke-width="1.6" stroke-dasharray="5 4"/>
  <circle cx="80" cy="30" r="4" fill="var(--dg-line)"/>
  <circle cx="540" cy="140" r="4" fill="var(--dg-line)"/>
  <circle cx="660" cy="147" r="5" fill="none" stroke="var(--dg-e)" stroke-width="1.6"/>
  <text x="90" y="24" font-size="10.5" fill="var(--dg-muted)">upper attachment</text>
  <text x="530" y="124" text-anchor="end" font-size="10.5" fill="var(--dg-muted)">lower attachment = lowest wire point</text>
  <text x="660" y="130" text-anchor="middle" font-size="10.5" fill="var(--dg-e)">s0 outside</text>
</svg>

## Frequently Asked Questions

**Why fit a catenary instead of a parabola?**

A parabola is a good approximation for shallow sag and is used to seed the fit, but it diverges from the true shape on long or slack spans. The catenary is the physically correct shape for a uniform cable under its own weight and costs almost nothing extra to fit.

**How many points does a span need for a reliable fit?**

A dozen well-distributed points will fit, but thirty or more spread along the whole span give stable sag and low-point estimates. Points clustered at one end constrain the curve poorly, however many there are.

**What does a large residual mean?**

Usually that the span group contains something else: a second conductor, an insulator string, or canopy points below the wire. Inspect the residual pattern along the span; clustered negative residuals point to vegetation.

**Can the fit tell me the conductor tension?**

Only in combination with the conductor's weight per metre, which the point cloud does not know. With that value, horizontal tension equals a times the weight per unit length.

## Related

- [Power Line Detection in LiDAR Point Clouds](https://www.pythonlidar.com/lidar-classification-feature-extraction/power-line-detection/) — producing the span groups fitted here
- [Detecting Power Line Conductors with Linearity](https://www.pythonlidar.com/lidar-classification-feature-extraction/power-line-detection/detecting-power-line-conductors-with-linearity/) — the candidate test upstream
- [Measuring Vegetation Clearance to Power Lines](https://www.pythonlidar.com/lidar-classification-feature-extraction/power-line-detection/measuring-vegetation-clearance-to-power-lines/) — using the fitted curve for clearance
- [DBSCAN Segmentation with filters.dbscan](https://www.pythonlidar.com/lidar-classification-feature-extraction/point-cloud-segmentation/dbscan-segmentation-with-filters-dbscan/) — how spans are grouped
- [Point Cloud Segmentation](https://www.pythonlidar.com/lidar-classification-feature-extraction/point-cloud-segmentation/) — grouping methods in general
