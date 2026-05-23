
import React, { useState, useEffect } from 'react';
import { Upload, CalendarDays, Play, Download, CheckCircle, RefreshCcw, Grid, AlertTriangle, FileText, Sparkles, BarChart2, X, Filter, Split, Merge, Info, Search, Settings, ArrowLeftRight, CheckCheck, Move, MousePointer2, Wrench, AlertOctagon, BatteryWarning, Plus, Clock, AlertCircle, Monitor, Save } from 'lucide-react';
import { parseCSV, validateSchedule, getDualDate } from '../utils/helpers';
import { Conflict, Exam, Committee, Room, Proctor, Student, DraftSchedule } from '../types';
import { fetchSystemState, syncSystemState } from '../services/api';
import { ReportEditorView } from '../components/scheduleReport/ScheduleReportDocument';
import { buildScheduleFromBuilder } from '../components/scheduleReport/buildScheduleFromBuilder';
import type { PeriodHeader, ScheduleDay } from '../components/scheduleReport/types';

interface AiScheduleBuilderProps {
  data?: any;
  setData?: React.Dispatch<React.SetStateAction<any>>;
  currentUser: { id: string; name: string; role: string; readOnly: boolean };
}

interface CourseInfo {
  code: string;
  name: string;
  department: string; // The primary teaching department
  specialization: string; // The primary specialization
  students: Set<string>; // Set of Student IDs
  studentCount: number;
  assignedSlot: number | null;
  // Analysis Data
  departmentDistribution?: Record<string, number>; // Dept -> Count
  specializationDistribution?: Record<string, number>; // Spec -> Count
  
  // Detailed Distribution for accurate splitting
  deptStudents?: Record<string, Set<string>>;
  specStudents?: Record<string, Set<string>>;

  isSplit?: boolean;
  conflicts?: Set<string>; // Pre-calculated conflicts
}

interface TimeSlot {
  id: number;
  dateStr: string;
  dayIndex: number;
  periodIndex: number;
  timeLabel: string;
}

interface SlotAnalysis {
    valid: boolean;
    issues: { type: 'conflict' | 'fatigue' | 'capacity', msg: string }[];
    severity: 'safe' | 'warning' | 'critical';
}

interface StudentState {
    occupiedSlots: Set<number>;
    dayCounts: Record<number, number>;
}

const AiScheduleBuilder: React.FC<AiScheduleBuilderProps> = ({ data, setData, currentUser }) => {
  const isReadOnly = currentUser.readOnly;
  // --- Settings ---
  const [startDate, setStartDate] = useState('');
  const [examDays, setExamDays] = useState<number>(10);
  const [periodsPerDay, setPeriodsPerDay] = useState<number>(3);
  const [duration, setDuration] = useState(120);
  const [maxCapacityPerPeriod, setMaxCapacityPerPeriod] = useState<number>(0); // 0 = Unlimited
  
  // Custom Time Configurations
  const [periodConfigs, setPeriodConfigs] = useState<{ start: string; end: string }[]>([
      { start: '08:00', end: '10:00' },
      { start: '10:30', end: '12:30' },
      { start: '13:00', end: '15:00' }
  ]);

  // --- Data ---
  const [rawFileName, setRawFileName] = useState<string>('');
  const [baseCourses, setBaseCourses] = useState<CourseInfo[]>([]); // Initial parsed data
  const [processedCourses, setProcessedCourses] = useState<CourseInfo[]>([]); // After Merge/Split logic
  const [excludedCodes, setExcludedCodes] = useState<Set<string>>(new Set());
  const [exclusionSearchTerm, setExclusionSearchTerm] = useState('');
  
  // --- Split/Merge Decisions ---
  const [sharedCourseDecisions, setSharedCourseDecisions] = useState<Record<string, 'merge' | 'split'>>({});

  // --- Output ---
  const [schedule, setSchedule] = useState<CourseInfo[]>([]);
  const [slots, setSlots] = useState<TimeSlot[]>([]);
  const [unassigned, setUnassigned] = useState<string[]>([]);
  
  // --- Exam Types State (New) ---
  const [examTypes, setExamTypes] = useState<Record<string, 'Paper' | 'Blackboard'>>({});

  // --- UI State ---
  const [step, setStep] = useState<0 | 1 | 2 | 3>(0); // 0: Input, 1: Settings & Analysis, 2: Processing, 3: Result
  const [logs, setLogs] = useState<string[]>([]);
  const [isToolsModalOpen, setIsToolsModalOpen] = useState(false);
  const [toolTab, setToolTab] = useState<'days' | 'periods'>('days');

  // Tool States
  const [swapPeriodDate, setSwapPeriodDate] = useState('');
  const [fixingCourseCode, setFixingCourseCode] = useState<string | null>(null);
  
  // Drag and Drop State
  const [draggedItemIndex, setDraggedItemIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  // Validation Modal State
  const [validationResult, setValidationResult] = useState<{
      isOpen: boolean;
      conflicts: Conflict[];
      unassigned: number;
  }>({ isOpen: false, conflicts: [], unassigned: 0 });

  const [draftName, setDraftName] = useState('');
  const [activeDraftId, setActiveDraftId] = useState<string | null>(null);

  const [showMatrixPrint, setShowMatrixPrint] = useState(false);
  const [matrixPrintData, setMatrixPrintData] = useState<{
    scheduleData: ScheduleDay[];
    periodHeaders: PeriodHeader[];
  } | null>(null);

  // Update Period Configs when periodsPerDay changes
  useEffect(() => {
      setPeriodConfigs(prev => {
          const newConfigs = [...prev];
          if (newConfigs.length < periodsPerDay) {
              // Add new periods with sensible defaults based on previous
              for (let i = newConfigs.length; i < periodsPerDay; i++) {
                  // Heuristic: Add 2.5 hours to previous start
                  const prevEnd = i > 0 ? newConfigs[i - 1].end : '08:00';
                  // Simple logic to guess next time (add 30 mins break)
                  let [h, m] = prevEnd.split(':').map(Number);
                  
                  // Add 30 mins break
                  m += 30;
                  if (m >= 60) { h++; m -= 60; }
                  
                  const startStr = `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
                  
                  // Add 2 hours duration
                  h += 2;
                  const endStr = `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
                  
                  newConfigs.push({ start: startStr, end: endStr });
              }
          } else if (newConfigs.length > periodsPerDay) {
              // Trim excess
              return newConfigs.slice(0, periodsPerDay);
          }
          return newConfigs;
      });
  }, [periodsPerDay]);

  const updatePeriodConfig = (index: number, field: 'start' | 'end', value: string) => {
      const newConfigs = [...periodConfigs];
      newConfigs[index] = { ...newConfigs[index], [field]: value };
      setPeriodConfigs(newConfigs);
  };

  // Helper: Extract Courses from Parsed Rows
  const extractCoursesFromRows = (rows: any[]): CourseInfo[] => {
      const coursesMap = new Map<string, { 
          name: string, 
          students: Set<string>, 
          deptStudents: Record<string, Set<string>>,
          specStudents: Record<string, Set<string>>
      }>();
        
      rows.forEach(row => {
          const keys = Object.keys(row);
          
          const findKey = (includes: string[], excludes: string[] = []) => {
              return keys.find(k => {
                  const lower = k.toLowerCase().trim();
                  return includes.some(inc => lower.includes(inc)) && 
                          !excludes.some(exc => lower.includes(exc));
              });
          };

          // 1. Student ID
          const idKey = findKey(['studentId', 'studentid', 'id', 'no', 'num', 'student', 'رقم', 'متدرب'], ['course', 'subject', 'name', 'اسم', 'code']);
          const studentId = idKey ? String(row[idKey]).trim() : '';

          // 2. Course Code
          // Exclude 'department' to avoid matching 'course department' as a course code
          const codeKey = findKey(['code', 'course', 'subject', 'رمز', 'مقرر'], ['name', 'title', 'اسم', 'student', 'id', 'department', 'dept']);
          const courseCode = codeKey ? String(row[codeKey]).trim() : '';

          // 3. Course Name
          let nameKey = findKey(['coursename', 'course_name', 'subjectname', 'subject_name', 'اسم_المقرر', 'اسم المقرر']);
          if (!nameKey) {
              nameKey = findKey(['name', 'title', 'اسم', 'وصف'], ['student', 'proctor', 'id', 'code', 'متدرب', 'مراقب', 'رقم', 'teacher', 'std', 'تدريبي', 'department', 'dept']);
          }
          const courseName = nameKey ? String(row[nameKey]).trim() : '';

          // 4. Department (Teaching Dept)
          // Prioritize specific column names like 'course department'
          const deptKey = findKey(['course department', 'course_department', 'depart', 'dept', 'section', 'القسم']);
          const department = deptKey ? String(row[deptKey]).trim() : 'عام';

          // 5. Specialization (Student Major)
          const specKey = findKey(['specialization', 'major', 'التخصص', 'تخصص']);
          const specialization = specKey ? String(row[specKey]).trim() : 'عام';

          if (studentId && courseCode) {
              // Normalize Course Name
              let finalName = courseCode;
              if (courseName && isNaN(Number(courseName)) && courseName !== studentId) {
                  finalName = courseName;
              }

              if (!coursesMap.has(courseCode)) {
                  coursesMap.set(courseCode, {
                      name: finalName,
                      students: new Set(),
                      deptStudents: {},
                      specStudents: {}
                  });
              }

              const entry = coursesMap.get(courseCode)!;
              entry.students.add(studentId);
              
              // Track Dept (Teaching) - Map Dept -> Set of Student IDs
              if (!entry.deptStudents[department]) {
                  entry.deptStudents[department] = new Set();
              }
              entry.deptStudents[department].add(studentId);

              // Track Specialization (Student) - Map Spec -> Set of Student IDs
              if (!entry.specStudents[specialization]) {
                  entry.specStudents[specialization] = new Set();
              }
              entry.specStudents[specialization].add(studentId);

              // Update name if longer (better quality) found
              if (finalName.length > entry.name.length) {
                  entry.name = finalName;
              }
          }
      });

      return Array.from(coursesMap.entries()).map(([code, data]: [string, { 
          name: string, 
          students: Set<string>, 
          deptStudents: Record<string, Set<string>>,
          specStudents: Record<string, Set<string>>
      }]) => {
          const deptDist: Record<string, number> = {};
          Object.keys(data.deptStudents).forEach(dept => {
              deptDist[dept] = data.deptStudents[dept].size;
          });

          const specDist: Record<string, number> = {};
          Object.keys(data.specStudents).forEach(spec => {
              specDist[spec] = data.specStudents[spec].size;
          });

          // Determine primary department (highest count)
          const primaryDept = Object.entries(deptDist).sort((a,b) => b[1] - a[1])[0]?.[0] || 'عام';
          // Determine primary specialization (highest count)
          const primarySpec = Object.entries(specDist).sort((a,b) => b[1] - a[1])[0]?.[0] || 'عام';

          return {
              code,
              name: data.name,
              department: primaryDept, // Default primary
              specialization: primarySpec, // Default primary
              students: data.students,
              studentCount: data.students.size,
              departmentDistribution: deptDist,
              specializationDistribution: specDist,
              deptStudents: data.deptStudents,
              specStudents: data.specStudents,
              assignedSlot: null,
              conflicts: new Set()
          };
      });
  };

  // 1. File Parsing
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      const parsed = parseCSV(text);
      
      const courses = extractCoursesFromRows(parsed);
      setBaseCourses(courses);
      setRawFileName(file.name);
      setExcludedCodes(new Set()); 
      setSharedCourseDecisions({});
      setStep(1); // Go to Settings & Analysis
    };
    reader.readAsText(file);
  };

  // 2. Analysis & Decision Logic
  const getSharedCourses = () => {
      // Find courses that are EITHER taught by multiple depts OR taken by multiple specs
      return baseCourses.filter(c => {
          const multiDept = c.departmentDistribution && Object.keys(c.departmentDistribution).length > 1;
          const multiSpec = c.specializationDistribution && Object.keys(c.specializationDistribution).length > 1;
          return multiDept || multiSpec;
      });
  };

  const handleDecisionChange = (code: string, decision: 'merge' | 'split') => {
      setSharedCourseDecisions(prev => ({ ...prev, [code]: decision }));
  };

  // Apply Split/Merge logic
  useEffect(() => {
      if (baseCourses.length === 0) return;

      const newProcessedCourses: CourseInfo[] = [];

      baseCourses.forEach(course => {
          const decision = sharedCourseDecisions[course.code] || 'merge'; // Default merge
          const multiDept = course.departmentDistribution && Object.keys(course.departmentDistribution).length > 1;
          
          if (decision === 'split') {
              if (multiDept) {
                  // Split by Dept
                  Object.entries(course.deptStudents || {}).forEach(([dept, rawSet]) => {
                      const studentsSet = rawSet as Set<string>;
                      newProcessedCourses.push({
                          ...course,
                          code: `${course.code}::${dept}`,
                          name: `${course.name} (${dept})`,
                          department: dept,
                          specialization: course.specialization,
                          studentCount: studentsSet.size,
                          students: studentsSet, // Assign specific students for this dept
                          isSplit: true,
                          conflicts: new Set()
                      });
                  });
              } else {
                  // Split by Specialization
                  Object.entries(course.specStudents || {}).forEach(([spec, rawSet]) => {
                      const studentsSet = rawSet as Set<string>;
                      newProcessedCourses.push({
                          ...course,
                          code: `${course.code}::${spec}`,
                          name: `${course.name} (${spec})`,
                          department: course.department, 
                          specialization: spec,
                          studentCount: studentsSet.size,
                          students: studentsSet, // Assign specific students for this spec
                          isSplit: true,
                          conflicts: new Set()
                      });
                  });
              }
          } else {
              // MERGE
              newProcessedCourses.push({ ...course, conflicts: new Set() });
          }
      });

      setProcessedCourses(newProcessedCourses);
  }, [baseCourses, sharedCourseDecisions]);


  // 3. Helper: Generate Slots
  const generateSlots = (): TimeSlot[] => {
      const result: TimeSlot[] = [];
      const start = new Date(startDate);
      // Ensure we start at noon to avoid timezone rolling back
      start.setHours(12, 0, 0, 0);
      let current = new Date(start);
      
      // Skip weekend if start date is Fri/Sat
      while(current.getDay() === 5 || current.getDay() === 6) {
          current.setDate(current.getDate() + 1);
      }

      let slotCounter = 0;
      for (let day = 0; day < examDays; day++) {
          const dateStr = current.toISOString().split('T')[0];
          
          for (let p = 0; p < periodsPerDay; p++) {
              // Use custom config if available, else fallback logic
              let timeLabel = '';
              
              if (periodConfigs[p]) {
                  timeLabel = `${periodConfigs[p].start} - ${periodConfigs[p].end}`;
              } else {
                  // Fallback (Should not happen if effect works)
                  const startTime: number = ([8, 10, 13, 15, 17][p] ?? (8 + p * 2));
                  const startMin = p === 1 ? 30 : 0; 
                  const endTime = startTime + 2;
                  const formatTime = (h: number, m: number) => 
                      `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
                  timeLabel = `${formatTime(startTime, startMin)} - ${formatTime(endTime, startMin)}`;
              }

              result.push({
                  id: slotCounter++,
                  dateStr,
                  dayIndex: day,
                  periodIndex: p,
                  timeLabel
              });
          }

          // Advance to next day, skipping weekends
          do {
              current.setDate(current.getDate() + 1);
          } while (current.getDay() === 5 || current.getDay() === 6);
      }
      return result;
  };

  // 4. Core Logic - UPDATED FOR STRICTER STUDENT CHECKS
  const startBuilding = async () => {
      if (!startDate || processedCourses.length === 0) {
          alert('الرجاء التأكد من رفع الملف وتحديد تاريخ البداية');
          return;
      }

      setStep(2);
      setLogs(['بدء المعالجة...']);

      await new Promise(r => setTimeout(r, 300));

      const courseList: CourseInfo[] = processedCourses
        .filter(c => {
            const baseCode = c.code.split('::')[0];
            return !excludedCodes.has(baseCode) && !excludedCodes.has(c.code);
        })
        .map(c => ({ ...c, assignedSlot: null, conflicts: new Set<string>() }));

      setLogs(prev => [...prev, `تم اعتماد ${courseList.length} مقرر (تم استثناء ${excludedCodes.size}).`]);
      
      // Initialize Exam Types with heuristics
      const initialTypes: Record<string, 'Paper' | 'Blackboard'> = {}; 
      courseList.forEach(c => {
          const isLab = c.name.includes('عملي') || c.name.toLowerCase().includes('lab') || c.name.toLowerCase().includes('blackboard');
          initialTypes[c.code] = isLab ? 'Blackboard' : 'Paper';
      });
      setExamTypes(initialTypes);

      // Sort: Heaviest first
      courseList.sort((a, b) => b.studentCount - a.studentCount);

      const availableSlots = generateSlots();
      setSlots(availableSlots);
      
      setLogs(prev => [...prev, `جاري التوزيع الذكي (الفحص المباشر للمتدربين لمنع التعارضات)...`]);
      await new Promise(r => setTimeout(r, 100));

      const unassignedList: string[] = [];
      const slotStudentLoad: Record<number, number> = {}; 
      const dayDepts: Record<number, Set<string>> = {}; 
      
      // Initialize Loads
      availableSlots.forEach(s => {
          slotStudentLoad[s.id] = 0;
          dayDepts[s.dayIndex] = new Set();
      });

      // --- CRITICAL UPDATE: DIRECT STUDENT STATE TRACKING ---
      // Instead of relying on a conflict graph, we track the state of every student directly.
      // This is O(1) lookup during assignment and guarantees correctness.
      const studentState = new Map<string, StudentState>();

      // Initialize state for all students involved
      courseList.forEach(c => {
          c.students.forEach(sid => {
              if (!studentState.has(sid)) {
                  studentState.set(sid, { occupiedSlots: new Set(), dayCounts: {} });
              }
          });
      });

      for (const course of courseList) {
          const candidateSlots: TimeSlot[] = [];

          for (const slot of availableSlots) {
              let isConflict = false;

              // 1. Capacity Check
              if (maxCapacityPerPeriod > 0) {
                  const currentLoad = slotStudentLoad[slot.id] || 0;
                  if ((currentLoad + course.studentCount) > maxCapacityPerPeriod) {
                      isConflict = true; 
                  }
              }
              if (isConflict) continue;

              // 2. STRICT STUDENT CHECK (Same Period & Daily Limit)
              // We iterate through students directly.
              for (const sid of course.students) {
                  const state = studentState.get(sid);
                  if (!state) continue; // Should not happen

                  // A. Same Period Conflict: Is the student already busy in this slot?
                  if (state.occupiedSlots.has(slot.id)) {
                      isConflict = true;
                      break;
                  }

                  // B. Daily Limit: Does the student have 2 exams today already?
                  // We want to ADD this one, so if count is already >= 2, we can't.
                  const countToday = state.dayCounts[slot.dayIndex] || 0;
                  if (countToday >= 2) {
                      isConflict = true;
                      break;
                  }
              }

              if (isConflict) continue;

              candidateSlots.push(slot);
          }

          if (candidateSlots.length === 0) {
              unassignedList.push(course.code);
          } else {
              // Soft Constraints: Balance load and cluster departments
              candidateSlots.sort((a, b) => {
                  const loadA: number = slotStudentLoad[a.id] || 0;
                  const loadB: number = slotStudentLoad[b.id] || 0;
                  
                  const bonusA: number = (dayDepts[a.dayIndex] && dayDepts[a.dayIndex].has(course.department)) ? 80 : 0; 
                  const bonusB: number = (dayDepts[b.dayIndex] && dayDepts[b.dayIndex].has(course.department)) ? 80 : 0;

                  const scoreA = loadA - bonusA;
                  const scoreB = loadB - bonusB;

                  if (Math.abs(scoreA - scoreB) > 10) { 
                      return scoreA - scoreB;
                  }

                  return a.periodIndex - b.periodIndex;
              });

              const bestSlot = candidateSlots[0];
              course.assignedSlot = bestSlot.id;
              
              // Update Global Stats
              slotStudentLoad[bestSlot.id] += course.studentCount;
              dayDepts[bestSlot.dayIndex].add(course.department);

              // Update Student State (Critical Step)
              course.students.forEach(sid => {
                  const state = studentState.get(sid);
                  if (state) {
                      state.occupiedSlots.add(bestSlot.id);
                      state.dayCounts[bestSlot.dayIndex] = (state.dayCounts[bestSlot.dayIndex] || 0) + 1;
                  }
              });
          }
      }

      setSchedule(courseList);
      setUnassigned(unassignedList);
      setStep(3);
  };

  // --- Drag and Drop Logic ---

  const handleDragStart = (e: React.DragEvent, index: number, type: 'day' | 'period') => {
      setDraggedItemIndex(index);
      e.dataTransfer.effectAllowed = "move";
      // Transparent image to hide ghost
      const img = new Image();
      img.src = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
      e.dataTransfer.setDragImage(img, 0, 0);
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
      e.preventDefault();
      if (draggedItemIndex === null || draggedItemIndex === index) return;
      setDragOverIndex(index);
  };

  const handleDropDay = (targetIndex: number) => {
      if (draggedItemIndex === null) return;
      
      const dayA = uniqueDates[draggedItemIndex];
      const dayB = uniqueDates[targetIndex];
      
      const dayIndexA = slots.find(s => s.dateStr === dayA)?.dayIndex;
      const dayIndexB = slots.find(s => s.dateStr === dayB)?.dayIndex;

      if (dayIndexA === undefined || dayIndexB === undefined) return;

      const newSchedule = schedule.map(course => {
          if (course.assignedSlot === null) return course;
          const currentSlot = slots.find(s => s.id === course.assignedSlot);
          if (!currentSlot) return course;

          if (currentSlot.dayIndex === dayIndexA) {
              const targetSlot = slots.find(s => s.dayIndex === dayIndexB && s.periodIndex === currentSlot.periodIndex);
              return { ...course, assignedSlot: targetSlot ? targetSlot.id : course.assignedSlot };
          } else if (currentSlot.dayIndex === dayIndexB) {
              const targetSlot = slots.find(s => s.dayIndex === dayIndexA && s.periodIndex === currentSlot.periodIndex);
              return { ...course, assignedSlot: targetSlot ? targetSlot.id : course.assignedSlot };
          }
          return course;
      });

      setSchedule(newSchedule);
      setDraggedItemIndex(null);
      setDragOverIndex(null);
  };

  const handleDropPeriod = (targetIndex: number) => {
      if (draggedItemIndex === null) return;
      if (!swapPeriodDate) return;

      const pIdxA = draggedItemIndex;
      const pIdxB = targetIndex;

      const newSchedule = schedule.map(course => {
          if (course.assignedSlot === null) return course;
          const currentSlot = slots.find(s => s.id === course.assignedSlot);
          if (!currentSlot || currentSlot.dateStr !== swapPeriodDate) return course;

          if (currentSlot.periodIndex === pIdxA) {
              const targetSlot = slots.find(s => s.dateStr === swapPeriodDate && s.periodIndex === pIdxB);
              return { ...course, assignedSlot: targetSlot ? targetSlot.id : course.assignedSlot };
          } else if (currentSlot.periodIndex === pIdxB) {
              const targetSlot = slots.find(s => s.dateStr === swapPeriodDate && s.periodIndex === pIdxA);
              return { ...course, assignedSlot: targetSlot ? targetSlot.id : course.assignedSlot };
          }
          return course;
      });

      setSchedule(newSchedule);
      setDraggedItemIndex(null);
      setDragOverIndex(null);
  };

  const getDaySummary = (dateStr: string) => {
      const slotIds = slots.filter(s => s.dateStr === dateStr).map(s => s.id);
      const courses = schedule.filter(c => c.assignedSlot !== null && slotIds.includes(c.assignedSlot));
      const studentTotal = courses.reduce((acc, c) => acc + c.studentCount, 0);
      const depts = Array.from(new Set(courses.map(c => c.department)));
      return { count: courses.length, students: studentTotal, depts: depts.length };
  };

  const handleDeleteEmptyDay = (dateStr: string) => {
      if (uniqueDates.length <= 1) {
          alert('لا يمكن حذف آخر يوم في الجدول.');
          return;
      }

      const slotIds = slots.filter(s => s.dateStr === dateStr).map(s => s.id);
      const hasAssignedCourses = schedule.some(c => c.assignedSlot !== null && slotIds.includes(c.assignedSlot));
      if (hasAssignedCourses) {
          alert('لا يمكن حذف يوم يحتوي على مقررات.');
          return;
      }

      if (!confirm(`هل تريد حذف اليوم ${dateStr} من الجدول؟`)) return;

      const remainingSlots = slots.filter(s => s.dateStr !== dateStr);
      setSlots(remainingSlots);

      if (swapPeriodDate === dateStr) {
          const nextDate = Array.from(new Set(remainingSlots.map(s => s.dateStr))).sort()[0] || '';
          setSwapPeriodDate(nextDate);
      }

      setDraggedItemIndex(null);
      setDragOverIndex(null);
      setExamDays((prev) => Math.max(1, prev - 1));
  };

  const getPeriodSummary = (dateStr: string, pIdx: number) => {
      const slot = slots.find(s => s.dateStr === dateStr && s.periodIndex === pIdx);
      if (!slot) return { count: 0, students: 0 };
      const courses = schedule.filter(c => c.assignedSlot === slot.id);
      return { count: courses.length, students: courses.reduce((acc, c) => acc + c.studentCount, 0) };
  };

  // Color Helpers
  const getDayColor = (index: number) => {
      const colors = [
          { bg: '#eff6ff', border: '#bfdbfe', text: '#1e3a8a', badge: '#2563eb' }, 
          { bg: '#ecfdf5', border: '#a7f3d0', text: '#064e3b', badge: '#059669' }, 
          { bg: '#fff7ed', border: '#fed7aa', text: '#7c2d12', badge: '#ea580c' }, 
          { bg: '#fdf4ff', border: '#f5d0fe', text: '#701a75', badge: '#c026d3' }, 
          { bg: '#faf5ff', border: '#e9d5ff', text: '#581c87', badge: '#9333ea' }, 
          { bg: '#f0fdfa', border: '#99f6e4', text: '#134e4a', badge: '#0d9488' }, 
          { bg: '#fffbeb', border: '#fde68a', text: '#78350f', badge: '#d97706' }, 
          { bg: '#fff1f2', border: '#fecdd3', text: '#881337', badge: '#e11d48' }, 
          { bg: '#f7fee7', border: '#d9f99d', text: '#365314', badge: '#65a30d' }, 
          { bg: '#f8fafc', border: '#cbd5e1', text: '#334155', badge: '#64748b' }, 
      ];
      return colors[index % colors.length];
  };

  const getPeriodColor = (index: number) => {
      const colors = [
          { bg: '#f0f9ff', border: '#7dd3fc', text: '#0c4a6e', icon: '#0284c7' },
          { bg: '#fefce8', border: '#fde047', text: '#713f12', icon: '#ca8a04' },
          { bg: '#f5f3ff', border: '#a78bfa', text: '#4c1d95', icon: '#7c3aed' },
          { bg: '#fff1f2', border: '#fda4af', text: '#881337', icon: '#e11d48' },
      ];
      return colors[index % colors.length];
  };

  // --- Manual Fix Analysis ---
  const analyzeSlot = (slotId: number, courseCode: string): SlotAnalysis => {
      const slot = slots.find(s => s.id === slotId);
      const course = schedule.find(c => c.code === courseCode);
      if (!slot || !course) return { valid: false, issues: [], severity: 'safe' };

      const issues: { type: 'conflict' | 'fatigue' | 'capacity', msg: string }[] = [];
      let severity: 'safe' | 'warning' | 'critical' = 'safe';

      // 1. Capacity Check
      const coursesInSlot = schedule.filter(c => c.assignedSlot === slot.id);
      const currentLoad = coursesInSlot.reduce((acc, c) => acc + c.studentCount, 0);
      if (maxCapacityPerPeriod > 0 && (currentLoad + course.studentCount > maxCapacityPerPeriod)) {
          issues.push({ type: 'capacity', msg: `تجاوز السعة (${currentLoad + course.studentCount}/${maxCapacityPerPeriod})` });
          severity = 'warning';
      }

      // 2. Direct Conflicts (Direct Check)
      let conflictCount = 0;
      coursesInSlot.forEach(existing => {
          // Intersection check
          let intersect = false;
          if (course.students.size < existing.students.size) {
              for (const s of course.students) if (existing.students.has(s)) { intersect = true; break; }
          } else {
              for (const s of existing.students) if (course.students.has(s)) { intersect = true; break; }
          }
          if (intersect) conflictCount++;
      });

      if (conflictCount > 0) {
          issues.push({ type: 'conflict', msg: `تعارض مباشر (${conflictCount} مقرر)` });
          severity = 'critical';
      }

      // 3. Student Fatigue (Daily Load > 2)
      let fatigueStudents = 0;
      const coursesOnSameDay = schedule.filter(c => 
          c.assignedSlot !== null && 
          c.code !== courseCode &&
          c.assignedSlot !== slotId && 
          slots.find(s => s.id === c.assignedSlot)?.dayIndex === slot.dayIndex
      );

      course.students.forEach(sid => {
          let dailyCount = 0;
          coursesOnSameDay.forEach(other => {
              if (other.students.has(sid)) dailyCount++;
          });
          if (dailyCount >= 2) {
              fatigueStudents++;
          }
      });

      if (fatigueStudents > 0) {
          issues.push({ type: 'fatigue', msg: `إرهاق يومي (${fatigueStudents} متدرب)` });
          if (severity !== 'critical') severity = 'warning';
      }

      return { valid: issues.length === 0, issues, severity };
  };

  const handleForceAssign = (slotId: number) => {
      if (!fixingCourseCode) return;
      
      setSchedule(prev => prev.map(c => c.code === fixingCourseCode ? { ...c, assignedSlot: slotId } : c));
      setUnassigned(prev => prev.filter(c => c !== fixingCourseCode));
      setFixingCourseCode(null);
  };

  const handleAddDay = () => {
      const lastSlot = slots[slots.length - 1] as TimeSlot | undefined;
      const lastDayIndex = (lastSlot?.dayIndex) as number | undefined;
      const newDayIndex: number = (lastDayIndex ?? -1) + 1;
      
      const baseDateStr = lastSlot ? lastSlot.dateStr : startDate;
      if (!baseDateStr) return;

      // Fix: Create date at noon to avoid timezone shifts
      let nextDate = new Date(baseDateStr.includes('T') ? baseDateStr : `${baseDateStr}T12:00:00`);
      nextDate.setDate(nextDate.getDate() + 1);
      
      while (nextDate.getDay() === 5 || nextDate.getDay() === 6) {
          nextDate.setDate(nextDate.getDate() + 1);
      }
      
      // Manual formatting to ensure YYYY-MM-DD matches local date
      const year = nextDate.getFullYear();
      const month = String(nextDate.getMonth() + 1).padStart(2, '0');
      const day = String(nextDate.getDate()).padStart(2, '0');
      const dateStr = `${year}-${month}-${day}`;
      
      const currentIds = slots.map(s => Number(s.id));
      const maxId: number = currentIds.length > 0 ? Math.max(...currentIds) : 0;
      let nextId: number = maxId + 1;
      const newSlots: TimeSlot[] = [];

      for (let p = 0; p < Number(periodsPerDay); p++) {
          let timeLabel = '';
          if (periodConfigs[p]) {
              timeLabel = `${periodConfigs[p].start} - ${periodConfigs[p].end}`;
          } else {
              // Fallback
              const startHour = 8 + (p * 2);
              timeLabel = `${String(startHour).padStart(2,'0')}:00 - ${String(startHour+2).padStart(2,'0')}:00`;
          }

          newSlots.push({
              id: nextId++,
              dateStr,
              dayIndex: newDayIndex,
              periodIndex: p,
              timeLabel
          });
      }

      setSlots(prev => [...prev, ...newSlots]);
      setExamDays(prev => prev + 1);
  };

  // --- Save Validation Logic (STRONG CHECK) ---
  const validateAndSave = () => {
      // 1. Convert to Standard Exam Format
      const tempExams: Exam[] = schedule
          .filter(c => c.assignedSlot !== null)
          .map(c => {
               const slot = slots.find(s => s.id === c.assignedSlot);
               return {
                   courseCode: c.code,
                   courseName: c.name,
                   date: slot?.dateStr || '',
                   time: slot?.timeLabel.split('-')[0].trim() || '',
                   duration: duration,
                   type: examTypes[c.code] || 'Paper', // Use selected type
                   department: c.department,
                   // UPDATED: Assign specialization for validation logic
                   specialization: (!c.isSplit && c.specializationDistribution && Object.keys(c.specializationDistribution).length > 1) 
                    ? 'جميع التخصصات' 
                    : c.specialization
               };
          });

      // 2. Create "Committee-like" structure for the validator
      // The validator in helpers expects committees to contain student lists.
      // We simulate a committee for each scheduled exam containing ALL its students.
      const tempCommittees: Committee[] = schedule
          .filter(c => c.assignedSlot !== null)
          .map((c, idx) => ({
             id: `TEMP-${idx}`,
             examCode: c.code,
             roomId: 'TEMP', // Dummy
             proctorIds: [],
             studentIds: Array.from(c.students),
             // UPDATED: Add specialization to temp committee so validator links it to correct temp exam
             specialization: (!c.isSplit && c.specializationDistribution && Object.keys(c.specializationDistribution).length > 1) 
                    ? 'جميع التخصصات' 
                    : c.specialization
          }));

      // 3. Run the EXACT same validation logic used in Manager Dashboard
      // We pass empty arrays for rooms/proctors as we are only checking student conflicts here
      const strongConflicts = validateSchedule(tempCommittees, [], tempExams, [], []);
      
      // Filter only error-level conflicts related to student schedule
      const criticalConflicts = strongConflicts.filter(c => c.severity === 'Error');

      setValidationResult({
          isOpen: true,
          conflicts: criticalConflicts,
          unassigned: unassigned.length
      });
  };

  const confirmSave = () => {
      if (!setData) return;
      
      const newExams = schedule
          .filter(c => c.assignedSlot !== null)
          .map(c => {
              const slot = slots.find(s => s.id === c.assignedSlot);
              return {
                  courseCode: c.code,
                  courseName: c.name,
                  date: slot?.dateStr || '',
                  time: slot?.timeLabel.split('-')[0].trim() || '',
                  duration: duration,
                  type: examTypes[c.code] || 'Paper', // Save the selected type
                  department: c.department,
                  // If it was merged (has multi-specs but no split), mark as All
                  specialization: (!c.isSplit && c.specializationDistribution && Object.keys(c.specializationDistribution).length > 1) 
                    ? 'جميع التخصصات' 
                    : c.specialization
              };
          });
      
      // We also need to save the STUDENTS to the main system so the Manager Dashboard
      // has the correct student data for its own validation later.
      const allStudentsMap = new Map<string, Student>();
      
      // 1. Preserve existing students if any
      if (data?.students) {
          data.students.forEach((s: Student) => allStudentsMap.set(s.id, s));
      }

// 2. Merge student IDs from the current schedule state.
      // This allows loading drafts without uploaded file data.
      schedule.forEach(c => {
          c.students.forEach(sid => {
              const existing = allStudentsMap.get(sid);
              const newCourseCodes = existing ? [...existing.courseCodes] : [];
              if (!newCourseCodes.includes(c.code)) {
                  newCourseCodes.push(c.code);
              }

              let spec = existing?.specialization || c.specialization || 'عام';
              if (spec === 'عام' && c.specializationDistribution) {
                  const bestSpec = Object.entries(c.specializationDistribution)
                      .sort((a,b) => b[1] - a[1])[0]?.[0];
                  if (bestSpec) spec = bestSpec;
              }

              allStudentsMap.set(sid, {
                  id: sid,
                  name: existing?.name || `المتدرب ${sid}`, 
                  specialization: spec,
                  courseCodes: newCourseCodes
              });
          });
      });

      setData((prev: any) => ({
          ...prev,
          students: Array.from(allStudentsMap.values()),
          exams: newExams,
          committees: [] // Clear old committees as they are invalid now
      }));
      
      setValidationResult({ ...validationResult, isOpen: false });
      alert("✅ تم اعتماد الجدول وحفظه في النظام بنجاح! يمكنك الآن الذهاب للوحة المدير لإنشاء اللجان.");
  };

  const clearBuilder = () => {
      setRawFileName('');
      setBaseCourses([]);
      setProcessedCourses([]);
      setExcludedCodes(new Set());
      setSharedCourseDecisions({});
      setSchedule([]);
      setSlots([]);
      setUnassigned([]);
      setStartDate('');
      setExamDays(10);
      setPeriodsPerDay(3);
      setDuration(120);
      setMaxCapacityPerPeriod(0);
      setPeriodConfigs([
          { start: '08:00', end: '10:00' },
          { start: '10:30', end: '12:30' },
          { start: '13:00', end: '15:00' }
      ]);
      setDraftName('');
      setActiveDraftId(null);
      setStep(0);
  };

  const saveDraft = async () => {
      if (!setData) return;
      if (schedule.length === 0) {
          alert('لا يوجد جدول قابل للحفظ. أنشئ جدولاً أولاً ثم حاول الحفظ.');
          return;
      }

      const draftId = `draft-${Date.now()}`;
      const name = draftName.trim() || `الجدول المبدئي ${new Date().toLocaleDateString('ar-EG')} ${new Date().toLocaleTimeString('ar-EG')}`;
      const newDraft: DraftSchedule = {
          id: draftId,
          name,
          createdAt: new Date().toISOString(),
          startDate,
          examDays,
          periodsPerDay,
          duration,
          maxCapacityPerPeriod,
          periodConfigs,
          courses: schedule.map(c => ({
              code: c.code,
              name: c.name,
              department: c.department,
              specialization: c.specialization,
              studentCount: c.studentCount,
              assignedSlot: c.assignedSlot,
              isSplit: c.isSplit,
              students: Array.from(c.students),
              departmentDistribution: c.departmentDistribution,
              specializationDistribution: c.specializationDistribution
          })),
          slots: slots.map(s => ({
              id: s.id,
              dateStr: s.dateStr,
              dayIndex: s.dayIndex,
              periodIndex: s.periodIndex,
              timeLabel: s.timeLabel
          }))
      };

      const nextData = {
          ...(data || {}),
          drafts: [ ...(Array.isArray(data?.drafts) ? data.drafts : []), newDraft ]
      };
      setData(nextData);
      setDraftName('');
      setActiveDraftId(draftId);
      const synced = await syncSystemState(nextData);
      if (synced) {
          alert('✅ تم حفظ الجدول المبدئي ومزامنته مع الخادم بنجاح.');
      } else {
          alert('✅ تم حفظ الجدول المبدئي محلياً، لكن تعذرت مزامنته الآن. تأكد من اتصال الخادم ثم جرّب مرة أخرى.');
      }
  };

  const deleteDraft = async (draftId: string) => {
      if (!setData) return;
      if (!confirm('هل أنت متأكد من حذف هذا الجدول المبدئي؟')) return;
      const nextData = {
          ...(data || {}),
          drafts: (Array.isArray(data?.drafts) ? data.drafts : []).filter((d: DraftSchedule) => d.id !== draftId)
      };
      setData(nextData);
      if (activeDraftId === draftId) {
          setActiveDraftId(null);
      }
      await syncSystemState(nextData);
  };

  const loadDraft = (draft: DraftSchedule) => {
      setDraftName(draft.name);
      setActiveDraftId(draft.id);
      setStartDate(draft.startDate);
      setExamDays(draft.examDays);
      setPeriodsPerDay(draft.periodsPerDay);
      setDuration(draft.duration);
      setMaxCapacityPerPeriod(draft.maxCapacityPerPeriod ?? 0);
      setPeriodConfigs(draft.periodConfigs);
      setSlots(draft.slots.map(s => ({ ...s })));
      const loadedCourses = draft.courses.map(c => ({
          code: c.code,
          name: c.name,
          department: c.department,
          specialization: c.specialization,
          studentCount: c.studentCount,
          students: new Set(c.students),
          assignedSlot: c.assignedSlot,
          departmentDistribution: c.departmentDistribution,
          specializationDistribution: c.specializationDistribution,
          deptStudents: {},
          specStudents: {},
          isSplit: c.isSplit,
          conflicts: new Set<string>()
      }));
      setSchedule(loadedCourses);
      setProcessedCourses(loadedCourses);
      setBaseCourses([]);
      setExcludedCodes(new Set());
      setSharedCourseDecisions({});
      setUnassigned([]);
      setStep(3);
  };

  const saveCapacityToActiveDraft = async () => {
      if (!setData || !data || !activeDraftId) {
          alert('افتح مسودة أولاً ثم عدّل السعة واحفظها.');
          return;
      }

      const nextData = {
          ...data,
          drafts: (Array.isArray(data.drafts) ? data.drafts : []).map((d: DraftSchedule) =>
              d.id === activeDraftId
                  ? { ...d, maxCapacityPerPeriod }
                  : d
          )
      };

      setData(nextData);
      const synced = await syncSystemState(nextData);
      if (!synced) {
          alert('⚠️ تم حفظ السعة محلياً، لكن تعذرت المزامنة حالياً.');
          return;
      }

      // Verify from server to ensure persistence across refresh/login/devices.
      const serverState = await fetchSystemState();
      if (serverState?.drafts) {
          const savedDraft = serverState.drafts.find((d: DraftSchedule) => d.id === activeDraftId);
          const savedCapacity = savedDraft?.maxCapacityPerPeriod ?? 0;
          if (savedCapacity === maxCapacityPerPeriod) {
              setData(serverState);
              alert('✅ تم حفظ سعة الفترة في المسودة وتأكيدها من الخادم.');
              return;
          }
      }

      alert('⚠️ تمت المزامنة لكن لم يتم تأكيد حفظ قيمة السعة من الخادم. تأكد من إعادة تشغيل السيرفر ثم أعد الحفظ.');
  };


  const handleExportCSV = () => {
      const headers = ["course", "courseName", "Time", "date", "ExamType", "Duration", "department", "specialization"];
      const rows = schedule.filter(c => c.assignedSlot !== null).map(c => {
          const slot = slots.find(s => s.id === c.assignedSlot);
          const codeStr = String(c.code);
          const displayCode = codeStr.includes('::') ? codeStr.split('::')[0] : codeStr;
          
          let specOutput = c.specialization;
          if (!c.isSplit && c.specializationDistribution && Object.keys(c.specializationDistribution).length > 1) {
              specOutput = 'جميع التخصصات';
          }
          
          // Use the selected type
          const typeStr = (examTypes[c.code] || 'Paper') === 'Blackboard' ? 'معمل' : 'قاعة';

          return [
              displayCode,
              c.name,
              slot?.timeLabel,
              slot?.dateStr,
              typeStr,
              duration,
              c.department,
              specOutput
          ].map(v => `"${v}"`).join(';');
      });
      
      const content = '\uFEFF' + headers.join(';') + '\n' + rows.join('\n');
      const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', 'الجدول_الذكي_المثالي.csv');
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
  };
  
  const handlePrintMatrix = () => {
      const assigned = schedule.filter((c) => c.assignedSlot !== null);
      if (assigned.length === 0) {
          alert('لا توجد مقررات موزعة للطباعة. يرجى بناء الجدول أولاً.');
          return;
      }
      if (slots.length === 0) {
          alert('لا توجد فترات زمنية في الجدول.');
          return;
      }
      const built = buildScheduleFromBuilder(schedule, slots, periodConfigs);
      setMatrixPrintData(built);
      setShowMatrixPrint(true);
  };

  const handleDownloadTemplate = () => {
      // Matching the user's requested format: studentId;StudentName;course;courseName;Specialization;Department
      const content = '\uFEFFstudentId;StudentName;course;courseName;Specialization;Department\n44110022;أحمد محمد;MATH101;رياضيات;شبكات;حاسب\n44110022;أحمد محمد;CS101;حاسب;هندسة برمجيات;حاسب';
      const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', 'نموذج_سجل_المتدربين.csv');
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
  };

  const uniqueDates = Array.from(new Set(slots.map(s => s.dateStr))).sort();
  
  // Calculate counts for badge
  const conflictCount = validationResult.conflicts.length;
  const isSafe = conflictCount === 0 && validationResult.unassigned === 0;

  return (
    <div className="space-y-8 animate-fade-in">
      <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
        <h2 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
            <Sparkles className="text-tvtc-gold" size={28} />
            بناء الجدول الذكي (Balanced Scheduler)
        </h2>
        <p className="text-gray-600 mt-2">
            يتميز هذا النظام بقدرته على اكتشاف <b>المقررات المشتركة</b> بين الأقسام أو التخصصات والسماح للمدير باتخاذ قرار دمجها أو فصلها قبل الجدولة.
        </p>
      </div>

      {Array.isArray(data?.drafts) && data.drafts.length > 0 && (
          <div className="bg-white p-4 rounded-lg border border-gray-200 shadow-sm">
              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-4">
                  <div>
                      <h3 className="text-lg font-bold text-gray-800">الجداول المبدئية المحفوظة</h3>
                      <p className="text-sm text-gray-500">يمكنك فتح أي جدول مبدئي لمتابعة التعديل أو حذفه من قاعدة البيانات.</p>
                  </div>
                  <span className="text-xs text-gray-500">{data.drafts.length} جدول محفوظ</span>
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                  {data.drafts.map((draft: DraftSchedule) => (
                      <div key={draft.id} className={`border ${activeDraftId === draft.id ? 'border-green-500 bg-green-50' : 'border-gray-200'} rounded-lg p-3 flex flex-col justify-between`}>
                          <div>
                              <div className="font-semibold text-gray-800">{draft.name}</div>
                              <div className="text-xs text-gray-500 mt-1">حُفظ في: {new Date(draft.createdAt).toLocaleString('ar-EG')}</div>
                              <div className="text-xs text-gray-500 mt-1">عدد المقررات: {draft.courses.length}</div>
                          </div>
                          <div className="mt-4 flex gap-2 flex-wrap">
                              <button onClick={() => loadDraft(draft)} className="bg-blue-600 text-white px-3 py-2 rounded text-xs hover:bg-blue-700 transition-colors">
                                  فتح الجدول
                              </button>
                              <button onClick={() => deleteDraft(draft.id)} className="bg-red-600 text-white px-3 py-2 rounded text-xs hover:bg-red-700 transition-colors">
                                  حذف الجدول
                              </button>
                          </div>
                      </div>
                  ))}
              </div>
          </div>
      )}

      {/* Step 0: Initial Upload ONLY */}
      {step === 0 && (
          <div className="bg-white p-12 rounded-xl shadow border border-gray-100 text-center flex flex-col items-center justify-center min-h-[400px]">
              <div className="bg-blue-50 border-2 border-dashed border-blue-200 rounded-full p-10 mb-6 transition-transform hover:scale-105 cursor-pointer relative group">
                  <Upload size={64} className="text-blue-400 group-hover:text-blue-600 transition-colors" />
                  <input 
                    type="file" 
                    accept=".csv"
                    onChange={handleFileUpload}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                  />
              </div>
              <h3 className="text-2xl font-bold text-gray-800 mb-2">رفع ملف سجل المتدربين (CSV)</h3>
              <p className="text-gray-500 max-w-md mx-auto mb-4">
                  قم برفع ملف يحتوي على سجلات المتدربين والمقررات المسجلة لبدء عملية بناء الجدول.
              </p>
              
              <div className="bg-gray-50 p-3 rounded border text-sm text-gray-600 mb-6 dir-ltr font-mono">
                  Required Columns: studentId; StudentName; course; courseName; Specialization; Department
              </div>

              <button 
                  onClick={handleDownloadTemplate}
                  className="text-blue-600 hover:text-blue-800 flex items-center gap-2 font-bold text-sm bg-blue-50 px-4 py-2 rounded-lg"
              >
                  <Download size={16}/> تحميل نموذج الملف
              </button>
          </div>
      )}

      {/* Step 1: Configuration & Analysis */}
      {step === 1 && (
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">
              {/* Left Column: Configuration */}
              <div className="xl:col-span-1 space-y-6">
                  {/* General Settings */}
                  <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
                      <h3 className="font-bold text-lg mb-4 flex items-center gap-2 border-b pb-2">
                          <Settings size={20} className="text-tvtc-green"/> إعدادات الجدول
                      </h3>
                      <div className="space-y-4">
                          <div>
                              <label className="block text-sm font-medium mb-1 text-gray-700">تاريخ بداية الاختبارات</label>
                              <input 
                                  type="date" 
                                  value={startDate} 
                                  onChange={e => setStartDate(e.target.value)}
                                  className="w-full border rounded p-2 focus:ring-2 focus:ring-tvtc-green outline-none bg-gray-100"
                              />
                          </div>
                          <div className="grid grid-cols-2 gap-4">
                              <div>
                                  <label className="block text-sm font-medium mb-1 text-gray-700">عدد الأيام</label>
                                  <input 
                                      type="number" 
                                      value={examDays} 
                                      onChange={e => setExamDays(parseInt(e.target.value))}
                                      className="w-full border rounded p-2 focus:ring-2 focus:ring-tvtc-green outline-none bg-gray-100"
                                  />
                              </div>
                              <div>
                                  <label className="block text-sm font-medium mb-1 text-gray-700">مدة الاختبار</label>
                                  <input 
                                      type="number" 
                                      value={duration} 
                                      onChange={e => setDuration(parseInt(e.target.value))}
                                      className="w-full border rounded p-2 focus:ring-2 focus:ring-tvtc-green outline-none bg-gray-100"
                                  />
                              </div>
                          </div>
                          
                          <div>
                              <label className="block text-sm font-medium mb-1 text-gray-700">الحد الأقصى للمتدربين (في الفترة الواحدة)</label>
                              <input 
                                  type="number" 
                                  value={maxCapacityPerPeriod} 
                                  onChange={e => setMaxCapacityPerPeriod(parseInt(e.target.value) || 0)}
                                  placeholder="0 = غير محدود"
                                  className="w-full border rounded p-2 focus:ring-2 focus:ring-tvtc-green outline-none bg-gray-100"
                              />
                              <p className="text-[10px] text-gray-400 mt-1">ضع 0 لجعله غير محدود</p>
                          </div>
                      </div>
                  </div>

                  {/* Periods Configuration */}
                  <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
                      <div className="flex justify-between items-center mb-4 border-b pb-2">
                          <h3 className="font-bold text-lg flex items-center gap-2">
                              <Clock size={20} className="text-tvtc-gold"/> الفترات الزمنية
                          </h3>
                          <select 
                              value={periodsPerDay}
                              onChange={(e) => setPeriodsPerDay(Number(e.target.value))}
                              className="border rounded p-1 text-sm bg-gray-100 outline-none"
                          >
                              {[1, 2, 3, 4, 5].map(n => <option key={n} value={n}>{n} فترات</option>)}
                          </select>
                      </div>
                      
                      <div className="space-y-3">
                          {periodConfigs.map((config, idx) => (
                              <div key={idx} className="flex items-center gap-2 bg-gray-50 p-2 rounded border border-gray-100">
                                  <span className="text-xs font-bold w-16 text-gray-500">الفترة {idx + 1}</span>
                                  <input 
                                      type="time" 
                                      value={config.start}
                                      onChange={(e) => updatePeriodConfig(idx, 'start', e.target.value)}
                                      className="border rounded p-1 text-sm w-24 text-center bg-gray-100 outline-none"
                                  />
                                  <span className="text-gray-400 text-xs">إلى</span>
                                  <input 
                                      type="time" 
                                      value={config.end}
                                      onChange={(e) => updatePeriodConfig(idx, 'end', e.target.value)}
                                      className="border rounded p-1 text-sm w-24 text-center bg-gray-100 outline-none"
                                  />
                              </div>
                          ))}
                      </div>
                  </div>
              </div>

              {/* Right Column: Analysis */}
              <div className="xl:col-span-2 space-y-6">
                  <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200 h-full flex flex-col">
                      <h3 className="font-bold text-lg mb-4 flex items-center gap-2 border-b pb-2">
                          <Filter size={20} className="text-blue-600"/> تحليل المقررات ({baseCourses.length})
                      </h3>
                      
                      {/* Analysis Header Stats */}
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                          <div className="bg-blue-50 p-3 rounded border border-blue-100 text-center">
                              <span className="block text-2xl font-bold text-blue-700">{baseCourses.length}</span>
                              <span className="text-xs text-blue-600">إجمالي المقررات</span>
                          </div>
                          <div className="bg-indigo-50 p-3 rounded border border-indigo-100 text-center">
                              <span className="block text-2xl font-bold text-indigo-700">
                                  {getSharedCourses().length}
                              </span>
                              <span className="text-xs text-indigo-600">مقررات مشتركة</span>
                          </div>
                          <div className="bg-purple-50 p-3 rounded border border-purple-100 text-center">
                              <span className="block text-2xl font-bold text-purple-700">
                                  {Object.keys(sharedCourseDecisions).filter(k => sharedCourseDecisions[k] === 'split').length}
                              </span>
                              <span className="text-xs text-purple-600">تم فصلها</span>
                          </div>
                          <div className="bg-gray-50 p-3 rounded border border-gray-100 text-center">
                              <span className="block text-2xl font-bold text-gray-700">
                                  {excludedCodes.size}
                              </span>
                              <span className="text-xs text-gray-600">مستبعدة</span>
                          </div>
                      </div>

                      {/* Shared Courses List */}
                      <div className="flex-1 overflow-y-auto min-h-[300px] border rounded-lg bg-gray-50 p-4 space-y-3">
                          {getSharedCourses().length > 0 ? (
                              getSharedCourses().map(course => {
                                  const decision = sharedCourseDecisions[course.code] || 'merge';
                                  return (
                                      <div key={course.code} className="bg-white p-4 rounded-lg border shadow-sm flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                                          <div>
                                              <div className="font-bold text-gray-800 flex items-center gap-2">
                                                  {course.name} 
                                                  <span className="text-xs font-normal text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">{course.code}</span>
                                              </div>
                                              <div className="text-xs text-gray-500 mt-1 flex flex-wrap gap-2">
                                                  {Object.entries(course.departmentDistribution || {}).map(([dept, count]) => (
                                                      <span key={dept} className="bg-blue-50 text-blue-700 px-2 py-0.5 rounded border border-blue-100">
                                                          {dept}: {count}
                                                      </span>
                                                  ))}
                                              </div>
                                          </div>
                                          
                                          <div className="flex items-center bg-gray-100 rounded-lg p-1">
                                              <button
                                                  onClick={() => handleDecisionChange(course.code, 'merge')}
                                                  className={`px-3 py-1.5 rounded-md text-sm font-bold flex items-center gap-1 transition-all ${decision === 'merge' ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                                              >
                                                  <Merge size={14}/> دمج
                                              </button>
                                              <button
                                                  onClick={() => handleDecisionChange(course.code, 'split')}
                                                  className={`px-3 py-1.5 rounded-md text-sm font-bold flex items-center gap-1 transition-all ${decision === 'split' ? 'bg-white text-indigo-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                                              >
                                                  <Split size={14}/> فصل
                                              </button>
                                          </div>
                                      </div>
                                  );
                              })
                          ) : (
                              <div className="text-center text-gray-400 py-10">
                                  لا توجد مقررات مشتركة تتطلب اتخاذ قرار.
                              </div>
                          )}
                      </div>

                      <div className="mt-6 pt-6 border-t flex justify-end">
                          <button 
                              onClick={startBuilding}
                              disabled={!startDate}
                              className="bg-tvtc-green text-white px-8 py-3 rounded-lg font-bold hover:bg-green-800 flex items-center gap-2 shadow-lg transform active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                              <Play size={20}/> البدء ببناء الجدول
                          </button>
                      </div>
                  </div>
              </div>
          </div>
      )}

      {/* Step 2: Processing (Loading State) */}
      {step === 2 && (
          <div className="bg-white p-12 rounded-xl shadow border border-gray-100 text-center min-h-[400px] flex flex-col justify-center items-center">
              <div className="animate-spin rounded-full h-16 w-16 border-t-4 border-b-4 border-tvtc-green mb-6"></div>
              <h3 className="text-2xl font-bold text-gray-800 mb-2">جاري بناء الجدول...</h3>
              <p className="text-gray-500 mb-6">يقوم النظام الآن بتوزيع المقررات مع مراعاة كافة القيود والتعارضات.</p>
              
              <div className="w-full max-w-lg bg-gray-100 rounded-lg p-4 text-right h-40 overflow-y-auto font-mono text-sm border border-gray-200 shadow-inner">
                  {logs.map((log, i) => (
                      <div key={i} className="text-gray-600 border-b border-gray-200 pb-1 mb-1 last:border-0">{log}</div>
                  ))}
              </div>
          </div>
      )}

      {/* Step 3: Result & Manual Adjustments */}
      {step === 3 && (
          <div className="space-y-6">
              {/* Header Actions */}
              <div className="bg-white p-4 rounded-lg shadow-sm border-l-4 border-tvtc-green flex flex-col md:flex-row justify-between items-center gap-4">
                  <div>
                      <h3 className="font-bold text-lg text-green-800 flex items-center gap-2">
                          <CheckCircle size={20}/> تم بناء الجدول المبدئي
                      </h3>
                      <p className="text-sm text-gray-600 mt-1">
                          تم توزيع {schedule.filter(c => c.assignedSlot !== null).length} مقرر على {slots.length} فترة زمنية.
                      </p>
                      <div className="mt-3 flex flex-col sm:flex-row sm:items-center gap-2">
                          <label className="text-sm font-medium text-gray-700">سعة الفترة (شرط الحد الأقصى):</label>
                          <input
                              type="number"
                              min={0}
                              value={maxCapacityPerPeriod}
                              onChange={e => setMaxCapacityPerPeriod(parseInt(e.target.value) || 0)}
                              placeholder="0 = غير محدود"
                              className="border border-gray-300 rounded px-3 py-1.5 text-sm w-48 bg-white"
                          />
                          <button
                              onClick={saveCapacityToActiveDraft}
                              disabled={!activeDraftId}
                              className="bg-emerald-600 text-white px-3 py-1.5 rounded text-xs hover:bg-emerald-700 shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                              حفظ السعة
                          </button>
                          <span className="text-xs text-gray-500">0 يعني بدون حد أقصى</span>
                      </div>
                  </div>
                  
                  <div className="flex flex-wrap gap-2 justify-end items-center">
                      <button onClick={() => setIsToolsModalOpen(true)} className="bg-indigo-600 text-white px-4 py-2 rounded flex items-center gap-2 text-sm hover:bg-indigo-700 shadow-sm">
                          <Move size={16}/> أدوات التعديل (سحب وإفلات)
                      </button>
                      <button onClick={clearBuilder} className="bg-yellow-500 text-white px-4 py-2 rounded flex items-center gap-2 text-sm hover:bg-yellow-600 shadow-sm">
                          <RefreshCcw size={16}/> مسح وبدء جديد
                      </button>
                      <div className="w-px bg-gray-300 h-8 mx-2 hidden md:block"></div>
                      <button onClick={handlePrintMatrix} className="bg-purple-600 text-white px-4 py-2 rounded flex items-center gap-2 text-sm hover:bg-purple-700 shadow-sm">
                          <Grid size={16}/> طباعة شبكي
                      </button>
                      <button onClick={handleExportCSV} className="bg-blue-600 text-white px-4 py-2 rounded flex items-center gap-2 text-sm hover:bg-blue-700 shadow-sm">
                          <Download size={16}/> تصدير CSV
                      </button>
                      <input
                          type="text"
                          value={draftName}
                          onChange={e => setDraftName(e.target.value)}
                          placeholder="اسم الجدول المبدئي"
                          className="border border-gray-300 rounded px-3 py-2 text-sm w-full max-w-xs"
                      />
                      <button onClick={saveDraft} className="bg-emerald-600 text-white px-4 py-2 rounded flex items-center gap-2 text-sm hover:bg-emerald-700 shadow-sm">
                          <Save size={16}/> حفظ جدول مبدئي
                      </button>
                      <button onClick={validateAndSave} className="bg-green-700 text-white px-6 py-2 rounded flex items-center gap-2 text-sm hover:bg-green-800 shadow-sm font-bold">
                          <CheckCheck size={16}/> اعتماد الجدول
                      </button>
                  </div>
              </div>

              {/* Unassigned Warning */}
              {unassigned.length > 0 && (
                  <div className="bg-red-50 border border-red-200 p-4 rounded-lg shadow-sm">
                      <h4 className="font-bold text-red-800 flex items-center gap-2 mb-2">
                          <AlertCircle size={18}/> تنبيه: مقررات لم يتم جدولتها ({unassigned.length})
                      </h4>
                      <p className="text-sm text-red-700 mb-3">انقر على أي مقرر أدناه لفرض تعيينه يدوياً في الجدول:</p>
                      <div className="flex flex-wrap gap-2">
                          {unassigned.map(code => (
                              <button 
                                  key={code}
                                  onClick={() => setFixingCourseCode(code)}
                                  className="bg-white border border-red-300 text-red-700 px-3 py-1.5 rounded-full text-xs font-bold hover:bg-red-50 hover:border-red-500 transition-colors shadow-sm"
                              >
                                  {schedule.find(c => c.code === code)?.name} ({code})
                              </button>
                          ))}
                      </div>
                  </div>
              )}

              {/* Schedule Grid */}
              <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200 overflow-x-auto">
                  <div className="min-w-[1000px]">
                      <table className="w-full text-center border-collapse text-sm">
                          <thead>
                              <tr className="bg-gray-100">
                                  <th className="border p-3 w-40 font-bold text-gray-700">اليوم / التاريخ</th>
                                  {[...Array(periodsPerDay)].map((_, i) => {
                                       const slot = slots.find(s => s.periodIndex === i);
                                       return (
                                          <th key={i} className="border p-3 font-bold text-gray-700 min-w-[250px]">
                                              الفترة {i + 1}
                                              <span className="block text-xs font-normal text-gray-500 mt-1 dir-ltr">
                                                  {slot?.timeLabel}
                                              </span>
                                          </th>
                                       );
                                  })}
                              </tr>
                          </thead>
                          <tbody>
                              {uniqueDates.map((date, rowIdx) => {
                                  const dual = getDualDate(String(date));
                                  return (
                                      <tr key={String(date)}>
                                          <td className="border p-3 font-bold bg-gray-50 align-middle">
                                              <div className="text-sm text-gray-900">{dual.dayName}</div>
                                              <div className="text-xs text-gray-500 dir-ltr">{dual.greg}</div>
                                              <div className="text-[10px] text-tvtc-green mt-1">{dual.hijri}</div>
                                          </td>
                                          {[...Array(periodsPerDay)].map((_, pIdx) => {
                                              const slot = slots.find(s => s.dateStr === date && s.periodIndex === pIdx);
                                              const coursesInSlot = slot ? schedule.filter(c => c.assignedSlot === slot.id) : [];
                                              
                                              return (
                                                  <td 
                                                      key={pIdx} 
                                                      className={`border p-2 align-top h-32 transition-colors ${dragOverIndex === slot?.id ? 'bg-blue-50' : ''}`}
                                                      onDragOver={(e) => { e.preventDefault(); /* Optional: handle drag over slot */ }}
                                                  >
                                                      <div className="flex flex-col gap-1.5 h-full">
                                                          {coursesInSlot.map(c => {
                                                              const isLab = (examTypes[c.code] || 'Paper') === 'Blackboard';
                                                              const splitSuffix = String(c.code).includes('::') ? String(c.code).split('::')[1] : '';
                                                              const isSplitBySpecialization = !!(c.isSplit && splitSuffix && splitSuffix === c.specialization);
                                                              const hasMultipleSpecializations = !!(c.specializationDistribution && Object.keys(c.specializationDistribution).length > 1);
                                                              const specializationLabel =
                                                                  isSplitBySpecialization
                                                                      ? (c.specialization || 'عام')
                                                                      : (hasMultipleSpecializations ? 'جميع التخصصات' : (c.specialization || 'عام'));
                                                              return (
                                                                  <div 
                                                                      key={c.code} 
                                                                      onClick={() => setFixingCourseCode(c.code)}
                                                                      className={`text-xs p-2 rounded border text-right cursor-pointer hover:shadow-md transition-all group relative ${
                                                                          c.department === 'عام' 
                                                                          ? 'bg-amber-50 border-amber-200 hover:border-amber-400' 
                                                                          : isLab 
                                                                              ? 'bg-purple-50 border-purple-200 hover:border-purple-400'
                                                                              : 'bg-green-50 border-green-200 hover:border-green-400'
                                                                      }`}
                                                                  >
                                                                      <div className="font-bold truncate text-gray-800 mb-1">{c.name}</div>
                                                                      <div className="flex justify-between items-center text-[10px] text-gray-500">
                                                                          <span className="flex flex-col items-start gap-0.5">
                                                                              <span className="font-mono bg-white/50 px-1 rounded">{c.code.split('::')[0]}</span>
                                                                              <span className="text-[10px] text-gray-600">{specializationLabel}</span>
                                                                          </span>
                                                                          <span className="font-bold">{c.studentCount} طالب</span>
                                                                      </div>
                                                                      
                                                                      {/* Exam Type Toggle Button */}
                                                                      <button 
                                                                          onClick={(e) => {
                                                                              e.stopPropagation();
                                                                              setExamTypes(prev => ({
                                                                                  ...prev,
                                                                                  [c.code]: prev[c.code] === 'Blackboard' ? 'Paper' : 'Blackboard'
                                                                              }));
                                                                          }}
                                                                          className={`mt-2 w-full text-[10px] py-0.5 rounded border font-bold transition-colors flex items-center justify-center gap-1 ${
                                                                              isLab 
                                                                              ? 'bg-purple-100 text-purple-700 border-purple-200 hover:bg-purple-200' 
                                                                              : 'bg-gray-100 text-gray-700 border-gray-200 hover:bg-gray-200'
                                                                          }`}
                                                                      >
                                                                          {isLab ? (
                                                                              <>
                                                                                  <Monitor size={10} /> عملي (معمل)
                                                                              </>
                                                                          ) : (
                                                                              <>
                                                                                  <FileText size={10} /> تحريري (قاعة)
                                                                              </>
                                                                          )}
                                                                      </button>
                                                                  </div>
                                                              );
                                                          })}
                                                          {coursesInSlot.length === 0 && (
                                                              <div className="flex-1 flex items-center justify-center text-gray-300 text-xs">
                                                                  فارغ
                                                              </div>
                                                          )}
                                                      </div>
                                                  </td>
                                              );
                                          })}
                                      </tr>
                                  );
                              })}
                          </tbody>
                      </table>
                  </div>
              </div>
          </div>
      )}

      {/* TOOLS MODAL */}
      {isToolsModalOpen && (
          <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
              <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl h-[90vh] overflow-hidden flex flex-col">
                  <div className="bg-gray-800 text-white p-4 flex justify-between items-center shrink-0">
                      <h3 className="font-bold flex items-center gap-2 text-lg">
                          <Settings size={22}/> أدوات تعديل الجدول اليدوي (السحب والإفلات)
                      </h3>
                      <button onClick={() => setIsToolsModalOpen(false)} className="hover:text-red-300"><X size={24}/></button>
                  </div>
                  
                  <div className="flex border-b shrink-0 bg-gray-50">
                      <button 
                        onClick={() => setToolTab('days')}
                        className={`flex-1 py-4 font-bold text-sm flex items-center justify-center gap-2 ${toolTab === 'days' ? 'text-tvtc-green border-b-2 border-tvtc-green bg-white' : 'text-gray-600 hover:bg-gray-100'}`}
                      >
                          <ArrowLeftRight size={16}/> تبديل الأيام (Swap Days)
                      </button>
                      <button 
                        onClick={() => { setToolTab('periods'); setSwapPeriodDate(uniqueDates[0] || ''); }}
                        className={`flex-1 py-4 font-bold text-sm flex items-center justify-center gap-2 ${toolTab === 'periods' ? 'text-tvtc-green border-b-2 border-tvtc-green bg-white' : 'text-gray-600 hover:bg-gray-100'}`}
                      >
                          <Move size={16}/> تبديل الفترات (Swap Periods)
                      </button>
                  </div>

                  <div className="p-6 flex-1 overflow-y-auto bg-gray-50">
                      {toolTab === 'days' && (
                          <div className="space-y-4 h-full">
                              <div className="bg-blue-50 p-3 rounded-lg border border-blue-200 text-sm text-blue-800 flex items-center gap-2">
                                  <MousePointer2 size={16}/>
                                  قم بسحب <b>بطاقة اليوم</b> وإفلاتها فوق يوم آخر لتبديل جميع الاختبارات بينهما.
                              </div>
                              
                              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-3 gap-4">
                                  {uniqueDates.map((date, idx) => {
                                      const summary = getDaySummary(date as string);
                                      const isDragging = draggedItemIndex === idx;
                                      const isTarget = dragOverIndex === idx;
                                      const colors = getDayColor(idx);
                                      const draggedColors = draggedItemIndex !== null ? getDayColor(draggedItemIndex) : null;
                                      const effectiveColors = (isTarget && draggedColors) ? draggedColors : colors;

                                      return (
                                          <div
                                              key={String(date)}
                                              draggable
                                              onDragStart={(e) => handleDragStart(e, idx, 'day')}
                                              onDragOver={(e) => handleDragOver(e, idx)}
                                              onDrop={() => handleDropDay(idx)}
                                              className={`
                                                  relative p-4 rounded-xl border-2 transition-all cursor-grab active:cursor-grabbing
                                                  flex flex-col gap-2 shadow-sm
                                                  ${isDragging ? 'opacity-40 border-dashed scale-95' : 'hover:shadow-md'}
                                                  ${isTarget ? 'border-dashed scale-105 z-10 ring-4 ring-offset-2 ring-opacity-50' : ''}
                                              `}
                                              style={{
                                                  backgroundColor: effectiveColors.bg,
                                                  borderColor: isTarget ? effectiveColors.badge : effectiveColors.border,
                                                  color: effectiveColors.text,
                                                  outlineColor: effectiveColors.badge
                                              }}
                                          >
                                              {/* Overlay Icon for Swap action */}
                                              {isTarget && (
                                                  <div className="absolute inset-0 flex items-center justify-center bg-white/30 backdrop-blur-[1px] rounded-xl z-20">
                                                      <RefreshCcw size={48} className="text-gray-800 drop-shadow-md animate-spin-slow" style={{ color: effectiveColors.badge }}/>
                                                  </div>
                                              )}

                                              <div className="flex justify-between items-center border-b pb-2" style={{ borderColor: effectiveColors.border }}>
                                                  <span className="font-bold text-lg">{String(date)}</span>
                                                  <span className="text-white text-xs px-2 py-1 rounded-full" style={{ backgroundColor: effectiveColors.badge }}>{idx + 1}</span>
                                              </div>
                                              <div className="flex justify-between items-center text-sm">
                                                  <span>المقررات:</span>
                                                  <span className="font-bold">{summary.count}</span>
                                              </div>
                                              <div className="flex justify-between items-center text-sm">
                                                  <span>المتدربين:</span>
                                                  <span className="font-bold">{summary.students}</span>
                                              </div>
                                              <div className="flex justify-between items-center text-sm">
                                                  <span>الأقسام:</span>
                                                  <span className="font-bold">{summary.depts}</span>
                                              </div>
                                              {summary.count === 0 && (
                                                  <button
                                                      type="button"
                                                      onClick={(e) => {
                                                          e.stopPropagation();
                                                          handleDeleteEmptyDay(String(date));
                                                      }}
                                                      className="mt-2 w-full text-xs font-bold bg-red-50 text-red-700 border border-red-200 rounded px-2 py-1 hover:bg-red-100"
                                                  >
                                                      حذف هذا اليوم الفارغ
                                                  </button>
                                              )}
                                              {!isTarget && (
                                                  <div className="absolute top-2 left-2 opacity-50">
                                                      <Move size={16}/>
                                                  </div>
                                              )}
                                          </div>
                                      );
                                  })}
                              </div>
                          </div>
                      )}

                      {toolTab === 'periods' && (
                          <div className="space-y-6 h-full flex flex-col">
                              <div className="flex items-center gap-4 bg-white p-4 rounded-lg shadow-sm border">
                                  <label className="font-bold text-gray-700 whitespace-nowrap">اختر اليوم للتعديل:</label>
                                  <select 
                                      value={swapPeriodDate} 
                                      onChange={e => setSwapPeriodDate(e.target.value)}
                                      className="w-full max-w-xs border rounded-lg p-2 bg-white outline-none focus:ring-2 focus:ring-tvtc-green"
                                  >
                                      {uniqueDates.map(d => <option key={String(d)} value={String(d)}>{String(d)}</option>)}
                                  </select>
                              </div>

                              <div className="bg-blue-50 p-3 rounded-lg border border-blue-200 text-sm text-blue-800 flex items-center gap-2">
                                  <MousePointer2 size={16}/>
                                  قم بسحب <b>بطاقة الفترة</b> وإفلاتها فوق فترة أخرى لتبديل الاختبارات بينهما في هذا اليوم.
                              </div>

                              <div className="flex gap-4 overflow-x-auto pb-4 h-full items-start pt-4">
                                  {[...Array(periodsPerDay)].map((_, idx) => {
                                      const summary = getPeriodSummary(swapPeriodDate, idx);
                                      const timeLabel = slots.find(s => s.periodIndex === idx)?.timeLabel || `Period ${idx+1}`;
                                      const isDragging = draggedItemIndex === idx;
                                      const isTarget = dragOverIndex === idx;
                                      const colors = getPeriodColor(idx);
                                      const draggedColors = draggedItemIndex !== null ? getPeriodColor(draggedItemIndex) : null;
                                      const effectiveColors = (isTarget && draggedColors) ? draggedColors : colors;

                                      return (
                                          <div
                                              key={idx}
                                              draggable
                                              onDragStart={(e) => handleDragStart(e, idx, 'period')}
                                              onDragOver={(e) => handleDragOver(e, idx)}
                                              onDrop={() => handleDropPeriod(idx)}
                                              className={`
                                                  relative flex-1 min-w-[200px] p-5 rounded-xl border-2 transition-all cursor-grab active:cursor-grabbing
                                                  flex flex-col gap-3 shadow-sm h-56 justify-center items-center text-center
                                                  ${isDragging ? 'opacity-40 border-dashed scale-95' : 'hover:shadow-md'}
                                                  ${isTarget ? 'border-dashed scale-105 z-10 ring-4 ring-offset-2 ring-opacity-50' : ''}
                                              `}
                                              style={{
                                                  backgroundColor: effectiveColors.bg,
                                                  borderColor: isTarget ? effectiveColors.icon : effectiveColors.border,
                                                  color: effectiveColors.text
                                              }}
                                          >
                                               {/* Overlay Icon for Swap action */}
                                               {isTarget && (
                                                  <div className="absolute inset-0 flex items-center justify-center bg-white/40 backdrop-blur-[1px] rounded-xl z-20">
                                                      <ArrowLeftRight size={48} className="drop-shadow-md" style={{ color: effectiveColors.icon }}/>
                                                  </div>
                                              )}

                                              <div className="font-bold text-xl mb-1" style={{ color: effectiveColors.icon }}>
                                                  الفترة {idx + 1}
                                              </div>
                                              <div className="text-gray-600 text-sm font-mono bg-white/60 px-3 py-1 rounded border border-black/5">
                                                  {timeLabel}
                                              </div>
                                              
                                              <div className="w-full border-t border-black/10 pt-4 mt-2 flex justify-around">
                                                  <div className="flex flex-col">
                                                      <span className="text-2xl font-bold">{summary.count}</span>
                                                      <span className="text-xs opacity-70">مقرر</span>
                                                  </div>
                                                  <div className="w-px bg-black/10 h-10"></div>
                                                  <div className="flex flex-col">
                                                      <span className="text-2xl font-bold">{summary.students}</span>
                                                      <span className="text-xs opacity-70">متدرب</span>
                                                  </div>
                                              </div>
                                          </div>
                                      );
                                  })}
                              </div>
                          </div>
                      )}
                  </div>
              </div>
          </div>
      )}

      {/* MANUAL FIX MODAL */}
      {fixingCourseCode && (
          <div className="fixed inset-0 bg-black/70 z-[70] flex items-center justify-center p-4">
              <div className="bg-white rounded-xl shadow-2xl w-full max-w-5xl h-[85vh] flex flex-col overflow-hidden">
                  <div className="bg-gray-800 text-white p-4 flex justify-between items-center shrink-0">
                      <div>
                          <h3 className="font-bold text-lg flex items-center gap-2">
                              <Wrench size={20}/> المعالجة اليدوية: {schedule.find(c => c.code === fixingCourseCode)?.name}
                          </h3>
                          <p className="text-xs text-gray-300 mt-1">
                              اختر فترة زمنية لفرض التعيين. الألوان تشير إلى المخاطر المحتملة.
                          </p>
                      </div>
                      <div className="flex gap-2 items-center">
                          <button 
                              onClick={handleAddDay}
                              className="bg-tvtc-green text-white px-3 py-1.5 rounded flex items-center gap-1 hover:bg-green-700 text-sm font-bold shadow-md border border-white/20"
                          >
                              <Plus size={16}/> إضافة يوم اختبارات جديد
                          </button>
                          <button onClick={() => setFixingCourseCode(null)} className="hover:text-red-300"><X size={24}/></button>
                      </div>
                  </div>
                  
                  <div className="flex gap-4 p-4 bg-gray-100 border-b text-sm">
                      <div className="flex items-center gap-2"><div className="w-3 h-3 bg-green-500 rounded-full"></div> <span>آمن ومتاح</span></div>
                      <div className="flex items-center gap-2"><div className="w-3 h-3 bg-yellow-500 rounded-full"></div> <span>تجاوز السعة (تحذير)</span></div>
                      <div className="flex items-center gap-2"><div className="w-3 h-3 bg-orange-500 rounded-full"></div> <span>إرهاق (3 اختبارات/يوم)</span></div>
                      <div className="flex items-center gap-2"><div className="w-3 h-3 bg-red-600 rounded-full"></div> <span>تعارض مباشر (نفس الوقت)</span></div>
                  </div>

                  <div className="flex-1 overflow-y-auto p-6 bg-gray-100">
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                          {slots.map(slot => {
                              const currentFixingCode: string = fixingCourseCode || '';
                              const analysis = analyzeSlot(slot.id, currentFixingCode);
                              
                              return (
                                  <button
                                      key={slot.id}
                                      onClick={() => handleForceAssign(slot.id)}
                                      className={`
                                          relative p-4 rounded-lg border-2 text-right transition-all hover:scale-[1.02] hover:shadow-lg group
                                          flex flex-col justify-between min-h-[120px]
                                          ${analysis.severity === 'safe'
                                              ? 'bg-green-50 border-green-200 hover:border-green-500' 
                                              : analysis.severity === 'warning'
                                                  ? 'bg-yellow-50 border-yellow-200 hover:border-yellow-500' 
                                                  : 'bg-red-50 border-red-200 hover:border-red-500'
                                          }
                                      `}
                                  >
                                      <div>
                                          <div className="flex justify-between items-start mb-2">
                                              <span className="font-bold text-gray-800 text-sm">{slot.dateStr}</span>
                                              {analysis.severity === 'safe' ? <CheckCircle size={18} className="text-green-600"/> 
                                               : analysis.severity === 'warning' ? <BatteryWarning size={18} className="text-yellow-600"/>
                                               : <AlertOctagon size={18} className="text-red-500"/>
                                              }
                                          </div>
                                          <div className="text-xs text-gray-600 font-mono bg-white/50 inline-block px-2 py-1 rounded">
                                              {slot.timeLabel}
                                          </div>
                                      </div>
                                      
                                      <div className="mt-3">
                                          {analysis.valid ? (
                                              <span className="text-xs font-bold text-green-700 bg-green-100 px-2 py-1 rounded">متاح وآمن</span>
                                          ) : (
                                              <div className="space-y-1">
                                                  {analysis.issues.map((issue, idx) => (
                                                      <div key={idx} className={`text-[10px] px-2 py-0.5 rounded truncate font-bold flex items-center gap-1 ${
                                                          issue.type === 'conflict' ? 'bg-red-100 text-red-800' : 
                                                          issue.type === 'fatigue' ? 'bg-orange-100 text-orange-800' :
                                                          'bg-yellow-100 text-yellow-800'
                                                      }`}>
                                                          {issue.msg}
                                                      </div>
                                                  ))}
                                              </div>
                                          )}
                                          <div className="mt-2 text-xs text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity text-center font-bold">
                                              اضغط للتعيين هنا
                                          </div>
                                      </div>
                                  </button>
                              );
                          })}
                      </div>
                  </div>
              </div>
          </div>
      )}

      {/* Validation Result Modal */}
      {validationResult.isOpen && (
          <div className="fixed inset-0 bg-black/60 z-[80] flex items-center justify-center p-4">
              <div className="bg-white rounded-lg shadow-2xl w-full max-w-lg p-6">
                  <div className="flex items-center gap-3 mb-4">
                      {isSafe ? <CheckCircle size={32} className="text-green-600"/> : <AlertOctagon size={32} className="text-red-600"/>}
                      <h3 className="text-xl font-bold">{isSafe ? 'الجدول سليم وجاهز' : 'تنبيه: يوجد مشاكل في الجدول'}</h3>
                  </div>
                  
                  <div className="space-y-4 mb-6">
                      {isSafe ? (
                          <p className="text-gray-600">تم التحقق من جميع القواعد. لا توجد تعارضات مباشرة أو إرهاق للمتدربين.</p>
                      ) : (
                          <div className="bg-red-50 p-4 rounded border border-red-100 max-h-60 overflow-y-auto">
                              <ul className="space-y-2 text-sm text-red-800">
                                  {validationResult.unassigned > 0 && (
                                      <li className="font-bold">• هناك {validationResult.unassigned} مقرر لم يتم تعيين موعد له.</li>
                                  )}
                                  {validationResult.conflicts.map((c, i) => (
                                      <li key={i}>• {c.message}</li>
                                  ))}
                              </ul>
                          </div>
                      )}
                  </div>

                  <div className="flex justify-end gap-3">
                      <button 
                          onClick={() => setValidationResult({ ...validationResult, isOpen: false })}
                          className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded"
                      >
                          إلغاء
                      </button>
                      <button 
                          onClick={confirmSave}
                          className={`px-6 py-2 rounded text-white font-bold ${isSafe ? 'bg-green-600 hover:bg-green-700' : 'bg-red-600 hover:bg-red-700'}`}
                      >
                          {isSafe ? 'حفظ واعتماد الجدول' : 'حفظ رغم التحذيرات'}
                      </button>
                  </div>
              </div>
          </div>
      )}

      {showMatrixPrint && matrixPrintData && (
        <ReportEditorView
          scheduleData={matrixPrintData.scheduleData}
          periodHeaders={matrixPrintData.periodHeaders}
          customHeaderImage={null}
          initialFormat="A3"
          onClose={() => {
            setShowMatrixPrint(false);
            setMatrixPrintData(null);
          }}
          reportTitle="جدول الاختبارات النهائية الشامل والموحد — الكلية التقنية بأحد رفيدة"
          reportSubtitle="الفصل التدريبي الثاني ١٤٤٧ هـ / ٢٠٢٦ م"
        />
      )}
    </div>
  );
};

export default AiScheduleBuilder;
