# Optimizing PDAL for Multi-Core Processing

To optimize PDAL for multi-core processing, configure the `threads` directive in your pipeline JSON, export `PDAL_THREADS` to match your physical core count, and design workflows around spatially partitioned chunking. PDAL’s parallel execution relies on OpenMP and a stage-level work-stealing scheduler, meaning maximum throughput depends on balancing thread allocation against memory bandwidth and disk I/O. In Python, instantiate `pdal.Pipeline` with explicit threading options, avoid full-dataset memory loads, and process LAS/LAZ files in bounded chunks to prevent cache thrashing and thread starvation.

## Core Threading Strategy

PDAL does not use a single global thread pool. Instead, it distributes work per stage, allowing you to tune parallelism based on computational intensity. Follow these baseline rules for production deployments:

- **Set `PDAL_THREADS` to physical cores only.** Hyperthreading (logical cores) rarely improves PDAL throughput and often degrades it due to memory contention.
- **Use `chunk_size` aggressively.** I/O-bound readers and writers scale best when point batches fit within L3 cache (~500k–2M points per chunk, depending on schema).
- **Isolate compute-heavy filters.** Ground classification (`filters.smrf`), outlier removal, and TIN generation scale linearly with thread count until memory bandwidth saturates.
- **Avoid mixing heavy I/O and heavy compute in the same stage chain.** Pipeline throughput is gated by the slowest stage; decouple them when possible.

## Pipeline Architecture & Stage-Level Parallelism

PDAL’s execution model is fundamentally stage-driven. When you design a workflow for [Parallel Execution](/pdal-pipeline-architecture-execution/parallel-execution/), the framework routes point batches through a directed acyclic graph where each stage can spawn its own worker threads. This architecture means you can safely over-provision threads on lightweight geometric operations (e.g., coordinate transforms, attribute assignments) without starving memory-intensive stages.

The underlying scheduler uses OpenMP for parallel loops and a custom thread pool for inter-stage buffer handoffs. Understanding how [PDAL Pipeline Architecture & Execution](/pdal-pipeline-architecture-execution/) manages data flow is critical: threads are allocated per stage, not globally. If a `writers.las` stage blocks waiting for disk flush, upstream compute stages will continue processing until their output buffers fill. Improper chunk sizing or mismatched thread counts at this boundary causes backpressure, effectively serializing your pipeline despite multi-core availability.

For authoritative reference on stage configuration and JSON schema validation, consult the official [PDAL Pipeline Documentation](https://pdal.io/pipeline.html).

## Python Implementation & Explicit Control

Python developers interact with PDAL through the `pdal` bindings. The native API provides direct control over thread allocation, chunk boundaries, and execution flow. Below is a production-ready pattern that configures multi-core processing, enforces memory-safe chunking, and applies a ground classification filter.

```python
import pdal
import json
import os
import multiprocessing

def run_multicore_pipeline(input_path: str, output_path: str, thread_count: int = None) -> dict:
    # Default to physical cores; avoid logical/hyperthreaded cores
    if thread_count is None:
        thread_count = multiprocessing.cpu_count() // 2 if multiprocessing.cpu_count() > 4 else multiprocessing.cpu_count()

    pipeline_def = {
        "pipeline": [
            {
                "type": "readers.las",
                "filename": input_path,
                "chunk_size": 1000000,
                "threads": thread_count
            },
            {
                "type": "filters.smrf",
                "slope": 0.15,
                "window": 18.0,
                "elevation": 0.5,
                "threshold": 0.5,
                "threads": thread_count
            },
            {
                "type": "writers.las",
                "filename": output_path,
                "minor_version": 4,
                "dataformat_id": 3,
                "threads": thread_count
            }
        ],
        "threads": thread_count
    }

    pipeline = pdal.Pipeline(json.dumps(pipeline_def))
    count = pipeline.execute()

    if count == 0:
        raise RuntimeError("Pipeline execution failed. Check PDAL logs and input file integrity.")

    return {"points_processed": count, "threads_used": thread_count}

# Example usage
# result = run_multicore_pipeline("input.las", "output_classified.las")
```

**Key implementation notes:**
- The `threads` key at the pipeline root sets a default for all stages. Stage-level overrides allow fine-grained control.
- `pdal.Pipeline.execute()` is synchronous. For true asynchronous orchestration of multiple independent pipelines, wrap calls in `concurrent.futures.ProcessPoolExecutor` rather than relying on internal threading.
- Always validate LAS/LAZ schema compatibility before execution to avoid silent point drops during parallel writes.

## I/O & Chunking Optimization

Disk throughput is the most common bottleneck in multi-core PDAL workflows. Parallel threads compete for the same storage controller, and unbounded chunking triggers excessive page faults.

| Chunk Size | Best Use Case | Memory Impact | Thread Scaling |
|------------|---------------|---------------|----------------|
| 250k–500k | High-density TLS/MLS scans | Low (fits L2/L3 cache) | Excellent for compute filters |
| 1M–2M | Standard aerial LiDAR | Moderate | Optimal for I/O-bound readers/writers |
| >5M | Regional mosaics | High (risk of OOM) | Diminishing returns; disk-bound |

To maximize throughput:
1. **Pre-partition spatially.** Use `filters.splitter` or `filters.hexbin` to distribute work across independent pipeline runs.
2. **Align chunk boundaries to file blocks.** LAS files store points in contiguous records; chunk sizes that align with 4KB/8KB filesystem blocks reduce read amplification.
3. **Use LAZ compression cautiously.** Parallel decompression adds CPU overhead. For multi-core tuning, test uncompressed LAS vs LAZ on your specific storage medium.

## Thread Tuning & Production Best Practices

Optimizing PDAL for multi-core processing requires iterative profiling. Start with `PDAL_THREADS` set to your physical core count, then adjust based on workload characteristics:

- **Monitor thread saturation.** Use `htop` or `perf` to verify CPU utilization. If threads spend >30% time in `wait` or `iowait`, reduce thread count and increase chunk size.
- **Disable hyperthreading in BIOS for dedicated processing nodes.** PDAL’s OpenMP loops are memory-bandwidth bound; logical cores share execution units and L1/L2 caches, causing contention.
- **Set `OMP_NUM_THREADS` explicitly.** PDAL respects OpenMP environment variables. Export `OMP_NUM_THREADS=$PDAL_THREADS` to prevent nested parallelism from spawning excess workers.
- **Avoid global Python locks.** The `pdal` bindings release the GIL during `execute()`, but custom Python callbacks or post-processing steps will serialize execution. Keep Python-side logic outside the pipeline loop.

For deeper OpenMP tuning guidance, refer to the [OpenMP Architecture Review Board Specifications](https://www.openmp.org/specifications/), which detail thread affinity, scheduling policies, and memory hierarchy optimization strategies applicable to PDAL’s parallel runtime.

When deployed correctly, a tuned PDAL pipeline processes 100M+ point aerial surveys in minutes rather than hours, scales predictably across server clusters, and maintains deterministic memory footprints suitable for CI/CD geospatial pipelines.