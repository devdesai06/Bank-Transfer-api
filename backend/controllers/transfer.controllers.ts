import type { Request, Response, NextFunction } from 'express';
import { transferMoney, getAllTransfers, getTransferById } from '../services/transfer.services.js'
import { logger } from '../utils/logger.js';

export const createTransfer = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        const { fromAccountId, toAccountId, amount } = req.body;
        logger.info({ fromAccountId, toAccountId, amount }, "Attempting to create transfer");
        if (!fromAccountId || !toAccountId || !amount) {
            logger.warn({ body: req.body }, 'Transfer failed: Missing parameters');
            res.status(400).json({ success: false, message: ' All fields are required' });
            return;
        }
        const idempotencyKey = req.header("Idempotency-Key");
        if (!idempotencyKey) {
            logger.warn('Transfer failed: Missing Idempotency-Key');
            res.status(400).json({ success: false, message: ' Idempotency-Key is required' });
            return;
        }
        
        const userId = req.user!.id;
        const transfer = await transferMoney(
            fromAccountId,
            toAccountId,
            amount, 
            idempotencyKey,
            userId
        );

        logger.info({ transferId: transfer.id }, 'Transfer created successfully');
        res.status(201).json({
            success: true,
            data: transfer
        });

    } catch (error) {
        logger.error({ error }, 'Transfer failed');
        res.status(400).json({
            success: false,
            message:
                error instanceof Error
                    ? error.message
                    : "Transfer failed"
        });
    }

}

export const getTransfers = async (
    req: Request,
    res: Response
) => {

    try {
        logger.info("Fetching all transfers");
        const userId = req.user!.id;
        const transfers =
            await getAllTransfers(userId);

        logger.info({ count: transfers.length }, "Transfers fetched successfully");
        res.status(200).json({
            success: true,
            data: transfers
        });

    } catch (error) {
        logger.error({ error }, 'Failed to fetch transfers');
        res.status(500).json({
            success: false
        });

    }

};



export const getTransfer = async (
    req: Request,
    res: Response
) => {

    try {

        const id = Number(req.params.id);
        const userId = req.user!.id;
        logger.info({ transferId: id }, "Fetching transfer by ID");

        const transfer =
            await getTransferById(id, userId);

        if (!transfer) {
            logger.info({ transferId: id }, "Transfer not found");
            res.status(404).json({
                success: false,
                message: "Transfer not found"
            });

            return;
        }

        logger.info({ transferId: id }, "Transfer retrieved successfully");
        res.status(200).json({
            success: true,
            data: transfer
        });

    } catch (error) {
        logger.error({ error, transferId: req.params.id }, "Failed to fetch transfer");
        res.status(500).json({
            success: false
        });

    }

};