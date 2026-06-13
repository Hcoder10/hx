import { getMedications } from "@/lib/hx";

export const runtime = "nodejs";

export async function GET() {
  return Response.json(getMedications());
}
