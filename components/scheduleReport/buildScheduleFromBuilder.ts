import { getDualDate, parseAnyDate } from '../../utils/helpers';
import type { CourseCategory, ExamCourse, PeriodHeader, ScheduleDay } from './types';

export interface BuilderCourse {
  code: string;
  name: string;
  department: string;
  specialization: string;
  isSplit?: boolean;
  specializationDistribution?: Record<string, number>;
  studentCount: number;
  assignedSlot: number | null;
}

export interface BuilderSlot {
  id: number;
  dateStr: string;
  dayIndex: number;
  periodIndex: number;
  timeLabel: string;
}

function mapCategory(department: string, specialization: string): CourseCategory {
  // Classification should be driven by specialization, not department.
  const spec = String(specialization || '').trim();
  if (/عام|جميع التخصصات|دراسات عامة/.test(spec)) return 'shared';
  if (/موارد/.test(spec)) return 'hr';
  if (/شبكات|حاسب/.test(spec)) return 'computer';

  // Fallback only when specialization is missing/unknown.
  const dept = String(department || '').trim();
  if (/عام|دراسات عامة/.test(dept)) return 'shared';
  if (/موارد/.test(dept)) return 'hr';
  if (/شبكات|حاسب/.test(dept)) return 'computer';
  return 'computer';
}

function displayCode(code: string): string {
  const codeStr = String(code);
  return codeStr.includes('::') ? codeStr.split('::')[0] : codeStr;
}

function englishWeekday(dateStr: string): string {
  const date = parseAnyDate(dateStr);
  if (!date) return '';
  return date.toLocaleDateString('en-US', { weekday: 'long' });
}

export function buildPeriodHeaders(
  slots: BuilderSlot[],
  periodConfigs: { start: string; end: string }[],
): PeriodHeader[] {
  const periodIndices = (Array.from(new Set(slots.map((s) => s.periodIndex))) as number[]).sort(
    (a, b) => a - b,
  );

  return periodIndices.map((pIdx) => {
    const slot = slots.find((s) => s.periodIndex === pIdx);
    const cfg = periodConfigs[pIdx];
    const timePart = slot?.timeLabel || (cfg ? `${cfg.start} - ${cfg.end}` : '');
    const label = timePart
      ? `الفترة ${pIdx + 1} (${timePart})`
      : `الفترة ${pIdx + 1}`;
    return { id: pIdx, label };
  });
}

export function buildScheduleFromBuilder(
  schedule: BuilderCourse[],
  slots: BuilderSlot[],
  periodConfigs: { start: string; end: string }[],
): { scheduleData: ScheduleDay[]; periodHeaders: PeriodHeader[] } {
  const periodHeaders = buildPeriodHeaders(slots, periodConfigs);

  const dates = Array.from(new Set(slots.map((s) => s.dateStr)));
  dates.sort((a, b) => {
    const da = slots.find((s) => s.dateStr === a)?.dayIndex ?? 0;
    const db = slots.find((s) => s.dateStr === b)?.dayIndex ?? 0;
    return da - db;
  });

  const scheduleData: ScheduleDay[] = dates.map((dateStr) => {
    const dual = getDualDate(dateStr);
    const periods = periodHeaders.map((ph) => {
      const slot = slots.find((s) => s.dateStr === dateStr && s.periodIndex === ph.id);
      const exams: ExamCourse[] = slot
        ? schedule
            .filter((c) => c.assignedSlot === slot.id)
            .map((c) => {
              const hasMultipleSpecializations = !!(
                !c.isSplit &&
                c.specializationDistribution &&
                Object.keys(c.specializationDistribution).length > 1
              );

              const effectiveSpecialization = hasMultipleSpecializations
                ? 'جميع التخصصات'
                : c.specialization;

              return {
                code: displayCode(c.code),
                name: c.name,
                traineesCount: c.studentCount,
                section: c.department,
                category: mapCategory(c.department, effectiveSpecialization),
              };
            })
        : [];

      return {
        id: ph.id,
        time: ph.label,
        exams,
      };
    });

    return {
      dayName: dual.dayName,
      englishDay: englishWeekday(dateStr),
      date: dual.greg,
      hijriDate: dual.hijri,
      periods,
    };
  });

  return { scheduleData, periodHeaders };
}
