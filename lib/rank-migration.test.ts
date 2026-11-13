import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readdirSync, readFileSync } from 'node:fs';

test('rank migration preserves existing office records and supplies legacy and new-row defaults', t => {
  const sql = new DatabaseSync(':memory:');
  t.after(() => sql.close());
  sql.exec('PRAGMA foreign_keys=ON');
  const migrations = readdirSync(new URL('../drizzle', import.meta.url)).filter(file => file.endsWith('.sql')).sort();
  const apply = (file: string) => sql.exec(readFileSync(new URL(`../drizzle/${file}`, import.meta.url), 'utf8'));
  migrations.filter(file => file < '0005').forEach(apply);
  sql.exec(`
    INSERT INTO office_rooms (code, name, capacity, host_id, created_at, expires_at, boss_state)
      VALUES ('ABCDEFGH', '기존 회사', 4, 'existing', 1, 100000, '{"phase":"routine"}');
    INSERT INTO office_members (id, room_code, token_hash, seat_index, name, x, z, angle, pose, moving, joined_at, last_seen)
      VALUES ('existing', 'ABCDEFGH', 'private-session', 0, '김사원', 1, 2, 0, 'idle', 0, 1, 2);
    INSERT INTO office_messages (request_id, room_code, player_id, name, text, created_at)
      VALUES ('message', 'ABCDEFGH', 'existing', '김사원', '기존 대화', 2);
    INSERT INTO office_notifications (request_id, room_code, recipient_id, sender_id, sender_name, created_at)
      VALUES ('poke', 'ABCDEFGH', 'existing', 'colleague', '이사원', 2);
    INSERT INTO office_feedback (request_id, category, message, mode, floor, created_at)
      VALUES ('feedback', 'idea', '기존 의견', 'multi', 'office', 2);
    INSERT INTO office_board_entries (id, room_code, author_id, author_name, kind, color, text, strokes, created_at)
      VALUES ('board', 'ABCDEFGH', 'existing', '김사원', 'note', 'yellow', '기존 메모', '[]', 2);
    INSERT INTO office_rate_limits (key, hits, resets_at) VALUES ('visitor', 1, 100000);
    INSERT INTO office_feedback_rate (rate_key, accepted_at) VALUES ('feedback-visitor', 2);
  `);
  const tables = ['office_rooms', 'office_members', 'office_messages', 'office_notifications', 'office_feedback', 'office_board_entries', 'office_rate_limits', 'office_feedback_rate'];
  const before = tables.map(table => sql.prepare(`SELECT * FROM ${table}`).all());
  const indexes = sql.prepare("SELECT name, sql FROM sqlite_master WHERE type = 'index' ORDER BY name").all();
  migrations.filter(file => file.startsWith('0005')).forEach(apply);

  assert.equal(sql.prepare('SELECT * FROM office_members').get()!.rank, '사원');
  assert.equal(sql.prepare('SELECT * FROM office_rooms').get()!.boss_rank, '부장');
  assert.deepEqual(tables.map(table => sql.prepare(`SELECT * FROM ${table}`).all().map(row => {
    const previous = { ...row };
    delete previous.rank; delete previous.boss_rank;
    return previous;
  })), before.map(rows => rows.map(row => ({ ...row }))));
  assert.deepEqual(sql.prepare("SELECT name, sql FROM sqlite_master WHERE type = 'index' ORDER BY name").all(), indexes);
  assert.deepEqual(sql.prepare('PRAGMA foreign_key_check').all(), []);

  sql.exec(`
    INSERT INTO office_rooms (code, name, capacity, host_id, created_at, expires_at)
      VALUES ('JKLMNPQR', '다음 회사', 2, 'next', 3, 100000);
    INSERT INTO office_members (id, room_code, token_hash, seat_index, name, x, z, angle, pose, moving, joined_at, last_seen)
      VALUES ('next', 'JKLMNPQR', 'next-session', 0, '다음사원', 0, 0, 0, 'idle', 0, 3, 3);
  `);
  assert.equal(sql.prepare("SELECT rank FROM office_members WHERE id = 'next'").get()!.rank, '사원');
  assert.equal(sql.prepare("SELECT boss_rank FROM office_rooms WHERE code = 'JKLMNPQR'").get()!.boss_rank, '부장');
  assert.throws(() => sql.exec("UPDATE office_members SET rank = NULL WHERE id = 'next'"), /NOT NULL/);
  assert.throws(() => sql.exec("UPDATE office_rooms SET boss_rank = NULL WHERE code = 'JKLMNPQR'"), /NOT NULL/);
});
