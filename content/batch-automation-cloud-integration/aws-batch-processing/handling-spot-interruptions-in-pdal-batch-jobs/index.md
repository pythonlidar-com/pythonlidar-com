---
title: "Handling Spot Interruptions in PDAL Batch Jobs"
description: "Decompose the tile, write the marker after the object, trap SIGTERM and exit retryable — the design that turns a spot reclaim from a lost job into four lost minutes."
slug: "handling-spot-interruptions-in-pdal-batch-jobs"
type: "howto"
breadcrumb: "Handling Spot Interruptions"
datePublished: "2026-08-07"
dateModified: "2026-08-07"
---

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Article",
      "headline": "Handling Spot Interruptions in PDAL Batch Jobs",
      "description": "Decompose the tile, write the marker after the object, trap SIGTERM and exit retryable \u2014 the design that turns a spot reclaim from a lost job into four lost minutes.",
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
          "name": "Batch Automation and Cloud Integration for PDAL",
          "item": "https://www.pythonlidar.com/batch-automation-cloud-integration/"
        },
        {
          "@type": "ListItem",
          "position": 3,
          "name": "AWS Batch Processing",
          "item": "https://www.pythonlidar.com/batch-automation-cloud-integration/aws-batch-processing/"
        },
        {
          "@type": "ListItem",
          "position": 4,
          "name": "Handling Spot Interruptions",
          "item": "https://www.pythonlidar.com/batch-automation-cloud-integration/aws-batch-processing/handling-spot-interruptions-in-pdal-batch-jobs/"
        }
      ]
    },
    {
      "@type": "HowTo",
      "name": "Make a PDAL Batch job survive spot interruption",
      "step": [
        {
          "@type": "HowToStep",
          "name": "Decompose the tile into sub-tiles",
          "text": "Choose a unit of work that completes well inside the two-minute termination warning."
        },
        {
          "@type": "HowToStep",
          "name": "Write the marker after the object",
          "text": "Upload the output first and record completion second, so a crash can never claim work that was not durable."
        },
        {
          "@type": "HowToStep",
          "name": "Skip completed sub-tiles on entry",
          "text": "List the markers as the first action of every attempt and remove those sub-tiles from the work list."
        },
        {
          "@type": "HowToStep",
          "name": "Trap SIGTERM and stop between units",
          "text": "Set a flag from the handler and check it between sub-tiles rather than aborting a write."
        },
        {
          "@type": "HowToStep",
          "name": "Exit with a retryable status",
          "text": "Return non-zero on interruption so Batch retries, and let the retry skip everything already marked."
        }
      ]
    },
    {
      "@type": "FAQPage",
      "mainEntity": [
        {
          "@type": "Question",
          "name": "How long does a spot instance give me?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "About two minutes between the termination notice and the kill. That is ample to finish writing one sub-tile and record it, and nowhere near enough to finish a forty-minute pipeline \u2014 which is why the unit of work has to be smaller than the warning for the warning to be useful at all."
          }
        },
        {
          "@type": "Question",
          "name": "Why must the marker be written after the output?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Because a marker written first turns a crash into permanent missing data. A later run finds the marker, concludes the tile is done, and skips it forever. Writing the object first means the worst case is redundant work, which costs money rather than correctness."
          }
        },
        {
          "@type": "Question",
          "name": "Is spot actually worth it?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "At roughly a third of the on-demand price and a few percent interruption rate, yes, provided an interruption is cheap. With sub-tile checkpoints an interruption costs a few minutes; without them it costs the whole job, and at that point the arithmetic can reverse."
          }
        },
        {
          "@type": "Question",
          "name": "What if the termination notice never arrives?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "It occasionally does not, and the design has to be correct without it. Because the marker is written only after the object is durable, an instance that simply disappears leaves an unmarked sub-tile that the retry picks up \u2014 the same path as an orderly shutdown."
          }
        }
      ]
    }
  ]
}
</script>

**TL;DR:** Trap `SIGTERM`, flush whatever is complete, write the marker only after the output object is durable, and make the job's first action a check for that marker — then a spot reclaim costs one sub-tile instead of the whole job.

## Context and Motivation

This guide is part of [AWS Batch Processing for PDAL](https://www.pythonlidar.com/batch-automation-cloud-integration/aws-batch-processing/). Spot capacity is roughly a third of the on-demand price, and at a typical interruption rate of a few percent the arithmetic is not close — provided an interruption is cheap. Making it cheap is a design property, not a setting.

The mechanism is straightforward. When capacity is reclaimed, the instance receives a termination notice and the container gets `SIGTERM`, followed about two minutes later by `SIGKILL`. Two minutes is ample to finish writing a sub-tile and record that it is done. It is nowhere near enough to finish a forty-minute pipeline, so the design has to be built from units that fit inside the warning.

<svg viewBox="0 0 720 258" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="What a spot reclaim costs with and without sub-tile checkpoints" style="width:100%;max-width:720px;display:block;margin:1.6rem auto">
  <title>Two minutes is enough for a checkpoint, not for a job</title>
  <desc>Two timelines of the same 40-minute tile job interrupted at 28 minutes. Without checkpoints all 28 minutes are discarded and the retry starts from zero. With sub-tile checkpoints the completed sub-tiles are already durable, so the retry resumes and loses only the four minutes of work in flight.</desc>
  <rect x="0" y="0" width="720" height="258" fill="var(--dg-bg)" rx="10"/>
  <text x="20" y="38" font-size="11.5" font-weight="600" fill="var(--dg-e)">no checkpoints</text>
  <rect x="180" y="24" width="380" height="28" rx="4" fill="var(--dg-e-soft)" stroke="var(--dg-e)" stroke-width="1.2"/>
  <text x="370" y="43" text-anchor="middle" font-size="10.5" fill="var(--dg-text)">28 minutes of work, all discarded</text>
  <rect x="560" y="24" width="120" height="28" rx="4" fill="var(--dg-surface-2)" stroke="var(--dg-line-soft)" stroke-width="1.1"/>
  <text x="620" y="43" text-anchor="middle" font-size="10" fill="var(--dg-muted)">never reached</text>
  <text x="20" y="104" font-size="11.5" font-weight="600" fill="var(--dg-d)">sub-tile checkpoints</text>
  <rect x="180" y="90" width="76" height="28" rx="4" fill="var(--dg-d-soft)" stroke="var(--dg-d)" stroke-width="1.2"/>
  <text x="218" y="109" text-anchor="middle" font-size="9.5" fill="var(--dg-text)">saved</text>
  <rect x="260" y="90" width="76" height="28" rx="4" fill="var(--dg-d-soft)" stroke="var(--dg-d)" stroke-width="1.2"/>
  <text x="298" y="109" text-anchor="middle" font-size="9.5" fill="var(--dg-text)">saved</text>
  <rect x="340" y="90" width="76" height="28" rx="4" fill="var(--dg-d-soft)" stroke="var(--dg-d)" stroke-width="1.2"/>
  <text x="378" y="109" text-anchor="middle" font-size="9.5" fill="var(--dg-text)">saved</text>
  <rect x="420" y="90" width="76" height="28" rx="4" fill="var(--dg-d-soft)" stroke="var(--dg-d)" stroke-width="1.2"/>
  <text x="458" y="109" text-anchor="middle" font-size="9.5" fill="var(--dg-text)">saved</text>
  <rect x="500" y="90" width="60" height="28" rx="4" fill="var(--dg-c-soft)" stroke="var(--dg-c)" stroke-width="1.3"/>
  <text x="530" y="109" text-anchor="middle" font-size="9" fill="var(--dg-text)">in flight</text>
  <rect x="564" y="90" width="116" height="28" rx="4" fill="var(--dg-surface-2)" stroke="var(--dg-line-soft)" stroke-width="1.1"/>
  <text x="622" y="109" text-anchor="middle" font-size="9.5" fill="var(--dg-muted)">retry continues here</text>
  <line x1="560" y1="16" x2="560" y2="130" stroke="var(--dg-c)" stroke-width="2.2" stroke-dasharray="5 4"/>
  <text x="552" y="148" text-anchor="end" font-size="10.5" fill="var(--dg-c)">SIGTERM — about two minutes of warning</text>
  <rect x="20" y="168" width="660" height="34" rx="7" fill="var(--dg-surface)" stroke="var(--dg-line-soft)" stroke-width="1.2"/>
  <text x="36" y="190" font-size="11" fill="var(--dg-text)">the unit of work has to be smaller than the warning, or the warning cannot be used for anything</text>
  <text x="20" y="228" font-size="10.5" fill="var(--dg-muted)">four minutes lost against twenty-eight is the difference between spot being cheap and spot being a false economy</text>
</svg>

## Prerequisites and Assumptions

| Requirement | Detail |
|---|---|
| AWS Batch | on a spot compute environment |
| A decomposable job | sub-tiles, or a natural checkpoint boundary |
| Durable output | S3, with the marker written after the object |
| Signal handling | in the entrypoint, not in a wrapper script that ignores it |
| Retries enabled | `attempts` above 1 in the job definition |

## Step-by-Step Implementation

### Step 1 — Decompose the tile into sub-tiles

Choose a size that completes well inside two minutes. On a typical pipeline that is a few hundred metres square.

### Step 2 — Write the marker after the object

```python
write_output(sub_tile)      # object is durable first
put_marker(sub_tile)        # only then is it recorded as done
```

Reversing these turns an interruption into permanent missing data — the point made in [scaling PDAL tile processing with AWS Batch](https://www.pythonlidar.com/batch-automation-cloud-integration/aws-batch-processing/scaling-pdal-tile-processing-with-aws-batch/).

### Step 3 — Skip completed sub-tiles on entry

The first action of every attempt is to list the markers and remove those sub-tiles from the work list.

### Step 4 — Trap SIGTERM and stop cleanly

```python
signal.signal(signal.SIGTERM, lambda *_: stop.set())
```

Check the flag between sub-tiles rather than trying to abort mid-write.

### Step 5 — Exit with a retryable status

Exit non-zero on interruption so Batch retries the job; the retry will skip everything already marked.

## Complete Working Example

```python
"""A Batch entrypoint that survives spot reclamation."""
from __future__ import annotations

import json
import logging
import os
import signal
import sys
import threading
from pathlib import Path

import boto3

LOG = logging.getLogger("worker")
S3 = boto3.client("s3")
BUCKET = os.environ["OUTPUT_BUCKET"]
PREFIX = os.environ["OUTPUT_PREFIX"]

stop = threading.Event()


def _on_term(signum, frame):  # noqa: ARG001
    LOG.warning("received signal %s — finishing the current sub-tile and stopping", signum)
    stop.set()


def marker_key(sub_tile: str) -> str:
    return f"{PREFIX}/_markers/{sub_tile}.done"


def already_done(sub_tile: str) -> bool:
    try:
        S3.head_object(Bucket=BUCKET, Key=marker_key(sub_tile))
        return True
    except S3.exceptions.ClientError:
        return False


def process_sub_tile(sub_tile: str) -> None:
    """Run the pipeline for one sub-tile and upload the result."""
    out = Path(f"/scratch/{sub_tile}.laz")
    # ... pdal.Pipeline(...).execute() writes `out` ...
    S3.upload_file(str(out), BUCKET, f"{PREFIX}/{sub_tile}.laz")
    # Marker last: the object is durable before anything claims it is.
    S3.put_object(Bucket=BUCKET, Key=marker_key(sub_tile), Body=b"")
    out.unlink(missing_ok=True)


def main() -> int:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(message)s")
    signal.signal(signal.SIGTERM, _on_term)
    signal.signal(signal.SIGINT, _on_term)

    sub_tiles = json.loads(Path("/work/sub_tiles.json").read_text())
    pending = [s for s in sub_tiles if not already_done(s)]
    LOG.info("%d of %d sub-tiles remain", len(pending), len(sub_tiles))

    for sub_tile in pending:
        if stop.is_set():
            LOG.warning("stopping early; %d sub-tiles left for the retry", len(pending))
            return 75  # non-zero: Batch retries, and the retry skips what is done
        process_sub_tile(sub_tile)
        LOG.info("completed %s", sub_tile)

    return 0


if __name__ == "__main__":
    sys.exit(main())
```

<svg viewBox="0 0 720 250" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Effective cost per completed tile on spot at four interruption rates" style="width:100%;max-width:720px;display:block;margin:1.6rem auto">
  <title>Where spot stops being cheaper</title>
  <desc>Effective cost per completed tile on spot capacity, at four interruption rates, compared with the on-demand price. With sub-tile checkpoints the wasted work per interruption is small, so spot stays about a third of on-demand even at a fifteen percent interruption rate. Without checkpoints the same rate makes spot more expensive than on-demand.</desc>
  <rect x="0" y="0" width="720" height="250" fill="var(--dg-bg)" rx="10"/>
  <text x="240" y="76" text-anchor="end" font-size="11" fill="var(--dg-text)">on-demand</text>
  <rect x="250" y="56" width="223" height="30" rx="4" fill="var(--dg-b-soft)" stroke="var(--dg-b)" stroke-width="1.2"/>
  <text x="481" y="76" font-size="10.5" fill="var(--dg-muted)">$0.100 — the baseline</text>
  <text x="240" y="120" text-anchor="end" font-size="11" fill="var(--dg-text)">spot, 2% interrupted, checkpointed</text>
  <rect x="250" y="100" width="76" height="30" rx="4" fill="var(--dg-d-soft)" stroke="var(--dg-d)" stroke-width="1.2"/>
  <text x="334" y="120" font-size="10.5" fill="var(--dg-muted)">$0.034</text>
  <text x="240" y="164" text-anchor="end" font-size="11" fill="var(--dg-text)">spot, 15% interrupted, checkpointed</text>
  <rect x="250" y="144" width="87" height="30" rx="4" fill="var(--dg-d-soft)" stroke="var(--dg-d)" stroke-width="1.2"/>
  <text x="345" y="164" font-size="10.5" fill="var(--dg-muted)">$0.039</text>
  <text x="240" y="208" text-anchor="end" font-size="11" fill="var(--dg-text)">spot, 15% interrupted, no checkpoints</text>
  <rect x="250" y="188" width="263" height="30" rx="4" fill="var(--dg-e-soft)" stroke="var(--dg-e)" stroke-width="1.2"/>
  <text x="521" y="208" font-size="10.5" fill="var(--dg-muted)">$0.118 — worse than on-demand</text>
  <text x="250" y="40" font-size="10.5" fill="var(--dg-muted)">effective cost per completed tile, including work discarded by interruptions</text>
  <text x="60" y="240" font-size="10.5" fill="var(--dg-muted)">the whole spot argument rests on the fourth row not being the one you are running</text>
</svg>

## Key Parameter Table

| Setting | Where | Guidance |
|---|---|---|
| sub-tile size | your decomposition | Completes well inside the two-minute warning |
| marker order | entrypoint | Object first, marker second, always |
| `attempts` | job definition | 3 is typical on spot |
| exit code | entrypoint | Non-zero on interruption so Batch retries |
| `SIGTERM` handler | entrypoint | Sets a flag; never aborts a write in progress |

## Verification

**A killed job resumes.** Send `SIGTERM` to a running container and confirm the retry starts from the first unmarked sub-tile.

**Markers never precede objects.** Delete an output object but leave its marker, re-run, and confirm the gap is visible — because it will not be filled.

**Retries are cheap.** A re-run of a completed job should finish in seconds, having found every marker.

<svg viewBox="-2 38 724 207" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="The path a termination signal takes from the spot service to your handler" style="width:100%;max-width:720px;display:block;margin:1.6rem auto">
  <title>Every hop is a place the signal can be dropped</title>
  <desc>The termination notice travels from the spot service to the ECS agent, to the container runtime, to PID 1 inside the container, and only then to your handler. A shell wrapper that is PID 1 and does not forward signals absorbs it, and the handler never runs — the single most common reason a correctly written trap appears to do nothing.</desc>
  <rect x="-2" y="38" width="724" height="207" fill="var(--dg-bg)" rx="10"/>
  <defs><marker id="sig-arw" markerWidth="9" markerHeight="7" refX="9" refY="3.5" orient="auto"><path d="M0,0 L0,7 L9,3.5 z" fill="var(--dg-line)"/></marker></defs>
  <rect x="20" y="60" width="150" height="46" rx="7" fill="var(--dg-b-soft)" stroke="var(--dg-b)" stroke-width="1.3"/>
  <text x="95" y="88" text-anchor="middle" font-size="10.5" fill="var(--dg-text)">spot service</text>
  <rect x="196" y="60" width="150" height="46" rx="7" fill="var(--dg-b-soft)" stroke="var(--dg-b)" stroke-width="1.3"/>
  <text x="271" y="88" text-anchor="middle" font-size="10.5" fill="var(--dg-text)">ECS agent</text>
  <rect x="372" y="60" width="150" height="46" rx="7" fill="var(--dg-c-soft)" stroke="var(--dg-c)" stroke-width="1.3"/>
  <text x="447" y="82" text-anchor="middle" font-size="10.5" fill="var(--dg-text)">PID 1 in container</text>
  <text x="447" y="98" text-anchor="middle" font-size="9" fill="var(--dg-muted)">shell, or your process</text>
  <rect x="548" y="60" width="152" height="46" rx="7" fill="var(--dg-d-soft)" stroke="var(--dg-d)" stroke-width="1.3"/>
  <text x="624" y="88" text-anchor="middle" font-size="10.5" fill="var(--dg-text)">your SIGTERM handler</text>
  <line x1="170" y1="83" x2="190" y2="83" stroke="var(--dg-line)" stroke-width="1.5" marker-end="url(#sig-arw)"/>
  <line x1="346" y1="83" x2="366" y2="83" stroke="var(--dg-line)" stroke-width="1.5" marker-end="url(#sig-arw)"/>
  <line x1="522" y1="83" x2="542" y2="83" stroke="var(--dg-line)" stroke-width="1.5" marker-end="url(#sig-arw)"/>
  <rect x="372" y="130" width="328" height="40" rx="7" fill="var(--dg-e-soft)" stroke="var(--dg-e)" stroke-width="1.2"/>
  <text x="536" y="155" text-anchor="middle" font-size="10.5" fill="var(--dg-text)">sh -c "python worker.py" — signal stops here</text>
  <text x="20" y="200" font-size="10.5" fill="var(--dg-muted)">use exec, or an ENTRYPOINT in exec form, so the Python process is PID 1 and receives the signal directly</text>
  <text x="20" y="220" font-size="10.5" fill="var(--dg-muted)">rather than inheriting it from a shell that has already exited.</text>
</svg>

## Gotchas and Edge Cases

**A wrapper script that swallows the signal.** `sh -c "python worker.py"` may not forward `SIGTERM`. Use `exec`, or make the Python process PID 1.

**Sub-tiles that are too large.** If one takes five minutes, the warning cannot save it and checkpointing buys nothing.

**Markers in the same prefix as outputs.** A later listing then treats markers as data. Keep them under their own prefix.

**Assuming the warning always arrives.** It usually does; occasionally an instance simply disappears. The design must be correct without it, which it is — the marker is the only source of truth.

## Frequently Asked Questions

**How long does a spot instance give me?**

About two minutes between the termination notice and the kill. That is ample to finish writing one sub-tile and record it, and nowhere near enough to finish a forty-minute pipeline — which is why the unit of work has to be smaller than the warning for the warning to be useful at all.

**Why must the marker be written after the output?**

Because a marker written first turns a crash into permanent missing data. A later run finds the marker, concludes the tile is done, and skips it forever. Writing the object first means the worst case is redundant work, which costs money rather than correctness.

**Is spot actually worth it?**

At roughly a third of the on-demand price and a few percent interruption rate, yes, provided an interruption is cheap. With sub-tile checkpoints an interruption costs a few minutes; without them it costs the whole job, and at that point the arithmetic can reverse.

**What if the termination notice never arrives?**

It occasionally does not, and the design has to be correct without it. Because the marker is written only after the object is durable, an instance that simply disappears leaves an unmarked sub-tile that the retry picks up — the same path as an orderly shutdown.

---

## Related

- [AWS Batch Processing](https://www.pythonlidar.com/batch-automation-cloud-integration/aws-batch-processing/) — the parent guide to the compute environment and job model
- [Scaling PDAL Tile Processing with AWS Batch](https://www.pythonlidar.com/batch-automation-cloud-integration/aws-batch-processing/scaling-pdal-tile-processing-with-aws-batch/) — the array-job fan-out this makes safe to retry
- [Running PDAL Pipelines in Docker](https://www.pythonlidar.com/batch-automation-cloud-integration/pdal-docker-containers/running-pdal-pipelines-in-docker/) — the entrypoint that has to forward the signal
- [Batch Automation and Cloud Integration for PDAL](https://www.pythonlidar.com/batch-automation-cloud-integration/) — the section overview
- [S3 and Cloud Storage I/O](https://www.pythonlidar.com/batch-automation-cloud-integration/s3-cloud-storage-io/) — the durability guarantees the marker design rests on
