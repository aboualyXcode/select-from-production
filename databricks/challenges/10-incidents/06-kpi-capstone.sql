-- Incidents · Hard · Capstone: the monthly KPI table
-- Playground: https://aboualyxcode.github.io/select-from-production/#kpi-capstone
--
-- The exec team gets one table per month. Build it for the first half of 2026 (orders placed
-- January to June).
--
-- TASK: Per `month` (`yyyy-MM` of order_ts): `paid_orders`; `tickets` (PAID); `gross_bookings`
-- (PAID line totals, rounded to 2); `active_customers` (distinct customers with a PAID order);
-- `avg_tickets_per_order` (PAID, rounded to 2); `refund_rate_pct` = REFUNDED orders / (PAID +
-- REFUNDED orders) × 100, rounded to 1. Order by month.
--
-- Tables: orders, order_items

USE SCHEMA stagedoor;

-- Your SQL here

