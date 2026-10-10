import { apiError } from "@/lib/platform/http";
import { listJobs } from "@/lib/platform/store";
export async function GET() { try { return Response.json({ jobs: await listJobs() }, { headers: { "Cache-Control": "no-store" } }); } catch (error) { return apiError(error, "Unable to load jobs"); } }
