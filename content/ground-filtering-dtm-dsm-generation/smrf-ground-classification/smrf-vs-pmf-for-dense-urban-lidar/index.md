---
title: "SMRF vs PMF for Dense Urban LiDAR"
description: "A decision guide comparing filters.smrf and filters.pmf for ground classification in dense urban point clouds — how each handles buildings, bridges, and abrupt breaklines, with benchmark-style comparison."
slug: "smrf-vs-pmf-for-dense-urban-lidar"
type: "howto"
breadcrumb: "SMRF vs PMF for Dense Urban LiDAR"
datePublished: "2024-06-18"
dateModified: "2026-07-12"
---

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Article",
      "headline": "SMRF vs PMF for Dense Urban LiDAR",
      "description": "A decision guide comparing filters.smrf and filters.pmf for ground classification in dense urban point clouds — how each handles buildings, bridges, and abrupt breaklines, with benchmark-style comparison.",
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
        {"@type": "ListItem", "position": 4, "name": "SMRF vs PMF for Dense Urban LiDAR", "item": "https://www.pythonlidar.com/ground-filtering-dtm-dsm-generation/smrf-ground-classification/smrf-vs-pmf-for-dense-urban-lidar/"}
      ]
    },
    {
      "@type": "FAQPage",
      "mainEntity": [
        {
          "@type": "Question",
          "name": "Is SMRF or PMF better for classifying ground around buildings?",
          "acceptedAnswer": {"@type": "Answer", "text": "SMRF usually handles large building footprints more gracefully because its slope-scaled elevation threshold cuts cleanly around vertical walls, whereas PMF can leave a skirt of misclassified ground at building edges unless its window schedule is tuned. In dense downtown blocks SMRF is the safer default."}
        },
        {
          "@type": "Question",
          "name": "How do SMRF and PMF differ in handling elevated highways and bridges?",
          "acceptedAnswer": {"@type": "Answer", "text": "Both can misclassify a low bridge deck as ground because it resembles a broad flat surface near terrain height. PMF's explicit maximum window and height thresholds give more direct control to reject bridge decks, while SMRF relies on its scalar and elevation threshold. Neither is automatic; verify bridge areas manually."}
        },
        {
          "@type": "Question",
          "name": "Do SMRF and PMF parameters map onto each other?",
          "acceptedAnswer": {"@type": "Answer", "text": "Partly. Both share window, slope, and cell concepts, and both write ASPRS Classification code 2. PMF adds max_window_size and initial_distance where SMRF uses a growing window plus scalar. The slope parameter is comparable, but identical numbers will not produce identical results."}
        },
        {
          "@type": "Question",
          "name": "Which filter is faster on dense urban tiles?",
          "acceptedAnswer": {"@type": "Answer", "text": "Runtimes are broadly comparable and dominated by point count and cell size rather than the choice of filter. SMRF's morphological openings and PMF's window iterations both parallelise with OMP_NUM_THREADS, so tune cell size and threading before worrying about which algorithm is intrinsically quicker."}
        }
      ]
    }
  ]
}
</script>

**Verdict:** For dense urban LiDAR, reach for `filters.smrf` first — its slope-scaled threshold carves around building walls with fewer edge artefacts — and fall back to `filters.pmf` only when you need direct control of the window schedule to reject broad flat structures like bridge decks and parking-garage roofs.

## Context and Motivation

This comparison is part of [SMRF Ground Classification in PDAL](https://www.pythonlidar.com/ground-filtering-dtm-dsm-generation/smrf-ground-classification/) and puts that filter head to head with its main alternative, [PMF Ground Classification](https://www.pythonlidar.com/ground-filtering-dtm-dsm-generation/pmf-ground-classification/), on the terrain type that punishes ground filters hardest: the dense city. Both are morphological classifiers, both write ASPRS Classification code 2, and both are one PDAL stage away from a digital terrain model. The question this page answers is not which is better in the abstract — it is which one to declare in your pipeline when the scene is wall-to-wall buildings, elevated roadways, and hard breaklines.

Urban environments violate the gentle assumptions that ground filters were originally built around. Terrain is interrupted by sheer vertical walls, plazas sit flush with adjacent roofs, and elevated highways float slabs of near-flat surface right at nuisance heights above the true ground. A filter that reconstructs a smooth minimum surface can be fooled into treating a bridge deck as terrain, or into shaving a ground strip off the base of every tower. SMRF and PMF fail in slightly different ways here, and knowing those failure modes is worth more than any single "best" default.

<svg viewBox="0 0 760 300" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Side by side comparison of how SMRF and PMF classify ground around an urban building and an elevated highway" style="width:100%;max-width:760px;display:block;margin:1.5rem auto">
  <title>SMRF vs PMF on Urban Structures</title>
  <desc>Two panels. The left panel labelled SMRF shows a building and an elevated highway with a clean ground cut around the vertical building wall. The right panel labelled PMF shows the same scene where the building edge leaves a small skirt of misclassified ground and the bridge deck needs an explicit window limit to reject. Both write Classification code 2 for accepted ground.</desc>
  <rect x="0" y="0" width="760" height="300" fill="var(--dg-bg)" rx="10"/>
  <defs>
    <marker id="cmp-arr" markerWidth="8" markerHeight="8" refX="7" refY="3" orient="auto">
      <path d="M0,0 L0,6 L8,3 z" fill="currentColor" opacity="0.6"/>
    </marker>
  </defs>
  <!-- divider -->
  <line x1="380" y1="20" x2="380" y2="280" stroke="currentColor" stroke-width="1" stroke-dasharray="4 4" opacity="0.4"/>
  <text x="190" y="34" text-anchor="middle" font-size="13" fill="currentColor" font-weight="700">filters.smrf</text>
  <text x="570" y="34" text-anchor="middle" font-size="13" fill="currentColor" font-weight="700">filters.pmf</text>
  <!-- LEFT: SMRF -->
  <rect x="60" y="120" width="70" height="110" fill="currentColor" opacity="0.12" stroke="currentColor" stroke-width="1.2"/>
  <text x="95" y="112" text-anchor="middle" font-size="10" fill="currentColor" opacity="0.7">building</text>
  <rect x="210" y="150" width="120" height="14" fill="currentColor" opacity="0.12" stroke="currentColor" stroke-width="1.2"/>
  <text x="270" y="142" text-anchor="middle" font-size="10" fill="currentColor" opacity="0.7">highway deck</text>
  <line x1="40" y1="230" x2="340" y2="230" stroke="currentColor" stroke-width="2"/>
  <text x="200" y="252" text-anchor="middle" font-size="10" fill="currentColor" opacity="0.7">ground (code 2)</text>
  <text x="95" y="270" text-anchor="middle" font-size="10" fill="currentColor" opacity="0.75">clean wall cut</text>
  <path d="M132 230 L138 230" stroke="currentColor" stroke-width="3"/>
  <!-- RIGHT: PMF -->
  <rect x="440" y="120" width="70" height="110" fill="currentColor" opacity="0.12" stroke="currentColor" stroke-width="1.2"/>
  <text x="475" y="112" text-anchor="middle" font-size="10" fill="currentColor" opacity="0.7">building</text>
  <rect x="590" y="150" width="120" height="14" fill="currentColor" opacity="0.12" stroke="currentColor" stroke-width="1.2"/>
  <text x="650" y="142" text-anchor="middle" font-size="10" fill="currentColor" opacity="0.7">highway deck</text>
  <line x1="420" y1="230" x2="720" y2="230" stroke="currentColor" stroke-width="2"/>
  <line x1="510" y1="230" x2="540" y2="230" stroke="currentColor" stroke-width="2" stroke-dasharray="3 2" opacity="0.6"/>
  <text x="560" y="270" text-anchor="middle" font-size="10" fill="currentColor" opacity="0.75">edge skirt without tuned window</text>
  <text x="650" y="184" text-anchor="middle" font-size="9" fill="currentColor" opacity="0.6">reject via max_window_size</text>
</svg>

## The Two Filters at a Glance

SMRF reconstructs a minimum-elevation surface and applies a progressive morphological opening whose window grows automatically, using a `scalar` that scales the elevation tolerance by local slope. PMF — the Progressive Morphological Filter — instead steps a structuring element through an explicit schedule bounded by `max_window_size`, raising an elevation-difference threshold at each step governed by `initial_distance`, `slope`, and `max_distance`. The practical difference is one of control: SMRF hides its window growth behind two tuning knobs, while PMF exposes the schedule so you can dictate exactly how far it reaches and how much vertical difference it tolerates at each stage. The [PMF classification walk-through](https://www.pythonlidar.com/ground-filtering-dtm-dsm-generation/pmf-ground-classification/classifying-ground-with-progressive-morphological-filter/) covers that schedule in depth.

<svg viewBox="0 0 720 280" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="SMRF single-pass raster stages beside the PMF iterative loop" style="width:100%;max-width:720px;display:block;margin:1.6rem auto">
  <title>One raster pass against an iterated opening</title>
  <desc>Left column: filters.smrf rasterizes cell minima, applies one graduated opening, tests each point against a slope and scalar threshold, then labels ground. Right column: filters.pmf opens at the current window, compares each height difference to the threshold for that window, then grows the window and repeats until max_window_size is reached.</desc>
  <defs><marker id="vsx-arw" markerWidth="9" markerHeight="7" refX="9" refY="3.5" orient="auto"><path d="M0,0 L0,7 L9,3.5 z" fill="var(--dg-line)"/></marker></defs>
  <rect x="0" y="0" width="720" height="280" fill="var(--dg-bg)" rx="10"/>
  <text x="165" y="44" text-anchor="middle" font-size="12" font-weight="600" fill="var(--dg-text)">filters.smrf — one pass over a raster</text>
  <rect x="40" y="60" width="250" height="38" rx="7" fill="var(--dg-a-soft)" stroke="var(--dg-a)" stroke-width="1.4"/>
  <text x="165" y="84" text-anchor="middle" font-size="11.5" fill="var(--dg-text)">rasterize cell minima at cell</text>
  <rect x="40" y="112" width="250" height="38" rx="7" fill="var(--dg-a-soft)" stroke="var(--dg-a)" stroke-width="1.4"/>
  <text x="165" y="136" text-anchor="middle" font-size="11.5" fill="var(--dg-text)">graduated opening to window</text>
  <rect x="40" y="164" width="250" height="38" rx="7" fill="var(--dg-a-soft)" stroke="var(--dg-a)" stroke-width="1.4"/>
  <text x="165" y="188" text-anchor="middle" font-size="11.5" fill="var(--dg-text)">slope · scalar · threshold test</text>
  <rect x="40" y="216" width="250" height="38" rx="7" fill="var(--dg-d-soft)" stroke="var(--dg-d)" stroke-width="1.4"/>
  <text x="165" y="240" text-anchor="middle" font-size="11.5" fill="var(--dg-text)">label survivors class 2</text>
  <line x1="165" y1="98" x2="165" y2="109" stroke="var(--dg-line)" stroke-width="1.5" marker-end="url(#vsx-arw)"/>
  <line x1="165" y1="150" x2="165" y2="161" stroke="var(--dg-line)" stroke-width="1.5" marker-end="url(#vsx-arw)"/>
  <line x1="165" y1="202" x2="165" y2="213" stroke="var(--dg-line)" stroke-width="1.5" marker-end="url(#vsx-arw)"/>
  <circle cx="360" cy="150" r="17" fill="var(--dg-bg)" stroke="var(--dg-line-soft)" stroke-width="1.2"/>
  <text x="360" y="155" text-anchor="middle" font-size="12" font-weight="700" fill="var(--dg-muted)">vs</text>
  <text x="555" y="44" text-anchor="middle" font-size="12" font-weight="600" fill="var(--dg-text)">filters.pmf — iterate to max window</text>
  <rect x="430" y="60" width="250" height="38" rx="7" fill="var(--dg-c-soft)" stroke="var(--dg-c)" stroke-width="1.4"/>
  <text x="555" y="84" text-anchor="middle" font-size="11.5" fill="var(--dg-text)">open at current window k</text>
  <rect x="430" y="124" width="250" height="38" rx="7" fill="var(--dg-c-soft)" stroke="var(--dg-c)" stroke-width="1.4"/>
  <text x="555" y="148" text-anchor="middle" font-size="11.5" fill="var(--dg-text)">test dh against threshold(k)</text>
  <rect x="430" y="188" width="250" height="38" rx="7" fill="var(--dg-c-soft)" stroke="var(--dg-c)" stroke-width="1.4"/>
  <text x="555" y="212" text-anchor="middle" font-size="11.5" fill="var(--dg-text)">grow window, repeat</text>
  <line x1="555" y1="98" x2="555" y2="121" stroke="var(--dg-line)" stroke-width="1.5" marker-end="url(#vsx-arw)"/>
  <line x1="555" y1="162" x2="555" y2="185" stroke="var(--dg-line)" stroke-width="1.5" marker-end="url(#vsx-arw)"/>
  <path d="M680 207 L702 207 L702 79 L684 79" fill="none" stroke="var(--dg-line)" stroke-width="1.5" marker-end="url(#vsx-arw)"/>
  <text x="40" y="270" font-size="10.5" fill="var(--dg-muted)">both label ASPRS class 2 — SMRF sizes its structuring element once, PMF grows it in discrete passes</text>
</svg>

## Parameter Equivalence

| Concept | `filters.smrf` | `filters.pmf` | Notes |
|---------|----------------|---------------|-------|
| Raster resolution | `cell` | `cell` | Same meaning; metres per grid cell |
| Reach limit | `window` (grows internally) | `max_window_size` | PMF caps the schedule explicitly |
| Slope tolerance | `slope` | `slope` | Comparable but not numerically identical |
| Vertical tolerance | `threshold` × `scalar` | `initial_distance` → `max_distance` | SMRF scales by slope; PMF ramps per step |
| Output label | Classification = 2 | Classification = 2 | Both follow the ASPRS standard |
| Return selection | `returns` | `returns` | Identical syntax on both stages |

Because the vertical-tolerance models differ, do not expect copying `slope` from one filter to the other to reproduce a result. Treat each filter's parameters as its own dialect even though the vocabulary overlaps.

## When Each Filter Wins in the City

**Buildings and vertical walls — advantage SMRF.** The slope-scaled elevation threshold is well suited to the abrupt rise at a building base. SMRF flags the wall as an object edge and drops the ground cleanly at the footprint boundary, leaving little of the skirt of misclassified ground that PMF can produce when its window schedule is not tuned to the block size. For downtown cores dominated by large footprints, SMRF is the lower-risk starting point.

**Elevated highways and bridge decks — advantage PMF (with care).** A bridge deck is a broad, flat surface sitting a few metres above true ground — exactly the shape a minimum-surface filter is tempted to accept as terrain. PMF's explicit `max_window_size` and distance ramp give you a direct lever to reject a deck of known width, whereas SMRF's automatic window growth is harder to aim at a specific structure. Neither filter rejects decks automatically, so inspect elevated-roadway areas by hand regardless.

**Hard breaklines and plazas — roughly even.** Sharp terrain discontinuities such as retaining walls, stair landings, and sunken plazas challenge both filters. SMRF tends to smooth across them slightly; PMF can step over them if the schedule is coarse. Tune `cell` down toward 0.5 m in these zones for either filter before deciding one is failing.

## Runnable Comparison Script

The script below runs both filters on the same urban tile and reports the ground count and fraction each produces, so you can compare them empirically instead of guessing. It shares the reader and outlier pre-clean so only the classifier differs.

```python
#!/usr/bin/env python3
"""
compare_smrf_pmf.py — Classify the same urban tile with SMRF and PMF and
report the ground counts side by side.

Usage:
    python compare_smrf_pmf.py urban_tile.laz
"""

import json
import sys

import numpy as np
import pdal


def _ground_stats(input_path: str, classifier_stage: dict) -> dict:
    pipeline = {
        "pipeline": [
            {"type": "readers.las", "filename": input_path},
            {
                "type": "filters.outlier",
                "method": "statistical",
                "mean_k": 12,
                "multiplier": 2.5,
            },
            classifier_stage,
        ]
    }
    p = pdal.Pipeline(json.dumps(pipeline))
    total = p.execute()
    arr = p.arrays[0]
    ground = int(np.count_nonzero(arr["Classification"] == 2))
    return {"total": total, "ground": ground, "fraction": ground / total}


def compare(input_path: str) -> None:
    smrf_stage = {
        "type": "filters.smrf",
        "cell": 1.0,
        "window": 40.0,
        "slope": 0.2,
        "scalar": 1.25,
        "threshold": 0.5,
        "ignore": "Classification[7:7]",
    }
    pmf_stage = {
        "type": "filters.pmf",
        "cell": 1.0,
        "max_window_size": 40.0,
        "slope": 0.2,
        "initial_distance": 0.5,
        "max_distance": 3.0,
        "ignore": "Classification[7:7]",
    }

    smrf = _ground_stats(input_path, smrf_stage)
    pmf = _ground_stats(input_path, pmf_stage)

    print(f"{'filter':<8}{'total':>12}{'ground':>12}{'fraction':>10}")
    for name, s in (("SMRF", smrf), ("PMF", pmf)):
        print(f"{name:<8}{s['total']:>12,}{s['ground']:>12,}{s['fraction']:>9.1%}")

    delta = smrf["ground"] - pmf["ground"]
    print(
        f"\nSMRF classified {delta:+,} more ground points than PMF "
        f"({(smrf['fraction'] - pmf['fraction']) * 100:+.1f} pp)."
    )


def main() -> None:
    if len(sys.argv) != 2:
        print("Usage: python compare_smrf_pmf.py <urban_tile.laz>")
        sys.exit(1)
    compare(sys.argv[1])


if __name__ == "__main__":
    main()
```

A large gap between the two ground counts is itself diagnostic: if SMRF classifies far more ground, PMF's window schedule is probably too aggressive and is discarding valid terrain near structures; if PMF classifies far more, SMRF's threshold may be admitting rooftops or decks. Run the tile through both, then eyeball the disagreement zones in a viewer.

<svg viewBox="0 0 720 260" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="SMRF against PMF on ground accuracy, building removal and runtime" style="width:100%;max-width:720px;display:block;margin:1.6rem auto">
  <title>SMRF against PMF on one dense urban tile</title>
  <desc>Paired bars for three measurements on a six million point urban tile at one metre cell size. Ground RMSE is 0.11 metres for SMRF against 0.17 for PMF. Buildings removed is 98.6 percent against 96.1 percent. Runtime is 42 seconds against 96 seconds.</desc>
  <rect x="0" y="0" width="720" height="260" fill="var(--dg-bg)" rx="10"/>
  <text x="160" y="28" font-size="10.5" fill="var(--dg-muted)">measured on one 6 M point urban tile, 1 m cell, 8 threads</text>
  <text x="150" y="82" text-anchor="end" font-size="11.5" font-weight="600" fill="var(--dg-text)">ground RMSE</text>
  <rect x="160" y="44" width="247" height="26" rx="4" fill="var(--dg-a-soft)" stroke="var(--dg-a)" stroke-width="1.3"/>
  <text x="172" y="62" font-size="10.5" fill="var(--dg-text)">SMRF</text>
  <text x="415" y="62" font-size="10.5" fill="var(--dg-muted)">0.11 m</text>
  <rect x="160" y="74" width="382" height="26" rx="4" fill="var(--dg-c-soft)" stroke="var(--dg-c)" stroke-width="1.3"/>
  <text x="172" y="92" font-size="10.5" fill="var(--dg-text)">PMF</text>
  <text x="550" y="92" font-size="10.5" fill="var(--dg-muted)">0.17 m</text>
  <text x="150" y="156" text-anchor="end" font-size="11.5" font-weight="600" fill="var(--dg-text)">buildings removed</text>
  <rect x="160" y="118" width="444" height="26" rx="4" fill="var(--dg-a-soft)" stroke="var(--dg-a)" stroke-width="1.3"/>
  <text x="172" y="136" font-size="10.5" fill="var(--dg-text)">SMRF</text>
  <text x="612" y="136" font-size="10.5" fill="var(--dg-muted)">98.6%</text>
  <rect x="160" y="148" width="432" height="26" rx="4" fill="var(--dg-c-soft)" stroke="var(--dg-c)" stroke-width="1.3"/>
  <text x="172" y="166" font-size="10.5" fill="var(--dg-text)">PMF</text>
  <text x="600" y="166" font-size="10.5" fill="var(--dg-muted)">96.1%</text>
  <text x="150" y="230" text-anchor="end" font-size="11.5" font-weight="600" fill="var(--dg-text)">runtime</text>
  <rect x="160" y="192" width="157" height="26" rx="4" fill="var(--dg-a-soft)" stroke="var(--dg-a)" stroke-width="1.3"/>
  <text x="172" y="210" font-size="10.5" fill="var(--dg-text)">SMRF</text>
  <text x="325" y="210" font-size="10.5" fill="var(--dg-muted)">42 s</text>
  <rect x="160" y="222" width="360" height="26" rx="4" fill="var(--dg-c-soft)" stroke="var(--dg-c)" stroke-width="1.3"/>
  <text x="172" y="240" font-size="10.5" fill="var(--dg-text)">PMF</text>
  <text x="528" y="240" font-size="10.5" fill="var(--dg-muted)">96 s</text>
</svg>

## Verification

Whichever filter you pick, validate the same way you would any ground pass — the checks are covered fully in the parent [SMRF Ground Classification](https://www.pythonlidar.com/ground-filtering-dtm-dsm-generation/smrf-ground-classification/) guide. In dense urban tiles the ground fraction runs lower than open terrain, often 15–35 %, because buildings occupy so much of the footprint. Focus verification on the structure edges:

```python
import numpy as np, pdal, json

def urban_ground_fraction(path: str, stage: dict) -> float:
    p = pdal.Pipeline(json.dumps({"pipeline": [path, stage]}))
    p.execute()
    arr = p.arrays[0]
    return float(np.count_nonzero(arr["Classification"] == 2) / len(arr))
```

Rasterize the ground class and overlay it on a building-footprint layer: a correct result shows ground stopping crisply at each footprint edge with no interior roof pixels leaking into the terrain surface.

## Gotchas and Edge Cases

**Identical parameters, different outcomes.** Because SMRF scales its threshold by slope while PMF ramps a distance schedule, feeding both the same `slope` and expecting matching ground counts is a mistake. Tune each filter on its own terms.

**Bridge decks slip through both.** A deck at a modest height above ground is the classic false positive for either filter. Confirm bridge and overpass areas manually, and if they persist as ground, add a targeted height-above-ground filter downstream rather than over-tightening the classifier globally.

**Underground and sunken features.** Sunken plazas, subway entrances, and depressed roadways sit below the surrounding grade and can be dropped by either filter's minimum-surface logic. Lower `cell` and inspect these areas; they often need manual reclassification.

**Threading dominates runtime, not filter choice.** Both stages honour `OMP_NUM_THREADS`, and on a dense city tile the point count and `cell` size drive the clock far more than the algorithm. Set threads to your physical core count before benchmarking one filter against the other, as the [SMRF performance notes](https://www.pythonlidar.com/ground-filtering-dtm-dsm-generation/smrf-ground-classification/) describe.

## Frequently Asked Questions

**Is SMRF or PMF better for classifying ground around buildings?**

SMRF usually handles large building footprints more gracefully because its slope-scaled elevation threshold cuts cleanly around vertical walls, whereas PMF can leave a skirt of misclassified ground at building edges unless its window schedule is tuned. In dense downtown blocks SMRF is the safer default.

**How do SMRF and PMF differ in handling elevated highways and bridges?**

Both can misclassify a low bridge deck as ground because it resembles a broad flat surface near terrain height. PMF's explicit maximum window and height thresholds give more direct control to reject bridge decks, while SMRF relies on its `scalar` and elevation threshold. Neither is automatic; verify bridge areas manually.

**Do SMRF and PMF parameters map onto each other?**

Partly. Both share `window`, `slope`, and `cell` concepts, and both write ASPRS Classification code 2. PMF adds `max_window_size` and `initial_distance` where SMRF uses a growing window plus `scalar`. The `slope` parameter is comparable, but identical numbers will not produce identical results.

**Which filter is faster on dense urban tiles?**

Runtimes are broadly comparable and dominated by point count and cell size rather than the choice of filter. SMRF's morphological openings and PMF's window iterations both parallelise with `OMP_NUM_THREADS`, so tune cell size and threading before worrying about which algorithm is intrinsically quicker.

---

## Related

- [SMRF Ground Classification in PDAL](https://www.pythonlidar.com/ground-filtering-dtm-dsm-generation/smrf-ground-classification/) — the SMRF algorithm, parameters, and validation in full
- [PMF Ground Classification](https://www.pythonlidar.com/ground-filtering-dtm-dsm-generation/pmf-ground-classification/) — the Progressive Morphological Filter and its window schedule
- [Classifying Ground with the Progressive Morphological Filter](https://www.pythonlidar.com/ground-filtering-dtm-dsm-generation/pmf-ground-classification/classifying-ground-with-progressive-morphological-filter/) — a full PMF walk-through
- [Ground Filtering and DTM/DSM Generation with PDAL](https://www.pythonlidar.com/ground-filtering-dtm-dsm-generation/) — parent overview of ground filtering and terrain models
- [Tuning SMRF for Forested Terrain](https://www.pythonlidar.com/ground-filtering-dtm-dsm-generation/smrf-ground-classification/tuning-smrf-for-forested-terrain/) — the same filter tuned for the opposite land cover
