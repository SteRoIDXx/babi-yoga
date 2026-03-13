#!/usr/bin/env node

/**
 * Setup-Script: Erstellt den Admin-Benutzer in der SQLite-Datenbank.
 *
 * Verwendung:
 *   node scripts/setup-admin.mjs <email> <passwort> [name]
 *
 * Beispiel:
 *   node scripts/setup-admin.mjs info@babi-yoga.com MeinPasswort123 "Nikola Babi"
 */

import Database from 'better-sqlite3';
import bcrypt from 'bcryptjs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { mkdirSync, existsSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DB_PATH = join(__dirname, '..', 'data', 'blog.db');

// CLI Args
const [,, email, password, name = ''] = process.argv;

if (!email || !password) {
  console.error('\n❌ Verwendung: node scripts/setup-admin.mjs <email> <passwort> [name]\n');
  console.error('   Beispiel: node scripts/setup-admin.mjs info@babi-yoga.com MeinPasswort123 "Nikola Babi"\n');
  process.exit(1);
}

if (password.length < 8) {
  console.error('\n❌ Passwort muss mindestens 8 Zeichen lang sein.\n');
  process.exit(1);
}

// DB-Verzeichnis erstellen
const dataDir = join(__dirname, '..', 'data');
if (!existsSync(dataDir)) {
  mkdirSync(dataDir, { recursive: true });
}

// DB öffnen und Schema erstellen (falls nötig)
const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    name TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

// Prüfen ob User schon existiert
const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email.toLowerCase());
if (existing) {
  console.log(`\n⚠️  Benutzer ${email} existiert bereits. Passwort wird aktualisiert...`);
  const hash = bcrypt.hashSync(password, 12);
  db.prepare('UPDATE users SET password_hash = ?, name = ? WHERE email = ?')
    .run(hash, name || '', email.toLowerCase());
  console.log('✅ Passwort aktualisiert!\n');
} else {
  const hash = bcrypt.hashSync(password, 12);
  db.prepare('INSERT INTO users (email, password_hash, name) VALUES (?, ?, ?)')
    .run(email.toLowerCase(), hash, name || '');
  console.log(`\n✅ Admin-Benutzer erstellt!`);
  console.log(`   E-Mail: ${email}`);
  console.log(`   Name:   ${name || '(nicht gesetzt)'}`);
  console.log(`\n   Login unter: /admin/login\n`);
}

db.close();
