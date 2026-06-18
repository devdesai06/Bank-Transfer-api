import pino from 'pino';

const isProduction = process.env.NODE_ENV === 'production';

export const logger = pino({
    level: process.env.LOG_LEVEL || 'info',
    // Mixin allows you to automatically inject properties (like app name) into every log entry
    mixin() {
        return { app: 'account-service' };
    },
    ...(!isProduction && {
        transport: {
            target: 'pino-pretty',
            options: {
                colorize: true,
                ignore: 'pid,hostname',
                translateTime: 'SYS:yyyy-mm-dd HH:MM:ss',
            }
        }
    })
});                                     