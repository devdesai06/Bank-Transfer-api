import pool from "../db/pool.js";

export const findUserByUsername = async (username:string) => {
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
    const result=await pool.query(
        `
            INSERT INTO users (username, password) VALUES ($1, $2) RETURNING *`
            , [username, password])
    return result.rows[0];
}