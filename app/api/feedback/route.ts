import { env } from 'cloudflare:workers';
import { handleFeedbackRequest } from '../../../lib/feedback-http.ts';

export function POST(request: Request) {
  return handleFeedbackRequest(request, env.DB, env.FEEDBACK_RATE_SECRET);
}

export function OPTIONS(request: Request) {
  return handleFeedbackRequest(request);
}
