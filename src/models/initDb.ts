import pool from '../config/database';

export async function initializeDatabase(): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    await client.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`);

    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        username    VARCHAR(255) NOT NULL UNIQUE,
        email       VARCHAR(255) NOT NULL UNIQUE,
        created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
        updated_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS chats (
        id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        type        VARCHAR(10)  NOT NULL DEFAULT 'direct'
                      CHECK (type IN ('direct', 'group')),
        name        VARCHAR(255),
        created_by  UUID REFERENCES users(id) ON DELETE SET NULL,
        created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
        updated_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS chat_members (
        chat_id    UUID REFERENCES chats(id) ON DELETE CASCADE,
        user_id    UUID REFERENCES users(id) ON DELETE CASCADE,
        joined_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        is_admin   BOOLEAN     NOT NULL DEFAULT FALSE,
        PRIMARY KEY (chat_id, user_id)
      )
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_chat_members_user_id ON chat_members(user_id)
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_chat_members_chat_id ON chat_members(chat_id)
    `);

    await client.query('COMMIT');
    console.log('Database initialized successfully');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
