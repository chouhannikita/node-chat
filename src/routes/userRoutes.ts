import { Router } from 'express';
import { listUserChats, createUser } from '../controllers/chatController';

const router = Router();

router.post('/create', createUser);
router.get('/:userId/chats', listUserChats);

export default router;
