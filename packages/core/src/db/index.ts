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
  // If connection string is empty, skip initialization (will be called again with proper URL)
  if (!config.connectionString) {
    console.warn('[Database] Empty connection string, skipping initialization');
    return null as any;
  }

  // If already initialized with a real connection, return existing
  if (db && client) {
    console.log('[Database] Returning existing connection');
    return db;
  }

  // Log connection details (show host for debugging)
  try {
    const url = new URL(config.connectionString);
    console.log(`[Database] Creating connection to: ${url.host}/${url.pathname}`);
  } catch {
    console.log(`[Database] Creating connection with string length: ${config.connectionString.length}`);
  }

  client = postgres(config.connectionString, {
    max: config.max ?? 10,
    idle_timeout: config.idleTimeout ?? 20,
  });

  db = drizzle(client, { schema });
  console.log('[Database] Connection created successfully');
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
