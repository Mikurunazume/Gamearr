ALTER TABLE user_settings ADD COLUMN folder_naming_template TEXT NOT NULL DEFAULT '{Title} ({Year})';
--> statement-breakpoint
ALTER TABLE user_settings ADD COLUMN file_naming_template TEXT NOT NULL DEFAULT '{Title} ({Year}) [{Group}]';
