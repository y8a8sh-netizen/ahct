

import { Student, Exam, Committee, Conflict, Room, Proctor } from '../types';

// Convert date to Arabic day name
export const getArabicDayName = (dateString: string): string => {
  if (!dateString) return '';
  
  try {
    const arabicDays = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
    let date: Date;
    
    // Handle different date formats
    if (dateString.includes('-')) {
      // Format: YYYY-MM-DD or DD-MM-YYYY
      const parts = dateString.split('-');
      if (parts[0].length === 4) {
        // YYYY-MM-DD
        date = new Date(`${parts[0]}-${parts[1]}-${parts[2]}T00:00:00`);
      } else {
        // DD-MM-YYYY
        date = new Date(`${parts[2]}-${parts[1]}-${parts[0]}T00:00:00`);
      }
    } else if (dateString.includes('/')) {
      // Format: DD/MM/YYYY or YYYY/MM/DD
      const parts = dateString.split('/');
      if (parts[0].length === 4) {
        // YYYY/MM/DD
        date = new Date(`${parts[0]}-${parts[1]}-${parts[2]}T00:00:00`);
      } else {
        // DD/MM/YYYY
        date = new Date(`${parts[2]}-${parts[1]}-${parts[0]}T00:00:00`);
      }
    } else {
      return '';
    }
    
    // Check if date is valid
    if (isNaN(date.getTime())) {
      return '';
    }
    
    const dayIndex = date.getDay();
    return arabicDays[dayIndex];
  } catch {
    return '';
  }
};

export const parseCSV = (content: string): any[] => {
  // Remove BOM and trim whitespace
  const cleanContent = content.replace(/^\uFEFF/, '').trim();
  const lines = cleanContent.split('\n');
  if (lines.length < 2) return [];

  // Detect delimiter based on the first line: semicolon, comma, tab, or pipe
  const firstLine = lines[0];
  let delimiter = ';';
  if (firstLine.includes(';')) {
    delimiter = ';';
  } else if (firstLine.includes(',')) {
    delimiter = ',';
  } else if (firstLine.includes('\t')) {
    delimiter = '\t';
  } else if (firstLine.includes('|')) {
    delimiter = '|';
  }

  // Helper to process a line: split by delimiter and strip quotes
  const processLine = (line: string) => line.split(delimiter).map(val => val.trim().replace(/^"|"$/g, ''));

  const headers = processLine(firstLine);
  
  return lines.slice(1)
    .filter(line => line.trim() !== '') // Filter out empty lines
    .map(line => {
      const values = processLine(line);
      const obj: any = {};
      headers.forEach((header, index) => {
        // Assign value or empty string if undefined (prevents undefined issues later)
        obj[header] = values[index] || '';
      });
      return obj;
    });
};

// Robust Date Parser to handle various formats (YYYY-MM-DD, DD/MM/YYYY, DD-MM-YY)
export const parseAnyDate = (dateStr: string): Date | null => {
    if (!dateStr) return null;
    const cleanStr = String(dateStr).trim();
    
    // Check DD/MM/YYYY or DD-MM-YYYY or DD/MM/YY
    // Regex matches 1-2 digits (day), separator, 1-2 digits (month), separator, 2 or 4 digits (year)
    const ddmmyy = cleanStr.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
    if (ddmmyy) {
        const day = parseInt(ddmmyy[1], 10);
        const month = parseInt(ddmmyy[2], 10) - 1; // Months are 0-indexed in JS
        let year = parseInt(ddmmyy[3], 10);
        if (year < 100) year += 2000; // Assume 20xx for 2 digits
        
        // Set to noon (12:00) to avoid timezone shifts affecting the date
        const d = new Date(year, month, day, 12, 0, 0); 
        return isNaN(d.getTime()) ? null : d;
    }

    // Try Standard ISO (YYYY-MM-DD)
    const d = new Date(cleanStr.includes('T') ? cleanStr : `${cleanStr}T12:00:00`);
    if (!isNaN(d.getTime())) return d;

    // Last resort simple parse
    const d2 = new Date(cleanStr);
    return isNaN(d2.getTime()) ? null : d2;
};

export const getDualDate = (dateStr: string): { greg: string, hijri: string, dayName: string } => {
    const date = parseAnyDate(dateStr);
    
    // If parsing fails, return original string as Gregorian and empty for others
    if (!date) return { greg: dateStr, hijri: '', dayName: '' };

    // Format Gregorian as DD/MM/YYYY
    const greg = date.toLocaleDateString('en-GB'); 

    // Format Hijri (Umm Al-Qura)
    const hijri = new Intl.DateTimeFormat('ar-SA-u-ca-islamic-umalqura', {
        day: 'numeric',
        month: 'numeric',
        year: 'numeric'
    }).format(date);
    
    const dayName = date.toLocaleDateString('ar-SA', { weekday: 'long' });

    return { greg, hijri: hijri + ' هـ', dayName };
};

export const validateSchedule = (
  committees: Committee[],
  students: Student[],
  exams: Exam[],
  rooms: Room[],
  proctors: Proctor[]
): Conflict[] => {
  const conflicts: Conflict[] = [];

  // 1. Student Constraints
  const studentSchedules: Record<string, { date: string; time: string; duration: number }[]> = {};

  // Build schedule map
  committees.forEach(comm => {
    // Find exam by code AND specialization to handle duplicate codes correctly
    let exam = exams.find(e => e.courseCode === comm.examCode && e.specialization === comm.specialization);
    if (!exam) {
        // Fallback for backward compatibility or missing spec
        exam = exams.find(e => e.courseCode === comm.examCode);
    }
    if (!exam) return;

    comm.studentIds.forEach(sid => {
      if (!studentSchedules[sid]) studentSchedules[sid] = [];
      studentSchedules[sid].push({
        date: exam!.date,
        time: exam!.time,
        duration: exam!.duration
      });
    });
  });

  // Check Student Rules
  Object.keys(studentSchedules).forEach(sid => {
    const schedule = studentSchedules[sid];
    
    // Check conflicts (same time)
    for (let i = 0; i < schedule.length; i++) {
      for (let j = i + 1; j < schedule.length; j++) {
        const e1 = schedule[i];
        const e2 = schedule[j];
        if (e1.date === e2.date && e1.time === e2.time) {
           conflicts.push({
             type: 'StudentSchedule',
             message: `تعارض وقت: المتدرب برقم (${sid}) لديه اختبارين في نفس الوقت (${e1.time}) بتاريخ ${e1.date}`,
             severity: 'Error'
           });
        }
      }
    }

    // Check max 2 exams per day
    const examsPerDay: Record<string, number> = {};
    schedule.forEach(s => {
      examsPerDay[s.date] = (examsPerDay[s.date] || 0) + 1;
    });

    Object.entries(examsPerDay).forEach(([date, count]) => {
      if (count > 2) {
        conflicts.push({
          type: 'StudentSchedule',
          message: `إرهاق يومي: المتدرب برقم (${sid}) لديه أكثر من اختبارين (${count}) في يوم ${date}`,
          severity: 'Error'
        });
      }
    });
  });

  // 2. Capacity Constraints
  committees.forEach(comm => {
    const room = rooms.find(r => r.id === comm.roomId);
    if (room && comm.studentIds.length > room.capacity) {
      conflicts.push({
        type: 'Capacity',
        message: `اللجنة في ${room.name} تتجاوز السعة المسموحة (${comm.studentIds.length}/${room.capacity})`,
        severity: 'Error'
      });
    }

    // Check Room Type vs Exam Type (Strict)
    let exam = exams.find(e => e.courseCode === comm.examCode && e.specialization === comm.specialization);
    if (!exam) exam = exams.find(e => e.courseCode === comm.examCode);

    if (exam && room) {
        if (exam.type === 'Blackboard' && room.type !== 'Lab') {
            conflicts.push({
                type: 'Capacity',
                message: `الاختبار ${exam.courseName} يتطلب معمل (Blackboard) ولكن تم تعيينه في قاعة عادية (${room.name})`,
                severity: 'Error'
            });
        }
        if (exam.type === 'Paper' && room.type !== 'Hall') {
            conflicts.push({
                type: 'Capacity',
                message: `الاختبار ${exam.courseName} يتطلب قاعة (ورقي) ولكن تم تعيينه في معمل (${room.name})`,
                severity: 'Error'
            });
        }
    }
  });

  // 3. Proctor Constraints
  const proctorSchedule: Record<string, { key: string; roomId: string }[]> = {}; // pid -> list of {key: "date-time", roomId}
  committees.forEach(comm => {
      let exam = exams.find(e => e.courseCode === comm.examCode && e.specialization === comm.specialization);
      if (!exam) exam = exams.find(e => e.courseCode === comm.examCode);

      if(!exam) return;
      const key = `${exam.date}-${exam.time}`;

      comm.proctorIds.forEach(pid => {
          if (!proctorSchedule[pid]) proctorSchedule[pid] = [];
          const existingAssignments = proctorSchedule[pid].filter(assignment => assignment.key === key);

          // Allow multiple assignments in same time if they are in the same room (multi-committee room)
          const hasConflict = existingAssignments.some(assignment => assignment.roomId !== comm.roomId);

          if (hasConflict) {
              const pName = proctors.find(p => p.id === pid)?.name || pid;
              conflicts.push({
                  type: 'ProctorSchedule',
                  message: `المراقب ${pName} معين في أكثر من لجنة في نفس التوقيت (${key}) ولكن في أماكن مختلفة`,
                  severity: 'Error'
              });
          }
          proctorSchedule[pid].push({ key, roomId: comm.roomId });
      });
  });

  return conflicts;
};
