-- Foundations · Warm-up · Where are our customers?
-- Playground: https://aboualyxcode.github.io/select-from-production/#customer-locations
--
-- The events team is planning a new tour and wants every country and city we have customers in.
--
-- TASK: Return each distinct `country` and `city` pair, ordered by country, then city.
--
-- Tables: customers

USE SCHEMA stagedoor;

-- Reference solution
SELECT DISTINCT country, city
FROM customers
ORDER BY country, city;

-- Another way
SELECT country, city FROM customers GROUP BY country, city ORDER BY 1, 2;

-- WHY IT MATTERS: DISTINCT and GROUP BY without aggregates produce the same result. Use DISTINCT
-- to express "unique rows" and GROUP BY when you aggregate.
