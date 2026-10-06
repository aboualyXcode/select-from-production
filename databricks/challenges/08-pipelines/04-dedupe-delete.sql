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

-- Your SQL here

