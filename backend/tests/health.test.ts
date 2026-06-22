import request from "supertest";
import app from "../app.js";

describe("Health Endpoint", () => {

    it("returns 200 with healthy status", async () => {
        const res = await request(app).get("/health");

        expect(res.status).toBe(200);
        expect(res.body.status).toBe("healthy");
        expect(res.body.database).toBe("connected");
    });

    it("returns JSON content-type", async () => {
        const res = await request(app).get("/health");

        expect(res.headers["content-type"]).toMatch(/json/);
    });
});

describe("404 Handling", () => {

    it("returns 404 for unknown routes", async () => {
        const res = await request(app).get("/api/does-not-exist");

        expect(res.status).toBe(404);
    });
});
