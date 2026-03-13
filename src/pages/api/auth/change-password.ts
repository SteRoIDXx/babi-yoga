export const prerender = false;

import type { APIRoute } from 'astro';
import { validateSession, verifyPassword, hashPassword, validateCsrfToken } from '../../../lib/auth';
import { getUserById, updateUserPassword } from '../../../lib/db';

export const POST: APIRoute = async ({ request, cookies, redirect }) => {
  // Session prüfen
  const sessionToken = cookies.get('session_token')?.value;
  if (!sessionToken) return redirect('/admin/login');

  const session = validateSession(sessionToken);
  if (!session) {
    cookies.delete('session_token', { path: '/' });
    return redirect('/admin/login');
  }

  try {
    const formData = await request.formData();
    const csrf = formData.get('_csrf')?.toString() || '';
    const currentPassword = formData.get('current_password')?.toString() || '';
    const newPassword = formData.get('new_password')?.toString() || '';
    const confirmPassword = formData.get('confirm_password')?.toString() || '';

    // CSRF prüfen
    if (!validateCsrfToken(csrf)) {
      return redirect('/admin/password?error=csrf');
    }

    // Pflichtfelder
    if (!currentPassword || !newPassword || !confirmPassword) {
      return redirect('/admin/password?error=missing');
    }

    // Neues Passwort: Mindestlänge 8
    if (newPassword.length < 8) {
      return redirect('/admin/password?error=short');
    }

    // Neues Passwort: Maximallänge 128
    if (newPassword.length > 128) {
      return redirect('/admin/password?error=invalid');
    }

    // Passwörter stimmen überein?
    if (newPassword !== confirmPassword) {
      return redirect('/admin/password?error=mismatch');
    }

    // Aktuelles Passwort nicht gleich dem neuen
    if (currentPassword === newPassword) {
      return redirect('/admin/password?error=same');
    }

    // User aus DB laden
    const user = getUserById(session.userId) as any;
    if (!user) {
      return redirect('/admin/login');
    }

    // Aktuelles Passwort verifizieren
    const currentValid = await verifyPassword(currentPassword, user.password_hash);
    if (!currentValid) {
      return redirect('/admin/password?error=wrong');
    }

    // Neues Passwort hashen und speichern
    const newHash = await hashPassword(newPassword);
    updateUserPassword(session.userId, newHash);

    return redirect('/admin/password?success=1');
  } catch (err) {
    console.error('Passwort-Änderung Fehler:', err);
    return redirect('/admin/password?error=server');
  }
};
