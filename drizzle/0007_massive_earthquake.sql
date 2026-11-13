CREATE TABLE `office_wallpaper_files` (
	`id` text PRIMARY KEY NOT NULL,
	`room_code` text NOT NULL,
	`owner_id` text NOT NULL,
	`created_at` integer NOT NULL,
	`expires_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `office_wallpaper_expiry` ON `office_wallpaper_files` (`expires_at`);--> statement-breakpoint
CREATE INDEX `office_wallpaper_owner` ON `office_wallpaper_files` (`owner_id`);--> statement-breakpoint
ALTER TABLE `office_members` ADD `wallpaper_id` text;--> statement-breakpoint
ALTER TABLE `office_members` ADD `wallpaper_updated_at` integer DEFAULT 0 NOT NULL;