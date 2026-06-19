import { Router } from "express";
import { register, login } from "../controllers/auth.controllers.js";
import { validate } from '../middlewares/validate.middleware.js';
import { registerSchema,loginSchema } from '../validators/auth.validators.js';
const router = Router();

/**
 * @swagger
 * /api/auth/register:
 * post:
 * summary: Register a new user
 * tags:
 * - Auth
 * requestBody:
 * required: true
 * content:
 * application/json:
 * schema:
 * type: object
 * required:
 * - username
 * - email
 * - password
 * properties:
 * username:
 * type: string
 * example: johndoe
 * email:
 * type: string
 * format: email
 * example: john@example.com
 * password:
 * type: string
 * format: password
 * example: StrongP@ssw0rd!
 * responses:
 * 201:
 * description: User registered successfully
 * 400:
 * description: Invalid input data or user already exists
 * 500:
 * description: Internal server error
 */
router.post("/register",validate(registerSchema), register);

/**
 * @swagger
 * /api/auth/login:
 * post:
 * summary: Authenticate a user and return a token
 * tags:
 * - Auth
 * requestBody:
 * required: true
 * content:
 * application/json:
 * schema:
 * type: object
 * required:
 * - email
 * - password
 * properties:
 * email:
 * type: string
 * format: email
 * example: john@example.com
 * password:
 * type: string
 * format: password
 * example: StrongP@ssw0rd!
 * responses:
 * 200:
 * description: Login successful, returns authentication token
 * 401:
 * description: Invalid email or password credentials
 * 500:
 * description: Internal server error
 */
router.post("/login", validate(loginSchema),login);

export default router;