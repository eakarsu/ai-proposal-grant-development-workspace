import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/prisma';
import { localLoginAllowed } from '@/lib/local-login';
export const dynamic = 'force-dynamic';
const headers = { 'Cache-Control': 'private, no-store, max-age=0', 'Vary': 'Origin, Host', 'Cross-Origin-Resource-Policy': 'same-origin' };
export async function GET(request: Request) {
  return Response.json({ enabled: localLoginAllowed(request) && Boolean(process.env.INITIAL_ADMIN_EMAIL && process.env.INITIAL_ADMIN_PASSWORD) }, { headers });
}
export async function POST(request: Request) {
  if (!localLoginAllowed(request)) return Response.json({ error: 'Credential filling is available only in an enabled local workspace.' }, { status: 403, headers });
  try {
    const email = process.env.INITIAL_ADMIN_EMAIL?.trim().toLowerCase();
    const password = process.env.INITIAL_ADMIN_PASSWORD;
    if (!email || !password) return Response.json({ error: 'Local credentials are not configured.' }, { status: 404, headers });
    const user = await prisma.user.findUnique({ where: { email }, select: { active: true, passwordHash: true } });
    if (!user?.active || !await bcrypt.compare(password, user.passwordHash)) return Response.json({ error: 'The initial login has changed or is inactive. Enter your current credentials.' }, { status: 409, headers });
    return Response.json({ email, password }, { headers });
  } catch {
    return Response.json({ error: 'Unable to load the local login. Check the database connection.' }, { status: 503, headers });
  }
}
