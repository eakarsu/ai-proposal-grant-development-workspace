import { getServerSession } from "next-auth";
import { authOptions } from "./auth";
import { prisma } from "./prisma";
import { canWrite, canDelete, RequestError } from "./record-policy";

export interface SessionUser { id: string; email: string; name: string; role: string }
export async function requireUser(): Promise<SessionUser | null> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return null;
  // Read identity on every request so account deletion and role changes take effect immediately.
  const current = await prisma.user.findUnique({ where: { id: session.user.id }, select: { id: true, email: true, name: true, role: true, active: true } });
  return current?.active ? current : null;
}
export async function authorize(action: "read" | "write" | "delete" = "read") {
  const user = await requireUser();
  if (!user) throw new RequestError("Sign in to continue", 401);
  if ((action === "write" && !canWrite(user.role)) || (action === "delete" && !canDelete(user.role))) throw new RequestError("Your role does not permit this action", 403);
  return user;
}
