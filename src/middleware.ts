import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { jwtVerify } from 'jose';

const COOKIE_NAME = 'id_session';

async function isValid(token: string | undefined): Promise<boolean> {
  if (!token) return false;
  const secret = process.env.AUTH_SECRET;
  if (!secret) return false;
  try {
    await jwtVerify(token, new TextEncoder().encode(secret));
    return true;
  } catch {
    return false;
  }
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const isPublic =
    pathname === '/login' || pathname.startsWith('/api/auth/login');

  const valid = await isValid(req.cookies.get(COOKIE_NAME)?.value);

  if (!isPublic && !valid) {
    const url = new URL('/login', req.url);
    return NextResponse.redirect(url);
  }
  if (pathname === '/login' && valid) {
    return NextResponse.redirect(new URL('/overview', req.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.svg).*)'],
};
