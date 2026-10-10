import { index, integer, real, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

const timestamps = {
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
};

export const datasets = sqliteTable("datasets", {
  id: text("id").primaryKey(), provider: text("provider").notNull(), marketType: text("market_type").notNull(), symbol: text("symbol").notNull(), timeframe: text("timeframe").notNull(), startAt: integer("start_at").notNull(), endAt: integer("end_at").notNull(), rows: integer("rows").notNull(), checksum: text("checksum").notNull(), artifactKey: text("artifact_key"), qualityJson: text("quality_json").notNull(), ...timestamps,
}, (table) => [uniqueIndex("datasets_checksum_uq").on(table.checksum), index("datasets_coverage_idx").on(table.provider, table.symbol, table.timeframe, table.startAt, table.endAt)]);

export const jobs = sqliteTable("jobs", {
  id: text("id").primaryKey(), type: text("type").notNull(), status: text("status").notNull(), progress: real("progress").notNull().default(0), inputJson: text("input_json").notNull(), resultJson: text("result_json"), error: text("error"), cancellationRequested: integer("cancellation_requested", { mode: "boolean" }).notNull().default(false), attempts: integer("attempts").notNull().default(0), idempotencyKey: text("idempotency_key").notNull(), ...timestamps,
}, (table) => [uniqueIndex("jobs_idempotency_uq").on(table.idempotencyKey), index("jobs_status_idx").on(table.status, table.createdAt)]);

export const experiments = sqliteTable("experiments", {
  id: text("id").primaryKey(), ownerEmail: text("owner_email").notNull(), name: text("name").notNull(), configurationJson: text("configuration_json").notNull(), datasetIdsJson: text("dataset_ids_json").notNull(), resultJson: text("result_json"), codeVersion: text("code_version").notNull(), ...timestamps,
});

export const models = sqliteTable("models", {
  id: text("id").primaryKey(), ownerEmail: text("owner_email").notNull(), name: text("name").notNull(), version: text("version").notNull(), modelType: text("model_type").notNull(), status: text("status").notNull(), artifactKey: text("artifact_key"), bundleJson: text("bundle_json").notNull(), metricsJson: text("metrics_json").notNull(), datasetVersion: text("dataset_version").notNull(), featureVersion: text("feature_version").notNull(), sourceCommit: text("source_commit").notNull(), automaticPromotionEligible: integer("automatic_promotion_eligible", { mode: "boolean" }).notNull().default(false), ...timestamps,
}, (table) => [uniqueIndex("models_name_version_uq").on(table.name, table.version), index("models_status_idx").on(table.status, table.updatedAt)]);

export const modelTransitions = sqliteTable("model_transitions", {
  id: text("id").primaryKey(), modelId: text("model_id").notNull(), fromStatus: text("from_status").notNull(), toStatus: text("to_status").notNull(), reason: text("reason").notNull(), actorEmail: text("actor_email").notNull(), createdAt: text("created_at").notNull(),
}, (table) => [index("model_transitions_model_idx").on(table.modelId, table.createdAt)]);

export const paperSessions = sqliteTable("paper_sessions", {
  id: text("id").primaryKey(), ownerEmail: text("owner_email").notNull(), modelId: text("model_id").notNull(), status: text("status").notNull(), configurationJson: text("configuration_json").notNull(), stateJson: text("state_json").notNull(), lastEventTimestamp: integer("last_event_timestamp"), ...timestamps,
}, (table) => [index("paper_sessions_status_idx").on(table.status, table.updatedAt)]);

export const paperEvents = sqliteTable("paper_events", {
  id: text("id").primaryKey(), sessionId: text("session_id").notNull(), eventTimestamp: integer("event_timestamp").notNull(), eventType: text("event_type").notNull(), modelVersion: text("model_version").notNull(), payloadJson: text("payload_json").notNull(), checksum: text("checksum").notNull(), createdAt: text("created_at").notNull(),
}, (table) => [uniqueIndex("paper_events_checksum_uq").on(table.sessionId, table.checksum), index("paper_events_session_idx").on(table.sessionId, table.eventTimestamp)]);

export const auditEvents = sqliteTable("audit_events", {
  id: text("id").primaryKey(), actorEmail: text("actor_email").notNull(), action: text("action").notNull(), resourceType: text("resource_type").notNull(), resourceId: text("resource_id").notNull(), detailJson: text("detail_json").notNull(), ipHash: text("ip_hash"), createdAt: text("created_at").notNull(),
}, (table) => [index("audit_events_resource_idx").on(table.resourceType, table.resourceId, table.createdAt)]);
