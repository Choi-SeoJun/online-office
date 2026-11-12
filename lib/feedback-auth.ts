export function isFeedbackAdmin(
  user: { userId: string; email: string } | null,
  configuredEmail: string | undefined,
): boolean {
  const expectedEmail = configuredEmail?.trim().toLowerCase();
  return Boolean(expectedEmail && user?.userId.trim() && user.email.trim().toLowerCase() === expectedEmail);
}
