/**
 * Days in Vietnam's calendar.
 *
 * The server runs in UTC (Vercel), where "today" starts seven hours late — a
 * dinner logged at 06:30 would land on yesterday. Every "which day" question
 * in the app goes through here.
 */

const TZ = 'Asia/Ho_Chi_Minh'

/** YYYY-MM-DD, `offset` days from today. */
export function vnDate(offset = 0, from: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date(from.getTime() + offset * 86_400_000))
}

/** Monday of the week containing `day` (YYYY-MM-DD). Vietnamese weeks start on Monday. */
export function weekStart(day: string): string {
  const d = new Date(`${day}T00:00:00Z`)
  const back = (d.getUTCDay() + 6) % 7
  return new Date(d.getTime() - back * 86_400_000).toISOString().slice(0, 10)
}

/** "Hôm nay", "Hôm qua", "Thứ hai 14/09". */
export function dayLabel(day: string, today = vnDate()): string {
  if (day === today) return 'Hôm nay'
  if (day === vnDate(-1)) return 'Hôm qua'
  const d = new Date(`${day}T00:00:00Z`)
  const weekday = new Intl.DateTimeFormat('vi-VN', { weekday: 'long', timeZone: 'UTC' }).format(d)
  return `${weekday.charAt(0).toUpperCase()}${weekday.slice(1)} ${day.slice(8, 10)}/${day.slice(5, 7)}`
}

/** "18:40" in Vietnam time. */
export function timeLabel(at: Date): string {
  return new Intl.DateTimeFormat('vi-VN', { hour: '2-digit', minute: '2-digit', timeZone: TZ }).format(at)
}
