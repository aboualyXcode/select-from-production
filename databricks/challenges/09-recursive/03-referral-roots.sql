-- Hierarchies · Hard · Who started the referral chain?
-- Playground: https://aboualyxcode.github.io/select-from-production/#referral-roots
--
-- Marketing rewards customers whose referrals went at least two levels deep.
--
-- TASK: For customers at depth 2 or more in a referral chain (referred by someone who was
-- themselves referred), return `customer_id`, `root_id` (the customer at the top of the chain, who
-- was referred by no one) and `depth`. Order by customer_id.
--
-- Tables: customers

USE SCHEMA stagedoor;

-- Your SQL here

