import { env } from 'cloudflare:workers';
import { handleWallpaperRequest } from '../../../lib/wallpaper-http.ts';
export async function POST(request: Request) { return handleWallpaperRequest(request, env.DB, env.BUCKET); }
export async function OPTIONS(request: Request) { return handleWallpaperRequest(request); }
