import app from './app.js'
import dotenv from 'dotenv';
import { initDatabase } from './db/init.js'
import { logger } from './utils/logger.js'

dotenv.config()
await initDatabase()
const PORT = process.env.PORT || 5000
app.listen(PORT, () => {
    logger.info(`Server is running on port ${PORT}`)
})