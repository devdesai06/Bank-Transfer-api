import request from "supertest";
import app from "../app.js";

describe("Transfer API", () => {

    it("transfers money successfully", async () => {

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

        const transfer = await request(app)
            .post("/api/transfers")
            .set("Idempotency-Key", "success-test-key")
            .send({
                fromAccountId: sender.body.data.id,
                toAccountId: receiver.body.data.id,
                amount: 500
            });

        expect(transfer.status).toBe(201);

    });

    it("updates balances correctly", async () => {

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

        const transfer = await request(app)
            .post("/api/transfers")
            .set("Idempotency-Key", "balance-test-key")
            .send({
                fromAccountId: sender.body.data.id,
                toAccountId: receiver.body.data.id,
                amount: 500
            });

        const senderBalance = await request(app)
            .get(`/api/account/${sender.body.data.id}/balance`)

        const receiverBalance = await request(app)
            .get(`/api/account/${receiver.body.data.id}/balance`)

        expect(Number(senderBalance.body.data.balance)).toBe(500)
        expect(Number(receiverBalance.body.data.balance)).toBe(500)

    });

    it("rejects insufficient balance transfer", async () => {

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

        const transfer = await request(app)
            .post("/api/transfers")
            .set("Idempotency-Key", "insufficient-test-key")
            .send({
                fromAccountId: sender.body.data.id,
                toAccountId: receiver.body.data.id,
                amount: 1500
            });

        expect(transfer.status).toBe(400);

    });

    it("Verify Rollback", async () => {

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

        const transfer = await request(app)
            .post("/api/transfers")
            .set("Idempotency-Key", "rollback-test-key")
            .send({
                fromAccountId: sender.body.data.id,
                toAccountId: receiver.body.data.id,
                amount: 1500
            });

        const senderBalance = await request(app)
            .get(`/api/account/${sender.body.data.id}/balance`)

        const receiverBalance = await request(app)
            .get(`/api/account/${receiver.body.data.id}/balance`)

        expect(Number(senderBalance.body.data.balance)).toBe(1000)
        expect(Number(receiverBalance.body.data.balance)).toBe(0)
    })



    it("should reject transfer if Idempotency-Key header is missing", async () => {
        const response = await request(app)
            .post("/api/transfers")
            .send({
                fromAccountId: 1,
                toAccountId: 2,
                amount: 100
            });

        expect(response.status).toBe(400);
        expect(response.body.success).toBe(false);
    });

    it("prevents duplicate transfer", async () => {
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

        const key = "same-key";

        const transfer1 =
            await request(app)
                .post("/api/transfers")
                .set(
                    "Idempotency-Key",
                    key
                )
                .send({
                    fromAccountId:
                        sender.body.data.id,
                    toAccountId:
                        receiver.body.data.id,
                    amount: 500
                });

        const transfer2 =
            await request(app)
                .post("/api/transfers")
                .set(
                    "Idempotency-Key",
                    key
                )
                .send({
                    fromAccountId:
                        sender.body.data.id,
                    toAccountId:
                        receiver.body.data.id,
                    amount: 500
                });

        expect(
            transfer1.body.data.id
        ).toBe(
            transfer2.body.data.id
        );
    })

});