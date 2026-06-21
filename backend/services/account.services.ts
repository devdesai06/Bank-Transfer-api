import pool from '../db/pool.js';

export const createAccount = async (name: string, balance: number, ownerId: number) => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // Create the account record
        const result = await client.query(
            `
            INSERT INTO accounts (name, balance, owner_id)
            VALUES ($1, $2, $3)
            RETURNING *
            `,
            [name, balance, ownerId]
        );
        const account = result.rows[0];

        // Record the opening balance as a DEPOSIT ledger entry so the
        // ledger-based balance check in transferMoney is always accurate
        if (balance > 0) {
            await client.query(
                `
                INSERT INTO ledger_entries (account_id, transfer_id, amount, entry_type)
                VALUES ($1, NULL, $2, 'DEPOSIT')
                `,
                [account.id, balance]
            );
        }

        await client.query('COMMIT');
        return account;
    } catch (error) {
        await client.query('ROLLBACK');
        throw error;
    } finally {
        client.release();
    }
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

export const getAccountByIdAndOwner = async(id:number,ownerId:number)=>{
    const result = await pool.query(
        `
        SELECT * FROM accounts WHERE id=$1 AND owner_id=$2
        `,
        [id,ownerId]
    );
    return result.rows[0]
}

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

export const reconcileAccount = async (accountId: number) => {
    const ledgerResult = await pool.query(
        `
        SELECT COALESCE(SUM(amount), 0) AS balance
        FROM ledger_entries
        WHERE account_id = $1
        `,
        [accountId]
    );

    const accountResult = await pool.query(
        `
        SELECT balance
        FROM accounts
        WHERE id = $1
        `,
        [accountId]
    );

    if (accountResult.rows.length === 0) {
        throw new Error("Account not found");
    }

    const ledgerBalance = Number(ledgerResult.rows[0].balance);
    const storedBalance = Number(accountResult.rows[0].balance);

    return {
        accountId,
        ledgerBalance,
        storedBalance,
        matches: ledgerBalance === storedBalance
    };
};



