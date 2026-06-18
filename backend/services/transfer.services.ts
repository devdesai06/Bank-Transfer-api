import pool from "../db/pool.js";

export const transferMoney = async (
    fromAccountId: number,
    toAccountId: number,
    amount: number,
    idempotencyKey: string
) => {
    const client = await pool.connect();

    try {
        if (amount <= 0) {
            throw new Error("Amount must be greater than 0");
        }

        if (fromAccountId === toAccountId) {
            throw new Error("Cannot transfer to the same account");
        }
        await client.query("BEGIN");

        //try adding the idempotency key
        const keyResult = await client.query(
            `
            INSERT INTO idempotency_keys
            (
            idempotency_key
            )
            VALUES ($1)
            ON CONFLICT (idempotency_key)
            DO NOTHING
            RETURNING *
            `,
            [idempotencyKey]
        );

        //key already present
        if (keyResult.rows.length === 0) {
            const existingKey = await client.query(
                `Select * from idempotency_keys where idempotency_key=$1`,
                [idempotencyKey]
            )

            if (existingKey.rows[0].transfer_id) {

                const transfer =
                    await client.query(
                        `
                        SELECT *
                        FROM transfers
                        WHERE id = $1
                        `,
                        [existingKey.rows[0].transfer_id]
                    );
                await client.query("COMMIT");
                return transfer.rows[0];
            }
            throw new Error("Transfer already being processed");
        }

        // Prevent deadlocks by always locking in same order
        const firstId = Math.min(fromAccountId, toAccountId);
        const secondId = Math.max(fromAccountId, toAccountId);

        await client.query(
            `
            SELECT id
            FROM accounts
            WHERE id = $1
            FOR UPDATE
            `,
            [firstId]
        );

        await client.query(
            `
            SELECT id
            FROM accounts
            WHERE id = $1
            FOR UPDATE
            `,
            [secondId]
        );

        // Fetch actual sender
        const senderResult = await client.query(
            `
            SELECT *
            FROM accounts
            WHERE id = $1
            `,
            [fromAccountId]
        );

        const sender = senderResult.rows[0];

        if (!sender) {
            throw new Error("Sender account not found");
        }

        // Fetch actual receiver
        const receiverResult = await client.query(
            `
            SELECT *
            FROM accounts
            WHERE id = $1
            `,
            [toAccountId]
        );

        const receiver = receiverResult.rows[0];

        if (!receiver) {
            throw new Error("Receiver account not found");
        }

        if (Number(sender.balance) < amount) {
            throw new Error("Insufficient balance");
        }

        // Debit sender
        await client.query(
            `
            UPDATE accounts
            SET balance = balance - $1
            WHERE id = $2
            `,
            [amount, fromAccountId]
        );

        // Credit receiver
        await client.query(
            `
            UPDATE accounts
            SET balance = balance + $1
            WHERE id = $2
            `,
            [amount, toAccountId]
        );

        // Record transfer
        const transferResult = await client.query(
            `
            INSERT INTO transfers
            (
                from_account_id,
                to_account_id,
                amount
            )
            VALUES ($1, $2, $3)
            RETURNING *
            `,
            [fromAccountId, toAccountId, amount]
        );
        await client.query(
            `
            UPDATE idempotency_keys
            SET transfer_id = $1
            WHERE idempotency_key = $2
            `,
            [transferResult.rows[0].id, idempotencyKey]
        )
        await client.query("COMMIT");

        return transferResult.rows[0];

    } catch (error) {
        await client.query("ROLLBACK");
        throw error;
    } finally {
        client.release();
    }
};

export const getAllTransfers = async () => {
    const result = await pool.query(`
        SELECT *
        FROM transfers
        ORDER BY created_at DESC
    `);

    return result.rows;
};

export const getTransferById = async (
    transferId: number
) => {

    const result = await pool.query(
        `
        SELECT *
        FROM transfers
        WHERE id = $1
        `,
        [transferId]
    );

    return result.rows[0];
};