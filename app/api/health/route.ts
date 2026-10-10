import { pluginCatalog } from "@/lib/platform/registry";
import { getBinanceConfig } from "@/lib/binance";
export async function GET() { return Response.json({ status: "healthy", service: "tradepilot-research", version: "1.0.0", compatibilityVersion: "1.0", plugins: pluginCatalog().length, timestamp: new Date().toISOString(), researchExecution: "paper-only", existingQuickOrderEnabled: getBinanceConfig().tradingEnabled }, { headers: { "Cache-Control": "no-store" } }); }
