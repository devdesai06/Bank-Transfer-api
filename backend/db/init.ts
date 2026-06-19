import pool from "./pool.js";
import { logger } from "../utils/logger.js";

export async function initDatabase() {
    let retries = 5;
    while (retries > 0) {
        try {
            await pool.query(`
                CREATE TABLE IF NOT EXISTS accounts (
                    id SERIAL PRIMARY KEY,
                    name VARCHAR(255) NOT NULL,
                    balance NUMERIC(12,2) NOT NULL,
                    ownerid INTEGER REFERENCES users(id)
                );
            `);

            await pool.query(`
                CREATE TABLE IF NOT EXISTS transfers (
                    id SERIAL PRIMARY KEY,
                    from_account_id INTEGER REFERENCES accounts(id),
                    to_account_id INTEGER REFERENCES accounts(id),
                    amount NUMERIC(12,2) NOT NULL,
                    created_at TIMESTAMP DEFAULT NOW()
                );
            `);

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