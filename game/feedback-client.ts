import type { FeedbackCategory, FeedbackContext, FeedbackSubmission } from './feedback-types.ts';
import { feedbackEndpoint } from './hosting.ts';

const requestTimeout = 15_000;
export const feedbackMessageLimit = 2000;

async function submitFeedback(endpoint: string, body: string): Promise<void> {
  const signal = AbortSignal.timeout(requestTimeout);
  let response: Response;
  try {
    response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: endpoint.startsWith('/') ? 'same-origin' : 'omit',
      cache: 'no-store',
      redirect: 'error',
      signal,
      body,
    });
  } catch (error) {
    if (signal.aborted || (error instanceof Error && ['TimeoutError', 'AbortError'].includes(error.name))) {
      throw new Error('응답 시간이 길어졌어요. 다시 보내 주세요.');
    }
    throw new Error('연결에 문제가 있어요. 다시 보내 주세요.');
  }
  if (response.status === 429) throw new Error('건의를 여러 번 보냈어요. 잠시 후 다시 보내 주세요.');
  if (response.status === 400 || response.status === 413) throw new Error('건의 내용과 글자 수를 확인해 주세요.');
  if (!response.ok) throw new Error('건의를 보내지 못했어요. 다시 보내 주세요.');
  const result = await response.json().catch(() => null);
  if (!result || typeof result !== 'object' || !('ok' in result) || result.ok !== true) throw new Error('전송을 확인하지 못했어요. 다시 보내 주세요.');
}

export function createFeedbackSender(endpoint = feedbackEndpoint()) {
  let pending: Promise<void> | null = null;
  let draft: FeedbackSubmission | undefined;
  return (category: FeedbackCategory, message: string, { mode, floor }: FeedbackContext) => {
    if (pending) return pending;
    if (draft?.category !== category || draft.message !== message) {
      draft = { requestId: crypto.randomUUID(), category, message, context: { mode, floor } };
    }
    pending = submitFeedback(endpoint, JSON.stringify(draft))
      .then(() => { draft = undefined; })
      .finally(() => { pending = null; });
    return pending;
  };
}
