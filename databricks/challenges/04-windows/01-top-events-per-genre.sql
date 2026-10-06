-- Window functions · Core · Top 2 events per genre
-- Playground: https://aboualyxcode.github.io/select-from-production/#top-events-per-genre
--
-- The homepage shows the two best-selling concerts in each genre.
--
-- TASK: For PAID orders, return `genre`, `event_id`, `tickets` (sum of quantity) and `rank` (1 or
-- 2) for the top 2 events per genre by tickets. Break ties by the lower event_id. Order by genre,
-- then rank.
--
-- Tables: orders, order_items, events

USE SCHEMA stagedoor;

-- Your SQL here

