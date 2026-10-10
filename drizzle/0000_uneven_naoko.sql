CREATE TABLE `audit_events` (
	`id` text PRIMARY KEY NOT NULL,
	`actor_email` text NOT NULL,
	`action` text NOT NULL,
	`resource_type` text NOT NULL,
	`resource_id` text NOT NULL,
	`detail_json` text NOT NULL,
	`ip_hash` text,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `audit_events_resource_idx` ON `audit_events` (`resource_type`,`resource_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `datasets` (
	`id` text PRIMARY KEY NOT NULL,
	`provider` text NOT NULL,
	`market_type` text NOT NULL,
	`symbol` text NOT NULL,
	`timeframe` text NOT NULL,
	`start_at` integer NOT NULL,
	`end_at` integer NOT NULL,
	`rows` integer NOT NULL,
	`checksum` text NOT NULL,
	`artifact_key` text,
	`quality_json` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `datasets_checksum_uq` ON `datasets` (`checksum`);--> statement-breakpoint
CREATE INDEX `datasets_coverage_idx` ON `datasets` (`provider`,`symbol`,`timeframe`,`start_at`,`end_at`);--> statement-breakpoint
CREATE TABLE `experiments` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_email` text NOT NULL,
	`name` text NOT NULL,
	`configuration_json` text NOT NULL,
	`dataset_ids_json` text NOT NULL,
	`result_json` text,
	`code_version` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`type` text NOT NULL,
	`status` text NOT NULL,
	`progress` real DEFAULT 0 NOT NULL,
	`input_json` text NOT NULL,
	`result_json` text,
	`error` text,
	`cancellation_requested` integer DEFAULT false NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`idempotency_key` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `jobs_idempotency_uq` ON `jobs` (`idempotency_key`);--> statement-breakpoint
CREATE INDEX `jobs_status_idx` ON `jobs` (`status`,`created_at`);--> statement-breakpoint
CREATE TABLE `model_transitions` (
	`id` text PRIMARY KEY NOT NULL,
	`model_id` text NOT NULL,
	`from_status` text NOT NULL,
	`to_status` text NOT NULL,
	`reason` text NOT NULL,
	`actor_email` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `model_transitions_model_idx` ON `model_transitions` (`model_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `models` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_email` text NOT NULL,
	`name` text NOT NULL,
	`version` text NOT NULL,
	`model_type` text NOT NULL,
	`status` text NOT NULL,
	`artifact_key` text,
	`bundle_json` text NOT NULL,
	`metrics_json` text NOT NULL,
	`dataset_version` text NOT NULL,
	`feature_version` text NOT NULL,
	`source_commit` text NOT NULL,
	`automatic_promotion_eligible` integer DEFAULT false NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `models_name_version_uq` ON `models` (`name`,`version`);--> statement-breakpoint
CREATE INDEX `models_status_idx` ON `models` (`status`,`updated_at`);--> statement-breakpoint
CREATE TABLE `paper_events` (
	`id` text PRIMARY KEY NOT NULL,
	`session_id` text NOT NULL,
	`event_timestamp` integer NOT NULL,
	`event_type` text NOT NULL,
	`model_version` text NOT NULL,
	`payload_json` text NOT NULL,
	`checksum` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `paper_events_checksum_uq` ON `paper_events` (`session_id`,`checksum`);--> statement-breakpoint
CREATE INDEX `paper_events_session_idx` ON `paper_events` (`session_id`,`event_timestamp`);--> statement-breakpoint
CREATE TABLE `paper_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_email` text NOT NULL,
	`model_id` text NOT NULL,
	`status` text NOT NULL,
	`configuration_json` text NOT NULL,
	`state_json` text NOT NULL,
	`last_event_timestamp` integer,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `paper_sessions_status_idx` ON `paper_sessions` (`status`,`updated_at`);