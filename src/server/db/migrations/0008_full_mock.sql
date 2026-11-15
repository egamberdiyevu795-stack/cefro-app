ALTER TABLE `practice_sessions` ADD `status` text;--> statement-breakpoint
ALTER TABLE `practice_sessions` ADD `finished_at` text;--> statement-breakpoint
CREATE INDEX `practice_sessions_user_kind_idx` ON `practice_sessions` (`user_id`,`kind`,`status`);