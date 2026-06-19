import { z } from "zod";

export const createAccountSchema = z.object({
    name: z
        .string()
        .min(1, "Name is required")
        .max(100, "Name must be at most 100 characters")
        .trim(),

    balance: z
        .number()
        .nonnegative("Initial balance must be 0 or greater")
});
