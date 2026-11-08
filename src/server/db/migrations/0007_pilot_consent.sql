ALTER TABLE `recordings` ADD `audio_deleted_at` text;--> statement-breakpoint
ALTER TABLE `users` ADD `consent_status` text;--> statement-breakpoint
ALTER TABLE `users` ADD `consent_at` text;--> statement-breakpoint
ALTER TABLE `users` ADD `consent_teacher_sharing` integer DEFAULT false NOT NULL;