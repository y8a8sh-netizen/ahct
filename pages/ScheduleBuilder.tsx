import React, { useState } from 'react';
import { Upload, CalendarDays, Play, Download, AlertCircle, CheckCircle, RefreshCcw, Printer, Grid, Trash2, Users, FileText } from 'lucide-react';
import { parseCSV } from '../utils/helpers';

interface InputFile {
  id: string;
  department: string;
  fileName: string;
  data: any[];
  rawContent: string;
  type: 'matrix' | 'list'; // Explicit type
}

interface CourseNode {
  code: string;
  name: string;
  department: string;
  students: Set<string>; // Student IDs (only available in List mode)
  conflicts: Set<string>; // Course Codes that conflict with this
  totalConflictWeight: number; // Sum of students in all intersections (Heuristic for sorting)
  assignedSlot: number | null; // 0 to (totalSlots - 1)
  studentCount: number;
}

interface TimeSlot {
  id: number;
  dayIndex: number;
  periodIndex: number;
  dateStr: string;
  timeStr: string;
}

const ScheduleBuilder: React.FC = () => {
  // 1. Settings State
  const [startDate, setStartDate] = useState('');
  const [examDays, setExamDays] = useState(10);
  const [periodsPerDay, setPeriodsPerDay] = useState(3);
  const [durationPerPeriod, setDurationPerPeriod] = useState(120);
  
  // 2. Data State
  const [files, setFiles] = useState<InputFile[]>([]);
  const [tempDeptName, setTempDeptName] = useState('');

  // 3. Algorithm Output State
  const [schedule, setSchedule] = useState<CourseNode[]>([]);
  const [generatedSlots, setGeneratedSlots] = useState<TimeSlot[]>([]);
  const [unassignedCourses, setUnassignedCourses] = useState<string[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processStep, setProcessStep] = useState(0); // 0: input, 1: processed

  const hasStudentData = files.some(f => f.type === 'list');

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!tempDeptName) {
        alert("الرجاء كتابة اسم القسم أولاً");
        e.target.value = '';
        return;
    }
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      const parsed = parseCSV(text);
      
      // Determine Type
      const isMatrix = text.includes('المقرر_') || text.includes('_المقرر') || (parsed.length > 0 && Object.keys(parsed[0]).some(k => k.includes('المقرر_')));
      
      const newFile: InputFile = {
          id: Date.now().toString(),
          department: tempDeptName,
          fileName: file.name,
          data: parsed,
          rawContent: text,
          type: isMatrix ? 'matrix' : 'list'
      };

      setFiles(prev => [...prev, newFile]);
      setTempDeptName(''); // Reset input
      e.target.value = ''; // Reset file input
    };
    reader.readAsText(file);
  };

  const removeFile = (id: string) => {
      setFiles(prev => prev.filter(f => f.id !== id));
  };

  const getDayDate = (start: Date, dayIndex: number): string => {
      const current = new Date(start);
      let daysAdded = 0;
      while (daysAdded < dayIndex) {
          current.setDate(current.getDate() + 1);
          const dayOfWeek = current.getDay();
          if (dayOfWeek !== 5 && dayOfWeek !== 6) {
              daysAdded++;
          }
      }
      while (current.getDay() === 5 || current.getDay() === 6) {
           current.setDate(current.getDate() + 1);
      }
      return current.toISOString().split('T')[0];
  };

  const getPeriodTime = (pIndex: number): string => {
      const times = [
          "08:00 - 10:00",
          "10:30 - 12:30",
          "13:00 - 15:00",
          "15:30 - 17:30"
      ];
      return times[pIndex] || `Period ${pIndex + 1}`;
  };

  const extractCourseInfo = (rawStr: string) => {
      if (!rawStr) return { code: '', name: '' };
      const parts = rawStr.split('-');
      if (parts.length > 1) {
          return { code: parts[0].trim(), name: parts[1].trim() };
      }
      return { code: rawStr.trim(), name: rawStr.trim() };
  };

  const runScheduler = () => {
      if (!startDate) { alert("الرجاء تحديد تاريخ البداية"); return; }
      if (files.length === 0) { alert("الرجاء رفع ملف واحد على الأقل"); return; }
      
      setIsProcessing(true);
      
      setTimeout(() => {
        const coursesMap = new Map<string, CourseNode>();
        
        files.forEach(file => {
            if (file.type === 'matrix') {
                // === MATRIX PARSING MODE ===
                const lines = file.rawContent.replace(/^\uFEFF/, '').split('\n');
                let headerIndices: Record<number, string> = {}; 
                let matrixStarted = false;

                lines.forEach((line) => {
                    const cleanLine = line.trim();
                    if (!cleanLine) return;

                    const cols = cleanLine.split(';').map(c => c.replace(/"/g, '').trim());

                    if (!matrixStarted && (cols[0].includes('المقرر_') || cols.length > 5)) {
                        cols.forEach((col, idx) => {
                            if (idx > 0 && col && col !== 'Value') { 
                                const { code, name } = extractCourseInfo(col);
                                if (code) {
                                    headerIndices[idx] = code;
                                    if (!coursesMap.has(code)) {
                                        coursesMap.set(code, {
                                            code, name, department: file.department,
                                            students: new Set(), conflicts: new Set(),
                                            totalConflictWeight: 0,
                                            assignedSlot: null, studentCount: 0
                                        });
                                    }
                                }
                            }
                        });
                        if (Object.keys(headerIndices).length > 0) matrixStarted = true;
                        return;
                    }

                    if (matrixStarted) {
                        const rowHeader = cols[0];
                        const { code: rowCode, name: rowName } = extractCourseInfo(rowHeader);
                        
                        if (rowCode && coursesMap.has(rowCode)) {
                            const rowCourse = coursesMap.get(rowCode)!;
                            cols.forEach((valStr, idx) => {
                                const val = parseInt(valStr);
                                const colCode = headerIndices[idx];

                                if (colCode && !isNaN(val) && val > 0) {
                                    if (rowCode === colCode) {
                                        rowCourse.studentCount = Math.max(rowCourse.studentCount, val);
                                    } else {
                                        rowCourse.conflicts.add(colCode);
                                        rowCourse.totalConflictWeight += val;
                                        
                                        const colCourse = coursesMap.get(colCode);
                                        if (colCourse) {
                                            colCourse.conflicts.add(rowCode);
                                        }
                                    }
                                }
                            });
                        }
                    }
                });

            } else {
                // === STUDENT LIST PARSING MODE ===
                file.data.forEach((row: any) => {
                    const normalizedRow: any = {};
                    Object.keys(row).forEach(key => {
                        normalizedRow[key.trim().toLowerCase()] = row[key];
                    });

                    const studentId = normalizedRow['studentid'] || normalizedRow['id'] || normalizedRow['رقم_تدريبي'] || normalizedRow['الرقم'];
                    const courseCode = normalizedRow['course'] || normalizedRow['code'] || normalizedRow['مقرر'] || normalizedRow['رمز'];
                    const courseName = normalizedRow['coursename'] || normalizedRow['name'] || normalizedRow['اسم'] || courseCode;

                    if (studentId && courseCode) {
                        if (!coursesMap.has(courseCode)) {
                            coursesMap.set(courseCode, {
                                code: courseCode,
                                name: courseName,
                                department: file.department,
                                students: new Set(),
                                conflicts: new Set(),
                                totalConflictWeight: 0,
                                assignedSlot: null,
                                studentCount: 0
                            });
                        }
                        const course = coursesMap.get(courseCode)!;
                        course.students.add(studentId);
                        course.studentCount = course.students.size;
                    }
                });

                const courses = Array.from(coursesMap.values());
                for (let i = 0; i < courses.length; i++) {
                    for (let j = i + 1; j < courses.length; j++) {
                        const c1 = courses[i];
                        const c2 = courses[j];
                        
                        let intersectionCount = 0;
                        if (c1.students.size < c2.students.size) {
                            for (const s of c1.students) {
                                if (c2.students.has(s)) intersectionCount++;
                            }
                        } else {
                            for (const s of c2.students) {
                                if (c1.students.has(s)) intersectionCount++;
                            }
                        }

                        if (intersectionCount > 0) {
                            c1.conflicts.add(c2.code);
                            c2.conflicts.add(c1.code);
                            c1.totalConflictWeight += intersectionCount;
                            c2.totalConflictWeight += intersectionCount;
                        }
                    }
                }
            }
        });

        if (coursesMap.size === 0) {
            alert(`خطأ: لم يتم العثور على مقررات أو طلاب في الملفات المرفقة.\n\nتأكد أن الملفات صحيحة.`);
            setIsProcessing(false);
            return;
        }

        const courses = Array.from(coursesMap.values());

        const start = new Date(startDate);
        const slots: TimeSlot[] = [];
        let slotCounter = 0;
        
        let currentDate = new Date(start);
        while (currentDate.getDay() === 5 || currentDate.getDay() === 6) {
            currentDate.setDate(currentDate.getDate() + 1);
        }

        for (let d = 0; d < examDays; d++) {
             const dateStr = currentDate.toISOString().split('T')[0];
             for (let p = 0; p < periodsPerDay; p++) {
                 slots.push({
                     id: slotCounter++,
                     dayIndex: d,
                     periodIndex: p,
                     dateStr: dateStr,
                     timeStr: getPeriodTime(p)
                 });
             }
             do {
                 currentDate.setDate(currentDate.getDate() + 1);
             } while (currentDate.getDay() === 5 || currentDate.getDay() === 6);
        }
        setGeneratedSlots(slots);

        courses.sort((a, b) => {
            if (b.totalConflictWeight !== a.totalConflictWeight) {
                return b.totalConflictWeight - a.totalConflictWeight;
            }
            return b.conflicts.size - a.conflicts.size;
        });

        const unassigned: string[] = [];

        courses.forEach(course => {
            let placed = false;

            for (const slot of slots) {
                let canPlace = true;

                // 1. Hard Conflict (Same Time)
                for (const conflictCode of course.conflicts) {
                    const conflictCourse = coursesMap.get(conflictCode);
                    if (conflictCourse && conflictCourse.assignedSlot === slot.id) {
                        canPlace = false;
                        break;
                    }
                }
                if (!canPlace) continue;

                // 2. Student Load (Max 2 per day) - ACTIVE if list provided
                if (course.students.size > 0) {
                    const studentsArray = Array.from(course.students);
                    for (const sid of studentsArray) {
                        let dailyExams = 0;
                        const slotsOnSameDate = slots.filter(s => s.dateStr === slot.dateStr).map(s => s.id);
                        
                        for (const c of courses) {
                            if (c.assignedSlot !== null && c.code !== course.code) {
                                 if (slotsOnSameDate.includes(c.assignedSlot)) {
                                     if (c.students.has(sid)) {
                                         dailyExams++;
                                     }
                                 }
                            }
                        }

                        if (dailyExams >= 2) {
                            canPlace = false; 
                            break;
                        }
                    }
                }

                if (canPlace) {
                    course.assignedSlot = slot.id;
                    placed = true;
                    break;
                }
            }

            if (!placed) {
                unassigned.push(course.code);
            }
        });

        setSchedule(courses);
        setUnassignedCourses(unassigned);
        setIsProcessing(false);
        setProcessStep(1);

      }, 500);
  };

  const handleExportCSV = () => {
    const headers = ["course", "courseName", "Time", "date", "ExamType", "Duration", "department"];
    const rows = schedule.filter(c => c.assignedSlot !== null).map(c => {
        const slot = generatedSlots.find(s => s.id === c.assignedSlot);
        return [
            c.code,
            c.name,
            slot?.timeStr || '',
            slot?.dateStr || '',
            'قاعة',
            durationPerPeriod,
            c.department
        ].map(v => `"${v}"`).join(';');
    });

    const csvContent = '\uFEFF' + headers.join(';') + '\n' + rows.join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', 'جدول_الاختبارات_المقترح.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handlePrintMatrix = () => {
      const dates = Array.from(new Set(generatedSlots.map(s => s.dateStr)));
      const times = Array.from(new Set(generatedSlots.map(s => s.timeStr)));
      
      const printWindow = window.open('', '_blank');
      if (!printWindow) return;

      let rowsHtml = '';
      dates.forEach(date => {
          let colsHtml = `<td class="header-col">${date}</td>`;
          times.forEach(time => {
              const slot = generatedSlots.find(s => s.dateStr === date && s.timeStr === time);
              let content = '';
              if (slot) {
                  const slotCourses = schedule.filter(c => c.assignedSlot === slot.id);
                  if (slotCourses.length > 0) {
                      slotCourses.forEach(c => {
                          content += `
                            <div class="course-box dept-${c.department === 'عام' ? 'general' : 'major'}">
                                <strong>${c.name}</strong>
                                <span class="code">${c.code}</span>
                                <span class="count">${c.studentCount} طالب</span>
                                <span class="dept">${c.department}</span>
                            </div>
                          `;
                      });
                  } else {
                      content = '<span class="empty">-</span>';
                  }
              }
              colsHtml += `<td>${content}</td>`;
          });
          rowsHtml += `<tr>${colsHtml}</tr>`;
      });

      const htmlContent = `
        <!DOCTYPE html>
        <html dir="rtl">
        <head>
          <title>الجدول المقترح</title>
          <link href="https://fonts.googleapis.com/css2?family=Tajawal:wght@400;700&display=swap" rel="stylesheet">
          <style>
            @page { size: A3 landscape; margin: 10mm; }
            body { font-family: 'Tajawal', sans-serif; -webkit-print-color-adjust: exact; padding: 20px; }
            table { width: 100%; border-collapse: collapse; margin-top: 20px; font-size: 11px; }
            th, td { border: 1px solid #000; padding: 5px; vertical-align: top; }
            th { background-color: #eee; text-align: center; }
            .header-col { background: #f9f9f9; font-weight: bold; width: 100px; text-align: center; vertical-align: middle; }
            .course-box { border: 1px solid #ccc; padding: 3px; margin-bottom: 3px; border-radius: 4px; background: #fff; display: flex; flex-direction: column; }
            .course-box strong { font-size: 11px; }
            .code { font-size: 10px; color: #555; }
            .count { font-size: 9px; background: #000; color: #fff; display: inline-block; width: fit-content; padding: 1px 4px; border-radius: 3px; margin-top: 2px; }
            .dept { font-size: 9px; color: #777; margin-top: 1px; }
            .empty { color: #ccc; }
            .dept-general { border-left: 4px solid #cba052; }
            .dept-major { border-left: 4px solid #006d5b; }
          </style>
        </head>
        <body>
          <h1 style="text-align:center; color:#006d5b">جدول الاختبارات المقترح (بناء آلي)</h1>
          <table>
            <thead>
                <tr>
                    <th>اليوم / التاريخ</th>
                    ${times.map(t => `<th>${t}</th>`).join('')}
                </tr>
            </thead>
            <tbody>
                ${rowsHtml}
            </tbody>
          </table>
          <script>window.onload = function() { window.print(); }</script>
        </body>
        </html>
      `;
      printWindow.document.write(htmlContent);
      printWindow.document.close();
  };

  return (
    <div className="space-y-6">
      <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
        <h2 className="text-2xl font-bold text-gray-800 flex items-center gap-2 mb-2">
            <CalendarDays size={28} className="text-tvtc-gold"/> بناء جدول الاختبارات الآلي
        </h2>
        <p className="text-gray-500 text-sm">
            أداة ذكية لبناء الجدول. قم برفع <b>ملفات سجل المتدربين</b> لتفعيل خاصية "عدم تجاوز اختبارين في اليوم"، أو ملفات المصفوفات لحساب التعارضات فقط.
        </p>
      </div>

      {processStep === 0 && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Settings */}
              <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-100 space-y-4">
                  <h3 className="font-bold text-lg border-b pb-2">1. إعدادات الوقت</h3>
                  
                  <div>
                      <label className="block text-sm font-medium mb-1">تاريخ بداية الاختبارات</label>
                      <input 
                        type="date" 
                        value={startDate} 
                        onChange={e => setStartDate(e.target.value)}
                        className="w-full border rounded p-2 bg-white"
                      />
                      <p className="text-xs text-gray-400 mt-1">سيتم تجاوز الجمعة والسبت تلقائياً</p>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-4">
                      <div>
                          <label className="block text-sm font-medium mb-1">عدد أيام الاختبارات</label>
                          <input 
                            type="number" 
                            value={examDays} 
                            onChange={e => setExamDays(parseInt(e.target.value))}
                            className="w-full border rounded p-2 bg-white"
                          />
                      </div>
                      <div>
                          <label className="block text-sm font-medium mb-1">الفترات في اليوم</label>
                          <input 
                            type="number" 
                            value={periodsPerDay} 
                            onChange={e => setPeriodsPerDay(parseInt(e.target.value))}
                            className="w-full border rounded p-2 bg-white"
                          />
                      </div>
                  </div>

                  <div>
                      <label className="block text-sm font-medium mb-1">مدة الفترة (دقيقة)</label>
                      <input 
                        type="number" 
                        value={durationPerPeriod} 
                        onChange={e => setDurationPerPeriod(parseInt(e.target.value))}
                        className="w-full border rounded p-2 bg-white"
                      />
                  </div>
              </div>

              {/* File Uploads */}
              <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-100 space-y-4">
                  <h3 className="font-bold text-lg border-b pb-2">2. ملفات البيانات</h3>
                  
                  {/* Status Banner */}
                  <div className={`p-4 rounded-lg border flex items-start gap-3 ${hasStudentData ? 'bg-green-50 border-green-200 text-green-800' : 'bg-amber-50 border-amber-200 text-amber-800'}`}>
                      {hasStudentData ? <CheckCircle className="mt-0.5" size={20}/> : <AlertCircle className="mt-0.5" size={20}/>}
                      <div>
                          <h4 className="font-bold text-sm">
                              {hasStudentData ? 'حماية الطالب مفعلة (Max 2 Exams/Day)' : 'حماية الطالب غير مفعلة'}
                          </h4>
                          <p className="text-xs opacity-90 mt-1">
                              {hasStudentData 
                                ? 'تم اكتشاف سجلات طلاب. سيقوم النظام بمنع وضع أكثر من اختبارين للطالب في نفس اليوم.' 
                                : 'النظام يعمل بوضع "المصفوفة" فقط (منع التعارض في نفس الوقت). لتمكين حماية الإرهاق، يرجى رفع ملف سجل المتدربين.'}
                          </p>
                      </div>
                  </div>

                  <div className="bg-blue-50 p-4 rounded border border-blue-100">
                      <div className="flex gap-2 mb-2">
                          <input 
                             type="text" 
                             placeholder="اسم القسم (مثلاً: حاسب، عام)" 
                             className="flex-1 border rounded p-2 text-sm bg-white"
                             value={tempDeptName}
                             onChange={e => setTempDeptName(e.target.value)}
                          />
                      </div>
                      <div className="relative">
                          <input 
                            type="file" 
                            accept=".csv" 
                            onChange={handleFileUpload}
                            className="block w-full text-sm text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-600 file:text-white hover:file:bg-blue-700"
                          />
                      </div>
                  </div>

                  <div className="space-y-2 max-h-48 overflow-y-auto">
                      {files.map(f => (
                          <div key={f.id} className="flex justify-between items-center bg-gray-50 p-2 rounded border">
                              <div className="text-sm flex items-center gap-2">
                                  {f.type === 'matrix' ? (
                                      <span className="text-[10px] bg-purple-100 text-purple-700 px-2 py-0.5 rounded font-bold flex items-center gap-1"><Grid size={10}/> مصفوفة</span>
                                  ) : (
                                      <span className="text-[10px] bg-green-100 text-green-700 px-2 py-0.5 rounded font-bold flex items-center gap-1"><Users size={10}/> سجل طلاب</span>
                                  )}
                                  <span className="font-bold text-tvtc-green">{f.department}</span>
                                  <span className="text-gray-400">|</span>
                                  <span className="truncate max-w-[150px]" title={f.fileName}>{f.fileName}</span>
                              </div>
                              <button onClick={() => removeFile(f.id)} className="text-red-500 hover:text-red-700 p-1"><Trash2 size={16}/></button>
                          </div>
                      ))}
                      {files.length === 0 && <p className="text-center text-sm text-gray-400 py-4">لم يتم رفع ملفات بعد</p>}
                  </div>
              </div>
          </div>
      )}

      {/* Action Button */}
      {processStep === 0 && (
          <div className="flex justify-end">
              <button 
                onClick={runScheduler}
                disabled={isProcessing}
                className="bg-tvtc-green text-white px-8 py-3 rounded-lg font-bold hover:bg-green-800 shadow-md flex items-center gap-2 disabled:opacity-50"
              >
                  {isProcessing ? 'جاري تحليل التعارضات وبناء الجدول...' : 'ابدأ بناء الجدول'} 
                  {!isProcessing && <Play size={20} />}
              </button>
          </div>
      )}

      {/* Results View */}
      {processStep === 1 && (
          <div className="space-y-6 animate-fade-in">
              <div className="flex items-center justify-between bg-white p-4 rounded border-l-4 border-tvtc-green shadow-sm">
                  <div>
                      <h3 className="font-bold text-lg text-green-800 flex items-center gap-2">
                          <CheckCircle size={20}/> تم بناء الجدول بنجاح
                      </h3>
                      <p className="text-sm text-gray-600">
                          تم توزيع {schedule.filter(c => c.assignedSlot !== null).length} مقرر دراسي على {generatedSlots.length} فترة زمنية.
                      </p>
                  </div>
                  <div className="flex gap-2">
                      <button onClick={handlePrintMatrix} className="bg-purple-600 text-white px-4 py-2 rounded flex items-center gap-2 text-sm hover:bg-purple-700">
                          <Grid size={16}/> طباعة شبكي
                      </button>
                      <button onClick={handleExportCSV} className="bg-blue-600 text-white px-4 py-2 rounded flex items-center gap-2 text-sm hover:bg-blue-700">
                          <Download size={16}/> تصدير CSV
                      </button>
                      <button onClick={() => setProcessStep(0)} className="bg-gray-200 text-gray-700 px-4 py-2 rounded flex items-center gap-2 text-sm hover:bg-gray-300">
                          <RefreshCcw size={16}/> إعادة بناء
                      </button>
                  </div>
              </div>

              {unassignedCourses.length > 0 && (
                  <div className="bg-red-50 border border-red-200 p-4 rounded">
                      <h4 className="font-bold text-red-800 flex items-center gap-2">
                          <AlertCircle size={18}/> تنبيه: مقررات لم يتم جدولتها ({unassignedCourses.length})
                      </h4>
                      <p className="text-sm text-red-700 mb-2">تعذر إيجاد وقت مناسب للمقررات التالية بسبب ضيق الوقت أو كثرة التعارضات:</p>
                      <div className="flex flex-wrap gap-2">
                          {unassignedCourses.map(code => (
                              <span key={code} className="bg-white border border-red-200 text-red-600 px-2 py-1 rounded text-xs font-mono">
                                  {code}
                              </span>
                          ))}
                      </div>
                      <p className="text-xs text-red-600 mt-2">الحل المقترح: قم بزيادة عدد أيام الاختبارات أو الفترات وأعد المحاولة.</p>
                  </div>
              )}

              {/* Preview Grid */}
              <div className="bg-white p-4 rounded shadow-sm overflow-x-auto">
                  <h4 className="font-bold mb-4">معاينة الجدول:</h4>
                  <table className="w-full text-center border-collapse text-sm">
                      <thead>
                          <tr className="bg-gray-100">
                              <th className="border p-2">اليوم / التاريخ</th>
                              {[...Array(periodsPerDay)].map((_, i) => (
                                  <th key={i} className="border p-2">{getPeriodTime(i)}</th>
                              ))}
                          </tr>
                      </thead>
                      <tbody>
                          {Array.from(new Set(generatedSlots.map(s => s.dateStr))).map(date => (
                              <tr key={date}>
                                  <td className="border p-2 font-bold bg-gray-50">{date}</td>
                                  {[...Array(periodsPerDay)].map((_, pIdx) => {
                                      const slot = generatedSlots.find(s => s.dateStr === date && s.periodIndex === pIdx);
                                      const coursesInSlot = slot ? schedule.filter(c => c.assignedSlot === slot.id) : [];
                                      
                                      return (
                                          <td key={pIdx} className="border p-2 align-top h-24 w-64">
                                              <div className="flex flex-col gap-1">
                                                  {coursesInSlot.map(c => (
                                                      <div key={c.code} className={`text-xs p-1 rounded border text-right ${c.department === 'عام' ? 'bg-yellow-50 border-yellow-200' : 'bg-green-50 border-green-200'}`}>
                                                          <div className="font-bold truncate">{c.name}</div>
                                                          <div className="flex justify-between text-[10px] text-gray-500">
                                                              <span>{c.code}</span>
                                                              <span>{c.studentCount} طالب</span>
                                                          </div>
                                                      </div>
                                                  ))}
                                              </div>
                                          </td>
                                      );
                                  })}
                              </tr>
                          ))}
                      </tbody>
                  </table>
              </div>
          </div>
      )}
    </div>
  );
};

export default ScheduleBuilder;