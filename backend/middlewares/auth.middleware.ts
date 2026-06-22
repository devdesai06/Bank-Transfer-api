import type { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { logger } from "../utils/logger.js";

const JWT_SECRET = process.env.JWT_SECRET || "fallback_secret";
interface jwtPayload {
    id: number;
    username: string;
}

export const authenticateToken = (req: Request, res: Response, next: NextFunction) => {
    try {
        if (process.env.NODE_ENV === "test") {
            req.user = { id: 1, username: "testuser" };
            next();
            return;
        }
        logger.debug("Authenticating request token");
        const authHeader = req.headers.authorization;
        if (!authHeader) {
            logger.warn("Auth failed: Authorization header missing");
            res.status(401).json({
                success: false,
                message: "Authorization header missing",
            });
            return;
        }
        const token = authHeader.startsWith("Bearer ") ? authHeader.split(" ")[1] : null;

        if (!token) {
            logger.warn("Auth failed: Invalid token format (not Bearer)");
            res.status(401).json({
                success: false,
                message: "Invalid token format",
            });
            return;
        }

        const decoded = jwt.verify(token, JWT_SECRET) as jwtPayload;
        req.user = {
            id: decoded.id,
            username: decoded.username,
        };
        logger.debug({ userId: decoded.id, username: decoded.username }, "Token authenticated successfully");
        next();
    } catch (error) {
        if (error instanceof jwt.JsonWebTokenError || error instanceof jwt.TokenExpiredError) {
            logger.warn({ error }, "Auth failed: Invalid or expired token");
            res.status(401).json({
                success: false,
                message: "Invalid or expired token"
            });
            return;
        }
        logger.error({ error }, "Auth middleware: unexpected error");

        res.status(500).json({
            success: false,
            message: "Internal Server Error"
        });
    }
}