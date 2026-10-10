import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { auditEvents, datasets, experiments, jobs, models, modelTransitions, paperEvents, paperSessions } from "@/db/schema";
import { stableHash } from "./math";

const now = () => new Date().toISOString();

export async function audit(actorEmail: string, action: string, resourceType: string, resourceId: string, detail: unknown) {
  const createdAt = now(); await (await getDb()).insert(auditEvents).values({ id: `audit_${stableHash(`${actorEmail}:${action}:${resourceId}:${createdAt}`)}`, actorEmail, action, resourceType, resourceId, detailJson: JSON.stringify(detail), createdAt });
}

export async function saveExperiment(ownerEmail: string, input: { id: string; name: string; configuration: unknown; datasetIds: string[]; result: unknown; codeVersion: string }) {
  const timestamp = now(); await (await getDb()).insert(experiments).values({ id: input.id, ownerEmail, name: input.name, configurationJson: JSON.stringify(input.configuration), datasetIdsJson: JSON.stringify(input.datasetIds), resultJson: JSON.stringify(input.result), codeVersion: input.codeVersion, createdAt: timestamp, updatedAt: timestamp }).onConflictDoUpdate({ target: experiments.id, set: { resultJson: JSON.stringify(input.result), updatedAt: timestamp } }); await audit(ownerEmail, "experiment.completed", "experiment", input.id, { datasetIds: input.datasetIds });
}

export async function listExperiments() { return (await getDb()).select().from(experiments).limit(50); }

export async function saveDataset(ownerEmail: string, manifest: { id:string;provider:string;marketType:string;canonicalSymbol:string;timeframe:string;start:number;end:number;rows:number;checksum:string;quality:unknown }, artifactKey: string) { const timestamp=now(); await (await getDb()).insert(datasets).values({id:manifest.id,provider:manifest.provider,marketType:manifest.marketType,symbol:manifest.canonicalSymbol,timeframe:manifest.timeframe,startAt:manifest.start,endAt:manifest.end,rows:manifest.rows,checksum:manifest.checksum,artifactKey,qualityJson:JSON.stringify(manifest.quality),createdAt:timestamp,updatedAt:timestamp}).onConflictDoNothing(); await audit(ownerEmail,"dataset.imported","dataset",manifest.id,{artifactKey}); }

export async function createJob(type: string, input: unknown, idempotencyKey: string) {
  const id = `job_${stableHash(idempotencyKey)}`; const timestamp = now(); await (await getDb()).insert(jobs).values({ id, type, status: "running", progress: 0, inputJson: JSON.stringify(input), idempotencyKey, attempts: 1, cancellationRequested: false, createdAt: timestamp, updatedAt: timestamp }).onConflictDoNothing(); return id;
}

export async function finishJob(id: string, result: unknown) { await (await getDb()).update(jobs).set({ status: "completed", progress: 1, resultJson: JSON.stringify(result), updatedAt: now() }).where(eq(jobs.id, id)); }
export async function failJob(id: string, error: unknown) { await (await getDb()).update(jobs).set({ status: "failed", error: error instanceof Error ? error.message : String(error), updatedAt: now() }).where(eq(jobs.id, id)); }

export async function listJobs() { return (await getDb()).select().from(jobs).limit(100); }

export async function saveModel(ownerEmail: string, input: { id: string; name: string; version: string; modelType: string; bundle: unknown; metrics: unknown; datasetVersion: string; featureVersion: string; automaticPromotionEligible?: boolean }) {
  const timestamp = now(); await (await getDb()).insert(models).values({ id: input.id, ownerEmail, name: input.name, version: input.version, modelType: input.modelType, status: "challenger", bundleJson: JSON.stringify(input.bundle), metricsJson: JSON.stringify(input.metrics), datasetVersion: input.datasetVersion, featureVersion: input.featureVersion, sourceCommit: process.env.SOURCE_COMMIT || "development", automaticPromotionEligible: input.automaticPromotionEligible ?? false, createdAt: timestamp, updatedAt: timestamp }).onConflictDoNothing(); await audit(ownerEmail, "model.registered", "model", input.id, { status: "challenger", version: input.version });
}

export async function listModels() { return (await getDb()).select().from(models).limit(100); }

export async function transitionModel(actorEmail: string, modelId: string, toStatus: "champion" | "challenger" | "rejected" | "archived", reason: string) {
  const db=await getDb(); const records = await db.select().from(models).where(eq(models.id, modelId)).limit(1); const model = records[0]; if (!model) throw new Error("Unknown model"); if (toStatus === "champion" && model.status === "rejected") throw new Error("Rejected models cannot be promoted"); if (toStatus === "champion") { const champions = await db.select().from(models).where(eq(models.status, "champion")); for (const champion of champions) await db.update(models).set({ status: "archived", updatedAt: now() }).where(eq(models.id, champion.id)); }
  await db.update(models).set({ status: toStatus, updatedAt: now() }).where(eq(models.id, modelId)); const createdAt = now(); await db.insert(modelTransitions).values({ id: `transition_${stableHash(`${modelId}:${createdAt}`)}`, modelId, fromStatus: model.status, toStatus, reason, actorEmail, createdAt }); await audit(actorEmail, `model.${toStatus}`, "model", modelId, { reason });
}

export async function savePaperSession(ownerEmail: string, input: { id: string; modelId: string; status: string; configuration: unknown; state: unknown; lastEventTimestamp?: number | null }) {
  const timestamp = now(); await (await getDb()).insert(paperSessions).values({ id: input.id, ownerEmail, modelId: input.modelId, status: input.status, configurationJson: JSON.stringify(input.configuration), stateJson: JSON.stringify(input.state), lastEventTimestamp: input.lastEventTimestamp, createdAt: timestamp, updatedAt: timestamp }).onConflictDoUpdate({ target: paperSessions.id, set: { status: input.status, stateJson: JSON.stringify(input.state), lastEventTimestamp: input.lastEventTimestamp, updatedAt: timestamp } });
}

export async function getPaperSession(id: string) { return (await (await getDb()).select().from(paperSessions).where(eq(paperSessions.id, id)).limit(1))[0] ?? null; }
export async function listPaperSessions() { return (await getDb()).select().from(paperSessions).limit(100); }
export async function appendPaperEvent(sessionId: string, eventTimestamp: number, eventType: string, modelVersion: string, payload: unknown) { const checksum = stableHash(JSON.stringify({ sessionId, eventTimestamp, eventType, payload })); await (await getDb()).insert(paperEvents).values({ id: `event_${checksum}`, sessionId, eventTimestamp, eventType, modelVersion, payloadJson: JSON.stringify(payload), checksum, createdAt: now() }).onConflictDoNothing(); }
export async function listPaperEvents(sessionId:string){return (await getDb()).select().from(paperEvents).where(eq(paperEvents.sessionId,sessionId)).orderBy(paperEvents.eventTimestamp).limit(10000)}

export async function putArtifact(key: string, value: string | ArrayBuffer, contentType: string) { const {env}=await import("cloudflare:workers"); if (!env.ARTIFACTS) throw new Error("Artifact storage is unavailable"); await env.ARTIFACTS.put(key, value, { httpMetadata: { contentType } }); return key; }
