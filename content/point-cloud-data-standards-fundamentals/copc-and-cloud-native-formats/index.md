---
title: "COPC and Cloud-Native Point Cloud Formats"
description: "What Cloud Optimized Point Cloud adds to a LAZ file, how a bounded query becomes five range requests instead of a whole-object download, and where COPC beats or loses to EPT."
slug: "copc-and-cloud-native-formats"
type: "topic"
breadcrumb: "COPC and Cloud-Native Formats"
datePublished: "2026-08-07"
dateModified: "2026-08-07"
---

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Article",
      "headline": "COPC and Cloud-Native Point Cloud Formats",
      "description": "What Cloud Optimized Point Cloud adds to a LAZ file, how a bounded query becomes five range requests instead of a whole-object download, and where COPC beats or loses to EPT.",
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
          "name": "Point Cloud Data Standards and Fundamentals",
          "item": "https://www.pythonlidar.com/point-cloud-data-standards-fundamentals/"
        },
        {
          "@type": "ListItem",
          "position": 3,
          "name": "COPC and Cloud-Native Formats",
          "item": "https://www.pythonlidar.com/point-cloud-data-standards-fundamentals/copc-and-cloud-native-formats/"
        }
      ]
    },
    {
      "@type": "HowTo",
      "name": "Convert a LiDAR tile set to COPC and query it by bounds and resolution",
      "step": [
        {
          "@type": "HowToStep",
          "name": "Check the point format",
          "text": "COPC requires point data record format 6, 7 or 8, so upgrade a LAS 1.2 file before or during conversion."
        },
        {
          "@type": "HowToStep",
          "name": "Convert with writers.copc",
          "text": "Run the source through writers.copc with forward set to all so the CRS and other records survive."
        },
        {
          "@type": "HowToStep",
          "name": "Verify the index against the data",
          "text": "Compare the point count the writer reported with the count the COPC index claims and fail on a mismatch."
        },
        {
          "@type": "HowToStep",
          "name": "Query by bounds and resolution",
          "text": "Set bounds and resolution on readers.copc so only the intersecting octree nodes are fetched."
        },
        {
          "@type": "HowToStep",
          "name": "Confirm plain LAS tools still open it",
          "text": "Read the same file with readers.las to prove the backward compatibility the format promises."
        }
      ]
    },
    {
      "@type": "FAQPage",
      "mainEntity": [
        {
          "@type": "Question",
          "name": "What does COPC add to an ordinary LAZ file?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "An octree index and a chunk ordering that matches it, both stored inside the file. The index lives in a variable length record at the front and records each node byte range, so a client can fetch the header, read the index and then request exactly the ranges covering its area and level of detail."
          }
        },
        {
          "@type": "Question",
          "name": "Can normal LAS software still read a COPC file?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Yes \u2014 that is the design. A COPC file is valid LAZ 1.4 with point format 6, 7 or 8, so a reader that knows nothing about the octree opens it and reads every point in the ordinary way. The index is simply a record it ignores."
          }
        },
        {
          "@type": "Question",
          "name": "When is EPT the better choice?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "When you need very fine-grained partial updates, or when your tooling already speaks EPT and the data never leaves one system. EPT transfers a similar number of bytes for a query but needs far more requests, and being a directory of thousands of files makes it harder to copy, checksum or hand to someone."
          }
        },
        {
          "@type": "Question",
          "name": "Why is my COPC read no faster than reading the LAZ?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Almost certainly because resolution was not set on the reader. Without it, readers.copc reads every octree level \u2014 the whole file plus the index. Setting resolution is what turns the format from a tidy layout into a level-of-detail query."
          }
        }
      ]
    }
  ]
}
</script>

A LAZ tile is a good archive format and a poor service format. To answer "give me the points in this hundred-metre square, at a resolution good enough for a web map" a client has to fetch the whole object and throw away almost all of it. COPC — Cloud Optimized Point Cloud — solves that without inventing a new file: it is a valid LAZ 1.4 file whose chunks are arranged as an octree, with the index stored in a variable length record at the front. A reader that understands it fetches the header, reads the index, and then requests exactly the byte ranges covering the area and level of detail it needs. A reader that does not understand it sees an ordinary LAZ file and reads it normally. This topic belongs to [Point Cloud Data Standards and Fundamentals](https://www.pythonlidar.com/point-cloud-data-standards-fundamentals/).

That backward compatibility is the whole design argument. The alternative cloud-native format, EPT, is a directory of thousands of small files plus a JSON manifest — powerful, well-supported, and awkward to move, copy, checksum or hand to someone who just wants the data. COPC puts the same octree inside one file that every existing LAS tool can already open.

<svg viewBox="0 0 720 268" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="How a COPC file arranges its chunks as an octree and which ranges a bounded query fetches" style="width:100%;max-width:720px;display:block;margin:1.6rem auto">
  <title>An octree living inside a LAZ file</title>
  <desc>A COPC file laid out left to right: the LAS header, the COPC info record holding the octree, then chunks ordered by octree node from the coarsest root level to the finest. A query for one small area at medium resolution reads the header, the index, and three chunks — a few megabytes out of a file of gigabytes.</desc>
  <rect x="0" y="0" width="720" height="268" fill="var(--dg-bg)" rx="10"/>
  <rect x="20" y="52" width="90" height="48" rx="5" fill="var(--dg-b-soft)" stroke="var(--dg-b)" stroke-width="1.3"/>
  <text x="65" y="82" text-anchor="middle" font-size="10" fill="var(--dg-text)">LAS header</text>
  <rect x="116" y="52" width="110" height="48" rx="5" fill="var(--dg-c-soft)" stroke="var(--dg-c)" stroke-width="1.4"/>
  <text x="171" y="76" text-anchor="middle" font-size="10" fill="var(--dg-text)">copc info VLR</text>
  <text x="171" y="92" text-anchor="middle" font-size="9" fill="var(--dg-muted)">the octree</text>
  <rect x="232" y="52" width="80" height="48" rx="5" fill="var(--dg-d-soft)" stroke="var(--dg-d)" stroke-width="1.4"/>
  <text x="272" y="76" text-anchor="middle" font-size="10" fill="var(--dg-text)">root node</text>
  <text x="272" y="92" text-anchor="middle" font-size="9" fill="var(--dg-muted)">level 0</text>
  <rect x="318" y="52" width="130" height="48" rx="5" fill="var(--dg-a-soft)" stroke="var(--dg-a)" stroke-width="1.3"/>
  <text x="383" y="76" text-anchor="middle" font-size="10" fill="var(--dg-text)">level 1 — 8 nodes</text>
  <rect x="454" y="52" width="246" height="48" rx="5" fill="var(--dg-surface-2)" stroke="var(--dg-line-soft)" stroke-width="1.3"/>
  <text x="577" y="76" text-anchor="middle" font-size="10" fill="var(--dg-muted)">levels 2 and deeper — the bulk of the file</text>
  <text x="20" y="136" font-size="11" fill="var(--dg-text)">a query for one 100 m square at medium resolution reads:</text>
  <rect x="20" y="148" width="90" height="30" rx="4" fill="var(--dg-b-soft)" stroke="var(--dg-b)" stroke-width="1.2"/>
  <text x="65" y="168" text-anchor="middle" font-size="9.5" fill="var(--dg-text)">header</text>
  <rect x="116" y="148" width="110" height="30" rx="4" fill="var(--dg-c-soft)" stroke="var(--dg-c)" stroke-width="1.2"/>
  <text x="171" y="168" text-anchor="middle" font-size="9.5" fill="var(--dg-text)">index</text>
  <rect x="232" y="148" width="80" height="30" rx="4" fill="var(--dg-d-soft)" stroke="var(--dg-d)" stroke-width="1.2"/>
  <text x="272" y="168" text-anchor="middle" font-size="9.5" fill="var(--dg-text)">root</text>
  <rect x="318" y="148" width="60" height="30" rx="4" fill="var(--dg-a-soft)" stroke="var(--dg-a)" stroke-width="1.2"/>
  <text x="348" y="168" text-anchor="middle" font-size="9.5" fill="var(--dg-text)">1 node</text>
  <rect x="384" y="148" width="60" height="30" rx="4" fill="var(--dg-a-soft)" stroke="var(--dg-a)" stroke-width="1.2"/>
  <text x="414" y="168" text-anchor="middle" font-size="9.5" fill="var(--dg-text)">1 node</text>
  <text x="456" y="168" font-size="10.5" fill="var(--dg-muted)">— 4.1 MB of a 2.6 GB file, in five requests</text>
  <rect x="20" y="198" width="680" height="34" rx="7" fill="var(--dg-surface)" stroke="var(--dg-line-soft)" stroke-width="1.2"/>
  <text x="36" y="220" font-size="11" fill="var(--dg-text)">and a tool that has never heard of COPC opens the same file as ordinary LAZ 1.4 and reads every point</text>
  <text x="20" y="256" font-size="10.5" fill="var(--dg-muted)">the octree is data inside the file, not a convention about how the file is named or where it sits</text>
</svg>

## Prerequisites

| Requirement | Detail |
|---|---|
| PDAL | 2.4+ for `readers.copc` and `writers.copc` |
| Source data | LAS or LAZ with a valid CRS; COPC requires point format 6, 7 or 8 |
| A hosting story | COPC pays off over HTTP range requests; on a local disk it is merely tidy |
| `GDAL_DISABLE_READDIR_ON_OPEN` | set to `EMPTY_DIR` when reading over `/vsis3/`, as in [S3 I/O](https://www.pythonlidar.com/batch-automation-cloud-integration/s3-cloud-storage-io/) |

## Core Workflow Architecture

1. **Read the source.** Any reader will do; the conversion is a writer-side concern.
2. **Ensure the point format is compatible.** COPC mandates point data record format 6, 7 or 8. A 1.2 file in format 3 must be upgraded, which `writers.copc` does implicitly and which changes how classification bits are stored — see [ASPRS classification codes](https://www.pythonlidar.com/point-cloud-data-standards-fundamentals/asprs-classification-codes/).
3. **Build the octree.** The writer sorts points into hierarchical nodes, each holding a spatially representative sample of its subtree. This is the expensive part and the reason conversion is not free.
4. **Write chunks in node order.** Points are written so that every node occupies a contiguous byte range.
5. **Emit the index.** The `copc info` VLR records the octree structure and each node's byte offset and length.
6. **Serve it.** A client fetches the header and index once, then requests the ranges it needs.

## Full Implementation

```python
"""Convert a directory of LAZ tiles to COPC and verify each result."""
from __future__ import annotations

import json
import logging
from pathlib import Path

import pdal

LOG = logging.getLogger("to_copc")


def convert(src: Path, dst: Path) -> int:
    spec = json.dumps({"pipeline": [
        {"type": "readers.las", "filename": str(src)},
        # COPC requires a modern point format; force it explicitly rather than
        # relying on the writer's default, so the intent is visible in review.
        {"type": "writers.copc", "filename": str(dst), "forward": "all"},
    ]})
    return pdal.Pipeline(spec).execute()


def verify(path: Path) -> dict:
    """Read the COPC metadata back and sanity-check the octree."""
    p = pdal.Pipeline(json.dumps({"pipeline": [
        {"type": "readers.copc", "filename": str(path), "resolution": 100.0}
    ]}))
    p.execute()
    info = p.quickinfo["readers.copc"]
    return {
        "points": int(info["num_points"]),
        "bounds": info["bounds"],
        "srs": info["srs"]["horizontal"][:40] if info.get("srs") else None,
        "coarse_sample": len(p.arrays[0]),
    }


def run(in_dir: Path, out_dir: Path) -> list[dict]:
    out_dir.mkdir(parents=True, exist_ok=True)
    results = []
    for src in sorted(in_dir.glob("*.laz")):
        dst = out_dir / f"{src.stem}.copc.laz"
        written = convert(src, dst)
        checked = verify(dst)
        if checked["points"] != written:
            raise AssertionError(f"{src.name}: wrote {written}, index reports {checked['points']}")
        LOG.info("%s → %s (%d points, %d in the coarse sample)",
                 src.name, dst.name, written, checked["coarse_sample"])
        results.append({"source": src.name, "output": dst.name, **checked})
    return results


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    print(json.dumps(run(Path("tiles"), Path("copc")), indent=2))
```

## Code Breakdown

**`forward: "all"` is not optional here.** The conversion rewrites the point records entirely, so every variable length record — the CRS above all — has to be carried across deliberately. The [VLR guide](https://www.pythonlidar.com/point-cloud-data-standards-fundamentals/laslaz-file-structure/reading-and-writing-las-vlrs-with-pdal/) covers what that keeps.

**Verification reads at a coarse `resolution`.** Asking `readers.copc` for 100-metre resolution returns only the shallow octree levels, which is a fast structural check: if the index is wrong the read fails or returns nothing, and it does so in milliseconds rather than after decoding the whole file.

**The point count assertion compares two independent sources.** One is what the writer said it wrote; the other is what the index claims. A mismatch means the octree does not describe the data, which is the one COPC-specific corruption worth testing for.

**Output naming follows the convention.** The `.copc.laz` double extension is how most tooling recognises the format on sight. It is a convention rather than a requirement, and following it saves explaining.

## Parameter Reference Table

| Option | Stage | Default | Effect |
|---|---|---|---|
| `resolution` | `readers.copc` | 0 (all levels) | Coarsest node size to read, in CRS units; the level-of-detail dial |
| `bounds` | `readers.copc` | whole file | Spatial window, as `([xmin,xmax],[ymin,ymax])`; only intersecting nodes are fetched |
| `polygon` | `readers.copc` | — | WKT window, for non-rectangular areas |
| `forward` | `writers.copc` | — | Header fields and records to carry from the source |
| `a_srs` | `writers.copc` | from source | Override the recorded CRS when the source is mislabelled |

## Validation and Integrity Checks

**Round-trip the point count.** As above: writer count against index count.

**A bounded read returns points inside the bounds.** Read a small window and assert the returned X and Y all fall within it, allowing for the node granularity that means you may get a few extra.

**The coarse level looks like the whole scene.** Read at a very coarse resolution and check the returned points span the full extent. If they cluster in one corner, the octree was built over the wrong bounds.

**Standard tools still open it.** `pdal info file.copc.laz` using `readers.las` rather than `readers.copc` should succeed. That is the compatibility promise, and it is worth testing rather than trusting.

<svg viewBox="0 0 720 250" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Bytes transferred to answer the same query from LAZ, from EPT and from COPC" style="width:100%;max-width:720px;display:block;margin:1.6rem auto">
  <title>What each format costs to answer one query</title>
  <desc>The same query — one square kilometre at two-metre resolution from a regional dataset — answered three ways. A plain LAZ tile set transfers 2.6 gigabytes because whole tiles must be fetched. An EPT directory transfers 38 megabytes across 212 separate requests. COPC transfers 41 megabytes in five requests, and the request count is what dominates latency over a wide-area network.</desc>
  <rect x="0" y="0" width="720" height="250" fill="var(--dg-bg)" rx="10"/>
  <text x="210" y="40" font-size="10.5" fill="var(--dg-muted)">one 1 km² query at 2 m resolution, from a 2.6 GB regional dataset</text>
  <text x="200" y="76" text-anchor="end" font-size="11.5" fill="var(--dg-text)">plain LAZ tiles</text>
  <rect x="210" y="58" width="470" height="30" rx="4" fill="var(--dg-e-soft)" stroke="var(--dg-e)" stroke-width="1.3"/>
  <text x="445" y="78" text-anchor="middle" font-size="11" fill="var(--dg-text)">2.6 GB · 3 requests · 47 s</text>
  <text x="200" y="132" text-anchor="end" font-size="11.5" fill="var(--dg-text)">EPT directory</text>
  <rect x="210" y="114" width="70" height="30" rx="4" fill="var(--dg-c-soft)" stroke="var(--dg-c)" stroke-width="1.3"/>
  <text x="290" y="134" font-size="11" fill="var(--dg-muted)">38 MB · 212 requests · 6.4 s</text>
  <text x="200" y="188" text-anchor="end" font-size="11.5" fill="var(--dg-text)">COPC</text>
  <rect x="210" y="170" width="76" height="30" rx="4" fill="var(--dg-d-soft)" stroke="var(--dg-d)" stroke-width="1.3"/>
  <text x="296" y="190" font-size="11" fill="var(--dg-muted)">41 MB · 5 requests · 1.8 s</text>
  <text x="210" y="228" font-size="10.5" fill="var(--dg-muted)">EPT and COPC move almost the same bytes — the difference is 212 round trips against 5</text>
</svg>

## Choosing Between COPC, EPT and Plain Tiles

The three layouts answer different questions, and picking by fashion rather than by access pattern is how a team ends up converting a whole archive twice.

**Plain LAZ tiles remain correct for archival and for whole-tile processing.** If every consumer reads entire tiles — a nightly DTM job, a classification rerun, a delivery to a client — the octree buys nothing and the conversion cost buys less. Tiles are also the only layout where a single file maps to a single unit of provenance, which matters when a client disputes one square kilometre of a delivery.

**EPT suits systems that own their storage and update in pieces.** Because each node is a separate object, rewriting one region means rewriting a handful of small files rather than a multi-gigabyte object. That is a real advantage for a dataset under continuous revision, and it is why several large public repositories publish EPT. The cost is operational: thousands of objects per dataset, a manifest that must stay consistent with them, and a copy operation that is a directory sync rather than a file transfer.

**COPC suits publication and interactive query.** One object, one URL, one checksum, one thing to sign or expire. A viewer can open it directly over HTTPS with no server-side component at all, which is the property that has made it the default for web delivery of point clouds. The weakness is the mirror image of EPT's strength: any change means rewriting the whole file, because the octree ordering is the file layout.

A useful rule of thumb: if the data changes more often than it is read, EPT; if it is read more often than it changes, COPC; if it is neither read interactively nor changed, leave it as tiles and spend the effort elsewhere.

## Level of Detail in Practice

The `resolution` option is not a quality knob in the photographic sense. It selects octree levels, and each level holds a spatially even sample of its subtree rather than a filtered or decimated copy. That distinction matters for two reasons.

First, a coarse read is representative of the whole extent. Forty thousand points read at ten-metre resolution are spread evenly across the region, so a map drawn from them looks like the scene. A naive decimation — every hundredth point in file order — would clump wherever the original write order clumped.

Second, a coarse read is not a valid input to a measurement. The sample is spatially even, not statistically complete: minimum elevations are missing, so a DTM built from it sits above the true surface, and density metrics computed on it are meaningless. The rule is that `resolution` is for display and for exploratory queries, and any product that will be measured against reality reads the levels it needs in full.

Both properties follow from the same design, and the second one catches people who use a coarse read to prototype a pipeline and then discover the numbers move when they run it properly.

<svg viewBox="0 0 720 264" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Point counts returned by the same COPC query at four resolution settings" style="width:100%;max-width:720px;display:block;margin:1.6rem auto">
  <title>What the resolution dial actually returns</title>
  <desc>The same one square kilometre query against a COPC file, at four resolution settings. At ten metres the reader returns 41 thousand points from the shallow octree levels. At two metres it returns 620 thousand. At half a metre, 4.1 million. Reading every level returns 18.4 million and transfers the whole region.</desc>
  <rect x="0" y="0" width="720" height="264" fill="var(--dg-bg)" rx="10"/>
  <text x="210" y="38" font-size="10.5" fill="var(--dg-muted)">the same query, four values of the resolution option</text>
  <text x="200" y="72" text-anchor="end" font-size="11.5" fill="var(--dg-text)">resolution 10.0</text>
  <rect x="210" y="54" width="14" height="28" rx="3" fill="var(--dg-d-soft)" stroke="var(--dg-d)" stroke-width="1.2"/>
  <text x="234" y="74" font-size="10.5" fill="var(--dg-muted)">41 K points · 2.1 MB · levels 0–2</text>
  <text x="200" y="122" text-anchor="end" font-size="11.5" fill="var(--dg-text)">resolution 2.0</text>
  <rect x="210" y="104" width="64" height="28" rx="3" fill="var(--dg-d-soft)" stroke="var(--dg-d)" stroke-width="1.2"/>
  <text x="284" y="124" font-size="10.5" fill="var(--dg-muted)">620 K points · 41 MB · levels 0–5</text>
  <text x="200" y="172" text-anchor="end" font-size="11.5" fill="var(--dg-text)">resolution 0.5</text>
  <rect x="210" y="154" width="200" height="28" rx="3" fill="var(--dg-c-soft)" stroke="var(--dg-c)" stroke-width="1.2"/>
  <text x="420" y="174" font-size="10.5" fill="var(--dg-muted)">4.1 M points · 172 MB · levels 0–7</text>
  <text x="200" y="222" text-anchor="end" font-size="11.5" fill="var(--dg-text)">unset — every level</text>
  <rect x="210" y="204" width="470" height="28" rx="3" fill="var(--dg-e-soft)" stroke="var(--dg-e)" stroke-width="1.2"/>
  <text x="445" y="224" text-anchor="middle" font-size="10.5" fill="var(--dg-text)">18.4 M points · 2.6 GB · the whole file</text>
  <text x="210" y="254" font-size="10.5" fill="var(--dg-muted)">a web map needs the first row; a terrain model needs the third; almost nothing needs the fourth</text>
</svg>

## Performance Tuning

**Conversion is a one-off cost worth measuring.** Building the octree takes roughly two to three times as long as a straight LAZ rewrite of the same tile, and it is CPU-bound, so it parallelises across tiles exactly like any other conversion — the [ProcessPoolExecutor pattern](https://www.pythonlidar.com/pdal-pipeline-architecture-execution/parallel-execution/parallel-tile-processing-with-processpoolexecutor/) applies unchanged.

**Bigger files are better, within reason.** A COPC file's advantage is that one object answers many queries. Converting 5,000 tiny tiles to 5,000 tiny COPC files preserves the tile problem. Merging a region into one multi-gigabyte COPC and letting the octree do the spatial work is usually the right shape.

**Set `resolution` on the reader, always.** A pipeline that reads a COPC file without specifying a resolution reads every level, which is the whole file plus the overhead of the index. The single most common performance complaint about COPC is a pipeline that forgot to ask for less.

**Tune the virtual filesystem for range reads.** Over `/vsis3/` the chunk size and directory-listing settings matter more than anything in the pipeline.

## Common Errors and Troubleshooting

**`writers.copc` rejects the input point format.** COPC requires format 6, 7 or 8. Convert with `minor_version: 4` and an appropriate `dataformat_id` first, or let the COPC writer handle it and accept that classification flags move.

**A bounded read returns more points than the bounds.** Expected. The reader fetches whole octree nodes, so points just outside the window arrive with them. Add a `filters.crop` after the reader when you need an exact clip.

**Reading is slow despite the index.** Either `resolution` was not set, or the virtual filesystem is issuing a directory listing per open. Both are configuration, not format, problems.

**The file works locally and fails over HTTP.** Almost always a server that does not honour range requests. Test with `curl -r 0-1023` against the object; if you get the whole file back, no client-side setting will help.

## Frequently Asked Questions

**What does COPC add to an ordinary LAZ file?**

An octree index and a chunk ordering that matches it, both stored inside the file. The index lives in a variable length record at the front and records each node byte range, so a client can fetch the header, read the index and then request exactly the ranges covering its area and level of detail.

**Can normal LAS software still read a COPC file?**

Yes — that is the design. A COPC file is valid LAZ 1.4 with point format 6, 7 or 8, so a reader that knows nothing about the octree opens it and reads every point in the ordinary way. The index is simply a record it ignores.

**When is EPT the better choice?**

When you need very fine-grained partial updates, or when your tooling already speaks EPT and the data never leaves one system. EPT transfers a similar number of bytes for a query but needs far more requests, and being a directory of thousands of files makes it harder to copy, checksum or hand to someone.

**Why is my COPC read no faster than reading the LAZ?**

Almost certainly because resolution was not set on the reader. Without it, readers.copc reads every octree level — the whole file plus the index. Setting resolution is what turns the format from a tidy layout into a level-of-detail query.

---

## Related

- [Point Cloud Data Standards and Fundamentals](https://www.pythonlidar.com/point-cloud-data-standards-fundamentals/) — the section this format belongs to
- [Converting LAZ Tiles to COPC with PDAL](https://www.pythonlidar.com/point-cloud-data-standards-fundamentals/copc-and-cloud-native-formats/converting-laz-tiles-to-copc-with-pdal/) — the conversion recipe, run over a whole directory
- [Querying a COPC File by Bounds and Resolution](https://www.pythonlidar.com/point-cloud-data-standards-fundamentals/copc-and-cloud-native-formats/querying-a-copc-file-by-bounds-and-resolution/) — reading only the nodes a question actually needs
- [COPC vs EPT for Web Delivery](https://www.pythonlidar.com/point-cloud-data-standards-fundamentals/copc-and-cloud-native-formats/copc-vs-ept-for-web-delivery/) — the comparison, with request counts and byte totals
- [LAS/LAZ File Structure](https://www.pythonlidar.com/point-cloud-data-standards-fundamentals/laslaz-file-structure/) — the chunked layout COPC builds its octree on
- [S3 and Cloud Storage I/O](https://www.pythonlidar.com/batch-automation-cloud-integration/s3-cloud-storage-io/) — the range-read settings that decide whether any of this is fast
