import { REPORT_LOCALE } from "../sources/registry";
import { todayKey } from "../utils";

export interface WeatherSnapshot {
  city: string;
  emoji: string;
  condition: string;
  temperature_c: number;
  temperature_min_c?: number;
  temperature_max_c?: number;
  apparent_temperature_c?: number;
  humidity?: number;
  wind_kmh?: number;
  aqi?: number;
  aqi_label?: string;
  pm25?: number;
  observed_at: string;
  source: "Open-Meteo";
}

const SHANGHAI_LAT = 31.2304;
const SHANGHAI_LON = 121.4737;
const TZ = "Asia/Shanghai";

type WeatherCurrent = {
  time?: string;
  temperature_2m?: number;
  apparent_temperature?: number;
  weather_code?: number;
  relative_humidity_2m?: number;
  wind_speed_10m?: number;
};

type AirCurrent = {
  us_aqi?: number;
  pm2_5?: number;
};

type WeatherHourly = {
  time?: string[];
  temperature_2m?: number[];
  apparent_temperature?: number[];
  weather_code?: number[];
  relative_humidity_2m?: number[];
  wind_speed_10m?: number[];
};

type WeatherDaily = {
  weather_code?: number[];
  temperature_2m_max?: number[];
  temperature_2m_min?: number[];
};

type AirHourly = {
  us_aqi?: number[];
  pm2_5?: number[];
};

function conditionFor(code: number | undefined): { emoji: string; zh: string; en: string } {
  if (code === undefined) return { emoji: "🌤️", zh: "天气", en: "Weather" };
  if (code === 0) return { emoji: "☀️", zh: "晴", en: "Clear" };
  if (code === 1) return { emoji: "🌤️", zh: "少云", en: "Mostly clear" };
  if (code === 2) return { emoji: "⛅", zh: "多云间晴", en: "Partly cloudy" };
  if (code === 3) return { emoji: "☁️", zh: "阴/多云", en: "Cloudy" };
  if (code === 45 || code === 48) return { emoji: "🌫️", zh: "雾", en: "Fog" };
  if (code >= 51 && code <= 67) return { emoji: "🌧️", zh: "小雨", en: "Drizzle / rain" };
  if (code >= 71 && code <= 77) return { emoji: "❄️", zh: "雪", en: "Snow" };
  if (code >= 80 && code <= 82) return { emoji: "🌦️", zh: "阵雨", en: "Showers" };
  if (code >= 95) return { emoji: "⛈️", zh: "雷雨", en: "Thunderstorm" };
  return { emoji: "🌤️", zh: "天气", en: "Weather" };
}

function aqiLabel(aqi: number | undefined): string | undefined {
  if (aqi === undefined || !Number.isFinite(aqi)) return undefined;
  if (REPORT_LOCALE === "en") {
    if (aqi <= 50) return "Good";
    if (aqi <= 100) return "Moderate";
    if (aqi <= 150) return "Unhealthy for sensitive groups";
    if (aqi <= 200) return "Unhealthy";
    if (aqi <= 300) return "Very unhealthy";
    return "Hazardous";
  }
  if (aqi <= 50) return "优";
  if (aqi <= 100) return "良";
  if (aqi <= 150) return "轻度污染";
  if (aqi <= 200) return "中度污染";
  if (aqi <= 300) return "重度污染";
  return "严重污染";
}

function avg(nums: Array<number | null | undefined> | undefined): number | undefined {
  const values = (nums ?? []).filter((n): n is number => typeof n === "number" && Number.isFinite(n));
  if (values.length === 0) return undefined;
  return values.reduce((sum, n) => sum + n, 0) / values.length;
}

function max(nums: Array<number | null | undefined> | undefined): number | undefined {
  const values = (nums ?? []).filter((n): n is number => typeof n === "number" && Number.isFinite(n));
  if (values.length === 0) return undefined;
  return Math.max(...values);
}

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 (DailyBriefBot)" },
  });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return (await res.json()) as T;
}

async function fetchCurrentShanghaiWeather(): Promise<WeatherSnapshot | null> {
  const weatherUrl =
    `https://api.open-meteo.com/v1/forecast?latitude=${SHANGHAI_LAT}&longitude=${SHANGHAI_LON}` +
    `&current=temperature_2m,apparent_temperature,weather_code,relative_humidity_2m,wind_speed_10m&timezone=${encodeURIComponent(TZ)}`;
  const airUrl =
    `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${SHANGHAI_LAT}&longitude=${SHANGHAI_LON}` +
    `&current=us_aqi,pm2_5,pm10&timezone=${encodeURIComponent(TZ)}`;

  try {
    const [weather, air] = await Promise.all([
      fetchJson<{ current?: WeatherCurrent }>(weatherUrl),
      fetchJson<{ current?: AirCurrent }>(airUrl),
    ]);
    const current = weather.current;
    if (!current || current.temperature_2m === undefined) return null;
    const condition = conditionFor(current.weather_code);
    const airCurrent = air.current;
    return {
      city: REPORT_LOCALE === "en" ? "Shanghai" : "上海",
      emoji: condition.emoji,
      condition: REPORT_LOCALE === "en" ? condition.en : condition.zh,
      temperature_c: Math.round(current.temperature_2m),
      apparent_temperature_c:
        current.apparent_temperature === undefined
          ? undefined
          : Math.round(current.apparent_temperature),
      humidity: current.relative_humidity_2m,
      wind_kmh: current.wind_speed_10m,
      aqi:
        airCurrent?.us_aqi === undefined
          ? undefined
          : Math.round(airCurrent.us_aqi),
      aqi_label: aqiLabel(airCurrent?.us_aqi),
      pm25:
        airCurrent?.pm2_5 === undefined
          ? undefined
          : Number(airCurrent.pm2_5.toFixed(1)),
      observed_at: current.time ?? new Date().toISOString(),
      source: "Open-Meteo",
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.warn(`[weather] Shanghai weather failed: ${msg}`);
    return null;
  }
}

async function fetchHistoricalShanghaiWeather(date: string): Promise<WeatherSnapshot | null> {
  const weatherUrl =
    `https://archive-api.open-meteo.com/v1/archive?latitude=${SHANGHAI_LAT}&longitude=${SHANGHAI_LON}` +
    `&start_date=${date}&end_date=${date}` +
    `&hourly=temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,wind_speed_10m` +
    `&daily=weather_code,temperature_2m_max,temperature_2m_min&timezone=${encodeURIComponent(TZ)}`;
  const airUrl =
    `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${SHANGHAI_LAT}&longitude=${SHANGHAI_LON}` +
    `&start_date=${date}&end_date=${date}&hourly=us_aqi,pm2_5,pm10&timezone=${encodeURIComponent(TZ)}`;

  try {
    const [weather, air] = await Promise.all([
      fetchJson<{ hourly?: WeatherHourly; daily?: WeatherDaily }>(weatherUrl),
      fetchJson<{ hourly?: AirHourly }>(airUrl),
    ]);
    const hourly = weather.hourly;
    const daily = weather.daily;
    const maxTemp = daily?.temperature_2m_max?.[0] ?? max(hourly?.temperature_2m);
    const minTemp = daily?.temperature_2m_min?.[0];
    const middayIndex = hourly?.time?.findIndex((t) => t.endsWith("12:00"));
    const sampleIndex = middayIndex !== undefined && middayIndex >= 0 ? middayIndex : 0;
    const weatherCode =
      daily?.weather_code?.[0] ?? hourly?.weather_code?.[sampleIndex];
    const condition = conditionFor(weatherCode);
    const aqi = avg(air.hourly?.us_aqi);
    const pm25 = avg(air.hourly?.pm2_5);
    if (maxTemp === undefined && minTemp === undefined) return null;
    return {
      city: REPORT_LOCALE === "en" ? "Shanghai" : "上海",
      emoji: condition.emoji,
      condition: REPORT_LOCALE === "en" ? condition.en : condition.zh,
      temperature_c: Math.round(maxTemp ?? minTemp ?? 0),
      temperature_min_c:
        minTemp === undefined ? undefined : Math.round(minTemp),
      temperature_max_c:
        maxTemp === undefined ? undefined : Math.round(maxTemp),
      apparent_temperature_c:
        avg(hourly?.apparent_temperature) === undefined
          ? undefined
          : Math.round(avg(hourly?.apparent_temperature)!),
      humidity:
        avg(hourly?.relative_humidity_2m) === undefined
          ? undefined
          : Math.round(avg(hourly?.relative_humidity_2m)!),
      wind_kmh:
        avg(hourly?.wind_speed_10m) === undefined
          ? undefined
          : Math.round(avg(hourly?.wind_speed_10m)!),
      aqi: aqi === undefined ? undefined : Math.round(aqi),
      aqi_label: aqiLabel(aqi),
      pm25: pm25 === undefined ? undefined : Number(pm25.toFixed(1)),
      observed_at: date,
      source: "Open-Meteo",
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.warn(`[weather] Shanghai historical weather failed: ${msg}`);
    return null;
  }
}

export async function fetchShanghaiWeather(
  reportDate: string = todayKey(),
): Promise<WeatherSnapshot | null> {
  return reportDate === todayKey()
    ? fetchCurrentShanghaiWeather()
    : fetchHistoricalShanghaiWeather(reportDate);
}
