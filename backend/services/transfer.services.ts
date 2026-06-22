import pool from "../db/pool.js";
import { logger } from "../utils/logger.js";

export const transferMoney = async (
    fromAccountId: number,
    toAccountId: number,
    amount: number,
    idempotencyKey: string,
    userId: number
) => {
    const client = await pool.connect();
    let transferId: number | undefined;

    try {
        if (amount <= 0) {
            logger.warn({ amount }, "Transfer rejected: amount must be greater than 0");
            throw new Error("Amount must be greater than 0");
        }

        if (fromAccountId === toAccountId) {
            logger.warn({ fromAccountId }, "Transfer rejected: cannot transfer to the same account");
            throw new Error("Cannot transfer to the same account");
        }

        // ── Phase 1: Idempotency check (outside the main transaction) ──────
        // We INSERT the idempotency key before BEGIN so that the ON CONFLICT
        // guard works correctly even if two concurrent requests race here.

        await client.query("BEGIN");

        logger.debug({ idempotencyKey }, "Checking idempotency key");
        const keyResult = await client.query(
            `
            INSERT INTO idempotency_keys (idempotency_key)
            VALUES ($1)
            ON CONFLICT (idempotency_key) DO NOTHING
            RETURNING *
            `,
            [idempotencyKey]
        );

        // Key was already present → duplicate request
        if (keyResult.rows.length === 0) {
            logger.warn({ idempotencyKey }, "Duplicate request detected via idempotency key");
            const existingKey = await client.query(
                `SELECT * FROM idempotency_keys WHERE idempotency_key = $1 FOR UPDATE`,
                [idempotencyKey]
            );

            if (existingKey.rows[0]?.transfer_id) {
                // A previous request already completed — return that transfer
                logger.info({ idempotencyKey, transferId: existingKey.rows[0].transfer_id }, "Returning existing completed transfer (idempotent)");
                const transfer = await client.query(
                    `SELECT * FROM transfers WHERE id = $1`,
                    [existingKey.rows[0].transfer_id]
                );
                await client.query("COMMIT");
                return transfer.rows[0];
            }
            throw new Error("Transfer already being processed");
        }

        // Prevent deadlocks by acquiring exclusive locks on accounts in deterministic order first
        const firstId = Math.min(fromAccountId, toAccountId);
        const secondId = Math.max(fromAccountId, toAccountId);
        logger.debug({ firstId, secondId }, "Acquiring row locks in deterministic order");

        await client.query(
            `SELECT id FROM accounts WHERE id = $1 FOR UPDATE`,
            [firstId]
        );
        await client.query(
            `SELECT id FROM accounts WHERE id = $1 FOR UPDATE`,
            [secondId]
        );

        // Fetch actual sender and verify if they exist and are authorized
        const senderResult = await client.query(
            `SELECT * FROM accounts WHERE id = $1`,
            [fromAccountId]
        );
        const sender = senderResult.rows[0];

        if (!sender) {
            logger.warn({ fromAccountId }, "Transfer rejected: sender account not found");
            throw new Error("Sender account not found");
        }
        if (sender.owner_id !== userId) {
            logger.warn({ fromAccountId, userId }, "Transfer rejected: unauthorized sender");
            throw new Error("Unauthorized to transfer from this account");
        }

        // Fetch actual receiver
        const receiverResult = await client.query(
            `SELECT * FROM accounts WHERE id = $1`,
            [toAccountId]
        );
        const receiver = receiverResult.rows[0];

        if (!receiver) {
            logger.warn({ toAccountId }, "Transfer rejected: receiver account not found");
            throw new Error("Receiver account not found");
        }

        // Insert the transfer record in PENDING state
        logger.debug({ fromAccountId, toAccountId, amount }, "Inserting transfer record in PENDING state");
        const transferResult = await client.query(
            `
            INSERT INTO transfers (from_account_id, to_account_id, amount, status)
            VALUES ($1, $2, $3, 'PENDING')
            RETURNING id
            `,
            [fromAccountId, toAccountId, amount]
        );
        transferId = transferResult.rows[0].id;

        // Link the idempotency key to this transfer now that we have an id
        await client.query(
            `
            UPDATE idempotency_keys
            SET transfer_id = $1
            WHERE idempotency_key = $2
            `,
            [transferId, idempotencyKey]
        );

        await client.query(
            `UPDATE transfers SET status = 'PROCESSING' WHERE id = $1`,
            [transferId]
        );
        logger.debug({ transferId }, "Transfer status set to PROCESSING");

        const balanceResult = await client.query(
            `SELECT COALESCE(SUM(amount),0) AS balance
            FROM ledger_entries
            WHERE account_id = $1
`,
            [fromAccountId]
        );

        const ledgerBalance = Number(
            balanceResult.rows[0].balance
        );

        if (ledgerBalance < amount) {
            logger.warn({ transferId, ledgerBalance, amount }, "Transfer rejected: insufficient balance");
            throw new Error("Insufficient balance");
        }

        // Ledger entry: debit sender
        logger.debug({ transferId, fromAccountId, amount }, "Writing debit ledger entry");
        await client.query(
            `
            INSERT INTO ledger_entries (account_id, transfer_id, amount, entry_type)
            VALUES ($1, $2, $3, 'TRANSFER_OUT')
            `,
            [fromAccountId, transferId, -amount]
        );

        // Ledger entry: credit receiver
        logger.debug({ transferId, toAccountId, amount }, "Writing credit ledger entry");
        await client.query(
            `
            INSERT INTO ledger_entries (account_id, transfer_id, amount, entry_type)
            VALUES ($1, $2, $3, 'TRANSFER_IN')
            `,
            [toAccountId, transferId, amount]
        );

        // Update balances
        await client.query(
            `UPDATE accounts SET balance = balance - $1 WHERE id = $2`,
            [amount, fromAccountId]
        );
        await client.query(
            `UPDATE accounts SET balance = balance + $1 WHERE id = $2`,
            [amount, toAccountId]
        );

        await client.query(
            `UPDATE transfers SET status = 'COMPLETED' WHERE id = $1`,
            [transferId]
        );
        logger.debug({ transferId }, "Transfer status set to COMPLETED");

        //add outbox event
        logger.debug({ transferId }, "Writing TRANSFER_COMPLETED outbox event");
        await client.query(
            `INSERT INTO  outbox_events (event_type,payload,processed)
            VALUES ($1,$2,$3)`,
            [
                "TRANSFER_COMPLETED",
                JSON.stringify({
                    "transfer_id":transferId,
                    "from_account_id":fromAccountId,
                    "to_account_id":toAccountId,
                    "amount":amount,
                    "status":"COMPLETED"
                }),
                false
            ]

        )

        await client.query("COMMIT");
        logger.info({ transferId, fromAccountId, toAccountId, amount }, "Transfer completed successfully");

        const finalResult = await client.query(
            `SELECT * FROM transfers WHERE id = $1`,
            [transferId]
        );

        return finalResult.rows[0];

    } catch (error) {
        await client.query("ROLLBACK");
        logger.error({ error, transferId }, "Transfer failed, transaction rolled back");
        if (transferId) {
            // Mark as FAILED outside the rolled-back transaction
            await pool.query(
                `UPDATE transfers SET status = 'FAILED' WHERE id = $1`,
                [transferId]
            );
            logger.warn({ transferId }, "Transfer marked as FAILED");
        }
        throw error;
    } finally {
        client.release();
    }
};

export const getAllTransfers = async (userId: number) => {
    const result = await pool.query(`
        SELECT t.*
        FROM transfers t
        JOIN accounts a_from ON t.from_account_id = a_from.id
        JOIN accounts a_to   ON t.to_account_id   = a_to.id
        WHERE a_from.owner_id = $1 OR a_to.owner_id = $1
        ORDER BY t.created_at DESC
    `, [userId]);

    return result.rows;
};

export const getTransferById = async (
    transferId: number,
    userId: number
) => {
    const result = await pool.query(
        `
        SELECT t.*
        FROM transfers t
        JOIN accounts a_from ON t.from_account_id = a_from.id
        JOIN accounts a_to   ON t.to_account_id   = a_to.id
        WHERE t.id = $1 AND (a_from.owner_id = $2 OR a_to.owner_id = $2)
        `,
        [transferId, userId]
    );

    return result.rows[0];
};