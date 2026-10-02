ALTER TABLE `evaluations` ADD `model_config` text;--> statement-breakpoint
ALTER TABLE `evaluations` ADD `model_calls` integer;--> statement-breakpoint
ALTER TABLE `evaluations` ADD `quality_report` text;--> statement-breakpoint
ALTER TABLE `speaking_attempts` ADD `processing_duration_ms` integer;