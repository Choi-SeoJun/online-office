export const JOB_RANKS = ['사원', '주임', '대리', '과장', '차장', '부장', '이사', '상무', '전무', '부사장', '사장'] as const;
export type JobRank = typeof JOB_RANKS[number];

export function normalizeRank(value: unknown, fallback: JobRank = '사원'): JobRank {
  return typeof value === 'string' && JOB_RANKS.includes(value as JobRank) ? value as JobRank : fallback;
}

export function bossName(rank: JobRank): string { return `박${rank}`; }

export function employeeLabel(name: string, rank?: JobRank): string {
  if (!rank || name.endsWith(rank)) return name;
  if (name === '김사원') return `김${rank}`;
  return `${name} ${rank}`;
}
