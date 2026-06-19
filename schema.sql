-- SQL schéma pro tabulku návštěv v PostgreSQL
-- Určeno pro elektronickou knihu návštěv (školní hackaton)

CREATE TABLE IF NOT EXISTS navstevy (
    id SERIAL PRIMARY KEY,
    jmeno TEXT NOT NULL,
    prijmeni TEXT NOT NULL,
    prichod TIMESTAMPTZ DEFAULT NOW(),
    organizace TEXT NULL,
    spz TEXT NULL,
    odchod TIMESTAMPTZ NULL
);
