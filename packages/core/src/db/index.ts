import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema.js';

// Re-export schema
export * from './schema.js';

// -----------------------------------------------------------------------------
// Database Connection
// -----------------------------------------------------------------------------

let db: ReturnType<typeof drizzle<typeof schema>> | null = null;
let client: ReturnType<typeof postgres> | null = null;

export interface DatabaseConfig {
  connectionString: string;
  max?: number; // Max connections in pool
  idleTimeout?: number;
}

export function createDatabase(config: DatabaseConfig) {
  if (db) {
    return db;
  }

  client = postgres(config.connectionString, {
    max: config.max ?? 10,
    idle_timeout: config.idleTimeout ?? 20,
  });

  db = drizzle(client, { schema });
  return db;
}

export function getDatabase() {
  if (!db) {
    throw new Error('Database not initialized. Call createDatabase() first.');
  }
  return db;
}

export async function closeDatabase() {
  if (client) {
    await client.end();
    client = null;
    db = null;
  }
}

export type Database = ReturnType<typeof createDatabase>;
