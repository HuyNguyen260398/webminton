// The tournament runs in Asia/Ho_Chi_Minh, which has no daylight saving, so a
// fixed +07:00 is exact. These never consult the device's own timezone.
const OFFSET_MS = 7 * 3_600_000;
const wall = (ms: number) => new Date(ms + OFFSET_MS).toISOString();

export const toLocalInput = (iso: string | null): string =>
  iso ? wall(Date.parse(iso)).slice(0, 16) : "";

export const fromLocalInput = (value: string): string | null =>
  value ? `${value}:00+07:00` : null;

export const addMinutes = (iso: string, minutes: number): string =>
  `${wall(Date.parse(iso) + minutes * 60_000).slice(0, 19)}+07:00`;
