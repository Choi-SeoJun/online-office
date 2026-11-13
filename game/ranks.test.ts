import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bossName, employeeLabel, normalizeRank } from './ranks.ts';

test('saved rank normalization keeps supported titles and supplies the appropriate legacy fallback', () => {
  assert.equal(normalizeRank('전무'), '전무');
  assert.equal(normalizeRank('부사장'), '부사장');
  for (const value of [undefined, null, '', '회장', ' 대리 ', 3, {}]) {
    assert.equal(normalizeRank(value), '사원');
    assert.equal(normalizeRank(value, '부장'), '부장');
  }
});

test('employee labels respect existing titles and the legacy default name', () => {
  assert.equal(employeeLabel('서준'), '서준');
  assert.equal(employeeLabel('서준', '대리'), '서준 대리');
  assert.equal(employeeLabel('이대리', '대리'), '이대리');
  assert.equal(employeeLabel('김사원', '사원'), '김사원');
  assert.equal(employeeLabel('김사원', '과장'), '김과장');
  assert.equal(employeeLabel('김사원님', '과장'), '김사원님 과장');
});

test('boss names use the selected title', () => {
  assert.equal(bossName('부장'), '부장님');
  assert.equal(bossName('이사'), '이사님');
  assert.equal(bossName('부사장'), '부사장님');
});

test('intern, team lead and representative are supported player and boss ranks', () => {
  for (const rank of ['인턴', '팀장', '대표'] as const) {
    assert.equal(normalizeRank(rank), rank); assert.equal(bossName(rank), `${rank}님`);
  }
});
