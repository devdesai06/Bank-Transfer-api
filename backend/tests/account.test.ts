import request from "supertest";
import app from "../app.js";

describe("Account API", () => {

    // ── Create account ──────────────────────────────────────────────────────

    it("creates an account with a positive balance", async () => {
        const response = await request(app)
            .post("/api/account/create-account")
            .send({ name: "Testing", balance: 100000 });

        expect(response.status).toBe(201);
        expect(response.body.success).toBe(true);
        expect(response.body.data).toHaveProperty("id");
        expect(response.body.data.name).toBe("Testing");
        expect(Number(response.body.data.balance)).toBe(100000);
    });

    it("creates an account with zero balance", async () => {
        const response = await request(app)
            .post("/api/account/create-account")
            .send({ name: "ZeroBalance", balance: 0 });

        expect(response.status).toBe(201);
        expect(response.body.success).toBe(true);
        expect(Number(response.body.data.balance)).toBe(0);
    });

    it("rejects account creation with missing name", async () => {
        const response = await request(app)
            .post("/api/account/create-account")
            .send({ balance: 100 });

        expect(response.status).toBe(400);
        expect(response.body.success).toBe(false);
    });

    it("rejects account creation with negative balance", async () => {
        const response = await request(app)
            .post("/api/account/create-account")
            .send({ name: "NegativeBalance", balance: -100 });

        expect(response.status).toBe(400);
        expect(response.body.success).toBe(false);
    });

    it("rejects account creation with empty body", async () => {
        const response = await request(app)
            .post("/api/account/create-account")
            .send({});

        expect(response.status).toBe(400);
        expect(response.body.success).toBe(false);
    });

    // ── Get account by ID ───────────────────────────────────────────────────

    it("retrieves an account by ID", async () => {
        const created = await request(app)
            .post("/api/account/create-account")
            .send({ name: "FindMe", balance: 500 });

        const accountId = created.body.data.id;

        const response = await request(app)
            .get(`/api/account/get-account/${accountId}`);

        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
        expect(response.body.data.id).toBe(accountId);
        expect(response.body.data.name).toBe("FindMe");
    });

    it("returns 404 for a non-existent account ID", async () => {
        const response = await request(app)
            .get("/api/account/get-account/999999");

        expect(response.status).toBe(404);
        expect(response.body.success).toBe(false);
    });

    // ── Get account balance ─────────────────────────────────────────────────

    it("retrieves the balance for an existing account", async () => {
        const created = await request(app)
            .post("/api/account/create-account")
            .send({ name: "BalanceCheck", balance: 750 });

        const accountId = created.body.data.id;

        const response = await request(app)
            .get(`/api/account/${accountId}/balance`);

        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
        expect(Number(response.body.data.balance)).toBe(750);
    });

    it("returns 404 when fetching balance for a non-existent account", async () => {
        const response = await request(app)
            .get("/api/account/999999/balance");

        expect(response.status).toBe(404);
        expect(response.body.success).toBe(false);
    });

    // ── Reconciliation ──────────────────────────────────────────────────────

    it("returns 404 reconciliation for non-existent account", async () => {
        const response = await request(app)
            .get("/api/account/999999/reconcile");

        expect(response.status).toBe(404);
        expect(response.body.success).toBe(false);
    });
});