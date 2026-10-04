CREATE TABLE `recording_blobs` (
	`storage_key` text PRIMARY KEY NOT NULL,
	`data` blob NOT NULL,
	`content_type` text NOT NULL,
	`size_bytes` integer NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
);
