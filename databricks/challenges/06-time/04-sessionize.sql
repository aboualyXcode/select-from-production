-- Dates and time series · Hard · Sessions from raw clicks
-- Playground: https://aboualyxcode.github.io/select-from-production/#sessionize
--
-- Analytics defines a session as page views by the same logged-in customer on the same device,
-- with no gap longer than 30 minutes.
--
-- TASK: Using only views with a `customer_id`, return per `device`: `sessions`, `views` and
-- `views_per_session` rounded to 2. A gap of exactly 30 minutes stays in the same session. Order
-- by device.
--
-- Tables: page_views

USE SCHEMA stagedoor;

-- Your SQL here

