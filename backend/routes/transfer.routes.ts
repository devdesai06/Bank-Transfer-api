import { Router } from "express";
import { createTransfer, getTransfer, getTransfers } from "../controllers/transfer.controllers.js";
import { authenticateToken } from "../middlewares/auth.middleware.js";
import { createTransferSchema } from "../validators/transfer.validators.js";
import { validate } from "../middlewares/validate.middleware.js"; 
import {transferRateLimiter} from "../middlewares/rateLimiter.middleware.js"

const router = Router();

/**
 * @swagger
 * /api/transfers:
 *   post:
 *     summary: Transfer money between two accounts
 *     tags:
 *       - Transfers
 *     parameters:
 *       - in: header
 *         name: Idempotency-Key
 *         required: true
 *         description: Unique key used to prevent duplicate transfers
 *         schema:
 *           type: string
 *           example: transfer-123
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - fromAccountId
 *               - toAccountId
 *               - amount
 *             properties:
 *               fromAccountId:
 *                 type: integer
 *                 example: 1
 *               toAccountId:
 *                 type: integer
 *                 example: 2
 *               amount:
 *                 type: number
 *                 example: 500
 *     responses:
 *       201:
 *         description: Transfer completed successfully
 *       400:
 *         description: Invalid request, insufficient balance, or duplicate transfer in progress
 *       500:
 *         description: Internal server error
 */
router.post("/", authenticateToken,validate(createTransferSchema), transferRateLimiter, createTransfer);


/**
 * @swagger
 * /api/transfers/{id}:
 *   get:
 *     summary: Get transfer by ID
 *     tags:
 *       - Transfers
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         description: Transfer ID
 *         schema:
 *           type: integer
 *           example: 1
 *     responses:
 *       200:
 *         description: Transfer found successfully
 *       404:
 *         description: Transfer not found
 *       500:
 *         description: Internal server error
 */
router.get("/:id", authenticateToken, getTransfer);


/**
 * @swagger
 * /api/transfers:
 *   get:
 *     summary: Get all transfers
 *     tags:
 *       - Transfers
 *     responses:
 *       200:
 *         description: List of all transfers
 *       500:
 *         description: Internal server error
 */
router.get("/", authenticateToken, getTransfers);
export default router;