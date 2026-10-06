-- Pipelines and MERGE · Hard · Keep history: SCD Type 2
-- Playground: https://aboualyxcode.github.io/select-from-production/#scd2-merge
--
-- `dim_customer_city` keeps the history of where customers live. Today's `city_changes` contains
-- moves, a non-change and a brand-new customer.
--
-- TASK: For customers whose city changed, close the current row (`valid_to` = changed_on,
-- `is_current` = false) and add a new current row (`valid_from` = changed_on, `valid_to` NULL).
-- Add new customers as current rows. Leave unchanged customers alone.
--
-- Tables: dim_customer_city, city_changes
-- This challenge changes data. The setup below creates the tables it needs; rerun it to start over.
-- Check your result with:
--   SELECT customer_id, city, valid_from, valid_to, is_current FROM dim_customer_city ORDER BY customer_id, valid_from
-- Your statements must be idempotent: running them twice must leave the same result.

USE SCHEMA stagedoor;

-- Setup
CREATE OR REPLACE TABLE dim_customer_city (customer_id INT NOT NULL, city STRING, valid_from DATE, valid_to DATE, is_current BOOLEAN);
INSERT INTO dim_customer_city SELECT customer_id, city, DATE'2025-01-01', NULL, true FROM customers WHERE customer_id <= 5;
CREATE OR REPLACE TABLE city_changes (customer_id INT, city STRING, changed_on DATE);
INSERT INTO city_changes VALUES (1, 'Paris', DATE'2026-06-15'), (3, 'Lima', DATE'2026-06-15'), (6, 'Oslo', DATE'2026-06-16');
INSERT INTO city_changes SELECT customer_id, city, DATE'2026-06-15' FROM customers WHERE customer_id = 2;

-- Reference solution
MERGE INTO dim_customer_city d
USING city_changes s
ON d.customer_id = s.customer_id AND d.is_current
WHEN MATCHED AND d.city <> s.city THEN
  UPDATE SET valid_to = s.changed_on, is_current = false;

INSERT INTO dim_customer_city
SELECT s.customer_id, s.city, s.changed_on, NULL, true
FROM city_changes s
LEFT ANTI JOIN dim_customer_city d
  ON d.customer_id = s.customer_id AND d.is_current;

-- Another way (commented out: run it instead of the reference solution, after rerunning the setup)
-- MERGE INTO dim_customer_city d
-- USING (
--   SELECT customer_id AS merge_key, * FROM city_changes
--   UNION ALL
--   SELECT NULL, s.* FROM city_changes s JOIN dim_customer_city d ON d.customer_id = s.customer_id AND d.is_current WHERE d.city <> s.city
-- ) s
-- ON d.customer_id = s.merge_key AND d.is_current
-- WHEN MATCHED AND d.city <> s.city THEN UPDATE SET valid_to = s.changed_on, is_current = false
-- WHEN NOT MATCHED THEN INSERT (customer_id, city, valid_from, valid_to, is_current) VALUES (s.customer_id, s.city, s.changed_on, NULL, true);

-- WHY IT MATTERS: The alternative is the classic single-MERGE SCD2 trick: changed rows appear
-- twice in the source, once to close the old version and once (with a NULL merge key, so it never
-- matches) to insert the new one. In a declarative pipeline, `AUTO CDC … STORED AS SCD TYPE 2`
-- does all of this, including out-of-order changes.

SELECT customer_id, city, valid_from, valid_to, is_current FROM dim_customer_city ORDER BY customer_id, valid_from;
