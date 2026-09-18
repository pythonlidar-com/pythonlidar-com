---
title: "Training a Random Forest Point Classifier"
description: "Train a scikit-learn random forest on LiDAR point features: sampling a balanced training set from many tiles, grouped cross-validation by tile, a small hyperparameter search, and saving a versioned model bundle with its feature list."
slug: "training-a-random-forest-point-classifier"
type: "howto"
breadcrumb: "Random Forest Classifier"
datePublished: "2026-09-18"
dateModified: "2026-09-18"
---

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Article",
      "headline": "Training a Random Forest Point Classifier",
      "description": "Train a scikit-learn random forest on LiDAR point features: sampling a balanced training set from many tiles, grouped cross-validation by tile, a small hyperparameter search, and saving a versioned model bundle with its feature list.",
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
          "name": "Machine Learning Classification",
          "item": "https://www.pythonlidar.com/lidar-classification-feature-extraction/machine-learning-point-classification/"
        },
        {
          "@type": "ListItem",
          "position": 4,
          "name": "Random Forest Classifier",
          "item": "https://www.pythonlidar.com/lidar-classification-feature-extraction/machine-learning-point-classification/training-a-random-forest-point-classifier/"
        }
      ]
    },
    {
      "@type": "HowTo",
      "name": "Train a random forest classifier on LiDAR point features",
      "step": [
        {
          "@type": "HowToStep",
          "name": "Sample a balanced table from every tile",
          "text": "Read each tile, keep above-ground classes, and sample up to N points per class per tile. Sampling per tile keeps every landscape represented; capping per class keeps rare classes visible."
        },
        {
          "@type": "HowToStep",
          "name": "Set up grouped cross-validation",
          "text": "GroupKFold(n_splits=5) with the tile column as groups guarantees that no tile contributes to both training and testing within a fold."
        },
        {
          "@type": "HowToStep",
          "name": "Search a small parameter grid",
          "text": "Forests are forgiving. Tuning max_depth, min_samples_leaf and max_features over a dozen combinations captures nearly all the available gain; more search mostly fits noise in the validation scores."
        },
        {
          "@type": "HowToStep",
          "name": "Score with a class-balanced metric",
          "text": "Use macro-averaged F1 as the selection metric, so a model that ignores wires cannot win by being good at vegetation."
        },
        {
          "@type": "HowToStep",
          "name": "Refit on all tiles and save a bundle",
          "text": "Refit the best configuration on every labelled tile and save the model with its feature order, class list, parameters and cross-validated scores."
        }
      ]
    },
    {
      "@type": "FAQPage",
      "mainEntity": [
        {
          "@type": "Question",
          "name": "Why use GroupKFold instead of ordinary cross-validation?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Neighbouring LiDAR points are nearly identical, so an ordinary split puts near-duplicates on both sides and measures memory rather than generalization. Grouping by tile ensures each test fold contains only areas the model has never seen."
          }
        },
        {
          "@type": "Question",
          "name": "How many trees should the forest have?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Two hundred is a sensible default. Beyond that, predictions barely change while prediction time and model size grow linearly. Tune depth and leaf size instead."
          }
        },
        {
          "@type": "Question",
          "name": "Should I scale or normalize features for a random forest?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "No. Trees split on thresholds, so monotonic rescaling does not change them. Consistency matters more than scale: the prediction pipeline must compute features exactly as training did."
          }
        },
        {
          "@type": "Question",
          "name": "What should go into the saved model bundle?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "The fitted model, the ordered feature list, the class list, the chosen parameters, the cross-validated score, the training tiles and a date. Those are what you need to reproduce a prediction or explain a result months later."
          }
        }
      ]
    }
  ]
}
</script>

**TL;DR:** Sample up to a fixed number of points per class from every labelled tile into one table with a `tile` column, evaluate with `GroupKFold` so each fold holds out whole tiles, tune only `max_depth`, `min_samples_leaf` and `max_features`, then refit on all tiles and save a joblib bundle containing the model, the ordered feature list, the class list and the cross-validated scores.

## Context and Motivation

This guide is part of [Machine Learning Point Classification for LiDAR](https://www.pythonlidar.com/lidar-classification-feature-extraction/machine-learning-point-classification/). A random forest is the pragmatic default for point classification: it trains quickly on hundreds of thousands of rows, handles features on different scales without normalization, copes with correlated features, and exposes feature importances you can reason about. What decides whether it works in production is not the algorithm but three pieces of discipline around it — how the training set is sampled, how the model is evaluated, and how it is packaged so that prediction uses exactly the features training used.

The procedure below assumes features have already been computed and cached per tile, as in [computing geometric features for classification](https://www.pythonlidar.com/lidar-classification-feature-extraction/machine-learning-point-classification/computing-geometric-features-for-classification/).

<svg viewBox="0 0 740 210" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Grouped cross-validation holding out whole tiles in each fold" style="width:100%;max-width:740px;display:block;margin:1.6rem auto">
  <title>Folds made of whole tiles</title>
  <desc>A grid of five folds by ten tiles. In each fold, two different tiles are shaded as the test set and the remaining eight are training. No tile appears in more than one fold's test set, and no tile is split between training and testing within a fold.</desc>
  <rect x="0" y="0" width="740" height="210" fill="var(--dg-bg)" rx="10"/>
  <g font-size="10.5" fill="var(--dg-muted)"><text x="40" y="52">fold 1</text><text x="40" y="84">fold 2</text><text x="40" y="116">fold 3</text><text x="40" y="148">fold 4</text><text x="40" y="180">fold 5</text></g>
  <g fill="var(--dg-surface)" stroke="var(--dg-line-soft)" stroke-width="1">
    <rect x="110" y="36" width="56" height="24"/><rect x="170" y="36" width="56" height="24"/><rect x="290" y="36" width="56" height="24"/><rect x="350" y="36" width="56" height="24"/><rect x="410" y="36" width="56" height="24"/><rect x="470" y="36" width="56" height="24"/><rect x="530" y="36" width="56" height="24"/><rect x="590" y="36" width="56" height="24"/>
    <rect x="110" y="68" width="56" height="24"/><rect x="170" y="68" width="56" height="24"/><rect x="230" y="68" width="56" height="24"/><rect x="290" y="68" width="56" height="24"/><rect x="410" y="68" width="56" height="24"/><rect x="530" y="68" width="56" height="24"/><rect x="590" y="68" width="56" height="24"/><rect x="650" y="68" width="56" height="24"/>
    <rect x="170" y="100" width="56" height="24"/><rect x="230" y="100" width="56" height="24"/><rect x="290" y="100" width="56" height="24"/><rect x="350" y="100" width="56" height="24"/><rect x="410" y="100" width="56" height="24"/><rect x="470" y="100" width="56" height="24"/><rect x="590" y="100" width="56" height="24"/><rect x="650" y="100" width="56" height="24"/>
    <rect x="110" y="132" width="56" height="24"/><rect x="230" y="132" width="56" height="24"/><rect x="350" y="132" width="56" height="24"/><rect x="410" y="132" width="56" height="24"/><rect x="470" y="132" width="56" height="24"/><rect x="530" y="132" width="56" height="24"/><rect x="590" y="132" width="56" height="24"/><rect x="650" y="132" width="56" height="24"/>
    <rect x="110" y="164" width="56" height="24"/><rect x="170" y="164" width="56" height="24"/><rect x="230" y="164" width="56" height="24"/><rect x="290" y="164" width="56" height="24"/><rect x="350" y="164" width="56" height="24"/><rect x="470" y="164" width="56" height="24"/><rect x="530" y="164" width="56" height="24"/><rect x="650" y="164" width="56" height="24"/>
  </g>
  <g fill="var(--dg-c-soft)" stroke="var(--dg-c)" stroke-width="1.2">
    <rect x="230" y="36" width="56" height="24"/><rect x="650" y="36" width="56" height="24"/>
    <rect x="350" y="68" width="56" height="24"/><rect x="470" y="68" width="56" height="24"/>
    <rect x="110" y="100" width="56" height="24"/><rect x="530" y="100" width="56" height="24"/>
    <rect x="170" y="132" width="56" height="24"/><rect x="290" y="132" width="56" height="24"/>
    <rect x="410" y="164" width="56" height="24"/><rect x="590" y="164" width="56" height="24"/>
  </g>
  <text x="110" y="24" font-size="10.5" fill="var(--dg-muted)">ten labelled tiles; shaded = held out for testing in that fold</text>
</svg>

## Prerequisites and Assumptions

- Feature-enriched LAZ files for labelled tiles, each with trustworthy `Classification`.
- Python with scikit-learn 1.3+, pandas, NumPy, joblib and PDAL bindings.
- At least eight to ten labelled tiles from different parts of the project, so grouped cross-validation has something to hold out.

## Step-by-Step Implementation

### Step 1 — Sample a balanced table from every tile

Read each tile, keep above-ground classes, and sample up to N points per class per tile. Sampling per tile keeps every landscape represented; capping per class keeps rare classes visible.

### Step 2 — Set up grouped cross-validation

`GroupKFold(n_splits=5)` with the `tile` column as groups guarantees that no tile contributes to both training and testing within a fold.

### Step 3 — Search a small parameter grid

Forests are forgiving. Tuning `max_depth`, `min_samples_leaf` and `max_features` over a dozen combinations captures nearly all the available gain; more search mostly fits noise in the validation scores.

### Step 4 — Score with a class-balanced metric

Use macro-averaged F1 as the selection metric, so a model that ignores wires cannot win by being good at vegetation.

### Step 5 — Refit on all tiles and save a bundle

Refit the best configuration on every labelled tile and save the model with its feature order, class list, parameters and cross-validated scores.

## Complete Working Example

```python
"""Balanced sampling, grouped CV and a versioned model bundle."""
from __future__ import annotations

import json
from datetime import date
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
import pdal
from sklearn.ensemble import RandomForestClassifier
from sklearn.model_selection import GridSearchCV, GroupKFold

FEATURES = ["HeightAboveGround", "ReturnRatio", "NormalZ", "Curvature",
            "Linearity", "Planarity", "Scattering", "Verticality",
            "Linearity_s", "Planarity_s", "Scattering_s", "Verticality_s"]
CLASSES = [3, 4, 5, 6, 9, 14, 17]


def sample_tile(path: Path, per_class: int, rng: np.random.Generator) -> pd.DataFrame:
    p = pdal.Pipeline(json.dumps({"pipeline": [str(path)]}))
    p.execute()
    a = p.arrays[0]
    df = pd.DataFrame({k: a[k] for k in FEATURES})
    df["y"] = a["Classification"]
    df = df[df.y.isin(CLASSES)]
    parts = [g.sample(min(len(g), per_class), random_state=int(rng.integers(1e9)))
             for _, g in df.groupby("y")]
    out = pd.concat(parts)
    out["tile"] = path.stem
    return out


def build_table(tiles: list[Path], per_class: int = 15_000) -> pd.DataFrame:
    rng = np.random.default_rng(42)
    table = pd.concat([sample_tile(t, per_class, rng) for t in tiles], ignore_index=True)
    print(table.groupby("y").size().rename("rows"))
    return table


def train(table: pd.DataFrame, out: Path) -> dict:
    X, y, groups = table[FEATURES], table["y"], table["tile"]
    grid = GridSearchCV(
        RandomForestClassifier(n_estimators=200, class_weight="balanced_subsample",
                               n_jobs=-1, random_state=0),
        param_grid={"max_depth": [14, 18, 24],
                    "min_samples_leaf": [2, 5, 10],
                    "max_features": ["sqrt", 0.5]},
        scoring="f1_macro", cv=GroupKFold(n_splits=5), n_jobs=1, refit=True, verbose=1,
    )
    grid.fit(X, y, groups=groups)
    bundle = {
        "model": grid.best_estimator_,
        "features": FEATURES,
        "classes": CLASSES,
        "params": grid.best_params_,
        "cv_f1_macro": float(grid.best_score_),
        "tiles": sorted(groups.unique()),
        "trained": date.today().isoformat(),
    }
    joblib.dump(bundle, out, compress=3)
    print(f"best {grid.best_params_}  grouped-CV macro F1 {grid.best_score_:.3f}")
    return bundle


if __name__ == "__main__":
    tiles = sorted(Path("features").glob("*.laz"))
    train(build_table(tiles), Path("models/rf_2026-09.joblib"))
```

`refit=True` means `best_estimator_` is already fitted on all rows after the search, so no separate final fit is needed.

<svg viewBox="0 0 740 200" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Macro F1 across the parameter grid showing a broad plateau" style="width:100%;max-width:740px;display:block;margin:1.6rem auto">
  <title>Forests have a wide plateau</title>
  <desc>A heat grid of grouped cross-validated macro F1 over max_depth rows 14, 18 and 24 and min_samples_leaf columns 2, 5 and 10. Scores range narrowly from 0.842 to 0.861. The best cell, depth 18 with leaf 5, is outlined. The spread across the whole grid is under two points of F1.</desc>
  <rect x="0" y="0" width="740" height="200" fill="var(--dg-bg)" rx="10"/>
  <g font-size="10.5" fill="var(--dg-muted)"><text x="150" y="68" text-anchor="end">depth 14</text><text x="150" y="112" text-anchor="end">depth 18</text><text x="150" y="156" text-anchor="end">depth 24</text><text x="220" y="36" text-anchor="middle">leaf 2</text><text x="340" y="36" text-anchor="middle">leaf 5</text><text x="460" y="36" text-anchor="middle">leaf 10</text></g>
  <g stroke="var(--dg-line-soft)" stroke-width="1">
    <rect x="160" y="46" width="120" height="40" fill="var(--dg-b-soft)"/><rect x="280" y="46" width="120" height="40" fill="var(--dg-b-soft)"/><rect x="400" y="46" width="120" height="40" fill="var(--dg-surface)"/>
    <rect x="160" y="90" width="120" height="40" fill="var(--dg-b-soft)"/><rect x="280" y="90" width="120" height="40" fill="var(--dg-a-soft)"/><rect x="400" y="90" width="120" height="40" fill="var(--dg-b-soft)"/>
    <rect x="160" y="134" width="120" height="40" fill="var(--dg-surface)"/><rect x="280" y="134" width="120" height="40" fill="var(--dg-b-soft)"/><rect x="400" y="134" width="120" height="40" fill="var(--dg-b-soft)"/>
  </g>
  <rect x="280" y="90" width="120" height="40" fill="none" stroke="var(--dg-a)" stroke-width="2.2"/>
  <g font-size="11" fill="var(--dg-text)"><text text-anchor="middle" x="220" y="70">0.853</text><text text-anchor="middle" x="340" y="70">0.856</text><text text-anchor="middle" x="460" y="70">0.849</text><text text-anchor="middle" x="220" y="114">0.855</text><text text-anchor="middle" x="340" y="114">0.861</text><text text-anchor="middle" x="460" y="114">0.857</text><text text-anchor="middle" x="220" y="158">0.842</text><text text-anchor="middle" x="340" y="158">0.852</text><text text-anchor="middle" x="460" y="158">0.855</text></g>
  <text x="550" y="114" font-size="10.5" fill="var(--dg-text)">best, but only</text>
  <text x="550" y="130" font-size="10.5" fill="var(--dg-text)">0.019 above worst</text>
</svg>

## Key Parameter Table

| Parameter | Type | Search values | Effect |
|---|---|---|---|
| `n_estimators` | int | fixed 200 | More trees stabilize predictions; rarely worth tuning |
| `max_depth` | int | 14, 18, 24 | Depth limits memorization of neighbourhood quirks |
| `min_samples_leaf` | int | 2, 5, 10 | Larger leaves regularize against label noise |
| `max_features` | str/float | `sqrt`, 0.5 | Features tried per split; more is slower, sometimes better |
| `class_weight` | str | `balanced_subsample` | Keeps rare classes visible within each tree |
| per-class sample | int | 15,000 per tile | Caps dominant classes; raise if rare classes lack examples |

## Verification

- **Grouped score versus random-split score.** Run one random `KFold` for comparison. A gap of five or more points of macro F1 shows how much a naive evaluation would have overstated performance.
- **Per-fold spread.** Look at `grid.cv_results_` for the best configuration: a fold far below the others is a tile unlike the rest, and a sign you need more labelled data from that kind of landscape.
- **Bundle round trip.** Load the saved bundle and predict on a few rows to make sure the feature order is honoured.

```python
bundle = joblib.load("models/rf_2026-09.joblib")
row = table[bundle["features"]].head(5)
assert list(row.columns) == bundle["features"]
print(bundle["model"].predict(row), bundle["cv_f1_macro"], bundle["params"])
```

## Gotchas and Edge Cases

**Class present in only one tile.** Grouped CV will hold that tile out in one fold, leaving the class absent from training there and producing a very low score for it. That is honest — it says the model cannot generalize that class — but it means you need labels for the class in more tiles.

**Label noise.** Vendor classifications used as labels contain errors, especially low versus medium vegetation. A larger `min_samples_leaf` helps the forest average over them; do not chase perfect training accuracy.

**Model size.** Deep forests on many rows produce joblib files of hundreds of megabytes. `compress=3` helps; so does capping depth. Check the size before shipping the model into a container image.

<svg viewBox="0 0 740 180" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Model file size against max_depth" style="width:100%;max-width:740px;display:block;margin:1.6rem auto">
  <title>Depth drives model size</title>
  <desc>Bars of compressed model size for 200 trees at three depths: about 40 megabytes at depth 14, 110 at depth 18, and 380 at depth 24, while grouped F1 barely changes. A note suggests choosing the shallowest depth on the score plateau.</desc>
  <rect x="0" y="0" width="740" height="180" fill="var(--dg-bg)" rx="10"/>
  <line x1="120" y1="150" x2="620" y2="150" stroke="var(--dg-line)" stroke-width="1.3"/>
  <rect x="160" y="136" width="90" height="14" fill="var(--dg-b)"/>
  <rect x="320" y="112" width="90" height="38" fill="var(--dg-b)"/>
  <rect x="480" y="22" width="90" height="128" fill="var(--dg-b)"/>
  <text x="205" y="128" text-anchor="middle" font-size="10.5" fill="var(--dg-text)">40 MB</text>
  <text x="365" y="104" text-anchor="middle" font-size="10.5" fill="var(--dg-text)">110 MB</text>
  <text x="590" y="40" font-size="10.5" fill="var(--dg-text)">380 MB</text>
  <text x="205" y="168" text-anchor="middle" font-size="10" fill="var(--dg-muted)">depth 14</text>
  <text x="365" y="168" text-anchor="middle" font-size="10" fill="var(--dg-muted)">depth 18</text>
  <text x="525" y="168" text-anchor="middle" font-size="10" fill="var(--dg-muted)">depth 24</text>
</svg>

**Data leakage through overlap.** Two tiles that share a flightline overlap strip contain near-identical points. Group by a spatial block larger than a tile if your tiling has overlap, or remove overlap points before sampling.

## Frequently Asked Questions

**Why use GroupKFold instead of ordinary cross-validation?**

Neighbouring LiDAR points are nearly identical, so an ordinary split puts near-duplicates on both sides and measures memory rather than generalization. Grouping by tile ensures each test fold contains only areas the model has never seen.

**How many trees should the forest have?**

Two hundred is a sensible default. Beyond that, predictions barely change while prediction time and model size grow linearly. Tune depth and leaf size instead.

**Should I scale or normalize features for a random forest?**

No. Trees split on thresholds, so monotonic rescaling does not change them. Consistency matters more than scale: the prediction pipeline must compute features exactly as training did.

**What should go into the saved model bundle?**

The fitted model, the ordered feature list, the class list, the chosen parameters, the cross-validated score, the training tiles and a date. Those are what you need to reproduce a prediction or explain a result months later.

## Related

- [Machine Learning Point Classification](https://www.pythonlidar.com/lidar-classification-feature-extraction/machine-learning-point-classification/) — the end-to-end loop
- [Computing Geometric Features for Classification](https://www.pythonlidar.com/lidar-classification-feature-extraction/machine-learning-point-classification/computing-geometric-features-for-classification/) — the inputs to this model
- [Evaluating Point Classification with a Confusion Matrix](https://www.pythonlidar.com/lidar-classification-feature-extraction/machine-learning-point-classification/evaluating-point-classification-with-a-confusion-matrix/) — reading the results per class
- [Extracting Objects from Segment Labels](https://www.pythonlidar.com/lidar-classification-feature-extraction/point-cloud-segmentation/extracting-objects-from-segment-labels/) — voting predictions per object
- [Pinning PDAL Versions with conda-lock](https://www.pythonlidar.com/batch-automation-cloud-integration/pdal-docker-containers/pinning-pdal-versions-with-conda-lock/) — keeping feature computation reproducible
