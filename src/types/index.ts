import type { Timestamp } from 'firebase-admin/firestore';

export type ChatType = 'direct' | 'group';

export interface User {
  id: string;
  username: string;
  email: string;
  created_at: Date;
  updated_at: Date;
}

export interface Chat {
  id: string;
  type: ChatType;
  name?: string | null;
  created_by?: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface ChatMember {
  chat_id: string;
  user_id: string;
  joined_at: Date;
  is_admin: boolean;
}

export interface ChatWithMembers extends Chat {
  members: string[];
}

export interface Message {
  id: string;
  chat_id: string;
  sender_id: string;
  text: string;
  timestamp: Timestamp;
  edited: boolean;
  deleted: boolean;
  deleted_at?: Timestamp | null;
  read_by: Record<string, Timestamp>;
}

export interface LastSeenEntry {
  message_id: string;
  timestamp: Timestamp;
}

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}
