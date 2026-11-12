CREATE TABLE `office_feedback` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`request_id` text NOT NULL,
	`category` text NOT NULL,
	`message` text NOT NULL,
	`mode` text NOT NULL,
	`floor` text NOT NULL,
	`status` text DEFAULT 'new' NOT NULL,
	`created_at` integer NOT NULL,
	`reviewed_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `office_feedback_request` ON `office_feedback` (`request_id`);--> statement-breakpoint
CREATE INDEX `office_feedback_status` ON `office_feedback` (`status`,`id`);--> statement-breakpoint
CREATE TABLE `office_feedback_rate` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`rate_key` text NOT NULL,
	`accepted_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `office_feedback_rate_key` ON `office_feedback_rate` (`rate_key`,`accepted_at`);--> statement-breakpoint
CREATE INDEX `office_feedback_rate_expiry` ON `office_feedback_rate` (`accepted_at`);