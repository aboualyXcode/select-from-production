-- Incidents · Core · The ledger is short
-- Playground: https://aboualyxcode.github.io/select-from-production/#union-loses-money
--
-- Treasury's total of settled cash is lower than the bank statement. The query combines card and
-- non-card payments.
--
-- TASK: Fix it. Return one column, `total_settled`: the sum of every SETTLED payment, card and
-- non-card, rounded to 2. Duplicate charges count: the money really was taken.
--
-- Tables: payments

USE SCHEMA stagedoor;

-- Reference solution
SELECT ROUND(SUM(amount), 2) AS total_settled
FROM payments
WHERE status = 'SETTLED';

-- Another way
SELECT ROUND(SUM(amount), 2) AS total_settled FROM (SELECT order_id, amount FROM payments WHERE status = 'SETTLED' AND method = 'card' UNION ALL SELECT order_id, amount FROM payments WHERE status = 'SETTLED' AND method <> 'card');

-- WHY IT MATTERS: UNION removes duplicate rows across the whole result, which also removes
-- legitimate duplicates such as two identical charges. Use UNION ALL unless you specifically want
-- deduplication, and keep a unique key in the projection.
