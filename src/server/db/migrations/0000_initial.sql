CREATE TABLE `analytics_events` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`source` text NOT NULL,
	`user_id` text,
	`task_id` text,
	`attempt_id` text,
	`properties` text,
	`occurred_at` text NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `analytics_events_name_idx` ON `analytics_events` (`name`);--> statement-breakpoint
CREATE INDEX `analytics_events_user_idx` ON `analytics_events` (`user_id`);--> statement-breakpoint
CREATE TABLE `evaluations` (
	`id` text PRIMARY KEY NOT NULL,
	`attempt_id` text NOT NULL,
	`transcript_id` text NOT NULL,
	`evaluator_version` text NOT NULL,
	`rubric_version` text NOT NULL,
	`schema_version` integer NOT NULL,
	`prompt_hash` text NOT NULL,
	`provider` text NOT NULL,
	`model` text NOT NULL,
	`overall_level` text NOT NULL,
	`result` text NOT NULL,
	`latency_ms` integer,
	`input_tokens` integer,
	`output_tokens` integer,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`attempt_id`) REFERENCES `speaking_attempts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`transcript_id`) REFERENCES `transcripts`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `evaluations_attempt_idx` ON `evaluations` (`attempt_id`);--> statement-breakpoint
CREATE TABLE `recordings` (
	`id` text PRIMARY KEY NOT NULL,
	`attempt_id` text NOT NULL,
	`storage_provider` text NOT NULL,
	`storage_key` text NOT NULL,
	`mime_type` text NOT NULL,
	`size_bytes` integer NOT NULL,
	`duration_ms` integer NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`attempt_id`) REFERENCES `speaking_attempts`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `recordings_attempt_uq` ON `recordings` (`attempt_id`);--> statement-breakpoint
CREATE TABLE `speaking_attempts` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`task_id` text NOT NULL,
	`task_version` integer NOT NULL,
	`attempt_number` integer NOT NULL,
	`previous_attempt_id` text,
	`retry_focus` text,
	`status` text NOT NULL,
	`failure_stage` text,
	`failure_code` text,
	`processing_runs` integer DEFAULT 0 NOT NULL,
	`processing_started_at` text,
	`completed_at` text,
	`metrics` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `speaking_attempts_user_task_number_uq` ON `speaking_attempts` (`user_id`,`task_id`,`attempt_number`);--> statement-breakpoint
CREATE INDEX `speaking_attempts_user_task_idx` ON `speaking_attempts` (`user_id`,`task_id`);--> statement-breakpoint
CREATE TABLE `speaking_tasks` (
	`id` text NOT NULL,
	`version` integer NOT NULL,
	`level` text NOT NULL,
	`part` integer NOT NULL,
	`title` text NOT NULL,
	`content` text NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `speaking_tasks_id_version_uq` ON `speaking_tasks` (`id`,`version`);--> statement-breakpoint
CREATE TABLE `transcripts` (
	`id` text PRIMARY KEY NOT NULL,
	`attempt_id` text NOT NULL,
	`provider` text NOT NULL,
	`model` text NOT NULL,
	`text` text NOT NULL,
	`language` text,
	`latency_ms` integer,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`attempt_id`) REFERENCES `speaking_attempts`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `transcripts_attempt_idx` ON `transcripts` (`attempt_id`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text DEFAULT 'anonymous' NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
);
