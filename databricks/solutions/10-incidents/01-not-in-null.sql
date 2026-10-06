-- Incidents · Core · Zero customers who never referred?
-- Playground: https://aboualyxcode.github.io/select-from-production/#not-in-null
--
-- A churn report claims there are no customers who have never referred anyone, which nobody
-- believes. The query is in the editor.
--
-- TASK: Fix it. Return one column, `customers`: the number of customers whose `customer_id` never
-- appears as anyone's `referred_by`.
--
-- Tables: customers

USE SCHEMA stagedoor;

-- Reference solution
SELECT COUNT(*) AS customers
FROM customers c
WHERE NOT EXISTS (SELECT 1 FROM customers r WHERE r.referred_by = c.customer_id);

-- Another way
SELECT COUNT(*) AS customers FROM customers WHERE customer_id NOT IN (SELECT referred_by FROM customers WHERE referred_by IS NOT NULL);

-- WHY IT MATTERS: `NOT IN` against a subquery that returns a single NULL matches nothing, because
-- `x <> NULL` is unknown. This is one of the most common silent bugs in SQL. Prefer `NOT EXISTS`
-- or `LEFT ANTI JOIN`, which are NULL-safe.
