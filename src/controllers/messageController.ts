import { Request, Response, NextFunction } from 'express';
import { FieldValue } from 'firebase-admin/firestore';
import pool from '../config/database';
import { firestoreDb } from '../config/firebase';
import { AppError } from '../middleware/errorHandler';
import type { ApiResponse, Message, LastSeenEntry } from '../types';

const messagesCollection = (chatId: string) =>
  firestoreDb.collection('chats').doc(chatId).collection('messages');

const lastSeenCollection = (chatId: string) =>
  firestoreDb.collection('chats').doc(chatId).collection('lastSeen');

async function assertChatMember(chatId: string, userId: string): Promise<void> {
  const result = await pool.query(
    `SELECT 1 FROM chat_members WHERE chat_id = $1 AND user_id = $2`,
    [chatId, userId]
  );
  if (result.rowCount === 0) {
    throw new AppError('User is not a member of this chat', 403);
  }
}

async function assertChatExists(chatId: string): Promise<void> {
  const result = await pool.query(`SELECT 1 FROM chats WHERE id = $1`, [chatId]);
  if (result.rowCount === 0) {
    throw new AppError('Chat not found', 404);
  }
}

/**
 * POST /chat/:chatId/message/send
 * Store a new message in Firestore.
 */
export async function sendMessage(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { chatId } = req.params;
    const { senderId, text } = req.body as { senderId?: string; text?: string };

    if (!senderId || !text?.trim()) {
      throw new AppError('senderId and text are required', 400);
    }

    await assertChatExists(chatId);
    await assertChatMember(chatId, senderId);

    const msgRef = messagesCollection(chatId).doc();
    const messageId = msgRef.id;

    const messageData: Omit<Message, 'id'> = {
      chat_id: chatId,
      sender_id: senderId,
      text: text.trim(),
      timestamp: FieldValue.serverTimestamp() as unknown as FirebaseFirestore.Timestamp,
      edited: false,
      deleted: false,
      deleted_at: null,
      read_by: {},
    };

    await msgRef.set({ id: messageId, ...messageData });

    // Bump updated_at on the chat row so listUserChats sorts correctly
    await pool.query(`UPDATE chats SET updated_at = NOW() WHERE id = $1`, [chatId]);

    const response: ApiResponse<{ messageId: string }> = {
      success: true,
      data: { messageId },
      message: 'Message sent successfully',
    };
    res.status(201).json(response);
  } catch (err) {
    next(err);
  }
}

/**
 * GET /chat/:chatId/messages?limit=50&before=<messageId>
 * Return messages ordered by timestamp ascending, newest-first pagination via `before`.
 */
export async function getMessages(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { chatId } = req.params;
    const limit = Math.min(parseInt((req.query['limit'] as string) ?? '50', 10), 100);
    const before = req.query['before'] as string | undefined;

    await assertChatExists(chatId);

    let query = messagesCollection(chatId)
      .where('deleted', '==', false)
      .orderBy('timestamp', 'asc')
      .limit(limit);

    if (before) {
      const cursorSnap = await messagesCollection(chatId).doc(before).get();
      if (cursorSnap.exists) {
        query = query.startAfter(cursorSnap);
      }
    }

    const snapshot = await query.get();
    const messages = snapshot.docs.map((doc) => doc.data() as Message);

    const response: ApiResponse<{ messages: Message[]; count: number }> = {
      success: true,
      data: { messages, count: messages.length },
    };
    res.status(200).json(response);
  } catch (err) {
    next(err);
  }
}

/**
 * POST /chat/:chatId/message/:messageId/read
 * Mark a message as read by a user.
 */
export async function markMessageRead(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { chatId, messageId } = req.params;
    const { userId } = req.body as { userId?: string };

    if (!userId) {
      throw new AppError('userId is required', 400);
    }

    await assertChatExists(chatId);
    await assertChatMember(chatId, userId);

    const msgRef = messagesCollection(chatId).doc(messageId);
    const msgSnap = await msgRef.get();
    if (!msgSnap.exists) {
      throw new AppError('Message not found', 404);
    }

    await msgRef.update({
      [`read_by.${userId}`]: FieldValue.serverTimestamp(),
    });

    const response: ApiResponse = {
      success: true,
      message: 'Message marked as read',
    };
    res.status(200).json(response);
  } catch (err) {
    next(err);
  }
}

/**
 * POST /chat/:chatId/lastseen
 * Update the last seen message for a user in a chat.
 */
export async function updateLastSeen(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { chatId } = req.params;
    const { userId, messageId } = req.body as { userId?: string; messageId?: string };

    if (!userId || !messageId) {
      throw new AppError('userId and messageId are required', 400);
    }

    await assertChatExists(chatId);
    await assertChatMember(chatId, userId);

    // Verify message exists in Firestore
    const msgSnap = await messagesCollection(chatId).doc(messageId).get();
    if (!msgSnap.exists) {
      throw new AppError('Message not found', 404);
    }

    const lastSeenData: LastSeenEntry = {
      message_id: messageId,
      timestamp: FieldValue.serverTimestamp() as unknown as FirebaseFirestore.Timestamp,
    };

    await lastSeenCollection(chatId).doc(userId).set(lastSeenData);

    const response: ApiResponse = {
      success: true,
      message: 'Last seen updated',
    };
    res.status(200).json(response);
  } catch (err) {
    next(err);
  }
}

/**
 * PUT /chat/:chatId/message/:messageId  (Bonus)
 * Edit the text of an existing message.
 */
export async function editMessage(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { chatId, messageId } = req.params;
    const { senderId, text } = req.body as { senderId?: string; text?: string };

    if (!senderId || !text?.trim()) {
      throw new AppError('senderId and text are required', 400);
    }

    await assertChatExists(chatId);
    await assertChatMember(chatId, senderId);

    const msgRef = messagesCollection(chatId).doc(messageId);
    const msgSnap = await msgRef.get();
    if (!msgSnap.exists) {
      throw new AppError('Message not found', 404);
    }

    const msgData = msgSnap.data() as Message;
    if (msgData.sender_id !== senderId) {
      throw new AppError('You can only edit your own messages', 403);
    }
    if (msgData.deleted) {
      throw new AppError('Cannot edit a deleted message', 400);
    }

    await msgRef.update({ text: text.trim(), edited: true });

    const response: ApiResponse = {
      success: true,
      message: 'Message edited successfully',
    };
    res.status(200).json(response);
  } catch (err) {
    next(err);
  }
}

/**
 * DELETE /chat/:chatId/message/:messageId  (Bonus)
 * Soft-delete a message (sets deleted=true, clears text).
 */
export async function deleteMessage(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { chatId, messageId } = req.params;
    const { senderId } = req.body as { senderId?: string };

    if (!senderId) {
      throw new AppError('senderId is required', 400);
    }

    await assertChatExists(chatId);
    await assertChatMember(chatId, senderId);

    const msgRef = messagesCollection(chatId).doc(messageId);
    const msgSnap = await msgRef.get();
    if (!msgSnap.exists) {
      throw new AppError('Message not found', 404);
    }

    const msgData = msgSnap.data() as Message;
    if (msgData.sender_id !== senderId) {
      throw new AppError('You can only delete your own messages', 403);
    }
    if (msgData.deleted) {
      throw new AppError('Message already deleted', 400);
    }

    await msgRef.update({
      deleted: true,
      text: '',
      deleted_at: FieldValue.serverTimestamp(),
    });

    const response: ApiResponse = {
      success: true,
      message: 'Message deleted successfully',
    };
    res.status(200).json(response);
  } catch (err) {
    next(err);
  }
}
