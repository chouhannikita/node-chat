import { Request, Response, NextFunction } from 'express';
import pool from '../config/database';
import { AppError } from '../middleware/errorHandler';
import type { ApiResponse, Chat, ChatWithMembers } from '../types';

/**
 * POST /chat/create
 * Create or retrieve an existing 1:1 direct chat between two users.
 */
export async function createOrGetChat(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { userAId, userBId } = req.body as { userAId?: string; userBId?: string };

    if (!userAId || !userBId) {
      throw new AppError('userAId and userBId are required', 400);
    }
    if (userAId === userBId) {
      throw new AppError('userAId and userBId must be different', 400);
    }

    // Check both users exist
    const usersResult = await pool.query(
      `SELECT id FROM users WHERE id = ANY($1::uuid[])`,
      [[userAId, userBId]]
    );
    if (usersResult.rowCount !== 2) {
      throw new AppError('One or both users not found', 404);
    }

    // Check for existing direct chat between the two users
    const existingResult = await pool.query<{ id: string }>(
      `SELECT c.id
       FROM chats c
       JOIN chat_members ma ON ma.chat_id = c.id AND ma.user_id = $1
       JOIN chat_members mb ON mb.chat_id = c.id AND mb.user_id = $2
       WHERE c.type = 'direct'
       LIMIT 1`,
      [userAId, userBId]
    );

    if (existingResult.rows.length > 0) {
      const response: ApiResponse<{ chatId: string }> = {
        success: true,
        data: { chatId: existingResult.rows[0].id },
        message: 'Existing chat retrieved',
      };
      res.status(200).json(response);
      return;
    }

    // Create new direct chat
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const chatResult = await client.query<Chat>(
        `INSERT INTO chats (type, created_by) VALUES ('direct', $1) RETURNING *`,
        [userAId]
      );
      const chat = chatResult.rows[0];

      await client.query(
        `INSERT INTO chat_members (chat_id, user_id, is_admin) VALUES ($1, $2, false), ($1, $3, false)`,
        [chat.id, userAId, userBId]
      );

      await client.query('COMMIT');

      const response: ApiResponse<{ chatId: string }> = {
        success: true,
        data: { chatId: chat.id },
        message: 'Chat created successfully',
      };
      res.status(201).json(response);
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } catch (err) {
    next(err);
  }
}

/**
 * POST /chat/group/create  (Bonus)
 * Create a group chat with multiple members.
 */
export async function createGroupChat(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { name, memberIds, adminId } = req.body as {
      name?: string;
      memberIds?: string[];
      adminId?: string;
    };

    if (!name || !memberIds || !adminId) {
      throw new AppError('name, memberIds, and adminId are required', 400);
    }
    if (!Array.isArray(memberIds) || memberIds.length < 2) {
      throw new AppError('memberIds must be an array with at least 2 members', 400);
    }

    const allIds = Array.from(new Set([adminId, ...memberIds]));

    // Verify all users exist
    const usersResult = await pool.query(
      `SELECT id FROM users WHERE id = ANY($1::uuid[])`,
      [allIds]
    );
    if (usersResult.rowCount !== allIds.length) {
      throw new AppError('One or more users not found', 404);
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const chatResult = await client.query<Chat>(
        `INSERT INTO chats (type, name, created_by) VALUES ('group', $1, $2) RETURNING *`,
        [name, adminId]
      );
      const chat = chatResult.rows[0];

      const placeholders = allIds
        .map((_, i) => `($1, $${i + 2}, $${allIds.length + 2 + i})`)
        .join(', ');

      const isAdminFlags = allIds.map((id) => id === adminId);

      await client.query(
        `INSERT INTO chat_members (chat_id, user_id, is_admin) VALUES ${placeholders}`,
        [chat.id, ...allIds, ...isAdminFlags]
      );

      await client.query('COMMIT');

      const response: ApiResponse<{ chatId: string; name: string }> = {
        success: true,
        data: { chatId: chat.id, name: chat.name ?? name },
        message: 'Group chat created successfully',
      };
      res.status(201).json(response);
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } catch (err) {
    next(err);
  }
}

/**
 * GET /user/:userId/chats
 * List all chats for a user, including member IDs.
 */
export async function listUserChats(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { userId } = req.params;

    // Verify user exists
    const userResult = await pool.query(`SELECT id FROM users WHERE id = $1`, [userId]);
    if (userResult.rowCount === 0) {
      throw new AppError('User not found', 404);
    }

    // Get all chats the user belongs to, with their members
    const chatsResult = await pool.query<
      Chat & { members: string[] }
    >(
      `SELECT
         c.id,
         c.type,
         c.name,
         c.created_by,
         c.created_at,
         c.updated_at,
         ARRAY_AGG(cm.user_id ORDER BY cm.joined_at) AS members
       FROM chats c
       JOIN chat_members cm ON cm.chat_id = c.id
       WHERE c.id IN (
         SELECT chat_id FROM chat_members WHERE user_id = $1
       )
       GROUP BY c.id
       ORDER BY c.updated_at DESC`,
      [userId]
    );

    const chats: ChatWithMembers[] = chatsResult.rows.map((row) => ({
      id: row.id,
      type: row.type,
      name: row.name,
      created_by: row.created_by,
      created_at: row.created_at,
      updated_at: row.updated_at,
      members: row.members,
    }));

    const response: ApiResponse<{ chats: ChatWithMembers[] }> = {
      success: true,
      data: { chats },
    };
    res.status(200).json(response);
  } catch (err) {
    next(err);
  }
}

/**
 * POST /user/create  (utility endpoint for testing)
 * Create a user in the relational DB.
 */
export async function createUser(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { username, email } = req.body as { username?: string; email?: string };

    if (!username || !email) {
      throw new AppError('username and email are required', 400);
    }

    const result = await pool.query(
      `INSERT INTO users (username, email) VALUES ($1, $2) RETURNING *`,
      [username, email]
    );

    const response: ApiResponse = {
      success: true,
      data: result.rows[0],
      message: 'User created successfully',
    };
    res.status(201).json(response);
  } catch (err) {
    next(err);
  }
}
