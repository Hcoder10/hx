import { getRepoLog } from "@/lib/hx";

export const runtime = "nodejs";

// The real git log — proof the record is genuine version control.
export async function GET() {
  return Response.json(await getRepoLog());
}
