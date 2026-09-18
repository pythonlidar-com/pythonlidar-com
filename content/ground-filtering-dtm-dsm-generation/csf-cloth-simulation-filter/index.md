---
title: "CSF Cloth Simulation Ground Filtering"
description: "Classify ground with PDAL filters.csf: how the cloth simulation filter drapes an inverted cloth over the point cloud, the resolution, rigidness, threshold and slope-smoothing options, when CSF beats SMRF and PMF, and how to validate the result."
slug: "csf-cloth-simulation-filter"
type: "topic"
breadcrumb: "CSF Cloth Simulation"
datePublished: "2026-09-18"
dateModified: "2026-09-18"
---

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Article",
      "headline": "CSF Cloth Simulation Ground Filtering",
      "description": "Classify ground with PDAL filters.csf: how the cloth simulation filter drapes an inverted cloth over the point cloud, the resolution, rigidness, threshold and slope-smoothing options, when CSF beats SMRF and PMF, and how to validate the result.",
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
        }
      ]
    },
    {
      "@type": "HowTo",
      "name": "Classify ground with the CSF cloth simulation filter in PDAL",
      "step": [
        {
          "@type": "HowToStep",
          "name": "Invert",
          "text": "Multiply Z by \u22121 so the terrain becomes the top of the cloud."
        },
        {
          "@type": "HowToStep",
          "name": "Initialize the cloth",
          "text": "Place a grid of particles, spaced at the cloth resolution, above the highest inverted point."
        },
        {
          "@type": "HowToStep",
          "name": "Simulate",
          "text": "Move particles down under gravity and pull neighbours together with spring forces whose stiffness is set by rigidness, until the cloth stops moving or the iteration limit is reached."
        },
        {
          "@type": "HowToStep",
          "name": "Handle steep slopes",
          "text": "Optionally post-process particles that stopped too early on steep slopes (slope smoothing), so the cloth follows the terrain more closely there."
        },
        {
          "@type": "HowToStep",
          "name": "Classify",
          "text": "Compute each point's distance to the cloth surface; points within the classification threshold become ground (class 2), others keep or receive non-ground."
        },
        {
          "@type": "HowToStep",
          "name": "Validate and rasterize",
          "text": "Check ground against references, then build the DTM with writers.gdal."
        }
      ]
    },
    {
      "@type": "FAQPage",
      "mainEntity": [
        {
          "@type": "Question",
          "name": "How does the cloth simulation filter work?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "It inverts the point cloud so the ground becomes the top surface, drops a simulated cloth onto it and lets the cloth settle under gravity and internal stiffness. The settled cloth approximates the terrain, and points close to it are classified as ground."
          }
        },
        {
          "@type": "Question",
          "name": "When is CSF better than SMRF?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "CSF often does well on gently rolling terrain with scattered objects and in forests with reasonable ground penetration, and it has few parameters. SMRF tends to be more controllable on complex urban scenes and very steep terrain. Compare both on a reference tile for each new project."
          }
        },
        {
          "@type": "Question",
          "name": "What rigidness should I use?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Use 1 for steep, mountainous terrain, 2 for rolling terrain and 3 for flat terrain. Higher rigidness rejects low objects better but cuts off sharp terrain features."
          }
        },
        {
          "@type": "Question",
          "name": "What cloth resolution should I start with?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Start near the average spacing of last and single returns: roughly 0.5 metres for dense drone data, 1 metre for 8 to 15 points per square metre, and 1.5 to 2 metres for sparse regional collections. Then check a hillshade of the resulting DTM for buildings accepted as ground or terrain features cut off, and adjust in steps of about a quarter."
          }
        },
        {
          "@type": "Question",
          "name": "Why does CSF struggle at tile edges?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "The cloth has free edges at the tile boundary, where particles have fewer neighbours holding them up, and terrain just outside the tile is invisible to the simulation. Both make ground classification less reliable within a few tens of metres of the edge. Processing buffered tiles and cropping back to the nominal extent removes the problem."
          }
        },
        {
          "@type": "Question",
          "name": "Can I combine CSF with SMRF?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Yes. A common pattern is to accept points both filters call ground, then review the disagreements. Where the two agree, confidence is high; where they disagree, the difference raster points straight at the areas that need a closer look or a local parameter change."
          }
        },
        {
          "@type": "Question",
          "name": "Does filters.csf use all returns?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "By default it uses last and only returns, which are the returns most likely to reach the ground. You can change that with the returns option, but including early returns usually adds vegetation to the cloth input."
          }
        }
      ]
    }
  ]
}
</script>

The cloth simulation filter takes a physical idea and turns it into a ground classifier: flip the point cloud upside down, drop a sheet of cloth onto it from above, and let the cloth settle under gravity. A stiff cloth cannot sag into the gaps between buildings or trees, so it comes to rest on the underside of the terrain — which, turned the right way up, is the ground surface. Points close to the settled cloth are ground; everything else is not. Zhang and colleagues published the method in 2016, and PDAL implements it as `filters.csf`. This topic, part of [Ground Filtering and DTM/DSM Generation](https://www.pythonlidar.com/ground-filtering-dtm-dsm-generation/), covers how the simulation works, the handful of parameters that control it, and where it outperforms the morphological filters [SMRF](https://www.pythonlidar.com/ground-filtering-dtm-dsm-generation/smrf-ground-classification/) and [PMF](https://www.pythonlidar.com/ground-filtering-dtm-dsm-generation/pmf-ground-classification/).

<svg viewBox="0 0 740 230" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="An inverted point cloud with a cloth settling onto the underside of the terrain" style="width:100%;max-width:740px;display:block;margin:1.6rem auto">
  <title>A cloth dropped onto an upside-down landscape</title>
  <desc>Left: a terrain profile with a building and a tree, the right way up. Right: the same profile inverted, so the building and tree hang downward and the ground forms the upper surface. A cloth of connected particles rests on that upper surface, bridging the gaps above the hanging objects. Points within a threshold distance of the cloth are classified as ground.</desc>
  <rect x="0" y="0" width="740" height="230" fill="var(--dg-bg)" rx="10"/>
  <text x="180" y="24" text-anchor="middle" font-size="11.5" font-weight="600" fill="var(--dg-text)">original</text>
  <text x="550" y="24" text-anchor="middle" font-size="11.5" font-weight="600" fill="var(--dg-text)">inverted, cloth settled</text>
  <path d="M30 190 L110 180 L170 186 L240 172 L330 178" fill="none" stroke="var(--dg-d)" stroke-width="2"/>
  <path d="M120 182 L120 120 L170 120 L170 186" fill="var(--dg-surface-2)" stroke="var(--dg-line)" stroke-width="1.2"/>
  <line x1="260" y1="176" x2="260" y2="140" stroke="var(--dg-line)" stroke-width="2"/>
  <ellipse cx="260" cy="118" rx="30" ry="26" fill="var(--dg-d-soft)" stroke="var(--dg-d)" stroke-width="1.2"/>
  <path d="M400 60 L480 70 L540 64 L610 78 L700 72" fill="none" stroke="var(--dg-d)" stroke-width="2"/>
  <path d="M490 68 L490 130 L540 130 L540 64" fill="var(--dg-surface-2)" stroke="var(--dg-line)" stroke-width="1.2"/>
  <line x1="630" y1="76" x2="630" y2="112" stroke="var(--dg-line)" stroke-width="2"/>
  <ellipse cx="630" cy="134" rx="30" ry="26" fill="var(--dg-d-soft)" stroke="var(--dg-d)" stroke-width="1.2"/>
  <polyline points="400,54 440,58 480,62 510,60 540,57 580,64 610,70 650,68 700,65" fill="none" stroke="var(--dg-c)" stroke-width="2.4" stroke-dasharray="2 4"/>
  <g fill="var(--dg-c)"><circle cx="400" cy="54" r="3"/><circle cx="440" cy="58" r="3"/><circle cx="480" cy="62" r="3"/><circle cx="510" cy="60" r="3"/><circle cx="540" cy="57" r="3"/><circle cx="580" cy="64" r="3"/><circle cx="610" cy="70" r="3"/><circle cx="650" cy="68" r="3"/><circle cx="700" cy="65" r="3"/></g>
  <text x="550" y="44" text-anchor="middle" font-size="10.5" fill="var(--dg-c)">cloth particles</text>
  <text x="550" y="200" text-anchor="middle" font-size="10.5" fill="var(--dg-muted)">rigid cloth bridges the hanging building and tree</text>
  <text x="180" y="216" text-anchor="middle" font-size="10.5" fill="var(--dg-muted)">ground, building, tree</text>
</svg>

## Prerequisites

- **PDAL 2.1 or newer** with `filters.csf`; confirm with `pdal --options filters.csf`.
- **Python 3.10+** with the PDAL bindings, NumPy and rasterio for checks.
- **Noise removed or classified** (classes 7 and 18). A single low outlier becomes the "highest" point of the inverted cloud and catches the cloth.
- **A projected CRS in metres.** Cloth resolution and thresholds are distances.
- **Some idea of the terrain type**: flat, rolling or steep. It decides the rigidness setting and whether slope smoothing is needed.
- **Reference ground** for tuning, such as a manually checked tile or surveyed checkpoints; see [benchmarking SMRF against reference ground points](https://www.pythonlidar.com/ground-filtering-dtm-dsm-generation/smrf-ground-classification/benchmarking-smrf-against-reference-ground-points/) for the method, which applies unchanged to CSF.

## Core Workflow Architecture

1. **Invert.** Multiply Z by −1 so the terrain becomes the top of the cloud.
2. **Initialize the cloth.** Place a grid of particles, spaced at the cloth resolution, above the highest inverted point.
3. **Simulate.** Move particles down under gravity and pull neighbours together with spring forces whose stiffness is set by rigidness, until the cloth stops moving or the iteration limit is reached.
4. **Handle steep slopes.** Optionally post-process particles that stopped too early on steep slopes (slope smoothing), so the cloth follows the terrain more closely there.
5. **Classify.** Compute each point's distance to the cloth surface; points within the classification threshold become ground (class 2), others keep or receive non-ground.
6. **Validate and rasterize.** Check ground against references, then build the DTM with [writers.gdal](https://www.pythonlidar.com/ground-filtering-dtm-dsm-generation/dtm-raster-generation/generating-a-dtm-geotiff-with-writers-gdal/).

## Full Implementation

```python
"""Ground classification with PDAL filters.csf, plus a DTM and quick diagnostics."""
from __future__ import annotations

import json
import logging
from dataclasses import dataclass, asdict
from pathlib import Path

import numpy as np
import pdal

log = logging.getLogger("csf")


@dataclass(frozen=True)
class CsfParams:
    resolution: float = 1.0      # cloth grid spacing, m
    rigidness: int = 2           # 1 steep, 2 rolling, 3 flat
    threshold: float = 0.5       # m, distance to cloth counted as ground
    smooth: bool = True          # slope post-processing
    step: float = 0.65           # simulation time step
    iterations: int = 500
    hdiff: float = 0.3           # m, height difference used in slope smoothing


def csf_pipeline(src: Path, dst_laz: Path, dst_dtm: Path, p: CsfParams, res: float = 1.0) -> dict:
    return {"pipeline": [
        {"type": "readers.las", "filename": str(src)},
        {"type": "filters.range", "limits": "Classification![7:7],Classification![18:18]"},
        {"type": "filters.assign", "value": ["Classification = 1 WHERE Classification == 2"]},
        {"type": "filters.csf", **asdict(p)},
        {"type": "writers.las", "filename": str(dst_laz), "minor_version": 4,
         "dataformat_id": 6, "forward": "all", "tag": "classified"},
        {"type": "filters.range", "inputs": ["classified"], "limits": "Classification[2:2]"},
        {"type": "writers.gdal", "filename": str(dst_dtm), "resolution": res,
         "output_type": "idw", "window_size": 6, "data_type": "float32",
         "gdalopts": "COMPRESS=DEFLATE,TILED=YES"},
    ]}


def run(src: Path, out_dir: Path, params: CsfParams = CsfParams()) -> dict:
    out_dir.mkdir(parents=True, exist_ok=True)
    laz, dtm = out_dir / f"{src.stem}_csf.laz", out_dir / f"{src.stem}_dtm.tif"
    p = pdal.Pipeline(json.dumps(csf_pipeline(src, laz, dtm, params)))
    p.execute()
    check = pdal.Pipeline(json.dumps({"pipeline": [str(laz)]}))
    check.execute()
    a = check.arrays[0]
    ground = a["Classification"] == 2
    last = a["ReturnNumber"] == a["NumberOfReturns"]
    stats = {
        "points": int(len(a)),
        "ground_share": round(float(ground.mean()), 3),
        "ground_share_of_last_returns": round(float((ground & last).sum() / max(last.sum(), 1)), 3),
        "ground_from_early_returns": int((ground & (a["ReturnNumber"] < a["NumberOfReturns"])).sum()),
    }
    log.info("%s: %s", src.name, stats)
    return stats


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
    run(Path("tiles/forest_0822.laz"), Path("out/csf"), CsfParams(resolution=0.8, rigidness=2))
```

## Code Breakdown

**Resetting existing ground first.** `filters.csf` classifies points it finds on the cloth as ground but does not necessarily reset points previously labelled ground elsewhere. Moving class 2 to class 1 before the filter makes the output reflect CSF alone, which is what you want when comparing methods.

**Parameters in a dataclass.** `asdict(p)` passes every option by name, so the parameters used for a tile are one object you can log, store beside the output, and sweep in experiments.

**`rigidness: 2`.** Rigidness sets how stiff the cloth is: 1 for steep terrain, where the cloth must bend to follow slopes; 3 for flat terrain, where a stiff cloth best rejects low vegetation and cars; 2 for rolling terrain in between. It is the setting that matters most after resolution.

**`resolution: 0.8`.** The cloth grid spacing. It should be close to the ground point spacing: finer than that and the cloth drapes into small gaps between buildings or under canopy; coarser and it bridges real terrain features such as ditches.

**Tagged branch to the DTM.** Writing the classified cloud and the DTM from the same run guarantees they agree, a pattern covered in [branching a PDAL pipeline with tags](https://www.pythonlidar.com/pdal-pipeline-architecture-execution/pdal-stage-chaining/branching-a-pdal-pipeline-with-tags/).

**Diagnostics from return numbers.** Ground returns are overwhelmingly last or single returns. A noticeable count of ground points that are early returns of multi-return pulses means the cloth sagged into canopy — a sign that resolution is too fine or rigidness too low.

## Parameter Reference Table

| Option | Type | Default | Typical range | Effect |
|---|---|---|---|---|
| `resolution` | float, m | 1.0 | 0.5–3.0 | Cloth grid spacing; near ground point spacing |
| `rigidness` | int | 3 | 1–3 | 1 steep, 2 rolling, 3 flat terrain |
| `threshold` | float, m | 0.5 | 0.2–1.0 | Distance from cloth that counts as ground |
| `smooth` | bool | true | — | Slope post-processing for steep areas |
| `hdiff` | float, m | 0.3 | 0.1–1.0 | Height difference used by slope smoothing |
| `step` | float | 0.65 | 0.4–1.0 | Simulation time step; rarely changed |
| `iterations` | int | 500 | 200–1000 | Maximum simulation steps |
| `ignore` | range | none | e.g. `Classification[7:7]` | Points excluded from the simulation |
| `returns` | string | `last,only` | — | Which returns feed the cloth |

<svg viewBox="0 0 740 210" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Effect of cloth rigidness on a slope with a small building" style="width:100%;max-width:740px;display:block;margin:1.6rem auto">
  <title>Rigidness trades slope-following against object rejection</title>
  <desc>Three settled cloths over the same inverted terrain: a steep bank next to a small building. Rigidness 1 follows the bank closely but sags slightly into the building. Rigidness 2 follows the bank reasonably and bridges the building. Rigidness 3 bridges the building cleanly but cuts the top of the bank, missing ground points there.</desc>
  <rect x="0" y="0" width="740" height="210" fill="var(--dg-bg)" rx="10"/>
  <path d="M40 40 L200 40 L300 120 L700 120" fill="none" stroke="var(--dg-d)" stroke-width="2"/>
  <path d="M470 120 L470 170 L540 170 L540 120" fill="var(--dg-surface-2)" stroke="var(--dg-line)" stroke-width="1.2"/>
  <polyline points="40,36 200,36 300,116 470,116 505,134 540,116 700,116" fill="none" stroke="var(--dg-a)" stroke-width="1.8"/>
  <polyline points="40,32 200,32 290,104 470,112 540,112 700,112" fill="none" stroke="var(--dg-b)" stroke-width="1.8" stroke-dasharray="6 3"/>
  <polyline points="40,28 170,28 330,98 700,106" fill="none" stroke="var(--dg-c)" stroke-width="1.8" stroke-dasharray="2 3"/>
  <text x="560" y="150" font-size="10.5" fill="var(--dg-a)">rigidness 1: sags into building</text>
  <text x="560" y="98" font-size="10.5" fill="var(--dg-b)">rigidness 2</text>
  <text x="332" y="86" font-size="10.5" fill="var(--dg-c)">rigidness 3: cuts the bank top</text>
  <text x="40" y="196" font-size="10.5" fill="var(--dg-muted)">inverted view: the green line is the true terrain underside</text>
</svg>

## Validation and Integrity Checks

**Type I and type II errors against a reference.** Count reference ground points classified as non-ground (type I, omission) and reference non-ground points classified as ground (type II, commission). CSF tuned for flat terrain tends toward type I errors on slopes; tuned for slopes, toward type II errors on low vegetation.

**DTM hillshade inspection.** Render a hillshade of the CSF DTM and look for bumps where buildings or dense shrubs were accepted as ground, and for flattened ridges and bank tops where terrain was cut off.

**Ground from early returns.** As in the implementation, count ground points that are not last returns. Near zero is healthy.

**Comparison with SMRF.** Difference the CSF and SMRF DTMs; disagreements larger than 0.5 m concentrate exactly where one method has a problem, which makes them the most efficient places to inspect.

```python
import rasterio
with rasterio.open("out/csf/forest_0822_dtm.tif") as a, rasterio.open("out/smrf/forest_0822_dtm.tif") as b:
    d = a.read(1, masked=True) - b.read(1, masked=True)
print(f"CSF − SMRF: median {np.ma.median(d):+.2f} m, |Δ| > 0.5 m on {np.ma.mean(np.abs(d) > 0.5):.1%} of cells")
```

## Choosing Between CSF, SMRF and PMF

The three ground filters in PDAL answer the same question with different assumptions, and each has a landscape where it is the natural first choice.

**SMRF** builds a minimum surface on a grid and grows its window progressively, testing points against slope-scaled thresholds. It has more parameters than CSF, which makes it more work to tune and more controllable once tuned; it copes well with dense urban scenes where buildings of many sizes sit on nearly flat ground.

**PMF** applies morphological opening with growing windows. It is the oldest of the three, simple and predictable, and well suited to flat agricultural land, but it tends to cut off sharp terrain features as windows grow.

**CSF** reasons about the whole surface at once through the cloth's stiffness. With essentially two meaningful parameters — resolution and rigidness — it is quick to set up, performs well on rolling terrain and in forests with reasonable ground penetration, and degrades gracefully when conditions vary across a tile.

<svg viewBox="0 0 740 200" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Where each ground filter tends to be the natural first choice" style="width:100%;max-width:740px;display:block;margin:1.6rem auto">
  <title>A first choice per landscape</title>
  <desc>A three-column comparison. SMRF is the natural first choice for dense urban scenes with many building sizes. PMF suits flat agricultural land. CSF suits rolling terrain and forests with reasonable ground penetration. A note below says to confirm any choice on a reference tile from the project.</desc>
  <rect x="0" y="0" width="740" height="200" fill="var(--dg-bg)" rx="10"/>
  <rect x="20" y="20" width="220" height="130" rx="10" fill="var(--dg-a-soft)" stroke="var(--dg-a)" stroke-width="1.3"/>
  <rect x="260" y="20" width="220" height="130" rx="10" fill="var(--dg-b-soft)" stroke="var(--dg-b)" stroke-width="1.3"/>
  <rect x="500" y="20" width="220" height="130" rx="10" fill="var(--dg-c-soft)" stroke="var(--dg-c)" stroke-width="1.3"/>
  <text x="130" y="48" text-anchor="middle" font-size="12" font-weight="600" fill="var(--dg-text)">SMRF</text>
  <text x="130" y="78" text-anchor="middle" font-size="10.5" fill="var(--dg-text)">dense urban scenes</text>
  <text x="130" y="100" text-anchor="middle" font-size="10.5" fill="var(--dg-text)">many building sizes</text>
  <text x="130" y="122" text-anchor="middle" font-size="10" fill="var(--dg-muted)">most controllable</text>
  <text x="370" y="48" text-anchor="middle" font-size="12" font-weight="600" fill="var(--dg-text)">PMF</text>
  <text x="370" y="78" text-anchor="middle" font-size="10.5" fill="var(--dg-text)">flat agricultural land</text>
  <text x="370" y="100" text-anchor="middle" font-size="10.5" fill="var(--dg-text)">few sharp features</text>
  <text x="370" y="122" text-anchor="middle" font-size="10" fill="var(--dg-muted)">simple, predictable</text>
  <text x="610" y="48" text-anchor="middle" font-size="12" font-weight="600" fill="var(--dg-text)">CSF</text>
  <text x="610" y="78" text-anchor="middle" font-size="10.5" fill="var(--dg-text)">rolling terrain, forests</text>
  <text x="610" y="100" text-anchor="middle" font-size="10.5" fill="var(--dg-text)">mixed conditions</text>
  <text x="610" y="122" text-anchor="middle" font-size="10" fill="var(--dg-muted)">two key parameters</text>
  <text x="370" y="180" text-anchor="middle" font-size="10.5" fill="var(--dg-muted)">a starting point only — confirm on a reference tile from the project</text>
</svg>

None of these generalizations survives contact with every dataset. The reliable approach is to run two candidates on one representative, reference-checked tile per landscape type in the project, compare type I and type II errors, and pick per landscape rather than per project. Keeping the ground filter a parameter of a [templated pipeline](https://www.pythonlidar.com/pdal-pipeline-architecture-execution/pipeline-templating-parameterization/) makes that per-landscape choice cheap to apply across thousands of tiles.

## Performance Tuning

CSF's cost depends mostly on the cloth: the number of particles (area ÷ resolution²) times iterations. Points only matter for the final distance computation. Practical levers:

- **Coarser cloth.** Halving resolution quarters the particle count. On 2–4 pts/m² data, 1.5–2 m cloth is often both faster and better.
- **Fewer iterations on flat terrain.** The cloth settles quickly on flat ground; 200–300 iterations suffice, while mountainous tiles may need the full 500.
- **Tile with a buffer.** Like every ground filter, CSF behaves poorly at tile edges; process with a 30–50 m buffer and crop, as in [buffered tiling to avoid edge artefacts](https://www.pythonlidar.com/batch-automation-cloud-integration/tile-indexing-and-merging/buffered-tiling-to-avoid-edge-artefacts/).
- **Process tiles in parallel.** `filters.csf` is single-threaded; parallelism comes from running tiles in separate processes.

## Common Errors and Troubleshooting

**Almost nothing classified as ground.** A low outlier inverted into the highest point pinned the cloth far above the terrain. Remove classes 7 and 18, or run `filters.elm` and an outlier filter first.

**Buildings in the DTM.** Rigidness too low or resolution too fine for the building size. Raise rigidness to 3 in urban flat areas, or coarsen the cloth.

**Ridges and bank tops missing.** Rigidness too high for the slopes, or slope smoothing disabled. Lower rigidness and keep `smooth` on.

**Stripes of ground under canopy.** Canopy returns at low height were close enough to the cloth to pass the threshold. Lower `threshold` to 0.3 m, or restrict `returns` to last and only returns (the default).

**Results change with tile size.** The cloth's starting height and boundaries depend on the tile. Use consistent tile sizes and buffers across a project.

## Frequently Asked Questions

**How does the cloth simulation filter work?**

It inverts the point cloud so the ground becomes the top surface, drops a simulated cloth onto it and lets the cloth settle under gravity and internal stiffness. The settled cloth approximates the terrain, and points close to it are classified as ground.

**When is CSF better than SMRF?**

CSF often does well on gently rolling terrain with scattered objects and in forests with reasonable ground penetration, and it has few parameters. SMRF tends to be more controllable on complex urban scenes and very steep terrain. Compare both on a reference tile for each new project.

**What rigidness should I use?**

Use 1 for steep, mountainous terrain, 2 for rolling terrain and 3 for flat terrain. Higher rigidness rejects low objects better but cuts off sharp terrain features.

**What cloth resolution should I start with?**

Start near the average spacing of last and single returns: roughly 0.5 metres for dense drone data, 1 metre for 8 to 15 points per square metre, and 1.5 to 2 metres for sparse regional collections. Then check a hillshade of the resulting DTM for buildings accepted as ground or terrain features cut off, and adjust in steps of about a quarter.

**Why does CSF struggle at tile edges?**

The cloth has free edges at the tile boundary, where particles have fewer neighbours holding them up, and terrain just outside the tile is invisible to the simulation. Both make ground classification less reliable within a few tens of metres of the edge. Processing buffered tiles and cropping back to the nominal extent removes the problem.

**Can I combine CSF with SMRF?**

Yes. A common pattern is to accept points both filters call ground, then review the disagreements. Where the two agree, confidence is high; where they disagree, the difference raster points straight at the areas that need a closer look or a local parameter change.

**Does filters.csf use all returns?**

By default it uses last and only returns, which are the returns most likely to reach the ground. You can change that with the returns option, but including early returns usually adds vegetation to the cloth input.

## Related

- [Classifying Ground with filters.csf](https://www.pythonlidar.com/ground-filtering-dtm-dsm-generation/csf-cloth-simulation-filter/classifying-ground-with-filters-csf/) — a complete worked run
- [Tuning CSF Cloth Resolution and Rigidness](https://www.pythonlidar.com/ground-filtering-dtm-dsm-generation/csf-cloth-simulation-filter/tuning-csf-cloth-resolution-and-rigidness/) — parameter sweeps against a reference
- [CSF vs SMRF for Forested Ground](https://www.pythonlidar.com/ground-filtering-dtm-dsm-generation/csf-cloth-simulation-filter/csf-vs-smrf-for-forested-ground/) — a head-to-head comparison
- [SMRF Ground Classification](https://www.pythonlidar.com/ground-filtering-dtm-dsm-generation/smrf-ground-classification/) — the morphological alternative
- [DTM Raster Generation](https://www.pythonlidar.com/ground-filtering-dtm-dsm-generation/dtm-raster-generation/) — turning ground into a terrain model
