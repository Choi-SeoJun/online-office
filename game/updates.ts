export type DailyUpdate = { added: readonly string[]; fixed: readonly string[] };

// One entry per Asia/Seoul calendar date. Append same-day releases here rather
// than creating a separate notice for each build. Keep only published changes.
export const DAILY_UPDATES: Readonly<Record<string, DailyUpdate>> = {
  '2026-11-12': {
    added: [
      '건의함을 열었어요. 로그인 없이 불편한 점이나 아이디어를 남길 수 있고, 보낸 내용은 관리자만 확인해요.',
      '글·포스트잇·낙서를 붙이는 게시판이 생겼어요. 혼자 쉬기에서는 내 브라우저에 저장되고, 동료들과는 같은 방에서 공유해요. 공유 게시판은 방 생성 후 24시간 동안 유지돼요.',
      '부장님 몰래 춤추기! 미러볼과 스포트라이트 아래에서 잠깐 내 무대를 즐겨요. 동료에게도 춤추는 모습이 보여요.',
      '일하는 척이 더 실감 나요. 키보드를 두드리다가 모니터 앞에서 잠깐 한숨 쉬고, 다시 업무로 돌아가는 동작을 넣었어요.',
      '탕비실에는 휴식 의자 4개, 옥상 벤치에는 3자리를 마련했어요.',
      '최근 업데이트 소식을 날짜별로 모아 볼 수 있어요. 같은 날의 변경은 하나의 공지에 함께 담아요.',
    ],
    fixed: [
      '동료 화면에서도 의자를 돌리는 사람과 의자가 함께 회전하도록 고쳤어요.',
      '사무실과 옥상에서 화면을 돌려도 안내 글씨가 벽에 가려지지 않도록 개선했어요.',
      '동료와 같은 휴식 좌석에 겹쳐 앉는 현상을 고쳤어요. 사용 중인 자리는 다른 빈자리를 이용해 주세요.',
    ],
  },
};

export function updateDays(source: Readonly<Record<string, DailyUpdate>> = DAILY_UPDATES) {
  return Object.entries(source).sort(([a], [b]) => b.localeCompare(a)).map(([date, content]) => ({ date, ...content }));
}

export function formatUpdateDate(date: string) {
  const [year, month, day] = date.split('-').map(Number);
  return `${year}년 ${month}월 ${day}일`;
}

const READ_KEY = 'office-updates-read-day-v1';
export function hasUnreadUpdates(latestDay: string, storage?: Pick<Storage, 'getItem'>) {
  try {
    const read = (storage ?? globalThis.localStorage)?.getItem(READ_KEY);
    return !read || !/^\d{4}-\d{2}-\d{2}$/.test(read) || read < latestDay;
  } catch { return true; }
}

export function markUpdatesRead(day: string, storage?: Pick<Storage, 'setItem'>) {
  try {
    const target = storage ?? globalThis.localStorage;
    if (!target) return false;
    target.setItem(READ_KEY, day);
    return true;
  } catch { return false; }
}
