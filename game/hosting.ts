// Replaced only by the GitHub Pages build. The existing Sites build keeps its
// same-origin defaults, with no visitor-controlled backend URL.
declare const __OFFICE_ASSET_BASE__: string | undefined;
declare const __OFFICE_ROOM_ENDPOINT__: string | undefined;

export function publicAssetPath(path: string) {
  const base = typeof __OFFICE_ASSET_BASE__ === 'undefined' ? '/' : __OFFICE_ASSET_BASE__;
  return base + path.replace(/^\/+/, '');
}

export function roomEndpoint() {
  return typeof __OFFICE_ROOM_ENDPOINT__ === 'undefined' ? '/api/rooms' : __OFFICE_ROOM_ENDPOINT__;
}

declare const __OFFICE_FEEDBACK_ORIGIN__: string | undefined;

function feedbackOrigin() {
  return typeof __OFFICE_FEEDBACK_ORIGIN__ === 'undefined' ? '' : __OFFICE_FEEDBACK_ORIGIN__;
}

export function feedbackEndpoint() {
  return feedbackOrigin() + '/api/feedback';
}

export function feedbackAdminUrl() {
  return feedbackOrigin() + '/admin/feedback';
}
