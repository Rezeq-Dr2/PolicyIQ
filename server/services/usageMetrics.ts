import { redis } from './queue';

function getDayKey(organizationId: string, featureName: string, isoDay: string) {
  return `quota:${organizationId}:${featureName}:daily:${isoDay}`;
}

function getWeekKey(organizationId: string, featureName: string, isoWeek: string) {
  return `quota:${organizationId}:${featureName}:weekly:${isoWeek}`;
}

function getMonthKey(organizationId: string, featureName: string, isoMonth: string) {
  return `quota:${organizationId}:${featureName}:monthly:${isoMonth}`;
}

function isoDay(d: Date): string { return d.toISOString().slice(0,10); }

function isoWeek(d: Date): string {
  const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  x.setUTCDate(x.getUTCDate() + 4 - (x.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(x.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((x.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return `${x.getUTCFullYear()}-W${weekNo}`;
}

function isoMonth(d: Date): string { return d.toISOString().slice(0,7); }

export class UsageMetricsService {
  async getDaily(organizationId: string, featureName: string, days: number = 14): Promise<Array<{ day: string; count: number }>> {
    const out: Array<{ day: string; count: number }> = [];
    const now = new Date();
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(now.getTime() - i * 86400000);
      const day = isoDay(d);
      const key = getDayKey(organizationId, featureName, day);
      const v = await redis.get(key);
      out.push({ day, count: parseInt(v || '0', 10) });
    }
    return out;
  }

  async getWeekly(organizationId: string, featureName: string, weeks: number = 8): Promise<Array<{ week: string; count: number }>> {
    const out: Array<{ week: string; count: number }> = [];
    const now = new Date();
    for (let i = weeks - 1; i >= 0; i--) {
      const d = new Date(now.getTime() - i * 7 * 86400000);
      const week = isoWeek(d);
      const key = getWeekKey(organizationId, featureName, week);
      const v = await redis.get(key);
      out.push({ week, count: parseInt(v || '0', 10) });
    }
    return out;
  }

  async getMonthly(organizationId: string, featureName: string, months: number = 12): Promise<Array<{ month: string; count: number }>> {
    const out: Array<{ month: string; count: number }> = [];
    const now = new Date();
    const year = now.getUTCFullYear();
    const monthIdx = now.getUTCMonth();
    for (let i = months - 1; i >= 0; i--) {
      const d = new Date(Date.UTC(year, monthIdx - i, 1));
      const month = isoMonth(d);
      const key = getMonthKey(organizationId, featureName, month);
      const v = await redis.get(key);
      out.push({ month, count: parseInt(v || '0', 10) });
    }
    return out;
  }
}

export const usageMetricsService = new UsageMetricsService();


