import { Router } from 'express';
import {
  createOrGetChat,
  createGroupChat,
} from '../controllers/chatController';
import {
  sendMessage,
  getMessages,
  markMessageRead,
  updateLastSeen,
  editMessage,
  deleteMessage,
} from '../controllers/messageController';

const router = Router();

// 1:1 chat
router.post('/create', createOrGetChat);

// Group chat (Bonus)
router.post('/group/create', createGroupChat);

// Messages
router.post('/:chatId/message/send', sendMessage);
router.get('/:chatId/messages', getMessages);
router.post('/:chatId/message/:messageId/read', markMessageRead);
router.post('/:chatId/lastseen', updateLastSeen);

// Edit / delete (Bonus)
router.put('/:chatId/message/:messageId', editMessage);
router.delete('/:chatId/message/:messageId', deleteMessage);

export default router;
