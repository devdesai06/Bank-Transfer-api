import pkg from 'pg';
import dotenv from 'dotenv';
import { logger } from '../utils/logger.js';

dotenv.config();

const { Pool } = pkg;

const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: Number(process.env.DB_PORT) || 5432, // Typecast to number
});

pool.query('SELECT NOW()', (err:any, res:any) => {
  if (err) {
    logger.error({ err }, 'Error connecting to the database');
  } else {
    logger.info('Successfully connected to PostgreSQL');
  }
});

export default pool;
