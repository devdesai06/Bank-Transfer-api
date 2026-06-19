import { z } from "zod"
export const registerSchema = z.object({
    username: z
        .string()
        .min(3, "Username should be atleast 3 characters")
        .max(20, "Username should be atmost 20 characters")
        .regex(/^[a-zA-Z0-9_]+$/, "username can only contain letters,numbers and underscores"),
    password: z
        .string()
        .min(6, "Password should be atleast 6 characters")
})

export const loginSchema=z.object({
    username: z.string().min(1,"Username is required"),
    password: z.string().min(1,"Password is required")
})
