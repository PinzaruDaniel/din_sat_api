export const dashboardTimeZone = 'Europe/Chisinau';
export const activeOrderStatuses = ['new', 'confirmed', 'preparing', 'ready'];
export const popularProductLimit = 5;

const dateFormatter = new Intl.DateTimeFormat('en', {
  timeZone: dashboardTimeZone,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

export function dashboardDate(instant) {
  const parts = dateFormatter.formatToParts(instant);
  const part = (type) => parts.find((entry) => entry.type === type).value;
  return `${part('year').padStart(4, '0')}-${part('month')}-${part('day')}`;
}

export function dashboardPeriod({ from, to }, now = new Date()) {
  if (from && to) return { from, to, timeZone: dashboardTimeZone };
  const lastDay = dashboardDate(now);
  const firstDay = new Date(`${lastDay}T00:00:00Z`);
  firstDay.setUTCDate(firstDay.getUTCDate() - 29);
  return {
    from: firstDay.toISOString().slice(0, 10),
    to: lastDay,
    timeZone: dashboardTimeZone,
  };
}
