import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readdirSync, readFileSync } from 'node:fs';

test('board placement migration retains legacy drawings, identities, sessions and indexes', t => {
  const sql = new DatabaseSync(':memory:'); t.after(() => sql.close()); sql.exec('PRAGMA foreign_keys=ON');
  const files = readdirSync(new URL('../drizzle', import.meta.url)).filter(file => file.endsWith('.sql')).sort();
  const apply = (file: string) => sql.exec(readFileSync(new URL(`../drizzle/${file}`, import.meta.url), 'utf8'));
  files.filter(file => file < '0006').forEach(apply);
  sql.exec(`INSERT INTO office_rooms (code, name, capacity, host_id, created_at, expires_at, boss_rank) VALUES ('ABCDEFGH', '회사', 4, 'existing', 1, 100000, '이사');
    INSERT INTO office_members (id, room_code, token_hash, seat_index, name, rank, x, z, angle, pose, moving, joined_at, last_seen)
    VALUES ('existing', 'ABCDEFGH', 'private-session', 0, '김사원', '대리', 1, 2, 0, 'idle', 0, 1, 2);
    INSERT INTO office_board_entries (id, room_code, author_id, author_name, kind, color, text, strokes, created_at)
    VALUES ('legacy', 'ABCDEFGH', 'existing', '김사원', 'doodle', 'ink', '', '[{"color":"blue","points":[{"x":0.1,"y":0.2},{"x":0.8,"y":0.7}]}]', 2);`);
  const room = sql.prepare('SELECT * FROM office_rooms').all();
  const members = sql.prepare('SELECT * FROM office_members').all();
  const boards = sql.prepare('SELECT * FROM office_board_entries').all();
  const indexes = sql.prepare("SELECT name, sql FROM sqlite_master WHERE type='index' ORDER BY name").all();
  files.filter(file => file.startsWith('0006')).forEach(apply);
  assert.deepEqual(sql.prepare('SELECT * FROM office_rooms').all(), room);
  assert.deepEqual(sql.prepare('SELECT * FROM office_members').all(), members);
  assert.deepEqual(sql.prepare('SELECT * FROM office_board_entries').all().map(row => ({ ...row })), boards.map(row => ({ ...row, placement: null })));
  assert.deepEqual(sql.prepare("SELECT name, sql FROM sqlite_master WHERE type='index' ORDER BY name").all(), indexes);
  assert.deepEqual(sql.prepare('PRAGMA foreign_key_check').all(), []);
});
