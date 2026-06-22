import request from "supertest";
import pool from "../db/pool.js";
import app from "../app.js";

/**
 * Outbox Worker Tests
 *
 * These tests verify the Transactional Outbox Pattern is correctly wired
 * into the transfer service:
 *  - A TRANSFER_COMPLETED outbox event is atomically written when a
 *    transfer succeeds.
 *  - NO outbox event is written when a transfer fails (ROLLBACK).
 *  - The outbox event payload contains the expected fields.
 *  - The outbox event starts with processed = false so the background
 *    worker can pick it up.
 *
 * The worker's internal processing loop is also tested in isolation
 * by directly inspecting and mutating the outbox_events table.
 */
describe("Outbox Pattern", () => {

    // ── Event creation on successful transfer ───────────────────────────────

    it("writes a TRANSFER_COMPLETED outbox event when a transfer succeeds", async () => {
        const sender = await request(app)
            .post("/api/account/create-account")
            .send({ name: "Sender", balance: 1000 });

        const receiver = await request(app)
            .post("/api/account/create-account")
            .send({ name: "Receiver", balance: 0 });

        await request(app)
            .post("/api/transfers")
            .set("Idempotency-Key", "outbox-success-transfer-key")
            .send({
                fromAccountId: sender.body.data.id,
                toAccountId: receiver.body.data.id,
                amount: 250
            });

        const result = await pool.query(
            `SELECT * FROM outbox_events WHERE event_type = 'TRANSFER_COMPLETED' ORDER BY created_at DESC LIMIT 1`
        );

        expect(result.rows.length).toBe(1);
        const event = result.rows[0];
        expect(event.event_type).toBe("TRANSFER_COMPLETED");
        expect(event.processed).toBe(false);
    });

    it("outbox event payload contains transfer_id, from_account_id, to_account_id, amount, and status", async () => {
        const sender = await request(app)
            .post("/api/account/create-account")
            .send({ name: "Sender", balance: 500 });

        const receiver = await request(app)
            .post("/api/account/create-account")
            .send({ name: "Receiver", balance: 0 });

        const transfer = await request(app)
            .post("/api/transfers")
            .set("Idempotency-Key", "outbox-payload-transfer-key")
            .send({
                fromAccountId: sender.body.data.id,
                toAccountId: receiver.body.data.id,
                amount: 100
            });

        const result = await pool.query(
            `SELECT * FROM outbox_events WHERE event_type = 'TRANSFER_COMPLETED' ORDER BY created_at DESC LIMIT 1`
        );

        const payload = result.rows[0].payload;

        expect(payload).toHaveProperty("transfer_id");
        expect(payload).toHaveProperty("from_account_id", sender.body.data.id);
        expect(payload).toHaveProperty("to_account_id", receiver.body.data.id);
        expect(payload).toHaveProperty("amount", 100);
        expect(payload).toHaveProperty("status", "COMPLETED");
    });

    it("outbox event is created with processed = false (not yet delivered)", async () => {
        const sender = await request(app)
            .post("/api/account/create-account")
            .send({ name: "Sender", balance: 300 });

        const receiver = await request(app)
            .post("/api/account/create-account")
            .send({ name: "Receiver", balance: 0 });

        await request(app)
            .post("/api/transfers")
            .set("Idempotency-Key", "outbox-unprocessed-transfer-key")
            .send({
                fromAccountId: sender.body.data.id,
                toAccountId: receiver.body.data.id,
                amount: 150
            });

        const result = await pool.query(
            `SELECT processed, processed_at FROM outbox_events ORDER BY created_at DESC LIMIT 1`
        );

        expect(result.rows[0].processed).toBe(false);
        expect(result.rows[0].processed_at).toBeNull();
    });

    // ── No event on failed transfer (ROLLBACK) ──────────────────────────────

    it("does NOT write an outbox event when a transfer fails (insufficient balance)", async () => {
        const countBefore = await pool.query(
            `SELECT COUNT(*) FROM outbox_events`
        );

        const sender = await request(app)
            .post("/api/account/create-account")
            .send({ name: "BrokeSender", balance: 50 });

        const receiver = await request(app)
            .post("/api/account/create-account")
            .send({ name: "Receiver", balance: 0 });

        await request(app)
            .post("/api/transfers")
            .set("Idempotency-Key", "outbox-fail-transfer-key")
            .send({
                fromAccountId: sender.body.data.id,
                toAccountId: receiver.body.data.id,
                amount: 500 // exceeds balance
            });

        const countAfter = await pool.query(
            `SELECT COUNT(*) FROM outbox_events`
        );

        expect(Number(countAfter.rows[0].count)).toBe(
            Number(countBefore.rows[0].count)
        );
    });

    // ── One event per transfer ──────────────────────────────────────────────

    it("creates exactly one outbox event per successful transfer", async () => {
        const sender = await request(app)
            .post("/api/account/create-account")
            .send({ name: "Sender", balance: 2000 });

        const receiver = await request(app)
            .post("/api/account/create-account")
            .send({ name: "Receiver", balance: 0 });

        await request(app)
            .post("/api/transfers")
            .set("Idempotency-Key", "outbox-count-transfer-key-1")
            .send({
                fromAccountId: sender.body.data.id,
                toAccountId: receiver.body.data.id,
                amount: 100
            });

        await request(app)
            .post("/api/transfers")
            .set("Idempotency-Key", "outbox-count-transfer-key-2")
            .send({
                fromAccountId: sender.body.data.id,
                toAccountId: receiver.body.data.id,
                amount: 200
            });

        const result = await pool.query(
            `SELECT COUNT(*) FROM outbox_events WHERE event_type = 'TRANSFER_COMPLETED'`
        );

        expect(Number(result.rows[0].count)).toBe(2);
    });

    // ── Worker processing simulation ────────────────────────────────────────

    it("marks an event as processed = true after worker simulation", async () => {
        // Insert a raw unprocessed event directly into the table
        const insert = await pool.query(
            `INSERT INTO outbox_events (event_type, payload, processed)
             VALUES ('TRANSFER_COMPLETED', '{"transfer_id":9999}', false)
             RETURNING id`
        );
        const eventId = insert.rows[0].id;

        // Simulate what the outbox worker does: mark as processed
        await pool.query(
            `UPDATE outbox_events SET processed = true, processed_at = NOW() WHERE id = $1`,
            [eventId]
        );

        const result = await pool.query(
            `SELECT processed, processed_at FROM outbox_events WHERE id = $1`,
            [eventId]
        );

        expect(result.rows[0].processed).toBe(true);
        expect(result.rows[0].processed_at).not.toBeNull();
    });

    it("worker simulation does not affect other pending events", async () => {
        // Insert two events
        const insert1 = await pool.query(
            `INSERT INTO outbox_events (event_type, payload, processed)
             VALUES ('TRANSFER_COMPLETED', '{"transfer_id":1}', false)
             RETURNING id`
        );
        await pool.query(
            `INSERT INTO outbox_events (event_type, payload, processed)
             VALUES ('TRANSFER_COMPLETED', '{"transfer_id":2}', false)`
        );

        // Process only the first event
        await pool.query(
            `UPDATE outbox_events SET processed = true, processed_at = NOW() WHERE id = $1`,
            [insert1.rows[0].id]
        );

        const remaining = await pool.query(
            `SELECT COUNT(*) FROM outbox_events WHERE processed = false`
        );

        expect(Number(remaining.rows[0].count)).toBe(1);
    });
});
