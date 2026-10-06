-- Data quality · Hard · Did the promo code change?
-- Playground: https://aboualyxcode.github.io/select-from-production/#promo-changes
--
-- Marketing wants to know how often a customer's order uses a different promo code than their
-- previous order. NULL means "no code", and going from no code to a code counts as a change.
--
-- TASK: Return one column, `changes`: the number of orders whose promo_code differs from the same
-- customer's previous order (by order_ts), comparing NULLs safely. A customer's first order is not
-- a change.
--
-- Tables: orders

USE SCHEMA stagedoor;

-- Reference solution
SELECT count_if(rn > 1 AND promo_code IS DISTINCT FROM prev) AS changes
FROM (
  SELECT promo_code,
         LAG(promo_code) OVER (PARTITION BY customer_id ORDER BY order_ts) AS prev,
         ROW_NUMBER() OVER (PARTITION BY customer_id ORDER BY order_ts) AS rn
  FROM orders
);

-- Another way
SELECT COUNT(*) AS changes FROM (SELECT promo_code, LAG(promo_code) OVER w AS prev, LAG(order_id) OVER w AS prev_order FROM orders WINDOW w AS (PARTITION BY customer_id ORDER BY order_ts)) WHERE prev_order IS NOT NULL AND NOT (promo_code <=> prev);

-- WHY IT MATTERS: Two traps. `<>` ignores every change to or from NULL. And LAG returns NULL both
-- for "previous order had no code" and for "there is no previous order"; telling them apart needs
-- a row number (or the previous row's key).
