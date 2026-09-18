---
title: "Computing RMSEz Against Survey Checkpoints"
description: "Calculate RMSEz, mean error and standard deviation of LiDAR elevations against surveyed checkpoints in Python, separate bias from random error, bootstrap a confidence interval, and avoid the datum and sign mistakes that most often distort the result."
slug: "computing-rmsez-against-survey-checkpoints"
type: "howto"
breadcrumb: "Computing RMSEz"
datePublished: "2026-09-18"
dateModified: "2026-09-18"
---

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Article",
      "headline": "Computing RMSEz Against Survey Checkpoints",
      "description": "Calculate RMSEz, mean error and standard deviation of LiDAR elevations against surveyed checkpoints in Python, separate bias from random error, bootstrap a confidence interval, and avoid the datum and sign mistakes that most often distort the result.",
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
          "name": "Point Cloud Data Standards & Fundamentals",
          "item": "https://www.pythonlidar.com/point-cloud-data-standards-fundamentals/"
        },
        {
          "@type": "ListItem",
          "position": 3,
          "name": "Vertical Accuracy Assessment",
          "item": "https://www.pythonlidar.com/point-cloud-data-standards-fundamentals/vertical-accuracy-assessment/"
        },
        {
          "@type": "ListItem",
          "position": 4,
          "name": "Computing RMSEz",
          "item": "https://www.pythonlidar.com/point-cloud-data-standards-fundamentals/vertical-accuracy-assessment/computing-rmsez-against-survey-checkpoints/"
        }
      ]
    },
    {
      "@type": "HowTo",
      "name": "Compute RMSEz for LiDAR against surveyed checkpoints",
      "step": [
        {
          "@type": "HowToStep",
          "name": "Fix the sign convention",
          "text": "Define \u0394Z = Z_lidar \u2212 Z_checkpoint and state it in the report. Positive values mean the LiDAR surface is above the surveyed ground."
        },
        {
          "@type": "HowToStep",
          "name": "Compute the three statistics",
          "text": "Mean error (bias), sample standard deviation, and RMSEz, for open-terrain checkpoints."
        },
        {
          "@type": "HowToStep",
          "name": "Check the decomposition",
          "text": "Verify that RMSEz\u00b2 is close to bias\u00b2 + sd\u00b2 \u00d7 (n \u2212 1)/n. If bias dominates, stop and investigate the datum chain before reporting."
        },
        {
          "@type": "HowToStep",
          "name": "Bootstrap a confidence interval",
          "text": "Resample checkpoints with replacement a few thousand times and take the 2.5th and 97.5th percentiles of the resampled RMSEz."
        },
        {
          "@type": "HowToStep",
          "name": "Report per group",
          "text": "Repeat for each land-cover class, flight block or region if the project spans several; a single project-wide number can hide a bad block."
        }
      ]
    },
    {
      "@type": "FAQPage",
      "mainEntity": [
        {
          "@type": "Question",
          "name": "How do I calculate RMSEz for LiDAR?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Subtract each surveyed checkpoint elevation from the LiDAR elevation interpolated at the same location, square the differences, average them and take the square root. Use open-terrain checkpoints for the non-vegetated figure."
          }
        },
        {
          "@type": "Question",
          "name": "What is the difference between RMSEz and standard deviation?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Standard deviation measures scatter around the mean error; RMSEz measures scatter around zero, so it also includes any systematic bias. When bias is near zero they are almost equal; when bias is large, RMSEz is much larger."
          }
        },
        {
          "@type": "Question",
          "name": "My RMSEz is high but the errors look consistent. What does that mean?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "A consistent offset \u2014 a large mean error with small scatter \u2014 usually comes from a datum, geoid model or unit mismatch between checkpoints and LiDAR. Fix the reference frame before drawing conclusions about data quality."
          }
        },
        {
          "@type": "Question",
          "name": "Should I report a confidence interval for RMSEz?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "It is good practice, especially with fewer than about 50 checkpoints. A bootstrap interval shows how much the headline number could move with a different sample of checkpoints."
          }
        }
      ]
    }
  ]
}
</script>

**TL;DR:** With ΔZ = Z_lidar − Z_checkpoint for each checkpoint, RMSEz = sqrt(mean(ΔZ²)). Always report it alongside the mean error (bias) and the standard deviation, because RMSEz² ≈ bias² + sd²: a large RMSEz with a small standard deviation is a systematic offset, usually a datum problem, not noisy data. A bootstrap over checkpoints gives a confidence interval that tells readers how much to trust the number.

## Context and Motivation

This guide is part of [Vertical Accuracy Assessment for LiDAR](https://www.pythonlidar.com/point-cloud-data-standards-fundamentals/vertical-accuracy-assessment/). RMSEz is the single number every accuracy report leads with, and it is easy to compute. It is also easy to misread. The same 0.15 m RMSEz can mean "random noise of 15 cm, nothing systematic" or "a 14 cm vertical offset across the whole project with only 5 cm of noise" — and those call for completely different responses. The first is a property of the sensor and processing; the second is almost always fixable, typically by correcting a geoid model or datum realization.

Computing the decomposition takes three extra lines, and a bootstrap confidence interval takes a few more. Together they turn a single number into an interpretable result.

<svg viewBox="0 0 740 210" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="RMSEz decomposed into bias and standard deviation for two datasets" style="width:100%;max-width:740px;display:block;margin:1.6rem auto">
  <title>Same RMSEz, different stories</title>
  <desc>Two right triangles whose hypotenuse is RMSEz of 0.15 metres. In dataset A the horizontal leg, bias, is 0.01 metres and the vertical leg, standard deviation, is 0.15 metres: random error. In dataset B the bias leg is 0.14 metres and the standard deviation leg is 0.05 metres: a systematic offset. The relation is RMSE squared equals bias squared plus standard deviation squared.</desc>
  <rect x="0" y="0" width="740" height="210" fill="var(--dg-bg)" rx="10"/>
  <path d="M60 170 L70 170 L70 40 Z" fill="var(--dg-a-soft)" stroke="var(--dg-a)" stroke-width="1.4"/>
  <text x="80" y="110" font-size="10.5" fill="var(--dg-text)">sd 0.15</text>
  <text x="34" y="190" font-size="10.5" fill="var(--dg-text)">bias 0.01</text>
  <text x="130" y="40" font-size="11" font-weight="600" fill="var(--dg-text)">A: random error</text>
  <text x="130" y="60" font-size="10.5" fill="var(--dg-muted)">RMSEz 0.15 m</text>
  <path d="M400 170 L680 170 L680 70 Z" fill="var(--dg-e-soft)" stroke="var(--dg-e)" stroke-width="1.4"/>
  <text x="540" y="190" text-anchor="middle" font-size="10.5" fill="var(--dg-text)">bias 0.14</text>
  <text x="690" y="126" font-size="10.5" fill="var(--dg-text)">sd 0.05</text>
  <text x="400" y="40" font-size="11" font-weight="600" fill="var(--dg-text)">B: systematic offset</text>
  <text x="400" y="60" font-size="10.5" fill="var(--dg-muted)">RMSEz 0.15 m</text>
  <text x="250" y="130" text-anchor="middle" font-size="11" fill="var(--dg-text)">RMSE² = bias² + sd²</text>
</svg>

## Prerequisites and Assumptions

- A table of checkpoints with LiDAR elevations already interpolated at each one, as produced by the [vertical accuracy workflow](https://www.pythonlidar.com/point-cloud-data-standards-fundamentals/vertical-accuracy-assessment/) or [interpolating LiDAR elevations at checkpoints](https://www.pythonlidar.com/point-cloud-data-standards-fundamentals/vertical-accuracy-assessment/interpolating-lidar-elevations-at-checkpoints/).
- Both elevations in the same vertical datum, geoid model and units.
- A land-cover label per checkpoint so open and vegetated terrain can be separated.
- Python with NumPy and pandas.

## Step-by-Step Implementation

### Step 1 — Fix the sign convention

Define ΔZ = Z_lidar − Z_checkpoint and state it in the report. Positive values mean the LiDAR surface is above the surveyed ground.

### Step 2 — Compute the three statistics

Mean error (bias), sample standard deviation, and RMSEz, for open-terrain checkpoints.

### Step 3 — Check the decomposition

Verify that RMSEz² is close to bias² + sd² × (n − 1)/n. If bias dominates, stop and investigate the datum chain before reporting.

### Step 4 — Bootstrap a confidence interval

Resample checkpoints with replacement a few thousand times and take the 2.5th and 97.5th percentiles of the resampled RMSEz.

### Step 5 — Report per group

Repeat for each land-cover class, flight block or region if the project spans several; a single project-wide number can hide a bad block.

## Complete Working Example

```python
"""RMSEz with bias/sd decomposition and a bootstrap confidence interval."""
from __future__ import annotations

import numpy as np
import pandas as pd


def rmse_stats(dz: np.ndarray, n_boot: int = 5000, seed: int = 0) -> dict:
    dz = np.asarray(dz, dtype=float)
    n = dz.size
    bias = dz.mean()
    sd = dz.std(ddof=1)
    rmse = np.sqrt(np.mean(dz ** 2))
    rng = np.random.default_rng(seed)
    boot = np.sqrt(np.mean(rng.choice(dz, size=(n_boot, n), replace=True) ** 2, axis=1))
    lo, hi = np.percentile(boot, [2.5, 97.5])
    return {
        "n": n,
        "bias_m": round(bias, 3),
        "sd_m": round(sd, 3),
        "rmsez_m": round(rmse, 3),
        "rmsez_ci95_m": (round(lo, 3), round(hi, 3)),
        "bias_share": round(bias ** 2 / rmse ** 2, 2) if rmse > 0 else 0.0,
        "t_bias": round(bias / (sd / np.sqrt(n)), 2) if sd > 0 else float("inf"),
    }


if __name__ == "__main__":
    res = pd.read_csv("qa/checkpoint_results.csv")          # id, cover, z_check, z_lidar, status
    res = res[res.status == "ok"].copy()
    res["dz"] = res.z_lidar - res.z_check

    for cover, grp in res.groupby("cover"):
        s = rmse_stats(grp.dz.to_numpy())
        print(cover, s)
        if s["bias_share"] > 0.5 and abs(s["t_bias"]) > 3:
            print(f"  {cover}: bias explains {s['bias_share']:.0%} of RMSE² — check the vertical datum")
```

Example output for a project with a geoid mismatch:

```text
open {'n': 42, 'bias_m': 0.121, 'sd_m': 0.047, 'rmsez_m': 0.13, 'rmsez_ci95_m': (0.117, 0.142), 'bias_share': 0.87, 't_bias': 16.68}
  open: bias explains 87% of RMSE² — check the vertical datum
vegetated {'n': 28, 'bias_m': 0.162, 'sd_m': 0.118, 'rmsez_m': 0.2, 'rmsez_ci95_m': (0.162, 0.241), 'bias_share': 0.66, 't_bias': 7.26}
```

After converting the checkpoints to the same geoid model as the LiDAR, the open-terrain result typically collapses to a bias near zero and an RMSEz close to the standard deviation.

<svg viewBox="0 0 740 200" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Bootstrap distribution of RMSEz with its 95 percent interval" style="width:100%;max-width:740px;display:block;margin:1.6rem auto">
  <title>How certain is the RMSEz?</title>
  <desc>A histogram of 5,000 bootstrap RMSEz values for 42 open checkpoints, centred near 0.130 metres. The central 95 percent, from 0.117 to 0.142 metres, is shaded. A note says fewer checkpoints widen the interval, so reports should state the count and interval alongside the value.</desc>
  <rect x="0" y="0" width="740" height="200" fill="var(--dg-bg)" rx="10"/>
  <line x1="60" y1="160" x2="700" y2="160" stroke="var(--dg-line)" stroke-width="1.3"/>
  <rect x="230" y="20" width="270" height="140" fill="var(--dg-a-soft)"/>
  <g fill="var(--dg-a)"><rect x="130" y="152" width="18" height="8"/><rect x="150" y="146" width="18" height="14"/><rect x="170" y="134" width="18" height="26"/><rect x="190" y="116" width="18" height="44"/><rect x="210" y="92" width="18" height="68"/><rect x="230" y="68" width="18" height="92"/><rect x="250" y="48" width="18" height="112"/><rect x="270" y="34" width="18" height="126"/><rect x="290" y="28" width="18" height="132"/><rect x="310" y="30" width="18" height="130"/><rect x="330" y="40" width="18" height="120"/><rect x="350" y="56" width="18" height="104"/><rect x="370" y="76" width="18" height="84"/><rect x="390" y="98" width="18" height="62"/><rect x="410" y="116" width="18" height="44"/><rect x="430" y="130" width="18" height="30"/><rect x="450" y="140" width="18" height="20"/><rect x="470" y="148" width="18" height="12"/><rect x="490" y="152" width="18" height="8"/><rect x="510" y="155" width="18" height="5"/></g>
  <text x="230" y="178" text-anchor="middle" font-size="10" fill="var(--dg-muted)">0.117</text>
  <text x="500" y="178" text-anchor="middle" font-size="10" fill="var(--dg-muted)">0.142</text>
  <text x="600" y="60" font-size="10.5" fill="var(--dg-text)">95 % interval</text>
  <text x="600" y="78" font-size="10.5" fill="var(--dg-muted)">n = 42</text>
  <text x="380" y="196" text-anchor="middle" font-size="10.5" fill="var(--dg-muted)">bootstrap RMSEz, metres</text>
</svg>

## Key Parameter Table

| Statistic | Formula | Tells you |
|---|---|---|
| Mean error (bias) | mean(ΔZ) | Systematic offset; datum, geoid, calibration |
| Standard deviation | sd(ΔZ), ddof = 1 | Random scatter around the bias |
| RMSEz | sqrt(mean(ΔZ²)) | Combined error; the headline number |
| bias share | bias² / RMSEz² | How much of RMSEz is systematic |
| t statistic of bias | bias / (sd / √n) | Whether the bias is distinguishable from zero |
| bootstrap 95 % interval | percentiles of resampled RMSEz | Uncertainty in the headline number |

## Verification

- **Hand-check three rows.** Recompute ΔZ for three checkpoints by hand from the source survey file; sign mistakes are common.
- **Identity check.** RMSEz² should equal bias² + sd² × (n − 1)/n to rounding.
- **Stability to one point.** Remove each checkpoint in turn and recompute RMSEz; if one point moves it by more than 10–20 percent, report that point explicitly.

```python
dz = res[res.cover == "open"].dz.to_numpy()
n = dz.size
assert np.isclose(np.mean(dz**2), dz.mean()**2 + dz.var(ddof=1) * (n - 1) / n)
loo = np.array([np.sqrt(np.mean(np.delete(dz, i) ** 2)) for i in range(n)])
print("most influential checkpoint changes RMSEz by", round(np.abs(loo - np.sqrt(np.mean(dz**2))).max(), 3), "m")
```

## Gotchas and Edge Cases

**Mixed vertical datums.** Checkpoints delivered as ellipsoid heights and LiDAR in orthometric heights differ by the geoid undulation — tens of metres in some places, and never zero. Even two geoid models (for example GEOID12B and GEOID18 in the US) can differ by several centimetres.

**Units.** Survey files in US survey feet against LiDAR in metres produce a ΔZ that scales with elevation. A bias that grows with height is the tell-tale sign.

**Vegetated checkpoints in RMSEz.** Pooling vegetated and open checkpoints inflates RMSEz and violates the assumptions behind the 95 % NVA factor. Keep them separate.

<svg viewBox="0 0 740 180" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Error that grows with elevation revealing a units mistake" style="width:100%;max-width:740px;display:block;margin:1.6rem auto">
  <title>A bias that grows with height</title>
  <desc>A scatter of checkpoint error against checkpoint elevation. The points lie along a rising straight line through the origin rather than scattering around zero, meaning the error is proportional to elevation. That pattern indicates a unit mismatch such as feet against metres, not a constant datum offset.</desc>
  <rect x="0" y="0" width="740" height="180" fill="var(--dg-bg)" rx="10"/>
  <line x1="80" y1="150" x2="680" y2="150" stroke="var(--dg-line)" stroke-width="1.3"/>
  <line x1="80" y1="150" x2="80" y2="20" stroke="var(--dg-line)" stroke-width="1.3"/>
  <line x1="80" y1="150" x2="660" y2="30" stroke="var(--dg-e)" stroke-width="1.4" stroke-dasharray="6 4"/>
  <g fill="var(--dg-e)"><circle cx="140" cy="136" r="3.5"/><circle cx="200" cy="126" r="3.5"/><circle cx="260" cy="112" r="3.5"/><circle cx="320" cy="102" r="3.5"/><circle cx="380" cy="88" r="3.5"/><circle cx="440" cy="76" r="3.5"/><circle cx="500" cy="64" r="3.5"/><circle cx="560" cy="52" r="3.5"/><circle cx="620" cy="40" r="3.5"/></g>
  <text x="380" y="172" text-anchor="middle" font-size="10.5" fill="var(--dg-muted)">checkpoint elevation</text>
  <text x="44" y="86" font-size="10.5" fill="var(--dg-muted)" transform="rotate(-90 44 86)" text-anchor="middle">ΔZ</text>
  <text x="96" y="36" font-size="10.5" fill="var(--dg-e)">error ∝ elevation: a units problem</text>
</svg>

**Too few checkpoints.** With ten checkpoints, the bootstrap interval is wide and one outlier dominates. Report the interval; it is the honest way to say the sample is small.

## Frequently Asked Questions

**How do I calculate RMSEz for LiDAR?**

Subtract each surveyed checkpoint elevation from the LiDAR elevation interpolated at the same location, square the differences, average them and take the square root. Use open-terrain checkpoints for the non-vegetated figure.

**What is the difference between RMSEz and standard deviation?**

Standard deviation measures scatter around the mean error; RMSEz measures scatter around zero, so it also includes any systematic bias. When bias is near zero they are almost equal; when bias is large, RMSEz is much larger.

**My RMSEz is high but the errors look consistent. What does that mean?**

A consistent offset — a large mean error with small scatter — usually comes from a datum, geoid model or unit mismatch between checkpoints and LiDAR. Fix the reference frame before drawing conclusions about data quality.

**Should I report a confidence interval for RMSEz?**

It is good practice, especially with fewer than about 50 checkpoints. A bootstrap interval shows how much the headline number could move with a different sample of checkpoints.

## Related

- [Vertical Accuracy Assessment for LiDAR](https://www.pythonlidar.com/point-cloud-data-standards-fundamentals/vertical-accuracy-assessment/) — the full workflow
- [Reporting NVA and VVA Accuracy](https://www.pythonlidar.com/point-cloud-data-standards-fundamentals/vertical-accuracy-assessment/reporting-nva-and-vva-accuracy/) — turning statistics into a report
- [Interpolating LiDAR Elevations at Checkpoints](https://www.pythonlidar.com/point-cloud-data-standards-fundamentals/vertical-accuracy-assessment/interpolating-lidar-elevations-at-checkpoints/) — producing Z_lidar
- [Handling Vertical Datum Transforms in PDAL](https://www.pythonlidar.com/pdal-pipeline-architecture-execution/spatial-reprojection/handling-vertical-datum-transforms-in-pdal/) — fixing the bias RMSEz reveals
- [Setting a Vertical CRS on a Point Cloud](https://www.pythonlidar.com/point-cloud-data-standards-fundamentals/coordinate-reference-systems/setting-a-vertical-crs-on-a-point-cloud/) — making the vertical datum explicit
