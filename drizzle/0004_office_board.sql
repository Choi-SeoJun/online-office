CREATE TABLE `office_board_entries` (
	`id` text NOT NULL,
	`room_code` text NOT NULL,
	`author_id` text NOT NULL,
	`author_name` text NOT NULL,
	`kind` text NOT NULL,
	`color` text NOT NULL,
	`text` text NOT NULL,
	`strokes` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`room_code`) REFERENCES `office_rooms`(`code`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `office_board_entry_id` ON `office_board_entries` (`room_code`,`id`);--> statement-breakpoint
CREATE INDEX `office_board_room_created` ON `office_board_entries` (`room_code`,`created_at`,`id`);