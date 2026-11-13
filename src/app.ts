import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';

import chatRoutes from './routes/chatRoutes';
import userRoutes from './routes/userRoutes';
import { errorHandler } from './middleware/errorHandler';
import { initializeDatabase } from './models/initDb';
import type { ApiResponse } from './types';

dotenv.config();

const app = express();
const PORT = parseInt(process.env.PORT ?? '3000', 10);

// Middleware
app.use(helmet());
app.use(cors());
app.use(express.json());

// Routes
app.use('/chat', chatRoutes);
app.use('/user', userRoutes);

// Health check
app.get('/health', (_req, res) => {
  const response: ApiResponse<{ status: string; timestamp: string }> = {
    success: true,
    data: { status: 'ok', timestamp: new Date().toISOString() },
  };
  res.json(response);
});

// 404
app.use((_req, res) => {
  const response: ApiResponse = { success: false, error: 'Route not found' };
  res.status(404).json(response);
});

// Global error handler
app.use(errorHandler);

// Bootstrap
(async () => {
  try {
    await initializeDatabase();
    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });
  } catch (err) {
    console.error('Failed to start server:', err);
    process.exit(1);
  }
})();

export default app;
