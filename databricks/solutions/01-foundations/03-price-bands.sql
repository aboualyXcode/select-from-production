-- Foundations · Warm-up · Price bands
-- Playground: https://aboualyxcode.github.io/select-from-production/#price-bands
--
-- Merchandising groups concerts into price bands for the homepage carousel.
--
-- TASK: Return `event_id`, `event_name`, `base_price` and `band`: budget under 50, standard from
-- 50 up to (not including) 100, premium from 100. Order by `base_price` descending, then
-- `event_id`.
--
-- Tables: events

USE SCHEMA stagedoor;

-- Reference solution
SELECT event_id, event_name, base_price,
       CASE WHEN base_price < 50 THEN 'budget'
            WHEN base_price < 100 THEN 'standard'
            ELSE 'premium' END AS band
FROM events
ORDER BY base_price DESC, event_id;

-- Another way
SELECT event_id, event_name, base_price, IF(base_price >= 100, 'premium', IF(base_price >= 50, 'standard', 'budget')) AS band FROM events ORDER BY base_price DESC, event_id;

-- WHY IT MATTERS: Because CASE stops at the first true branch, each later branch only needs its
-- upper bound. Boundaries are where bugs live: "under 50" is `< 50`, and 100 itself is premium.
