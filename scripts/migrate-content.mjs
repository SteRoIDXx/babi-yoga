#!/usr/bin/env node

/**
 * Migrations-Script: Importiert bestehende Inhalte in die SQLite-Datenbank.
 * - Blog-Posts aus Markdown-Dateien
 * - Ankündigungen (Ticker)
 * - Kursplan (Wochenübersicht)
 * - Events (Veranstaltungen)
 *
 * Verwendung:
 *   node scripts/migrate-content.mjs
 *
 * Sicher zu wiederholen: überspringt existierende Einträge (slug/title-basiert).
 */

import Database from 'better-sqlite3';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { readFileSync, readdirSync, mkdirSync, existsSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DB_PATH = join(__dirname, '..', 'data', 'blog.db');
const CONTENT_DIR = join(__dirname, '..', 'src', 'content', 'blog');

// DB-Verzeichnis erstellen
const dataDir = join(__dirname, '..', 'data');
if (!existsSync(dataDir)) {
  mkdirSync(dataDir, { recursive: true });
}

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// Schema sicherstellen
db.exec(`
  CREATE TABLE IF NOT EXISTS posts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    slug TEXT NOT NULL UNIQUE,
    excerpt TEXT NOT NULL DEFAULT '',
    body_md TEXT NOT NULL DEFAULT '',
    image TEXT DEFAULT NULL,
    image_alt TEXT DEFAULT NULL,
    video_url TEXT DEFAULT NULL,
    published INTEGER NOT NULL DEFAULT 0,
    published_at TEXT DEFAULT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS announcements (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    link TEXT DEFAULT NULL,
    active INTEGER NOT NULL DEFAULT 1,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS schedule (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    day TEXT NOT NULL,
    time_start TEXT NOT NULL,
    course_name TEXT NOT NULL,
    instructor TEXT NOT NULL DEFAULT '',
    note TEXT DEFAULT NULL,
    active INTEGER NOT NULL DEFAULT 1,
    sort_order INTEGER NOT NULL DEFAULT 0
  );
  CREATE TABLE IF NOT EXISTS events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    slug TEXT NOT NULL UNIQUE,
    description TEXT NOT NULL DEFAULT '',
    date_start TEXT DEFAULT NULL,
    date_end TEXT DEFAULT NULL,
    image TEXT DEFAULT NULL,
    location TEXT DEFAULT NULL,
    published INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

let imported = { posts: 0, announcements: 0, schedule: 0, events: 0 };
let skipped = { posts: 0, announcements: 0, schedule: 0, events: 0 };

// --- 1. Blog-Posts aus Markdown importieren ---
console.log('\n📝 Blog-Posts importieren...');

const mdFiles = readdirSync(CONTENT_DIR).filter(f => f.endsWith('.md'));

for (const file of mdFiles) {
  const content = readFileSync(join(CONTENT_DIR, file), 'utf-8');

  // Frontmatter parsen
  const fmMatch = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!fmMatch) {
    console.log(`  ⚠️  ${file}: Kein Frontmatter gefunden, übersprungen`);
    continue;
  }

  const frontmatter = fmMatch[1];
  const bodyMd = fmMatch[2].trim();
  const slug = file.replace('.md', '');

  // Frontmatter-Felder extrahieren
  const getValue = (key) => {
    const m = frontmatter.match(new RegExp(`^${key}:\\s*"?([^"\\n]*)"?`, 'm'));
    return m ? m[1].trim() : '';
  };

  const title = getValue('title');
  const excerpt = getValue('excerpt');
  const image = getValue('image');
  const imageAlt = getValue('imageAlt');
  const videoUrl = getValue('videoUrl');
  const dateStr = getValue('date');

  // Slug-Duplikat-Check
  const existing = db.prepare('SELECT id FROM posts WHERE slug = ?').get(slug);
  if (existing) {
    console.log(`  ⏭  ${slug} — existiert bereits`);
    skipped.posts++;
    continue;
  }

  const publishedAt = dateStr ? new Date(dateStr).toISOString() : new Date().toISOString();

  db.prepare(`
    INSERT INTO posts (title, slug, excerpt, body_md, image, image_alt, video_url, published, published_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
  `).run(title, slug, excerpt, bodyMd, image || null, imageAlt || null, videoUrl || null, publishedAt, publishedAt);

  console.log(`  ✅ ${slug} — "${title}"`);
  imported.posts++;
}

// --- 2. Ankündigungen (Ticker) ---
console.log('\n📢 Ankündigungen importieren...');

const announcements = [
  { title: 'Ferien — Aktuelle Ferienzeiten beachten', link: null },
  { title: 'Kinderyoga — Kurse für Kinder von 6–12 Jahren', link: '/yoga' },
  { title: 'Offener Mantra-Singkreis — 29.03.2026', link: '/veranstaltungen' },
  { title: 'Yogaretreat Pfingsten 2026 — 22.-25.05.2026 im Wendland', link: '/reisen' },
  { title: 'Yogakurse in Präsenz und online-live', link: '/yoga' },
];

for (let i = 0; i < announcements.length; i++) {
  const a = announcements[i];
  const existing = db.prepare('SELECT id FROM announcements WHERE title = ?').get(a.title);
  if (existing) {
    console.log(`  ⏭  "${a.title}" — existiert bereits`);
    skipped.announcements++;
    continue;
  }
  db.prepare('INSERT INTO announcements (title, link, active, sort_order) VALUES (?, ?, 1, ?)')
    .run(a.title, a.link, i + 1);
  console.log(`  ✅ "${a.title}"`);
  imported.announcements++;
}

// --- 3. Kursplan ---
console.log('\n📅 Kursplan importieren...');

const scheduleEntries = [
  { day: 'Montag', time_start: '16:30', course_name: 'Kinderyoga', instructor: 'Nikola Babi', note: '6–9 Jahre' },
  { day: 'Montag', time_start: '17:30', course_name: 'Teens-Yoga', instructor: 'Nikola Babi', note: '9–12 Jahre' },
  { day: 'Dienstag', time_start: '18:00', course_name: 'Hatha-Yoga', instructor: 'Nikola Babi', note: 'Stufe 1–2' },
  { day: 'Dienstag', time_start: '19:45', course_name: 'Hatha-Yoga', instructor: 'Nikola Babi', note: 'Stufe 2–3' },
  { day: 'Mittwoch', time_start: '19:00', course_name: 'Hatha-Yoga', instructor: 'Nikola Babi', note: 'Stufe 0–2' },
  { day: 'Donnerstag', time_start: '18:00', course_name: 'Yin-Yoga für Frauen', instructor: 'Nikola Babi', note: '' },
  { day: 'Donnerstag', time_start: '19:45', course_name: 'Mantra-Yoga', instructor: 'Nikola Babi', note: 'Stufe 2–3' },
  { day: 'Freitag', time_start: '09:00', course_name: 'Sanfte Morgenklasse', instructor: 'Nikola Babi', note: 'Alle Stufen' },
];

for (let i = 0; i < scheduleEntries.length; i++) {
  const s = scheduleEntries[i];
  const existing = db.prepare('SELECT id FROM schedule WHERE day = ? AND time_start = ? AND course_name = ?')
    .get(s.day, s.time_start, s.course_name);
  if (existing) {
    console.log(`  ⏭  ${s.day} ${s.time_start} ${s.course_name} — existiert bereits`);
    skipped.schedule++;
    continue;
  }
  db.prepare('INSERT INTO schedule (day, time_start, course_name, instructor, note, active, sort_order) VALUES (?, ?, ?, ?, ?, 1, ?)')
    .run(s.day, s.time_start, s.course_name, s.instructor, s.note || null, i + 1);
  console.log(`  ✅ ${s.day} ${s.time_start} — ${s.course_name}`);
  imported.schedule++;
}

// --- 4. Events ---
console.log('\n🎉 Events importieren...');

const events = [
  {
    title: 'Offener Mantra-Singkreis',
    slug: 'mantra-singkreis-maerz-2026',
    description: 'Entdecke die Kraft des gemeinsamen Singens! Wir singen, tönen und lauschen gemeinsam heilsamen Mantras und Lieder aus aller Welt. Nikola am indischen Harmonium und Ali an den Percussions. Keine musikalischen Vorkenntnisse nötig!',
    date_start: '2026-03-29',
    date_end: '2026-03-29',
    image: '/images/mantra-singkreis.webp',
    location: 'Babi-Yoga, Fischbeker Str. 4, Neu Wulmstorf',
  },
  {
    title: 'Yogaretreat im Wendland',
    slug: 'yogaretreat-pfingsten-2026',
    description: 'Hatha Yoga für Anfänger und Fortgeschrittene, Pranayama-Atemübungen und Tiefenentspannung. Ayurvedisch-vegetarische Vollpension inklusive.',
    date_start: '2026-05-22',
    date_end: '2026-05-25',
    image: '/images/yoga-retreat.webp',
    location: 'Göhrde im Wendland, Niedersachsen',
  },
];

for (const e of events) {
  const existing = db.prepare('SELECT id FROM events WHERE slug = ?').get(e.slug);
  if (existing) {
    console.log(`  ⏭  "${e.title}" — existiert bereits`);
    skipped.events++;
    continue;
  }
  db.prepare(`
    INSERT INTO events (title, slug, description, date_start, date_end, image, location, published, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, 1, datetime('now'))
  `).run(e.title, e.slug, e.description, e.date_start, e.date_end, e.image, e.location);
  console.log(`  ✅ "${e.title}"`);
  imported.events++;
}

// --- Zusammenfassung ---
console.log('\n─────────────────────────────────────');
console.log('📊 Migration abgeschlossen:');
console.log(`   Posts:          ${imported.posts} importiert, ${skipped.posts} übersprungen`);
console.log(`   Ankündigungen:  ${imported.announcements} importiert, ${skipped.announcements} übersprungen`);
console.log(`   Kursplan:       ${imported.schedule} importiert, ${skipped.schedule} übersprungen`);
console.log(`   Events:         ${imported.events} importiert, ${skipped.events} übersprungen`);
console.log('─────────────────────────────────────\n');

db.close();
