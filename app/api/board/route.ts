import { env } from 'cloudflare:workers';
import { handleBoardRequest } from '../../../lib/board-http.ts';

export async function POST(request: Request) {
  return handleBoardRequest(request, env.DB);
}

export async function OPTIONS(request: Request) {
  return handleBoardRequest(request);
}
