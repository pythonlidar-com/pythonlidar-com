---
title: "Evaluating Point Classification with a Confusion Matrix"
description: "Measure LiDAR classification quality honestly: a row-normalized confusion matrix, per-class precision, recall, F1 and IoU, Cohen's kappa, and comparing a delivered tile against a reference classification with PDAL and scikit-learn."
slug: "evaluating-point-classification-with-a-confusion-matrix"
type: "howto"
breadcrumb: "Confusion Matrix Evaluation"
datePublished: "2026-09-18"
dateModified: "2026-09-18"
---

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Article",
      "headline": "Evaluating Point Classification with a Confusion Matrix",
      "description": "Measure LiDAR classification quality honestly: a row-normalized confusion matrix, per-class precision, recall, F1 and IoU, Cohen's kappa, and comparing a delivered tile against a reference classification with PDAL and scikit-learn.",
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
          "name": "Confusion Matrix Evaluation",
          "item": "https://www.pythonlidar.com/lidar-classification-feature-extraction/machine-learning-point-classification/evaluating-point-classification-with-a-confusion-matrix/"
        }
      ]
    },
    {
      "@type": "HowTo",
      "name": "Evaluate LiDAR point classification with a confusion matrix",
      "step": [
        {
          "@type": "HowToStep",
          "name": "Align the two classifications",
          "text": "If both files came from the same source tile and neither pipeline reordered points, compare arrays index by index after checking X, Y, Z and GpsTime match. Otherwise join on those coordinates."
        },
        {
          "@type": "HowToStep",
          "name": "Fix the class list",
          "text": "Pass an explicit labels list to confusion_matrix. Without it, a class absent from one side silently disappears and the matrix changes shape between tiles."
        },
        {
          "@type": "HowToStep",
          "name": "Row-normalize",
          "text": "Divide each row by its sum. Each diagonal cell is then that class's recall, and each off-diagonal cell is the share of that reference class lost to another class."
        },
        {
          "@type": "HowToStep",
          "name": "Compute per-class metrics",
          "text": "Precision (column-wise), recall (row-wise), F1 and intersection-over-union for every class, plus Cohen's kappa for overall agreement beyond chance."
        },
        {
          "@type": "HowToStep",
          "name": "Report and archive",
          "text": "Save the raw counts, not just the normalized matrix, so results can be pooled across tiles later."
        }
      ]
    },
    {
      "@type": "FAQPage",
      "mainEntity": [
        {
          "@type": "Question",
          "name": "Why is overall accuracy misleading for LiDAR classification?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Because class sizes are extremely unequal. Ground and vegetation dominate the point count, so a classifier can miss every wire and most buildings and still score above 90 percent. Per-class recall and precision show those failures immediately."
          }
        },
        {
          "@type": "Question",
          "name": "Should I normalize the confusion matrix by rows or columns?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "By rows to read recall \u2014 what share of each true class was found and where the rest went. By columns to read precision \u2014 what share of each predicted class is correct. Keep the raw counts as well so both can be derived."
          }
        },
        {
          "@type": "Question",
          "name": "What is a good F1 score for building classification?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "On clean airborne data with a well-tuned classifier, building F1 above 0.9 is common. Wires and bridges usually score lower because they are small and rare. Compare against a baseline on the same data rather than a universal number."
          }
        },
        {
          "@type": "Question",
          "name": "How large should the reference area be?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Large enough that every class you report has several thousand reference points from several distinct objects, and taken from a location not used for training or tuning."
          }
        }
      ]
    }
  ]
}
</script>

**TL;DR:** Align predicted and reference classifications point by point, build `sklearn.metrics.confusion_matrix` with an explicit class list, normalize each row by its reference count, and report per-class precision, recall, F1 and IoU plus Cohen's kappa — never overall accuracy alone, which a large vegetation class will inflate.

## Context and Motivation

This guide is part of [Machine Learning Point Classification for LiDAR](https://www.pythonlidar.com/lidar-classification-feature-extraction/machine-learning-point-classification/). Whether the classes came from a model, from rules, or from a vendor, someone eventually asks how good they are. Overall accuracy is the number people reach for, and it is nearly useless on LiDAR: in a typical suburban tile, ground and high vegetation make up 80 percent or more of points, so a classifier that never finds a single building or wire can still report 90 percent accuracy.

The confusion matrix answers the real question — which classes are confused with which, and how often — and every useful summary metric can be read from it. The same procedure works for model evaluation on held-out tiles and for acceptance testing a vendor delivery against a manually checked reference area.

<svg viewBox="120 0 600 260" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="A row-normalized confusion matrix for five LiDAR classes" style="width:100%;max-width:740px;display:block;margin:1.6rem auto">
  <title>Reading a row-normalized confusion matrix</title>
  <desc>A five by five grid with reference classes as rows and predicted classes as columns: ground, low vegetation, high vegetation, building and wire. The diagonal is dark with recalls of 0.99, 0.81, 0.97, 0.94 and 0.72. The largest off-diagonal cells are low vegetation predicted as ground at 0.14, and wire predicted as high vegetation at 0.25. Each row sums to one.</desc>
  <rect x="120" y="0" width="600" height="260" fill="var(--dg-bg)" rx="10"/>
  <text x="400" y="22" text-anchor="middle" font-size="10.5" fill="var(--dg-muted)">predicted →</text>
  <g font-size="10.5" fill="var(--dg-text)"><text text-anchor="middle" x="250" y="44">ground</text><text text-anchor="middle" x="330" y="44">low veg</text><text text-anchor="middle" x="410" y="44">high veg</text><text text-anchor="middle" x="490" y="44">building</text><text text-anchor="middle" x="570" y="44">wire</text></g>
  <g font-size="10.5" fill="var(--dg-text)"><text text-anchor="end" x="200" y="76">ground</text><text text-anchor="end" x="200" y="116">low veg</text><text text-anchor="end" x="200" y="156">high veg</text><text text-anchor="end" x="200" y="196">building</text><text text-anchor="end" x="200" y="236">wire</text></g>
  <g stroke="var(--dg-line-soft)" stroke-width="1" fill="var(--dg-surface)">
    <rect x="290" y="52" width="80" height="40"/><rect x="370" y="52" width="80" height="40"/><rect x="450" y="52" width="80" height="40"/><rect x="530" y="52" width="80" height="40"/>
    <rect x="370" y="92" width="80" height="40"/><rect x="450" y="92" width="80" height="40"/><rect x="530" y="92" width="80" height="40"/>
    <rect x="210" y="132" width="80" height="40"/><rect x="290" y="132" width="80" height="40"/><rect x="450" y="132" width="80" height="40"/><rect x="530" y="132" width="80" height="40"/>
    <rect x="210" y="172" width="80" height="40"/><rect x="290" y="172" width="80" height="40"/><rect x="370" y="172" width="80" height="40"/><rect x="530" y="172" width="80" height="40"/>
    <rect x="210" y="212" width="80" height="40"/><rect x="290" y="212" width="80" height="40"/><rect x="450" y="212" width="80" height="40"/>
  </g>
  <g fill="var(--dg-a-soft)" stroke="var(--dg-a)" stroke-width="1.2"><rect x="210" y="52" width="80" height="40"/><rect x="290" y="92" width="80" height="40"/><rect x="370" y="132" width="80" height="40"/><rect x="450" y="172" width="80" height="40"/><rect x="530" y="212" width="80" height="40"/></g>
  <g fill="var(--dg-e-soft)" stroke="var(--dg-e)" stroke-width="1.2"><rect x="210" y="92" width="80" height="40"/><rect x="370" y="212" width="80" height="40"/></g>
  <g font-size="11" fill="var(--dg-text)">
    <text text-anchor="middle" x="250" y="76">0.99</text><text text-anchor="middle" x="330" y="76">0.01</text><text text-anchor="middle" x="410" y="76">0.00</text><text text-anchor="middle" x="490" y="76">0.00</text><text text-anchor="middle" x="570" y="76">0.00</text>
    <text text-anchor="middle" x="250" y="116">0.14</text><text text-anchor="middle" x="330" y="116">0.81</text><text text-anchor="middle" x="410" y="116">0.04</text><text text-anchor="middle" x="490" y="116">0.01</text><text text-anchor="middle" x="570" y="116">0.00</text>
    <text text-anchor="middle" x="250" y="156">0.00</text><text text-anchor="middle" x="330" y="156">0.02</text><text text-anchor="middle" x="410" y="156">0.97</text><text text-anchor="middle" x="490" y="156">0.01</text><text text-anchor="middle" x="570" y="156">0.00</text>
    <text text-anchor="middle" x="250" y="196">0.01</text><text text-anchor="middle" x="330" y="196">0.01</text><text text-anchor="middle" x="410" y="196">0.04</text><text text-anchor="middle" x="490" y="196">0.94</text><text text-anchor="middle" x="570" y="196">0.00</text>
    <text text-anchor="middle" x="250" y="236">0.00</text><text text-anchor="middle" x="330" y="236">0.00</text><text text-anchor="middle" x="410" y="236">0.25</text><text text-anchor="middle" x="490" y="236">0.03</text><text text-anchor="middle" x="570" y="236">0.72</text>
  </g>
  <text x="630" y="116" font-size="10.5" fill="var(--dg-e)">low veg lost</text>
  <text x="630" y="132" font-size="10.5" fill="var(--dg-e)">to ground</text>
  <text x="630" y="228" font-size="10.5" fill="var(--dg-e)">wires read</text>
  <text x="630" y="244" font-size="10.5" fill="var(--dg-e)">as canopy</text>
</svg>

## Prerequisites and Assumptions

- Two classifications of the same points: predicted and reference. Either two LAS files with identical point order, or one file with the reference stored in an extra dimension.
- Python with scikit-learn, NumPy, pandas and PDAL bindings.
- A reference you trust: a manually edited area, or a held-out tile whose labels passed QA.

## Step-by-Step Implementation

### Step 1 — Align the two classifications

If both files came from the same source tile and neither pipeline reordered points, compare arrays index by index after checking `X`, `Y`, `Z` and `GpsTime` match. Otherwise join on those coordinates.

### Step 2 — Fix the class list

Pass an explicit `labels` list to `confusion_matrix`. Without it, a class absent from one side silently disappears and the matrix changes shape between tiles.

### Step 3 — Row-normalize

Divide each row by its sum. Each diagonal cell is then that class's recall, and each off-diagonal cell is the share of that reference class lost to another class.

### Step 4 — Compute per-class metrics

Precision (column-wise), recall (row-wise), F1 and intersection-over-union for every class, plus Cohen's kappa for overall agreement beyond chance.

### Step 5 — Report and archive

Save the raw counts, not just the normalized matrix, so results can be pooled across tiles later.

## Complete Working Example

```python
"""Confusion matrix and per-class metrics for a predicted vs reference classification."""
from __future__ import annotations

import json
from pathlib import Path

import numpy as np
import pandas as pd
import pdal
from sklearn.metrics import cohen_kappa_score, confusion_matrix

NAMES = {2: "ground", 3: "low veg", 4: "med veg", 5: "high veg", 6: "building",
         9: "water", 14: "wire", 17: "bridge"}


def read(path: Path) -> np.ndarray:
    p = pdal.Pipeline(json.dumps({"pipeline": [str(path)]}))
    p.execute()
    return p.arrays[0]


def aligned(pred_path: Path, ref_path: Path) -> tuple[np.ndarray, np.ndarray]:
    pred, ref = read(pred_path), read(ref_path)
    if len(pred) != len(ref):
        raise ValueError(f"point counts differ: {len(pred)} vs {len(ref)}")
    for dim in ("X", "Y", "Z", "GpsTime"):
        if not np.array_equal(pred[dim], ref[dim]):
            raise ValueError(f"point order differs on {dim}; join on coordinates instead")
    return pred["Classification"], ref["Classification"]


def report(y_pred: np.ndarray, y_ref: np.ndarray, classes: list[int]) -> pd.DataFrame:
    keep = np.isin(y_ref, classes)
    cm = confusion_matrix(y_ref[keep], y_pred[keep], labels=classes)
    tp = np.diag(cm).astype(float)
    ref_n, pred_n = cm.sum(axis=1), cm.sum(axis=0)
    recall = np.divide(tp, ref_n, out=np.zeros_like(tp), where=ref_n > 0)
    precision = np.divide(tp, pred_n, out=np.zeros_like(tp), where=pred_n > 0)
    f1 = np.divide(2 * precision * recall, precision + recall,
                   out=np.zeros_like(tp), where=(precision + recall) > 0)
    iou = np.divide(tp, ref_n + pred_n - tp, out=np.zeros_like(tp), where=(ref_n + pred_n) > 0)
    table = pd.DataFrame({"class": [NAMES.get(c, c) for c in classes], "reference_pts": ref_n,
                          "precision": precision, "recall": recall, "f1": f1, "iou": iou}).round(3)
    kappa = cohen_kappa_score(y_ref[keep], y_pred[keep], labels=classes)
    overall = tp.sum() / cm.sum()
    print(f"overall accuracy {overall:.3f}  kappa {kappa:.3f}  macro F1 {f1.mean():.3f}")
    norm = pd.DataFrame(cm / np.maximum(ref_n[:, None], 1),
                        index=[NAMES.get(c, c) for c in classes],
                        columns=[NAMES.get(c, c) for c in classes]).round(2)
    print(norm.to_string())
    np.save("confusion_counts.npy", cm)
    return table


if __name__ == "__main__":
    y_pred, y_ref = aligned(Path("out/tile_6021_4402.laz"), Path("reference/tile_6021_4402.laz"))
    print(report(y_pred, y_ref, [2, 3, 5, 6, 14]).to_string(index=False))
```

## Key Parameter Table

| Metric | Formula | Reads as | Watch for |
|---|---|---|---|
| Recall | TP / reference count | Share of the class found | Missed buildings, missed wires |
| Precision | TP / predicted count | Share of predictions that are right | False buildings in canopy |
| F1 | 2PR / (P + R) | Balance of the two | Single number per class |
| IoU | TP / (ref + pred − TP) | Overlap of sets | Stricter than F1; common in ML papers |
| Cohen's kappa | agreement beyond chance | Overall, class-mix aware | Better than accuracy for imbalanced classes |
| Overall accuracy | trace / total | Share of all points right | Dominated by the largest class |

<svg viewBox="0 0 740 210" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Overall accuracy staying high while wire recall collapses" style="width:100%;max-width:740px;display:block;margin:1.6rem auto">
  <title>Why overall accuracy hides failures</title>
  <desc>Paired bars for two classifiers. Classifier A has overall accuracy 0.95 and wire recall 0.72. Classifier B has overall accuracy 0.94 and wire recall 0.05, having essentially stopped detecting wires, yet its overall accuracy is almost identical because wires are a tiny share of points.</desc>
  <rect x="0" y="0" width="740" height="210" fill="var(--dg-bg)" rx="10"/>
  <line x1="100" y1="170" x2="640" y2="170" stroke="var(--dg-line)" stroke-width="1.3"/>
  <rect x="140" y="30" width="80" height="140" fill="var(--dg-b-soft)" stroke="var(--dg-b)" stroke-width="1.1"/>
  <rect x="230" y="64" width="80" height="106" fill="var(--dg-a-soft)" stroke="var(--dg-a)" stroke-width="1.1"/>
  <rect x="420" y="32" width="80" height="138" fill="var(--dg-b-soft)" stroke="var(--dg-b)" stroke-width="1.1"/>
  <rect x="510" y="162" width="80" height="8" fill="var(--dg-e-soft)" stroke="var(--dg-e)" stroke-width="1.1"/>
  <g font-size="10.5" fill="var(--dg-text)"><text text-anchor="middle" x="180" y="24">0.95</text><text text-anchor="middle" x="270" y="58">0.72</text><text text-anchor="middle" x="460" y="26">0.94</text><text text-anchor="middle" x="550" y="154">0.05</text></g>
  <text x="225" y="190" text-anchor="middle" font-size="10.5" fill="var(--dg-text)">classifier A</text>
  <text x="505" y="190" text-anchor="middle" font-size="10.5" fill="var(--dg-text)">classifier B</text>
  <rect x="100" y="196" width="12" height="10" fill="var(--dg-b-soft)" stroke="var(--dg-b)"/><text x="118" y="205" font-size="10" fill="var(--dg-muted)">overall accuracy</text>
  <rect x="260" y="196" width="12" height="10" fill="var(--dg-a-soft)" stroke="var(--dg-a)"/><text x="278" y="205" font-size="10" fill="var(--dg-muted)">wire recall</text>
</svg>

## Verification

- **Row sums.** Each row of the normalized matrix sums to 1 (within rounding) for every class present in the reference.
- **Counts add up.** The sum of the raw matrix equals the number of reference points in the listed classes.
- **Reference quality.** Spot-check twenty disagreement points in a viewer. If the reference is wrong in a meaningful share of them, your metrics are measuring the reference, not the classifier.

```python
cm = np.load("confusion_counts.npy")
norm = cm / cm.sum(axis=1, keepdims=True)
assert np.allclose(norm.sum(axis=1)[cm.sum(axis=1) > 0], 1.0)
```

## Gotchas and Edge Cases

**Class 1 in the reference.** Unclassified points in the reference have no true class. Exclude them from evaluation, or you will penalize the classifier for labelling points the reference never did.

**Pooling across tiles.** Average per-tile metrics weight a sparse rural tile as much as a dense urban one. Sum the raw count matrices across tiles and compute metrics once from the total.

<svg viewBox="0 0 740 190" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Averaging per-tile recall versus pooling counts across tiles" style="width:100%;max-width:740px;display:block;margin:1.6rem auto">
  <title>Pool the counts, then compute</title>
  <desc>Two tiles with building recall. Tile A has 40 reference building points of which 20 are found, recall 0.50. Tile B has 4,000 of which 3,800 are found, recall 0.95. Averaging the two recalls gives 0.73. Pooling the counts gives 3,820 of 4,040, recall 0.95, which reflects where the buildings actually are.</desc>
  <rect x="0" y="0" width="740" height="190" fill="var(--dg-bg)" rx="10"/>
  <rect x="30" y="30" width="200" height="70" rx="8" fill="var(--dg-surface)" stroke="var(--dg-line)" stroke-width="1.2"/>
  <text x="130" y="56" text-anchor="middle" font-size="11" fill="var(--dg-text)">tile A: 20 of 40</text>
  <text x="130" y="80" text-anchor="middle" font-size="10.5" fill="var(--dg-muted)">recall 0.50</text>
  <rect x="30" y="110" width="200" height="70" rx="8" fill="var(--dg-surface)" stroke="var(--dg-line)" stroke-width="1.2"/>
  <text x="130" y="136" text-anchor="middle" font-size="11" fill="var(--dg-text)">tile B: 3,800 of 4,000</text>
  <text x="130" y="160" text-anchor="middle" font-size="10.5" fill="var(--dg-muted)">recall 0.95</text>
  <rect x="330" y="30" width="370" height="70" rx="8" fill="var(--dg-e-soft)" stroke="var(--dg-e)" stroke-width="1.2"/>
  <text x="515" y="56" text-anchor="middle" font-size="11" fill="var(--dg-text)">mean of per-tile recalls: 0.73</text>
  <text x="515" y="80" text-anchor="middle" font-size="10.5" fill="var(--dg-muted)">a 40-point tile outweighs 4,000 points</text>
  <rect x="330" y="110" width="370" height="70" rx="8" fill="var(--dg-d-soft)" stroke="var(--dg-d)" stroke-width="1.2"/>
  <text x="515" y="136" text-anchor="middle" font-size="11" fill="var(--dg-text)">pooled counts: 3,820 of 4,040 = 0.95</text>
  <text x="515" y="160" text-anchor="middle" font-size="10.5" fill="var(--dg-muted)">every reference point weighs the same</text>
</svg>

**Boundary points.** Most disagreement concentrates at object edges — eaves, crown fringes — where even two human editors disagree. Consider reporting metrics with a one-point buffer around class boundaries excluded, alongside the full numbers.

**Point order changed.** A pipeline with a sort or a merge reorders points, and index-wise comparison becomes meaningless. The `aligned` function checks coordinates for exactly this reason.

## Frequently Asked Questions

**Why is overall accuracy misleading for LiDAR classification?**

Because class sizes are extremely unequal. Ground and vegetation dominate the point count, so a classifier can miss every wire and most buildings and still score above 90 percent. Per-class recall and precision show those failures immediately.

**Should I normalize the confusion matrix by rows or columns?**

By rows to read recall — what share of each true class was found and where the rest went. By columns to read precision — what share of each predicted class is correct. Keep the raw counts as well so both can be derived.

**What is a good F1 score for building classification?**

On clean airborne data with a well-tuned classifier, building F1 above 0.9 is common. Wires and bridges usually score lower because they are small and rare. Compare against a baseline on the same data rather than a universal number.

**How large should the reference area be?**

Large enough that every class you report has several thousand reference points from several distinct objects, and taken from a location not used for training or tuning.

## Related

- [Machine Learning Point Classification](https://www.pythonlidar.com/lidar-classification-feature-extraction/machine-learning-point-classification/) — where evaluation fits in the loop
- [Training a Random Forest Point Classifier](https://www.pythonlidar.com/lidar-classification-feature-extraction/machine-learning-point-classification/training-a-random-forest-point-classifier/) — grouped cross-validation during training
- [Computing Geometric Features for Classification](https://www.pythonlidar.com/lidar-classification-feature-extraction/machine-learning-point-classification/computing-geometric-features-for-classification/) — features whose value this measures
- [Counting Points per Class with PDAL](https://www.pythonlidar.com/point-cloud-data-standards-fundamentals/asprs-classification-codes/counting-points-per-class-with-pdal/) — quick class histograms before evaluation
- [ASPRS Classification Codes](https://www.pythonlidar.com/point-cloud-data-standards-fundamentals/asprs-classification-codes/) — the class definitions being compared
