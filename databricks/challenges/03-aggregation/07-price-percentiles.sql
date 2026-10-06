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

-- Your SQL here

