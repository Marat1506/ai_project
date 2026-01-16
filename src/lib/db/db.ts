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
        // Not running in Bun - use better-sqlite3 as fallback for Node.js
        // This is necessary because Next.js API routes run in Node.js runtime
        try {
          const BetterSqlite3 = require('better-sqlite3');
          DatabaseClass = BetterSqlite3;
          console.warn('Using better-sqlite3 as fallback (Next.js API routes run in Node.js, not Bun)');
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
      
      // Set foreign keys (different API for different libraries)
      if (db.pragma) {
        // better-sqlite3
        db.pragma('foreign_keys = ON');
      } else if (db.exec) {
        // Bun SQLite
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
  // Helper to execute SQL (works for both Bun and better-sqlite3)
  const exec = (sql: string) => {
    if (database.exec) {
      // Bun SQLite
      database.exec(sql);
    } else if (database.prepare) {
      // better-sqlite3 - use exec method
      database.exec(sql);
    }
  };

  // Create threads table
  exec(`
    CREATE TABLE IF NOT EXISTS threads (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  // Create messages table
  exec(`
    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      thread_id TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('user', 'assistant', 'system')),
      content TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (thread_id) REFERENCES threads(id) ON DELETE CASCADE
    )
  `);

  // Create index for faster queries
  exec(`
    CREATE INDEX IF NOT EXISTS idx_messages_thread_id ON messages(thread_id)
  `);
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

// Message operations
export function createMessage(
  threadId: string,
  role: 'user' | 'assistant' | 'system',
  content: string
): Message {
  const db = getDb();
  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  db.prepare(`
    INSERT INTO messages (id, thread_id, role, content, created_at)
    VALUES (?, ?, ?, ?, ?)
  `).run(id, threadId, role, content, now);

  // Update thread's updated_at
  db.prepare('UPDATE threads SET updated_at = ? WHERE id = ?').run(now, threadId);

  return {
    id,
    thread_id: threadId,
    role,
    content,
    created_at: now,
  };
}

export function getMessagesByThread(threadId: string): Message[] {
  const db = getDb();
  return db.prepare(`
    SELECT * FROM messages 
    WHERE thread_id = ? 
    ORDER BY created_at ASC
  `).all(threadId) as Message[];
}

export function deleteMessage(id: string): void {
  const db = getDb();
  db.prepare('DELETE FROM messages WHERE id = ?').run(id);
}

