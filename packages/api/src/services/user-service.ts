import { getDatabase } from '@macp/core';
import { sql } from 'drizzle-orm';

export interface UpsertUserParams {
  userId: string;
  email?: string;
  displayName?: string;
}

/**
 * Ensure a user exists in the database.
 * Called after successful authentication to maintain referential integrity.
 */
export async function ensureUserExists(params: UpsertUserParams): Promise<void> {
  const { userId, email, displayName } = params;

  try {
    const db = getDatabase();

    // Upsert: insert if not exists, update last_active_at if exists
    await db.execute(sql`
      INSERT INTO users (id, email, display_name, last_active_at, created_at, updated_at)
      VALUES (${userId}, ${email || null}, ${displayName || 'User'}, NOW(), NOW(), NOW())
      ON CONFLICT (id) DO UPDATE SET
        last_active_at = NOW(),
        updated_at = NOW(),
        email = COALESCE(EXCLUDED.email, users.email),
        display_name = COALESCE(EXCLUDED.display_name, users.display_name)
    `);
  } catch (error) {
    // Log but don't fail auth if user upsert fails
    console.error('[UserService] Failed to upsert user:', error);
  }
}

/**
 * Update user's push notification token
 */
export async function updateUserPushToken(userId: string, apnsToken: string): Promise<void> {
  try {
    const db = getDatabase();

    await db.execute(sql`
      UPDATE users
      SET apns_token = ${apnsToken},
          apns_token_updated_at = NOW(),
          updated_at = NOW()
      WHERE id = ${userId}
    `);
  } catch (error) {
    console.error('[UserService] Failed to update push token:', error);
    throw error;
  }
}

/**
 * Get user by ID
 */
export async function getUserById(userId: string): Promise<{
  id: string;
  email: string | null;
  displayName: string;
  avatarUrl: string | null;
  apnsToken: string | null;
  preferences: Record<string, unknown> | null;
  createdAt: Date;
  lastActiveAt: Date | null;
} | null> {
  try {
    const db = getDatabase();

    const result = await db.execute(sql`
      SELECT id, email, display_name, avatar_url, apns_token, preferences, created_at, last_active_at
      FROM users
      WHERE id = ${userId}
    `);

    const rows = (result as any).rows || result;
    if (!Array.isArray(rows) || rows.length === 0) {
      return null;
    }

    const row = rows[0];
    return {
      id: row.id,
      email: row.email,
      displayName: row.display_name,
      avatarUrl: row.avatar_url,
      apnsToken: row.apns_token,
      preferences: row.preferences,
      createdAt: row.created_at,
      lastActiveAt: row.last_active_at,
    };
  } catch (error) {
    console.error('[UserService] Failed to get user:', error);
    return null;
  }
}
