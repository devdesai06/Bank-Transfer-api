import pool from '../db/pool.js';

export const createAccount = async (name: string, balance: number) => {
    const result = await pool.query(
        `
        INSERT INTO accounts (name,balance)
        VALUES ($1,$2)
        RETURNING *
        `,
        [name, balance]
    );
    return result.rows[0];
};

export const getAccountById = async (id: number) => {
    const result = await pool.query(
        `
        SELECT * FROM accounts WHERE id=$1
        `,
        [id]
    );
    return result.rows[0] ?? null;
};

export const getBalance = async (
    accountId: number
) => {

    const result = await pool.query(
        `
        SELECT balance
        FROM accounts
        WHERE id = $1
        `,
        [accountId]
    );

    return result.rows[0];
}; 


