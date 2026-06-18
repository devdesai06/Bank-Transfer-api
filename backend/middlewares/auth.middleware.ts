import type { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET || "fallback_secret";
interface jwtPayload {
    id: number;
    username: string;
}

export const authenticateToken = (req: Request, res: Response, next: NextFunction) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader) {
            res.status(401).json({
                success: false,
                message: "Authorization header missing",
            });
            return;
        }
        const token = authHeader.startsWith("Bearer ") ? authHeader.split(" ")[1] : null;

        if (!token) {
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
        next();
    } catch (error) {
        if (error instanceof jwt.JsonWebTokenError || error instanceof jwt.TokenExpiredError) {
            res.status(401).json({
                success: false,
                message: "Invalid or expired token"
            });
            return;
        }

        res.status(500).json({
            success: false,
            message: "Internal Server Error"
        });
    }
}