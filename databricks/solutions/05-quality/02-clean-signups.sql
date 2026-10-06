-- Data quality · Hard · Clean the raw sign-ups
-- Playground: https://aboualyxcode.github.io/select-from-production/#clean-signups
--
-- The sign-up form wrote raw text: stray spaces, mixed case, invalid emails and the same person
-- twice.
--
-- TASK: Return `signup_id`, `email` (trimmed, lower case), `full_name` (initcap, with runs of
-- spaces collapsed to one) and `country` (trimmed, upper case). Keep only valid emails, matching
-- `^[^@ ]+@[^@ ]+[.][a-z]+$` after cleaning, and keep one row per email: the lowest signup_id.
-- Order by signup_id.
--
-- Tables: raw_signups

USE SCHEMA stagedoor;

-- Reference solution
WITH clean AS (
  SELECT signup_id,
         lower(trim(email)) AS email,
         initcap(regexp_replace(trim(full_name), ' +', ' ')) AS full_name,
         upper(trim(country)) AS country
  FROM raw_signups
)
SELECT *
FROM clean
WHERE email RLIKE '^[^@ ]+@[^@ ]+[.][a-z]+$'
QUALIFY ROW_NUMBER() OVER (PARTITION BY email ORDER BY signup_id) = 1
ORDER BY signup_id;

-- Another way
SELECT signup_id, email, full_name, country FROM (SELECT signup_id, lower(trim(email)) AS email, initcap(regexp_replace(trim(full_name), ' +', ' ')) AS full_name, upper(trim(country)) AS country, MIN(signup_id) OVER (PARTITION BY lower(trim(email))) AS first_id FROM raw_signups) WHERE signup_id = first_id AND regexp_like(email, '^[^@ ]+@[^@ ]+[.][a-z]+$') ORDER BY 1;

-- WHY IT MATTERS: Standardize before you deduplicate: `' Amara.Okafor1@Example.com '` and
-- `'AMARA.OKAFOR1@EXAMPLE.COM'` are the same person only after trimming and lower-casing. Keep the
-- raw table untouched, and write the cleaned version to Silver.
