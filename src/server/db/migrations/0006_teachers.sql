-- cefro:reviewed: approved by Asadbek, 2026-11-07. The three unique indexes are on tables this migration creates (empty, unknown to the previous release); users.role is NOT NULL with a DEFAULT. Additive only.
CREATE TABLE `class_members` (
	`id` text PRIMARY KEY NOT NULL,
	`class_id` text NOT NULL,
	`student_user_id` text NOT NULL,
	`shown_name` text NOT NULL,
	`shared_at` text NOT NULL,
	`share_text_version` text NOT NULL,
	`ended_at` text,
	`ended_by` text,
	FOREIGN KEY (`class_id`) REFERENCES `classes`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`student_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `class_members_open_uq` ON `class_members` (`class_id`,`student_user_id`) WHERE "class_members"."ended_at" IS NULL;--> statement-breakpoint
CREATE INDEX `class_members_student_idx` ON `class_members` (`student_user_id`);--> statement-breakpoint
CREATE TABLE `classes` (
	`id` text PRIMARY KEY NOT NULL,
	`teacher_user_id` text NOT NULL,
	`name` text NOT NULL,
	`join_code` text NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`closed_at` text,
	FOREIGN KEY (`teacher_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `classes_join_code_uq` ON `classes` (`join_code`);--> statement-breakpoint
CREATE INDEX `classes_teacher_idx` ON `classes` (`teacher_user_id`);--> statement-breakpoint
CREATE TABLE `rating_pairs` (
	`teacher_band` integer NOT NULL,
	`app_band` integer NOT NULL,
	`evaluator_version` text NOT NULL,
	`rubric_version` text NOT NULL,
	`part` text NOT NULL,
	`month` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `teacher_ratings` (
	`id` text PRIMARY KEY NOT NULL,
	`attempt_id` text NOT NULL,
	`teacher_user_id` text NOT NULL,
	`class_id` text NOT NULL,
	`agrees` integer NOT NULL,
	`teacher_band` integer,
	`app_band` integer NOT NULL,
	`evaluator_version` text NOT NULL,
	`rubric_version` text NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`attempt_id`) REFERENCES `speaking_attempts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`teacher_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`class_id`) REFERENCES `classes`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `teacher_ratings_attempt_teacher_uq` ON `teacher_ratings` (`attempt_id`,`teacher_user_id`);--> statement-breakpoint
CREATE INDEX `teacher_ratings_class_idx` ON `teacher_ratings` (`class_id`);--> statement-breakpoint
ALTER TABLE `users` ADD `role` text DEFAULT 'student' NOT NULL;