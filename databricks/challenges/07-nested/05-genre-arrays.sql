-- Semi-structured data · Core · Customers with eclectic taste
-- Playground: https://aboualyxcode.github.io/select-from-production/#genre-arrays
--
-- Recommendations wants customers who have paid for tickets in at least three different genres.
--
-- TASK: Return `customer_id`, `genres` (a sorted array of distinct genres from their PAID orders)
-- and `genre_count`, for customers with 3 or more genres. Order by customer_id.
--
-- Tables: orders, events

USE SCHEMA stagedoor;

-- Your SQL here

