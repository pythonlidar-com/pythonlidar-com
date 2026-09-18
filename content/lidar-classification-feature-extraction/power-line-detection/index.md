---
title: "Power Line Detection in LiDAR Point Clouds"
description: "Find conductor points with linearity and height, group them into spans, classify them to ASPRS class 14, and hand the result to catenary fitting and vegetation clearance checks — with PDAL and NumPy."
slug: "power-line-detection"
type: "topic"
breadcrumb: "Power Line Detection"
datePublished: "2026-09-18"
dateModified: "2026-09-18"
---

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Article",
      "headline": "Power Line Detection in LiDAR Point Clouds",
      "description": "Find conductor points with linearity and height, group them into spans, classify them to ASPRS class 14, and hand the result to catenary fitting and vegetation clearance checks \u2014 with PDAL and NumPy.",
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
        }
      ]
    },
    {
      "@type": "HowTo",
      "name": "Power Line Detection in LiDAR Point Clouds",
      "step": [
        {
          "@type": "HowToStep",
          "name": "Normalize and band",
          "text": "Compute height above ground and keep points between roughly 5 m and 80 m, which removes ground, low vegetation, vehicles and most buildings."
        },
        {
          "@type": "HowToStep",
          "name": "Describe",
          "text": "Compute Linearity and Verticality for the banded points with a neighbourhood large enough to include several wire returns."
        },
        {
          "@type": "HowToStep",
          "name": "Candidate test",
          "text": "Keep points that are strongly linear and nearly horizontal \u2014 conductors sag, but over a one-metre neighbourhood they are close to level."
        },
        {
          "@type": "HowToStep",
          "name": "Group into spans",
          "text": "Segment candidates with DBSCAN using a generous eps, so that a wire with gaps between returns still forms one group."
        },
        {
          "@type": "HowToStep",
          "name": "Validate each group",
          "text": "Reject groups that are short, not elongated, or not fit well by a catenary; what survives is a span."
        },
        {
          "@type": "HowToStep",
          "name": "Classify and hand off",
          "text": "Write class 14 to span points, then pass spans to catenary fitting and clearance measurement."
        }
      ]
    },
    {
      "@type": "FAQPage",
      "mainEntity": [
        {
          "@type": "Question",
          "name": "Which ASPRS class should conductors use?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Class 14, wire conductor. Shield or guard wires above the conductors use class 13, towers use class 15, and insulators and other wire-structure connectors use class 16. Many specifications only require class 14; check before spending time separating the others."
          }
        },
        {
          "@type": "Question",
          "name": "What point density is needed to detect power lines?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Detection is reliable from roughly 20 points per square metre, and corridor-specific surveys are usually flown far denser. At 2 to 8 points per square metre transmission lines are often visible but distribution lines frequently are not, so report the density alongside the results."
          }
        },
        {
          "@type": "Question",
          "name": "Can I detect wires without height above ground?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "You can, using absolute elevation above a local minimum, but it fails on sloping terrain where the canopy on the uphill side is higher than the wire on the downhill side. Normalizing first is cheap and removes that failure mode entirely."
          }
        },
        {
          "@type": "Question",
          "name": "Why use DBSCAN instead of filters.cluster for spans?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Wire returns are sparse and gappy, and isolated linear points appear throughout canopy edges. DBSCAN bridges regular gaps along a wire while labelling isolated points as noise; Euclidean clustering keeps every isolated point as its own tiny segment."
          }
        }
      ]
    }
  ]
}
</script>

Utility corridor surveys are one of the few LiDAR products where the thing being measured is thinner than the point spacing. A conductor is a few centimetres across; at 30 pts/m² the scanner still catches it, but as a sparse dotted line hanging several metres above a canopy that returns thousands of points for every one on the wire. Power line detection is the task of pulling that dotted line out of the clutter, classifying it to ASPRS class 14 (wire conductor), and organizing it into spans so that engineers can measure sag and clearance. It belongs in the [classification and feature extraction](https://www.pythonlidar.com/lidar-classification-feature-extraction/) section because it is the purest example of a problem that per-point height cannot solve and neighbourhood geometry can.

<svg viewBox="0 0 740 250" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="A span between two towers with conductor points above a canopy" style="width:100%;max-width:740px;display:block;margin:1.6rem auto">
  <title>A span as the scanner sees it</title>
  <desc>Two lattice towers at each side with a conductor sagging between them. Sparse points follow the conductor curve. Beneath it a dense band of canopy points rises toward the wire near the middle of the span. The lowest point of the sag and the tallest crown are marked with their vertical separation, the clearance that the workflow ultimately reports.</desc>
  <rect x="0" y="0" width="740" height="250" fill="var(--dg-bg)" rx="10"/>
  <line x1="20" y1="226" x2="720" y2="226" stroke="var(--dg-line)" stroke-width="1.5"/>
  <path d="M80 226 L100 40 L120 226 M86 170 L114 170 M90 120 L110 120 M94 76 L106 76" fill="none" stroke="var(--dg-line)" stroke-width="1.6"/>
  <path d="M620 226 L640 40 L660 226 M626 170 L654 170 M630 120 L650 120 M634 76 L646 76" fill="none" stroke="var(--dg-line)" stroke-width="1.6"/>
  <path d="M100 44 Q370 170 640 44" fill="none" stroke="var(--dg-c)" stroke-width="1.2" stroke-dasharray="3 5"/>
  <g fill="var(--dg-c)"><circle cx="140" cy="60" r="2.6"/><circle cx="185" cy="76" r="2.6"/><circle cx="232" cy="89" r="2.6"/><circle cx="280" cy="99" r="2.6"/><circle cx="330" cy="105" r="2.6"/><circle cx="378" cy="107" r="2.6"/><circle cx="426" cy="104" r="2.6"/><circle cx="474" cy="97" r="2.6"/><circle cx="522" cy="86" r="2.6"/><circle cx="570" cy="71" r="2.6"/></g>
  <path d="M150 226 Q200 190 250 200 Q300 170 350 160 Q400 150 440 172 Q500 190 560 206 L600 226 Z" fill="var(--dg-d-soft)" stroke="var(--dg-d)" stroke-width="1.2"/>
  <line x1="378" y1="110" x2="378" y2="152" stroke="var(--dg-e)" stroke-width="1.5"/>
  <text x="388" y="136" font-size="11" fill="var(--dg-e)">clearance</text>
  <text x="170" y="52" font-size="10.5" fill="var(--dg-text)">conductor: sparse, linear, high</text>
  <text x="200" y="218" font-size="10.5" fill="var(--dg-text)">canopy: dense, scattered</text>
  <text x="20" y="24" font-size="10.5" fill="var(--dg-muted)">roughly one conductor return for every several hundred canopy returns in the same corridor</text>
</svg>

## Prerequisites

- **PDAL 2.5+** with `filters.covariancefeatures`, `filters.hag_nn` and `filters.dbscan`, plus the Python bindings.
- **Python 3.10+** with NumPy, SciPy (for `cKDTree` and `curve_fit`) and pandas.
- **Dense corridor data.** Conductor detection is dependable from about 20 pts/m² upward; helicopter or drone corridor surveys at 50 to 200 pts/m² are ideal. At 2 to 8 pts/m² (typical wide-area QL2) many spans have too few wire returns to detect reliably.
- **Ground classified** to class 2 and noise to classes 7 and 18. High-noise returns are the most common false conductors.
- **A projected CRS in metres**, e.g. EPSG:6340 (NAD83(2011) UTM 11N). Span lengths and sags are meaningless in degrees.
- **Optional but valuable: a tower or pole layer** from the utility's GIS. Known structure positions turn span grouping from a clustering problem into a lookup.

## Core Workflow Architecture

1. **Normalize and band.** Compute height above ground and keep points between roughly 5 m and 80 m, which removes ground, low vegetation, vehicles and most buildings.
2. **Describe.** Compute `Linearity` and `Verticality` for the banded points with a neighbourhood large enough to include several wire returns.
3. **Candidate test.** Keep points that are strongly linear and nearly horizontal — conductors sag, but over a one-metre neighbourhood they are close to level.
4. **Group into spans.** Segment candidates with DBSCAN using a generous `eps`, so that a wire with gaps between returns still forms one group.
5. **Validate each group.** Reject groups that are short, not elongated, or not fit well by a catenary; what survives is a span.
6. **Classify and hand off.** Write class 14 to span points, then pass spans to [catenary fitting](https://www.pythonlidar.com/lidar-classification-feature-extraction/power-line-detection/fitting-catenary-curves-to-conductor-points/) and [clearance measurement](https://www.pythonlidar.com/lidar-classification-feature-extraction/power-line-detection/measuring-vegetation-clearance-to-power-lines/).

The funnel is steep, and that is the point: each phase discards most of what reaches it, so the expensive neighbourhood work only ever touches a small fraction of the tile.

<svg viewBox="0 0 740 230" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Point counts surviving each phase of conductor detection on a corridor tile" style="width:100%;max-width:740px;display:block;margin:1.6rem auto">
  <title>The detection funnel</title>
  <desc>Five stacked bars of decreasing width for a 400 metre corridor tile. The full tile has 24 million points. The 5 to 80 metre height band keeps 3.1 million. The linearity and verticality test keeps 41 thousand. DBSCAN groups keep 36 thousand. Validated spans keep 29 thousand points, about one point in eight hundred of the original tile.</desc>
  <rect x="0" y="0" width="740" height="230" fill="var(--dg-bg)" rx="10"/>
  <rect x="170" y="30" width="480" height="26" rx="4" fill="var(--dg-line-soft)"/>
  <text x="160" y="48" text-anchor="end" font-size="11" fill="var(--dg-text)">full tile</text>
  <text x="410" y="48" text-anchor="middle" font-size="10.5" fill="var(--dg-text)">24 M points</text>
  <rect x="290" y="66" width="240" height="26" rx="4" fill="var(--dg-b-soft)" stroke="var(--dg-b)" stroke-width="1.1"/>
  <text x="160" y="84" text-anchor="end" font-size="11" fill="var(--dg-text)">5–80 m band</text>
  <text x="410" y="84" text-anchor="middle" font-size="10.5" fill="var(--dg-text)">3.1 M</text>
  <rect x="360" y="102" width="100" height="26" rx="4" fill="var(--dg-a-soft)" stroke="var(--dg-a)" stroke-width="1.1"/>
  <text x="160" y="120" text-anchor="end" font-size="11" fill="var(--dg-text)">linear, horizontal</text>
  <text x="410" y="120" text-anchor="middle" font-size="10.5" fill="var(--dg-text)">41 k</text>
  <rect x="366" y="138" width="88" height="26" rx="4" fill="var(--dg-c-soft)" stroke="var(--dg-c)" stroke-width="1.1"/>
  <text x="160" y="156" text-anchor="end" font-size="11" fill="var(--dg-text)">DBSCAN groups</text>
  <text x="410" y="156" text-anchor="middle" font-size="10.5" fill="var(--dg-text)">36 k</text>
  <rect x="374" y="174" width="72" height="26" rx="4" fill="var(--dg-d-soft)" stroke="var(--dg-d)" stroke-width="1.1"/>
  <text x="160" y="192" text-anchor="end" font-size="11" fill="var(--dg-text)">validated spans</text>
  <text x="410" y="192" text-anchor="middle" font-size="10.5" fill="var(--dg-text)">29 k</text>
  <text x="170" y="220" font-size="10.5" fill="var(--dg-muted)">illustrative counts, 400 m corridor tile at about 60 pts/m² — bar widths are not to scale below the band</text>
</svg>

## Distribution Lines Versus Transmission Lines

The workflow above is tuned for transmission corridors: tall lattice towers, long spans of 250 to 400 metres, conductors 15 to 40 metres above ground, and wide cleared rights-of-way. Distribution networks break most of those assumptions and deserve their own settings rather than a compromise.

Distribution conductors hang 6 to 12 metres up on wooden or concrete poles, spans are 30 to 80 metres, and the lines run along streets where they share airspace with street trees, building eaves, telephone and fibre cables, and street lights. Lower `band_low` to 4 m, reduce `min_span_length` to 15 m, and expect communication cables to pass every geometric test — they are linear, horizontal and elevated too. Distinguishing them needs either the utility's asset data, the height ordering on shared poles (power is conventionally mounted above communications), or intensity, which differs between bare aluminium conductor and jacketed cable on some sensors.

Transmission lines have the opposite problem: towers are tall enough that `band_high` must clear the top attachment, and the shield wires above the phase conductors are thin enough that they may return only a handful of points per span. If the specification requires class 13 for shield wires, separate them per span by height — they are the topmost linear group — after the conductors have been found.

## Full Implementation

```python
"""Detect power-line conductor points and group them into spans."""
from __future__ import annotations

import json
import logging
from dataclasses import dataclass
from pathlib import Path

import numpy as np
import pandas as pd
import pdal

log = logging.getLogger("powerline")


@dataclass(frozen=True)
class WireRules:
    band_low: float = 5.0          # m above ground
    band_high: float = 80.0
    knn: int = 20                  # neighbourhood for linearity
    min_linearity: float = 0.85
    max_verticality: float = 0.2   # near-horizontal lines only
    eps: float = 2.5               # DBSCAN link distance along a wire, m
    min_samples: int = 8
    min_span_length: float = 25.0  # m
    min_elongation: float = 12.0   # length over width


def candidate_points(src: Path, rules: WireRules) -> np.ndarray:
    band = (f"HeightAboveGround >= {rules.band_low} && HeightAboveGround <= {rules.band_high}"
            " && Classification != 7 && Classification != 18 && Classification != 2")
    stages = [
        {"type": "readers.las", "filename": str(src)},
        {"type": "filters.hag_nn", "count": 1},
        {"type": "filters.range",
         "limits": f"HeightAboveGround[{rules.band_low}:{rules.band_high}]"},
        {"type": "filters.covariancefeatures", "knn": rules.knn, "threads": 4,
         "feature_set": "Dimensionality", "where": band},
        {"type": "filters.expression",
         "expression": f"Linearity >= {rules.min_linearity} && "
                       f"Verticality <= {rules.max_verticality}"},
        {"type": "filters.dbscan", "eps": rules.eps, "min_points": rules.min_samples,
         "dimensions": "X,Y,Z"},
    ]
    p = pdal.Pipeline(json.dumps({"pipeline": stages}))
    n = p.execute()
    log.info("%s: %d linear candidates", src.name, n)
    return p.arrays[0]


def span_table(pts: np.ndarray, rules: WireRules) -> pd.DataFrame:
    df = pd.DataFrame({k: pts[k] for k in ("X", "Y", "Z", "ClusterID")})
    df = df[df.ClusterID >= 0]           # DBSCAN labels noise as -1
    rows = []
    for cid, g in df.groupby("ClusterID"):
        xy = g[["X", "Y"]].to_numpy() - g[["X", "Y"]].mean().to_numpy()
        # Principal axis of the group in plan view.
        _, s, vt = np.linalg.svd(xy, full_matrices=False)
        along = xy @ vt[0]
        across = xy @ vt[1]
        length = float(along.max() - along.min())
        width = float(np.percentile(across, 95) - np.percentile(across, 5)) or 0.01
        rows.append({"ClusterID": int(cid), "n": len(g), "length_m": length,
                     "width_m": width, "elongation": length / width,
                     "z_min": float(g.Z.min()), "z_max": float(g.Z.max())})
    spans = pd.DataFrame(rows).set_index("ClusterID")
    spans["is_span"] = ((spans.length_m >= rules.min_span_length)
                        & (spans.elongation >= rules.min_elongation))
    return spans


def classify(src: Path, dst: Path, rules: WireRules = WireRules()) -> pd.DataFrame:
    pts = candidate_points(src, rules)
    spans = span_table(pts, rules)
    keep = spans.index[spans.is_span].to_numpy()
    wire = pts[np.isin(pts["ClusterID"], keep)]
    log.info("%d groups, %d spans, %d conductor points", len(spans), len(keep), len(wire))

    # Mark conductors in the full tile by matching on GpsTime within each span.
    full = pdal.Pipeline(json.dumps({"pipeline": [str(src)]}))
    full.execute()
    arr = full.arrays[0]
    hit = np.isin(arr["GpsTime"], wire["GpsTime"]) & np.isin(arr["X"], wire["X"])
    arr["Classification"][hit] = 14
    pdal.Writer.las(filename=str(dst), minor_version=4, dataformat_id=6,
                    forward="all").pipeline(arr).execute()
    return spans[spans.is_span]


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
    print(classify(Path("corridor_0082.laz"), Path("corridor_0082_wire.laz")))
```

## Code Breakdown

**`count: 1` for height above ground.** Corridors often cross valleys; a single nearest ground neighbour is precise enough for a 5 m band and cheaper than averaging.

**`filters.range` then a `where` clause.** The range filter removes everything outside the band, which shrinks the neighbour search dramatically. The `where` clause on the covariance stage additionally skips ground and noise that happen to sit in the band on steep slopes.

**`knn: 20`.** A conductor contributes perhaps one return per metre per wire. Twenty neighbours reach far enough along the wire that the neighbourhood is a line, not a blob. On a three-phase circuit with close phase spacing, the neighbourhood may span two wires; linearity still stays high because the wires are parallel.

**`Verticality <= 0.2`.** Poles, tower legs and tree trunks are linear too. Verticality near 1 means the principal direction is vertical, so the cap removes them while keeping sagging wires, whose local slope rarely exceeds 20 degrees except right at the attachment point.

**DBSCAN rather than Euclidean clustering.** Wire returns are gappy. DBSCAN with `eps: 2.5` bridges the gaps along a wire, and its noise label (`-1`) discards isolated linear points — a branch tip, an edge of a roof — that Euclidean clustering would keep as tiny segments. [DBSCAN segmentation](https://www.pythonlidar.com/lidar-classification-feature-extraction/point-cloud-segmentation/dbscan-segmentation-with-filters-dbscan/) explains the parameters in depth.

**Elongation from an SVD.** The principal axis of the group in plan view gives its length; the spread perpendicular to that axis gives its width. A span of three parallel conductors is still very elongated; a linear-looking branch cluster is not.

**Matching by `GpsTime` and `X`.** The candidate array has lost most points, so the write-back step re-reads the tile. Pairing time with a coordinate is enough for single-pass corridor data. The robust alternative is the `where`-clause pattern from [building extraction](https://www.pythonlidar.com/lidar-classification-feature-extraction/building-extraction/), which keeps every point in the array throughout.

<svg viewBox="0 0 740 250" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Scatter of linearity against verticality with the conductor acceptance region" style="width:100%;max-width:740px;display:block;margin:1.6rem auto">
  <title>Where conductors sit in feature space</title>
  <desc>A scatter plot with verticality on the horizontal axis and linearity on the vertical axis. Conductor points cluster in the top-left corner, high linearity and low verticality, inside a shaded acceptance box. Pole and trunk points sit top-right, linear but vertical. Canopy points spread across the lower half with low linearity. Roof edges form a small group at moderate linearity near zero verticality, just below the box.</desc>
  <rect x="0" y="0" width="740" height="250" fill="var(--dg-bg)" rx="10"/>
  <line x1="80" y1="210" x2="680" y2="210" stroke="var(--dg-line)" stroke-width="1.3"/>
  <line x1="80" y1="210" x2="80" y2="30" stroke="var(--dg-line)" stroke-width="1.3"/>
  <text x="380" y="238" text-anchor="middle" font-size="11" fill="var(--dg-muted)">Verticality →</text>
  <text x="30" y="120" font-size="11" fill="var(--dg-muted)" transform="rotate(-90 30 120)" text-anchor="middle">Linearity →</text>
  <rect x="80" y="30" width="120" height="30" fill="var(--dg-c-soft)" stroke="var(--dg-c)" stroke-width="1.2" stroke-dasharray="4 3"/>
  <g fill="var(--dg-c)"><circle cx="96" cy="40" r="3"/><circle cx="110" cy="46" r="3"/><circle cx="124" cy="38" r="3"/><circle cx="140" cy="50" r="3"/><circle cx="104" cy="54" r="3"/><circle cx="160" cy="44" r="3"/></g>
  <text x="210" y="50" font-size="10.5" fill="var(--dg-text)">conductors</text>
  <g fill="var(--dg-line)"><circle cx="600" cy="42" r="3"/><circle cx="620" cy="50" r="3"/><circle cx="640" cy="38" r="3"/><circle cx="615" cy="60" r="3"/></g>
  <text x="590" y="80" text-anchor="middle" font-size="10.5" fill="var(--dg-text)">poles and trunks</text>
  <g fill="var(--dg-d)"><circle cx="200" cy="170" r="3"/><circle cx="260" cy="150" r="3"/><circle cx="320" cy="180" r="3"/><circle cx="380" cy="160" r="3"/><circle cx="440" cy="175" r="3"/><circle cx="500" cy="150" r="3"/><circle cx="300" cy="140" r="3"/><circle cx="420" cy="190" r="3"/></g>
  <text x="350" y="130" text-anchor="middle" font-size="10.5" fill="var(--dg-text)">canopy</text>
  <g fill="var(--dg-a)"><circle cx="100" cy="92" r="3"/><circle cx="116" cy="100" r="3"/><circle cx="130" cy="88" r="3"/></g>
  <text x="146" y="100" font-size="10.5" fill="var(--dg-text)">roof edges</text>
  <text x="80" y="22" font-size="10" fill="var(--dg-muted)">1.0</text>
  <text x="684" y="214" font-size="10" fill="var(--dg-muted)">1.0</text>
</svg>

## Parameter Reference Table

| Parameter | Type | Default here | Valid range | Effect |
|---|---|---|---|---|
| `band_low` | float, m | 5.0 | 3–10 | Lower catches distribution lines; too low admits hedges and fences |
| `band_high` | float, m | 80 | 40–120 | Must clear the highest attachment on transmission towers |
| `knn` | int | 20 | 10–40 | Larger is steadier along a wire but blurs close parallel conductors |
| `min_linearity` | float | 0.85 | 0.7–0.95 | Main separator from canopy; lower on sparse data |
| `max_verticality` | float | 0.2 | 0.1–0.4 | Excludes poles and trunks; raise near attachment points |
| `eps` (DBSCAN) | float, m | 2.5 | 1–5 | Gap along a wire that still links; about 2–3 × wire point spacing |
| `min_points` (DBSCAN) | int | 8 | 4–20 | Core-point density; higher discards short linear clutter |
| `min_span_length` | float, m | 25 | 10–100 | Shortest span accepted; distribution spans can be 30 m |
| `min_elongation` | float | 12 | 5–40 | Length over width; rejects roof edges and branch clusters |

## Validation and Integrity Checks

**Span count against the asset register.** If the utility provides structure locations, every consecutive pair of structures on a circuit should have at least one detected span between them. Missing spans are the first thing a utility engineer will notice.

**Continuity along the corridor.** Plot span end points: gaps longer than one span usually mean the wire points fell below `min_linearity` in a stretch of sparse coverage. Lower the threshold locally rather than globally.

**No conductor points near the ground.** Class 14 points with height above ground under 3 m are almost always misclassified fence tops or vehicles:

```python
check = pdal.Pipeline(json.dumps({"pipeline": [
    "corridor_0082_wire.laz",
    {"type": "filters.hag_nn", "count": 1},
    {"type": "filters.expression",
     "expression": "Classification == 14 && HeightAboveGround < 3.0"},
]}))
low = check.execute()
assert low == 0, f"{low} conductor points within 3 m of ground"
```

**Catenary residuals.** A real span fits a catenary with a residual RMS of a few centimetres. Residuals above 0.3 m indicate two spans merged, or canopy points included; the catenary page shows how to compute them.

## Performance Tuning

Corridor tiles are unusually dense, which makes the neighbourhood stage expensive, but the height band usually removes 85 to 95 percent of points first. Two further savings matter.

- **Clip to the corridor.** If the right-of-way polygon is known, [crop to it](https://www.pythonlidar.com/pdal-pipeline-architecture-execution/pipeline-filtering-logic/cropping-a-point-cloud-to-a-polygon-boundary/) with a 30 m buffer before anything else. On a 1 km² tile crossed by a 60 m corridor, that alone removes over 90 percent of the work.
- **Voxel-thin the canopy.** Dense canopy dominates the candidate stage yet contributes nothing. `filters.voxelcenternearestneighbor` with a 0.25 m cell, restricted with a `where` clause to low-linearity points in a first pass, cuts canopy volume without touching the sparse wire returns.
- **Thread the covariance stage.** As elsewhere, `threads: 4` roughly halves its time on an 8-core worker.

## Common Errors and Troubleshooting

**Tree edges classified as wire.** Tall, narrow crowns such as poplars produce linear neighbourhoods along their outline. The span tests — minimum length and elongation — remove most; if some remain, add a requirement that a span's lowest point is at least 2 m above the canopy height model beneath it.

**Spans broken at every tower.** The attachment region is vertical and cluttered, so linearity drops there. That is expected; merge spans whose end points are within a few metres and whose directions agree, or snap span ends to known structure positions.

**Three conductors come out as one group.** Phase spacing on distribution lines can be under a metre, well inside `eps`. For clearance work that rarely matters — the lowest conductor governs — but for sag per phase, re-segment each span with a smaller `eps` in the plane perpendicular to the span direction.

**`filters.dbscan` returns everything as -1.** `min_points` is too high for the wire density, or `eps` is smaller than the typical gap between returns. Measure the median nearest-neighbour distance among candidates and set `eps` to about three times it.

**Empty candidate set on older PDAL.** `feature_set: "Dimensionality"` and the `Verticality` output appeared in the 2.x series; older releases name or compute features differently. Check with `pdal --options filters.covariancefeatures` and pin the version in your container.

## Frequently Asked Questions

**Which ASPRS class should conductors use?**

Class 14, wire conductor. Shield or guard wires above the conductors use class 13, towers use class 15, and insulators and other wire-structure connectors use class 16. Many specifications only require class 14; check before spending time separating the others.

**What point density is needed to detect power lines?**

Detection is reliable from roughly 20 points per square metre, and corridor-specific surveys are usually flown far denser. At 2 to 8 points per square metre transmission lines are often visible but distribution lines frequently are not, so report the density alongside the results.

**Can I detect wires without height above ground?**

You can, using absolute elevation above a local minimum, but it fails on sloping terrain where the canopy on the uphill side is higher than the wire on the downhill side. Normalizing first is cheap and removes that failure mode entirely.

**Why use DBSCAN instead of filters.cluster for spans?**

Wire returns are sparse and gappy, and isolated linear points appear throughout canopy edges. DBSCAN bridges regular gaps along a wire while labelling isolated points as noise; Euclidean clustering keeps every isolated point as its own tiny segment.

## Related

- [Detecting Power Line Conductors with Linearity](https://www.pythonlidar.com/lidar-classification-feature-extraction/power-line-detection/detecting-power-line-conductors-with-linearity/) — tuning the candidate test on your own data
- [Fitting Catenary Curves to Conductor Points](https://www.pythonlidar.com/lidar-classification-feature-extraction/power-line-detection/fitting-catenary-curves-to-conductor-points/) — sag, low point and residuals per span
- [Measuring Vegetation Clearance to Power Lines](https://www.pythonlidar.com/lidar-classification-feature-extraction/power-line-detection/measuring-vegetation-clearance-to-power-lines/) — the deliverable utilities actually ask for
- [Point Cloud Segmentation](https://www.pythonlidar.com/lidar-classification-feature-extraction/point-cloud-segmentation/) — Euclidean and DBSCAN grouping compared
- [Building Extraction from LiDAR](https://www.pythonlidar.com/lidar-classification-feature-extraction/building-extraction/) — the planar counterpart to this linear problem
