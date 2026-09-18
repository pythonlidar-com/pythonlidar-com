---
title: "Tuning CSF Cloth Resolution and Rigidness"
description: "Tune PDAL filters.csf systematically: a grid sweep over cloth resolution, rigidness and threshold against a reference ground classification, type I and type II error rates, choosing per-landscape settings, and checking the winner on held-out tiles."
slug: "tuning-csf-cloth-resolution-and-rigidness"
type: "howto"
breadcrumb: "Tuning CSF Parameters"
datePublished: "2026-09-18"
dateModified: "2026-09-18"
---

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Article",
      "headline": "Tuning CSF Cloth Resolution and Rigidness",
      "description": "Tune PDAL filters.csf systematically: a grid sweep over cloth resolution, rigidness and threshold against a reference ground classification, type I and type II error rates, choosing per-landscape settings, and checking the winner on held-out tiles.",
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
          "name": "Ground Filtering & Terrain Models",
          "item": "https://www.pythonlidar.com/ground-filtering-dtm-dsm-generation/"
        },
        {
          "@type": "ListItem",
          "position": 3,
          "name": "CSF Cloth Simulation",
          "item": "https://www.pythonlidar.com/ground-filtering-dtm-dsm-generation/csf-cloth-simulation-filter/"
        },
        {
          "@type": "ListItem",
          "position": 4,
          "name": "Tuning CSF Parameters",
          "item": "https://www.pythonlidar.com/ground-filtering-dtm-dsm-generation/csf-cloth-simulation-filter/tuning-csf-cloth-resolution-and-rigidness/"
        }
      ]
    },
    {
      "@type": "HowTo",
      "name": "Tune CSF cloth resolution and rigidness against reference ground",
      "step": [
        {
          "@type": "HowToStep",
          "name": "Freeze the reference",
          "text": "Store the reference classification in a separate dimension (for example with filters.ferry to RefClass) so every run can be compared point by point in one array."
        },
        {
          "@type": "HowToStep",
          "name": "Define the grid",
          "text": "Resolution 0.5, 0.75, 1.0, 1.5, 2.0 m; rigidness 1, 2, 3; threshold 0.3, 0.5, 0.7 m. Forty-five runs."
        },
        {
          "@type": "HowToStep",
          "name": "Run and score",
          "text": "For each combination, run CSF on the reference tile and compute type I = reference ground not classified as ground \u00f7 reference ground, type II = reference non-ground classified as ground \u00f7 reference non-ground."
        },
        {
          "@type": "HowToStep",
          "name": "Pick by total error, check the balance",
          "text": "Minimize type I + type II, but look at both: a DTM tolerates small type I errors (missing a few ground points) far better than type II errors (bumps from vegetation or buildings)."
        },
        {
          "@type": "HowToStep",
          "name": "Validate on a held-out tile",
          "text": "Run the chosen setting on a second reference tile of the same landscape. If errors rise sharply, the first tile was not representative."
        }
      ]
    },
    {
      "@type": "FAQPage",
      "mainEntity": [
        {
          "@type": "Question",
          "name": "How do I tune the cloth simulation filter?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Run filters.csf over a small grid of resolution, rigidness and threshold values on a tile with trusted ground classification, score each run by the share of ground missed and non-ground accepted, and pick the setting with the lowest total error. Confirm it on a second tile."
          }
        },
        {
          "@type": "Question",
          "name": "What are type I and type II errors in ground filtering?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Type I errors are true ground points rejected as non-ground; type II errors are non-ground points, such as vegetation or buildings, accepted as ground. Type II errors are usually more harmful to a DTM because they create bumps."
          }
        },
        {
          "@type": "Question",
          "name": "How many runs does a tuning sweep need?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "A grid of five resolutions, three rigidness values and three thresholds is 45 runs, which takes minutes on one tile with a few cores. Coarse grids followed by a finer grid around the best result work well."
          }
        },
        {
          "@type": "Question",
          "name": "Should I use one setting for the whole project?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Only if the project is homogeneous. For mixed landscapes, tune per landscape type and choose the setting per tile based on its dominant land cover."
          }
        }
      ]
    }
  ]
}
</script>

**TL;DR:** Sweep `resolution` (0.5–2.0 m), `rigidness` (1, 2, 3) and `threshold` (0.3–0.7 m) on a tile with a trusted reference classification, score each run by type I error (reference ground rejected) and type II error (reference non-ground accepted), and choose the setting with the lowest total error — then confirm it on a second tile of the same landscape before using it project-wide.

## Context and Motivation

This guide is part of [CSF Cloth Simulation Ground Filtering](https://www.pythonlidar.com/ground-filtering-dtm-dsm-generation/csf-cloth-simulation-filter/). CSF has few parameters, which tempts people to guess them. The trouble is that its two main knobs interact: a fine cloth with low rigidness follows every dip, including gaps between trees; a coarse, stiff cloth rejects vegetation well but floats over ditches and banks. The best combination depends on point density, terrain and land cover, and the only reliable way to find it is to measure against something you trust.

A sweep of three parameters at a few values each is 20–60 runs on one tile — minutes of compute — and turns guessing into a documented choice.

<svg viewBox="0 0 740 220" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Type I and type II error as cloth resolution changes" style="width:100%;max-width:740px;display:block;margin:1.6rem auto">
  <title>Two errors pulling in opposite directions</title>
  <desc>Two curves against cloth resolution from 0.5 to 2.0 metres at rigidness 2. Type II error, non-ground accepted as ground, falls as the cloth coarsens because it bridges vegetation. Type I error, ground rejected, rises because the coarse cloth floats over small terrain features. Total error is lowest around 1.0 to 1.25 metres, shaded as the sweet spot.</desc>
  <rect x="0" y="0" width="740" height="220" fill="var(--dg-bg)" rx="10"/>
  <line x1="80" y1="180" x2="680" y2="180" stroke="var(--dg-line)" stroke-width="1.3"/>
  <line x1="80" y1="180" x2="80" y2="24" stroke="var(--dg-line)" stroke-width="1.3"/>
  <rect x="260" y="24" width="100" height="156" fill="var(--dg-d-soft)"/>
  <path d="M100 40 C200 110 300 140 380 150 C480 158 580 162 660 164" fill="none" stroke="var(--dg-c)" stroke-width="2"/>
  <path d="M100 166 C200 162 300 150 380 132 C480 104 580 70 660 44" fill="none" stroke="var(--dg-e)" stroke-width="2"/>
  <text x="310" y="40" text-anchor="middle" font-size="10.5" fill="var(--dg-text)">sweet spot</text>
  <text x="110" y="34" font-size="10.5" fill="var(--dg-c)">type II: vegetation as ground</text>
  <text x="656" y="36" text-anchor="end" font-size="10.5" fill="var(--dg-e)">type I: ground missed</text>
  <g font-size="10" fill="var(--dg-muted)"><text text-anchor="middle" x="100" y="198">0.5</text><text text-anchor="middle" x="300" y="198">1.0</text><text text-anchor="middle" x="480" y="198">1.5</text><text text-anchor="middle" x="660" y="198">2.0</text></g>
  <text x="380" y="214" text-anchor="middle" font-size="10.5" fill="var(--dg-muted)">cloth resolution, m (rigidness 2, illustrative)</text>
</svg>

## Prerequisites and Assumptions

- A reference tile per landscape type with trusted ground classification — manually edited, or a vendor classification that passed QA.
- PDAL 2.1+ with Python bindings; pandas.
- Enough cores to run the sweep in parallel; each run is single-threaded.
- The same noise handling as production, applied before every run.

## Step-by-Step Implementation

### Step 1 — Freeze the reference

Store the reference classification in a separate dimension (for example with `filters.ferry` to `RefClass`) so every run can be compared point by point in one array.

### Step 2 — Define the grid

Resolution 0.5, 0.75, 1.0, 1.5, 2.0 m; rigidness 1, 2, 3; threshold 0.3, 0.5, 0.7 m. Forty-five runs.

### Step 3 — Run and score

For each combination, run CSF on the reference tile and compute type I = reference ground not classified as ground ÷ reference ground, type II = reference non-ground classified as ground ÷ reference non-ground.

### Step 4 — Pick by total error, check the balance

Minimize type I + type II, but look at both: a DTM tolerates small type I errors (missing a few ground points) far better than type II errors (bumps from vegetation or buildings).

### Step 5 — Validate on a held-out tile

Run the chosen setting on a second reference tile of the same landscape. If errors rise sharply, the first tile was not representative.

## Complete Working Example

```python
"""Grid sweep of filters.csf parameters against a reference classification."""
from __future__ import annotations

import itertools
import json
from concurrent.futures import ProcessPoolExecutor

import numpy as np
import pandas as pd

REF_TILE = "reference/forest_ref_0822.laz"      # classification is the trusted reference
GRID = {"resolution": [0.5, 0.75, 1.0, 1.5, 2.0], "rigidness": [1, 2, 3], "threshold": [0.3, 0.5, 0.7]}


def score(params: dict) -> dict:
    import pdal
    spec = {"pipeline": [
        REF_TILE,
        {"type": "filters.range", "limits": "Classification![7:7],Classification![18:18]"},
        {"type": "filters.ferry", "dimensions": "Classification=>RefClass"},
        {"type": "filters.assign", "value": ["Classification = 1"]},
        {"type": "filters.csf", "smooth": True, **params},
    ]}
    p = pdal.Pipeline(json.dumps(spec))
    p.execute()
    a = p.arrays[0]
    ref_g = a["RefClass"] == 2
    got_g = a["Classification"] == 2
    t1 = float((ref_g & ~got_g).sum() / max(ref_g.sum(), 1))
    t2 = float((~ref_g & got_g).sum() / max((~ref_g).sum(), 1))
    return {**params, "type1": round(t1, 4), "type2": round(t2, 4), "total": round(t1 + t2, 4)}


if __name__ == "__main__":
    combos = [dict(zip(GRID, v)) for v in itertools.product(*GRID.values())]
    with ProcessPoolExecutor() as pool:
        results = pd.DataFrame(list(pool.map(score, combos)))
    results = results.sort_values("total")
    results.to_csv("tuning/csf_sweep_forest.csv", index=False)
    print(results.head(8).to_string(index=False))
    best = results.iloc[0].to_dict()
    print("best:", {k: best[k] for k in ("resolution", "rigidness", "threshold")})
```

Illustrative top of the table for a mixed forest tile at about 12 pts/m²:

```text
 resolution  rigidness  threshold   type1   type2   total
       1.00          2        0.5  0.0312  0.0088  0.0400
       1.00          2        0.3  0.0421  0.0051  0.0472
       0.75          2        0.5  0.0247  0.0241  0.0488
       1.50          2        0.5  0.0493  0.0063  0.0556
       1.00          1        0.5  0.0206  0.0379  0.0585
```

<svg viewBox="0 0 740 220" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Heat grid of total error over resolution and rigidness at threshold 0.5" style="width:100%;max-width:740px;display:block;margin:1.6rem auto">
  <title>Total error across the grid</title>
  <desc>A grid with rigidness 1, 2 and 3 as rows and resolution 0.5, 0.75, 1.0, 1.5 and 2.0 metres as columns, at threshold 0.5. Each cell shows total error. The lowest value, 0.040, is at rigidness 2 and resolution 1.0 and is outlined. Rigidness 3 with fine resolution and rigidness 1 with coarse resolution are the worst corners.</desc>
  <rect x="0" y="0" width="740" height="220" fill="var(--dg-bg)" rx="10"/>
  <g font-size="10.5" fill="var(--dg-muted)"><text text-anchor="middle" x="200" y="34">0.5</text><text text-anchor="middle" x="300" y="34">0.75</text><text text-anchor="middle" x="400" y="34">1.0</text><text text-anchor="middle" x="500" y="34">1.5</text><text text-anchor="middle" x="600" y="34">2.0</text></g>
  <g font-size="10.5" fill="var(--dg-muted)"><text text-anchor="end" x="140" y="70">rigidness 1</text><text text-anchor="end" x="140" y="120">rigidness 2</text><text text-anchor="end" x="140" y="170">rigidness 3</text></g>
  <g stroke="var(--dg-line-soft)" stroke-width="1">
    <rect x="150" y="44" width="100" height="44" fill="var(--dg-surface)"/><rect x="250" y="44" width="100" height="44" fill="var(--dg-b-soft)"/><rect x="350" y="44" width="100" height="44" fill="var(--dg-b-soft)"/><rect x="450" y="44" width="100" height="44" fill="var(--dg-surface)"/><rect x="550" y="44" width="100" height="44" fill="var(--dg-surface-2)"/>
    <rect x="150" y="94" width="100" height="44" fill="var(--dg-surface)"/><rect x="250" y="94" width="100" height="44" fill="var(--dg-b-soft)"/><rect x="450" y="94" width="100" height="44" fill="var(--dg-b-soft)"/><rect x="550" y="94" width="100" height="44" fill="var(--dg-surface)"/>
    <rect x="150" y="144" width="100" height="44" fill="var(--dg-surface-2)"/><rect x="250" y="144" width="100" height="44" fill="var(--dg-surface)"/><rect x="350" y="144" width="100" height="44" fill="var(--dg-b-soft)"/><rect x="450" y="144" width="100" height="44" fill="var(--dg-b-soft)"/><rect x="550" y="144" width="100" height="44" fill="var(--dg-surface)"/>
  </g>
  <rect x="350" y="94" width="100" height="44" fill="var(--dg-a-soft)" stroke="var(--dg-a)" stroke-width="2"/>
  <g font-size="11" fill="var(--dg-text)">
    <text text-anchor="middle" x="200" y="71">0.071</text><text text-anchor="middle" x="300" y="71">0.062</text><text text-anchor="middle" x="400" y="71">0.059</text><text text-anchor="middle" x="500" y="71">0.074</text><text text-anchor="middle" x="600" y="71">0.098</text>
    <text text-anchor="middle" x="200" y="121">0.066</text><text text-anchor="middle" x="300" y="121">0.049</text><text text-anchor="middle" x="400" y="121">0.040</text><text text-anchor="middle" x="500" y="121">0.056</text><text text-anchor="middle" x="600" y="121">0.069</text>
    <text text-anchor="middle" x="200" y="171">0.104</text><text text-anchor="middle" x="300" y="171">0.071</text><text text-anchor="middle" x="400" y="171">0.052</text><text text-anchor="middle" x="500" y="171">0.058</text><text text-anchor="middle" x="600" y="171">0.077</text>
  </g>
  <text x="400" y="208" text-anchor="middle" font-size="10.5" fill="var(--dg-muted)">threshold 0.5 m; cloth resolution in metres across the top</text>
</svg>

## Key Parameter Table

| Parameter | Sweep values | What it trades |
|---|---|---|
| `resolution` | 0.5–2.0 m | Following terrain detail vs bridging vegetation gaps |
| `rigidness` | 1, 2, 3 | Following slopes vs rejecting low objects |
| `threshold` | 0.3–0.7 m | Accepting rough ground vs accepting low vegetation |
| `smooth` | on (fixed) | Slope post-processing; turn off only on flat land |
| `iterations` | 500 (fixed) | Increase only if the cloth has not settled |

## Verification

- **Held-out tile.** The chosen setting's total error on a second reference tile should be within about 20 percent of the first.
- **Hillshade.** Visual inspection of the DTM from the chosen setting catches error types the rates average away, such as a single large building left in the ground.
- **Stability.** The top few settings in the sweep should be neighbours in parameter space. A best result isolated among poor ones is likely noise.

## Gotchas and Edge Cases

**Reference quality bounds your tuning.** A vendor reference with its own ground errors trains CSF to reproduce them. Spot-check the reference, especially around bridges, dense shrubs and steep banks, before sweeping.

**Error rates depend on landscape mix.** A tile that is 90 percent forest and 10 percent town weights errors accordingly. Tune per landscape type — flat farmland, rolling woodland, mountains, towns — and select settings per tile by land cover.

**Density changes the optimum.** Settings tuned on 12 pts/m² data do not transfer to 4 or 40 pts/m². Retune when density differs by more than a factor of about two.

<svg viewBox="0 0 740 170" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Best cloth resolution shifting with point density" style="width:100%;max-width:740px;display:block;margin:1.6rem auto">
  <title>Optimum resolution follows density</title>
  <desc>Three points showing the best cloth resolution found in sweeps at different densities: 0.5 metres at 40 points per square metre, 1.0 metre at 12, and 2.0 metres at 3. A rising line through them shows that optimum resolution grows roughly with ground point spacing.</desc>
  <rect x="0" y="0" width="740" height="170" fill="var(--dg-bg)" rx="10"/>
  <line x1="80" y1="140" x2="680" y2="140" stroke="var(--dg-line)" stroke-width="1.3"/>
  <line x1="80" y1="140" x2="80" y2="20" stroke="var(--dg-line)" stroke-width="1.3"/>
  <polyline points="160,112 400,82 620,30" fill="none" stroke="var(--dg-a)" stroke-width="2"/>
  <g fill="var(--dg-a)"><circle cx="160" cy="112" r="5"/><circle cx="400" cy="82" r="5"/><circle cx="620" cy="30" r="5"/></g>
  <text x="170" y="104" font-size="10.5" fill="var(--dg-text)">40 pts/m²: 0.5 m</text>
  <text x="410" y="74" font-size="10.5" fill="var(--dg-text)">12 pts/m²: 1.0 m</text>
  <text x="610" y="26" text-anchor="end" font-size="10.5" fill="var(--dg-text)">3 pts/m²: 2.0 m</text>
  <text x="380" y="160" text-anchor="middle" font-size="10.5" fill="var(--dg-muted)">ground point spacing → (illustrative)</text>
</svg>

**Overfitting the threshold.** Very small thresholds reduce type II errors on the reference tile by being strict, and fail on rougher terrain elsewhere. Prefer settings that are good across several tiles over the best on one.

## Frequently Asked Questions

**How do I tune the cloth simulation filter?**

Run filters.csf over a small grid of resolution, rigidness and threshold values on a tile with trusted ground classification, score each run by the share of ground missed and non-ground accepted, and pick the setting with the lowest total error. Confirm it on a second tile.

**What are type I and type II errors in ground filtering?**

Type I errors are true ground points rejected as non-ground; type II errors are non-ground points, such as vegetation or buildings, accepted as ground. Type II errors are usually more harmful to a DTM because they create bumps.

**How many runs does a tuning sweep need?**

A grid of five resolutions, three rigidness values and three thresholds is 45 runs, which takes minutes on one tile with a few cores. Coarse grids followed by a finer grid around the best result work well.

**Should I use one setting for the whole project?**

Only if the project is homogeneous. For mixed landscapes, tune per landscape type and choose the setting per tile based on its dominant land cover.

## Related

- [CSF Cloth Simulation Ground Filtering](https://www.pythonlidar.com/ground-filtering-dtm-dsm-generation/csf-cloth-simulation-filter/) — the method and options
- [Classifying Ground with filters.csf](https://www.pythonlidar.com/ground-filtering-dtm-dsm-generation/csf-cloth-simulation-filter/classifying-ground-with-filters-csf/) — a single run end to end
- [CSF vs SMRF for Forested Ground](https://www.pythonlidar.com/ground-filtering-dtm-dsm-generation/csf-cloth-simulation-filter/csf-vs-smrf-for-forested-ground/) — the same scoring applied to two methods
- [Benchmarking SMRF Against Reference Ground Points](https://www.pythonlidar.com/ground-filtering-dtm-dsm-generation/smrf-ground-classification/benchmarking-smrf-against-reference-ground-points/) — the equivalent for SMRF
- [Threads vs Processes for PDAL Workloads](https://www.pythonlidar.com/pdal-pipeline-architecture-execution/parallel-execution/threads-vs-processes-for-pdal-workloads/) — running sweeps in parallel
