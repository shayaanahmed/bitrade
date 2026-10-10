import { importModelBundle, type ModelBundle } from "@/lib/platform/ensemble";
import { apiError, protectMutation, readJson } from "@/lib/platform/http";

export async function POST(request: Request) { const auth = protectMutation(request); if (auth.response) return auth.response; try { const bundle = await readJson<ModelBundle>(request, 5_000_000); const model = importModelBundle(bundle); return Response.json({ valid: true, model: model.serialize(), testVectors: bundle.testVectors.length, compatibilityVersion: bundle.compatibilityVersion }); } catch (error) { return apiError(error, "Bundle validation failed"); } }
