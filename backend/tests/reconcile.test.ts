import request from "supertest";
import app from "../app.js";
import pool from "../db/pool.js";

describe("Account Reconciliation API", () => {
    it("returns matched true when ledger entries and stored balance match", async () => {
        // 1. Create a new account with 1000 balance
        const createResponse = await request(app)
            .post("/api/account/create-account")
            .send({
                name: "Reconcile Test Account",
                balance: 1000,
            });

        expect(createResponse.status).toBe(201);
        const accountId = createResponse.body.data.id;

        // 2. Query the reconciliation endpoint
        const reconcileResponse = await request(app)
            .get(`/api/account/${accountId}/reconcile`);

        expect(reconcileResponse.status).toBe(200);
        expect(reconcileResponse.body.success).toBe(true);
        expect(reconcileResponse.body.data).toEqual({
            accountId: accountId,
            ledgerBalance: 1000,
            storedBalance: 1000,
            matches: true,
        });
    });

    it("returns matched false when ledger entries and stored balance drift", async () => {
        // 1. Create a new account with 1000 balance
        const createResponse = await request(app)
            .post("/api/account/create-account")
            .send({
                name: "Drift Test Account",
                balance: 1000,
            });

        expect(createResponse.status).toBe(201);
        const accountId = createResponse.body.data.id;

        // 2. Artificially introduce drift by updating stored balance without adding a ledger entry
        await pool.query(
            "UPDATE accounts SET balance = balance + 250 WHERE id = $1",
            [accountId]
        );

        // 3. Query the reconciliation endpoint
        const reconcileResponse = await request(app)
            .get(`/api/account/${accountId}/reconcile`);

        expect(reconcileResponse.status).toBe(200);
        expect(reconcileResponse.body.success).toBe(true);
        expect(reconcileResponse.body.data).toEqual({
            accountId: accountId,
            ledgerBalance: 1000,
            storedBalance: 1250,
            matches: false,
        });
    });

    it("returns 404 for non-existent or unauthorized account ID", async () => {
        const reconcileResponse = await request(app)
            .get("/api/account/999999/reconcile");

        expect(reconcileResponse.status).toBe(404);
        expect(reconcileResponse.body.success).toBe(false);
    });
});
