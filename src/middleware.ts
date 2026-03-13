import { defineMiddleware } from 'astro:middleware';
import { validateSession } from './lib/auth';

export const onRequest = defineMiddleware(async (context, next) => {
  const { pathname } = context.url;

  // Nur Admin-Routen schützen (nicht Login-Seite, nicht API-Auth)
  if (pathname.startsWith('/admin') && pathname !== '/admin/login') {
    const sessionToken = context.cookies.get('session_token')?.value;

    if (!sessionToken) {
      return context.redirect('/admin/login');
    }

    const user = validateSession(sessionToken);
    if (!user) {
      // Abgelaufene Session → Cookie löschen
      context.cookies.delete('session_token', { path: '/' });
      return context.redirect('/admin/login');
    }

    // User-Daten für Admin-Seiten verfügbar machen
    context.locals.user = user;
  }

  return next();
});
