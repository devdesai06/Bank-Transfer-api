import express from "express";
import accountRoutes from './routes/account.routes.js';
import transferRoutes from './routes/transfer.routes.js'
import authRoutes from './routes/auth.routes.js';
import dotenv from 'dotenv';
import { setupSwagger } from './swagger.js'
dotenv.config();

const app = express();
app.use(express.json())
setupSwagger(app);

app.get('/health', (req, res) => {
    res.status(200).json({
        "status": "healthy",
        "database": "connected"
    })
})
app.use('/api/account', accountRoutes);
app.use("/api/transfers", transferRoutes);
app.use('/api/auth', authRoutes);

export default app;