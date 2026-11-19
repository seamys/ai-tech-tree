// Time is measured in fractional months since Jan 2006 ("m").
// The x axis is either linear or "focus": a log scale anchored at now, so the
// closer an event is to the present, the more horizontal space it gets.
import type { TimeMode } from "../types";

export const T0 = 2006;
export const X0 = 260;
const TAU = 8; // months: how quickly the log scale compresses the past
const CLOG = 700; // px per log unit
const PX_PER_MONTH_LINEAR = 9;
const PX_PER_MONTH_FUTURE = 30;

/** Parse "YYYY" | "YYYY-MM" | "YYYY-MM-DD". Missing parts default to mid-period. */
export function toM(date: string): number {
  const [y, m, d] = date.split("-").map(Number);
  const month = m || 7;
  const day = d || (m ? 15 : 1);
  return (y - T0) * 12 + (month - 1) + (day - 1) / 30.5;
}

export function dateToM(dt: Date): number {
  return (dt.getFullYear() - T0) * 12 + dt.getMonth() +
    (dt.getDate() - 1 + dt.getHours() / 24 + dt.getMinutes() / 1440) / 30.5;
}

export interface TimeScale {
  mode: TimeMode;
  nowM: number;
  xNow: number;
  x(m: number): number;
  m(x: number): number;
}

export function makeScale(mode: TimeMode, nowM: number): TimeScale {
  if (mode === "linear") {
    return {
      mode, nowM, xNow: X0 + nowM * PX_PER_MONTH_LINEAR,
      x: (m) => X0 + m * PX_PER_MONTH_LINEAR,
      m: (x) => (x - X0) / PX_PER_MONTH_LINEAR,
    };
  }
  const xNow = X0 + CLOG * Math.log(1 + nowM / TAU);
  return {
    mode, nowM, xNow,
    x: (m) => (m >= nowM ? xNow + (m - nowM) * PX_PER_MONTH_FUTURE : xNow - CLOG * Math.log(1 + (nowM - m) / TAU)),
    m: (x) => (x >= xNow ? nowM + (x - xNow) / PX_PER_MONTH_FUTURE : nowM - TAU * (Math.exp((xNow - x) / CLOG) - 1)),
  };
}

export type TickKind = "y" | "q" | "m";
export const tickKind = (m: number): TickKind => (m % 12 === 0 ? "y" : (m % 12) % 3 === 0 ? "q" : "m");

const pad = (v: number) => String(v).padStart(2, "0");
export const formatNow = (d: Date) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
export const formatYM = (m: number) => `${T0 + Math.floor(m / 12)}-${pad(Math.floor(m % 12) + 1)}`;

/** Age in months (negative = future). */
export const ageOf = (date: string, nowM: number) => nowM - toM(date);
export const isFresh = (age: number) => age >= 0 && age < 1; // ~30 days
export const isRecent = (age: number) => age >= 0 && age < 3; // ~90 days
