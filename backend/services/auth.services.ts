import pool from "../db/pool.js";
import { logger } from "../utils/logger.js";

export const findUserByUsername = async (username:string) => {
    logger.debug({ username }, "Looking up user by username");
    const result=await pool.query(
        `
        SELECT *
        FROM users
        WHERE username = $1
        `,
        [username]
    );
    return result.rows[0];
}

export const insertUser=async(username:string,password:string)=>{
    logger.debug({ username }, "Inserting new user into database");
    const result=await pool.query(
        `
            INSERT INTO users (username, password) VALUES ($1, $2) RETURNING *`
            , [username, password])
    logger.info({ username, userId: result.rows[0]?.id }, "User inserted into database successfully");
    return result.rows[0];
}