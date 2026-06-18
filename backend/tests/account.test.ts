import request from "supertest";
import app from '../app.js'

describe("Account API", () => {
    it("Creates an account", async () => {
        const response = await request(app)
            .post('/api/account/create-account')
            .send({
                name: "Testing",
                balance: 100000,
            })
        expect(response.status).toBe(201);
        expect(response.body.success).toBe(true);
    })
})