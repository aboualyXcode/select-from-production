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

-- Reference solution
SELECT o.customer_id,
       array_sort(collect_set(e.genre)) AS genres,
       size(collect_set(e.genre)) AS genre_count
FROM orders o
JOIN events e ON e.event_id = o.event_id
WHERE o.status = 'PAID'
GROUP BY o.customer_id
HAVING size(collect_set(e.genre)) >= 3
ORDER BY o.customer_id;

-- Another way
SELECT customer_id, genres, size(genres) AS genre_count FROM (SELECT o.customer_id, sort_array(array_distinct(collect_list(e.genre))) AS genres FROM orders o JOIN events e USING (event_id) WHERE o.status = 'PAID' GROUP BY 1) WHERE size(genres) >= 3 ORDER BY 1;

-- WHY IT MATTERS: Aggregating into arrays is how you build "list" columns for feature tables and
-- APIs. `COUNT(DISTINCT genre)` would give the count alone; the array keeps the values too.
