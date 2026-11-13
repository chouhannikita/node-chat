# Chat Backend — Node.js + TypeScript + PostgreSQL + Firebase Firestore

A production-ready chat backend supporting 1:1 and group chats, with messages and read receipts stored in Firebase Firestore and user/chat metadata stored in PostgreSQL.

## Tech Stack

- **Runtime**: Node.js with TypeScript (strict mode)
- **Framework**: Express.js
- **Relational DB**: PostgreSQL (users, chats, memberships)
- **Real-time/Messages DB**: Firebase Firestore (messages, read receipts, last seen)

## Project Structure

```
src/
├── config/
│   ├── database.ts       # PostgreSQL pool
│   └── firebase.ts       # Firebase Admin SDK init
├── controllers/
│   ├── chatController.ts    # Chat CRUD + user endpoints
│   └── messageController.ts # Message send/read/edit/delete
├── middleware/
│   └── errorHandler.ts   # Centralised error handling
├── models/
│   └── initDb.ts         # Schema bootstrap (runs on startup)
├── routes/
│   ├── chatRoutes.ts
│   └── userRoutes.ts
├── types/
│   └── index.ts          # Shared TypeScript interfaces
└── app.ts                # Express entry point
```

## Firestore Schema

```
chats/{chatId}/
  messages/{messageId}:
    id, chat_id, sender_id, text, timestamp, edited, deleted, deleted_at, read_by

  lastSeen/{userId}:
    message_id, timestamp
```

## PostgreSQL Schema

```sql
users        (id, username, email, created_at, updated_at)
chats        (id, type, name, created_by, created_at, updated_at)
chat_members (chat_id, user_id, joined_at, is_admin)
```

## Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment

```bash
cp .env.example .env
# Fill in DB_* and FIREBASE_* values
```

### 3. Firebase setup

1. Go to [Firebase Console](https://console.firebase.google.com) → Project Settings → Service Accounts
2. Click **Generate new private key** and download the JSON
3. Either paste the JSON (single-line) into `FIREBASE_SERVICE_ACCOUNT_KEY` **or** fill in the three individual `FIREBASE_*` fields in `.env`
4. Enable **Cloud Firestore** in the Firebase Console

### 4. PostgreSQL setup

Create the database:

```sql
CREATE DATABASE chat_db;
```

The tables are created automatically on first startup.

### 5. Run

```bash
# Development (hot-reload)
npm run dev

# Production
npm run build && npm start
```

## API Reference

### Users

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/user/create` | Create a user |
| GET | `/user/:userId/chats` | List user's chats with member IDs |

### Chats

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/chat/create` | Create or get existing 1:1 chat |
| POST | `/chat/group/create` | Create a group chat _(bonus)_ |

### Messages

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/chat/:chatId/message/send` | Send a message |
| GET | `/chat/:chatId/messages?limit=50` | Get messages (paginated) |
| POST | `/chat/:chatId/message/:messageId/read` | Mark message as read |
| POST | `/chat/:chatId/lastseen` | Update last seen message |
| PUT | `/chat/:chatId/message/:messageId` | Edit a message _(bonus)_ |
| DELETE | `/chat/:chatId/message/:messageId` | Soft-delete a message _(bonus)_ |

## Example Requests

### Create user
```bash
curl -X POST http://localhost:3000/user/create \
  -H "Content-Type: application/json" \
  -d '{"username":"alice","email":"alice@example.com"}'
```

### Create 1:1 chat
```bash
curl -X POST http://localhost:3000/chat/create \
  -H "Content-Type: application/json" \
  -d '{"userAId":"<uuid>","userBId":"<uuid>"}'
```

### Send message
```bash
curl -X POST http://localhost:3000/chat/<chatId>/message/send \
  -H "Content-Type: application/json" \
  -d '{"senderId":"<uuid>","text":"Hello!"}'
```

### Get messages
```bash
curl "http://localhost:3000/chat/<chatId>/messages?limit=50"
```

### Mark as read
```bash
curl -X POST http://localhost:3000/chat/<chatId>/message/<messageId>/read \
  -H "Content-Type: application/json" \
  -d '{"userId":"<uuid>"}'
```

### Update last seen
```bash
curl -X POST http://localhost:3000/chat/<chatId>/lastseen \
  -H "Content-Type: application/json" \
  -d '{"userId":"<uuid>","messageId":"<messageId>"}'
```

### Create group chat (bonus)
```bash
curl -X POST http://localhost:3000/chat/group/create \
  -H "Content-Type: application/json" \
  -d '{"name":"Team Chat","adminId":"<uuid>","memberIds":["<uuid>","<uuid>"]}'
```

### Edit message (bonus)
```bash
curl -X PUT http://localhost:3000/chat/<chatId>/message/<messageId> \
  -H "Content-Type: application/json" \
  -d '{"senderId":"<uuid>","text":"Updated text"}'
```

### Delete message (bonus)
```bash
curl -X DELETE http://localhost:3000/chat/<chatId>/message/<messageId> \
  -H "Content-Type: application/json" \
  -d '{"senderId":"<uuid>"}'
```

## Notes

- Messages are **soft-deleted** (text cleared, `deleted: true`)
- Pagination uses cursor-based `?before=<messageId>` for stability
- All timestamps in Firestore use `FieldValue.serverTimestamp()` for consistency
- The `updated_at` field on chats bumps on every new message, keeping `/user/:userId/chats` sorted by most recent activity
