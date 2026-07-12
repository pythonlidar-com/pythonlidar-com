---
title: "Validating PDAL Pipelines in CI"
description: "Wiring `pdal pipeline --validate` and a small sample-tile execution test into a CI workflow so broken pipeline JSON, schema violations, and CRS mistakes fail the build before production runs."
slug: "validating-pdal-pipelines-in-ci"
type: "long_tail"
breadcrumb: "Validating Pipelines in CI"
datePublished: "2024-07-05"
dateModified: "2026-07-12"
---

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Article",
      "headline": "Validating PDAL Pipelines in CI",
      "description": "Wiring `pdal pipeline --validate` and a small sample-tile execution test into a CI workflow so broken pipeline JSON, schema violations, and CRS mistakes fail the build before production runs.",
      "datePublished": "2024-07-05",
      "dateModified": "2026-07-12",
      "author": { "@type": "Organization", "name": "pythonlidar.com" }
    },
    {
      "@type": "BreadcrumbList",
      "itemListElement": [
        { "@type": "ListItem", "position": 1, "name": "Home", "item": "https://pythonlidar.com/" },
        { "@type": "ListItem", "position": 2, "name": "PDAL Pipeline Architecture & Execution", "item": "https://pythonlidar.com/pdal-pipeline-architecture-execution/" },
        { "@type": "ListItem", "position": 3, "name": "Pipeline Validation", "item": "https://pythonlidar.com/pdal-pipeline-architecture-execution/pipeline-validation/" },
        { "@type": "ListItem", "position": 4, "name": "Validating Pipelines in CI", "item": "https://pythonlidar.com/pdal-pipeline-architecture-execution/pipeline-validation/validating-pdal-pipelines-in-ci/" }
      ]
    },
    {
      "@type": "HowTo",
      "name": "Validate PDAL pipelines in a CI workflow",
      "description": "Gate pull requests on a static pdal pipeline --validate check plus a pytest that executes each pipeline against a tiny fixture tile and asserts point count and dimensions.",
      "step": [
        { "@type": "HowToStep", "position": 1, "name": "Add a static validate step", "text": "Run pdal pipeline --validate over every JSON file in the repository so malformed stages fail the build in milliseconds." },
        { "@type": "HowToStep", "position": 2, "name": "Commit a tiny fixture tile", "text": "Store a decimated sample LAZ tile in the repository so tests run without network access to production data." },
        { "@type": "HowToStep", "position": 3, "name": "Write an execution test", "text": "Add a pytest that runs each pipeline against the fixture and asserts point count and required dimensions survive." },
        { "@type": "HowToStep", "position": 4, "name": "Pin the PDAL version", "text": "Run CI inside a pinned PDAL container so results are reproducible across builds and machines." }
      ]
    },
    {
      "@type": "FAQPage",
      "mainEntity": [
        {
          "@type": "Question",
          "name": "What does pdal pipeline --validate catch that a pytest does not?",
          "acceptedAnswer": { "@type": "Answer", "text": "The --validate flag resolves the stage graph and rejects malformed JSON, unknown stage names, and incompatible stage ordering without reading any point data, so it runs in milliseconds on every file. A pytest execution against a fixture tile catches the runtime failures --validate cannot see: empty output from an over-aggressive range filter, dropped CRS metadata, and missing dimensions after a transform." }
        },
        {
          "@type": "Question",
          "name": "How small should the CI fixture tile be?",
          "acceptedAnswer": { "@type": "Answer", "text": "Aim for 20,000 to 100,000 points — small enough to commit to the repository and execute in under a second, but large enough to carry the same point format, classification variety, and CRS as production data. Decimate a real tile with filters.decimation rather than generating synthetic points, so the fixture exercises the same dimensions your pipelines depend on." }
        },
        {
          "@type": "Question",
          "name": "Why pin the PDAL version in CI?",
          "acceptedAnswer": { "@type": "Answer", "text": "PDAL's metadata structure, default parameters, and available stages shift between releases, so a pipeline that validates on one version can fail on another. Running CI inside a pinned PDAL Docker image freezes the toolchain, making a green build a reliable signal that the same pipeline will behave identically in production containers built from the same tag." }
        },
        {
          "@type": "Question",
          "name": "Should CI validation run on every commit or only when pipelines change?",
          "acceptedAnswer": { "@type": "Answer", "text": "Scope the workflow to trigger only on changes to pipeline JSON and the test files, using path filters. This keeps unrelated pull requests fast while still gating any change that touches a pipeline definition. For expensive execution tests, additionally cache a hash of each pipeline and skip re-execution when the definition is unchanged." }
        }
      ]
    }
  ]
}
</script>

**TL;DR:** Add two gates to your CI workflow — a fast `pdal pipeline --validate` step that rejects malformed or incompatible pipeline JSON in milliseconds, and a `pytest` that executes each pipeline against a tiny committed fixture tile and asserts the point count and required dimensions survive — then run both inside a version-pinned PDAL container so a green build guarantees production behaviour.

## Context and Motivation

This guide is part of [Pipeline Validation](/pdal-pipeline-architecture-execution/pipeline-validation/), which builds an in-process validation harness you can call from Python. Here the goal is different: move those checks out of a developer's terminal and into continuous integration, so a broken pipeline can never reach the main branch in the first place.

A pipeline JSON file is code, but it rarely gets treated like code. It sits in a repository, someone edits a `filters.range` limit or renames an output, and the mistake is only discovered hours later when a production batch job dies mid-run or — worse — quietly writes an empty tile. The failures that hurt most are the silent ones: a classification predicate applied before the ground filter runs, a writer that drops the CRS because `forward` was set to `none`, a stage name typo that surfaces as an opaque C++ exception. Continuous integration is where these get caught cheaply. Two layers do almost all the work. A static graph check flags anything structurally wrong before a single point is read, and a sample-tile execution test proves the pipeline actually produces the output you expect against real data shaped like production. Wiring both into a pull-request gate turns pipeline definitions into reviewed, tested artefacts rather than fragile configuration that nobody dares touch.

<svg viewBox="0 0 760 250" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="CI workflow gating a pull request on static PDAL validation and a sample-tile execution test" style="width:100%;max-width:760px;display:block;margin:1.5rem auto;">
  <title>CI gate: static validate plus fixture-tile execution test before merge</title>
  <desc>A pull request feeds into a pinned PDAL container. Inside the container two gates run in sequence: gate one is pdal pipeline --validate over every JSON file; gate two is a pytest that executes each pipeline against a tiny committed fixture tile and asserts point count and dimensions. If either gate fails the merge is blocked; if both pass the pull request merges to the main branch.</desc>
  <defs>
    <marker id="ci-arr" markerWidth="8" markerHeight="8" refX="7" refY="3" orient="auto">
      <path d="M0,0 L0,6 L8,3 z" fill="currentColor"/>
    </marker>
  </defs>
  <!-- PR box -->
  <rect x="12" y="96" width="120" height="58" rx="8" fill="none" stroke="currentColor" stroke-width="1.5"/>
  <text x="72" y="122" text-anchor="middle" font-size="12" fill="currentColor" font-family="sans-serif" font-weight="600">pull request</text>
  <text x="72" y="139" text-anchor="middle" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.6">edits *.json</text>
  <line x1="132" y1="125" x2="168" y2="125" stroke="currentColor" stroke-width="1.5" marker-end="url(#ci-arr)"/>
  <!-- container envelope -->
  <rect x="172" y="26" width="430" height="198" rx="10" fill="none" stroke="currentColor" stroke-width="1" stroke-dasharray="5 4" opacity="0.55"/>
  <text x="387" y="46" text-anchor="middle" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.7">pinned PDAL container (reproducible toolchain)</text>
  <!-- gate 1 -->
  <rect x="192" y="70" width="180" height="82" rx="8" fill="none" stroke="currentColor" stroke-width="1.5"/>
  <text x="282" y="96" text-anchor="middle" font-size="12" fill="currentColor" font-family="sans-serif" font-weight="600">Gate 1: static</text>
  <text x="282" y="115" text-anchor="middle" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.75">pdal pipeline --validate</text>
  <text x="282" y="131" text-anchor="middle" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.55">stage graph, no data</text>
  <text x="282" y="145" text-anchor="middle" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.55">milliseconds</text>
  <line x1="372" y1="111" x2="408" y2="111" stroke="currentColor" stroke-width="1.5" marker-end="url(#ci-arr)"/>
  <!-- gate 2 -->
  <rect x="412" y="70" width="172" height="82" rx="8" fill="none" stroke="currentColor" stroke-width="1.5"/>
  <text x="498" y="96" text-anchor="middle" font-size="12" fill="currentColor" font-family="sans-serif" font-weight="600">Gate 2: pytest</text>
  <text x="498" y="115" text-anchor="middle" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.75">run on fixture tile</text>
  <text x="498" y="131" text-anchor="middle" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.55">assert count + dims</text>
  <text x="498" y="145" text-anchor="middle" font-size="10" fill="currentColor" font-family="sans-serif" opacity="0.55">executes points</text>
  <!-- outcomes (arrows leave the gate-2 box edge and land on outcome pills) -->
  <line x1="584" y1="100" x2="659" y2="79" stroke="currentColor" stroke-width="1.5" marker-end="url(#ci-arr)"/>
  <line x1="584" y1="122" x2="659" y2="150" stroke="currentColor" stroke-width="1.5" stroke-dasharray="4 3" opacity="0.6" marker-end="url(#ci-arr)"/>
  <rect x="662" y="64" width="76" height="30" rx="6" fill="none" stroke="currentColor" stroke-width="1.4"/>
  <text x="700" y="83" text-anchor="middle" font-size="11" fill="currentColor" font-family="sans-serif" font-weight="600">merge</text>
  <rect x="662" y="135" width="76" height="30" rx="6" fill="none" stroke="currentColor" stroke-width="1.2" opacity="0.7"/>
  <text x="700" y="154" text-anchor="middle" font-size="11" fill="currentColor" font-family="sans-serif" opacity="0.75">blocked</text>
  <text x="700" y="182" text-anchor="middle" font-size="9" fill="currentColor" font-family="sans-serif" opacity="0.55">on any fail</text>
</svg>

## Prerequisites and Assumptions

| Requirement | Detail |
|---|---|
| PDAL | 2.6+ available on the CI runner (via container, see below) |
| Python | 3.10+ with `pdal` bindings and `pytest` |
| Repository layout | pipeline JSON under `pipelines/`, tests under `tests/` |
| Fixture tile | a decimated `.laz` (20 K–100 K points) committed to the repo |
| CI provider | GitHub Actions (the YAML below); adaptable to GitLab or others |

This page assumes your pipelines already run correctly against production data; CI is about keeping them that way. The static check leans on the same `--validate` flag described in [PDAL Stage Chaining](/pdal-pipeline-architecture-execution/pdal-stage-chaining/), which resolves stage compatibility, and the execution test extends the output-integrity assertions from the parent [Pipeline Validation](/pdal-pipeline-architecture-execution/pipeline-validation/) guide into an automated context.

## Step-by-Step Implementation

### Step 1 — Add a static `--validate` step

`pdal pipeline --validate` parses a pipeline, builds its stage graph, and resolves dependencies without touching point data. It exits non-zero on malformed JSON, unknown stage names like `filter.range`, or an ordering violation. A shell loop over every pipeline file makes this a one-line CI gate:

```bash
#!/usr/bin/env bash
set -euo pipefail
fail=0
for f in pipelines/*.json; do
  echo "Validating $f"
  if ! pdal pipeline --validate "$f"; then
    echo "::error file=$f::pdal --validate failed"
    fail=1
  fi
done
exit "$fail"
```

Because this reads no points, it returns in milliseconds per file and catches the largest class of mistakes — structural ones — before any expensive step runs.

### Step 2 — Commit a tiny fixture tile

The execution test needs data, but pulling a multi-gigabyte production tile into CI is slow and often impossible from a locked-down runner. Instead, decimate a real acquisition once and commit the result. Keeping a real tile (rather than synthetic points) means the fixture carries the same point format, `Classification` variety, and CRS your pipelines depend on.

```json
{
  "pipeline": [
    "production_sample.laz",
    {
      "type": "filters.decimation",
      "step": 200
    },
    {
      "type": "writers.las",
      "filename": "tests/fixtures/sample_tile.laz",
      "compression": "laszip",
      "forward": "all"
    }
  ]
}
```

A `step` of 200 keeps every 200th point, turning a 10 M-point tile into a 50 K-point fixture that still round-trips every dimension. The lossless mechanics of that write are covered in [Converting LAS to LAZ with PDAL](/point-cloud-data-standards-fundamentals/laslaz-file-structure/converting-las-to-laz-with-pdal/).

### Step 3 — Write the execution test

The pytest below discovers every pipeline in `pipelines/`, rewrites its reader to point at the fixture, executes it, and asserts that output survives with the dimensions you require. This is the layer that catches silent emptiness and dropped metadata.

```python
# tests/test_pipeline_execution.py
import json
from pathlib import Path

import pdal
import pytest

PIPELINE_DIR = Path("pipelines")
FIXTURE = Path("tests/fixtures/sample_tile.laz")
REQUIRED_DIMS = {"X", "Y", "Z", "Intensity", "Classification"}

pipeline_files = sorted(PIPELINE_DIR.glob("*.json"))


@pytest.mark.parametrize("pipeline_path", pipeline_files, ids=lambda p: p.name)
def test_pipeline_runs_on_fixture(pipeline_path, tmp_path):
    """Each pipeline must execute against the fixture and yield valid output."""
    stages = json.loads(pipeline_path.read_text())["pipeline"]

    # Point the reader at the committed fixture, the writer at a temp file.
    stages[0] = str(FIXTURE)
    for stage in stages:
        if isinstance(stage, dict) and stage.get("type", "").startswith("writers."):
            stage["filename"] = str(tmp_path / "out.laz")

    pipeline = pdal.Pipeline(json.dumps({"pipeline": stages}))
    count = pipeline.execute()

    assert count > 0, f"{pipeline_path.name} produced zero points on the fixture"

    arr = pipeline.arrays[0]
    missing = REQUIRED_DIMS - set(arr.dtype.names)
    assert not missing, f"{pipeline_path.name} dropped dimensions: {missing}"

    meta = str(pipeline.metadata).lower()
    assert "epsg" in meta or "wkt" in meta, f"{pipeline_path.name} lost its CRS"
```

### Step 4 — Pin PDAL and wire the GitHub Actions workflow

Running CI inside a pinned PDAL image freezes the toolchain so a green build means the same behaviour in production. The workflow triggers only when pipeline or test files change.

```yaml
# .github/workflows/validate-pipelines.yml
name: Validate PDAL Pipelines
on:
  pull_request:
    paths:
      - "pipelines/**/*.json"
      - "tests/**"

jobs:
  validate:
    runs-on: ubuntu-22.04
    container:
      image: pdal/pdal:2.6  # pinned tag — reproducible toolchain
    steps:
      - uses: actions/checkout@v4

      - name: Install Python test deps
        run: pip install pytest

      - name: Gate 1 — static pipeline validation
        run: bash ci/validate_pipelines.sh

      - name: Gate 2 — execution test on fixture tile
        run: pytest tests/test_pipeline_execution.py -v --tb=short
```

Pinning to `pdal/pdal:2.6` rather than `latest` is the difference between a reproducible gate and one that drifts silently as the base image updates. See [Running PDAL Pipelines in Docker](/batch-automation-cloud-integration/pdal-docker-containers/running-pdal-pipelines-in-docker/) for how to build a matching production image from the same tag, and [PDAL Docker Containers](/batch-automation-cloud-integration/pdal-docker-containers/) for image selection.

## Complete Working Example

The following `ci/validate_pipelines.sh` combines both gates into one script you can run locally before pushing, mirroring exactly what CI does. It fails fast on the static check and only proceeds to execution when the graph is sound.

```bash
#!/usr/bin/env bash
#
# validate_pipelines.sh
# Local mirror of the CI gate: static --validate, then fixture execution.
#
# Usage:  bash ci/validate_pipelines.sh
# Requires: pdal 2.6+, python with pdal bindings and pytest

set -euo pipefail

PIPELINE_DIR="pipelines"
FIXTURE="tests/fixtures/sample_tile.laz"

if [[ ! -f "$FIXTURE" ]]; then
  echo "::error::Fixture tile missing: $FIXTURE"
  exit 1
fi

echo "== Gate 1: static validation =="
static_fail=0
for f in "$PIPELINE_DIR"/*.json; do
  echo "  validating $f"
  if ! pdal pipeline --validate "$f" > /dev/null; then
    echo "::error file=$f::stage graph invalid"
    static_fail=1
  fi
done
if [[ "$static_fail" -ne 0 ]]; then
  echo "Static validation failed — skipping execution gate."
  exit 1
fi

echo "== Gate 2: fixture execution =="
pytest tests/test_pipeline_execution.py -v --tb=short

echo "All gates passed."
```

Running it against a repository with one broken pipeline produces a clear, attributable failure:

```text
== Gate 1: static validation ==
  validating pipelines/ground_dtm.json
  validating pipelines/reproject_25832.json
::error file=pipelines/reproject_25832.json::stage graph invalid
Static validation failed — skipping execution gate.
```

Here `reproject_25832.json` targeted `EPSG:25832` (ETRS89 UTM Zone 32N) but named its filter `filter.reprojection` instead of `filters.reprojection` — a typo the static gate rejects in milliseconds, long before any point is read.

## Key Parameter Table

| Item | Where | Value | Effect |
|---|---|---|---|
| `--validate` | `pdal pipeline` CLI | flag | Resolves stage graph without reading data; non-zero exit on failure |
| `step` | `filters.decimation` | int | Keeps every Nth point when building the fixture; larger = smaller fixture |
| `paths` | Actions trigger | glob list | Restricts the workflow to pipeline and test changes |
| `container.image` | Actions job | `pdal/pdal:2.6` | Pins the toolchain for reproducible results |
| `REQUIRED_DIMS` | pytest | set | Dimensions the execution test asserts survive every pipeline |

Keep the fixture, the required-dimension set, and the pinned PDAL tag under version control together. When you bump the PDAL image, re-run the suite deliberately — a passing build on the new tag is your evidence that the upgrade did not change pipeline behaviour.

## Verification

Prove the gate actually blocks bad changes by feeding it a deliberately broken pipeline and confirming a non-zero exit. A gate that never fails is worse than none, because it breeds false confidence.

```bash
# Sabotage a copy and confirm the static gate rejects it
cp pipelines/ground_dtm.json /tmp/broken.json
python - <<'PY'
import json
p = json.load(open("/tmp/broken.json"))
p["pipeline"][1]["type"] = "filter.range"   # invalid: singular prefix
json.dump(p, open("/tmp/broken.json", "w"))
PY

pdal pipeline --validate /tmp/broken.json && echo "UNEXPECTED PASS" || echo "OK: gate rejected broken pipeline"
```

For the execution gate, confirm an over-aggressive filter is caught by temporarily setting a range predicate that matches no points and checking that pytest fails on the zero-count assertion. Both negative tests belong in your test suite so the gates stay honest as PDAL versions change.

## Gotchas and Edge Cases

**1. `--validate` does not catch empty output.**
The static gate resolves the stage graph but reads no data, so a `filters.range` limit that excludes every point passes `--validate` cleanly and only fails at the pytest execution stage. This is exactly why both gates exist — treat the static check as necessary but never sufficient.

**2. A fixture that is too clean hides real failures.**
If you generate synthetic points or over-decimate, the fixture may lack the classification codes or return structure a pipeline depends on. A ground-classification pipeline tested against a fixture with no vegetation returns will pass while silently misbehaving on production data. Decimate a representative real tile and keep some of every relevant class.

**3. Metadata key paths differ across PDAL versions.**
Searching `pipeline.metadata` for the literal string `epsg` or `wkt` is deliberately loose because the nested key structure changed between PDAL releases. Do not assert on a specific metadata path in CI, or a routine PDAL upgrade will break the build for a non-reason. The pinned container mitigates this, but keep the assertion string-based.

**4. Path filters can skip a pipeline that a shared file affects.**
If a pipeline references a shared parameter file or a template not covered by your `paths` glob, a change to that shared file will not trigger the workflow. Either include shared paths in the trigger or run the full suite on a nightly schedule as a backstop.

## Frequently Asked Questions

**What does `pdal pipeline --validate` catch that a pytest does not?**

The `--validate` flag resolves the stage graph and rejects malformed JSON, unknown stage names, and incompatible stage ordering without reading any point data, so it runs in milliseconds on every file. A pytest execution against a fixture tile catches the runtime failures `--validate` cannot see: empty output from an over-aggressive range filter, dropped CRS metadata, and missing dimensions after a transform. The two are complementary layers, mirroring the structure of the parent [Pipeline Validation](/pdal-pipeline-architecture-execution/pipeline-validation/) harness.

**How small should the CI fixture tile be?**

Aim for 20,000 to 100,000 points — small enough to commit to the repository and execute in under a second, but large enough to carry the same point format, classification variety, and CRS as production data. Decimate a real tile with `filters.decimation` rather than generating synthetic points, so the fixture exercises the same dimensions your pipelines depend on.

**Why pin the PDAL version in CI?**

PDAL's metadata structure, default parameters, and available stages shift between releases, so a pipeline that validates on one version can fail on another. Running CI inside a pinned PDAL Docker image freezes the toolchain, making a green build a reliable signal that the same pipeline will behave identically in production containers built from the same tag — see [PDAL Docker Containers](/batch-automation-cloud-integration/pdal-docker-containers/).

**Should CI validation run on every commit or only when pipelines change?**

Scope the workflow to trigger only on changes to pipeline JSON and the test files, using path filters. This keeps unrelated pull requests fast while still gating any change that touches a pipeline definition. For expensive execution tests, additionally cache a hash of each pipeline and skip re-execution when the definition is unchanged.

---

## Related

- [Pipeline Validation](/pdal-pipeline-architecture-execution/pipeline-validation/) — parent guide building the in-process five-phase validation harness this workflow automates
- [PDAL Pipeline Architecture & Execution](/pdal-pipeline-architecture-execution/) — the execution model that both CI gates exercise
- [PDAL Stage Chaining](/pdal-pipeline-architecture-execution/pdal-stage-chaining/) — stage compatibility rules that `--validate` resolves
- [PDAL Docker Containers](/batch-automation-cloud-integration/pdal-docker-containers/) — building the pinned image that keeps CI reproducible
- [Running PDAL Pipelines in Docker](/batch-automation-cloud-integration/pdal-docker-containers/running-pdal-pipelines-in-docker/) — matching the CI toolchain to production execution
