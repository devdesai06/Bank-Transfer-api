import request from "supertest";
import app from "../app.js";

describe("Auth API", () => {

    // ── Registration ────────────────────────────────────────────────────────

    it("registers a new user successfully", async () => {
        const response = await request(app)
            .post("/api/auth/register")
            .send({ username: "newreguser", password: "password123" });

        expect(response.status).toBe(201);
        expect(response.body.success).toBe(true);
        expect(response.body.data).toHaveProperty("token");
        expect(response.body.data.user).toHaveProperty("id");
        expect(response.body.data.user.username).toBe("newreguser");
    });

    it("rejects registration when username is already taken", async () => {
        // First registration — should succeed
        await request(app)
            .post("/api/auth/register")
            .send({ username: "duplicate", password: "password123" });

        // Second registration with the same username — should fail
        const response = await request(app)
            .post("/api/auth/register")
            .send({ username: "duplicate", password: "password456" });

        expect(response.status).toBe(400);
        expect(response.body.success).toBe(false);
    });

    it("rejects registration with username shorter than 3 characters", async () => {
        const response = await request(app)
            .post("/api/auth/register")
            .send({ username: "ab", password: "password123" });

        expect(response.status).toBe(400);
        expect(response.body.success).toBe(false);
    });

    it("rejects registration with username longer than 20 characters", async () => {
        const response = await request(app)
            .post("/api/auth/register")
            .send({ username: "a".repeat(21), password: "password123" });

        expect(response.status).toBe(400);
        expect(response.body.success).toBe(false);
    });

    it("rejects registration with special characters in username", async () => {
        const response = await request(app)
            .post("/api/auth/register")
            .send({ username: "bad user!", password: "password123" });

        expect(response.status).toBe(400);
        expect(response.body.success).toBe(false);
    });

    it("rejects registration with password shorter than 6 characters", async () => {
        const response = await request(app)
            .post("/api/auth/register")
            .send({ username: "validuser", password: "abc" });

        expect(response.status).toBe(400);
        expect(response.body.success).toBe(false);
    });

    it("rejects registration with missing username", async () => {
        const response = await request(app)
            .post("/api/auth/register")
            .send({ password: "password123" });

        expect(response.status).toBe(400);
        expect(response.body.success).toBe(false);
    });

    it("rejects registration with missing password", async () => {
        const response = await request(app)
            .post("/api/auth/register")
            .send({ username: "validuser" });

        expect(response.status).toBe(400);
        expect(response.body.success).toBe(false);
    });

    it("rejects registration with empty body", async () => {
        const response = await request(app)
            .post("/api/auth/register")
            .send({});

        expect(response.status).toBe(400);
        expect(response.body.success).toBe(false);
    });

    // ── Login ───────────────────────────────────────────────────────────────

    it("logs in a registered user and returns a token", async () => {
        await request(app)
            .post("/api/auth/register")
            .send({ username: "loginuser", password: "password123" });

        const response = await request(app)
            .post("/api/auth/login")
            .send({ username: "loginuser", password: "password123" });

        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
        expect(response.body.data).toHaveProperty("token");
        expect(response.body.data.user.username).toBe("loginuser");
    });

    it("rejects login with incorrect password", async () => {
        await request(app)
            .post("/api/auth/register")
            .send({ username: "wrongpass", password: "password123" });

        const response = await request(app)
            .post("/api/auth/login")
            .send({ username: "wrongpass", password: "wrongpassword" });

        expect(response.status).toBe(401);
        expect(response.body.success).toBe(false);
    });

    it("rejects login for a non-existent user", async () => {
        const response = await request(app)
            .post("/api/auth/login")
            .send({ username: "ghostuser", password: "password123" });

        expect(response.status).toBe(404);
        expect(response.body.success).toBe(false);
    });

    it("rejects login with missing username", async () => {
        const response = await request(app)
            .post("/api/auth/login")
            .send({ password: "password123" });

        expect(response.status).toBe(400);
        expect(response.body.success).toBe(false);
    });

    it("rejects login with missing password", async () => {
        const response = await request(app)
            .post("/api/auth/login")
            .send({ username: "someuser" });

        expect(response.status).toBe(400);
        expect(response.body.success).toBe(false);
    });

    it("rejects login with empty body", async () => {
        const response = await request(app)
            .post("/api/auth/login")
            .send({});

        expect(response.status).toBe(400);
        expect(response.body.success).toBe(false);
    });

    // ── Token integrity ─────────────────────────────────────────────────────

    it("returns a valid JWT that can be used on protected routes", async () => {
        const reg = await request(app)
            .post("/api/auth/register")
            .send({ username: "tokenuser", password: "password123" });

        const token = reg.body.data.token;

        // Use the token to create an account (a protected route)
        const accountResp = await request(app)
            .post("/api/account/create-account")
            .set("Authorization", `Bearer ${token}`)
            .send({ name: "My Account", balance: 1000 });

        expect(accountResp.status).toBe(201);
    });
});
