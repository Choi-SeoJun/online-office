ALTER TABLE `office_members` ADD `rank` text DEFAULT '사원' NOT NULL;--> statement-breakpoint
ALTER TABLE `office_rooms` ADD `boss_rank` text DEFAULT '부장' NOT NULL;