ALTER TABLE `office_members` ADD `floor` text DEFAULT 'office' NOT NULL;--> statement-breakpoint
ALTER TABLE `office_members` ADD `visual` text;--> statement-breakpoint
ALTER TABLE `office_members` ADD `last_attack` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `office_rooms` ADD `boss_state` text;--> statement-breakpoint
ALTER TABLE `office_rooms` ADD `boss_hit` text;--> statement-breakpoint
ALTER TABLE `office_rooms` ADD `boss_hit_id` integer DEFAULT 0 NOT NULL;