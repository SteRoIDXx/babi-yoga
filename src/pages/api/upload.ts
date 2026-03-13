import type { APIRoute } from 'astro';
import { validateSession } from '../../lib/auth';
import sharp from 'sharp';
import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';

export const prerender = false;

// Im Dev-Modus: public/images/uploads, im Build: dist/client/images/uploads
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const isDev = import.meta.env.DEV;
const UPLOAD_DIR = isDev
  ? join(process.cwd(), 'public', 'images', 'uploads')
  : join(process.cwd(), 'dist', 'client', 'images', 'uploads');
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

// Erlaubte MIME-Types + Magic Bytes
const ALLOWED_TYPES = new Map([
  ['image/jpeg', [0xFF, 0xD8, 0xFF]],
  ['image/png', [0x89, 0x50, 0x4E, 0x47]],
  ['image/webp', [0x52, 0x49, 0x46, 0x46]], // RIFF
]);

function validateMagicBytes(buffer: Buffer, mimeType: string): boolean {
  const expected = ALLOWED_TYPES.get(mimeType);
  if (!expected) return false;
  for (let i = 0; i < expected.length; i++) {
    if (buffer[i] !== expected[i]) return false;
  }
  return true;
}

export const POST: APIRoute = async ({ request, cookies }) => {
  // Auth prüfen
  const token = cookies.get('session_token')?.value;
  if (!token || !validateSession(token)) {
    return new Response(JSON.stringify({ error: 'Nicht autorisiert' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;

    if (!file || !(file instanceof File)) {
      return new Response(JSON.stringify({ error: 'Keine Datei hochgeladen' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Dateigröße
    if (file.size > MAX_FILE_SIZE) {
      return new Response(JSON.stringify({ error: 'Datei zu groß (max. 10 MB)' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // MIME-Type
    if (!ALLOWED_TYPES.has(file.type)) {
      return new Response(JSON.stringify({ error: 'Nur JPG, PNG und WebP Bilder erlaubt' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Datei einlesen
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Magic Bytes prüfen
    if (!validateMagicBytes(buffer, file.type)) {
      return new Response(JSON.stringify({ error: 'Datei-Inhalt stimmt nicht mit dem Typ überein' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Upload-Verzeichnis erstellen
    if (!existsSync(UPLOAD_DIR)) {
      mkdirSync(UPLOAD_DIR, { recursive: true });
    }

    // Dateiname: UUID + .webp (sicher, kein Path Traversal)
    const uuid = crypto.randomUUID().split('-')[0];
    const filename = `${uuid}.webp`;
    const filepath = join(UPLOAD_DIR, filename);

    // Zu WebP konvertieren (max 1600px Breite, Qualität 80)
    await sharp(buffer)
      .resize(1600, null, { withoutEnlargement: true })
      .webp({ quality: 80 })
      .toFile(filepath);

    const url = `/images/uploads/${filename}`;

    return new Response(JSON.stringify({ url, filename }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('Upload error:', err);
    return new Response(JSON.stringify({ error: 'Upload fehlgeschlagen' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
