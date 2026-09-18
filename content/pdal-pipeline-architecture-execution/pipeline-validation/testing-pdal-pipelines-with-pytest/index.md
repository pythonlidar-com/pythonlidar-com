---
title: "Testing PDAL Pipelines with pytest"
description: "Unit-test PDAL pipelines with pytest and synthetic point clouds: build tiny LAS fixtures with laspy, assert classification and dimension outcomes, parametrize over pipeline variants, and keep tests fast enough to run on every commit."
slug: "testing-pdal-pipelines-with-pytest"
type: "howto"
breadcrumb: "Testing with pytest"
datePublished: "2026-09-18"
dateModified: "2026-09-18"
---

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Article",
      "headline": "Testing PDAL Pipelines with pytest",
      "description": "Unit-test PDAL pipelines with pytest and synthetic point clouds: build tiny LAS fixtures with laspy, assert classification and dimension outcomes, parametrize over pipeline variants, and keep tests fast enough to run on every commit.",
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
          "name": "PDAL Pipeline Architecture and Execution",
          "item": "https://www.pythonlidar.com/pdal-pipeline-architecture-execution/"
        },
        {
          "@type": "ListItem",
          "position": 3,
          "name": "Pipeline Validation",
          "item": "https://www.pythonlidar.com/pdal-pipeline-architecture-execution/pipeline-validation/"
        },
        {
          "@type": "ListItem",
          "position": 4,
          "name": "Testing with pytest",
          "item": "https://www.pythonlidar.com/pdal-pipeline-architecture-execution/pipeline-validation/testing-pdal-pipelines-with-pytest/"
        }
      ]
    },
    {
      "@type": "HowTo",
      "name": "Test PDAL pipelines with pytest and synthetic fixtures",
      "step": [
        {
          "@type": "HowToStep",
          "name": "Build a synthetic scene in a fixture",
          "text": "Generate coordinates with NumPy: a grid of ground points on a gentle slope, a denser block of roof points above part of it, and a couple of noise points. Write it with laspy to pytest's tmp_path."
        },
        {
          "@type": "HowToStep",
          "name": "Tag each point with its expected outcome",
          "text": "Store the expected class in user_data or a separate array. The pipeline should never read it, and the assertion compares against it."
        },
        {
          "@type": "HowToStep",
          "name": "Run the pipeline under test",
          "text": "Call the same function that production uses, pointed at the fixture paths."
        },
        {
          "@type": "HowToStep",
          "name": "Assert behaviours, not implementation",
          "text": "Assert that ground points end up in class 2, roof points do not, noise is gone, and new dimensions exist with sensible ranges. Avoid asserting exact counts that depend on filter internals unless the scene makes them unambiguous."
        },
        {
          "@type": "HowToStep",
          "name": "Parametrize variants",
          "text": "Run the same assertions over every template or parameter set used in production with pytest.mark.parametrize."
        }
      ]
    },
    {
      "@type": "FAQPage",
      "mainEntity": [
        {
          "@type": "Question",
          "name": "How do I unit-test a PDAL pipeline?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Create a small synthetic point cloud whose correct result is known by construction, run the pipeline on it inside a pytest test, and assert on outcomes such as which points end up in which class and which dimensions exist."
          }
        },
        {
          "@type": "Question",
          "name": "Why use synthetic data instead of a real tile?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Synthetic scenes are tiny, fast, and have a known answer for every point. Real tiles are slow and ambiguous. Keep a few real reference tiles for nightly regression runs, and use synthetic scenes for tests on every commit."
          }
        },
        {
          "@type": "Question",
          "name": "How do I carry the expected answer through the pipeline?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Store it in a dimension the pipeline does not touch, such as user_data, when writing the fixture. It travels with each point and is available in the output array for comparison."
          }
        },
        {
          "@type": "Question",
          "name": "Should tests assert exact point counts?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Only when the scene makes the count unambiguous, such as the number of noise points removed. For heuristic filters, assert shares and behaviours, which survive version upgrades."
          }
        }
      ]
    }
  ]
}
</script>

**TL;DR:** Generate a small synthetic LAS in a pytest fixture with laspy — a tilted ground plane, a box-shaped building, a few noise points — run the pipeline under test against it with `pdal.Pipeline`, and assert on what matters: point counts, the classes of known points, the presence and range of new dimensions. Synthetic data makes the expected answer known, runs in milliseconds and needs no large files in the repository.

## Context and Motivation

This guide is part of [Pipeline Validation](https://www.pythonlidar.com/pdal-pipeline-architecture-execution/pipeline-validation/). `pdal pipeline --validate` confirms that a pipeline is well formed. It cannot tell you that the pipeline does the right thing — that noise is removed before SMRF, that a WHERE clause leaves ground untouched, that a template renders a pipeline which still classifies buildings after someone edited a threshold. Those are behaviours, and behaviours need tests.

Real tiles make poor unit-test inputs: they are large, slow, and nobody knows the correct answer for every point. Synthetic clouds invert that. A few thousand points arranged into shapes whose correct classification is obvious by construction let a test assert exact outcomes in well under a second.

<svg viewBox="0 0 740 220" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="A synthetic test scene with ground plane, building box and noise points" style="width:100%;max-width:740px;display:block;margin:1.6rem auto">
  <title>A scene whose answer you already know</title>
  <desc>A synthetic point cloud in profile: a gently tilted ground plane of points, a rectangular block of points rising 8 metres representing a building roof, one point 30 metres below the ground labelled low noise, and one point 150 metres above labelled high noise. Each feature is annotated with the class the pipeline must assign.</desc>
  <rect x="0" y="0" width="740" height="220" fill="var(--dg-bg)" rx="10"/>
  <g fill="var(--dg-d)"><circle cx="40" cy="160" r="2.5"/><circle cx="80" cy="158" r="2.5"/><circle cx="120" cy="156" r="2.5"/><circle cx="160" cy="154" r="2.5"/><circle cx="200" cy="152" r="2.5"/><circle cx="440" cy="140" r="2.5"/><circle cx="480" cy="138" r="2.5"/><circle cx="520" cy="136" r="2.5"/><circle cx="560" cy="134" r="2.5"/><circle cx="600" cy="132" r="2.5"/><circle cx="640" cy="130" r="2.5"/><circle cx="680" cy="128" r="2.5"/></g>
  <g fill="var(--dg-a)"><circle cx="250" cy="90" r="2.5"/><circle cx="280" cy="90" r="2.5"/><circle cx="310" cy="90" r="2.5"/><circle cx="340" cy="90" r="2.5"/><circle cx="370" cy="90" r="2.5"/><circle cx="400" cy="90" r="2.5"/></g>
  <path d="M240 150 L240 90 L410 90 L410 142" fill="none" stroke="var(--dg-line-soft)" stroke-width="1"/>
  <circle cx="620" cy="202" r="4" fill="var(--dg-e)"/>
  <circle cx="120" cy="30" r="4" fill="var(--dg-e)"/>
  <text x="120" y="176" text-anchor="middle" font-size="10.5" fill="var(--dg-d)">ground plane → class 2</text>
  <text x="325" y="80" text-anchor="middle" font-size="10.5" fill="var(--dg-a)">roof 8 m up → not ground</text>
  <text x="608" y="206" text-anchor="end" font-size="10.5" fill="var(--dg-e)">low noise → removed</text>
  <text x="132" y="34" font-size="10.5" fill="var(--dg-e)">high noise → removed</text>
</svg>

## Prerequisites and Assumptions

- Python with pytest, NumPy, laspy 2.x (with `lazrs` if you write LAZ) and the PDAL bindings.
- The pipeline under test available as a function or template that accepts input and output paths.
- Tests run in the same environment (ideally the same container) as production, so PDAL versions match.

## Step-by-Step Implementation

### Step 1 — Build a synthetic scene in a fixture

Generate coordinates with NumPy: a grid of ground points on a gentle slope, a denser block of roof points above part of it, and a couple of noise points. Write it with laspy to pytest's `tmp_path`.

### Step 2 — Tag each point with its expected outcome

Store the expected class in `user_data` or a separate array. The pipeline should never read it, and the assertion compares against it.

### Step 3 — Run the pipeline under test

Call the same function that production uses, pointed at the fixture paths.

### Step 4 — Assert behaviours, not implementation

Assert that ground points end up in class 2, roof points do not, noise is gone, and new dimensions exist with sensible ranges. Avoid asserting exact counts that depend on filter internals unless the scene makes them unambiguous.

### Step 5 — Parametrize variants

Run the same assertions over every template or parameter set used in production with `pytest.mark.parametrize`.

## Complete Working Example

```python
"""pytest tests for a ground-classification pipeline using a synthetic scene."""
from __future__ import annotations

import json
from pathlib import Path

import laspy
import numpy as np
import pdal
import pytest


def ground_pipeline(src: Path, dst: Path, slope: float = 0.15, window: float = 18.0) -> dict:
    return {"pipeline": [
        str(src),
        {"type": "filters.range", "limits": "Classification![7:7],Classification![18:18]"},
        {"type": "filters.smrf", "slope": slope, "window": window, "threshold": 0.5},
        {"type": "filters.hag_nn", "count": 2},
        {"type": "writers.las", "filename": str(dst), "extra_dims": "HeightAboveGround=float",
         "minor_version": 4, "dataformat_id": 6},
    ]}


@pytest.fixture
def scene(tmp_path: Path) -> tuple[Path, np.ndarray]:
    rng = np.random.default_rng(7)
    gx, gy = np.meshgrid(np.arange(0, 100, 1.0), np.arange(0, 100, 1.0))
    gx, gy = gx.ravel() + rng.uniform(-0.3, 0.3, gx.size), gy.ravel() + rng.uniform(-0.3, 0.3, gy.size)
    gz = 100 + 0.05 * gx + rng.normal(0, 0.03, gx.size)
    bx, by = np.meshgrid(np.arange(40, 60, 0.5), np.arange(40, 60, 0.5))
    bx, by = bx.ravel(), by.ravel()
    bz = 100 + 0.05 * bx + 8.0 + rng.normal(0, 0.02, bx.size)
    keep = ~((gx > 40) & (gx < 60) & (gy > 40) & (gy < 60))       # no ground under the roof
    x = np.concatenate([gx[keep], bx, [10.0, 80.0]])
    y = np.concatenate([gy[keep], by, [10.0, 80.0]])
    z = np.concatenate([gz[keep], bz, [70.0, 260.0]])
    expected = np.concatenate([np.full(keep.sum(), 2), np.full(bx.size, 1), [7, 18]]).astype(np.uint8)

    header = laspy.LasHeader(point_format=6, version="1.4")
    header.scales = [0.001, 0.001, 0.001]
    header.offsets = [0.0, 0.0, 0.0]
    las = laspy.LasData(header)
    las.x, las.y, las.z = x, y, z
    las.classification = np.where(expected >= 7, expected, 1)   # noise pre-classified, rest 1
    las.user_data = expected                                     # the answer key
    path = tmp_path / "scene.las"
    las.write(path)
    return path, expected


def run(spec: dict) -> np.ndarray:
    p = pdal.Pipeline(json.dumps(spec))
    p.execute()
    return p.arrays[0]


@pytest.mark.parametrize("slope,window", [(0.15, 18.0), (0.3, 12.0)])
def test_ground_and_roof(scene, tmp_path, slope, window):
    src, _ = scene
    out = run(ground_pipeline(src, tmp_path / "out.las", slope, window))
    ground_truth = out["UserData"] == 2
    roof = out["UserData"] == 1
    assert (out["Classification"][ground_truth] == 2).mean() > 0.98
    assert (out["Classification"][roof] != 2).all(), "roof points classified as ground"


def test_noise_removed(scene, tmp_path):
    src, _ = scene
    out = run(ground_pipeline(src, tmp_path / "out.las"))
    assert not np.isin(out["Classification"], [7, 18]).any()
    assert out["Z"].min() > 95 and out["Z"].max() < 115


def test_hag_dimension(scene, tmp_path):
    src, _ = scene
    out = run(ground_pipeline(src, tmp_path / "out.las"))
    assert "HeightAboveGround" in out.dtype.names
    roof_hag = out["HeightAboveGround"][out["UserData"] == 1]
    assert np.median(roof_hag) == pytest.approx(8.0, abs=0.3)
```

The whole module runs in about a second on a laptop, because the scene holds roughly 11,000 points.

<svg viewBox="140 10 570 190" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Test pyramid for PDAL pipeline checks" style="width:100%;max-width:740px;display:block;margin:1.6rem auto">
  <title>Where each kind of check lives</title>
  <desc>A three-level pyramid. The wide base is structural validation with pdal validate and schema checks, run on every commit in milliseconds. The middle level is behavioural tests on synthetic scenes with pytest, run on every commit in seconds. The narrow top is regression runs on real reference tiles, run nightly or before releases in minutes.</desc>
  <rect x="140" y="10" width="570" height="190" fill="var(--dg-bg)" rx="10"/>
  <path d="M290 30 L450 30 L490 80 L250 80 Z" fill="var(--dg-c-soft)" stroke="var(--dg-c)" stroke-width="1.3"/>
  <path d="M250 84 L490 84 L530 130 L210 130 Z" fill="var(--dg-a-soft)" stroke="var(--dg-a)" stroke-width="1.3"/>
  <path d="M210 134 L530 134 L570 180 L170 180 Z" fill="var(--dg-d-soft)" stroke="var(--dg-d)" stroke-width="1.3"/>
  <text x="370" y="60" text-anchor="middle" font-size="10.5" fill="var(--dg-text)">reference tiles</text>
  <text x="370" y="112" text-anchor="middle" font-size="10.5" fill="var(--dg-text)">synthetic scenes (pytest)</text>
  <text x="370" y="162" text-anchor="middle" font-size="10.5" fill="var(--dg-text)">validate + schema</text>
  <text x="580" y="60" font-size="10.5" fill="var(--dg-muted)">nightly, minutes</text>
  <text x="560" y="112" font-size="10.5" fill="var(--dg-muted)">every commit, seconds</text>
  <text x="590" y="162" font-size="10.5" fill="var(--dg-muted)">every commit, ms</text>
</svg>

## Key Parameter Table

| Element | Choice | Why |
|---|---|---|
| scene size | ~10k points | Fast, yet enough for SMRF windows to behave |
| point format | 6, LAS 1.4 | Matches production; supports class 18 |
| answer key | `user_data` | Travels with each point through the pipeline |
| tolerances | `> 0.98`, `approx(abs=0.3)` | Filters are heuristic; assert behaviour, not perfection |
| parametrize | production parameter sets | Every variant used in production is tested |
| output | `tmp_path` | Isolated, auto-cleaned per test |

## Verification

The tests verify the pipeline; verify the tests by breaking the pipeline on purpose. Remove the noise range filter and `test_noise_removed` must fail. Set `slope` to 5.0 and the roof must end up as ground, failing `test_ground_and_roof`. A test that still passes after a deliberate break is not testing what you think.

```bash
pytest -q tests/test_ground_pipeline.py
```

## Gotchas and Edge Cases

**Scenes too small for window sizes.** SMRF with an 18 m window needs a scene larger than the window, and a building smaller than it. A 100 m scene with a 20 m roof satisfies both.

**Perfectly regular grids.** Real returns are irregular. Jitter coordinates slightly, as the fixture does, or neighbourhood filters can behave in ways they never would on real data.

**Asserting internals.** A test that asserts SMRF classified exactly 9,612 points breaks on every PDAL upgrade. Assert that known-ground points are ground and known-roof points are not.

<svg viewBox="0 0 740 170" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Behavioural assertions survive upgrades while count assertions break" style="width:100%;max-width:740px;display:block;margin:1.6rem auto">
  <title>Assert what, not how many</title>
  <desc>Two assertions checked against two PDAL versions. An exact count assertion passes on version A and fails on version B when an internal change shifts eleven edge points. A behavioural assertion that at least 98 percent of known ground is ground passes on both.</desc>
  <rect x="0" y="0" width="740" height="170" fill="var(--dg-bg)" rx="10"/>
  <g font-size="10.5" fill="var(--dg-text)"><text text-anchor="middle" x="470" y="30">PDAL version A</text><text text-anchor="middle" x="620" y="30">PDAL version B</text></g>
  <rect x="20" y="46" width="360" height="40" rx="7" fill="var(--dg-surface)" stroke="var(--dg-line)"/>
  <text x="36" y="70" font-size="10.5" fill="var(--dg-text)">assert ground_count == 9612</text>
  <rect x="420" y="46" width="100" height="40" rx="7" fill="var(--dg-d-soft)" stroke="var(--dg-d)"/><text x="470" y="70" text-anchor="middle" font-size="10.5" fill="var(--dg-text)">pass</text>
  <rect x="570" y="46" width="100" height="40" rx="7" fill="var(--dg-e-soft)" stroke="var(--dg-e)"/><text x="620" y="70" text-anchor="middle" font-size="10.5" fill="var(--dg-text)">fail</text>
  <rect x="20" y="106" width="360" height="40" rx="7" fill="var(--dg-surface)" stroke="var(--dg-line)"/>
  <text x="36" y="130" font-size="10.5" fill="var(--dg-text)">assert known-ground share &gt; 0.98</text>
  <rect x="420" y="106" width="100" height="40" rx="7" fill="var(--dg-d-soft)" stroke="var(--dg-d)"/><text x="470" y="130" text-anchor="middle" font-size="10.5" fill="var(--dg-text)">pass</text>
  <rect x="570" y="106" width="100" height="40" rx="7" fill="var(--dg-d-soft)" stroke="var(--dg-d)"/><text x="620" y="130" text-anchor="middle" font-size="10.5" fill="var(--dg-text)">pass</text>
</svg>

**Environment drift.** Tests that pass locally and fail in CI usually point to different PDAL versions. Run tests inside the production container image.

## Frequently Asked Questions

**How do I unit-test a PDAL pipeline?**

Create a small synthetic point cloud whose correct result is known by construction, run the pipeline on it inside a pytest test, and assert on outcomes such as which points end up in which class and which dimensions exist.

**Why use synthetic data instead of a real tile?**

Synthetic scenes are tiny, fast, and have a known answer for every point. Real tiles are slow and ambiguous. Keep a few real reference tiles for nightly regression runs, and use synthetic scenes for tests on every commit.

**How do I carry the expected answer through the pipeline?**

Store it in a dimension the pipeline does not touch, such as user_data, when writing the fixture. It travels with each point and is available in the output array for comparison.

**Should tests assert exact point counts?**

Only when the scene makes the count unambiguous, such as the number of noise points removed. For heuristic filters, assert shares and behaviours, which survive version upgrades.

## Related

- [Pipeline Validation](https://www.pythonlidar.com/pdal-pipeline-architecture-execution/pipeline-validation/) — the layers of checking
- [Validating PDAL Pipelines in CI](https://www.pythonlidar.com/pdal-pipeline-architecture-execution/pipeline-validation/validating-pdal-pipelines-in-ci/) — running these tests automatically
- [Schema-Validating Pipeline JSON Before Execution](https://www.pythonlidar.com/pdal-pipeline-architecture-execution/pipeline-validation/schema-validating-pipeline-json-before-execution/) — the structural layer below these tests
- [Writing a LAS File from NumPy Arrays](https://www.pythonlidar.com/point-cloud-data-standards-fundamentals/laspy-numpy-workflows/writing-a-las-file-from-numpy-arrays/) — building fixtures with laspy
- [Building Pipelines with the Python Stage API](https://www.pythonlidar.com/pdal-pipeline-architecture-execution/pipeline-templating-parameterization/building-pipelines-with-the-python-stage-api/) — pipelines that are easy to test
