CREATE TABLE `office_members` (
	`id` text PRIMARY KEY NOT NULL,
	`room_code` text NOT NULL,
	`token_hash` text NOT NULL,
	`seat_index` integer NOT NULL,
	`name` text NOT NULL,
	`x` real NOT NULL,
	`z` real NOT NULL,
	`angle` real NOT NULL,
	`pose` text NOT NULL,
	`moving` integer NOT NULL,
	`joined_at` integer NOT NULL,
	`last_seen` integer NOT NULL,
	`last_sync` integer DEFAULT 0 NOT NULL,
	`last_chat` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`room_code`) REFERENCES `office_rooms`(`code`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `office_member_seat` ON `office_members` (`room_code`,`seat_index`);--> statement-breakpoint
CREATE UNIQUE INDEX `office_member_token` ON `office_members` (`token_hash`);--> statement-breakpoint
CREATE INDEX `office_members_active` ON `office_members` (`room_code`,`last_seen`);--> statement-breakpoint
CREATE TABLE `office_messages` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`request_id` text NOT NULL,
	`room_code` text NOT NULL,
	`player_id` text NOT NULL,
	`name` text NOT NULL,
	`text` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`room_code`) REFERENCES `office_rooms`(`code`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `office_message_request` ON `office_messages` (`request_id`);--> statement-breakpoint
CREATE INDEX `office_messages_room` ON `office_messages` (`room_code`,`id`);--> statement-breakpoint
CREATE TABLE `office_rate_limits` (
	`key` text PRIMARY KEY NOT NULL,
	`hits` integer NOT NULL,
	`resets_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `office_rate_expiry` ON `office_rate_limits` (`resets_at`);--> statement-breakpoint
CREATE TABLE `office_rooms` (
	`code` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`capacity` integer NOT NULL,
	`host_id` text NOT NULL,
	`created_at` integer NOT NULL,
	`expires_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `office_rooms_expiry` ON `office_rooms` (`expires_at`);