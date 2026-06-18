import request from "supertest";
import app from "../app.js";

describe("Concurrency Tests", () => {
    it("prevents double spending", async () => {

        const sender = await request(app)
            .post("/api/account/create-account")
            .send({
                name: "Sender",
                balance: 1000
            });

        const receiver = await request(app)
            .post("/api/account/create-account")
            .send({
                name: "Receiver",
                balance: 0
            });

        const senderId = sender.body.data.id;
        const receiverId = receiver.body.data.id;

        const transfer1 = request(app)
            .post("/api/transfers")
            .set("Idempotency-Key", "concurrency-key-1")
            .send({
                fromAccountId: senderId,
                toAccountId: receiverId,
                amount: 800
            });

        const transfer2 = request(app)
            .post("/api/transfers")
            .set("Idempotency-Key", "concurrency-key-2")
            .send({
                fromAccountId: senderId,
                toAccountId: receiverId,
                amount: 500
            });

        const results = await Promise.allSettled([
            transfer1,
            transfer2
        ]);

        const values = results
            .filter((r): r is PromiseFulfilledResult<any> => r.status === "fulfilled")
            .map(r => r.value);
        const success = values.filter(v => v.status === 201).length;
        const failed = values.filter(v => v.status === 400).length;

        expect(success).toBe(1);
        expect(failed).toBe(1);

        const senderBalance = await request(app)
            .get(`/api/account/${senderId}/balance`)
        expect(Number(senderBalance.body.data.balance)).toBeGreaterThanOrEqual(0);
    });

});