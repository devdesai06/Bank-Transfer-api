import { z } from "zod";

export const createTransferSchema = z.object({
    fromAccountId: z
        .number()
        .int()
        .positive(),

    toAccountId: z
        .number()
        .int()
        .positive(),

    amount: z
        .number()
        .positive()
}).refine(
    (data) => data.fromAccountId !== data.toAccountId,
    { message: "fromAccountId and toAccountId must be different", path: ["toAccountId"] }
)