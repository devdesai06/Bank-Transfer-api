import request from "supertest";
import app from "../app.js";

describe("Transfer API", () => {

    // ── Successful transfer ─────────────────────────────────────────────────

    it("transfers money successfully", async () => {
        const sender = await request(app)
            .post("/api/account/create-account")
            .send({ name: "Sender", balance: 1000 });

        const receiver = await request(app)
            .post("/api/account/create-account")
            .send({ name: "Receiver", balance: 0 });

        const transfer = await request(app)
            .post("/api/transfers")
            .set("Idempotency-Key", "transfer-success-key")
            .send({
                fromAccountId: sender.body.data.id,
                toAccountId: receiver.body.data.id,
                amount: 500
            });

        expect(transfer.status).toBe(201);
        expect(transfer.body.success).toBe(true);
        expect(transfer.body.data).toHaveProperty("id");
    });

    // ── Balance updates ─────────────────────────────────────────────────────

    it("deducts from sender and credits receiver correctly", async () => {
        const sender = await request(app)
            .post("/api/account/create-account")
            .send({ name: "Sender", balance: 1000 });

        const receiver = await request(app)
            .post("/api/account/create-account")
            .send({ name: "Receiver", balance: 0 });

        await request(app)
            .post("/api/transfers")
            .set("Idempotency-Key", "transfer-balance-key")
            .send({
                fromAccountId: sender.body.data.id,
                toAccountId: receiver.body.data.id,
                amount: 500
            });

        const senderBalance = await request(app)
            .get(`/api/account/${sender.body.data.id}/balance`);

        const receiverBalance = await request(app)
            .get(`/api/account/${receiver.body.data.id}/balance`);

        expect(Number(senderBalance.body.data.balance)).toBe(500);
        expect(Number(receiverBalance.body.data.balance)).toBe(500);
    });

    it("transfers the full available balance (boundary)", async () => {
        const sender = await request(app)
            .post("/api/account/create-account")
            .send({ name: "Sender", balance: 300 });

        const receiver = await request(app)
            .post("/api/account/create-account")
            .send({ name: "Receiver", balance: 0 });

        const transfer = await request(app)
            .post("/api/transfers")
            .set("Idempotency-Key", "transfer-exact-balance-key")
            .send({
                fromAccountId: sender.body.data.id,
                toAccountId: receiver.body.data.id,
                amount: 300
            });

        expect(transfer.status).toBe(201);

        const senderBalance = await request(app)
            .get(`/api/account/${sender.body.data.id}/balance`);
        expect(Number(senderBalance.body.data.balance)).toBe(0);
    });

    // ── Rejections ──────────────────────────────────────────────────────────

    it("rejects transfer with insufficient balance", async () => {
        const sender = await request(app)
            .post("/api/account/create-account")
            .send({ name: "Sender", balance: 1000 });

        const receiver = await request(app)
            .post("/api/account/create-account")
            .send({ name: "Receiver", balance: 0 });

        const transfer = await request(app)
            .post("/api/transfers")
            .set("Idempotency-Key", "transfer-insufficient-key")
            .send({
                fromAccountId: sender.body.data.id,
                toAccountId: receiver.body.data.id,
                amount: 1500
            });

        expect(transfer.status).toBe(400);
    });

    it("rejects transfer to a non-existent sender account", async () => {
        const receiver = await request(app)
            .post("/api/account/create-account")
            .send({ name: "Receiver", balance: 0 });

        const transfer = await request(app)
            .post("/api/transfers")
            .set("Idempotency-Key", "transfer-no-sender-key")
            .send({
                fromAccountId: 999999,
                toAccountId: receiver.body.data.id,
                amount: 100
            });

        expect(transfer.status).toBe(400);
    });

    it("rejects transfer to a non-existent receiver account", async () => {
        const sender = await request(app)
            .post("/api/account/create-account")
            .send({ name: "Sender", balance: 500 });

        const transfer = await request(app)
            .post("/api/transfers")
            .set("Idempotency-Key", "transfer-no-receiver-key")
            .send({
                fromAccountId: sender.body.data.id,
                toAccountId: 999999,
                amount: 100
            });

        expect(transfer.status).toBe(400);
    });

    it("rejects transfer if Idempotency-Key header is missing", async () => {
        const response = await request(app)
            .post("/api/transfers")
            .send({ fromAccountId: 1, toAccountId: 2, amount: 100 });

        expect(response.status).toBe(400);
        expect(response.body.success).toBe(false);
    });

    // ── Rollback on failure ─────────────────────────────────────────────────

    it("leaves balances unchanged after a failed transfer", async () => {
        const sender = await request(app)
            .post("/api/account/create-account")
            .send({ name: "Sender", balance: 1000 });

        const receiver = await request(app)
            .post("/api/account/create-account")
            .send({ name: "Receiver", balance: 0 });

        await request(app)
            .post("/api/transfers")
            .set("Idempotency-Key", "transfer-rollback-key")
            .send({
                fromAccountId: sender.body.data.id,
                toAccountId: receiver.body.data.id,
                amount: 1500
            });

        const senderBalance = await request(app)
            .get(`/api/account/${sender.body.data.id}/balance`);

        const receiverBalance = await request(app)
            .get(`/api/account/${receiver.body.data.id}/balance`);

        expect(Number(senderBalance.body.data.balance)).toBe(1000);
        expect(Number(receiverBalance.body.data.balance)).toBe(0);
    });

    // ── Idempotency ─────────────────────────────────────────────────────────

    it("returns the same transfer for duplicate idempotency key", async () => {
        const sender = await request(app)
            .post("/api/account/create-account")
            .send({ name: "Sender", balance: 1000 });

        const receiver = await request(app)
            .post("/api/account/create-account")
            .send({ name: "Receiver", balance: 0 });

        const key = "transfer-idempotency-same-key";

        const transfer1 = await request(app)
            .post("/api/transfers")
            .set("Idempotency-Key", key)
            .send({
                fromAccountId: sender.body.data.id,
                toAccountId: receiver.body.data.id,
                amount: 500
            });

        const transfer2 = await request(app)
            .post("/api/transfers")
            .set("Idempotency-Key", key)
            .send({
                fromAccountId: sender.body.data.id,
                toAccountId: receiver.body.data.id,
                amount: 500
            });

        expect(transfer1.body.data.id).toBe(transfer2.body.data.id);
    });

    it("money is debited only once for duplicate idempotency key", async () => {
        const sender = await request(app)
            .post("/api/account/create-account")
            .send({ name: "Sender", balance: 1000 });

        const receiver = await request(app)
            .post("/api/account/create-account")
            .send({ name: "Receiver", balance: 0 });

        const key = "transfer-idempotency-debit-check";

        await request(app)
            .post("/api/transfers")
            .set("Idempotency-Key", key)
            .send({
                fromAccountId: sender.body.data.id,
                toAccountId: receiver.body.data.id,
                amount: 400
            });

        await request(app)
            .post("/api/transfers")
            .set("Idempotency-Key", key)
            .send({
                fromAccountId: sender.body.data.id,
                toAccountId: receiver.body.data.id,
                amount: 400
            });

        const senderBalance = await request(app)
            .get(`/api/account/${sender.body.data.id}/balance`);

        // Only one debit should have occurred
        expect(Number(senderBalance.body.data.balance)).toBe(600);
    });

    // ── Get transfer by ID ──────────────────────────────────────────────────

    it("retrieves a transfer by its ID", async () => {
        const sender = await request(app)
            .post("/api/account/create-account")
            .send({ name: "Sender", balance: 800 });

        const receiver = await request(app)
            .post("/api/account/create-account")
            .send({ name: "Receiver", balance: 0 });

        const created = await request(app)
            .post("/api/transfers")
            .set("Idempotency-Key", "transfer-get-by-id-key")
            .send({
                fromAccountId: sender.body.data.id,
                toAccountId: receiver.body.data.id,
                amount: 100
            });

        const transferId = created.body.data.id;

        const response = await request(app)
            .get(`/api/transfers/${transferId}`);

        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
        expect(response.body.data.id).toBe(transferId);
    });

    it("returns 404 for a non-existent transfer ID", async () => {
        const response = await request(app)
            .get("/api/transfers/999999");

        expect(response.status).toBe(404);
        expect(response.body.success).toBe(false);
    });

    // ── Get all transfers ───────────────────────────────────────────────────

    it("returns all transfers for the authenticated user", async () => {
        const sender = await request(app)
            .post("/api/account/create-account")
            .send({ name: "Sender", balance: 2000 });

        const receiver = await request(app)
            .post("/api/account/create-account")
            .send({ name: "Receiver", balance: 0 });

        await request(app)
            .post("/api/transfers")
            .set("Idempotency-Key", "transfer-list-key-1")
            .send({
                fromAccountId: sender.body.data.id,
                toAccountId: receiver.body.data.id,
                amount: 100
            });

        await request(app)
            .post("/api/transfers")
            .set("Idempotency-Key", "transfer-list-key-2")
            .send({
                fromAccountId: sender.body.data.id,
                toAccountId: receiver.body.data.id,
                amount: 200
            });

        const response = await request(app)
            .get("/api/transfers");

        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
        expect(Array.isArray(response.body.data)).toBe(true);
        expect(response.body.data.length).toBeGreaterThanOrEqual(2);
    });

    it("returns an empty array when the user has no transfers", async () => {
        const response = await request(app)
            .get("/api/transfers");

        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
        expect(Array.isArray(response.body.data)).toBe(true);
        expect(response.body.data.length).toBe(0);
    });
});