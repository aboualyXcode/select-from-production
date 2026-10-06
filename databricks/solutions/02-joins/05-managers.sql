-- Joins · Warm-up · Who reports to whom
-- Playground: https://aboualyxcode.github.io/select-from-production/#managers
--
-- HR needs the org chart as a flat list.
--
-- TASK: Return each employee's `name`, `title` and their manager's name as `manager_name` (NULL
-- for the CEO). Order by `employee_id`.
--
-- Tables: employees

USE SCHEMA stagedoor;

-- Reference solution
SELECT e.name, e.title, m.name AS manager_name
FROM employees e
LEFT JOIN employees m ON m.employee_id = e.manager_id
ORDER BY e.employee_id;

-- Another way
SELECT e.name, e.title, (SELECT m.name FROM employees m WHERE m.employee_id = e.manager_id) AS manager_name FROM employees e ORDER BY e.employee_id;

-- WHY IT MATTERS: A self join is an ordinary join where both sides happen to be the same table.
-- Aliases make the two roles (employee, manager) explicit.
