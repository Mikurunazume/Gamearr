CREATE TABLE `import_tasks` (
	`id` text PRIMARY KEY NOT NULL,
	`game_download_id` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`strategy` text DEFAULT 'move' NOT NULL,
	`source_path` text NOT NULL,
	`target_root_folder_id` text,
	`target_relative_path` text NOT NULL,
	`error_message` text,
	`created_at` integer DEFAULT (strftime('%s', 'now') * 1000),
	`completed_at` integer,
	FOREIGN KEY (`game_download_id`) REFERENCES `game_downloads`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`target_root_folder_id`) REFERENCES `root_folders`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
ALTER TABLE `downloaders` ADD COLUMN `default_import_strategy` text DEFAULT 'move' NOT NULL;
