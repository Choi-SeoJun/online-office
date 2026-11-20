/** Shared timing keeps the feet and each water burst together in both modes. */
export const SPLASH_LANDINGS = [.28, .58, .88] as const;
export function splashHop(progress: number) {
  const landing = SPLASH_LANDINGS.find(end => progress <= end);
  return landing === undefined ? 0 : Math.max(0, Math.sin(Math.PI * Math.max(0, (progress - (landing - .28)) / .28)));
}
