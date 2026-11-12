'use client';

import { useState, type FormEvent } from 'react';
import { Dialog } from 'radix-ui';
import { MessageSquarePlus, X } from 'lucide-react';
import { createFeedbackSender, feedbackMessageLimit } from '@/game/feedback-client';
import type { FeedbackCategory, FeedbackContext } from '@/game/feedback-types';
import { feedbackAdminUrl } from '@/game/hosting';
import './feedback-dialog.css';

export function FeedbackDialog({ context, onOpenChange }: {
  context: FeedbackContext;
  onOpenChange?: (open: boolean) => void;
}) {
  const [send] = useState(createFeedbackSender);
  const [category, setCategory] = useState<FeedbackCategory>('bug');
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const length = Array.from(message).length;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (sending || !message.trim() || length > feedbackMessageLimit) return;
    setSending(true);
    setError('');
    setSuccess(false);
    try {
      await send(category, message, context);
      setCategory('bug');
      setMessage('');
      setSuccess(true);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : '건의를 보내지 못했어요. 다시 보내 주세요.');
    } finally {
      setSending(false);
    }
  }

  return <Dialog.Root onOpenChange={open => {
    if (!open) setSuccess(false);
    onOpenChange?.(open);
  }}>
    <Dialog.Trigger asChild>
      <button type="button" className="icon-button feedback-trigger" aria-label="건의함" title="건의함">
        <MessageSquarePlus size={18} aria-hidden="true" /><span>건의함</span>
      </button>
    </Dialog.Trigger>
    <Dialog.Portal>
      <Dialog.Overlay className="feedback-overlay" />
      <Dialog.Content className="feedback-dialog">
        <header>
          <Dialog.Title>건의함</Dialog.Title>
          <Dialog.Close asChild>
            <button type="button" className="feedback-close" aria-label="건의함 닫기"><X size={20} /></button>
          </Dialog.Close>
        </header>
        <Dialog.Description>이용 중 불편한 점이나 개선 아이디어를 알려 주세요. 보낸 내용은 관리자만 확인할 수 있어요.</Dialog.Description>
        <form onSubmit={submit}>
          <fieldset disabled={sending}>
            <label>
              분류
              <select value={category} onChange={event => {
                setCategory(event.target.value as FeedbackCategory);
                setError('');
                setSuccess(false);
              }}>
                <option value="bug">불편한 점</option>
                <option value="idea">개선 제안</option>
                <option value="other">기타</option>
              </select>
            </label>
            <label>
              내용
              <textarea rows={5} value={message} required aria-describedby="feedback-message-length"
                aria-invalid={length > feedbackMessageLimit}
                placeholder="어떤 점이 불편했나요? 어떻게 바뀌면 좋을까요?"
                onChange={event => {
                  setMessage(event.target.value);
                  setError('');
                  setSuccess(false);
                }}
              />
            </label>
          </fieldset>
          <small id="feedback-message-length" className={length > feedbackMessageLimit ? 'feedback-error' : undefined}>
            {length} / {feedbackMessageLimit}자
          </small>
          {error && <p className="feedback-error" role="alert">{error}</p>}
          <p className="feedback-status" role="status">{sending ? '건의를 보내고 있어요.' : success ? '건의가 전달됐어요. 의견을 보내 주셔서 고마워요!' : ''}</p>
          <footer>
            <a href={feedbackAdminUrl()} target="_blank" rel="noopener noreferrer">관리자 확인</a>
            <button type="submit" className="primary-button" disabled={sending || !message.trim() || length > feedbackMessageLimit}>
              {sending ? '보내는 중' : '건의 보내기'}
            </button>
          </footer>
        </form>
      </Dialog.Content>
    </Dialog.Portal>
  </Dialog.Root>;
}
