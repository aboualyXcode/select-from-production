# Running the challenges on Databricks

Everything in the playground also runs on a Databricks SQL warehouse or a notebook.

1. Open `00_create_dataset.sql` in the Databricks SQL editor, choose a catalog you can create schemas in, and run it. It creates the schema `stagedoor` with the 15 practice tables.
2. Open any file in `challenges/`, write your SQL under `-- Your SQL here`, and run it.
3. Compare with the matching file in `solutions/`, which has the reference solution, an alternative, and the lesson.

Challenges that change data (the Pipelines track) start with a setup block that creates their own tables, so rerunning the file starts the exercise over.

These files are generated from the playground by `node tools/export-databricks.js`.

| # | Track | Challenges |
|---|---|---|
| 1 | Foundations | 6 |
| 2 | Joins | 7 |
| 3 | Aggregation | 7 |
| 4 | Window functions | 8 |
| 5 | Data quality | 6 |
| 6 | Dates and time series | 7 |
| 7 | Semi-structured data | 5 |
| 8 | Pipelines and MERGE | 6 |
| 9 | Hierarchies | 3 |
| 10 | Incidents | 6 |
