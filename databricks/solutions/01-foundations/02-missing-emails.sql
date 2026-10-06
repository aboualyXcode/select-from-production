-- Foundations · Warm-up · Who can we not email?
-- Playground: https://aboualyxcode.github.io/select-from-production/#missing-emails
--
-- Marketing is about to send the spring newsletter and wants to know which customers have no email
-- on file.
--
-- TASK: Return `customer_id` and `full_name` of customers whose `email` is missing, ordered by
-- `customer_id`.
--
-- Tables: customers

USE SCHEMA stagedoor;

-- Reference solution
SELECT customer_id, full_name
FROM customers
WHERE email IS NULL
ORDER BY customer_id;

-- Another way
SELECT customer_id, full_name FROM customers WHERE NOT (email IS NOT NULL) ORDER BY customer_id;

-- WHY IT MATTERS: `email = NULL` is never true: any comparison with NULL yields NULL, and WHERE
-- keeps only rows where the condition is true. Use `IS NULL`, `IS NOT NULL`, or the NULL-safe ``.
