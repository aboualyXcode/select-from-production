-- Window functions · Core · Share of tickets by venue
-- Playground: https://aboualyxcode.github.io/select-from-production/#venue-share
--
-- Partnerships negotiates with venues using their share of all paid tickets.
--
-- TASK: Return the venue `name`, `tickets` (paid) and `share_pct` = 100 × tickets / all paid
-- tickets, rounded to 1. Order by share_pct descending, then name.
--
-- Tables: orders, order_items, events, venues

USE SCHEMA stagedoor;

-- Your SQL here

