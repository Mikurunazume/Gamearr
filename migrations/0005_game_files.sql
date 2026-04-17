CREATE TABLE `game_files` (
	`id` text PRIMARY KEY NOT NULL,
	`game_id` text NOT NULL,
	`root_folder_id` text,
	`relative_path` text NOT NULL,
	`size_bytes` integer NOT NULL,
	`file_type` text DEFAULT 'other' NOT NULL,
	`checksum_sha1` text,
	`last_seen_at` integer DEFAULT (strftime('%s', 'now') * 1000),
	`added_at` integer DEFAULT (strftime('%s', 'now') * 1000),
	FOREIGN KEY (`game_id`) REFERENCES `games`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`root_folder_id`) REFERENCES `root_folders`(`id`) ON UPDATE no action ON DELETE set null
);
