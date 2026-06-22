import pool from "./pool.js";
import { logger } from "../utils/logger.js";

export async function initDatabase() {
    let retries = 5;
    while (retries > 0) {
        try {
            await pool.query(`
                DO $$ BEGIN
                    CREATE TYPE transfer_status AS ENUM ('PENDING', 'COMPLETED', 'FAILED');
                EXCEPTION
                    WHEN duplicate_object THEN null;
                END $$;

                DO $$ BEGIN
                    CREATE TYPE ledger_entry_type AS ENUM ('CREDIT', 'DEBIT');
                EXCEPTION
                    WHEN duplicate_object THEN null;
                END $$;
            `);
            logger.debug("Types ready");

            await pool.query(
                `
                CREATE TABLE IF NOT EXISTS users(
                    id SERIAL PRIMARY KEY,
                    username VARCHAR(255) NOT NULL,
                    password VARCHAR(255) NOT NULL,
                    created_at TIMESTAMP DEFAULT NOW()
                ) 
                `
            )
            logger.debug("Table ready: users");

            await pool.query(`
                CREATE TABLE IF NOT EXISTS accounts (
                    id SERIAL PRIMARY KEY,
                    name VARCHAR(255) NOT NULL,
                    balance NUMERIC(12,2) NOT NULL,
                    owner_id INTEGER REFERENCES users(id),
                    CONSTRAINT chk_account_balance_non_negative CHECK (balance >= 0)
                );
            `);
            logger.debug("Table ready: accounts");

            await pool.query(`
                CREATE TABLE IF NOT EXISTS transfers (
                    id SERIAL PRIMARY KEY,
                    from_account_id INTEGER REFERENCES accounts(id),
                    to_account_id INTEGER REFERENCES accounts(id),
                    amount NUMERIC(12,2) NOT NULL,
                    created_at TIMESTAMP DEFAULT NOW(),
                    status transfer_status NOT NULL DEFAULT 'PENDING',
                    CONSTRAINT chk_different_accounts CHECK (from_account_id <> to_account_id),
                    CONSTRAINT chk_transfer_amount_positive CHECK (amount > 0)
                );
            `);
            logger.debug("Table ready: transfers");

            await pool.query(
                `CREATE TABLE IF NOT EXISTS idempotency_keys (
                    id SERIAL PRIMARY KEY,
                    idempotency_key VARCHAR(255)
                    UNIQUE NOT NULL,
                    transfer_id INTEGER
                    REFERENCES transfers(id),
                    created_at TIMESTAMP DEFAULT NOW()
                    );`
            )
            logger.debug("Table ready: idempotency_keys");

            await pool.query(
                `CREATE TABLE IF NOT EXISTS outbox_events (
                    id BIGSERIAL PRIMARY KEY,
                    event_type TEXT NOT NULL,
                    payload JSONB NOT NULL,
                    processed BOOLEAN NOT NULL DEFAULT FALSE,
                    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
                    processed_at TIMESTAMP
                );`
            )
            logger.debug("Table ready: outbox_events");

            await pool.query(`
                CREATE TABLE IF NOT EXISTS ledger_entries (
                    id BIGSERIAL PRIMARY KEY,
                    account_id BIGINT NOT NULL REFERENCES accounts(id),
                    transfer_id BIGINT REFERENCES transfers(id),
                    amount NUMERIC(18,2) NOT NULL,
                    entry_type ledger_entry_type NOT NULL,
                    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
                    CONSTRAINT chk_ledger_amount_non_zero CHECK (amount <> 0)
                );

                CREATE INDEX IF NOT EXISTS idx_ledger_account ON ledger_entries(account_id);
                CREATE INDEX IF NOT EXISTS idx_ledger_created_at ON ledger_entries(created_at);
                CREATE INDEX IF NOT EXISTS idx_ledger_transfer ON ledger_entries(transfer_id);

                CREATE OR REPLACE FUNCTION prevent_ledger_modification()
                RETURNS trigger
                LANGUAGE plpgsql
                AS $$
                BEGIN
                    RAISE EXCEPTION 'Ledget modification is illegal';
                END;
                $$;

                DROP TRIGGER IF EXISTS ledger_update ON ledger_entries;
                CREATE TRIGGER ledger_update
                BEFORE DELETE OR UPDATE ON ledger_entries
                FOR EACH ROW
                EXECUTE FUNCTION prevent_ledger_modification();
            `);
            logger.debug("Table ready: ledger_entries");

            logger.info("Database initialized successfully.");
            break;
        } catch (error) {
            retries--;
            logger.error({ error, retries }, `Database connection failed. Retries remaining: ${retries}`);
            if (retries === 0) {
                throw error;
            }
            await new Promise((resolve) => setTimeout(resolve, 2000));
        }
    }
}