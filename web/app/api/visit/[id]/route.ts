import { getVisit } from "@/lib/hx";

export const runtime = "nodejs";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const visit = getVisit(id);
  if (!visit) return new Response("Not found", { status: 404 });
  return Response.json(visit);
}
