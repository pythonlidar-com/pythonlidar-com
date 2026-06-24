# Mapping Custom Attributes in PDAL Pipelines

Mapping custom attributes in PDAL pipelines requires explicitly declaring new dimensions in your pipeline JSON, populating them through stage-specific filters, and ensuring the output writer preserves the extended schema. PDAL does not automatically persist arbitrary metadata. You must register each custom field with a name and data type, then route it through the processing chain using `filters.assign`, `filters.expression`, or `filters.python`. The pipeline schema propagates forward, but writers like `writers.las` will silently drop unmapped dimensions unless they are explicitly listed in the `extra_dims` parameter. Successful implementation hinges on strict type alignment, early schema registration, and explicit writer configuration.

## Schema Registration & Dimension Propagation

Under the hood, PDAL treats every point attribute as a contiguous memory dimension. When you introduce a custom field, you are extending the point view schema. Understanding how [Attribute Mapping](/pdal-pipeline-architecture-execution/attribute-mapping/) works is critical for avoiding silent data loss during multi-stage processing. The pipeline compiler validates dimension compatibility at each stage boundary. If a filter outputs a dimension that the next stage doesn't recognize, PDAL either coerces it (if types align) or strips it entirely.

Proper [PDAL Pipeline Architecture & Execution](/pdal-pipeline-architecture-execution/) relies on explicit schema declarations at the reader level or early in the filter chain to guarantee downstream persistence. Custom attributes must be registered before any stage that consumes them. You can declare them inline using `extra_dims` in the reader, or let PDAL infer them from `filters.assign` or `filters.expression` outputs. However, inference is unreliable when chaining complex filters or merging point clouds with mismatched schemas. Always define custom dimensions explicitly to prevent schema drift.

## Filter Selection & Data Derivation

Choose your filter based on the complexity of the attribute you are generating:

* **`filters.assign`**: For static value injection and mathematical derivations. Supports C-style arithmetic expressions referencing existing dimension names. Best choice for most custom attribute mapping tasks.
* **`filters.expression`**: Evaluates a boolean expression per point and can assign values conditionally. Use it when you need `where`-clause filtering combined with attribute assignment.
* **`filters.python`**: Required for complex spatial joins, external API calls, or non-vectorizable logic. Note that Python filters introduce significant overhead and should be reserved for operations that cannot be expressed in native PDAL expressions.

When deriving attributes, always validate type boundaries. PDAL will truncate floating-point values to integers without warning if the target dimension is declared as `uint8` or `int16`.

## Writer Configuration & Extra Bytes

The LAS 1.4 specification introduced Extra Bytes (EB) to extend the standard point record format. PDAL's `writers.las` supports this natively via the `extra_dims` parameter. This parameter accepts a comma-separated string in the format `name=type`. Supported types include `float`, `double`, `uint8`, `int8`, `uint16`, `int16`, `uint32`, `int32`, `uint64`, and `int64`.

Without `extra_dims`, PDAL writes only standard LAS dimensions. Custom fields are dropped during serialization, even if they exist in the pipeline's point view. Always pair `extra_dims` with a LAS 1.4 output (`minor_version: 4`) to ensure compliance with the [ASPRS LAS Specification](https://github.com/ASPRSorg/LAS).

## Complete Pipeline Example

The following pipeline maps two custom attributes: `norm_intensity` (normalized 0–1 float) and `survey_confidence` (uint8 classification score). It uses `filters.assign` for both the mathematical derivation and static injection, then writes to LAS 1.4 with explicit extra byte registration.

```json
{
  "pipeline": [
    {
      "type": "readers.las",
      "filename": "input_cloud.laz"
    },
    {
      "type": "filters.assign",
      "value": "norm_intensity = (Intensity - 100.0) / 1500.0",
      "where": "Intensity >= 100 && Intensity <= 1600"
    },
    {
      "type": "filters.assign",
      "value": "survey_confidence = 128"
    },
    {
      "type": "writers.las",
      "filename": "output_mapped.laz",
      "minor_version": 4,
      "extra_dims": "norm_intensity=float,survey_confidence=uint8"
    }
  ]
}
```

### Stage Breakdown
1. **Reader**: Ingests compressed LAZ. PDAL automatically detects existing standard dimensions.
2. **First Assign Filter**: Computes `norm_intensity` only for points meeting the `where` clause. Points outside the range are not modified by this stage (they retain whatever value `norm_intensity` had, typically 0 for a new dimension).
3. **Second Assign Filter**: Broadcasts `survey_confidence = 128` to every point in the current view.
4. **Writer**: Serializes to LAS 1.4. The `extra_dims` string registers both custom fields as Extra Bytes, ensuring they survive the write operation.

## Execution, Validation & Common Pitfalls

Run the pipeline via CLI:
```bash
pdal pipeline mapping_pipeline.json
```

Verify schema persistence immediately after execution:
```bash
pdal info output_mapped.laz --schema
```
Look for `norm_intensity` and `survey_confidence` in the dimension list. If they are missing, the writer dropped them.

**Common Failure Modes:**
* **Silent Type Coercion**: Assigning a `double` result to a `uint8` extra byte truncates decimals. Always match the expression output type to the `extra_dims` declaration.
* **Missing `extra_dims`**: PDAL does not auto-register custom dimensions in LAS writers. Omitting this parameter guarantees data loss for any non-standard dimension.
* **Schema Drift in Merges**: When using `filters.merge`, mismatched custom dimensions across input files cause PDAL to drop non-overlapping fields. Pre-align schemas or use `filters.range` to isolate compatible clouds.
* **Uninitialized Dimension Values**: When a `where` clause restricts which points receive a value, points that don't match the condition retain a default of 0. If this is undesirable, initialize the dimension first with an unconditional `filters.assign`.

## Production Best Practices

| Practice | Implementation |
|----------|----------------|
| **Early Registration** | Declare custom dimensions in the reader's `extra_dims` so all downstream stages see the field immediately. |
| **Strict Typing** | Use `float` for derived metrics, `uint8` for flags, and avoid `double` unless precision is critical. |
| **Pipeline Versioning** | Store JSON pipelines in Git. PDAL pipelines are declarative and highly reproducible across environments. |
| **Memory Management** | Large point clouds with many custom dimensions increase RAM usage. Use `filters.splitter` for batch processing to keep peak memory bounded. |
| **Post-run Validation** | After execution, read `pipeline.arrays[0].dtype.names` in Python to confirm all expected custom dimensions are present. |

Mapping Custom Attributes in PDAL Pipelines becomes deterministic when you treat the pipeline as a strict type system rather than a dynamic metadata bag. Register early, derive explicitly, and configure writers with exact `extra_dims` definitions to guarantee zero-loss attribute propagation.
