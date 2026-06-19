import type { Request, Response, NextFunction } from "express";
import type { ZodSchema } from "zod";

export const validate = (schema: ZodSchema) => (req: Request, res: Response, next: NextFunction) => {
    try {
        const result = schema.safeParse(req.body);
        if(!result.success){
            return res.status(400).json({
                success: false,
                message: "Invalid request body",
                error: result.error.flatten()
            })
        }
        req.body = result.data;
        next();
    } catch (error) {
        return res.status(500).json({
            success: false,
            message: "Internal server error"
        })
    }
}