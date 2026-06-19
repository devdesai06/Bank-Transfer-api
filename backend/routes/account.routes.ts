import { Router } from 'express';
import { createAccount, getAccountById, getAccountBalance } from '../controllers/account.controllers.js';
import { authenticateToken } from '../middlewares/auth.middleware.js';
import { createAccountSchema } from '../validators/account.validators.js';
import { validate } from '../middlewares/validate.middleware.js';

const router = Router();

/**
 * @swagger
 * /api/account/create-account:
 *   post:
 *     summary: Create a new bank account
 *     tags:
 *       - Accounts
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *               - balance
 *             properties:
 *               name:
 *                 type: string
 *                 example: Dev Desai
 *               balance:
 *                 type: number
 *                 example: 10000
 *     responses:
 *       201:
 *         description: Account created successfully
 *       400:
 *         description: Name and balance are required
 *       500:
 *         description: Internal server error
 */
router.post('/create-account', authenticateToken, validate(createAccountSchema), createAccount);
/**
 * @swagger
 * /api/account/get-account/{id}:
 *   get:
 *     summary: Get account by ID
 *     tags:
 *       - Accounts
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         description: Account ID
 *         schema:
 *           type: integer
 *           example: 1
 *     responses:
 *       200:
 *         description: Account found successfully
 *       400:
 *         description: Invalid account ID
 *       404:
 *         description: Account not found
 *       500:
 *         description: Internal server error
 */
router.get('/get-account/:id', authenticateToken, getAccountById);

/**
 * @swagger
 * /api/account/{id}/balance:
 *   get:
 *     summary: Get account balance by ID
 *     tags:
 *       - Accounts
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         description: Account ID
 *         schema:
 *           type: integer
 *           example: 1
 *     responses:
 *       200:
 *         description: Account balance retrieved successfully
 *       400:
 *         description: Invalid account ID
 *       404:
 *         description: Account not found
 *       500:
 *         description: Internal server error
 */
router.get("/:id/balance", authenticateToken, getAccountBalance);

export default router;