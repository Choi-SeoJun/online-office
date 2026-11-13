'use client';
import { JOB_RANKS, type JobRank } from '@/game/ranks';
import './rank-picker.css';

export function RankPicker({ label, value, onChange, disabled = false }: {
  label: string; value: JobRank; onChange: (rank: JobRank) => void; disabled?: boolean;
}) {
  return <label className="rank-field"><span>{label}</span><select value={value} disabled={disabled} onChange={event => onChange(event.target.value as JobRank)}>
    {JOB_RANKS.map(rank => <option key={rank} value={rank}>{rank}</option>)}
  </select></label>;
}
