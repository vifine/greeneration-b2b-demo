import { useEffect, useState } from 'react';

/** Farm works on UAE time regardless of where the coordinator opens the app. */
export const TZ = 'Asia/Dubai';

/** Minutes since local midnight in Dubai. */
export function dubaiMinutes(d = new Date()): number {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(d);
  const h = Number(parts.find((p) => p.type === 'hour')?.value ?? 0);
  const m = Number(parts.find((p) => p.type === 'minute')?.value ?? 0);
  return h * 60 + m;
}

export const hm = (min: number) => `${String(Math.floor(min / 60) % 24).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;
export const toMin = (t: string) => {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
};

/** "42 min", "1 h 12 min", "3 h" */
export function dur(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (!h) return `${m} min`;
  return m ? `${h} h ${m} min` : `${h} h`;
}

/** Re-renders every 30 s with the current Dubai time in minutes. */
export function useDubaiNow(): number {
  const [now, setNow] = useState(() => dubaiMinutes());
  useEffect(() => {
    const id = window.setInterval(() => setNow(dubaiMinutes()), 30_000);
    return () => window.clearInterval(id);
  }, []);
  return now;
}

export const INTAKE_CLOSES = toMin('22:30');

export function intakeChip(now: number): string {
  if (now < toMin('10:00')) return `Intake opens at 10:00`;
  if (now >= INTAKE_CLOSES) return 'Intake closed · next day';
  return `Intake closes in ${dur(INTAKE_CLOSES - now).replace(' min', 'm').replace(' h ', 'h ').replace(' h', 'h')}`;
}

export function greeting(now: number): string {
  if (now < toMin('12:00')) return 'Good morning';
  if (now < toMin('17:00')) return 'Good afternoon';
  return 'Good evening';
}
