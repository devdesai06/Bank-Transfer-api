import pool from "../db/pool.js";
import { logger } from "../utils/logger.js";

async function processOutboxEvents() {
    const client = await pool.connect();

    try {
        await client.query("BEGIN");

        // 1️⃣ Select pending events (with a row lock to prevent race conditions)
        const eventsResult = await client.query(
            `SELECT * FROM outbox_events WHERE processed = false ORDER BY created_at LIMIT 10 FOR UPDATE SKIP LOCKED`
        );

        const events = eventsResult.rows;

        if (events.length === 0) {
            await client.query("COMMIT");
            logger.debug("Outbox poll: no pending events found");
            return; // Nothing to do
        }

        logger.info({ count: events.length }, "Outbox worker: processing pending events");

        // 2️⃣ Process each event and publish to Redis
        for (const event of events) {
            const eventId = event.id;
            const payload = event.payload;
            const eventType = event.event_type;

            // 👉 Publish the event to Redis
            // await redisClient.publish(eventType, JSON.stringify(payload));

            // 👉 Mark as processed in the database
            await client.query(
                `UPDATE outbox_events SET processed = true, processed_at = NOW() WHERE id = $1`,
                [eventId]
            );
            logger.info({ eventId, eventType }, "Outbox event processed successfully");
        }

        await client.query("COMMIT");
        logger.info({ count: events.length }, "Outbox worker: all events committed successfully");
    } catch (error) {
        await client.query("ROLLBACK");
        logger.error({ error }, "Outbox worker: processing failed, transaction rolled back");
        throw error;
    } finally {
        client.release();
    }
}
