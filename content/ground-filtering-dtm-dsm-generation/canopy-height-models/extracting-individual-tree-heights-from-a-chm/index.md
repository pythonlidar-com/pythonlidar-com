---
title: "Extracting Individual Tree Heights from a CHM"
description: "Local maxima detection with a crown-scaled window, why every detection is a candidate rather than a tree, and a sensitivity test that shows how much of the answer is the parameter."
slug: "extracting-individual-tree-heights-from-a-chm"
type: "howto"
breadcrumb: "Individual Tree Heights from a CHM"
datePublished: "2026-08-07"
dateModified: "2026-08-07"
---

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Article",
      "headline": "Extracting Individual Tree Heights from a CHM",
      "description": "Local maxima detection with a crown-scaled window, why every detection is a candidate rather than a tree, and a sensitivity test that shows how much of the answer is the parameter.",
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
          "name": "Individual Tree Heights from a CHM",
          "item": "https://www.pythonlidar.com/ground-filtering-dtm-dsm-generation/canopy-height-models/extracting-individual-tree-heights-from-a-chm/"
        }
      ]
    },
    {
      "@type": "HowTo",
      "name": "Detect candidate tree tops and heights from a canopy height model",
      "step": [
        {
          "@type": "HowToStep",
          "name": "Smooth the CHM slightly",
          "text": "Apply a small Gaussian so single-cell branch spikes do not become detections."
        },
        {
          "@type": "HowToStep",
          "name": "Find local maxima with a crown-scaled window",
          "text": "Size the maximum filter to roughly the diameter of the smallest crown you intend to resolve."
        },
        {
          "@type": "HowToStep",
          "name": "Reject candidates below a minimum height",
          "text": "Discard anything under about two metres, which removes most spurious detections at once."
        },
        {
          "@type": "HowToStep",
          "name": "Enforce a minimum separation",
          "text": "Where two candidates sit within a crown radius, keep the taller as a cheap stand-in for crown delineation."
        },
        {
          "@type": "HowToStep",
          "name": "Report the distribution and its sensitivity",
          "text": "Quote stem density and height percentiles, and re-run with the crown radius halved and doubled."
        }
      ]
    },
    {
      "@type": "FAQPage",
      "mainEntity": [
        {
          "@type": "Question",
          "name": "Why are LiDAR tree heights lower than field measurements?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Because a pulse strikes the upper crown somewhere, rarely the apex. The resulting bias is typically one to two metres and grows with narrower crowns and lower pulse density, so it does not cancel between a dense and a sparse acquisition. Relative comparisons within one block are robust; absolute heights need local calibration."
          }
        },
        {
          "@type": "Question",
          "name": "How do I choose the detection window?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "From the stand, not from the raster. The window should be roughly the diameter of the smallest crown you intend to resolve \u2014 too small and one broad crown becomes several detections, too large and two adjacent crowns become one. Expect it to be wrong somewhere in any mixed-species or mixed-age stand."
          }
        },
        {
          "@type": "Question",
          "name": "Is a local maximum a tree?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "No, it is a bump. A large crown can produce several, two small adjacent crowns can produce one, and a branch tip at a gap edge produces one belonging to nothing. Treating detections as candidates that must survive a height and separation test is what makes the output defensible."
          }
        },
        {
          "@type": "Question",
          "name": "How do I know whether my stem count is real?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Run the sensitivity test. If halving and doubling the crown radius moves stem density by an order of magnitude \u2014 which it usually does \u2014 the number is a parameter choice, and it should be reported as one unless field plots have pinned the parameter down."
          }
        }
      ]
    }
  ]
}
</script>

**TL;DR:** Smooth the CHM slightly, find local maxima with a window scaled to expected crown radius, and treat every result as a candidate until it survives a minimum-height and minimum-separation test — then report the distribution, because individual heights carry a systematic negative bias no algorithm removes.

## Context and Motivation

This guide is part of [Canopy Height Models with filters.hag_nn](https://www.pythonlidar.com/ground-filtering-dtm-dsm-generation/canopy-height-models/). Having a raster of canopy height invites the obvious next question — how tall is each tree — and the honest answer is that a CHM constrains it rather than answers it.

Two facts set the limits. A laser pulse strikes the upper crown somewhere, rarely the apex, so measured heights run one to two metres low, more in narrow-crowned conifers and at low pulse density. And a local maximum in a raster is a bump, not a tree: a large crown produces several, two adjacent small crowns produce one, and a branch tip near a gap edge produces one that belongs to nothing. Detection is therefore a search with parameters, and the parameters encode what you already believe about the stand.

<svg viewBox="0 0 720 258" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="A canopy profile with the local maxima a fixed window finds and the errors it makes" style="width:100%;max-width:720px;display:block;margin:1.6rem auto">
  <title>Three ways a local maximum is not a tree</title>
  <desc>A canopy height profile with four crowns. A fixed detection window finds the apex of the isolated crown correctly, splits one broad crown into two detections, merges two adjacent small crowns into one, and picks a branch tip at a gap edge that belongs to no crown at all. Only one of the four detections is unambiguously right.</desc>
  <rect x="0" y="0" width="720" height="258" fill="var(--dg-bg)" rx="10"/>
  <path d="M40 200 Q90 90 140 200" fill="var(--dg-d-soft)" stroke="var(--dg-d)" stroke-width="1.6"/>
  <path d="M170 200 Q230 70 260 126 Q290 68 350 200" fill="var(--dg-d-soft)" stroke="var(--dg-d)" stroke-width="1.6"/>
  <path d="M390 200 Q420 118 450 200" fill="var(--dg-d-soft)" stroke="var(--dg-d)" stroke-width="1.6"/>
  <path d="M452 200 Q482 112 512 200" fill="var(--dg-d-soft)" stroke="var(--dg-d)" stroke-width="1.6"/>
  <path d="M560 200 Q590 150 604 168 Q620 130 660 200" fill="var(--dg-d-soft)" stroke="var(--dg-d)" stroke-width="1.6"/>
  <line x1="30" y1="200" x2="690" y2="200" stroke="var(--dg-line)" stroke-width="1.6"/>
  <circle cx="90" cy="90" r="5.5" fill="var(--dg-a-soft)" stroke="var(--dg-a)" stroke-width="2"/>
  <text x="90" y="76" text-anchor="middle" font-size="10" fill="var(--dg-d)">correct</text>
  <circle cx="230" cy="70" r="5.5" fill="var(--dg-a-soft)" stroke="var(--dg-a)" stroke-width="2"/>
  <circle cx="290" cy="68" r="5.5" fill="var(--dg-a-soft)" stroke="var(--dg-a)" stroke-width="2"/>
  <text x="260" y="52" text-anchor="middle" font-size="10" fill="var(--dg-e)">one crown, two detections</text>
  <circle cx="450" cy="112" r="5.5" fill="var(--dg-a-soft)" stroke="var(--dg-a)" stroke-width="2"/>
  <text x="450" y="98" text-anchor="middle" font-size="10" fill="var(--dg-e)">two crowns, one detection</text>
  <circle cx="620" cy="130" r="5.5" fill="var(--dg-a-soft)" stroke="var(--dg-a)" stroke-width="2"/>
  <text x="640" y="120" text-anchor="middle" font-size="10" fill="var(--dg-e)">a branch tip</text>
  <text x="30" y="228" font-size="10.5" fill="var(--dg-muted)">the detection window is a statement about crown size — set it from the stand, and expect it to be wrong</text>
  <text x="30" y="246" font-size="10.5" fill="var(--dg-muted)">somewhere in every stand that contains more than one species or age class.</text>
</svg>

## Prerequisites and Assumptions

| Requirement | Detail |
|---|---|
| A CHM | from [rasterizing a canopy height model](https://www.pythonlidar.com/ground-filtering-dtm-dsm-generation/canopy-height-models/rasterizing-a-canopy-height-model-from-hag/) |
| `scipy` and `rasterio` | for the filtering and raster I/O |
| Expected crown radius | from the species and age of the stand; the single most important input |
| Field plots | if the output will be quoted as absolute heights rather than compared |

## Step-by-Step Implementation

### Step 1 — Smooth, but only just

A CHM at one metre carries single-cell spikes from individual branch returns. A small Gaussian removes them without moving the apexes.

```python
smoothed = scipy.ndimage.gaussian_filter(chm, sigma=0.7)
```

### Step 2 — Find local maxima with a crown-scaled window

```python
peaks = smoothed == scipy.ndimage.maximum_filter(smoothed, size=window_cells)
```

The window should be roughly the diameter of the smallest crown you intend to resolve. Too small splits crowns; too large merges them.

### Step 3 — Reject candidates below a minimum height

Anything under two metres is not a tree for most purposes, and rejecting it removes the majority of spurious detections at once.

### Step 4 — Enforce a minimum separation

Where two candidates sit within one crown radius, keep the taller. This is the cheap approximation to crown delineation and gets most of the benefit.

### Step 5 — Report the distribution, not a table of trees

Stem density, height percentiles and the height histogram are defensible. A list of individual trees with heights to two decimal places is not, unless it has been validated against plots.

## Complete Working Example

```python
"""Detect candidate tree tops in a CHM and report the stand distribution."""
from __future__ import annotations

import json
from pathlib import Path

import numpy as np
import rasterio
from scipy import ndimage


def detect(chm_path: Path, crown_radius_m: float = 2.5,
           min_height_m: float = 2.0, sigma_cells: float = 0.7) -> dict:
    with rasterio.open(chm_path) as src:
        chm = src.read(1).astype("float32")
        transform = src.transform
        nodata = src.nodata
        cell = abs(transform.a)

    valid = np.isfinite(chm)
    if nodata is not None:
        valid &= chm != nodata
    work = np.where(valid, chm, 0.0)

    smoothed = ndimage.gaussian_filter(work, sigma=sigma_cells)

    window = max(3, int(round(2 * crown_radius_m / cell)) | 1)  # odd, >= 3
    maxima = smoothed == ndimage.maximum_filter(smoothed, size=window)
    candidates = maxima & valid & (work >= min_height_m)

    rows, cols = np.nonzero(candidates)
    heights = work[rows, cols]

    # Enforce minimum separation by keeping the tallest in each labelled clump.
    keep = np.ones(len(rows), dtype=bool)
    order = np.argsort(-heights)
    taken: list[tuple[int, int]] = []
    min_sep_cells = crown_radius_m / cell
    for idx in order:
        r, c = rows[idx], cols[idx]
        if any((r - tr) ** 2 + (c - tc) ** 2 < min_sep_cells ** 2 for tr, tc in taken):
            keep[idx] = False
        else:
            taken.append((r, c))

    kept = heights[keep]
    area_ha = valid.sum() * cell * cell / 10_000.0
    return {
        "cell_size_m": cell,
        "detection_window_cells": window,
        "candidates": int(len(heights)),
        "after_separation": int(len(kept)),
        "stems_per_ha": round(float(len(kept) / max(area_ha, 1e-9)), 1),
        "height_p50": round(float(np.percentile(kept, 50)), 2) if len(kept) else None,
        "height_p95": round(float(np.percentile(kept, 95)), 2) if len(kept) else None,
        "height_max": round(float(kept.max()), 2) if len(kept) else None,
    }


if __name__ == "__main__":
    print(json.dumps(detect(Path("chm.tif"), crown_radius_m=2.5), indent=2))
```

<svg viewBox="0 0 720 240" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="The four stages of tree-top detection and what each one removes" style="width:100%;max-width:720px;display:block;margin:1.6rem auto">
  <title>Four stages, and how many candidates survive each</title>
  <desc>Detection as a funnel. The raw local-maximum search on a smoothed CHM returns 41,200 candidates over the block. Rejecting anything under two metres removes 22,800 of them. Enforcing a minimum separation of one crown radius removes another 12,500. What remains is 5,900 candidate trees, which is 780 per hectare.</desc>
  <rect x="0" y="0" width="720" height="240" fill="var(--dg-bg)" rx="10"/>
  <defs><marker id="tree-arw" markerWidth="9" markerHeight="7" refX="9" refY="3.5" orient="auto"><path d="M0,0 L0,7 L9,3.5 z" fill="var(--dg-line)"/></marker></defs>
  <text x="210" y="68" text-anchor="end" font-size="11" fill="var(--dg-text)">local maxima</text>
  <rect x="220" y="48" width="302" height="30" rx="4" fill="var(--dg-e-soft)" stroke="var(--dg-e)" stroke-width="1.2"/>
  <text x="530" y="68" font-size="10.5" fill="var(--dg-muted)">41,200 candidates</text>
  <text x="210" y="110" text-anchor="end" font-size="11" fill="var(--dg-text)">after min height 2 m</text>
  <rect x="220" y="90" width="135" height="30" rx="4" fill="var(--dg-c-soft)" stroke="var(--dg-c)" stroke-width="1.2"/>
  <text x="363" y="110" font-size="10.5" fill="var(--dg-muted)">18,400 remain</text>
  <text x="210" y="152" text-anchor="end" font-size="11" fill="var(--dg-text)">after min separation</text>
  <rect x="220" y="132" width="43" height="30" rx="4" fill="var(--dg-d-soft)" stroke="var(--dg-d)" stroke-width="1.2"/>
  <text x="271" y="152" font-size="10.5" fill="var(--dg-muted)">5,900 remain</text>
  <text x="210" y="194" text-anchor="end" font-size="11" fill="var(--dg-text)">per hectare</text>
  <rect x="220" y="174" width="8" height="30" rx="4" fill="var(--dg-b-soft)" stroke="var(--dg-b)" stroke-width="1.2"/>
  <text x="236" y="194" font-size="10.5" fill="var(--dg-muted)">780 stems/ha</text>
  <text x="230" y="32" font-size="10.5" fill="var(--dg-muted)">7.6 ha block, 1 m CHM, crown radius 2.5 m</text>
  <text x="60" y="226" font-size="10.5" fill="var(--dg-muted)">most of what a raw maximum filter returns is not a tree, which is why the two rejection stages are the method</text>
</svg>

## Key Parameter Table

| Parameter | Typical | Effect |
|---|---|---|
| `crown_radius_m` | 1.5–5 | Sets the detection window; the dominant parameter |
| `min_height_m` | 2.0 | Rejects understory and ground noise |
| `sigma_cells` | 0.5–1.0 | Removes single-cell spikes; larger flattens real apexes |
| CHM cell size | 0.5–1.0 m | Finer than crown radius, or crowns cannot be separated |
| minimum separation | ≈ crown radius | Cheap stand-in for crown delineation |

## Verification

**Stem density is plausible.** A managed conifer plantation runs 800–2,000 stems per hectare; open oak woodland 50–200. An answer of 12,000 means the window is too small.

**The height distribution matches the stand.** An even-aged plantation should produce a narrow mode. A broad, flat distribution in a plantation means the detection is picking branches.

**Sensitivity is bounded.** Re-run with the crown radius halved and doubled. If stem density moves by an order of magnitude, the number is a parameter choice rather than a measurement — say so when reporting it.

<svg viewBox="0 0 720 250" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Detected stems per hectare against the crown radius parameter" style="width:100%;max-width:720px;display:block;margin:1.6rem auto">
  <title>How much of the answer is the parameter</title>
  <desc>Detected stems per hectare plotted against the assumed crown radius, for the same CHM. At one metre the detector reports 4,100 stems per hectare; at two metres 1,450; at three metres 780; at five metres 310. The field-measured value of about 900 is marked, and it corresponds to a crown radius of roughly 2.7 metres.</desc>
  <rect x="0" y="0" width="720" height="250" fill="var(--dg-bg)" rx="10"/>
  <line x1="80" y1="40" x2="80" y2="192" stroke="var(--dg-line)" stroke-width="1.5"/>
  <line x1="80" y1="192" x2="680" y2="192" stroke="var(--dg-line)" stroke-width="1.5"/>
  <polyline points="80,48 230,128 380,158 530,174 680,182" fill="none" stroke="var(--dg-a)" stroke-width="2.6"/>
  <circle cx="80" cy="48" r="4.5" fill="var(--dg-a)"/>
  <circle cx="230" cy="128" r="4.5" fill="var(--dg-a)"/>
  <circle cx="380" cy="158" r="4.5" fill="var(--dg-a)"/>
  <line x1="80" y1="152" x2="680" y2="152" stroke="var(--dg-d)" stroke-width="1.8" stroke-dasharray="6 4"/>
  <text x="676" y="146" text-anchor="end" font-size="10.5" fill="var(--dg-d)">field plots: about 900 stems/ha</text>
  <text x="94" y="44" font-size="10.5" fill="var(--dg-e)">4,100 at r = 1 m</text>
  <text x="244" y="124" font-size="10.5" fill="var(--dg-muted)">1,450 at r = 2 m</text>
  <text x="394" y="154" font-size="10.5" fill="var(--dg-muted)">780 at r = 3 m</text>
  <text x="72" y="196" text-anchor="end" font-size="10.5" fill="var(--dg-muted)">0</text>
  <text x="72" y="120" text-anchor="end" font-size="10.5" fill="var(--dg-muted)">2,000</text>
  <text x="72" y="48" text-anchor="end" font-size="10.5" fill="var(--dg-muted)">4,200</text>
  <text x="80" y="212" text-anchor="middle" font-size="10.5" fill="var(--dg-muted)">1 m</text>
  <text x="380" y="212" text-anchor="middle" font-size="10.5" fill="var(--dg-muted)">3 m</text>
  <text x="680" y="212" text-anchor="middle" font-size="10.5" fill="var(--dg-muted)">5 m</text>
  <text x="380" y="236" text-anchor="middle" font-size="11.5" fill="var(--dg-text)">assumed crown radius</text>
</svg>

## Gotchas and Edge Cases

**Heights are biased low and the bias is not constant.** It grows with narrower crowns and lower pulse density, so it does not cancel between a dense and a sparse acquisition.

**A CHM coarser than the crowns cannot separate them.** At a two-metre cell in a stand with three-metre crowns, detection is measuring the raster.

**Buildings and poles detect beautifully.** Filter to vegetation classes before rasterizing, as in [rasterizing a canopy height model](https://www.pythonlidar.com/ground-filtering-dtm-dsm-generation/canopy-height-models/rasterizing-a-canopy-height-model-from-hag/).

**Validate before quoting absolutes.** Relative comparisons across one block are robust; absolute stem counts and heights need plots.

## Frequently Asked Questions

**Why are LiDAR tree heights lower than field measurements?**

Because a pulse strikes the upper crown somewhere, rarely the apex. The resulting bias is typically one to two metres and grows with narrower crowns and lower pulse density, so it does not cancel between a dense and a sparse acquisition. Relative comparisons within one block are robust; absolute heights need local calibration.

**How do I choose the detection window?**

From the stand, not from the raster. The window should be roughly the diameter of the smallest crown you intend to resolve — too small and one broad crown becomes several detections, too large and two adjacent crowns become one. Expect it to be wrong somewhere in any mixed-species or mixed-age stand.

**Is a local maximum a tree?**

No, it is a bump. A large crown can produce several, two small adjacent crowns can produce one, and a branch tip at a gap edge produces one belonging to nothing. Treating detections as candidates that must survive a height and separation test is what makes the output defensible.

**How do I know whether my stem count is real?**

Run the sensitivity test. If halving and doubling the crown radius moves stem density by an order of magnitude — which it usually does — the number is a parameter choice, and it should be reported as one unless field plots have pinned the parameter down.

---

## Related

- [Canopy Height Models with filters.hag_nn](https://www.pythonlidar.com/ground-filtering-dtm-dsm-generation/canopy-height-models/) — the parent workflow
- [Rasterizing a Canopy Height Model from HAG](https://www.pythonlidar.com/ground-filtering-dtm-dsm-generation/canopy-height-models/rasterizing-a-canopy-height-model-from-hag/) — producing the raster this searches
- [Computing Height Above Ground with filters.hag_nn](https://www.pythonlidar.com/ground-filtering-dtm-dsm-generation/canopy-height-models/computing-height-above-ground-with-filters-hag-nn/) — the per-point heights behind the raster
- [Measuring Ground Point Density Under Canopy](https://www.pythonlidar.com/point-cloud-data-standards-fundamentals/point-density-metrics/measuring-ground-point-density-under-canopy/) — whether the acquisition supports the cell size the detection needs
- [Ground Filtering and DTM/DSM Generation with PDAL](https://www.pythonlidar.com/ground-filtering-dtm-dsm-generation/) — the section overview
