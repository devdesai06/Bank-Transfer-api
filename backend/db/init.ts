import pool from "./pool.js";
import { logger } from "../utils/logger.js";

export async function initDatabase() {
    let retries = 5;
    while (retries > 0) {
        try {
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
                    owner_id INTEGER REFERENCES users(id)
                );
            `);
            logger.debug("Table ready: accounts");

            await pool.query(`
                CREATE TABLE IF NOT EXISTS transfers (
                    id SERIAL PRIMARY KEY,
                    from_account_id INTEGER REFERENCES accounts(id),
                    to_account_id INTEGER REFERENCES accounts(id),
                    amount NUMERIC(12,2) NOT NULL,
                    created_at TIMESTAMP DEFAULT NOW()
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