-- Pipelines and MERGE · Core · Remove duplicate charges
-- Playground: https://aboualyxcode.github.io/select-from-production/#dedupe-delete
--
-- Before finance reconciles, the duplicate settled charges must be removed from `payments_clean`,
-- keeping each order's earliest settled charge. Failed attempts stay.
--
-- TASK: Delete every SETTLED payment that is not the earliest settled payment of its order (by
-- paid_ts, then payment_id).
--
-- Tables: payments_clean
-- This challenge changes data. The setup below creates the tables it needs; rerun it to start over.
-- Check your result with:
--   SELECT payment_id, order_id, status FROM payments_clean ORDER BY payment_id

USE SCHEMA stagedoor;

-- Setup
CREATE OR REPLACE TABLE payments_clean AS SELECT * FROM payments;

-- Reference solution
DELETE FROM payments_clean
WHERE payment_id IN (
  SELECT payment_id FROM payments_clean
  WHERE status = 'SETTLED'
  QUALIFY ROW_NUMBER() OVER (PARTITION BY order_id ORDER BY paid_ts, payment_id) > 1
);

-- Another way (commented out: run it instead of the reference solution, after rerunning the setup)
-- MERGE INTO payments_clean t USING (SELECT payment_id FROM payments_clean WHERE status = 'SETTLED' QUALIFY ROW_NUMBER() OVER (PARTITION BY order_id ORDER BY paid_ts, payment_id) > 1) d ON t.payment_id = d.payment_id WHEN MATCHED THEN DELETE;

-- WHY IT MATTERS: Identify exactly the rows to remove by key, rather than deleting whole groups.
-- On Delta, a DELETE is versioned: `DESCRIBE HISTORY` shows it, and time travel can restore the
-- previous version if the rule was wrong.

SELECT payment_id, order_id, status FROM payments_clean ORDER BY payment_id;
