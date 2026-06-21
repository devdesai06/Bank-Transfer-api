// tests/setup.ts

import pool from "../db/pool.js";

beforeEach(async () => {
    await pool.query("ALTER TABLE ledger_entries DISABLE TRIGGER ALL");
    await pool.query("DELETE FROM ledger_entries");
    await pool.query("ALTER TABLE ledger_entries ENABLE TRIGGER ALL");
    await pool.query("DELETE FROM idempotency_keys");
    await pool.query("DELETE FROM transfers");
    await pool.query("DELETE FROM accounts");
});

afterAll(async () => {
    await pool.end();
});