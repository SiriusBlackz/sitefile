/**
 * Historical weather for the reporting period via Open-Meteo (free, no
 * API key). Used to enrich the Executive Summary: wet days and lost-time
 * context are the standard justification lines in NEC/JCT delay
 * narratives, and PMs otherwise dig them out by hand.
 *
 * The ERA5 archive lags ~5 days behind today, so recent days are filled
 * from the forecast API's past_days window. Any failure degrades to
 * null — weather must never block a report.
 */

export interface PeriodWeather {
  /** Days with ≥1mm precipitation. */
  wetDays: number;
  /** Days with ≥10mm precipitation. */
  heavyRainDays: number;
  totalPrecipMm: number;
  maxTempC: number;
  minTempC: number;
  /** Days with minimum temperature below 0°C. */
  frostDays: number;
  /** Days with data out of the period's total. */
  daysCovered: number;
  totalDays: number;
}

interface DailyResponse {
  daily?: {
    time?: string[];
    precipitation_sum?: (number | null)[];
    temperature_2m_max?: (number | null)[];
    temperature_2m_min?: (number | null)[];
  };
}

const DAILY_PARAMS =
  "precipitation_sum,temperature_2m_max,temperature_2m_min";

async function fetchDaily(url: string): Promise<DailyResponse | null> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 6000);
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);
    if (!res.ok) return null;
    return (await res.json()) as DailyResponse;
  } catch {
    return null;
  }
}

type DayRecord = { precip: number | null; max: number | null; min: number | null };

function collect(res: DailyResponse | null, into: Map<string, DayRecord>) {
  const time = res?.daily?.time ?? [];
  for (let i = 0; i < time.length; i++) {
    const precip = res?.daily?.precipitation_sum?.[i] ?? null;
    const max = res?.daily?.temperature_2m_max?.[i] ?? null;
    const min = res?.daily?.temperature_2m_min?.[i] ?? null;
    if (precip === null && max === null && min === null) continue;
    if (!into.has(time[i])) into.set(time[i], { precip, max, min });
  }
}

export async function fetchPeriodWeather(
  latitude: number,
  longitude: number,
  periodStart: string,
  periodEnd: string
): Promise<PeriodWeather | null> {
  const today = new Date().toISOString().slice(0, 10);
  const end = periodEnd < today ? periodEnd : today;
  if (periodStart > end) return null;

  const days = new Map<string, DayRecord>();

  const archive = await fetchDaily(
    `https://archive-api.open-meteo.com/v1/archive?latitude=${latitude}&longitude=${longitude}&start_date=${periodStart}&end_date=${end}&daily=${DAILY_PARAMS}&timezone=auto`
  );
  collect(archive, days);

  // Fill the archive's recent-day lag from the forecast API when the
  // period reaches into the last couple of weeks.
  const totalDays =
    Math.round(
      (new Date(end + "T00:00:00Z").getTime() -
        new Date(periodStart + "T00:00:00Z").getTime()) /
        86_400_000
    ) + 1;
  const msPerDay = 86_400_000;
  const endAge = Math.round(
    (new Date(today + "T00:00:00Z").getTime() -
      new Date(end + "T00:00:00Z").getTime()) /
      msPerDay
  );
  if (days.size < totalDays && endAge <= 14) {
    const recent = await fetchDaily(
      `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&past_days=14&forecast_days=1&daily=${DAILY_PARAMS}&timezone=auto`
    );
    if (recent?.daily?.time) {
      // Only take days inside the period that the archive didn't cover.
      const filtered: DailyResponse = {
        daily: { time: [], precipitation_sum: [], temperature_2m_max: [], temperature_2m_min: [] },
      };
      recent.daily.time.forEach((d, i) => {
        if (d >= periodStart && d <= end && !days.has(d)) {
          filtered.daily!.time!.push(d);
          filtered.daily!.precipitation_sum!.push(recent.daily?.precipitation_sum?.[i] ?? null);
          filtered.daily!.temperature_2m_max!.push(recent.daily?.temperature_2m_max?.[i] ?? null);
          filtered.daily!.temperature_2m_min!.push(recent.daily?.temperature_2m_min?.[i] ?? null);
        }
      });
      collect(filtered, days);
    }
  }

  if (days.size === 0) return null;

  let wetDays = 0;
  let heavyRainDays = 0;
  let totalPrecipMm = 0;
  let maxTempC = -Infinity;
  let minTempC = Infinity;
  let frostDays = 0;
  for (const rec of days.values()) {
    if (rec.precip !== null) {
      totalPrecipMm += rec.precip;
      if (rec.precip >= 1) wetDays++;
      if (rec.precip >= 10) heavyRainDays++;
    }
    if (rec.max !== null && rec.max > maxTempC) maxTempC = rec.max;
    if (rec.min !== null) {
      if (rec.min < minTempC) minTempC = rec.min;
      if (rec.min < 0) frostDays++;
    }
  }
  if (maxTempC === -Infinity || minTempC === Infinity) return null;

  return {
    wetDays,
    heavyRainDays,
    totalPrecipMm: Math.round(totalPrecipMm),
    maxTempC: Math.round(maxTempC),
    minTempC: Math.round(minTempC),
    frostDays,
    daysCovered: days.size,
    totalDays,
  };
}

/**
 * Site coordinates derived from data we already hold, in preference
 * order: centroid of drawn GPS zones, then median of evidence GPS.
 * Returns null when the project has neither — no weather section.
 */
export function deriveSiteCoords(
  zonePolygons: { coordinates: number[][][] }[],
  evidencePoints: { latitude: number | null; longitude: number | null }[]
): { latitude: number; longitude: number } | null {
  const zonePts: [number, number][] = [];
  for (const poly of zonePolygons) {
    for (const ring of poly.coordinates) {
      for (const [lng, lat] of ring) zonePts.push([lng, lat]);
    }
  }
  if (zonePts.length > 0) {
    const lng = zonePts.reduce((s, p) => s + p[0], 0) / zonePts.length;
    const lat = zonePts.reduce((s, p) => s + p[1], 0) / zonePts.length;
    return { latitude: lat, longitude: lng };
  }

  const pts = evidencePoints.filter(
    (p): p is { latitude: number; longitude: number } =>
      p.latitude != null && p.longitude != null
  );
  if (pts.length === 0) return null;
  const lats = pts.map((p) => p.latitude).sort((a, b) => a - b);
  const lngs = pts.map((p) => p.longitude).sort((a, b) => a - b);
  return {
    latitude: lats[Math.floor(lats.length / 2)],
    longitude: lngs[Math.floor(lngs.length / 2)],
  };
}
