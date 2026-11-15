CREATE TABLE `class_mocks` (
	`id` text PRIMARY KEY NOT NULL,
	`class_id` text NOT NULL,
	`teacher_user_id` text NOT NULL,
	`title` text NOT NULL,
	`task_1_1` text,
	`task_1_2` text,
	`task_2` text,
	`task_3` text,
	`opened_at` text NOT NULL,
	`closed_at` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`class_id`) REFERENCES `classes`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`teacher_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `class_mocks_class_idx` ON `class_mocks` (`class_id`);--> statement-breakpoint
CREATE TABLE `exam_passes` (
	`id` text PRIMARY KEY NOT NULL,
	`class_mock_id` text NOT NULL,
	`student_user_id` text NOT NULL,
	`device_label` text NOT NULL,
	`laptop_id` text NOT NULL,
	`session_id` text,
	`created_at` text NOT NULL,
	`expires_at` text NOT NULL,
	`used_up_at` text,
	FOREIGN KEY (`class_mock_id`) REFERENCES `class_mocks`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`student_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `exam_passes_class_mock_idx` ON `exam_passes` (`class_mock_id`);--> statement-breakpoint
CREATE INDEX `exam_passes_student_idx` ON `exam_passes` (`student_user_id`);--> statement-breakpoint
ALTER TABLE `class_members` ADD `pin_hash` text;--> statement-breakpoint
ALTER TABLE `class_members` ADD `pin_failures` text;--> statement-breakpoint
ALTER TABLE `practice_sessions` ADD `class_mock_id` text;