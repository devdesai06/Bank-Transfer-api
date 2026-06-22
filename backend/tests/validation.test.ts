import request from "supertest";
import app from "../app.js";

/**
 * Validation tests — verify that the Zod schemas enforced via the
 * validate() middleware correctly reject malformed request bodies
 * before they reach any business logic.
 *
 * These tests do NOT rely on NODE_ENV=test bypass; they use the real
 * middleware stack so every validation layer is exercised.
 */
describe("Request Validation", () => {

    // ── Account creation schema ─────────────────────────────────────────────

    describe("POST /api/account/create-account", () => {

        it("rejects request when name is missing", async () => {
            const res = await request(app)
                .post("/api/account/create-account")
                .send({ balance: 1000 });

            expect(res.status).toBe(400);
            expect(res.body.success).toBe(false);
            expect(res.body.message).toBe("Invalid request body");
        });

        it("rejects request when balance is missing", async () => {
            const res = await request(app)
                .post("/api/account/create-account")
                .send({ name: "Dev" });

            expect(res.status).toBe(400);
            expect(res.body.success).toBe(false);
        });

        it("rejects request when name is an empty string", async () => {
            const res = await request(app)
                .post("/api/account/create-account")
                .send({ name: "", balance: 100 });

            expect(res.status).toBe(400);
            expect(res.body.success).toBe(false);
        });

        it("rejects request when balance is negative", async () => {
            const res = await request(app)
                .post("/api/account/create-account")
                .send({ name: "Dev", balance: -50 });

            expect(res.status).toBe(400);
            expect(res.body.success).toBe(false);
        });

        it("rejects request when balance is a non-numeric string", async () => {
            const res = await request(app)
                .post("/api/account/create-account")
                .send({ name: "Dev", balance: "not-a-number" });

            expect(res.status).toBe(400);
            expect(res.body.success).toBe(false);
        });

        it("rejects request with completely empty body", async () => {
            const res = await request(app)
                .post("/api/account/create-account")
                .send({});

            expect(res.status).toBe(400);
            expect(res.body.success).toBe(false);
        });
    });

    // ── Transfer creation schema ────────────────────────────────────────────

    describe("POST /api/transfers", () => {

        it("rejects transfer when fromAccountId is missing", async () => {
            const res = await request(app)
                .post("/api/transfers")
                .set("Idempotency-Key", "val-test-1")
                .send({ toAccountId: 2, amount: 100 });

            expect(res.status).toBe(400);
            expect(res.body.success).toBe(false);
        });

        it("rejects transfer when toAccountId is missing", async () => {
            const res = await request(app)
                .post("/api/transfers")
                .set("Idempotency-Key", "val-test-2")
                .send({ fromAccountId: 1, amount: 100 });

            expect(res.status).toBe(400);
            expect(res.body.success).toBe(false);
        });

        it("rejects transfer when amount is missing", async () => {
            const res = await request(app)
                .post("/api/transfers")
                .set("Idempotency-Key", "val-test-3")
                .send({ fromAccountId: 1, toAccountId: 2 });

            expect(res.status).toBe(400);
            expect(res.body.success).toBe(false);
        });

        it("rejects transfer when amount is zero", async () => {
            const res = await request(app)
                .post("/api/transfers")
                .set("Idempotency-Key", "val-test-4")
                .send({ fromAccountId: 1, toAccountId: 2, amount: 0 });

            expect(res.status).toBe(400);
            expect(res.body.success).toBe(false);
        });

        it("rejects transfer when amount is negative", async () => {
            const res = await request(app)
                .post("/api/transfers")
                .set("Idempotency-Key", "val-test-5")
                .send({ fromAccountId: 1, toAccountId: 2, amount: -100 });

            expect(res.status).toBe(400);
            expect(res.body.success).toBe(false);
        });

        it("rejects transfer when fromAccountId equals toAccountId (schema refine)", async () => {
            const res = await request(app)
                .post("/api/transfers")
                .set("Idempotency-Key", "val-test-6")
                .send({ fromAccountId: 5, toAccountId: 5, amount: 100 });

            expect(res.status).toBe(400);
            expect(res.body.success).toBe(false);
        });

        it("rejects transfer when account IDs are non-integer numbers", async () => {
            const res = await request(app)
                .post("/api/transfers")
                .set("Idempotency-Key", "val-test-7")
                .send({ fromAccountId: 1.5, toAccountId: 2, amount: 100 });

            expect(res.status).toBe(400);
            expect(res.body.success).toBe(false);
        });

        it("rejects transfer when account IDs are strings", async () => {
            const res = await request(app)
                .post("/api/transfers")
                .set("Idempotency-Key", "val-test-8")
                .send({ fromAccountId: "one", toAccountId: 2, amount: 100 });

            expect(res.status).toBe(400);
            expect(res.body.success).toBe(false);
        });

        it("rejects transfer with completely empty body", async () => {
            const res = await request(app)
                .post("/api/transfers")
                .set("Idempotency-Key", "val-test-9")
                .send({});

            expect(res.status).toBe(400);
            expect(res.body.success).toBe(false);
        });
    });

    // ── Auth schema ─────────────────────────────────────────────────────────

    describe("POST /api/auth/register", () => {

        it("returns validation error details in response body", async () => {
            const res = await request(app)
                .post("/api/auth/register")
                .send({ username: "ab", password: "pwd" }); // both fail rules

            expect(res.status).toBe(400);
            expect(res.body.success).toBe(false);
            // Zod flattened errors should be present
            expect(res.body.error).toBeDefined();
        });
    });
});
