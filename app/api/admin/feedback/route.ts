import { env } from 'cloudflare:workers';
import { getChatGPTUser } from '../../../chatgpt-auth.ts';
import { handleAdminFeedbackRequest } from '../../../../lib/feedback-http.ts';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  return handleAdminFeedbackRequest(request, env.DB, await getChatGPTUser(), env.FEEDBACK_ADMIN_EMAIL);
}

export async function PATCH(request: Request) {
  return handleAdminFeedbackRequest(request, env.DB, await getChatGPTUser(), env.FEEDBACK_ADMIN_EMAIL);
}
