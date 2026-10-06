-- Aggregation · Core · Ticket price distribution
-- Playground: https://aboualyxcode.github.io/select-from-production/#price-percentiles
--
-- Pricing wants the typical price and the high end per ticket type, not averages skewed by
-- outliers.
--
-- TASK: Per `ticket_type`, return `median_price` and `p90_price` (the 90th percentile, linear
-- interpolation) of `unit_price`, both rounded to 2. Order by ticket_type.
--
-- Tables: order_items

USE SCHEMA stagedoor;

-- Reference solution
SELECT ticket_type,
       ROUND(median(unit_price), 2) AS median_price,
       ROUND(percentile(unit_price, 0.9), 2) AS p90_price
FROM order_items
GROUP BY ticket_type
ORDER BY ticket_type;

-- Another way
SELECT ticket_type, ROUND(percentile_cont(0.5) WITHIN GROUP (ORDER BY unit_price), 2) AS median_price, ROUND(percentile_cont(0.9) WITHIN GROUP (ORDER BY unit_price), 2) AS p90_price FROM order_items GROUP BY ALL ORDER BY 1;

-- WHY IT MATTERS: On large data, `percentile_approx` is much cheaper and returns an actual value
-- from the data. Exact `percentile` and `percentile_cont` interpolate between values.
