---
title: "Reporting NVA and VVA Accuracy"
description: "Compute and report non-vegetated and vegetated vertical accuracy for LiDAR deliverables: NVA from open-terrain RMSEz, VVA as the 95th percentile of vegetated errors, USGS quality-level thresholds, and a report table generated with pandas."
slug: "reporting-nva-and-vva-accuracy"
type: "howto"
breadcrumb: "NVA and VVA Reporting"
datePublished: "2026-09-18"
dateModified: "2026-09-18"
---

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Article",
      "headline": "Reporting NVA and VVA Accuracy",
      "description": "Compute and report non-vegetated and vegetated vertical accuracy for LiDAR deliverables: NVA from open-terrain RMSEz, VVA as the 95th percentile of vegetated errors, USGS quality-level thresholds, and a report table generated with pandas.",
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
          "name": "NVA and VVA Reporting",
          "item": "https://www.pythonlidar.com/point-cloud-data-standards-fundamentals/vertical-accuracy-assessment/reporting-nva-and-vva-accuracy/"
        }
      ]
    },
    {
      "@type": "HowTo",
      "name": "Compute and report NVA and VVA for a LiDAR dataset",
      "step": [
        {
          "@type": "HowToStep",
          "name": "Split by land cover",
          "text": "Use only open-terrain checkpoints for NVA and only vegetated checkpoints for VVA. Never pool them."
        },
        {
          "@type": "HowToStep",
          "name": "Compute NVA",
          "text": "RMSEz of open \u0394Z, and 1.96 \u00d7 RMSEz if the specification uses the 95 % confidence form."
        },
        {
          "@type": "HowToStep",
          "name": "Compute VVA",
          "text": "The 95th percentile of |\u0394Z| for vegetated checkpoints. With few vegetated checkpoints, the percentile is effectively the second- or third-largest error \u2014 say so."
        },
        {
          "@type": "HowToStep",
          "name": "Compare with thresholds",
          "text": "Look up the thresholds for the target quality level and record pass or fail for each statistic."
        },
        {
          "@type": "HowToStep",
          "name": "Write the report table",
          "text": "Include counts, datums, geoid model, method (TIN of class 2 returns), statistics, thresholds and outcome. Keep the per-checkpoint table as an appendix."
        }
      ]
    },
    {
      "@type": "FAQPage",
      "mainEntity": [
        {
          "@type": "Question",
          "name": "What does NVA mean in LiDAR accuracy reporting?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Non-vegetated vertical accuracy: accuracy measured with checkpoints on open terrain such as bare ground, short grass and pavement. It is based on RMSEz and, in legacy reporting, expressed at 95 percent confidence as 1.96 times RMSEz."
          }
        },
        {
          "@type": "Question",
          "name": "What does VVA mean?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Vegetated vertical accuracy: accuracy measured with checkpoints under vegetation, reported as the 95th percentile of absolute vertical errors because those errors are not normally distributed."
          }
        },
        {
          "@type": "Question",
          "name": "What are the QL2 vertical accuracy thresholds?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Under the USGS Lidar Base Specification, QL2 requires RMSEz of 10 centimetres or better, NVA at 95 percent of 19.6 centimetres or better, and VVA of 30 centimetres or better. Confirm against the edition your project cites."
          }
        },
        {
          "@type": "Question",
          "name": "Do the current ASPRS standards still use NVA and VVA?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Edition 2 of the ASPRS Positional Accuracy Standards reports vertical accuracy as RMSE and no longer requires 95 percent confidence figures. Many specifications and contracts still use NVA and VVA, so compute both and report what your governing document requires."
          }
        }
      ]
    }
  ]
}
</script>

**TL;DR:** NVA uses open-terrain checkpoints: report RMSEz and, where the specification asks for it, the legacy 95 % figure 1.96 × RMSEz. VVA uses vegetated checkpoints: report the 95th percentile of absolute errors. Compare both against the thresholds for the target quality level — for USGS QL2, RMSEz ≤ 10 cm, NVA ≤ 19.6 cm and VVA ≤ 30 cm — and state the checkpoint counts, datums and method alongside the numbers.

## Context and Motivation

This guide is part of [Vertical Accuracy Assessment for LiDAR](https://www.pythonlidar.com/point-cloud-data-standards-fundamentals/vertical-accuracy-assessment/). Two statistics are needed because errors behave differently under vegetation. On open, hard ground, LiDAR errors are close to normally distributed, and RMSEz summarizes them well. Under canopy, the laser reaches the ground less often, ground classification is harder, and errors develop a long tail — a few checkpoints may be off by half a metre. A normal-distribution statistic would understate that tail, so vegetated accuracy is reported with a percentile that makes no distribution assumption.

Standards have evolved. The ASPRS Positional Accuracy Standards for Digital Geospatial Data, edition 2 (2023), report accuracy as RMSE and dropped the requirement to publish 95 % confidence values; the USGS Lidar Base Specification and many contracts still express thresholds as NVA and VVA. The practical approach is to compute everything and report what the governing specification asks for.

<svg viewBox="0 0 740 220" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Error distributions for open and vegetated checkpoints and the statistic used for each" style="width:100%;max-width:740px;display:block;margin:1.6rem auto">
  <title>Two distributions, two statistics</title>
  <desc>Left: a symmetric bell-shaped distribution of open-terrain errors, summarized by RMSEz and, for legacy reporting, 1.96 times RMSEz. Right: a right-skewed distribution of absolute vegetated errors with a long tail, summarized by its 95th percentile, marked with a vertical line well out in the tail.</desc>
  <rect x="0" y="0" width="740" height="220" fill="var(--dg-bg)" rx="10"/>
  <text x="185" y="26" text-anchor="middle" font-size="11.5" font-weight="600" fill="var(--dg-text)">open terrain → NVA</text>
  <text x="555" y="26" text-anchor="middle" font-size="11.5" font-weight="600" fill="var(--dg-text)">vegetated → VVA</text>
  <line x1="30" y1="180" x2="340" y2="180" stroke="var(--dg-line)" stroke-width="1.3"/>
  <line x1="400" y1="180" x2="710" y2="180" stroke="var(--dg-line)" stroke-width="1.3"/>
  <path d="M40 180 C120 178 140 50 185 46 C230 50 250 178 330 180 Z" fill="var(--dg-b-soft)" stroke="var(--dg-b)" stroke-width="1.5"/>
  <path d="M410 180 C420 60 450 44 480 60 C540 100 600 150 700 176 L700 180 Z" fill="var(--dg-d-soft)" stroke="var(--dg-d)" stroke-width="1.5"/>
  <line x1="630" y1="40" x2="630" y2="180" stroke="var(--dg-e)" stroke-width="1.6" stroke-dasharray="5 4"/>
  <text x="624" y="52" text-anchor="end" font-size="10.5" fill="var(--dg-e)">95th percentile</text>
  <text x="185" y="200" text-anchor="middle" font-size="10.5" fill="var(--dg-muted)">RMSEz (× 1.96 for legacy 95 %)</text>
  <text x="555" y="200" text-anchor="middle" font-size="10.5" fill="var(--dg-muted)">|ΔZ| with a long tail</text>
</svg>

## Prerequisites and Assumptions

- Checkpoint results with ΔZ and a land-cover label, as produced in [computing RMSEz against survey checkpoints](https://www.pythonlidar.com/point-cloud-data-standards-fundamentals/vertical-accuracy-assessment/computing-rmsez-against-survey-checkpoints/).
- Datum issues resolved: the mean open-terrain error should be small relative to its standard deviation before reporting.
- The governing specification and target quality level.
- Python with pandas and NumPy.

## Step-by-Step Implementation

### Step 1 — Split by land cover

Use only open-terrain checkpoints for NVA and only vegetated checkpoints for VVA. Never pool them.

### Step 2 — Compute NVA

RMSEz of open ΔZ, and 1.96 × RMSEz if the specification uses the 95 % confidence form.

### Step 3 — Compute VVA

The 95th percentile of |ΔZ| for vegetated checkpoints. With few vegetated checkpoints, the percentile is effectively the second- or third-largest error — say so.

### Step 4 — Compare with thresholds

Look up the thresholds for the target quality level and record pass or fail for each statistic.

### Step 5 — Write the report table

Include counts, datums, geoid model, method (TIN of class 2 returns), statistics, thresholds and outcome. Keep the per-checkpoint table as an appendix.

## Complete Working Example

```python
"""NVA/VVA report against USGS quality-level thresholds."""
from __future__ import annotations

import numpy as np
import pandas as pd

# Thresholds in metres (USGS Lidar Base Specification quality levels; confirm the edition).
QL = {
    "QL0": {"rmsez": 0.050, "nva95": 0.098, "vva95": 0.147},
    "QL1": {"rmsez": 0.100, "nva95": 0.196, "vva95": 0.300},
    "QL2": {"rmsez": 0.100, "nva95": 0.196, "vva95": 0.300},
    "QL3": {"rmsez": 0.200, "nva95": 0.392, "vva95": 0.588},
}


def report(res: pd.DataFrame, level: str = "QL2") -> pd.DataFrame:
    ok = res[res.status == "ok"]
    open_dz = ok.loc[ok.cover == "open", "dz"].to_numpy()
    veg_dz = ok.loc[ok.cover == "vegetated", "dz"].to_numpy()
    t = QL[level]

    rmse = float(np.sqrt(np.mean(open_dz ** 2)))
    nva95 = 1.96 * rmse
    vva95 = float(np.percentile(np.abs(veg_dz), 95)) if veg_dz.size else np.nan

    rows = [
        ("Open checkpoints (n)", len(open_dz), "", ""),
        ("Vegetated checkpoints (n)", len(veg_dz), "", ""),
        ("Mean error, open (m)", round(open_dz.mean(), 3), "", ""),
        ("RMSEz, open (m)", round(rmse, 3), t["rmsez"], rmse <= t["rmsez"]),
        ("NVA at 95 % (1.96 × RMSEz) (m)", round(nva95, 3), t["nva95"], nva95 <= t["nva95"]),
        ("VVA, 95th percentile |ΔZ| (m)", round(vva95, 3), t["vva95"], vva95 <= t["vva95"]),
    ]
    table = pd.DataFrame(rows, columns=["Statistic", "Value", f"{level} threshold", "Pass"])
    table["Pass"] = table["Pass"].map({True: "yes", False: "no", "": ""})
    return table


if __name__ == "__main__":
    res = pd.read_csv("qa/checkpoint_results.csv")
    res["dz"] = res.z_lidar - res.z_check
    tbl = report(res, "QL2")
    print(tbl.to_markdown(index=False))
    tbl.to_csv("qa/accuracy_report_ql2.csv", index=False)
```

Rendered as Markdown, the table drops straight into a delivery report:

```text
| Statistic                       |  Value | QL2 threshold | Pass |
|:--------------------------------|-------:|--------------:|:-----|
| Open checkpoints (n)            | 42     |               |      |
| Vegetated checkpoints (n)       | 28     |               |      |
| Mean error, open (m)            | 0.004  |               |      |
| RMSEz, open (m)                 | 0.052  | 0.1           | yes  |
| NVA at 95 % (1.96 × RMSEz) (m)  | 0.102  | 0.196         | yes  |
| VVA, 95th percentile |ΔZ| (m)   | 0.214  | 0.3           | yes  |
```

<svg viewBox="0 0 740 200" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Measured NVA and VVA against quality level thresholds" style="width:100%;max-width:740px;display:block;margin:1.6rem auto">
  <title>Where the result sits against each quality level</title>
  <desc>Two horizontal scales in centimetres. On the NVA scale, thresholds are marked for QL0 at 9.8, QL1 and QL2 at 19.6, and QL3 at 39.2; the measured 10.2 falls between QL0 and QL2. On the VVA scale, thresholds are marked at 14.7, 30 and 58.8; the measured 21.4 falls between QL0 and QL2. The project meets QL2 on both.</desc>
  <rect x="0" y="0" width="740" height="200" fill="var(--dg-bg)" rx="10"/>
  <text x="20" y="54" font-size="11" font-weight="600" fill="var(--dg-text)">NVA</text>
  <line x1="80" y1="50" x2="700" y2="50" stroke="var(--dg-line)" stroke-width="1.4"/>
  <g stroke="var(--dg-line)" stroke-width="1.4"><line x1="175" y1="42" x2="175" y2="58"/><line x1="270" y1="42" x2="270" y2="58"/><line x1="460" y1="42" x2="460" y2="58"/></g>
  <g font-size="10" fill="var(--dg-muted)"><text text-anchor="middle" x="175" y="76">QL0 9.8</text><text text-anchor="middle" x="270" y="76">QL1/2 19.6</text><text text-anchor="middle" x="460" y="76">QL3 39.2</text></g>
  <circle cx="179" cy="50" r="6" fill="var(--dg-a)"/>
  <text x="186" y="36" font-size="10.5" fill="var(--dg-a)">measured 10.2</text>
  <text x="20" y="134" font-size="11" font-weight="600" fill="var(--dg-text)">VVA</text>
  <line x1="80" y1="130" x2="700" y2="130" stroke="var(--dg-line)" stroke-width="1.4"/>
  <g stroke="var(--dg-line)" stroke-width="1.4"><line x1="170" y1="122" x2="170" y2="138"/><line x1="264" y1="122" x2="264" y2="138"/><line x1="444" y1="122" x2="444" y2="138"/></g>
  <g font-size="10" fill="var(--dg-muted)"><text text-anchor="middle" x="170" y="156">QL0 14.7</text><text text-anchor="middle" x="264" y="156">QL1/2 30</text><text text-anchor="middle" x="444" y="156">QL3 58.8</text></g>
  <circle cx="211" cy="130" r="6" fill="var(--dg-a)"/>
  <text x="218" y="116" font-size="10.5" fill="var(--dg-a)">measured 21.4</text>
  <text x="80" y="188" font-size="10.5" fill="var(--dg-muted)">centimetres; thresholds from the USGS Lidar Base Specification quality levels</text>
</svg>

## Key Parameter Table

| Quality level | RMSEz (cm) | NVA 95 % (cm) | VVA 95th pct (cm) | Typical use |
|---|---|---|---|---|
| QL0 | ≤ 5.0 | ≤ 9.8 | ≤ 14.7 | Engineering, dense corridor work |
| QL1 | ≤ 10.0 | ≤ 19.6 | ≤ 30.0 | High-density regional mapping |
| QL2 | ≤ 10.0 | ≤ 19.6 | ≤ 30.0 | National programme baseline |
| QL3 | ≤ 20.0 | ≤ 39.2 | ≤ 58.8 | Older or lower-density collections |

These values follow the USGS Lidar Base Specification's quality-level tables; check the edition your contract cites, because thresholds and wording are revised periodically.

## Verification

- **Counts first.** A VVA from eight checkpoints is the largest error in all but name. State counts in the report and flag statistics computed from fewer than 20 checkpoints.
- **Reproduce from the appendix.** Anyone should be able to recompute every number from the per-checkpoint table you ship. Test that by computing the report from the saved CSV, not from in-memory data.
- **Consistency with relative accuracy.** A project that passes NVA but shows large swath-to-swath differences probably has checkpoints concentrated in well-behaved areas; see [measuring swath-to-swath relative accuracy](https://www.pythonlidar.com/point-cloud-data-standards-fundamentals/vertical-accuracy-assessment/measuring-swath-to-swath-relative-accuracy/).

## Gotchas and Edge Cases

**1.96 assumes normal, unbiased errors.** When mean error is not near zero, 1.96 × RMSEz is not a 95 % bound. That is one reason the newer ASPRS edition reports RMSE directly. Fix the bias, or report RMSE and bias separately.

**Percentiles on small samples.** NumPy's default percentile interpolates between order statistics. With 20 vegetated checkpoints, the 95th percentile lies between the 19th and 20th largest values. Document the method (NumPy "linear") so others reproduce the number.

**Land cover labels.** Label checkpoints in the field, not afterwards from imagery. A checkpoint called "open" that sits under a thin canopy silently inflates NVA.

<svg viewBox="0 0 740 170" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="How few checkpoints make the 95th percentile equal the largest error" style="width:100%;max-width:740px;display:block;margin:1.6rem auto">
  <title>Small samples and the 95th percentile</title>
  <desc>Two rows of sorted absolute errors. With 10 vegetated checkpoints, the 95th percentile lands between the 9th and 10th values, essentially the worst checkpoint. With 60 checkpoints, it lands near the 57th value, leaving the three worst above it and giving a more stable statistic.</desc>
  <rect x="0" y="0" width="740" height="170" fill="var(--dg-bg)" rx="10"/>
  <text x="20" y="46" font-size="10.5" fill="var(--dg-text)">n = 10</text>
  <g fill="var(--dg-b)"><circle cx="110" cy="42" r="5"/><circle cx="160" cy="42" r="5"/><circle cx="210" cy="42" r="5"/><circle cx="260" cy="42" r="5"/><circle cx="310" cy="42" r="5"/><circle cx="360" cy="42" r="5"/><circle cx="410" cy="42" r="5"/><circle cx="460" cy="42" r="5"/><circle cx="560" cy="42" r="5"/><circle cx="690" cy="42" r="5"/></g>
  <line x1="625" y1="26" x2="625" y2="58" stroke="var(--dg-e)" stroke-width="1.8"/>
  <text x="620" y="74" text-anchor="end" font-size="10.5" fill="var(--dg-e)">p95 ≈ the worst checkpoint</text>
  <text x="20" y="126" font-size="10.5" fill="var(--dg-text)">n = 60</text>
  <g fill="var(--dg-b)"><circle cx="110" cy="122" r="3"/><circle cx="130" cy="122" r="3"/><circle cx="150" cy="122" r="3"/><circle cx="170" cy="122" r="3"/><circle cx="190" cy="122" r="3"/><circle cx="210" cy="122" r="3"/><circle cx="230" cy="122" r="3"/><circle cx="250" cy="122" r="3"/><circle cx="270" cy="122" r="3"/><circle cx="290" cy="122" r="3"/><circle cx="310" cy="122" r="3"/><circle cx="330" cy="122" r="3"/><circle cx="350" cy="122" r="3"/><circle cx="370" cy="122" r="3"/><circle cx="390" cy="122" r="3"/><circle cx="410" cy="122" r="3"/><circle cx="430" cy="122" r="3"/><circle cx="450" cy="122" r="3"/><circle cx="470" cy="122" r="3"/><circle cx="490" cy="122" r="3"/><circle cx="510" cy="122" r="3"/><circle cx="530" cy="122" r="3"/><circle cx="560" cy="122" r="3"/><circle cx="620" cy="122" r="3"/><circle cx="660" cy="122" r="3"/><circle cx="700" cy="122" r="3"/></g>
  <line x1="545" y1="106" x2="545" y2="138" stroke="var(--dg-e)" stroke-width="1.8"/>
  <text x="540" y="156" text-anchor="end" font-size="10.5" fill="var(--dg-e)">p95 below the three worst</text>
</svg>

**Specification language.** "Meets QL2" is a statement about the whole specification — density, classification, accuracy and more — not accuracy alone. Say "meets QL2 vertical accuracy requirements" unless every part has been checked.

## Frequently Asked Questions

**What does NVA mean in LiDAR accuracy reporting?**

Non-vegetated vertical accuracy: accuracy measured with checkpoints on open terrain such as bare ground, short grass and pavement. It is based on RMSEz and, in legacy reporting, expressed at 95 percent confidence as 1.96 times RMSEz.

**What does VVA mean?**

Vegetated vertical accuracy: accuracy measured with checkpoints under vegetation, reported as the 95th percentile of absolute vertical errors because those errors are not normally distributed.

**What are the QL2 vertical accuracy thresholds?**

Under the USGS Lidar Base Specification, QL2 requires RMSEz of 10 centimetres or better, NVA at 95 percent of 19.6 centimetres or better, and VVA of 30 centimetres or better. Confirm against the edition your project cites.

**Do the current ASPRS standards still use NVA and VVA?**

Edition 2 of the ASPRS Positional Accuracy Standards reports vertical accuracy as RMSE and no longer requires 95 percent confidence figures. Many specifications and contracts still use NVA and VVA, so compute both and report what your governing document requires.

## Related

- [Vertical Accuracy Assessment for LiDAR](https://www.pythonlidar.com/point-cloud-data-standards-fundamentals/vertical-accuracy-assessment/) — the end-to-end workflow
- [Computing RMSEz Against Survey Checkpoints](https://www.pythonlidar.com/point-cloud-data-standards-fundamentals/vertical-accuracy-assessment/computing-rmsez-against-survey-checkpoints/) — the statistic behind NVA
- [Measuring Swath-to-Swath Relative Accuracy](https://www.pythonlidar.com/point-cloud-data-standards-fundamentals/vertical-accuracy-assessment/measuring-swath-to-swath-relative-accuracy/) — the other accuracy requirement
- [Checking Pulse Spacing Against USGS Quality Levels](https://www.pythonlidar.com/point-cloud-data-standards-fundamentals/point-density-metrics/checking-pulse-spacing-against-usgs-quality-levels/) — the density side of quality levels
- [Understanding ASPRS Classification Codes](https://www.pythonlidar.com/point-cloud-data-standards-fundamentals/asprs-classification-codes/understanding-asprs-classification-codes/) — ground classification behind the checkpoints
