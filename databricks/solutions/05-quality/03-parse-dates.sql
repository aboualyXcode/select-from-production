-- Data quality · Hard · Dates in three formats
-- Playground: https://aboualyxcode.github.io/select-from-production/#parse-dates
--
-- The same raw sign-ups store dates as ISO strings, ISO timestamps, or European `dd/MM/yyyy`, plus
-- some garbage.
--
-- TASK: Return `signup_id`, the raw `signup_date` as `raw`, and `signup_day`: a DATE parsed from
-- ISO (`yyyy-MM-dd`, optionally followed by a time) or `dd/MM/yyyy`, and NULL when it is neither
-- or not a real date. The query must not fail. Order by signup_id.
--
-- Tables: raw_signups

USE SCHEMA stagedoor;

-- Reference solution
SELECT signup_id,
       signup_date AS raw,
       coalesce(try_cast(signup_date AS DATE),
                CAST(try_to_timestamp(signup_date, 'dd/MM/yyyy') AS DATE)) AS signup_day
FROM raw_signups
ORDER BY signup_id;

-- Another way
SELECT signup_id, signup_date AS raw, CASE WHEN signup_date RLIKE '^[0-9]{2}/[0-9]{2}/[0-9]{4}$' THEN to_date(try_to_timestamp(signup_date, 'dd/MM/yyyy')) ELSE try_cast(signup_date AS DATE) END AS signup_day FROM raw_signups ORDER BY 1;

-- WHY IT MATTERS: With ANSI mode on, the default on Databricks SQL warehouses, `CAST` of a
-- malformed value fails the whole query. `try_cast` and `try_to_timestamp` return NULL instead, so
-- one bad row cannot break a pipeline. Count the NULLs afterwards to monitor how much is
-- unparseable.
