import { join, dirname } from 'path';
import { mkdirSync } from 'fs';
import type { Thread, Message } from './schema';

// Use absolute path for database
const DB_PATH = join(process.cwd(), 'data', 'chat.db');

// Bun SQLite will be loaded dynamically in getDb()

// Singleton database instance
let db: any = null;

export function getDb(): any {
  if (!db) {
    try {
      // Try to get Database from Bun
      let DatabaseClass: any;
      
      // Check if Bun is available
      const BunGlobal = (globalThis as any).Bun;
      if (BunGlobal) {
        // Running in Bun - try different ways to access SQLite
        if (BunGlobal.SQLite && BunGlobal.SQLite.Database) {
          DatabaseClass = BunGlobal.SQLite.Database;
        } else if (BunGlobal.Database) {
          // Alternative Bun API
          DatabaseClass = BunGlobal.Database;
        } else {
          // Try to require bun:sqlite
          try {
            // @ts-ignore - bun:sqlite is only available in Bun
            const sqliteModule = require('bun:sqlite');
            DatabaseClass = sqliteModule.Database;
          } catch (e: any) {
            throw new Error(
              'Bun SQLite is not available. Bun is detected but SQLite module is not accessible. ' +
              'Error: ' + (e?.message || String(e))
            );
          }
        }
      } else {
        try {
          const BetterSqlite3 = require('better-sqlite3');
          DatabaseClass = BetterSqlite3;
        } catch (e: any) {
          throw new Error(
            'Neither Bun SQLite nor better-sqlite3 is available. ' +
            'Please install better-sqlite3: `bun add better-sqlite3`. ' +
            'Error: ' + (e?.message || String(e))
          );
        }
      }

      if (!DatabaseClass) {
        throw new Error('Database class not found. Bun SQLite is not available.');
      }

      // Ensure data directory exists
      try {
        mkdirSync(dirname(DB_PATH), { recursive: true });
      } catch (e) {
        // Directory might already exist
      }
      
      // Create database instance
      db = new DatabaseClass(DB_PATH);
      
      if (db.pragma) {
        db.pragma('foreign_keys = ON');
      } else if (db.exec) {
        db.exec('PRAGMA foreign_keys = ON;');
      }
      
      initTables(db);
    } catch (error: any) {
      console.error('Error initializing database:', error);
      console.error('DB_PATH:', DB_PATH);
      console.error('process.cwd():', process.cwd());
      console.error('Bun available:', typeof (globalThis as any).Bun !== 'undefined');
      throw error;
    }
  }
  return db;
}

function initTables(database: any) {
  const exec = (sql: string) => {
    if (database.exec) {
      database.exec(sql);
    } else if (database.prepare) {
      database.exec(sql);
    }
  };

  exec(`
    CREATE TABLE IF NOT EXISTS threads (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  exec(`
    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      thread_id TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('user', 'assistant', 'system')),
      content TEXT NOT NULL,
      tool_invocations TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (thread_id) REFERENCES threads(id) ON DELETE CASCADE
    )
  `);

  exec(`
    CREATE INDEX IF NOT EXISTS idx_messages_thread_id ON messages(thread_id)
  `);

  try {
    exec(`
      ALTER TABLE messages ADD COLUMN tool_invocations TEXT
    `);
  } catch (error: any) {
    if (!error.message?.includes('duplicate column name')) {
      console.warn('Migration warning:', error.message);
    }
  }
}

// Thread operations
export function createThread(title: string): Thread {
  const db = getDb();
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  
  db.prepare(`
    INSERT INTO threads (id, title, created_at, updated_at)
    VALUES (?, ?, ?, ?)
  `).run(id, title, now, now);

  return {
    id,
    title,
    created_at: now,
    updated_at: now,
  };
}

export function getThread(id: string): Thread | null {
  const db = getDb();
  const result = db.prepare('SELECT * FROM threads WHERE id = ?').get(id) as Thread | undefined;
  return result || null;
}

export function getAllThreads(): Thread[] {
  const db = getDb();
  return db.prepare('SELECT * FROM threads ORDER BY updated_at DESC').all() as Thread[];
}

export function updateThread(id: string, title: string): void {
  const db = getDb();
  const now = new Date().toISOString();
  db.prepare('UPDATE threads SET title = ?, updated_at = ? WHERE id = ?').run(title, now, id);
}

export function deleteThread(id: string): void {
  const db = getDb();
  db.prepare('DELETE FROM threads WHERE id = ?').run(id);
}

export function createMessage(
  threadId: string,
  role: 'user' | 'assistant' | 'system',
  content: string,
  toolInvocations?: any[]
): Message {
  const db = getDb();
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const toolInvocationsJson = toolInvocations ? JSON.stringify(toolInvocations) : null;

  db.prepare(`
    INSERT INTO messages (id, thread_id, role, content, tool_invocations, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(id, threadId, role, content, toolInvocationsJson, now);

  db.prepare('UPDATE threads SET updated_at = ? WHERE id = ?').run(now, threadId);

  return {
    id,
    thread_id: threadId,
    role,
    content,
    tool_invocations: toolInvocationsJson,
    created_at: now,
  };
}

export function getMessagesByThread(threadId: string): Message[] {
  const db = getDb();
  const messages = db.prepare(`
    SELECT * FROM messages 
    WHERE thread_id = ? 
    ORDER BY created_at ASC
  `).all(threadId) as Message[];

  return messages.map(message => ({
    ...message,
    toolInvocations: message.tool_invocations ? JSON.parse(message.tool_invocations) : undefined
  }));
}

export function deleteMessage(id: string): void {
  const db = getDb();
  db.prepare('DELETE FROM messages WHERE id = ?').run(id);
}

