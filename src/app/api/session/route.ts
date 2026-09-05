import { authorize } from "@/lib/api-auth";
import { errorResponse } from "@/lib/record-store";
export async function GET() {
  try { return Response.json({ user: await authorize() }); } catch (error) { return errorResponse(error); }
}
