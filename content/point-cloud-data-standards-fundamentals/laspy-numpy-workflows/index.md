---
title: "laspy and NumPy Workflows for LAS Data"
description: "Work with LAS and LAZ directly in Python using laspy 2.x and NumPy: scaled coordinates, point formats and extra bytes, chunked reading for large files, writing new files from arrays, COPC queries, and when to use laspy instead of PDAL."
slug: "laspy-numpy-workflows"
type: "topic"
breadcrumb: "laspy and NumPy Workflows"
datePublished: "2026-09-18"
dateModified: "2026-09-18"
---

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Article",
      "headline": "laspy and NumPy Workflows for LAS Data",
      "description": "Work with LAS and LAZ directly in Python using laspy 2.x and NumPy: scaled coordinates, point formats and extra bytes, chunked reading for large files, writing new files from arrays, COPC queries, and when to use laspy instead of PDAL.",
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
          "name": "Point Cloud Data Standards & Fundamentals",
          "item": "https://www.pythonlidar.com/point-cloud-data-standards-fundamentals/"
        },
        {
          "@type": "ListItem",
          "position": 3,
          "name": "laspy and NumPy Workflows",
          "item": "https://www.pythonlidar.com/point-cloud-data-standards-fundamentals/laspy-numpy-workflows/"
        }
      ]
    },
    {
      "@type": "HowTo",
      "name": "Read, process and write LAS data with laspy and NumPy",
      "step": [
        {
          "@type": "HowToStep",
          "name": "Open lazily",
          "text": "laspy.open(path) reads the header without points, so you can check format, count and bounds before committing memory."
        },
        {
          "@type": "HowToStep",
          "name": "Choose a read mode",
          "text": "laspy.read for files that fit in memory; open(...).chunk_iterator(n) for anything large."
        },
        {
          "@type": "HowToStep",
          "name": "Work in NumPy",
          "text": "Scaled coordinates (las.x) are float arrays; attributes (las.classification) are integer arrays. Boolean masks select subsets without loops."
        },
        {
          "@type": "HowToStep",
          "name": "Add or change dimensions",
          "text": "Assign to existing fields, or register new ones with add_extra_dim before assigning."
        },
        {
          "@type": "HowToStep",
          "name": "Write deliberately",
          "text": "Choose version, point format, scales and offsets on a new header, or reuse the source header when the output is a filtered copy."
        },
        {
          "@type": "HowToStep",
          "name": "Hand off to PDAL when needed",
          "text": "Pass arrays into a PDAL pipeline for neighbourhood filters, rasterization or reprojection, and bring results back."
        }
      ]
    },
    {
      "@type": "FAQPage",
      "mainEntity": [
        {
          "@type": "Question",
          "name": "Should I use laspy or PDAL?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Use laspy for direct, array-level work on LAS files: headers, per-point arithmetic, writing arrays and quick inspection. Use PDAL for multi-stage processing, neighbourhood filters, reprojection and rasterization. Many workflows use both, passing arrays between them."
          }
        },
        {
          "@type": "Question",
          "name": "How do I read a LAZ file with laspy?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Install laspy with a LAZ backend, for example the lazrs extra, then call laspy.read on the file. Compression is handled transparently; the API is the same for LAS and LAZ."
          }
        },
        {
          "@type": "Question",
          "name": "How do I process a LAS file too large for memory?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Open it with laspy.open and iterate with chunk_iterator, processing a fixed number of points at a time and writing each processed chunk to an open writer. Memory stays bounded by the chunk size."
          }
        },
        {
          "@type": "Question",
          "name": "How do I add a new dimension to a LAS file with laspy?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Register it as an extra dimension with add_extra_dim, giving a name and a NumPy type, then assign values to the new field and write the file. The dimension is stored in the extra-bytes record and read back by name by laspy, PDAL and most LAS-aware software."
          }
        },
        {
          "@type": "Question",
          "name": "Can laspy read COPC files from a URL?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Yes. laspy's CopcReader opens COPC files over HTTP when the requests package is installed, and its query method fetches only the octree nodes intersecting a bounding box, optionally limited to a resolution. That makes it a lightweight way to pull small areas out of large cloud-hosted datasets."
          }
        },
        {
          "@type": "Question",
          "name": "Does laspy handle coordinate reference systems?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "It reads and writes the CRS records in the header and can return them as a pyproj CRS object through parse_crs. It does not reproject coordinates; use pyproj on the arrays, or PDAL's reprojection filter, for that."
          }
        },
        {
          "@type": "Question",
          "name": "Why are there both las.x and las.X?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "LAS stores coordinates as scaled integers. The upper-case fields are the raw integers as stored; the lower-case ones are floats with scale and offset applied, which is what you normally want for calculations."
          }
        }
      ]
    }
  ]
}
</script>

PDAL is the right tool for pipelines, but a great deal of everyday LiDAR work is smaller and more ad hoc: count returns by class in a file a client sent, fix a header field, add a dimension computed by a model, convert an array from a photogrammetry tool into a LAS file, or explore a tile in a notebook. For that work, laspy — a pure-Python LAS/LAZ library built on NumPy — is often simpler. It reads a file into NumPy-backed arrays in one call, exposes header fields as attributes, writes new files from arrays, and handles LAZ through the `lazrs` or `laszip` backends. This topic in the [Point Cloud Data Standards and Fundamentals](https://www.pythonlidar.com/point-cloud-data-standards-fundamentals/) section covers the laspy data model, the patterns that keep memory bounded on large files, and how to combine laspy with PDAL rather than choosing one.

<svg viewBox="0 0 740 220" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="The laspy data model: header, VLRs and point records as NumPy arrays" style="width:100%;max-width:740px;display:block;margin:1.6rem auto">
  <title>What laspy.read gives you</title>
  <desc>A LasData object with three parts. The header holds version, point format, point count, scales, offsets and bounds. The VLR list holds the CRS and extra-bytes descriptions. The points are a record array whose fields — x, y, z as scaled floats, and X, Y, Z as raw integers, plus intensity, classification and others — are NumPy arrays that can be sliced and masked directly.</desc>
  <rect x="0" y="0" width="740" height="220" fill="var(--dg-bg)" rx="10"/>
  <rect x="20" y="20" width="700" height="186" rx="12" fill="var(--dg-surface)" stroke="var(--dg-line)" stroke-width="1.3"/>
  <text x="40" y="44" font-size="12" font-weight="600" fill="var(--dg-text)">las = laspy.read("tile.laz")</text>
  <rect x="40" y="58" width="200" height="130" rx="8" fill="var(--dg-a-soft)" stroke="var(--dg-a)" stroke-width="1.2"/>
  <text x="140" y="80" text-anchor="middle" font-size="11" font-weight="600" fill="var(--dg-text)">las.header</text>
  <text x="56" y="104" font-size="10" fill="var(--dg-text)">version, point_format</text>
  <text x="56" y="124" font-size="10" fill="var(--dg-text)">point_count</text>
  <text x="56" y="144" font-size="10" fill="var(--dg-text)">scales, offsets</text>
  <text x="56" y="164" font-size="10" fill="var(--dg-text)">mins, maxs</text>
  <rect x="260" y="58" width="180" height="130" rx="8" fill="var(--dg-b-soft)" stroke="var(--dg-b)" stroke-width="1.2"/>
  <text x="350" y="80" text-anchor="middle" font-size="11" font-weight="600" fill="var(--dg-text)">las.header.vlrs</text>
  <text x="276" y="104" font-size="10" fill="var(--dg-text)">WKT CRS (2112)</text>
  <text x="276" y="124" font-size="10" fill="var(--dg-text)">extra bytes (4)</text>
  <text x="276" y="144" font-size="10" fill="var(--dg-text)">vendor records</text>
  <rect x="460" y="58" width="240" height="130" rx="8" fill="var(--dg-d-soft)" stroke="var(--dg-d)" stroke-width="1.2"/>
  <text x="580" y="80" text-anchor="middle" font-size="11" font-weight="600" fill="var(--dg-text)">las.points (NumPy)</text>
  <text x="476" y="104" font-size="10" fill="var(--dg-text)">las.x, las.y, las.z (scaled)</text>
  <text x="476" y="124" font-size="10" fill="var(--dg-text)">las.X, las.Y, las.Z (int32)</text>
  <text x="476" y="144" font-size="10" fill="var(--dg-text)">intensity, classification, …</text>
  <text x="476" y="164" font-size="10" fill="var(--dg-text)">extra dims by name</text>
</svg>

## Prerequisites

- **Python 3.10+** with **laspy 2.4+** and NumPy. Install LAZ support with `pip install "laspy[lazrs]"` (Rust-based, no system dependencies) or `laspy[laszip]`.
- **Familiarity with LAS structure**: header, VLRs, point data record formats; see [LAS/LAZ file structure](https://www.pythonlidar.com/point-cloud-data-standards-fundamentals/laslaz-file-structure/).
- **Memory awareness.** `laspy.read` loads every point. A 50-million-point PDRF 6 file needs roughly 1.5 GB for raw records plus whatever arrays you derive.
- **Optionally PDAL** for the heavy processing steps, and pyproj for CRS handling.
- **A test file**: any LAZ from a public LiDAR programme is enough; small files make experimentation quick.

## Core Workflow Architecture

1. **Open lazily.** `laspy.open(path)` reads the header without points, so you can check format, count and bounds before committing memory.
2. **Choose a read mode.** `laspy.read` for files that fit in memory; `open(...).chunk_iterator(n)` for anything large.
3. **Work in NumPy.** Scaled coordinates (`las.x`) are float arrays; attributes (`las.classification`) are integer arrays. Boolean masks select subsets without loops.
4. **Add or change dimensions.** Assign to existing fields, or register new ones with `add_extra_dim` before assigning.
5. **Write deliberately.** Choose version, point format, scales and offsets on a new header, or reuse the source header when the output is a filtered copy.
6. **Hand off to PDAL when needed.** Pass arrays into a PDAL pipeline for neighbourhood filters, rasterization or reprojection, and bring results back.

## Full Implementation

A utility that summarizes a LAS/LAZ file, filters it by class and height, adds a computed dimension, and writes the result — choosing whole-file or chunked processing automatically:

```python
"""laspy utility: summarize, filter, add a dimension, write — bounded memory."""
from __future__ import annotations

import copy
import logging
from pathlib import Path

import laspy
import numpy as np

log = logging.getLogger("lasx")
CHUNK = 2_000_000


def summarize(path: Path) -> dict:
    with laspy.open(path) as f:
        h = f.header
        return {
            "version": f"{h.version.major}.{h.version.minor}",
            "point_format": h.point_format.id,
            "points": h.point_count,
            "scales": tuple(h.scales), "offsets": tuple(h.offsets),
            "mins": tuple(np.round(h.mins, 3)), "maxs": tuple(np.round(h.maxs, 3)),
            "extra_dims": list(h.point_format.extra_dimension_names),
            "crs": (h.parse_crs().to_string() if h.parse_crs() else None),
        }


def output_header(src_header: laspy.LasHeader) -> laspy.LasHeader:
    """Same format, scales, offsets and VLRs as the source, plus one new extra dimension."""
    header = copy.deepcopy(src_header)
    if "height_above_datum" not in header.point_format.extra_dimension_names:
        header.add_extra_dim(laspy.ExtraBytesParams(
            name="height_above_datum", type=np.float32, description="Z minus reference"))
    return header


def filter_and_tag(src: Path, dst: Path, ground_z: float = 0.0) -> int:
    written = 0
    with laspy.open(src) as reader:
        out_header = output_header(reader.header)
        with laspy.open(dst, mode="w", header=out_header) as writer:
            for chunk in reader.chunk_iterator(CHUNK):
                keep = (chunk.classification != 7) & (chunk.classification != 18)
                src_pts = chunk[keep]
                out = laspy.ScaleAwarePointRecord.zeros(len(src_pts), header=out_header)
                for name in src_pts.point_format.dimension_names:
                    out[name] = src_pts[name]          # raw values; scales and offsets match
                out.height_above_datum = (np.asarray(src_pts.z) - ground_z).astype(np.float32)
                writer.write_points(out)
                written += len(out)
    log.info("%s: %d points written", dst.name, written)
    return written


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    src = Path("tiles/t_0431.laz")
    print(summarize(src))
    filter_and_tag(src, Path("out/t_0431_tagged.laz"), ground_z=200.0)
```

## Code Breakdown

**`laspy.open` before `laspy.read`.** Opening reads only the header and VLRs, which is instant for any file size. The summary comes from it, and the processing function never calls `laspy.read` at all, so a 4 GB file is never loaded by accident.

**One code path for every file size.** `chunk_iterator` works for a 10,000-point file (one chunk) and a 400-million-point file (two hundred chunks) alike. Having a separate whole-file branch for small files is tempting and doubles the code that must be tested; the chunked path costs almost nothing extra on small inputs.

**`parse_crs()`.** laspy reads the CRS from the WKT VLR (LAS 1.4) or GeoTIFF keys (older files) and returns a pyproj CRS. It returns `None` for files without one — a common case worth reporting explicitly.

**A copied header with one addition.** In laspy 2.x the point format defines the record layout. Deep-copying the source header keeps its format, scales, offsets, CRS and any existing extra bytes; registering `height_above_datum` on the copy means every record written has that field. Modifying the reader's own header instead would make laspy try to parse bytes the source file does not contain.

**Masking with NumPy.** `chunk[keep]` returns a new record with only the kept points — no loops, no copies of unrelated data. Every attribute (`classification`, `intensity`, extra dims) is a NumPy array with the same length.

**Copying fields by name into a zeroed output record.** `ScaleAwarePointRecord.zeros` creates records in the output format; looping over the *source* format's dimension names copies every existing field, including raw `X`, `Y`, `Z` integers, which is exact because scales and offsets are unchanged. Only the new field needs computing.

**Scaled versus raw coordinates.** `pts.z` is a float array computed from the stored integers with scale and offset; `pts.Z` is the raw `int32`. Arithmetic belongs on the scaled values; writing back through the scaled property lets laspy re-quantize with the header's scale.

**Writer opened once, fed per chunk.** The writer accumulates points and fixes up the header's count and bounds on close, so the output is valid however many chunks were written. The same pattern driven by PDAL instead of laspy is shown in [iterating PDAL arrays in chunks](https://www.pythonlidar.com/pdal-pipeline-architecture-execution/streaming-mode-execution/iterating-pdal-arrays-in-chunks-from-python/).

<svg viewBox="0 0 740 200" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Chunks read, filtered, extended and written with constant memory" style="width:100%;max-width:740px;display:block;margin:1.6rem auto">
  <title>One chunk in flight at a time</title>
  <desc>A reader on the left yields chunks of two million points. Each chunk is masked to drop noise, copied into a zeroed record in the output format, given the new height field, and handed to an open writer on the right. Memory holds one chunk and its output copy at any moment, regardless of file size.</desc>
  <defs><marker id="lx-arw" markerWidth="9" markerHeight="7" refX="9" refY="3.5" orient="auto"><path d="M0,0 L0,7 L9,3.5 z" fill="var(--dg-line)"/></marker></defs>
  <rect x="0" y="0" width="740" height="200" fill="var(--dg-bg)" rx="10"/>
  <g font-size="10.5" fill="var(--dg-text)">
    <rect x="16" y="70" width="110" height="50" rx="8" fill="var(--dg-surface)" stroke="var(--dg-line)"/><text text-anchor="middle" x="71" y="92">reader</text><text text-anchor="middle" x="71" y="108">chunk_iterator</text>
    <rect x="156" y="70" width="110" height="50" rx="8" fill="var(--dg-a-soft)" stroke="var(--dg-a)"/><text text-anchor="middle" x="211" y="92">mask</text><text text-anchor="middle" x="211" y="108">drop 7, 18</text>
    <rect x="296" y="70" width="130" height="50" rx="8" fill="var(--dg-b-soft)" stroke="var(--dg-b)"/><text text-anchor="middle" x="361" y="92">zeros(out format)</text><text text-anchor="middle" x="361" y="108">copy fields</text>
    <rect x="456" y="70" width="120" height="50" rx="8" fill="var(--dg-c-soft)" stroke="var(--dg-c)"/><text text-anchor="middle" x="516" y="92">compute</text><text text-anchor="middle" x="516" y="108">new field</text>
    <rect x="606" y="70" width="118" height="50" rx="8" fill="var(--dg-d-soft)" stroke="var(--dg-d)"/><text text-anchor="middle" x="665" y="92">writer</text><text text-anchor="middle" x="665" y="108">write_points</text>
  </g>
  <line x1="126" y1="95" x2="152" y2="95" stroke="var(--dg-line)" stroke-width="1.3" marker-end="url(#lx-arw)"/>
  <line x1="266" y1="95" x2="292" y2="95" stroke="var(--dg-line)" stroke-width="1.3" marker-end="url(#lx-arw)"/>
  <line x1="426" y1="95" x2="452" y2="95" stroke="var(--dg-line)" stroke-width="1.3" marker-end="url(#lx-arw)"/>
  <line x1="576" y1="95" x2="602" y2="95" stroke="var(--dg-line)" stroke-width="1.3" marker-end="url(#lx-arw)"/>
  <path d="M665 124 L665 160 L71 160 L71 124" fill="none" stroke="var(--dg-line-soft)" stroke-width="1.3" stroke-dasharray="5 4" marker-end="url(#lx-arw)"/>
  <text x="368" y="180" text-anchor="middle" font-size="10.5" fill="var(--dg-muted)">next chunk — memory stays at one chunk plus its copy</text>
  <text x="16" y="40" font-size="10.5" fill="var(--dg-muted)">2,000,000 points per chunk ≈ 60–90 MB for PDRF 6 with one extra dimension</text>
</svg>

## Working with Point Formats and Extra Bytes

Most surprises in laspy code come from the point format. The format ID fixes which standard fields exist: formats 0–5 are the legacy LAS 1.2-era layouts with a 5-bit classification and a combined flags byte; formats 6–10 are the LAS 1.4 layouts with an 8-bit classification, a separate classification-flags byte, a finer scan angle and mandatory GPS time. Formats 2, 3, 5, 7, 8 and 10 add colour, 8 and 10 add near-infrared, and 4, 5, 9 and 10 add waveform packet fields. laspy exposes whichever fields the format holds under the same names, so code written against `las.classification` works on both families — but values above 31 cannot be stored in formats 0–5.

Extra bytes are how LAS 1.4 carries anything else: a height above ground, a segment ID, a model score. They are declared in an extra-bytes VLR with a name, a type and optional scale, offset and description, and laspy reads them back as named fields. Two practical rules follow. Give extra dimensions stable, descriptive names — downstream software will look them up by name — and choose the smallest type that holds the values, since every extra byte is multiplied by the point count. A `float32` height costs 4 bytes per point; a `float64` costs 8 and rarely adds useful precision.

When a file needs a different format — to add colour, or to move from 1.2 to 1.4 — `laspy.convert` builds a new `LasData` in the target format, copying every field that exists in both. Fields that do not exist in the target are dropped silently, so check what you are converting away; the dedicated guide on [upgrading LAS 1.2 files to LAS 1.4](https://www.pythonlidar.com/point-cloud-data-standards-fundamentals/laslaz-file-structure/upgrading-las-1-2-files-to-las-1-4/) covers the classification and GPS-time details.

## Parameter Reference Table

| API | Returns | Memory | Use for |
|---|---|---|---|
| `laspy.open(p)` | reader with header | header only | Summaries, deciding how to read |
| `laspy.read(p)` | `LasData` | all points | Files that fit comfortably in RAM |
| `reader.chunk_iterator(n)` | point records | n points | Large files, streaming statistics |
| `laspy.open(p, mode="w", header=h)` | writer | per write | Writing incrementally |
| `laspy.open(p, mode="a")` | appender | per write | Appending to LAS (not LAZ) |
| `header.add_extra_dim(...)` | — | — | New named dimensions |
| `laspy.convert(las, point_format_id=6)` | `LasData` | all points | Changing point format or version |
| `laspy.CopcReader.open(p).query(...)` | point records | query result | Spatial queries on COPC |

<svg viewBox="0 0 740 220" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Decision guide for choosing laspy or PDAL" style="width:100%;max-width:740px;display:block;margin:1.6rem auto">
  <title>laspy or PDAL?</title>
  <desc>Two columns of tasks. Tasks suited to laspy: reading headers, per-point NumPy arithmetic, fixing header fields, writing arrays to LAS, notebooks and quick checks. Tasks suited to PDAL: neighbourhood filters such as SMRF and outlier removal, reprojection, rasterization, streaming large files through many stages, and cloud readers and writers. A middle band notes that arrays pass freely between the two.</desc>
  <rect x="0" y="0" width="740" height="220" fill="var(--dg-bg)" rx="10"/>
  <rect x="20" y="20" width="300" height="180" rx="10" fill="var(--dg-a-soft)" stroke="var(--dg-a)" stroke-width="1.3"/>
  <text x="170" y="44" text-anchor="middle" font-size="12" font-weight="600" fill="var(--dg-text)">laspy</text>
  <text x="40" y="72" font-size="10.5" fill="var(--dg-text)">read and edit headers, VLRs</text>
  <text x="40" y="96" font-size="10.5" fill="var(--dg-text)">per-point NumPy arithmetic</text>
  <text x="40" y="120" font-size="10.5" fill="var(--dg-text)">write arrays to LAS/LAZ</text>
  <text x="40" y="144" font-size="10.5" fill="var(--dg-text)">notebooks, quick checks</text>
  <text x="40" y="168" font-size="10.5" fill="var(--dg-text)">no compiled dependencies</text>
  <rect x="420" y="20" width="300" height="180" rx="10" fill="var(--dg-b-soft)" stroke="var(--dg-b)" stroke-width="1.3"/>
  <text x="570" y="44" text-anchor="middle" font-size="12" font-weight="600" fill="var(--dg-text)">PDAL</text>
  <text x="440" y="72" font-size="10.5" fill="var(--dg-text)">SMRF, outlier, HAG, features</text>
  <text x="440" y="96" font-size="10.5" fill="var(--dg-text)">reprojection with PROJ</text>
  <text x="440" y="120" font-size="10.5" fill="var(--dg-text)">rasterization to GeoTIFF</text>
  <text x="440" y="144" font-size="10.5" fill="var(--dg-text)">streaming multi-stage pipelines</text>
  <text x="440" y="168" font-size="10.5" fill="var(--dg-text)">cloud readers and writers</text>
  <text x="370" y="104" text-anchor="middle" font-size="16" fill="var(--dg-muted)">⇄</text>
  <text x="370" y="128" text-anchor="middle" font-size="10" fill="var(--dg-muted)">arrays</text>
</svg>

## Validation and Integrity Checks

**Round trip.** Read a file, write it back with the same header, and compare: point count, bounds and every standard field must be identical. It is the quickest way to catch a scale or offset mistake in custom writing code.

```python
a = laspy.read("tiles/t_0431.laz")
a.write("out/roundtrip.laz")
b = laspy.read("out/roundtrip.laz")
assert a.header.point_count == b.header.point_count
for dim in ("X", "Y", "Z", "intensity", "classification", "return_number"):
    assert np.array_equal(a[dim], b[dim]), dim
```

**Header consistency.** After filtering, the written header's counts and bounds must match the points. laspy updates them when writing; `las.update_header()` refreshes them on an in-memory object. See [repairing stale LAS header bounds and counts](https://www.pythonlidar.com/point-cloud-data-standards-fundamentals/metadata-header-sync/repairing-stale-las-header-bounds-and-counts/).

**Extra-dimension presence.** Reopen the output and assert the new dimension is listed in `point_format.extra_dimension_names` with the intended type.

## Performance Tuning

laspy's cost is dominated by LAZ decompression and by NumPy work on large arrays.

- **Choose the backend.** `lazrs` supports parallel decompression; `laspy.read(path, laz_backend=laspy.LazBackend.LazrsParallel)` uses multiple cores for large LAZ files.
- **Read only what you need.** For statistics, iterate chunks and accumulate rather than reading whole files.
- **Avoid Python loops.** Anything written as `for p in points` is thousands of times slower than the equivalent mask or vectorized expression.
- **Keep integer fields integer.** Converting classification or intensity to float for comparisons wastes memory; compare integers directly.
- **Let PDAL do neighbourhood work.** Spatial indexes, ground filters and rasterization are faster and better tested in PDAL; pass arrays across rather than reimplementing them.

## Common Errors and Troubleshooting

**`LaspyException: No LazBackend selected, cannot decompress data`.** laspy was installed without a LAZ backend. Install `laspy[lazrs]`.

**Coordinates look like huge integers.** You read `las.X` (raw) instead of `las.x` (scaled). The two differ by the header's scale and offset.

**`ValueError` assigning to a new field.** The dimension is not registered in the point format. Call `add_extra_dim` on the header (or on `LasData`) first.

**Values change slightly after writing.** Scaled coordinates are re-quantized with the header scale. With a scale of 0.01, values are stored to the nearest centimetre; choose a finer scale if you need more.

**Writing an array to a different point format drops fields.** Converting from PDRF 7 to 6 removes RGB. Use `laspy.convert` deliberately and check which fields the target format holds.

## Frequently Asked Questions

**Should I use laspy or PDAL?**

Use laspy for direct, array-level work on LAS files: headers, per-point arithmetic, writing arrays and quick inspection. Use PDAL for multi-stage processing, neighbourhood filters, reprojection and rasterization. Many workflows use both, passing arrays between them.

**How do I read a LAZ file with laspy?**

Install laspy with a LAZ backend, for example the lazrs extra, then call laspy.read on the file. Compression is handled transparently; the API is the same for LAS and LAZ.

**How do I process a LAS file too large for memory?**

Open it with laspy.open and iterate with chunk_iterator, processing a fixed number of points at a time and writing each processed chunk to an open writer. Memory stays bounded by the chunk size.

**How do I add a new dimension to a LAS file with laspy?**

Register it as an extra dimension with add_extra_dim, giving a name and a NumPy type, then assign values to the new field and write the file. The dimension is stored in the extra-bytes record and read back by name by laspy, PDAL and most LAS-aware software.

**Can laspy read COPC files from a URL?**

Yes. laspy's CopcReader opens COPC files over HTTP when the requests package is installed, and its query method fetches only the octree nodes intersecting a bounding box, optionally limited to a resolution. That makes it a lightweight way to pull small areas out of large cloud-hosted datasets.

**Does laspy handle coordinate reference systems?**

It reads and writes the CRS records in the header and can return them as a pyproj CRS object through parse_crs. It does not reproject coordinates; use pyproj on the arrays, or PDAL's reprojection filter, for that.

**Why are there both las.x and las.X?**

LAS stores coordinates as scaled integers. The upper-case fields are the raw integers as stored; the lower-case ones are floats with scale and offset applied, which is what you normally want for calculations.

## Related

- [Reading LAS into NumPy with laspy](https://www.pythonlidar.com/point-cloud-data-standards-fundamentals/laspy-numpy-workflows/reading-las-into-numpy-with-laspy/) — the basics of the data model
- [Chunked Reading of Large LAS Files with laspy](https://www.pythonlidar.com/point-cloud-data-standards-fundamentals/laspy-numpy-workflows/chunked-reading-of-large-las-files-with-laspy/) — bounded-memory processing
- [Writing a LAS File from NumPy Arrays](https://www.pythonlidar.com/point-cloud-data-standards-fundamentals/laspy-numpy-workflows/writing-a-las-file-from-numpy-arrays/) — headers, scales and offsets
- [laspy vs PDAL: When to Use Which](https://www.pythonlidar.com/point-cloud-data-standards-fundamentals/laspy-numpy-workflows/laspy-vs-pdal-when-to-use-which/) — choosing the tool
- [How to Parse LAS Headers with Python](https://www.pythonlidar.com/point-cloud-data-standards-fundamentals/laslaz-file-structure/how-to-parse-las-headers-with-python/) — the binary layout underneath
