import { Request, Response, NextFunction } from 'express';
import type { ApiResponse } from '../types';

export class AppError extends Error {
  public readonly statusCode: number;

  constructor(message: string, statusCode: number) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
  }
}

export function errorHandler(
  err: Error | AppError,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  console.error(`[Error] ${err.name}: ${err.message}`);

  if (err instanceof AppError) {
    const response: ApiResponse = { success: false, error: err.message };
    res.status(err.statusCode).json(response);
    return;
  }

  const response: ApiResponse = { success: false, error: 'Internal server error' };
  res.status(500).json(response);
}
