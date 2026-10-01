/** Teaching-only status for field hubs — hide when recent entries exist. */
export function fieldHubTeachingStatus(
  hasEntries: boolean,
  empty: { title: string; subtitle?: string }
): { statusTitle?: string; statusSubtitle?: string } {
  if (hasEntries) return {};
  return { statusTitle: empty.title, statusSubtitle: empty.subtitle };
}
