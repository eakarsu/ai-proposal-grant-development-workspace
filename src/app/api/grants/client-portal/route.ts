import { NextRequest } from "next/server";
import { z } from "zod";
import { readJson } from "@/lib/request-body";
import { RequestError } from "@/lib/record-policy";
import { errorResponse } from "@/lib/record-store";
import { acceptPortalInvitation, acceptPortalSchema, newPortalToken, portalSummary,
  portalTokenSchema, previewPortalInvitation } from "@/lib/grants/client-portal";

const requestSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("PREVIEW"), token: portalTokenSchema }).strict(),
  acceptPortalSchema.extend({ action: z.literal("ACCEPT") }).strict(),
  z.object({ action: z.literal("VIEW"), accessToken: portalTokenSchema }).strict(),
]);

export async function POST(request: NextRequest) {
  try {
    const origin = request.headers.get("origin");
    if (origin && origin !== request.nextUrl.origin && origin !== process.env.NEXTAUTH_URL)
      throw new RequestError("Origin is not allowed", 403);
    const input = requestSchema.parse(await readJson(request));
    let result: unknown;
    if (input.action === "PREVIEW") result = await previewPortalInvitation(input.token);
    else if (input.action === "VIEW") result = await portalSummary(input.accessToken);
    else {
      const accessToken = newPortalToken();
      result = { ...await acceptPortalInvitation(input, accessToken), accessToken,
        message: "Acceptance recorded. Save the private access link; it is shown only once and expires in 30 days. Your email identity was not independently verified." };
    }
    return Response.json(result, { headers: { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" } });
  } catch (error) {
    if (error instanceof z.ZodError)
      return Response.json({ error: "Portal request fields are invalid" }, { status: 422,
        headers: { "Cache-Control": "no-store" } });
    const response = errorResponse(error);
    response.headers.set("Cache-Control", "no-store");
    return response;
  }
}
