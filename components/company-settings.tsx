'use client';

import { useRef, useState, type FormEvent } from 'react';
import { Check, LoaderCircle, Save } from 'lucide-react';
import { AvatarPicker } from './avatar-picker';
import { RankPicker } from './rank-picker';
import type { AvatarStyle } from '@/game/types';
import type { JobRank } from '@/game/ranks';
import './company-settings.css';

export type PersonalSettings = { name: string; rank: JobRank; avatar: AvatarStyle };
export type CompanySettingsValue = { roomName: string; bossRank: JobRank; capacity: number };

export function CompanySettings({ profile, company, multiplayer = false, canEditCompany = true, onProfile, onCompany }: {
  profile: PersonalSettings;
  company: CompanySettingsValue;
  multiplayer?: boolean;
  canEditCompany?: boolean;
  onProfile: (value: PersonalSettings) => Promise<unknown> | void;
  onCompany: (value: CompanySettingsValue) => Promise<unknown> | void;
}) {
  const [person, setPerson] = useState(profile), [office, setOffice] = useState(company);
  const [busy, setBusy] = useState<'person' | 'company' | null>(null);
  const [error, setError] = useState(''), [notice, setNotice] = useState('');
  const lock = useRef(false);
  async function save(event: FormEvent, section: 'person' | 'company') {
    event.preventDefault();
    if (lock.current || (section === 'company' && !canEditCompany)) return;
    const value = section === 'person' ? person.name.trim() : office.roomName.trim();
    if (!value || Array.from(value).length > (section === 'person' ? 10 : 24)) {
      setError(section === 'person' ? '이름을 1~10자로 적어 주세요.' : '회사 이름을 1~24자로 적어 주세요.'); return;
    }
    lock.current = true; setBusy(section); setError(''); setNotice('');
    try {
      if (section === 'person') { await onProfile({ ...person, name: value }); setPerson(p => ({ ...p, name: value })); }
      else { await onCompany({ ...office, roomName: value }); setOffice(p => ({ ...p, roomName: value })); }
      setNotice(section === 'person' ? '내 정보를 변경했어요.' : '회사 설정을 변경했어요.');
    } catch (failure) { setError(failure instanceof Error ? failure.message : '설정을 저장하지 못했어요. 다시 시도해 주세요.'); }
    finally { lock.current = false; setBusy(null); }
  }
  return <div className="company-settings">
    <form onSubmit={event => void save(event, 'person')}>
      <fieldset disabled={!!busy}><legend>나의 정보</legend>
        <label className="company-field">이름<input value={person.name} maxLength={20} required onChange={e => setPerson(p => ({ ...p, name: e.target.value }))} autoComplete="nickname" /></label>
        <RankPicker label="나의 직급" value={person.rank} onChange={rank => setPerson(p => ({ ...p, rank }))} />
        <AvatarPicker value={person.avatar} onChange={avatar => setPerson(p => ({ ...p, avatar }))} />
        <button className="company-save" type="submit">{busy === 'person' ? <LoaderCircle size={15} className="loading-icon" /> : <Save size={15} />}내 정보 저장</button>
      </fieldset>
    </form>
    {canEditCompany ? <form onSubmit={event => void save(event, 'company')}>
      <fieldset disabled={!!busy}><legend>회사 설정{multiplayer && <small>방장</small>}</legend>
        <label className="company-field">회사 이름<input value={office.roomName} maxLength={48} required onChange={e => setOffice(p => ({ ...p, roomName: e.target.value }))} /></label>
        <RankPicker label={multiplayer ? '우리들의 상사 직급' : '나의 상사 직급'} value={office.bossRank} onChange={bossRank => setOffice(p => ({ ...p, bossRank }))} />
        {multiplayer && <label className="company-field">회사 정원<select value={office.capacity} onChange={e => setOffice(p => ({ ...p, capacity: Number(e.target.value) }))}>{Array.from({ length: 15 }, (_, i) => <option key={i + 2} value={i + 2}>{i + 2}명</option>)}</select><small>사용 중인 자리보다 작게 줄일 수는 없어요.</small></label>}
        <button className="company-save" type="submit">{busy === 'company' ? <LoaderCircle size={15} className="loading-icon" /> : <Save size={15} />}회사 설정 저장</button>
      </fieldset>
    </form> : <p className="company-host-note">회사 이름·상사 직급·정원은 방장이 변경할 수 있어요.</p>}
    {error && <p className="company-error" role="alert">{error}</p>}
    {notice && <p className="company-saved" role="status"><Check size={14} />{notice}</p>}
  </div>;
}
