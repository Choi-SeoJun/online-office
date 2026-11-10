import { index, integer, real, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

export const officeRooms = sqliteTable('office_rooms', {
  code: text('code').primaryKey(), name: text('name').notNull(), capacity: integer('capacity').notNull(),
  hostId: text('host_id').notNull(), createdAt: integer('created_at').notNull(), expiresAt: integer('expires_at').notNull(),
}, t => [index('office_rooms_expiry').on(t.expiresAt)]);

export const officeMembers = sqliteTable('office_members', {
  id: text('id').primaryKey(), roomCode: text('room_code').notNull().references(() => officeRooms.code, { onDelete: 'cascade' }),
  tokenHash: text('token_hash').notNull(), seatIndex: integer('seat_index').notNull(), name: text('name').notNull(),
  avatar: text('avatar').notNull().default('short'), lastPoke: integer('last_poke').notNull().default(0),
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
