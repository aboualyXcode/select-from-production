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

-- The query you were handed:
SELECT COUNT(*) AS customers
FROM customers
WHERE customer_id NOT IN (SELECT referred_by FROM customers);

