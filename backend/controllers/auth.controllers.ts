import type { Request, Response, NextFunction } from 'express';
import { findUserByUsername, insertUser } from '../services/auth.services.js';
import { logger } from '../utils/logger.js';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';

// Make sure your JWT_SECRET check handles empty strings safely
const JWT_SECRET = process.env.JWT_SECRET || 'fallback_secret';

export const register = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        const { username, password } = req.body;



        logger.info({ username }, "Attempting to register user");
        const user = await findUserByUsername(username);
        if (user) {
            logger.warn({ username }, "User already exists");
            res.status(400).json({
                success: false,
                message: 'User already exists'
            });
            return;
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        const createdUser = await insertUser(username, hashedPassword);

        const token = jwt.sign(
            {
                id: createdUser.id,
                username: createdUser.username
            },
            JWT_SECRET,
            {
                expiresIn: "7d"
            }
        );

        logger.info({ username, userId: createdUser.id }, "User registered successfully");

        res.status(201).json({
            success: true,
            data: {
                token,
                user: {
                    id: createdUser.id,
                    username: createdUser.username,
                    created_at: createdUser.created_at
                },
            }
        });

    } catch (error) {
        logger.error({ error }, 'Failed to register user');
        res.status(500).json({
            success: false,
            message: error instanceof Error ? error.message : "register failed"
        });
    }
};

export const login = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        const { username, password } = req.body;



        logger.info({ username }, "Attempting to login user");

        const user = await findUserByUsername(username);
        if (!user) {
            logger.warn({ username }, "User not found");
            res.status(404).json({
                success: false,
                message: 'User not found'
            });
            return;
        }

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            logger.warn({ username }, "Incorrect password");
            res.status(401).json({
                success: false,
                message: 'Incorrect password'
            });
            return;
        }

        const token = jwt.sign(
            {
                id: user.id,
                username: user.username
            },
            JWT_SECRET,
            {
                expiresIn: "7d"
            }
        );

        logger.info({ username, userId: user.id }, "User logged in successfully");

        res.status(200).json({
            success: true,
            data: {
                token,
                user: {
                    id: user.id,
                    username: user.username,
                    created_at: user.created_at
                }
            }
        });

    } catch (error) {
        logger.error({ error }, 'Failed to login');
        res.status(500).json({
            success: false,
            message: error instanceof Error ? error.message : "login failed"
        });
    }
};