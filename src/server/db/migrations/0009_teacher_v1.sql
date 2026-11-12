-- cefro:reviewed: reviewed and approved by Asadbek, 2026-11-12. Additive only: new table teacher_mock_ratings (unique index on a table this migration creates) and two nullable class_members columns.
CREATE TABLE `teacher_mock_ratings` (
	`id` text PRIMARY KEY NOT NULL,
	`session_id` text NOT NULL,
	`teacher_user_id` text NOT NULL,
	`class_id` text NOT NULL,
	`agrees` integer NOT NULL,
	`teacher_level` text,
	`app_level` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`session_id`) REFERENCES `practice_sessions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`teacher_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`class_id`) REFERENCES `classes`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `teacher_mock_ratings_session_teacher_uq` ON `teacher_mock_ratings` (`session_id`,`teacher_user_id`);--> statement-breakpoint
CREATE INDEX `teacher_mock_ratings_class_idx` ON `teacher_mock_ratings` (`class_id`);--> statement-breakpoint
ALTER TABLE `class_members` ADD `all_parts_from` text;--> statement-breakpoint
ALTER TABLE `class_members` ADD `upgrade_declined_at` text;