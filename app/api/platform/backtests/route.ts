import { resolveData } from "@/lib/platform/data";
import { runBacktest } from "@/lib/platform/backtest";
import type { ExperimentConfiguration } from "@/lib/platform/contracts";
import { apiError, protectMutation, readJson } from "@/lib/platform/http";
import { createJob, failJob, finishJob, listExperiments, saveExperiment } from "@/lib/platform/store";
import { stableHash } from "@/lib/platform/math";

export async function GET() { try { const records = await listExperiments(); return Response.json({ experiments: records.map((record) => ({ id: record.id, name: record.name, configuration: JSON.parse(record.configurationJson), datasetIds: JSON.parse(record.datasetIdsJson), result: record.resultJson ? JSON.parse(record.resultJson) : null, codeVersion: record.codeVersion, createdAt: record.createdAt })) }, { headers: { "Cache-Control": "no-store" } }); } catch (error) { return apiError(error, "Unable to load backtests"); } }

export async function POST(request: Request) {
  const auth = protectMutation(request); if (auth.response) return auth.response; let jobId = "";
  try {
    const body = await readJson<{ name?: string; configuration: ExperimentConfiguration }>(request); const configuration = body.configuration; const idempotencyKey = `backtest:${stableHash(JSON.stringify(configuration))}`; jobId = await createJob("backtest", configuration, idempotencyKey); const datasets: Record<string, Awaited<ReturnType<typeof resolveData>>["candles"]> = {}; const manifests = [];
    for (const symbol of configuration.symbols) { const resolved = await resolveData({ provider: configuration.provider, symbol, timeframe: configuration.timeframe, start: configuration.start, end: configuration.end, marketType: configuration.marketType }); if (!resolved.candles.length) throw new Error(`No completed candles available for ${symbol}`); datasets[symbol.toUpperCase()] = resolved.candles; manifests.push(resolved.manifest); }
    const result = runBacktest(configuration, datasets, manifests.map((manifest) => manifest.id)); result.strategyResults = configuration.strategies.map((selected) => { const independent = runBacktest({ ...configuration, strategies: [selected] }, datasets, result.datasetIds); return { strategyId: selected.id, metrics: independent.metrics, equity: independent.equity }; }); await saveExperiment(auth.email!, { id: result.id, name: body.name?.trim() || `${configuration.symbols.join(", ")} research`, configuration, datasetIds: result.datasetIds, result, codeVersion: result.codeVersion }); await finishJob(jobId, { experimentId: result.id }); return Response.json({ jobId, manifests, result }, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) { if (jobId) await failJob(jobId, error).catch(() => undefined); return apiError(error, "Backtest failed"); }
}
