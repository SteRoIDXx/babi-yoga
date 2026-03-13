import type { APIRoute } from 'astro';
import { deleteSession } from '../../../lib/auth';

export const prerender = false;

export const POST: APIRoute = async ({ cookies }) => {
  const token = cookies.get('session_token')?.value;
  if (token) {
    deleteSession(token);
  }

  cookies.delete('session_token', { path: '/' });

  return new Response(null, {
    status: 302,
    headers: { Location: '/admin/login' },
  });
};
