export type DailyUpdate = { added: readonly string[]; fixed: readonly string[] };

// Keys are announcement dates: each batch releases at 04:00 Asia/Seoul.
// Changes from the previous 04:00 (inclusive) to this 04:00 (exclusive)
// belong together. Keep published entries stable and add work to the next batch.
export const DAILY_UPDATES: Readonly<Record<string, DailyUpdate>> = {
  '2026-11-14': {
    added: [
      '출근 전에 나의 직급을 고를 수 있어요. 혼자 쉬기에서는 내 상사의 직급을, 동료들과에서는 방장이 모두의 상사 직급을 정해요.',
      '서류 뭉치가 서류 던지기로 바뀌었어요. 종이가 상사 쪽으로 날아가며 흩날려요. 펀치와 뿅망치는 그대로 사용할 수 있어요.',
      '사무실 벽에 게시판을 걸었어요. 가까이 가거나 게시판을 눌러 열고, 포스트잇을 원하는 곳으로 옮겨 보세요. 펜과 색 채우기로 게시판에 바로 그림도 그릴 수 있어요.',
      '방 안 설정에서 내 이름·직급·캐릭터를 바꿀 수 있어요. 방장은 회사 이름·상사 직급·정원도 변경할 수 있어요.',
      '직급에 인턴·팀장·대표를 추가했어요. 상사는 선택한 직급에 맞춰 ‘팀장님’, ‘대표님’처럼 불러요.',
    ],
    fixed: [
      '의자를 돌릴 때 몸이 쿠션 안으로 잠기던 자세를 바로잡았어요.',
      '상사가 자리에 앉아 일하는 시간을 늘리고, 순찰은 가끔 짧게 하도록 조정했어요.',
      '사무실 가구 위 안내 말풍선을 정리하고, 옥상 문구는 벽에 새겼어요.',
    ],
  },
  '2026-11-13': {
    added: [
      '아직 읽지 않은 업데이트 소식은 접속하면 한 번 자동으로 열려요. 읽은 소식도 업데이트 버튼에서 다시 볼 수 있어요.',
      '업데이트 소식은 매일 오전 4시(한국 시간)에 모아서 공개해요. 전날 오전 4시부터 오늘 오전 4시 전까지의 변경을 하나의 공지에 담아요.',
      '사무실 뒤쪽을 프린터·간식·커피·휴식 공간으로 재배치했어요. 부장님 자리와 휴게 공간 사이에 높은 파티션을 두어 조금 더 편하게 쉴 수 있어요.',
    ],
    fixed: [
      '혼자 쉬기와 동료들 회사 모두 새 배치에 맞춰 이동 경로와 휴식 의자를 맞췄어요.',
      '춤 버튼 이름을 ‘춤추기’로 바꿨어요.',
      '부장님 책상을 프린터 쪽을 향하도록 돌렸어요.',
    ],
  },
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

export function updateReleaseTime(day: string): number {
  return Date.parse(`${day}T04:00:00+09:00`);
}

export function announcementDateForChange(changedAt: number): string {
  const hour = 60 * 60 * 1000;
  // Shift the Seoul 04:00 boundary to UTC midnight, then select the next day.
  return new Date(changedAt + (9 - 4 + 24) * hour).toISOString().slice(0, 10);
}

export function publishedUpdateDays(now: number, source: Readonly<Record<string, DailyUpdate>> = DAILY_UPDATES) {
  return updateDays(source).filter(({ date }) => updateReleaseTime(date) <= now);
}

export function nextUpdateReleaseTime(now: number, source: Readonly<Record<string, DailyUpdate>> = DAILY_UPDATES): number | undefined {
  return Object.keys(source).map(updateReleaseTime).filter(release => release > now).sort((a, b) => a - b)[0];
}

export function formatUpdateDate(date: string) {
  const [year, month, day] = date.split('-').map(Number);
  return `${year}년 ${month}월 ${day}일`;
}

const READ_KEY = 'office-updates-read-day-v1';
export type ReadStorage = Partial<Pick<Storage, 'getItem' | 'setItem'>>;

export function createUpdateReadTracker(getStorage: () => ReadStorage | undefined) {
  let readDay: string | undefined;

  function remember(day: string | null | undefined) {
    if (day && /^\d{4}-\d{2}-\d{2}$/.test(day) && (!readDay || day > readDay)) readDay = day;
  }

  function readStorage() {
    let storage: ReadStorage | undefined;
    try { storage = getStorage(); } catch { return undefined; }
    try { remember(storage?.getItem?.(READ_KEY)); } catch { /* Keep this visit's read state. */ }
    return storage;
  }

  return {
    hasUnread(day: string): boolean {
      readStorage();
      return !readDay || readDay < day;
    },
    markRead(day: string): boolean {
      const storage = readStorage();
      remember(day);
      try {
        if (!storage?.setItem || !readDay) return false;
        storage.setItem(READ_KEY, readDay);
        return true;
      } catch { return false; }
    },
  };
}

// Shared across component remounts and game-mode changes during this visit.
const browserReadTracker = createUpdateReadTracker(() => globalThis.localStorage);
const storageReadTrackers = new WeakMap<ReadStorage, ReturnType<typeof createUpdateReadTracker>>();

function trackerFor(storage?: ReadStorage) {
  if (!storage) return browserReadTracker;
  let tracker = storageReadTrackers.get(storage);
  if (!tracker) {
    tracker = createUpdateReadTracker(() => storage);
    storageReadTrackers.set(storage, tracker);
  }
  return tracker;
}

export function hasUnreadUpdates(latestDay: string, storage?: Pick<Storage, 'getItem'>) {
  return trackerFor(storage).hasUnread(latestDay);
}

export function markUpdatesRead(day: string, storage?: Pick<Storage, 'setItem'>) {
  return trackerFor(storage).markRead(day);
}
