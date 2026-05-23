export type CourseCategory = 'computer' | 'hr' | 'shared';

export interface ExamCourse {
  name: string;
  code: string;
  traineesCount: number;
  section: string;
  category: CourseCategory;
}

export interface Period {
  id: number;
  time: string;
  exams: ExamCourse[];
}

export interface ScheduleDay {
  dayName: string;
  englishDay: string;
  date: string;
  hijriDate: string;
  periods: Period[];
}

export interface PeriodHeader {
  id: number;
  label: string;
}
