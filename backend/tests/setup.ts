// tests/setup.ts

import pool from "../db/pool.js";

beforeEach(async () => {
    await pool.query("DELETE FROM idempotency_keys");
    await pool.query("DELETE FROM transfers");
    await pool.query("DELETE FROM accounts");
});

afterAll(async () => {
    await pool.end();
});