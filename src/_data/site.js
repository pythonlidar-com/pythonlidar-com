module.exports = {
  name: "Python LiDAR & Point Cloud Workflows",
  shortName: "Python LiDAR",
  url: "https://www.pythonlidar.com",
  description:
    "Design and chain PDAL pipelines, classify ground returns, build DTMs and DSMs, automate batch processing, and validate LiDAR outputs — all in Python.",
  themeColor: "#5b3df5",
  bgColor: "#fafaf7",
  sections: [
    {
      slug: "pdal-pipeline-architecture-execution",
      label: "PDAL Pipelines",
      iconName: "layers",
      blurb:
        "PDAL pipeline architecture, stage chaining, memory and parallel execution, attribute mapping, filtering, reprojection, and validation.",
    },
    {
      slug: "point-cloud-data-standards-fundamentals",
      label: "Point Cloud Standards",
      iconName: "grid",
      blurb:
        "LAS/LAZ structure, ASPRS classification, coordinate reference systems, point density metrics, and metadata/header integrity.",
    },
    {
      slug: "ground-filtering-dtm-dsm-generation",
      label: "Ground & Terrain Models",
      iconName: "terrain",
      blurb:
        "SMRF and PMF ground classification, DTM and DSM raster generation with writers.gdal, interpolation choices, void filling, and hillshade derivation.",
    },
    {
      slug: "batch-automation-cloud-integration",
      label: "Batch & Cloud Automation",
      iconName: "cloud",
      blurb:
        "Containerised PDAL, AWS Batch tile fan-out, streaming LAZ and COG I/O against S3, and Airflow DAG orchestration for production point cloud pipelines.",
    },
    {
      slug: "lidar-classification-feature-extraction",
      label: "Classification & Features",
      iconName: "grid",
      blurb:
        "Buildings, power lines, individual trees, water and bridges: segmenting point clouds and training classifiers to extract features from LiDAR.",
    },
  ],
};
