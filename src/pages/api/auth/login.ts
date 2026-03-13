import type { APIRoute } from 'astro';
import { getUserByEmail } from '../../../lib/db';
import { verifyPassword, createSession, isRateLimited, recordFailedLogin, clearLoginAttempts, validateCsrfToken } from '../../../lib/auth';

export const prerender = false;

export const POST: APIRoute = async ({ request, cookies, clientAddress }) => {
  const ip = clientAddress || 'unknown';

  // Rate Limiting
  if (isRateLimited(ip)) {
    return new Response(JSON.stringify({
      error: 'Zu viele Anmeldeversuche. Bitte warten Sie 15 Minuten.'
    }), { status: 429, headers: { 'Content-Type': 'application/json' } });
  }

  try {
    const formData = await request.formData();
    const email = (formData.get('email') as string || '').trim().toLowerCase();
    const password = formData.get('password') as string || '';
    const csrfToken = formData.get('_csrf') as string || '';

    // CSRF-Validierung
    if (!validateCsrfToken(csrfToken)) {
      return new Response(null, {
        status: 302,
        headers: { Location: '/admin/login?error=csrf' },
      });
    }

    // Input-Validierung
    if (!email || !password) {
      return new Response(null, {
        status: 302,
        headers: { Location: '/admin/login?error=missing' },
      });
    }

    if (email.length > 254 || password.length > 128) {
      return new Response(null, {
        status: 302,
        headers: { Location: '/admin/login?error=invalid' },
      });
    }

    // User suchen
    const user = getUserByEmail(email) as any;
    if (!user) {
      recordFailedLogin(ip);
      return new Response(null, {
        status: 302,
        headers: { Location: '/admin/login?error=credentials' },
      });
    }

    // Passwort prüfen
    const valid = await verifyPassword(password, user.password_hash);
    if (!valid) {
      recordFailedLogin(ip);
      return new Response(null, {
        status: 302,
        headers: { Location: '/admin/login?error=credentials' },
      });
    }

    // Session erstellen
    clearLoginAttempts(ip);
    const token = createSession(user.id);

    cookies.set('session_token', token, {
      path: '/',
      httpOnly: true,
      secure: true,
      sameSite: 'strict',
      maxAge: 60 * 60 * 24, // 24h
    });

    return new Response(null, {
      status: 302,
      headers: { Location: '/admin/' },
    });
  } catch (err) {
    console.error('Login error:', err);
    return new Response(null, {
      status: 302,
      headers: { Location: '/admin/login?error=server' },
    });
  }
};
