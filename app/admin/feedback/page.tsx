import type { Metadata } from 'next';
import { env } from 'cloudflare:workers';
import { Inbox, LockKeyhole } from 'lucide-react';
import { chatGPTSignInPath, chatGPTSignOutPath, getChatGPTUser } from '../../chatgpt-auth';
import { isFeedbackAdmin } from '../../../lib/feedback-auth';
import FeedbackAdmin from '../../../components/feedback-admin';
import '../../../components/feedback-admin.css';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = {
  title: '관리자 건의함 · 온라인 회사',
  robots: { index: false, follow: false },
};

export default async function FeedbackAdminPage() {
  const user = await getChatGPTUser();
  const configured = Boolean(env.FEEDBACK_ADMIN_EMAIL?.trim());
  if (configured && isFeedbackAdmin(user, env.FEEDBACK_ADMIN_EMAIL)) return <FeedbackAdmin />;

  return <main className="feedback-admin-shell feedback-admin-gate">
    <section className="feedback-gate-card">
      <div className="feedback-admin-mark"><Inbox size={28} /></div>
      <span className="feedback-admin-eyebrow"><LockKeyhole size={13} />운영자 전용</span>
      <h1>우리 회사 건의함</h1>
      <p>{!configured ? '관리자 화면을 준비하고 있어요. 잠시 후 다시 확인해 주세요.' : user ? '이 계정에는 건의함을 열어볼 권한이 없어요. 운영자 계정으로 로그인해 주세요.' : '사용자들이 남긴 이야기는 운영자만 확인할 수 있어요. 운영자 계정으로 로그인해 주세요.'}</p>
      {configured && <a className="feedback-admin-primary" href={user ? chatGPTSignOutPath('/admin/feedback') : chatGPTSignInPath('/admin/feedback')} target="_top">
        {user ? '로그아웃하고 계정 바꾸기' : 'ChatGPT 계정으로 관리자 로그인'}
      </a>}
      <a className="feedback-admin-back" href="https://choi-seojun.github.io/online-office/">회사로 돌아가기</a>
    </section>
  </main>;
}
