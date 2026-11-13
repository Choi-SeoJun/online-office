import { index, integer, real, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';
import type { JobRank } from '../game/ranks.ts';

// Retain file metadata after room/member deletion so expired R2 objects can be collected.
export const officeWallpaperFiles = sqliteTable('office_wallpaper_files', {
  id: text('id').primaryKey(), roomCode: text('room_code').notNull(), ownerId: text('owner_id').notNull(),
  createdAt: integer('created_at').notNull(), expiresAt: integer('expires_at').notNull(),
}, t => [index('office_wallpaper_expiry').on(t.expiresAt), index('office_wallpaper_owner').on(t.ownerId)]);

export const officeRooms = sqliteTable('office_rooms', {
  code: text('code').primaryKey(), name: text('name').notNull(), capacity: integer('capacity').notNull(),
  hostId: text('host_id').notNull(), createdAt: integer('created_at').notNull(), expiresAt: integer('expires_at').notNull(),
  bossState: text('boss_state'), bossHit: text('boss_hit'), bossHitId: integer('boss_hit_id').notNull().default(0),
  bossRank: text('boss_rank').$type<JobRank>().notNull().default('부장'),
}, t => [index('office_rooms_expiry').on(t.expiresAt)]);

export const officeMembers = sqliteTable('office_members', {
  id: text('id').primaryKey(), roomCode: text('room_code').notNull().references(() => officeRooms.code, { onDelete: 'cascade' }),
  tokenHash: text('token_hash').notNull(), seatIndex: integer('seat_index').notNull(), name: text('name').notNull(),
  rank: text('rank').$type<JobRank>().notNull().default('사원'),
  wallpaperId: text('wallpaper_id'),
  wallpaperUpdatedAt: integer('wallpaper_updated_at').notNull().default(0),
  avatar: text('avatar').notNull().default('short'), lastPoke: integer('last_poke').notNull().default(0),
  floor: text('floor').notNull().default('office'), visual: text('visual'), lastAttack: integer('last_attack').notNull().default(0),
  x: real('x').notNull(), z: real('z').notNull(), angle: real('angle').notNull(), pose: text('pose').notNull(), moving: integer('moving').notNull(),
  joinedAt: integer('joined_at').notNull(), lastSeen: integer('last_seen').notNull(), lastSync: integer('last_sync').notNull().default(0), lastChat: integer('last_chat').notNull().default(0),
}, t => [uniqueIndex('office_member_seat').on(t.roomCode, t.seatIndex), uniqueIndex('office_member_token').on(t.tokenHash), index('office_members_active').on(t.roomCode, t.lastSeen)]);

export const officeMessages = sqliteTable('office_messages', {
  id: integer('id').primaryKey({ autoIncrement: true }), requestId: text('request_id').notNull(),
  roomCode: text('room_code').notNull().references(() => officeRooms.code, { onDelete: 'cascade' }),
  playerId: text('player_id').notNull(), name: text('name').notNull(), text: text('text').notNull(), createdAt: integer('created_at').notNull(),
}, t => [uniqueIndex('office_message_request').on(t.requestId), index('office_messages_room').on(t.roomCode, t.id)]);

export const officeRateLimits = sqliteTable('office_rate_limits', {
  key: text('key').primaryKey(), hits: integer('hits').notNull(), resetsAt: integer('resets_at').notNull(),
}, t => [index('office_rate_expiry').on(t.resetsAt)]);

export const officeNotifications = sqliteTable('office_notifications', {
  id: integer('id').primaryKey({ autoIncrement: true }), requestId: text('request_id').notNull(),
  roomCode: text('room_code').notNull().references(() => officeRooms.code, { onDelete: 'cascade' }),
  recipientId: text('recipient_id').notNull().references(() => officeMembers.id, { onDelete: 'cascade' }),
  senderId: text('sender_id').notNull(), senderName: text('sender_name').notNull(),
  createdAt: integer('created_at').notNull(), readAt: integer('read_at'),
}, t => [uniqueIndex('office_notification_request').on(t.requestId), index('office_notifications_recipient').on(t.roomCode, t.recipientId, t.id)]);

export const officeFeedback = sqliteTable('office_feedback', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  requestId: text('request_id').notNull(),
  category: text('category', { enum: ['bug', 'idea', 'other'] }).notNull(),
  message: text('message').notNull(),
  mode: text('mode', { enum: ['solo', 'multi'] }).notNull(),
  floor: text('floor', { enum: ['office', 'roof'] }).notNull(),
  status: text('status', { enum: ['new', 'reviewed'] }).notNull().default('new'),
  createdAt: integer('created_at').notNull(),
  reviewedAt: integer('reviewed_at'),
}, t => [
  uniqueIndex('office_feedback_request').on(t.requestId),
  index('office_feedback_status').on(t.status, t.id),
]);

export const officeFeedbackRate = sqliteTable('office_feedback_rate', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  rateKey: text('rate_key').notNull(),
  acceptedAt: integer('accepted_at').notNull(),
}, t => [
  index('office_feedback_rate_key').on(t.rateKey, t.acceptedAt),
  index('office_feedback_rate_expiry').on(t.acceptedAt),
]);

export const officeBoardEntries = sqliteTable('office_board_entries', {
  id: text('id').notNull(),
  roomCode: text('room_code').notNull().references(() => officeRooms.code, { onDelete: 'cascade' }),
  authorId: text('author_id').notNull(),
  authorName: text('author_name').notNull(),
  kind: text('kind', { enum: ['note', 'text', 'doodle'] }).notNull(),
  color: text('color').notNull(),
  text: text('text').notNull(),
  strokes: text('strokes').notNull(),
  placement: text('placement'),
  createdAt: integer('created_at').notNull(),
}, t => [
  uniqueIndex('office_board_entry_id').on(t.roomCode, t.id),
  index('office_board_room_created').on(t.roomCode, t.createdAt, t.id),
]);
