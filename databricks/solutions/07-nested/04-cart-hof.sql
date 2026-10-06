-- Semi-structured data · Hard · VIP lines without exploding
-- Playground: https://aboualyxcode.github.io/select-from-production/#cart-hof
--
-- The VIP upsell team wants per cart: how many lines are VIP tickets, and which ticket types the
-- cart contains.
--
-- TASK: For carts with at least one item, return `cart_id`, `vip_lines` and `types`: the distinct
-- ticket types as a sorted array. Order by cart_id.
--
-- Tables: carts

USE SCHEMA stagedoor;

-- Reference solution
SELECT cart_id,
       size(filter(items, i -> i.ticket_type = 'VIP')) AS vip_lines,
       array_sort(array_distinct(transform(items, i -> i.ticket_type))) AS types
FROM carts
WHERE size(items) > 0
ORDER BY cart_id;

-- Another way
SELECT cart_id, count_if(item.ticket_type = 'VIP') AS vip_lines, array_sort(collect_set(item.ticket_type)) AS types FROM carts LATERAL VIEW explode(items) e AS item GROUP BY cart_id ORDER BY 1;

-- WHY IT MATTERS: Arrays keep related values together at the parent's grain. Lambdas let you
-- filter and map them in place, avoiding an explode-and-regroup round trip. `collect_set` has no
-- guaranteed order, so sort before comparing or displaying.
