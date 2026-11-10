import { env } from 'cloudflare:workers';
import { handleRoomRequest } from '../../../lib/room-http.ts';

export async function POST(request: Request) {
  return handleRoomRequest(request, env.DB);
}

export async function OPTIONS(request: Request) {
  return handleRoomRequest(request);
}
