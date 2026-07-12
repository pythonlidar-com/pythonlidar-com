<p align="center">
  <a href="https://www.pythonlidar.com/">
    <img src="src/assets/img/og-image.png" alt="Python LiDAR & Point Cloud Workflows — PDAL pipelines and point cloud processing in Python" width="820">
  </a>
</p>

<h1 align="center">Python LiDAR &amp; Point Cloud Workflows</h1>

<p align="center">
  <strong>Code-first, production-grade guides for processing LiDAR and point clouds in Python.</strong><br>
  PDAL pipelines · ground filtering · DTM/DSM generation · batch &amp; cloud automation.
</p>

<p align="center">
  <a href="https://www.pythonlidar.com/">🌐 Live site — www.pythonlidar.com</a>
</p>

---

## What is this?

[**pythonlidar.com**](https://www.pythonlidar.com/) is a reference library for engineers who process airborne, terrestrial, and mobile LiDAR with Python. Every guide is built around **runnable code** — real PDAL pipeline JSON, typed Python functions with logging and error handling, realistic EPSG codes and parameter values — not editorial fluff. If you work with `.las`/`.laz` files, PDAL, GDAL, or laspy and need to ship reproducible workflows, this is written for you.

It is a fast, fully static site (no trackers, offline-capable) covering the whole practitioner workflow: **ingest → validate → filter → classify → rasterize → automate**.

## Who it's for

- **LiDAR analysts** turning raw scans into deliverables
- **Python GIS developers** building reproducible geospatial pipelines
- **Surveying &amp; mapping tech teams** standardizing point cloud processing
- **Infrastructure &amp; urban-planning engineers** generating terrain models at scale

## What it covers

The material is organized into four focused tracks:

| Track | What you'll learn |
|---|---|
| [**PDAL Pipelines**](https://www.pythonlidar.com/pdal-pipeline-architecture-execution/) | Pipeline architecture and the streaming execution model, stage chaining, filtering logic, spatial reprojection, attribute mapping, parallel execution, memory management, and pipeline validation. |
| [**Point Cloud Standards**](https://www.pythonlidar.com/point-cloud-data-standards-fundamentals/) | LAS/LAZ binary structure, ASPRS classification codes, coordinate reference systems, point density metrics, and metadata/header integrity. |
| [**Ground &amp; Terrain Models**](https://www.pythonlidar.com/ground-filtering-dtm-dsm-generation/) | SMRF and PMF ground classification, DTM and DSM raster generation with `writers.gdal`, interpolation choices, NoData void filling, and hillshade/slope/aspect derivation. |
| [**Batch &amp; Cloud Automation**](https://www.pythonlidar.com/batch-automation-cloud-integration/) | Containerized PDAL with Docker, AWS Batch tile fan-out, streaming LAZ and Cloud-Optimized GeoTIFF I/O against Amazon S3, and Apache Airflow DAG orchestration. |

Each guide includes a hand-authored diagram, a copy-paste-ready working example, parameter reference tables, verification steps, and a troubleshooting section for the errors you actually hit in production.

## Highlights

- ✅ **Runnable PDAL &amp; Python** — every pipeline JSON is `pdal pipeline --validate`-clean, every script is self-contained.
- ✅ **Real parameters** — actual EPSG codes, typical SMRF slope/window values, real LAS dimension names.
- ✅ **Accessible &amp; fast** — WCAG 2 AA, mobile-first, Lighthouse-budgeted, works offline.
- ✅ **Structured data** — `Article`, `HowTo`, `FAQPage`, and `BreadcrumbList` on every page.

## Tech stack

- **[Eleventy (11ty)](https://www.11ty.dev/)** static site generator
- Hand-authored inline SVG diagrams (theme-aware, no runtime)
- Deployed on **[Cloudflare Pages](https://pages.cloudflare.com/)**

```bash
npm install      # install dependencies
npm run build    # build to _site/
npm run serve    # local dev server on :8080
```

## Links

- 🌐 **Website:** https://www.pythonlidar.com
- 🧭 **Start here:** https://www.pythonlidar.com/#start-here

---

<p align="center"><sub>Built for LiDAR analysts, Python GIS developers, and surveying teams.</sub></p>
