CREATE TABLE `office_notifications` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`request_id` text NOT NULL,
	`room_code` text NOT NULL,
	`recipient_id` text NOT NULL,
	`sender_id` text NOT NULL,
	`sender_name` text NOT NULL,
	`created_at` integer NOT NULL,
	`read_at` integer,
	FOREIGN KEY (`room_code`) REFERENCES `office_rooms`(`code`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`recipient_id`) REFERENCES `office_members`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `office_notification_request` ON `office_notifications` (`request_id`);--> statement-breakpoint
CREATE INDEX `office_notifications_recipient` ON `office_notifications` (`room_code`,`recipient_id`,`id`);--> statement-breakpoint
ALTER TABLE `office_members` ADD `avatar` text DEFAULT 'short' NOT NULL;--> statement-breakpoint
ALTER TABLE `office_members` ADD `last_poke` integer DEFAULT 0 NOT NULL;