const dateTime = new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeStyle: 'short' });
const dateOnly = new Intl.DateTimeFormat('en', { dateStyle: 'medium' });

export const formatDateTime = (iso: string) => dateTime.format(new Date(iso));
export const formatDate = (iso: string) => dateOnly.format(new Date(iso));

export function timeAgo(iso: string, now = Date.now()): string {
  const seconds = Math.round((now - new Date(iso).getTime()) / 1000);
  if (seconds < 45) return 'just now';
  if (seconds < 3600) return `${Math.round(seconds / 60)} min ago`;
  if (seconds < 86400) return `${Math.round(seconds / 3600)} hr ago`;
  const days = Math.round(seconds / 86400);
  return days < 30 ? `${days} day${days === 1 ? '' : 's'} ago` : formatDate(iso);
}

export const initials = (name: string) =>
  name.split(' ').filter(Boolean).slice(0, 2).map((p) => p[0]!.toUpperCase()).join('');

/** Keep every ID digit even when the database's legacy code expression truncates it. */
export const workOrderCode = (id: number) => `WO-${String(id).padStart(5, '0')}`;
