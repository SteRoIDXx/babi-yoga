import { getDb, getUserByEmail } from './db';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';

const BCRYPT_ROUNDS = 12;
const SESSION_DURATION_HOURS = 24;

// Rate limiting: in-memory (resets on server restart)
const loginAttempts = new Map<string, { count: number; firstAttempt: number }>();
const RATE_LIMIT_MAX = 5;
const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000; // 15 Minuten

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_ROUNDS);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const record = loginAttempts.get(ip);
  if (!record) return false;

  // Fenster abgelaufen → Reset
  if (now - record.firstAttempt > RATE_LIMIT_WINDOW_MS) {
    loginAttempts.delete(ip);
    return false;
  }

  return record.count >= RATE_LIMIT_MAX;
}

export function recordFailedLogin(ip: string) {
  const now = Date.now();
  const record = loginAttempts.get(ip);

  if (!record || now - record.firstAttempt > RATE_LIMIT_WINDOW_MS) {
    loginAttempts.set(ip, { count: 1, firstAttempt: now });
  } else {
    record.count++;
  }
}

export function clearLoginAttempts(ip: string) {
  loginAttempts.delete(ip);
}

export function createSession(userId: number): string {
  const token = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + SESSION_DURATION_HOURS * 60 * 60 * 1000).toISOString();

  // Alte abgelaufene Sessions aufräumen
  getDb().prepare("DELETE FROM sessions WHERE expires_at < datetime('now')").run();

  getDb().prepare('INSERT INTO sessions (user_id, token, expires_at) VALUES (?, ?, ?)')
    .run(userId, token, expiresAt);

  return token;
}

export function validateSession(token: string): { userId: number; email: string; name: string } | null {
  const session = getDb().prepare(`
    SELECT s.user_id, u.email, u.name FROM sessions s
    JOIN users u ON u.id = s.user_id
    WHERE s.token = ? AND s.expires_at > datetime('now')
  `).get(token) as any;

  if (!session) return null;

  // Session verlängern bei Aktivität
  const newExpiry = new Date(Date.now() + SESSION_DURATION_HOURS * 60 * 60 * 1000).toISOString();
  getDb().prepare('UPDATE sessions SET expires_at = ? WHERE token = ?').run(newExpiry, token);

  return {
    userId: session.user_id,
    email: session.email,
    name: session.name,
  };
}

export function deleteSession(token: string) {
  getDb().prepare('DELETE FROM sessions WHERE token = ?').run(token);
}

// CSRF Token Generierung + Validierung
const csrfTokens = new Map<string, number>(); // token → timestamp
const CSRF_TTL_MS = 2 * 60 * 60 * 1000; // 2 Stunden

export function generateCsrfToken(): string {
  // Alte Tokens aufräumen
  const now = Date.now();
  for (const [t, ts] of csrfTokens) {
    if (now - ts > CSRF_TTL_MS) csrfTokens.delete(t);
  }

  const token = crypto.randomUUID();
  csrfTokens.set(token, now);
  return token;
}

export function validateCsrfToken(token: string): boolean {
  const ts = csrfTokens.get(token);
  if (!ts) return false;
  if (Date.now() - ts > CSRF_TTL_MS) {
    csrfTokens.delete(token);
    return false;
  }
  csrfTokens.delete(token); // Einmalverwendung
  return true;
}
