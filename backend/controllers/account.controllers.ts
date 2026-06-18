import type { Request, Response, NextFunction } from 'express';
import { createAccount as createAccountService, getAccountById as getAccountByIdService, getBalance } from '../services/account.services.js';
import { logger } from '../utils/logger.js'
export const createAccount = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        const { name, balance } = req.body;
        logger.info("Attempting to create account")
        if (!name || balance == undefined) {
            logger.warn({ body: req.body }, 'Account creation failed: Missing parameters');
            res.status(400).json({ success: false, message: 'Name and Balance is required' });
            return;
        }
        const account = await createAccountService(name, balance);
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

        const account = await getAccountByIdService(id);
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

        const balance =
            await getBalance(accountId);

        if (!balance) {
            logger.info({ accountId }, 'Account balance not found');
            res.status(404).json({
                success: false,
                message: "Account not found"
            });

            return;
        }

        logger.info({ accountId }, 'Account balance retrieved successfully');
        res.status(200).json({
            success: true,
            data: balance
        });

    } catch (error) {
        logger.error({ error, accountId: req.params.id }, 'Failed to retrieve account balance');
        res.status(500).json({
            success: false
        });

    }

};

