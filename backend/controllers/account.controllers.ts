import type { Request, Response, NextFunction } from 'express';
import { createAccount as createAccountService, getAccountById as getAccountByIdService, getBalance,getAccountByIdAndOwner } from '../services/account.services.js';
import { logger } from '../utils/logger.js'
export const createAccount = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        const { name, balance } = req.body;
        const ownerId = req.user!.id;
        if (!ownerId) {
            logger.warn('Account creation failed: Missing or invalid ownerId');
            res.status(400).json({ success: false, message: 'ownerId is required' });
            return;
        }
        logger.info("Attempting to create account")
        const account = await createAccountService(name, balance, ownerId);
        logger.info({ accountName: name }, 'Account created successfully');
        res.status(201).json({
            success: true,
            message: 'Account created successfully',
            data: account
        });
    }
    catch (error) {
        logger.error({ error }, 'Failed to create account');
        res.status(500).json({ success: false, message: 'Failed to create Account' });
    }
}

export const getAccountById = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        const id = Number(req.params.id)
        if (!id) {
            logger.warn('Account retrieval failed: Missing or invalid accountId');
            res.status(400).json({ success: false, message: 'accountId is required' });
            return;
        }
        const userId = req.user!.id;

        if (!userId) {
            logger.warn('Account retrieval failed: Missing or invalid userId');
            res.status(400).json({ success: false, message: 'userId is required' });
            return;
        }


        const account = await getAccountByIdAndOwner(id, userId);
        if (!account) {
            logger.info({ accountId: id }, 'Account not found');
            res.status(404).json({ success: false, message: 'Account not found' });
            return;
        }
        logger.info({ accountId: id }, 'Account retrieved successfully');
        res.status(200).json({
            success: true,
            message: 'Account found',
            data: account
        });
    } catch (error) {
        logger.error({ error, accountId: req.params.id }, 'Failed to get the account');
        res.status(500).json({ success: false, message: 'Failed to get the account' });
    }

}


export const getAccountBalance = async (
    req: Request,
    res: Response
) => {

    try {

        const accountId =
            Number(req.params.id);

        const userId = req.user!.id;

        const account = await getAccountByIdAndOwner(accountId, userId);

        if (!account) {
            logger.info({ accountId }, 'Account not found or unauthorized');
            res.status(404).json({
                success: false,
                message: "Account not found or unauthorized"
            });

            return;
        }

        logger.info({ accountId }, 'Account balance retrieved successfully');
        res.status(200).json({
            success: true,
            data: { balance: account.balance }
        });

    } catch (error) {
        logger.error({ error, accountId: req.params.id }, 'Failed to retrieve account balance');
        res.status(500).json({
            success: false
        });

    }

};

