-- Foundations · Warm-up · Which promo codes were used?
-- Playground: https://aboualyxcode.github.io/select-from-production/#promo-search
--
-- Finance is auditing discounts. Codes containing `vip` (any case) or starting with `SPRING` need
-- review.
--
-- TASK: Return `order_id` and `promo_code` for orders whose code contains `vip` in any letter
-- case, or starts with `SPRING`. Order by `order_id`.
--
-- Tables: orders

USE SCHEMA stagedoor;

-- Reference solution
SELECT order_id, promo_code
FROM orders
WHERE promo_code ILIKE '%vip%' OR promo_code LIKE 'SPRING%'
ORDER BY order_id;

-- Another way
SELECT order_id, promo_code FROM orders WHERE lower(promo_code) LIKE '%vip%' OR startswith(promo_code, 'SPRING') ORDER BY order_id;

-- WHY IT MATTERS: LIKE is case-sensitive on Databricks. ILIKE, or comparing `lower()` on both
-- sides, handles inconsistent casing. Rows with a NULL promo code drop out automatically: NULL
-- LIKE anything is NULL.
