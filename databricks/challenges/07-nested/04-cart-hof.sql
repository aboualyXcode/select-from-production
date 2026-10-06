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

-- Your SQL here

