export function formatDate(date: Date | string, locale = "en-US"): string {
  const d = date instanceof Date ? date : new Date(date);
  const formatter = new Intl.DateTimeFormat(locale);
  return formatter.format(d);
}
