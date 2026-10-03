CREATE TABLE `practice_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`kind` text DEFAULT 'single_task' NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
ALTER TABLE `analytics_events` ADD `session_id` text;--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
-- Hand-edited (see docs/ARCHITECTURE_DECISIONS.md, "Migration strategy"):
-- 1. A retry link that points at a missing attempt cannot satisfy the new foreign key; drop the dangling link.
UPDATE `speaking_attempts` SET `previous_attempt_id` = NULL WHERE `previous_attempt_id` IS NOT NULL AND `previous_attempt_id` NOT IN (SELECT `id` FROM `speaking_attempts`);--> statement-breakpoint
CREATE TABLE `__new_speaking_attempts` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`session_id` text,
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
	`processing_duration_ms` integer,
	`completed_at` text,
	`metrics` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`session_id`) REFERENCES `practice_sessions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`previous_attempt_id`) REFERENCES `speaking_attempts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`task_id`,`task_version`) REFERENCES `speaking_tasks`(`id`,`version`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
-- 2. session_id is new: existing attempts predate sessions and keep NULL.
INSERT INTO `__new_speaking_attempts`("id", "user_id", "session_id", "task_id", "task_version", "attempt_number", "previous_attempt_id", "retry_focus", "status", "failure_stage", "failure_code", "processing_runs", "processing_started_at", "processing_duration_ms", "completed_at", "metrics", "created_at", "updated_at") SELECT "id", "user_id", NULL, "task_id", "task_version", "attempt_number", "previous_attempt_id", "retry_focus", "status", "failure_stage", "failure_code", "processing_runs", "processing_started_at", "processing_duration_ms", "completed_at", "metrics", "created_at", "updated_at" FROM `speaking_attempts`;--> statement-breakpoint
DROP TABLE `speaking_attempts`;--> statement-breakpoint
ALTER TABLE `__new_speaking_attempts` RENAME TO `speaking_attempts`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `speaking_attempts_user_task_number_uq` ON `speaking_attempts` (`user_id`,`task_id`,`attempt_number`);--> statement-breakpoint
CREATE INDEX `speaking_attempts_user_task_idx` ON `speaking_attempts` (`user_id`,`task_id`);--> statement-breakpoint
CREATE INDEX `speaking_attempts_user_created_idx` ON `speaking_attempts` (`user_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `speaking_attempts_created_idx` ON `speaking_attempts` (`created_at`);--> statement-breakpoint
ALTER TABLE `users` ADD `merged_into_user_id` text REFERENCES users(id);