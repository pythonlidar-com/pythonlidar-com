---
title: "Machine Learning Point Classification for LiDAR"
description: "Train a per-point classifier on PDAL-computed geometric features: building a labelled training set, spatially honest train/test splits, a scikit-learn random forest, and writing predicted ASPRS classes back to LAS."
slug: "machine-learning-point-classification"
type: "topic"
breadcrumb: "Machine Learning Classification"
datePublished: "2026-09-18"
dateModified: "2026-09-18"
---

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Article",
      "headline": "Machine Learning Point Classification for LiDAR",
      "description": "Train a per-point classifier on PDAL-computed geometric features: building a labelled training set, spatially honest train/test splits, a scikit-learn random forest, and writing predicted ASPRS classes back to LAS.",
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
        }
      ]
    },
    {
      "@type": "HowTo",
      "name": "Machine Learning Point Classification for LiDAR",
      "step": [
        {
          "@type": "HowToStep",
          "name": "Compute features",
          "text": "Run one PDAL feature pipeline \u2014 HAG, covariance features at one or more scales, normals, intensity, return number ratio \u2014 on training and target tiles alike."
        },
        {
          "@type": "HowToStep",
          "name": "Assemble a training table",
          "text": "Stack features and labels from training tiles into a data frame, recording the tile each row came from."
        },
        {
          "@type": "HowToStep",
          "name": "Balance the classes",
          "text": "Down-sample dominant classes (usually high vegetation) so the model does not ignore rare ones such as wires or bridges."
        },
        {
          "@type": "HowToStep",
          "name": "Split spatially",
          "text": "Hold out whole tiles or blocks for testing, never random points, because neighbouring points share features and would leak."
        },
        {
          "@type": "HowToStep",
          "name": "Train and evaluate",
          "text": "Fit a random forest, compute a confusion matrix and per-class precision and recall on held-out tiles."
        },
        {
          "@type": "HowToStep",
          "name": "Predict and write",
          "text": "Apply the model to new tiles, optionally smooth labels with a neighbour vote, and write ASPRS codes back to the LAS."
        }
      ]
    },
    {
      "@type": "FAQPage",
      "mainEntity": [
        {
          "@type": "Question",
          "name": "Why a random forest rather than a deep network?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Random forests train in minutes on a laptop, need little tuning, handle mixed features well and are easy to inspect. Point-based deep networks can be more accurate on complex scenes but need far more labelled data, GPUs and engineering. Start with a forest and move on only if its per-class report shows a ceiling you must break."
          }
        },
        {
          "@type": "Question",
          "name": "How much labelled data do I need?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "For a random forest on geometric features, a few square kilometres of trustworthy classification spread across the project's landscapes is usually enough, with at least several thousand points for each rare class. Diversity of scenes matters more than volume."
          }
        },
        {
          "@type": "Question",
          "name": "Should the model also classify ground?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Usually not. Dedicated ground filters handle terrain better than per-point models and are easier to tune. Classify ground first, then let the model separate the above-ground classes."
          }
        },
        {
          "@type": "Question",
          "name": "Can I reuse a model across projects?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Only when the new project resembles the training data in density, sensor, season and landscape. A model trained on leaf-off suburban data will misread leaf-on forest. Treat every model as project-specific until a held-out tile from the new project shows per-class results close to the original evaluation, and keep the evaluation numbers alongside the model file."
          }
        },
        {
          "@type": "Question",
          "name": "How do I stop the model learning sensor quirks?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Prefer geometric features over intensity, normalize intensity if you do use it, and train on tiles from several flights. Feature importances that put intensity first are a warning sign."
          }
        }
      ]
    }
  ]
}
</script>

Rule-based classification — height bands, planarity thresholds, per-segment tests — gets a project a long way, but it plateaus. Each new rule fixes one confusion and introduces another, the thresholds drift between flights, and by the time you are separating low vegetation from ground clutter from car roofs from rooftop plant, the rule set has become a program nobody wants to maintain. A supervised classifier replaces those hand-set thresholds with ones learned from labelled examples. The features are the same ones the rules used — height above ground, planarity, linearity, scattering, intensity, return structure — and the model's job is to combine them better than a person can. This topic covers the practical loop in the [classification and feature extraction](https://www.pythonlidar.com/lidar-classification-feature-extraction/) section: features from PDAL, a random forest in scikit-learn, evaluation that does not lie, and predictions written back as ASPRS codes.

<svg viewBox="0 0 740 240" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="The training and inference loop for a point classifier" style="width:100%;max-width:740px;display:block;margin:1.6rem auto">
  <title>Train once, predict everywhere</title>
  <desc>Two rows. The upper training row runs from labelled tiles through PDAL feature computation into a feature table, then to model training and a saved model file. The lower inference row runs from new tiles through the same PDAL feature pipeline, then prediction with the saved model, then writing classes to LAS. An arrow shows the saved model feeding prediction, and a note stresses that both rows must use the identical feature pipeline.</desc>
  <defs><marker id="mlt-arw" markerWidth="9" markerHeight="7" refX="9" refY="3.5" orient="auto"><path d="M0,0 L0,7 L9,3.5 z" fill="var(--dg-line)"/></marker></defs>
  <rect x="0" y="0" width="740" height="240" fill="var(--dg-bg)" rx="10"/>
  <text x="20" y="30" font-size="11" fill="var(--dg-muted)">training</text>
  <rect x="20" y="40" width="120" height="44" rx="7" fill="var(--dg-surface)" stroke="var(--dg-line)" stroke-width="1.2"/>
  <text x="80" y="66" text-anchor="middle" font-size="11" fill="var(--dg-text)">labelled tiles</text>
  <rect x="170" y="40" width="130" height="44" rx="7" fill="var(--dg-a-soft)" stroke="var(--dg-a)" stroke-width="1.2"/>
  <text x="235" y="66" text-anchor="middle" font-size="11" fill="var(--dg-text)">feature pipeline</text>
  <rect x="330" y="40" width="120" height="44" rx="7" fill="var(--dg-surface)" stroke="var(--dg-line)" stroke-width="1.2"/>
  <text x="390" y="66" text-anchor="middle" font-size="11" fill="var(--dg-text)">feature table</text>
  <rect x="480" y="40" width="110" height="44" rx="7" fill="var(--dg-b-soft)" stroke="var(--dg-b)" stroke-width="1.2"/>
  <text x="535" y="66" text-anchor="middle" font-size="11" fill="var(--dg-text)">fit model</text>
  <rect x="620" y="40" width="100" height="44" rx="7" fill="var(--dg-c-soft)" stroke="var(--dg-c)" stroke-width="1.2"/>
  <text x="670" y="66" text-anchor="middle" font-size="11" fill="var(--dg-text)">model.joblib</text>
  <line x1="140" y1="62" x2="168" y2="62" stroke="var(--dg-line)" stroke-width="1.4" marker-end="url(#mlt-arw)"/>
  <line x1="300" y1="62" x2="328" y2="62" stroke="var(--dg-line)" stroke-width="1.4" marker-end="url(#mlt-arw)"/>
  <line x1="450" y1="62" x2="478" y2="62" stroke="var(--dg-line)" stroke-width="1.4" marker-end="url(#mlt-arw)"/>
  <line x1="590" y1="62" x2="618" y2="62" stroke="var(--dg-line)" stroke-width="1.4" marker-end="url(#mlt-arw)"/>
  <text x="20" y="130" font-size="11" fill="var(--dg-muted)">inference</text>
  <rect x="20" y="140" width="120" height="44" rx="7" fill="var(--dg-surface)" stroke="var(--dg-line)" stroke-width="1.2"/>
  <text x="80" y="166" text-anchor="middle" font-size="11" fill="var(--dg-text)">new tiles</text>
  <rect x="170" y="140" width="130" height="44" rx="7" fill="var(--dg-a-soft)" stroke="var(--dg-a)" stroke-width="1.2"/>
  <text x="235" y="166" text-anchor="middle" font-size="11" fill="var(--dg-text)">same pipeline</text>
  <rect x="330" y="140" width="120" height="44" rx="7" fill="var(--dg-b-soft)" stroke="var(--dg-b)" stroke-width="1.2"/>
  <text x="390" y="166" text-anchor="middle" font-size="11" fill="var(--dg-text)">predict</text>
  <rect x="480" y="140" width="130" height="44" rx="7" fill="var(--dg-d-soft)" stroke="var(--dg-d)" stroke-width="1.2"/>
  <text x="545" y="166" text-anchor="middle" font-size="11" fill="var(--dg-text)">write classes</text>
  <line x1="140" y1="162" x2="168" y2="162" stroke="var(--dg-line)" stroke-width="1.4" marker-end="url(#mlt-arw)"/>
  <line x1="300" y1="162" x2="328" y2="162" stroke="var(--dg-line)" stroke-width="1.4" marker-end="url(#mlt-arw)"/>
  <line x1="450" y1="162" x2="478" y2="162" stroke="var(--dg-line)" stroke-width="1.4" marker-end="url(#mlt-arw)"/>
  <path d="M670 84 L670 112 L390 112 L390 138" fill="none" stroke="var(--dg-c)" stroke-width="1.4" marker-end="url(#mlt-arw)"/>
  <text x="20" y="220" font-size="10.5" fill="var(--dg-muted)">if the two feature pipelines differ by one option, the model silently degrades — version them together</text>
</svg>

## Prerequisites

- **PDAL 2.5+** with `filters.covariancefeatures`, `filters.hag_nn` and `filters.normal`, plus the Python bindings.
- **Python 3.10+** with NumPy, pandas, scikit-learn 1.3+ and joblib.
- **Labelled training data.** Tiles whose classification you trust — manually edited, or a vendor delivery that passed QA — covering every class you want to predict. A few square kilometres from varied parts of the project is usually enough for a random forest.
- **Ground already classified.** Train the model on above-ground classes and leave ground to a dedicated filter such as [SMRF](https://www.pythonlidar.com/ground-filtering-dtm-dsm-generation/smrf-ground-classification/); ground filters are better at ground than any per-point model.
- **Consistent sensor and density** between training and target tiles, or at least training data that spans the variation. A model trained on 8 pts/m² data will not transfer cleanly to 40 pts/m².

## Core Workflow Architecture

1. **Compute features.** Run one PDAL feature pipeline — HAG, covariance features at one or more scales, normals, intensity, return number ratio — on training and target tiles alike.
2. **Assemble a training table.** Stack features and labels from training tiles into a data frame, recording the tile each row came from.
3. **Balance the classes.** Down-sample dominant classes (usually high vegetation) so the model does not ignore rare ones such as wires or bridges.
4. **Split spatially.** Hold out whole tiles or blocks for testing, never random points, because neighbouring points share features and would leak.
5. **Train and evaluate.** Fit a random forest, compute a confusion matrix and per-class precision and recall on held-out tiles.
6. **Predict and write.** Apply the model to new tiles, optionally smooth labels with a neighbour vote, and write ASPRS codes back to the LAS.

## Full Implementation

```python
"""Train a random-forest point classifier on PDAL features and apply it to new tiles."""
from __future__ import annotations

import json
import logging
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
import pdal
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import classification_report, confusion_matrix

log = logging.getLogger("rf")

FEATURES = ["HeightAboveGround", "Intensity", "ReturnRatio",
            "Linearity", "Planarity", "Scattering", "Verticality", "NormalZ"]
CLASSES = [1, 3, 4, 5, 6, 9, 14, 17]      # above-ground classes the model predicts


def feature_stages(src: Path, knn: int = 16) -> list[dict]:
    above = "Classification != 2 && Classification != 7 && Classification != 18"
    return [
        {"type": "readers.las", "filename": str(src)},
        {"type": "filters.hag_nn", "count": 2},
        {"type": "filters.covariancefeatures", "knn": knn, "threads": 4,
         "feature_set": "Dimensionality", "where": above},
        {"type": "filters.normal", "knn": 12, "always_up": True, "where": above},
    ]


def features(src: Path) -> tuple[np.ndarray, pd.DataFrame]:
    p = pdal.Pipeline(json.dumps({"pipeline": feature_stages(src)}))
    p.execute()
    arr = p.arrays[0]
    df = pd.DataFrame({k: arr[k] for k in FEATURES if k in arr.dtype.names})
    df["ReturnRatio"] = arr["ReturnNumber"] / np.maximum(arr["NumberOfReturns"], 1)
    df["Classification"] = arr["Classification"]
    return arr, df[FEATURES + ["Classification"]]


def training_table(tiles: list[Path], per_class: int = 60_000) -> pd.DataFrame:
    parts = []
    for tile in tiles:
        _, df = features(tile)
        df = df[df.Classification.isin(CLASSES)].copy()
        df["tile"] = tile.stem
        parts.append(df)
    table = pd.concat(parts, ignore_index=True)
    balanced = (table.groupby("Classification", group_keys=False)
                .apply(lambda g: g.sample(min(len(g), per_class), random_state=0)))
    log.info("training rows: %d (from %d)", len(balanced), len(table))
    return balanced


def train(table: pd.DataFrame, test_tiles: set[str], out: Path) -> RandomForestClassifier:
    test = table.tile.isin(test_tiles)
    X_tr, y_tr = table.loc[~test, FEATURES], table.loc[~test, "Classification"]
    X_te, y_te = table.loc[test, FEATURES], table.loc[test, "Classification"]
    model = RandomForestClassifier(n_estimators=200, max_depth=18, min_samples_leaf=5,
                                   n_jobs=-1, class_weight="balanced_subsample",
                                   random_state=0)
    model.fit(X_tr, y_tr)
    pred = model.predict(X_te)
    log.info("\n%s", classification_report(y_te, pred, digits=3, zero_division=0))
    log.info("confusion matrix (rows = truth):\n%s",
             confusion_matrix(y_te, pred, labels=CLASSES))
    joblib.dump({"model": model, "features": FEATURES, "classes": CLASSES}, out)
    return model


def predict(src: Path, dst: Path, model_path: Path) -> None:
    bundle = joblib.load(model_path)
    arr, df = features(src)
    above = ~np.isin(arr["Classification"], [2, 7, 18])
    arr["Classification"][above] = bundle["model"].predict(df.loc[above, bundle["features"]])
    pdal.Writer.las(filename=str(dst), minor_version=4, dataformat_id=6,
                    forward="all").pipeline(arr).execute()
    log.info("%s: %d points classified", dst.name, int(above.sum()))


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
    tiles = sorted(Path("labelled").glob("*.laz"))
    table = training_table(tiles)
    train(table, test_tiles={tiles[0].stem, tiles[5].stem}, out=Path("rf_v1.joblib"))
    predict(Path("new/tile_6021_4402.laz"), Path("out/tile_6021_4402.laz"), Path("rf_v1.joblib"))
```

## Code Breakdown

**One feature function for training and prediction.** `features` is called by both paths, so there is no way for the options to drift apart. Store the model with its feature list, as `joblib.dump` does here, and a mismatch becomes a loud error instead of a quiet accuracy loss.

**`ReturnRatio` as a derived feature.** Return number alone is ambiguous — a second return means different things in a two-return and a five-return pulse. The ratio is close to 1 for last returns (ground, roofs) and small for early returns inside canopy.

**Above-ground only.** Ground, low noise and high noise are excluded from both training and prediction. The model never has to learn the easy separation from the terrain, and ground points are never overwritten by a model that is worse at them than SMRF.

**Balancing by down-sampling.** A suburban tile can hold a hundred times more high-vegetation points than wire points. Capping each class at 60,000 rows and using `class_weight="balanced_subsample"` keeps rare classes visible to the trees. Down-sampling also keeps training fast.

**Holding out whole tiles.** Adjacent points have nearly identical features. A random point split puts near-duplicates on both sides and reports inflated accuracy — often above 0.98 — that collapses on new data. Tile-level hold-out is the minimum honest test; the [confusion matrix guide](https://www.pythonlidar.com/lidar-classification-feature-extraction/machine-learning-point-classification/evaluating-point-classification-with-a-confusion-matrix/) shows the gap on real numbers.

**Forest settings.** Two hundred trees, depth 18 and a minimum leaf of five points are sensible defaults for a few hundred thousand rows; deeper trees memorize neighbourhoods and shallower ones underfit rare classes. `n_jobs=-1` uses every core for both training and prediction.

<svg viewBox="0 0 740 240" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Random point split versus tile hold-out and the accuracy each reports" style="width:100%;max-width:740px;display:block;margin:1.6rem auto">
  <title>Why the split must be spatial</title>
  <desc>Left: a grid of tiles where training and test points are interleaved at random within every tile, reporting an optimistic overall accuracy of 0.98. Right: the same grid where two whole tiles are held out for testing, reporting a realistic accuracy of 0.89. A note explains that neighbouring points are near-duplicates, so a random split tests memory rather than generalization.</desc>
  <rect x="0" y="0" width="740" height="240" fill="var(--dg-bg)" rx="10"/>
  <text x="185" y="28" text-anchor="middle" font-size="12" font-weight="600" fill="var(--dg-text)">random point split</text>
  <text x="555" y="28" text-anchor="middle" font-size="12" font-weight="600" fill="var(--dg-text)">whole-tile hold-out</text>
  <g stroke="var(--dg-line-soft)" stroke-width="1" fill="var(--dg-surface)">
    <rect x="95" y="44" width="60" height="50"/><rect x="155" y="44" width="60" height="50"/><rect x="215" y="44" width="60" height="50"/>
    <rect x="95" y="94" width="60" height="50"/><rect x="155" y="94" width="60" height="50"/><rect x="215" y="94" width="60" height="50"/>
    <rect x="465" y="44" width="60" height="50"/><rect x="525" y="44" width="60" height="50"/>
    <rect x="465" y="94" width="60" height="50"/><rect x="525" y="94" width="60" height="50"/><rect x="585" y="94" width="60" height="50"/>
  </g>
  <rect x="585" y="44" width="60" height="50" fill="var(--dg-c-soft)" stroke="var(--dg-c)" stroke-width="1.3"/>
  <rect x="465" y="94" width="60" height="50" fill="var(--dg-c-soft)" stroke="var(--dg-c)" stroke-width="1.3"/>
  <g fill="var(--dg-c)"><circle cx="110" cy="60" r="3"/><circle cx="140" cy="80" r="3"/><circle cx="175" cy="70" r="3"/><circle cx="200" cy="58" r="3"/><circle cx="240" cy="84" r="3"/><circle cx="118" cy="120" r="3"/><circle cx="180" cy="130" r="3"/><circle cx="250" cy="110" r="3"/><circle cx="230" cy="132" r="3"/><circle cx="160" cy="112" r="3"/></g>
  <text x="185" y="176" text-anchor="middle" font-size="11" fill="var(--dg-text)">reported accuracy 0.98</text>
  <text x="555" y="176" text-anchor="middle" font-size="11" fill="var(--dg-text)">reported accuracy 0.89</text>
  <text x="185" y="196" text-anchor="middle" font-size="10" fill="var(--dg-muted)">test points sit next to training points</text>
  <text x="555" y="196" text-anchor="middle" font-size="10" fill="var(--dg-muted)">shaded tiles never seen in training</text>
  <text x="370" y="226" text-anchor="middle" font-size="10.5" fill="var(--dg-muted)">illustrative figures; the gap between the two is the leak</text>
</svg>

## Which Features Earn Their Place

Feature engineering matters more than model choice for point classification, and the useful features fall into four families. Knowing what each contributes makes it easier to decide what to add when a particular confusion persists.

**Height.** `HeightAboveGround` is almost always the most important single feature: it separates low from medium from high vegetation outright, and it puts roofs and wires in a band where ground clutter never appears. Adding local height statistics — the range or standard deviation of HAG among the k neighbours — helps separate roof edges from the crowns next to them.

**Shape.** Linearity, planarity, scattering and verticality describe the neighbourhood's geometry and are what separate a roof from a crown at the same height, or a wire from a branch. Normals add orientation, which distinguishes flat roofs from walls and sloping roofs from hedges.

**Return structure.** The ratio of return number to number of returns, and whether a point is a single return, capture how the pulse interacted with the target. Solid surfaces give single or last returns; vegetation gives multiple.

**Radiometry.** Intensity helps with water, road markings and some roof materials, but it is the least transferable family because it depends on range, incidence angle, sensor and calibration. Use it last, and normalized.

<svg viewBox="0 0 740 250" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Relative feature importances from a trained random forest" style="width:100%;max-width:740px;display:block;margin:1.6rem auto">
  <title>What the forest actually used</title>
  <desc>A horizontal bar chart of feature importances from a random forest trained on eight features. Height above ground is highest at 0.31, followed by scattering at 0.17, planarity at 0.14, return ratio at 0.11, verticality at 0.09, NormalZ at 0.08, linearity at 0.06 and intensity lowest at 0.04. Bars are coloured by feature family.</desc>
  <rect x="0" y="0" width="740" height="250" fill="var(--dg-bg)" rx="10"/>
  <text x="170" y="42" text-anchor="end" font-size="11" fill="var(--dg-text)">HeightAboveGround</text><rect x="180" y="31" width="434" height="14" rx="2" fill="var(--dg-a)"/><text x="622" y="42" font-size="10.5" fill="var(--dg-muted)">0.31</text>
  <text x="170" y="66" text-anchor="end" font-size="11" fill="var(--dg-text)">Scattering</text><rect x="180" y="55" width="238" height="14" rx="2" fill="var(--dg-d)"/><text x="426" y="66" font-size="10.5" fill="var(--dg-muted)">0.17</text>
  <text x="170" y="90" text-anchor="end" font-size="11" fill="var(--dg-text)">Planarity</text><rect x="180" y="79" width="196" height="14" rx="2" fill="var(--dg-d)"/><text x="384" y="90" font-size="10.5" fill="var(--dg-muted)">0.14</text>
  <text x="170" y="114" text-anchor="end" font-size="11" fill="var(--dg-text)">ReturnRatio</text><rect x="180" y="103" width="154" height="14" rx="2" fill="var(--dg-b)"/><text x="342" y="114" font-size="10.5" fill="var(--dg-muted)">0.11</text>
  <text x="170" y="138" text-anchor="end" font-size="11" fill="var(--dg-text)">Verticality</text><rect x="180" y="127" width="126" height="14" rx="2" fill="var(--dg-d)"/><text x="314" y="138" font-size="10.5" fill="var(--dg-muted)">0.09</text>
  <text x="170" y="162" text-anchor="end" font-size="11" fill="var(--dg-text)">NormalZ</text><rect x="180" y="151" width="112" height="14" rx="2" fill="var(--dg-d)"/><text x="300" y="162" font-size="10.5" fill="var(--dg-muted)">0.08</text>
  <text x="170" y="186" text-anchor="end" font-size="11" fill="var(--dg-text)">Linearity</text><rect x="180" y="175" width="84" height="14" rx="2" fill="var(--dg-d)"/><text x="272" y="186" font-size="10.5" fill="var(--dg-muted)">0.06</text>
  <text x="170" y="210" text-anchor="end" font-size="11" fill="var(--dg-text)">Intensity</text><rect x="180" y="199" width="56" height="14" rx="2" fill="var(--dg-c)"/><text x="244" y="210" font-size="10.5" fill="var(--dg-muted)">0.04</text>
  <text x="180" y="236" font-size="10.5" fill="var(--dg-muted)">illustrative suburban model — height, shape, return structure, radiometry</text>
</svg>

Low importance for linearity is expected in a suburban model and does not mean it is useless: wires are rare, so the feature that detects them contributes little to the average but everything to that class's recall. Judge features by per-class results, not by importance alone.

## Parameter Reference Table

| Setting | Type | Default here | Typical range | Effect |
|---|---|---|---|---|
| `knn` (covariance) | int | 16 | 10–40 | Neighbourhood scale; adding a second scale often helps more than tuning one |
| `per_class` | int | 60,000 | 10k–200k | Training rows per class after balancing |
| `n_estimators` | int | 200 | 100–500 | More trees give smoother probabilities, slower prediction |
| `max_depth` | int | 18 | 12–30 | Deeper fits more detail and memorizes more noise |
| `min_samples_leaf` | int | 5 | 1–20 | Larger regularizes; raise when labels are noisy |
| `class_weight` | str | `balanced_subsample` | or `None` | Counteracts class imbalance inside each tree |
| held-out tiles | set | 2 of 10 | 15–25 % | Area never seen in training, used only for evaluation |

## Validation and Integrity Checks

**Per-class, not overall.** Overall accuracy is dominated by the largest class. Report precision and recall for every class, and pay most attention to the classes the client cares about — buildings and wires usually matter more than the split between medium and high vegetation.

**Confusion structure.** Some confusions are cheap (medium versus high vegetation) and some expensive (vegetation labelled as building). Read the off-diagonal cells, not just the diagonal.

**Class histogram sanity.** After prediction on a new tile, compare the class proportions with those of similar training tiles. A tile that comes out 30 percent building in a rural area has a problem, usually a density or intensity mismatch.

**Feature importance.** `model.feature_importances_` should put height above ground and one or two shape features at the top. If intensity dominates, the model may be learning sensor calibration rather than geometry and will not transfer to another flight — see [normalizing intensity across flightlines](https://www.pythonlidar.com/pdal-pipeline-architecture-execution/attribute-mapping/normalizing-intensity-across-flightlines/).

## Performance Tuning

Feature computation dominates both training and prediction; the forest itself is quick. On a 1 km² tile at 20 pts/m², expect roughly two to four minutes of PDAL work and well under a minute of prediction with `n_jobs=-1`.

- **Cache features.** Write the feature-enriched tile once with `extra_dims` and re-read it for every training experiment. Retraining then takes seconds.
- **Predict in chunks.** For very large tiles, predict on slices of a few million rows to keep memory flat; random forests are embarrassingly parallel over rows.
- **Multi-scale features, selectively.** A second covariance scale (for example `knn: 40`) often improves wire and building edges, but doubles the dominant cost. Add it only if the per-class report shows a specific confusion it would address.
- **Smaller models for deployment.** Capping `max_depth` or reducing `n_estimators` shrinks the saved model and speeds prediction with little accuracy cost; measure on the held-out tiles before and after.

## Common Errors and Troubleshooting

**`ValueError: X has 7 features, but RandomForestClassifier is expecting 8`.** A feature is missing on the prediction tile — usually because a `where` clause excluded every point from the stage that creates it, so the dimension was never added. Guard with an explicit check of `arr.dtype.names` and fail with the missing name.

**Near-perfect test scores.** The split is leaking. Check that no tile appears in both sets, and that overlapping flightlines do not put the same ground in two differently named tiles.

**Rare classes never predicted.** Balancing was skipped or the class has too few training examples. Wires and bridges need several thousand labelled points each, drawn from several tiles.

**Salt-and-pepper labels.** Per-point prediction produces isolated misclassifications. Smooth with `filters.neighborclassifier` (majority vote over k neighbours) or decide per segment by majority, as in [extracting objects from segment labels](https://www.pythonlidar.com/lidar-classification-feature-extraction/point-cloud-segmentation/extracting-objects-from-segment-labels/).

**Model degrades on a new flight.** Density, sensor or season changed. Add a few labelled tiles from the new flight to training rather than tuning the model; representation matters more than hyperparameters.

## Frequently Asked Questions

**Why a random forest rather than a deep network?**

Random forests train in minutes on a laptop, need little tuning, handle mixed features well and are easy to inspect. Point-based deep networks can be more accurate on complex scenes but need far more labelled data, GPUs and engineering. Start with a forest and move on only if its per-class report shows a ceiling you must break.

**How much labelled data do I need?**

For a random forest on geometric features, a few square kilometres of trustworthy classification spread across the project's landscapes is usually enough, with at least several thousand points for each rare class. Diversity of scenes matters more than volume.

**Should the model also classify ground?**

Usually not. Dedicated ground filters handle terrain better than per-point models and are easier to tune. Classify ground first, then let the model separate the above-ground classes.

**Can I reuse a model across projects?**

Only when the new project resembles the training data in density, sensor, season and landscape. A model trained on leaf-off suburban data will misread leaf-on forest. Treat every model as project-specific until a held-out tile from the new project shows per-class results close to the original evaluation, and keep the evaluation numbers alongside the model file.

**How do I stop the model learning sensor quirks?**

Prefer geometric features over intensity, normalize intensity if you do use it, and train on tiles from several flights. Feature importances that put intensity first are a warning sign.

## Related

- [Computing Geometric Features for Classification](https://www.pythonlidar.com/lidar-classification-feature-extraction/machine-learning-point-classification/computing-geometric-features-for-classification/) — the feature pipeline in detail, including multi-scale features
- [Training a Random Forest Point Classifier](https://www.pythonlidar.com/lidar-classification-feature-extraction/machine-learning-point-classification/training-a-random-forest-point-classifier/) — balancing, splitting and saving the model
- [Evaluating Point Classification with a Confusion Matrix](https://www.pythonlidar.com/lidar-classification-feature-extraction/machine-learning-point-classification/evaluating-point-classification-with-a-confusion-matrix/) — per-class metrics that mean something
- [ASPRS Classification Codes](https://www.pythonlidar.com/point-cloud-data-standards-fundamentals/asprs-classification-codes/) — the target labels
- [Point Cloud Segmentation](https://www.pythonlidar.com/lidar-classification-feature-extraction/point-cloud-segmentation/) — per-object voting to clean per-point predictions
