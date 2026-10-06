-- Semi-structured data · Core · Cart values
-- Playground: https://aboualyxcode.github.io/select-from-production/#cart-values
--
-- Abandoned-cart emails need each cart's number of lines and total value. Some carts are empty.
--
-- TASK: Return `cart_id`, `lines` (items in the cart) and `value` (sum of qty × unit_price,
-- rounded to 2), with 0 for empty carts. Order by cart_id.
--
-- Tables: carts

USE SCHEMA stagedoor;

-- Reference solution
SELECT c.cart_id,
       COUNT(item.qty) AS lines,
       ROUND(coalesce(SUM(item.qty * item.unit_price), 0), 2) AS value
FROM carts c
LATERAL VIEW OUTER explode(c.items) e AS item
GROUP BY c.cart_id
ORDER BY c.cart_id;

-- Another way
SELECT cart_id, size(items) AS lines, ROUND(aggregate(items, CAST(0 AS DOUBLE), (acc, i) -> acc + i.qty * i.unit_price), 2) AS value FROM carts ORDER BY cart_id;

-- WHY IT MATTERS: Exploding silently drops parents with empty arrays, a common source of "missing
-- rows" bugs. Higher-order functions (`aggregate`, `filter`, `transform`) compute over arrays
-- without changing the grain at all.
