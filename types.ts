
export interface Student {
  id: string;
  name: string;
  specialization?: string; // New field for Student Specialization
  courseCodes: string[]; // List of subject codes the student is taking
}

export interface Exam {
  courseCode: string;
  courseName: string;
  date: string; // YYYY-MM-DD
  time: string; // HH:mm
  duration: number; // minutes
  type: 'Paper' | 'Blackboard'; // Paper = Room, Blackboard = Lab
  department: string; // New field for Department/Section
  specialization?: string; // New field for Exam Specialization
}

export interface Room {
  id: string;
  name: string;
  type: 'Hall' | 'Lab';
  capacity: number;
}

export interface Proctor {
  id: string;
  name: string;
  department?: string; // New field for Proctor Department
}

export interface Committee {
  id: string;
  examCode: string; // Which exam is this committee for
  specialization?: string; // To identify specific exam instance if code is duplicated
  roomId: string;
  proctorIds: string[];
  studentIds: string[]; // Students assigned to this committee
}

export interface DraftSchedule {
  id: string;
  name: string;
  createdAt: string;
  startDate: string;
  examDays: number;
  periodsPerDay: number;
  duration: number;
  periodConfigs: Array<{ start: string; end: string }>;
  courses: Array<{
    code: string;
    name: string;
    department: string;
    specialization: string;
    studentCount: number;
    assignedSlot: number | null;
    isSplit?: boolean;
    students: string[];
    departmentDistribution?: Record<string, number>;
    specializationDistribution?: Record<string, number>;
  }>;
  slots: Array<{
    id: number;
    dateStr: string;
    dayIndex: number;
    periodIndex: number;
    timeLabel: string;
  }>;
}

export interface Conflict {
  type: 'StudentSchedule' | 'Capacity' | 'ProctorSchedule' | 'Balance';
  message: string;
  severity: 'Error' | 'Warning';
}

export interface SystemState {
  students: Student[];
  exams: Exam[];
  rooms: Room[];
  proctors: Proctor[];
  committees: Committee[];
  drafts: DraftSchedule[];
}

// Authentication Types
export type UserRole = 'manager' | 'dept_head' | 'proctor' | 'student';

export interface UserSession {
  id: string;
  name: string;
  role: UserRole;
  department?: string;
  readOnly: boolean; // true = read-only, false = can edit
}