import Database from 'better-sqlite3';
import { fileURLToPath } from 'url';
import { dirname, join, resolve } from 'path';
import { existsSync } from 'fs';

// DB-Pfad: data/blog.db im Projekt-Root
// process.cwd() funktioniert sowohl in Dev als auch in Production
const DB_PATH = join(process.cwd(), 'data', 'blog.db');

let _db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (!_db) {
    _db = new Database(DB_PATH);
    _db.pragma('journal_mode = WAL');
    _db.pragma('foreign_keys = ON');
    initSchema(_db);
  }
  return _db;
}

function initSchema(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      name TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      token TEXT NOT NULL UNIQUE,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

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
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
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
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
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

    CREATE INDEX IF NOT EXISTS idx_sessions_token ON sessions(token);
    CREATE INDEX IF NOT EXISTS idx_posts_slug ON posts(slug);
    CREATE INDEX IF NOT EXISTS idx_posts_published ON posts(published, published_at);
    CREATE INDEX IF NOT EXISTS idx_events_slug ON events(slug);
    CREATE INDEX IF NOT EXISTS idx_announcements_active ON announcements(active, sort_order);
    CREATE INDEX IF NOT EXISTS idx_schedule_day ON schedule(day, sort_order);

    CREATE TABLE IF NOT EXISTS holidays (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      date_start TEXT NOT NULL,
      date_end TEXT NOT NULL,
      type TEXT NOT NULL DEFAULT 'custom',
      status TEXT NOT NULL DEFAULT 'info',
      note TEXT,
      source TEXT,
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_holidays_dates ON holidays(date_start, date_end);
    CREATE INDEX IF NOT EXISTS idx_holidays_active ON holidays(active, date_start);
  `);
}

// --- CRUD Helpers ---

// Posts
export function getAllPosts() {
  return getDb().prepare('SELECT * FROM posts ORDER BY published_at DESC, created_at DESC').all();
}

export function getPublishedPosts() {
  return getDb().prepare('SELECT * FROM posts WHERE published = 1 ORDER BY published_at DESC').all();
}

export function getPostById(id: number) {
  return getDb().prepare('SELECT * FROM posts WHERE id = ?').get(id);
}

export function getPostBySlug(slug: string) {
  return getDb().prepare('SELECT * FROM posts WHERE slug = ?').get(slug);
}

export function createPost(data: {
  title: string; slug: string; excerpt: string; body_md: string;
  image?: string; image_alt?: string; video_url?: string; published?: boolean;
}) {
  const now = new Date().toISOString();
  return getDb().prepare(`
    INSERT INTO posts (title, slug, excerpt, body_md, image, image_alt, video_url, published, published_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    data.title, data.slug, data.excerpt, data.body_md,
    data.image || null, data.image_alt || null, data.video_url || null,
    data.published ? 1 : 0, data.published ? now : null, now
  );
}

export function updatePost(id: number, data: {
  title: string; slug: string; excerpt: string; body_md: string;
  image?: string; image_alt?: string; video_url?: string; published?: boolean;
}) {
  const existing = getPostById(id) as any;
  const now = new Date().toISOString();
  const publishedAt = data.published
    ? (existing?.published_at || now)
    : null;

  return getDb().prepare(`
    UPDATE posts SET title=?, slug=?, excerpt=?, body_md=?, image=?, image_alt=?,
    video_url=?, published=?, published_at=?, updated_at=? WHERE id=?
  `).run(
    data.title, data.slug, data.excerpt, data.body_md,
    data.image || null, data.image_alt || null, data.video_url || null,
    data.published ? 1 : 0, publishedAt, now, id
  );
}

export function deletePost(id: number) {
  return getDb().prepare('DELETE FROM posts WHERE id = ?').run(id);
}

// Announcements
export function getAllAnnouncements() {
  return getDb().prepare('SELECT * FROM announcements ORDER BY sort_order ASC, id DESC').all();
}

export function getActiveAnnouncements() {
  return getDb().prepare('SELECT * FROM announcements WHERE active = 1 ORDER BY sort_order ASC').all();
}

export function createAnnouncement(data: { title: string; link?: string; active?: boolean }) {
  const maxOrder = getDb().prepare('SELECT COALESCE(MAX(sort_order), 0) as max_order FROM announcements').get() as any;
  return getDb().prepare('INSERT INTO announcements (title, link, active, sort_order) VALUES (?, ?, ?, ?)')
    .run(data.title, data.link || null, data.active !== false ? 1 : 0, (maxOrder?.max_order || 0) + 1);
}

export function updateAnnouncement(id: number, data: { title: string; link?: string; active?: boolean }) {
  return getDb().prepare('UPDATE announcements SET title=?, link=?, active=? WHERE id=?')
    .run(data.title, data.link || null, data.active ? 1 : 0, id);
}

export function deleteAnnouncement(id: number) {
  return getDb().prepare('DELETE FROM announcements WHERE id = ?').run(id);
}

export function moveAnnouncement(id: number, direction: 'up' | 'down') {
  const all = getAllAnnouncements() as any[];
  const idx = all.findIndex((a: any) => a.id === id);
  if (idx === -1) return;

  const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
  if (swapIdx < 0 || swapIdx >= all.length) return;

  const currentOrder = all[idx].sort_order;
  const swapOrder = all[swapIdx].sort_order;

  const db = getDb();
  db.prepare('UPDATE announcements SET sort_order=? WHERE id=?').run(swapOrder, all[idx].id);
  db.prepare('UPDATE announcements SET sort_order=? WHERE id=?').run(currentOrder, all[swapIdx].id);
}

// Schedule
export function getAllSchedule() {
  const dayOrder = ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag'];
  const all = getDb().prepare('SELECT * FROM schedule ORDER BY sort_order ASC, time_start ASC').all() as any[];
  return all.sort((a, b) => {
    const dayA = dayOrder.indexOf(a.day);
    const dayB = dayOrder.indexOf(b.day);
    if (dayA !== dayB) return dayA - dayB;
    return a.time_start.localeCompare(b.time_start);
  });
}

export function getActiveSchedule() {
  return getAllSchedule().filter((s: any) => s.active);
}

export function getScheduleById(id: number) {
  return getDb().prepare('SELECT * FROM schedule WHERE id = ?').get(id);
}

export function createScheduleEntry(data: {
  day: string; time_start: string; course_name: string; instructor: string; note?: string;
}) {
  return getDb().prepare('INSERT INTO schedule (day, time_start, course_name, instructor, note) VALUES (?, ?, ?, ?, ?)')
    .run(data.day, data.time_start, data.course_name, data.instructor, data.note || null);
}

export function updateScheduleEntry(id: number, data: {
  day: string; time_start: string; course_name: string; instructor: string; note?: string; active?: boolean;
}) {
  return getDb().prepare('UPDATE schedule SET day=?, time_start=?, course_name=?, instructor=?, note=?, active=? WHERE id=?')
    .run(data.day, data.time_start, data.course_name, data.instructor, data.note || null, data.active !== false ? 1 : 0, id);
}

export function deleteScheduleEntry(id: number) {
  return getDb().prepare('DELETE FROM schedule WHERE id = ?').run(id);
}

// Events
export function getAllEvents() {
  return getDb().prepare('SELECT * FROM events ORDER BY date_start DESC, created_at DESC').all();
}

export function getPublishedEvents() {
  return getDb().prepare('SELECT * FROM events WHERE published = 1 ORDER BY date_start ASC').all();
}

export function getEventById(id: number) {
  return getDb().prepare('SELECT * FROM events WHERE id = ?').get(id);
}

export function createEvent(data: {
  title: string; slug: string; description: string;
  date_start?: string; date_end?: string; image?: string; location?: string; published?: boolean;
}) {
  const now = new Date().toISOString();
  return getDb().prepare(`
    INSERT INTO events (title, slug, description, date_start, date_end, image, location, published, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    data.title, data.slug, data.description,
    data.date_start || null, data.date_end || null,
    data.image || null, data.location || null,
    data.published ? 1 : 0, now
  );
}

export function updateEvent(id: number, data: {
  title: string; slug: string; description: string;
  date_start?: string; date_end?: string; image?: string; location?: string; published?: boolean;
}) {
  const now = new Date().toISOString();
  return getDb().prepare(`
    UPDATE events SET title=?, slug=?, description=?, date_start=?, date_end=?,
    image=?, location=?, published=?, updated_at=? WHERE id=?
  `).run(
    data.title, data.slug, data.description,
    data.date_start || null, data.date_end || null,
    data.image || null, data.location || null,
    data.published ? 1 : 0, now, id
  );
}

export function deleteEvent(id: number) {
  return getDb().prepare('DELETE FROM events WHERE id = ?').run(id);
}

// Users
export function getUserByEmail(email: string) {
  return getDb().prepare('SELECT * FROM users WHERE email = ?').get(email);
}

export function getUserById(id: number) {
  return getDb().prepare('SELECT * FROM users WHERE id = ?').get(id);
}

export function updateUserPassword(userId: number, passwordHash: string) {
  return getDb().prepare('UPDATE users SET password_hash = ? WHERE id = ?')
    .run(passwordHash, userId);
}

export function createUser(email: string, passwordHash: string, name: string) {
  return getDb().prepare('INSERT INTO users (email, password_hash, name) VALUES (?, ?, ?)')
    .run(email, passwordHash, name);
}

// Holidays
export function getAllHolidays() {
  return getDb().prepare('SELECT * FROM holidays ORDER BY date_start ASC').all();
}

export function getActiveHolidays() {
  return getDb().prepare('SELECT * FROM holidays WHERE active = 1 ORDER BY date_start ASC').all();
}

export function getCurrentAndUpcomingHolidays() {
  const today = new Date().toISOString().slice(0, 10);
  return getDb().prepare(
    'SELECT * FROM holidays WHERE active = 1 AND date_end >= ? ORDER BY date_start ASC'
  ).all(today);
}

export function getCurrentHolidays() {
  const today = new Date().toISOString().slice(0, 10);
  return getDb().prepare(
    'SELECT * FROM holidays WHERE active = 1 AND date_start <= ? AND date_end >= ? ORDER BY date_start ASC'
  ).all(today, today);
}

export function getHolidayById(id: number) {
  return getDb().prepare('SELECT * FROM holidays WHERE id = ?').get(id);
}

export function createHoliday(data: {
  name: string; date_start: string; date_end: string;
  type?: string; status?: string; note?: string; source?: string;
}) {
  return getDb().prepare(
    'INSERT INTO holidays (name, date_start, date_end, type, status, note, source) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).run(
    data.name, data.date_start, data.date_end,
    data.type || 'custom', data.status || 'info',
    data.note || null, data.source || null
  );
}

export function updateHoliday(id: number, data: {
  name: string; date_start: string; date_end: string;
  status?: string; note?: string; active?: boolean;
}) {
  return getDb().prepare(
    'UPDATE holidays SET name=?, date_start=?, date_end=?, status=?, note=?, active=? WHERE id=?'
  ).run(
    data.name, data.date_start, data.date_end,
    data.status || 'info', data.note || null,
    data.active !== false ? 1 : 0, id
  );
}

export function deleteHoliday(id: number) {
  return getDb().prepare('DELETE FROM holidays WHERE id = ?').run(id);
}

export function deleteSchoolHolidays() {
  return getDb().prepare("DELETE FROM holidays WHERE type = 'school'").run();
}

export function bulkCreateHolidays(holidays: Array<{
  name: string; date_start: string; date_end: string;
  type: string; status: string; source: string;
}>) {
  const insert = getDb().prepare(
    'INSERT INTO holidays (name, date_start, date_end, type, status, source) VALUES (?, ?, ?, ?, ?, ?)'
  );
  const tx = getDb().transaction((items: typeof holidays) => {
    for (const h of items) {
      insert.run(h.name, h.date_start, h.date_end, h.type, h.status, h.source);
    }
  });
  tx(holidays);
}
