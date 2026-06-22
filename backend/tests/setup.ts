// tests/setup.ts
import pool from "../db/pool.js";
import { initDatabase } from "../db/init.js";

// Ensure all tables exist and a seeded test user (id=1) is present
// before any suite runs. The auth middleware in NODE_ENV=test injects
// { id: 1, username: "testuser" }, so user #1 must exist for FK checks.
beforeAll(async () => {
    await initDatabase();

    // Ensure test user id=1 always exists
    await pool.query(`
        INSERT INTO users (id, username, password)
        VALUES (1, 'testuser', 'hashed_password_placeholder')
        ON CONFLICT (id) DO NOTHING
    `);
});

// Wipe all transactional data between tests so each test starts clean.
// We deliberately keep the users table intact to preserve the seeded
// test user (id=1) required by the NODE_ENV=test auth bypass.
beforeEach(async () => {
    await pool.query("DELETE FROM outbox_events");
    await pool.query("ALTER TABLE ledger_entries DISABLE TRIGGER ALL");
    await pool.query("DELETE FROM ledger_entries");
    await pool.query("ALTER TABLE ledger_entries ENABLE TRIGGER ALL");
    await pool.query("DELETE FROM idempotency_keys");
    await pool.query("DELETE FROM transfers");
    await pool.query("DELETE FROM accounts");
    // Delete all non-seeded users (those created by auth tests)
    await pool.query("DELETE FROM users WHERE id != 1");
});

afterAll(async () => {
    await pool.end();
});