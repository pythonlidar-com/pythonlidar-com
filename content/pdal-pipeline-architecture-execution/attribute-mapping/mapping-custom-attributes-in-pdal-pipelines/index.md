# Mapping Custom Attributes in PDAL Pipelines

Mapping custom attributes in PDAL pipelines requires explicitly declaring new dimensions in your pipeline JSON, populating them through stage-specific filters, and ensuring the output writer preserves the extended schema. PDAL does not automatically persist arbitrary metadata. You must register each custom field with a name, data type, and description, then route it through the processing chain using `filters.expression`, `filters.assign`, or `filters.python`. The pipeline schema propagates forward, but writers like `writers.las` will silently drop unmapped dimensions unless they are explicitly defined in the LAS extra bytes specification or mapped via the `extra_dims` parameter. Successful implementation hinges on strict type alignment, early schema registration, and explicit writer configuration.

## Schema Registration & Dimension Propagation

Under the hood, PDAL treats every point attribute as a contiguous memory dimension. When you introduce a custom field, you are extending the point view schema. Understanding how [Attribute Mapping](/pdal-pipeline-architecture-execution/attribute-mapping/) works is critical for avoiding silent data loss during multi-stage processing. The pipeline compiler validates dimension compatibility at each stage boundary. If a filter outputs a dimension that the next stage doesn’t recognize, PDAL either coerces it (if types align) or strips it entirely.

Proper [PDAL Pipeline Architecture & Execution](/pdal-pipeline-architecture-execution/) relies on explicit schema declarations at the reader level or early in the filter chain to guarantee downstream persistence. Custom attributes must be registered before any stage that consumes them. You can declare them inline using the `schema` object in the reader, or let PDAL infer them from `filters.expression` or `filters.assign` outputs. However, inference is unreliable when chaining complex filters or merging point clouds with mismatched schemas. Always define custom dimensions explicitly to prevent schema drift.

## Filter Selection & Data Derivation

Choose your filter based on the complexity of the attribute you are generating:

* **`filters.expression`**: Best for mathematical derivations, conditional logic, and unit conversions. Supports standard C-style syntax and PDAL dimension names. See the official [filters.expression documentation](https://pdal.io/stages/filters.expression.html) for supported operators and functions.
* **`filters.assign`**: Ideal for injecting static values, flags, or classification codes across an entire point cloud.
* **`filters.python`**: Required for complex spatial joins, external API calls, or non-vectorizable logic. Note that Python filters introduce significant overhead and should be reserved for operations that cannot be expressed in native PDAL expressions.

When deriving attributes, always validate type boundaries. PDAL will truncate floating-point values to integers without warning if the target dimension is declared as `uint8` or `int16`.

## Writer Configuration & Extra Bytes

The LAS 1.4 specification introduced Extra Bytes (EB) to extend the standard point record format. PDAL’s `writers.las` and `writers.laszip` support this natively, but require explicit configuration. The `extra_dims` parameter accepts a comma-separated string in the format `name=type:Description`. Supported types include `float32`, `float64`, `uint8`, `int16`, `uint16`, `int32`, and `uint32`.

Without `extra_dims`, PDAL writes only standard LAS dimensions. Custom fields are dropped during serialization, even if they exist in the pipeline’s point view. Always pair `extra_dims` with a LAS 1.4+ header version (`major_version: 1, minor_version: 4`) to ensure compliance with the [ASPRS LAS Specification](https://github.com/ASPRSorg/LAS).

## Complete Pipeline Example

The following pipeline maps two custom attributes: `norm_intensity` (normalized 0–1 float) and `survey_confidence` (uint8 classification score). It uses `filters.expression` for mathematical derivation and `filters.assign` for static injection, then writes to LAS 1.4 with explicit extra byte registration.

```json
{
  "pipeline": [
    {
      "type": "readers.las",
      "filename": "input_cloud.laz"
    },
    {
      "type": "filters.expression",
      "expression": "norm_intensity = (Intensity - 100) / 1500.0",
      "where": "Intensity >= 100 && Intensity <= 1600"
    },
    {
      "type": "filters.assign",
      "value": "survey_confidence=128"
    },
    {
      "type": "writers.las",
      "filename": "output_mapped.laz",
      "extra_dims": "norm_intensity=float32:Normalized Intensity Ratio,survey_confidence=uint8:Survey Confidence Score",
      "major_version": 1,
      "minor_version": 4
    }
  ]
}
```

### Stage Breakdown
1. **Reader**: Ingests compressed LAZ. PDAL automatically detects existing dimensions.
2. **Expression Filter**: Computes `norm_intensity` only for points meeting the `where` clause. Points outside the range receive `NaN` (handled gracefully by PDAL).
3. **Assign Filter**: Broadcasts `survey_confidence=128` to every point in the current view.
4. **Writer**: Serializes to LAS 1.4. The `extra_dims` string registers both custom fields as Extra Bytes, ensuring they survive the write operation.

## Execution, Validation & Common Pitfalls

Run the pipeline via CLI:
```bash
pdal pipeline mapping_pipeline.json
```

Verify schema persistence immediately after execution:
```bash
pdal info --dimensions output_mapped.laz
```
Look for `norm_intensity` and `survey_confidence` in the output list. If they are missing, the writer dropped them.

**Common Failure Modes:**
* **Silent Type Coercion**: Assigning a `float64` result to a `uint8` extra byte truncates decimals. Always match the expression output type to the `extra_dims` declaration.
* **Missing `extra_dims`**: PDAL does not auto-register custom dimensions in LAS writers. Omitting this parameter guarantees data loss.
* **Schema Drift in Merges**: When using `filters.merge`, mismatched custom dimensions across input files cause PDAL to drop non-overlapping fields. Pre-align schemas or use `filters.range` to isolate compatible clouds.
* **NaN Propagation**: Unhandled `NaN` values in floating-point extra bytes can break downstream GIS software. Use `filters.range` or `filters.outlier` to clean or mask invalid results before writing.

## Production Best Practices

| Practice | Implementation |
|----------|----------------|
| **Early Registration** | Declare custom dimensions in the reader’s `schema` or immediately after ingestion. |
| **Strict Typing** | Use `float32` for derived metrics, `uint8` for flags, and avoid `float64` unless precision is critical. |
| **Explicit Forwarding** | PDAL forwards all dimensions by default, but use `filters.drop` to remove intermediate calculations before the writer. |
| **Pipeline Versioning** | Store JSON pipelines in Git. PDAL pipelines are declarative and highly reproducible across environments. |
| **Memory Management** | Large point clouds with many custom dimensions increase RAM usage. Monitor `--memory` limits and use `filters.split` for batch processing. |

Mapping Custom Attributes in PDAL Pipelines becomes deterministic when you treat the pipeline as a strict type system rather than a dynamic metadata bag. Register early, derive explicitly, and configure writers with exact `extra_dims` definitions to guarantee zero-loss attribute propagation.