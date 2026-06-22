import rateLimit from "express-rate-limit";

export const rateLimiter = process.env.NODE_ENV === "test"
    ? (_req: any, _res: any, next: any) => next()
    : rateLimit({
        windowMs: 15 * 60 * 1000, // 15min
        max: 100, // limit each IP to 100 requests per windowMs
        message: {
            success: false,
            message: "Too many requests from this IP, please try again later"
        },
        standardHeaders: true,
        legacyHeaders: false,
    });

export const authRateLimiter = process.env.NODE_ENV === "test"
    ? (_req: any, _res: any, next: any) => next()
    : rateLimit({
        windowMs: 60 * 1000,
        max: 10,
        message: {
            success: false,
            message: "Too many login attempts."
        }
    });
export const transferRateLimiter = process.env.NODE_ENV === "test"
    ? (_req: any, _res: any, next: any) => next()
    : rateLimit({
        windowMs: 60 * 1000,
        max: 10,
        message: {
            success: false,
            message: "Too many transfer attempts."
        }
    });

