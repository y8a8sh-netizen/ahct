

import React, { useState } from 'react';
import { Upload, AlertCircle, CheckCircle, Play, PieChart, Activity, Trash2, Edit, Plus, X, Save, Download, Printer, Grid, FileDown, UserCheck, Share2, Smartphone, FileCheck } from 'lucide-react';
import { parseCSV, validateSchedule, getDualDate, parseAnyDate } from '../utils/helpers';
import { getAiAdvice } from '../services/geminiService';
import { Student, Exam, Room, Proctor, Committee, Conflict } from '../types';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

interface ManagerDashboardProps {
  data: {
    students: Student[];
    exams: Exam[];
    rooms: Room[];
    proctors: Proctor[];
    committees: Committee[];
  };
  setData: React.Dispatch<React.SetStateAction<any>>;
  currentUser: { id: string; name: string; role: string; readOnly: boolean };
  initialSection?: 'upload' | 'create' | 'reports' | 'manage-students';
}

const ManagerDashboard: React.FC<ManagerDashboardProps> = ({ data, setData, currentUser, initialSection = 'upload' }) => {
  const isReadOnly = currentUser.readOnly;
  const [activeSection, setActiveSection] = useState<'upload' | 'create' | 'reports' | 'manage-students'>(initialSection);
  const [aiAdvice, setAiAdvice] = useState<string>('');
  const [loadingAi, setLoadingAi] = useState(false);
  const [validationErrors, setValidationErrors] = useState<Conflict[]>([]);
  const [executionStatus, setExecutionStatus] = useState<'idle' | 'success' | 'failed'>('idle');
  const [showShareModal, setShowShareModal] = useState(false);

  // File Upload Preview State
  const [showPreview, setShowPreview] = useState(false);
  const [previewData, setPreviewData] = useState<any>(null);
  const [previewType, setPreviewType] = useState<string>('');

  // Room Management State
  const [isRoomModalOpen, setIsRoomModalOpen] = useState(false);
  const [currentRoom, setCurrentRoom] = useState<Partial<Room>>({ name: '', type: 'Hall', capacity: 30 });
  const [isEditingRoom, setIsEditingRoom] = useState(false);

  // Committee Management State
  const [isCommitteeModalOpen, setIsCommitteeModalOpen] = useState(false);
  const [editingCommittee, setEditingCommittee] = useState<Committee | null>(null);

  // Master Schedule State
  const [showMasterSchedule, setShowMasterSchedule] = useState(false);

  // Student Management State (NEW)
  const [isAddStudentModalOpen, setIsAddStudentModalOpen] = useState(false);
  const [isDeleteStudentModalOpen, setIsDeleteStudentModalOpen] = useState(false);
  const [studentMode, setStudentMode] = useState<'existing' | 'new'>('existing');
  const [searchStudentId, setSearchStudentId] = useState('');
  const [searchedStudents, setSearchedStudents] = useState<Student[]>([]);
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);
  
  const [newStudentData, setNewStudentData] = useState({
    id: '',
    name: '',
    specialization: '',
    courseCodes: [] as string[]
  });
  const [selectedCourse, setSelectedCourse] = useState('');
  const [selectedCommitteeId, setSelectedCommitteeId] = useState('');
  const [previewData_Student, setPreviewData_Student] = useState<{student: Student, committee: Committee, exam: Exam, room: Room | undefined} | null>(null);
  const [deleteConfirmation, setDeleteConfirmation] = useState<{student: Student, committee: Committee} | null>(null);
  const [deleteExamKey, setDeleteExamKey] = useState('');
  const [deleteCommitteeId, setDeleteCommitteeId] = useState('');
  const [deleteError, setDeleteError] = useState('');

  const selectedDeleteExam = data.exams.find(
    exam => `${exam.courseCode}:::${exam.specialization}` === deleteExamKey
  ) || null;
  const deleteCommitteesByExam = selectedDeleteExam
    ? data.committees.filter(c => c.examCode === selectedDeleteExam.courseCode && c.specialization === selectedDeleteExam.specialization)
    : [];
  const selectedDeleteCommittee = data.committees.find(c => c.id === deleteCommitteeId) || null;
  const deleteStudents = selectedDeleteCommittee
    ? selectedDeleteCommittee.studentIds.map(id => data.students.find(s => s.id === id)).filter((s): s is Student => Boolean(s))
    : [];

  // CSV Handlers
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>, type: string) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Capture the input element to reset it later
    const inputElement = e.target;

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      const parsed = parseCSV(text);
      
      // Always clear committees when uploading new base data to avoid inconsistencies
      let newData: any = { committees: [] };

      if (type === 'exams') {
          // Deduplicate Exams based on Course Code AND Specialization to allow same code for diff specs
          const uniqueExamsMap = new Map<string, Exam>();

          parsed.forEach((row: any) => {
              // Determine Type strictly from ExamType column
              const rawType = String(row['ExamType'] || row['Type'] || row['نوع'] || '').trim();
              const isLab = rawType.includes('معمل') || rawType.toLowerCase().includes('blackboard') || rawType.toLowerCase().includes('lab');
              
              const code = String(row['course'] || row['Code'] || row['مقرر'] || '').trim();
              const specialization = String(row['specialization'] || row['Specialization'] || row['التخصص'] || 'جميع التخصصات').trim();

              // Unique key is Code + Specialization
              const uniqueKey = `${code}|${specialization}`;

              if (code && !uniqueExamsMap.has(uniqueKey)) {
                  uniqueExamsMap.set(uniqueKey, {
                    courseCode: code,
                    courseName: row['courseName'] || row['Name'] || row['اسم_المقرر'] || '',
                    date: row['date'] || row['Date'] || row['تاريخ'] || '',
                    time: row['Time'] || row['time'] || row['وقت'] || '',
                    duration: parseInt(row['Duration'] || row['مدة'] || '120'),
                    type: isLab ? 'Blackboard' : 'Paper',
                    department: row['department'] || row['Department'] || row['القسم'] || 'عام',
                    specialization: specialization
                  });
              }
          });

          newData.exams = Array.from(uniqueExamsMap.values());
          
      } else if (type === 'students') {
           // Aggregate students (enrollment list -> student object)
           const studentsMap = new Map();
           
           // Use existing exams to filter registration if available
           const availableExams = data.exams;

           parsed.forEach((row: any) => {
               const id = row['studentId'] || row['ID'] || row['رقم_تدريبي'] || row['student_id'];
               if (!id) return;
               
               // Extract Specialization
               const studentSpec = (row['specialization'] || row['Specialization'] || row['التخصص'] || 'عام').trim();

               if (!studentsMap.has(id)) {
                   studentsMap.set(id, {
                       id: id,
                       name: row['StudentName'] || row['Name'] || row['اسم'] || '',
                       specialization: studentSpec,
                       courseCodes: []
                   });
               }
               
               const student = studentsMap.get(id);
               const course = row['course'] || row['Code'] || row['مقرر'];
               
               if (course) {
                   const cleanCourse = course.trim();
                   
                   // LOGIC: Check Specialization Matching
                   let allowRegistration = true;
                   
                   if (availableExams.length > 0) {
                       const matchingExams = availableExams.filter((e: Exam) => e.courseCode === cleanCourse);
                       
                       if (matchingExams.length > 0) {
                           const hasMatchingSpec = matchingExams.some((exam: Exam) => {
                               const examSpec = (exam.specialization || '').trim();
                               const isGlobal = 
                                   examSpec === 'جميع التخصصات' || 
                                   examSpec === 'عام' || 
                                   examSpec.toLowerCase() === 'all' || 
                                   examSpec.toLowerCase() === 'general';
                               
                               return isGlobal || examSpec === studentSpec;
                           });
                           
                           if (!hasMatchingSpec) {
                               allowRegistration = false;
                           }
                       }
                   }

                   if (allowRegistration && !student.courseCodes.includes(cleanCourse)) {
                       student.courseCodes.push(cleanCourse);
                   }
               }
           });

           const cleanedStudents = Array.from(studentsMap.values()).map((s: any) => ({
               ...s,
               courseCodes: [...new Set(s.courseCodes)]
           }));

           newData.students = cleanedStudents;
      } else if (type === 'rooms') {
          newData.rooms = parsed.map((row: any, idx: number) => {
              const name = row['Location'] || row['Name'] || row['القاعة'] || `Room ${idx + 1}`;
              return {
                id: `room-${idx}`,
                name: name,
                type: (String(row['Type'] || row['نوع'] || '').includes('معمل') || name.includes('معمل')) ? 'Lab' : 'Hall',
                capacity: parseInt(row['capacity'] || row['Capacity'] || row['سعة'] || '30')
              };
          }).filter((r: any) => r.name);
      } else if (type === 'proctors') {
          newData.proctors = parsed.map((row: any, idx: number) => ({
              id: row['TeacherId'] || `proctor-${idx}`,
              name: row['Teacher'] || row['Name'] || row['اسم_المراقب'] || `Proctor ${idx + 1}`,
              department: row['department'] || row['Department'] || row['القسم'] || 'عام'
          })).filter((p: any) => p.name);
      }
      
      // Instead of direct update, set Preview
      setPreviewData(newData);
      setPreviewType(type);
      setShowPreview(true);

      // Reset the file input
      inputElement.value = '';
    };
    reader.readAsText(file);
  };

  const handleConfirmUpload = () => {
    if (previewData) {
        setData((prev: any) => ({ ...prev, ...previewData }));
        setShowPreview(false);
        setPreviewData(null);
        // Hint for user
        setTimeout(() => alert('تم استيراد البيانات بنجاح. يمكنك الآن الانتقال لخطوة توزيع اللجان.'), 300);
    }
  };

  const getDataCount = (data: any) => {
    if (!data) return 0;
    if (previewType === 'exams') return data.exams?.length || 0;
    if (previewType === 'students') return data.students?.length || 0;
    if (previewType === 'rooms') return data.rooms?.length || 0;
    if (previewType === 'proctors') return data.proctors?.length || 0;
    return 0;
  };

  const renderPreviewRows = () => {
    if (!previewData) return null;
    let rows: any[] = [];
    
    if (previewType === 'exams') rows = previewData.exams;
    else if (previewType === 'students') rows = previewData.students;
    else if (previewType === 'rooms') rows = previewData.rooms;
    else if (previewType === 'proctors') rows = previewData.proctors;

    if (!rows) return null;

    return rows.slice(0, 5).map((row: any, idx: number) => (
        <tr key={idx} className="border-b">
            {previewType === 'exams' && (
                <>
                    <td className="p-2 border">{row.courseCode}</td>
                    <td className="p-2 border">{row.courseName}</td>
                    <td className="p-2 border">{row.date}</td>
                    <td className="p-2 border">{row.time}</td>
                    <td className="p-2 border">{row.type === 'Blackboard' ? 'معمل' : 'قاعة'}</td>
                </>
            )}
            {previewType === 'students' && (
                <>
                    <td className="p-2 border">{row.id}</td>
                    <td className="p-2 border">{row.name}</td>
                    <td className="p-2 border">{row.specialization}</td>
                    <td className="p-2 border">{row.courseCodes.length}</td>
                </>
            )}
            {previewType === 'rooms' && (
                <>
                    <td className="p-2 border">{row.name}</td>
                    <td className="p-2 border">{row.type === 'Lab' ? 'معمل' : 'قاعة'}</td>
                    <td className="p-2 border">{row.capacity}</td>
                </>
            )}
            {previewType === 'proctors' && (
                <>
                    <td className="p-2 border">{row.id}</td>
                    <td className="p-2 border">{row.name}</td>
                    <td className="p-2 border">{row.department}</td>
                </>
            )}
        </tr>
    ));
  };

  const renderPreviewHeader = () => {
      let headers: string[] = [];
      if (previewType === 'exams') headers = ['رمز المقرر', 'اسم المقرر', 'التاريخ', 'الوقت', 'النوع'];
      else if (previewType === 'students') headers = ['الرقم التدريبي', 'الاسم', 'التخصص', 'عدد المقررات'];
      else if (previewType === 'rooms') headers = ['اسم القاعة', 'النوع', 'السعة'];
      else if (previewType === 'proctors') headers = ['الرقم الوظيفي', 'الاسم', 'القسم'];

      return (
          <tr>
              {headers.map((h, i) => <th key={i} className="p-2 border">{h}</th>)}
          </tr>
      );
  };

  const handleDownloadTemplate = (type: string) => {
    let headers = '';
    let sample = '';
    let filename = '';

    // Use semicolon for better compatibility with provided files
    switch (type) {
        case 'exams':
            headers = 'course;courseName;Time;date;ExamType;Duration;department;specialization';
            sample = 'CS101;حاسب آلي;08:00 - 10:00;28/12/2025;معمل;120;الحاسب وتقنية المعلومات;تقنية شبكات الحاسب\nMATH101;رياضيات;10:30 - 12:30;29/12/2025;قاعة;120;الدراسات العامة;جميع التخصصات';
            filename = 'template_exams.csv';
            break;
        case 'students':
            headers = 'studentId;StudentName;specialization;course;courseName';
            sample = '44110011;أحمد علي;تقنية شبكات الحاسب;CS101;حاسب آلي\n44110011;أحمد علي;تقنية شبكات الحاسب;MATH101;رياضيات\n44220022;خالد سامي;تقنية الموارد البشرية;CS102;برمجة 1';
            filename = 'template_students.csv';
            break;
        case 'rooms':
            headers = 'Location;capacity;Type';
            sample = 'معمل 1;25;معمل\nقاعة 101;40;قاعة';
            filename = 'template_rooms.csv';
            break;
        case 'proctors':
            headers = 'Teacher;TeacherId;department';
            sample = 'أ. محمد الأسمري;1001;الحاسب وتقنية المعلومات\nم. سعيد القحطاني;1002;تقنية الاعمال';
            filename = 'template_proctors.csv';
            break;
    }

    const csvContent = '\uFEFF' + headers + '\n' + sample;
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleResetSystem = () => {
    if (window.confirm('⚠️ تحذير شديد:\n\nهل أنت متأكد من رغبتك في تصفير النظام بالكامل؟\nسيتم حذف جميع بيانات المتدربين والاختبارات والجداول واللجان نهائياً.\n\nلا يمكن التراجع عن هذا الإجراء.')) {
      if (window.confirm('تأكيد نهائي:\nهل أنت متأكد من الحذف؟')) {
         const emptyState = {
            students: [],
            exams: [],
            rooms: [],
            proctors: [],
            committees: []
         };
         setData(emptyState);
         setTimeout(() => {
             alert('تم تصفير النظام بنجاح.');
         }, 500);
      }
    }
  };

  const openAddRoomModal = () => {
    setCurrentRoom({ name: '', type: 'Hall', capacity: 30 });
    setIsEditingRoom(false);
    setIsRoomModalOpen(true);
  };

  const openEditRoomModal = (room: Room) => {
    setCurrentRoom(room);
    setIsEditingRoom(true);
    setIsRoomModalOpen(true);
  };

  const handleDeleteRoom = (id: string) => {
    if (window.confirm('هل أنت متأكد من حذف هذه القاعة؟')) {
      setData((prev: any) => ({
        ...prev,
        rooms: prev.rooms.filter((r: Room) => r.id !== id)
      }));
    }
  };

  const handleSaveRoom = () => {
    if (!currentRoom.name || !currentRoom.capacity) {
      alert('الرجاء تعبئة جميع الحقول المطلوبة');
      return;
    }

    if (isEditingRoom) {
      setData((prev: any) => ({
        ...prev,
        rooms: prev.rooms.map((r: Room) => r.id === currentRoom.id ? currentRoom : r)
      }));
    } else {
      const newRoom = {
        ...currentRoom,
        id: `room-${Date.now()}`
      } as Room;
      setData((prev: any) => ({
        ...prev,
        rooms: [...prev.rooms, newRoom]
      }));
    }
    setIsRoomModalOpen(false);
  };

  const openEditCommitteeModal = (committee: Committee) => {
    setEditingCommittee({ ...committee });
    setIsCommitteeModalOpen(true);
  };

  const handleSaveCommittee = () => {
    if (!editingCommittee) return;
    setData((prev: any) => ({
      ...prev,
      committees: prev.committees.map((c: Committee) => 
        c.id === editingCommittee.id ? editingCommittee : c
      )
    }));
    setIsCommitteeModalOpen(false);
    setEditingCommittee(null);
  };

  const generateCommittees = () => {
    if (data.proctors.length < 2) {
        alert("تنبيه: عدد المراقبين قليل جداً. النظام يحتاج إلى مراقبين اثنين على الأقل لكل لجنة.");
    }

    const proctorLoad: Record<string, number> = {};
    data.proctors.forEach(p => proctorLoad[p.id] = 0);

    const proctorScheduleMap: Record<string, Record<string, Set<string>>> = {};
    data.proctors.forEach(p => proctorScheduleMap[p.id] = {});

    const getTimeValue = (timeStr: string) => {
        const start = timeStr.split('-')[0].trim();
        const [h, m] = start.split(':').map(Number);
        return h * 60 + m;
    };

    const busyProctors: Record<string, Set<string>> = {};
    // تتبع مجموع المتدربين في كل قاعة لكل فترة
    const roomUsage: Record<string, Record<string, number>> = {}; // key: `${date}-${time}` => { [room.id]: usedCount }
    // ثبّت المراقبين لكل قاعة وفترة على مستوى جميع اللجان
    const proctorsPerRoomSlot: Record<string, string[]> = {};
    const proctorLoadCounted: Record<string, Set<string>> = {}; // key: `${timeSlotKey}-${room.id}` => Set<proctorId>
    const newCommittees: Committee[] = [];
    let committeeIdCounter = 1;

    // Use robust date comparison for sorting exams
    const sortedExams = [...data.exams].sort((a, b) => {
      const dateA = parseAnyDate(a.date);
      const dateB = parseAnyDate(b.date);
      if (dateA && dateB) {
          const diff = dateA.getTime() - dateB.getTime();
          if (diff !== 0) return diff;
      }
      return getTimeValue(a.time) - getTimeValue(b.time);
    });

    sortedExams.forEach(exam => {
        // FILTER STUDENTS MATCHING THIS EXAM'S SPECIALIZATION
        const eligibleStudents = data.students.filter(s => {
            const hasCourse = s.courseCodes.includes(exam.courseCode);
            if (!hasCourse) return false;

            // Check Specialization:
            const examSpec = (exam.specialization || '').trim();
            const isGlobal = examSpec === 'جميع التخصصات' || examSpec === 'عام' || examSpec.toLowerCase() === 'all';

            if (isGlobal) return true;
            return s.specialization === examSpec;
        });

        if (eligibleStudents.length === 0) return;

        const timeSlotKey = `${exam.date}-${exam.time}`;
        if (!busyProctors[timeSlotKey]) {
            busyProctors[timeSlotKey] = new Set();
        }
        if (!roomUsage[timeSlotKey]) {
            roomUsage[timeSlotKey] = {};
        }

        const requiredRoomType = exam.type === 'Blackboard' ? 'Lab' : 'Hall';
        // القاعات التي فيها سعة متبقية في هذه الفترة
        let availableRooms = data.rooms.filter(r => r.type === requiredRoomType && ((roomUsage[timeSlotKey][r.id] || 0) < r.capacity));
        availableRooms.sort((a, b) => b.capacity - a.capacity);

        if (availableRooms.length === 0) return;

        // توزيع بحيث يتم ملء القاعات بالكامل أولاً، وإنشاء لجان إضافية للزائدين
        let studentsLeft = [...eligibleStudents];
        for (const room of availableRooms) {
            let used = roomUsage[timeSlotKey][room.id] || 0;
            let free = room.capacity - used;
            while (free > 0 && studentsLeft.length > 0) {
                // أنشئ لجنة جديدة أو أضف للّجنة الحالية حتى تمتلئ القاعة
                let assignCount = Math.min(free, studentsLeft.length);
                const assignedStudents = studentsLeft.slice(0, assignCount);
                studentsLeft = studentsLeft.slice(assignCount);
                used += assignCount;
                free = room.capacity - used;
                roomUsage[timeSlotKey][room.id] = used;
                // استخدم نفس المراقبين لجميع اللجان في هذه القاعة والفترة (بغض النظر عن المقرر)
                const proctorKey = `${timeSlotKey}-${room.id}`;
                let assignedIds = proctorsPerRoomSlot[proctorKey];
                if (!assignedIds) {
                    // أول لجنة في هذه القاعة والفترة: اختر المراقبين
                    const examTimeVal = getTimeValue(exam.time);
                    const proctorScores = data.proctors.map(p => {
                        if (busyProctors[timeSlotKey].has(p.id)) return { p, score: -99999 };
                        let score = 1000;
                        const schedule = proctorScheduleMap[p.id];
                        const workingToday = schedule[exam.date] && schedule[exam.date].size > 0;
                        const totalWorkingDays = Object.keys(schedule).length;
                        const dailyLoad = workingToday ? schedule[exam.date].size : 0;
                        if (workingToday) {
                            score += 500; 
                            let hasAdjacent = false;
                            schedule[exam.date].forEach(existingTime => {
                                const existingVal = getTimeValue(existingTime);
                                const diff = Math.abs(existingVal - examTimeVal);
                                if (diff > 60 && diff < 150) hasAdjacent = true;
                            });
                            if (hasAdjacent) score += 50;
                            if (dailyLoad >= 3) score -= 600; 
                        } else {
                            if (totalWorkingDays > 0) score -= 200; 
                        }
                        score -= (proctorLoad[p.id] * 5);
                        // أولوية للمراقب من نفس القسم (إذا كان قسم المراقب يطابق قسم المقرر)
                        if (p.department && exam.department && p.department.trim() === exam.department.trim()) {
                            score += 120; // يمكن تعديل القيمة حسب قوة الأولوية المطلوبة
                        }
                        return { p, score };
                    });
                    proctorScores.sort((a, b) => b.score - a.score);
                    assignedIds = proctorScores.slice(0, 2).map(item => item.p.id);
                    proctorsPerRoomSlot[proctorKey] = assignedIds;
                    assignedIds.forEach(id => {
                        if (!proctorLoadCounted[proctorKey]) proctorLoadCounted[proctorKey] = new Set();
                        if (!proctorLoadCounted[proctorKey].has(id)) {
                            proctorLoad[id]++;
                            proctorLoadCounted[proctorKey].add(id);
                        }
                        busyProctors[timeSlotKey].add(id);
                        if (!proctorScheduleMap[id][exam.date]) proctorScheduleMap[id][exam.date] = new Set();
                        proctorScheduleMap[id][exam.date].add(exam.time);
                    });
                }
                newCommittees.push({
                    id: `C-${committeeIdCounter++}`,
                    examCode: exam.courseCode,
                    specialization: exam.specialization,
                    roomId: room.id,
                    proctorIds: assignedIds,
                    studentIds: assignedStudents.map(s => s.id)
                });
            }
            if (studentsLeft.length === 0) break;
        }
    });

    setData((prev: any) => ({ ...prev, committees: newCommittees }));
  };

  const handleAiAdvice = async () => {
    setLoadingAi(true);
    const advice = await getAiAdvice(data);
    setAiAdvice(advice);
    setLoadingAi(false);
  };

  const executeAndValidate = () => {
    const errors = validateSchedule(data.committees, data.students, data.exams, data.rooms, data.proctors);
    setValidationErrors(errors);
    if (errors.filter(e => e.severity === 'Error').length === 0) {
        setExecutionStatus('success');
    } else {
        setExecutionStatus('failed');
    }
  };

  const handleExportSchedule = () => {
    if (data.committees.length === 0) {
      alert("لا توجد بيانات لجان لتصديرها.");
      return;
    }
    const headers = ["رقم اللجنة","القسم","التخصص","رمز المقرر","اسم المقرر","التاريخ","الوقت","مدة الاختبار","اسم القاعة/المعمل","نوع القاعة","المراقب 1","المراقب 2","عدد المتدربين"];
    const escapeCsv = (val: any) => `"${String(val || '').replace(/"/g, '""')}"`;
    const rows = data.committees.map(comm => {
      let exam = data.exams.find(e => e.courseCode === comm.examCode && e.specialization === comm.specialization);
      if (!exam) exam = data.exams.find(e => e.courseCode === comm.examCode);

      const room = data.rooms.find(r => r.id === comm.roomId);
      const p1 = data.proctors.find(p => p.id === comm.proctorIds[0]);
      const p2 = data.proctors.find(p => p.id === comm.proctorIds[1]);
      return [
        escapeCsv(comm.id), escapeCsv(exam?.department || 'عام'), escapeCsv(exam?.specialization || 'عام'), escapeCsv(exam?.courseCode),
        escapeCsv(exam?.courseName), escapeCsv(exam?.date), escapeCsv(exam?.time),
        escapeCsv(exam?.duration), escapeCsv(room?.name), escapeCsv(room?.type === 'Lab' ? 'معمل' : 'قاعة'),
        escapeCsv(p1?.name || '---'), escapeCsv(p2?.name || '---'), escapeCsv(comm.studentIds.length)
      ].join(',');
    });
    const csvContent = '\uFEFF' + [headers.join(','), ...rows].join('\n');
    const link = document.createElement('a');
    link.href = URL.createObjectURL(new Blob([csvContent], { type: 'text/csv;charset=utf-8;' }));
    link.setAttribute('download', 'جدول_الاختبارات_الشامل.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleExportStudentMasterSchedule = () => {
    if (data.committees.length === 0) {
      alert("لا توجد لجان منشأة لتصدير الجدول.");
      return;
    }

    const headers = [
        "الرقم التدريبي",
        "اسم المتدرب",
        "تخصص المتدرب",
        "رمز المقرر",
        "اسم المقرر",
        "تاريخ الاختبار",
        "وقت الاختبار",
        "اسم القاعة",
        "رقم اللجنة"
    ];

    const rows: string[] = [];

    data.students.forEach(student => {
        const studentCommittees = data.committees.filter(c => c.studentIds.includes(student.id));
        
        studentCommittees.forEach(comm => {
            let exam = data.exams.find(e => e.courseCode === comm.examCode && e.specialization === comm.specialization);
            if (!exam) exam = data.exams.find(e => e.courseCode === comm.examCode);
            
            const room = data.rooms.find(r => r.id === comm.roomId);

            rows.push([
                `"${student.id}"`,
                `"${student.name}"`,
                `"${student.specialization || ''}"`,
                `"${exam?.courseCode || ''}"`,
                `"${exam?.courseName || ''}"`,
                `"${exam?.date || ''}"`,
                `"${exam?.time || ''}"`,
                `"${room?.name || ''}"`,
                `"${comm.id}"`
            ].join(','));
        });
    });

    if (rows.length === 0) {
        alert("لا توجد بيانات طلاب مسجلة في اللجان.");
        return;
    }

    const csvContent = '\uFEFF' + headers.join(',') + '\n' + rows.join('\n');
    const link = document.createElement('a');
    link.href = URL.createObjectURL(new Blob([csvContent], { type: 'text/csv;charset=utf-8;' }));
    link.setAttribute('download', 'جدول_الاختبارات_النهائي_للمتدربين.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const getMatrixData = () => {
    // Sort Dates safely and correctly using robust parser
    const uniqueDates = Array.from(new Set(data.exams.map(e => e.date).filter(Boolean)));
    const dates = (uniqueDates as string[]).sort((a, b) => {
        const dateA = parseAnyDate(a);
        const dateB = parseAnyDate(b);
        if (!dateA || !dateB) return 0;
        return dateA.getTime() - dateB.getTime();
    });
    
    // Sort Times safely (handle "HH:MM-HH:MM" format by extracting start time first)
    const uniqueTimes = Array.from(new Set(data.exams.map(e => e.time).filter(Boolean)));
    const times = (uniqueTimes as string[]).sort((a, b) => {
        const parseStart = (t: string) => {
            const start = t.split('-')[0].trim();
            const [h, m] = start.split(':').map(Number);
            return (h || 0) * 60 + (m || 0);
        };
        return parseStart(a) - parseStart(b);
    });

    return { dates, times };
  };

    // عبء المراقب: كل مراقب يُحسب له كل قاعة/تاريخ/وقت مرة واحدة فقط
    const getProctorStats = () => {
        return data.proctors.map(proctor => {
            const committees = data.committees.filter(c => c.proctorIds.includes(proctor.id));
            const uniqueSlots = new Set();
            const detailsMap: Record<string, Set<string>> = {};
            committees.forEach(c => {
                let exam = data.exams.find(e => e.courseCode === c.examCode && e.specialization === c.specialization);
                if(!exam) exam = data.exams.find(e => e.courseCode === c.examCode);
                if (exam) {
                    const slotKey = `${exam.date}__${exam.time}__${c.roomId}`;
                    uniqueSlots.add(slotKey);
                    if (!detailsMap[exam.date]) detailsMap[exam.date] = new Set();
                    detailsMap[exam.date].add(slotKey);
                }
            });
            const details = Object.entries(detailsMap).map(([date, slots]) => ({ date, count: slots.size }));
            details.sort((a,b) => {
                const dA = parseAnyDate(a.date);
                const dB = parseAnyDate(b.date);
                if (!dA || !dB) return 0;
                return dA.getTime() - dB.getTime();
            });
            return { ...proctor, count: uniqueSlots.size, days: details.length, details };
        }).sort((a, b) => b.count - a.count);
    };

  const getShareLink = () => {
      const hostname = window.location.hostname;
      const port = window.location.port || '3000';
      return `http://${hostname}:${port}`;
  };

  // ===== NEW: Student Management Functions =====
  
  const searchStudents = (query: string) => {
    if (!query.trim()) {
      setSearchedStudents([]);
      return;
    }
    const result = data.students.filter(s => 
      s.id.includes(query) || s.name.includes(query)
    );
    setSearchedStudents(result);
  };

  const validateStudentAddition = (student: Student, committee: Committee): { valid: boolean; errors: string[] } => {
    const errors: string[] = [];
    
    const normalizeSpec = (spec: string) => spec?.trim().toLowerCase();
    const studentSpec = normalizeSpec(student.specialization || '');
    const committeeSpec = normalizeSpec(committee.specialization || '');
    const isGeneralOrShared = (spec: string) => [
      'عام',
      'جميع التخصصات',
      'دراسات عامة',
      'مشترك',
      'مشتركة'
    ].some(term => spec.includes(term));

    // Check 1: Is student already in this committee?
    if (committee.studentIds.includes(student.id)) {
      errors.push('⚠️ هذا المتدرب مسجل بالفعل في هذه اللجنة');
    }

    // Check 2: Room capacity
    const room = data.rooms.find(r => r.id === committee.roomId);
    if (room && committee.studentIds.length >= room.capacity) {
      errors.push('❌ سعة اللجنة ممتلأة (لا يوجد مقاعد متاحة)');
    }

    // Check 2.5: Specialization mismatch (strict, except for general/shared courses)
    if (!isGeneralOrShared(committeeSpec) && studentSpec && committeeSpec && studentSpec !== committeeSpec) {
      errors.push('❌ تخصص المتدرب لا يتطابق مع تخصص المقرر. لا يمكن إضافة المقرر إلا إذا كان للدراسات العامة أو مقرر مشترك.');
    }

    // Check 3: Student schedule conflict (same time)
    const studentCommittees = data.committees.filter(c => c.studentIds.includes(student.id));
    const exam = data.exams.find(e => e.courseCode === committee.examCode && e.specialization === committee.specialization);
    if (!exam) {
      errors.push('❌ لم يتم العثور على بيانات الاختبار');
      return { valid: false, errors };
    }

    for (const existingComm of studentCommittees) {
      const existingExam = data.exams.find(e => e.courseCode === existingComm.examCode && e.specialization === existingComm.specialization);
      if (!existingExam) continue;

      if (existingExam.date === exam.date && existingExam.time === exam.time) {
        errors.push(`❌ تعارض زمني: المتدرب لديه اختبار آخر في نفس الوقت (${exam.time})`);
        break;
      }
    }

    // Check 4: Daily exam limit (warning only)
    const examsPerDay: Record<string, number> = {};
    studentCommittees.forEach(c => {
      const e = data.exams.find(ex => ex.courseCode === c.examCode && ex.specialization === c.specialization);
      if (e) {
        examsPerDay[e.date] = (examsPerDay[e.date] || 0) + 1;
      }
    });
    
    examsPerDay[exam.date] = (examsPerDay[exam.date] || 0) + 1;
    if (examsPerDay[exam.date] > 2) {
      errors.push(`⚠️ تحذير: سيكون لدى المتدرب ${examsPerDay[exam.date]} اختبارات في يوم ${exam.date} (الحد الأقصى: 2)`);
    }

    return { 
      valid: errors.length === 0 || !errors.some(e => e.startsWith('❌')), 
      errors 
    };
  };

  const handleSearchAndSelectStudent = (student: Student) => {
    setSelectedStudent(student);
    setSearchedStudents([]);
    setSearchStudentId('');
  };

  const handleSelectCommittee = (committee: Committee) => {
    if (!selectedStudent) return;

    const validation = validateStudentAddition(selectedStudent, committee);
    const exam = data.exams.find(e => e.courseCode === committee.examCode && e.specialization === committee.specialization);
    const room = data.rooms.find(r => r.id === committee.roomId);

    if (!exam) {
      alert('خطأ: لم يتم العثور على بيانات الاختبار');
      return;
    }

    setPreviewData_Student({
      student: selectedStudent,
      committee,
      exam,
      room
    });

    if (!validation.valid) {
      const critical = validation.errors.filter(e => e.startsWith('❌'));
      if (critical.length > 0) {
        alert('❌ لا يمكن إضافة المتدرب:\n\n' + critical.map(e => e.replace('❌ ', '')).join('\n'));
        setPreviewData_Student(null);
      }
    }
  };

  const handleConfirmAddStudent = () => {
    if (!previewData_Student) return;

    const { student, committee } = previewData_Student;

    // Add student to data.students if new
    if (!data.students.find(s => s.id === student.id)) {
      setData((prev: any) => ({
        ...prev,
        students: [...prev.students, student]
      }));
    }

    // Add student to committee
    setData((prev: any) => ({
      ...prev,
      committees: prev.committees.map((c: Committee) =>
        c.id === committee.id
          ? { ...c, studentIds: [...c.studentIds, student.id] }
          : c
      )
    }));

    setPreviewData_Student(null);
    setSelectedStudent(null);
    setSelectedCourse('');
    setSelectedCommitteeId('');
    setNewStudentData({ id: '', name: '', specialization: '', courseCodes: [] });
    setStudentMode('existing');
    setIsAddStudentModalOpen(false);

    alert('✅ تم إضافة المتدرب إلى اللجنة بنجاح!');
  };

  const handleDeleteStudent = () => {
    if (!deleteConfirmation) return;

    const { student, committee } = deleteConfirmation;

    // Remove student from committee
    setData((prev: any) => ({
      ...prev,
      committees: prev.committees.map((c: Committee) =>
        c.id === committee.id
          ? { ...c, studentIds: c.studentIds.filter(id => id !== student.id) }
          : c
      ),
      // Remove student from data.students if this is their only committee
      students: prev.students.map((s: Student) => {
        if (s.id !== student.id) return s;
        const remainingCommittees = prev.committees.filter(c => 
          c.id !== committee.id && c.studentIds.includes(student.id)
        );
        return remainingCommittees.length === 0 ? null : s;
      }).filter((s: Student | null) => s !== null)
    }));

    setDeleteConfirmation(null);
    setIsDeleteStudentModalOpen(false);

    alert('✅ تم حذف المتدرب بنجاح!');
  };

  const openDeleteModal = (student: Student, committee: Committee) => {
    setDeleteConfirmation({ student, committee });
    setIsDeleteStudentModalOpen(true);
  };

  const handlePrintMatrix = () => {
    const { dates, times } = getMatrixData();
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    let rowsHtml = '';
    dates.forEach(date => {
        const dual = getDualDate(date as string);
        let colsHtml = `<td class="header-col">
          <div class="date-cell">
            <span class="day-name">${dual.dayName}</span>
            <div class="date-row">
                <span class="date-hijri">${dual.hijri}</span>
            </div>
            <span class="date-greg">${dual.greg} م</span>
          </div>
        </td>`;
        
        times.forEach(time => {
            const slotExams = data.exams.filter(e => e.date === date && e.time === time);
            let content = '';
            
            if (slotExams.length > 0) {
                slotExams.forEach(exam => {
                    const examCommittees = data.committees.filter(c => {
                        if (c.examCode !== exam.courseCode) return false;
                        if (exam.specialization !== 'جميع التخصصات' && exam.specialization !== 'عام') {
                            return c.specialization === exam.specialization;
                        }
                        return true;
                    });

                    if (examCommittees.length === 0) return;

                    content += `<div class="exam-group">`;
                    content += `<div class="exam-header">
                        <span class="exam-name">${exam.courseName}</span>
                        <span class="exam-spec">${exam.specialization !== 'عام' ? exam.specialization : ''}</span>
                    </div>`;
                    
                    content += `<div class="comm-grid">`;
                    examCommittees.forEach(comm => {
                        const room = data.rooms.find(r => r.id === comm.roomId);
                        const p1 = data.proctors.find(p => p.id === comm.proctorIds[0])?.name.split(' ').slice(0, 2).join(' ') || '-';
                        const p2 = data.proctors.find(p => p.id === comm.proctorIds[1])?.name.split(' ').slice(0, 2).join(' ') || '-';
                        
                        content += `
                            <div class="committee-box">
                                <div class="comm-top">
                                    <span class="comm-id">${comm.id}</span>
                                    <span class="room-badge">${room?.name || '---'}</span>
                                </div>
                                <div class="proctors-list">
                                    <div>1. ${p1}</div>
                                    <div>2. ${p2}</div>
                                </div>
                                <div class="student-count">${comm.studentIds.length} متدرب</div>
                            </div>
                        `;
                    });
                    content += `</div></div>`;
                });
            } else {
                content = '<span class="empty-slot">-</span>';
            }
            colsHtml += `<td class="data-col">${content}</td>`;
        });
        rowsHtml += `<tr>${colsHtml}</tr>`;
    });

    const htmlContent = `
      <!DOCTYPE html>
      <html dir="rtl">
      <head>
        <title>الجدول الشبكي للاختبارات</title>
        <link href="https://fonts.googleapis.com/css2?family=Tajawal:wght@400;500;700;800&display=swap" rel="stylesheet">
        <style>
          @page { size: A3 landscape; margin: 5mm; }
          * { box-sizing: border-box; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
          body { font-family: 'Tajawal', sans-serif; margin: 0; padding: 10px; background: #fff; }
          .report-header { text-align: center; border-bottom: 3px solid #006d5b; padding-bottom: 10px; margin-bottom: 15px; }
          .report-header h1 { margin: 0; color: #006d5b; font-size: 24px; }
          .report-header h2 { margin: 5px 0 0; color: #555; font-size: 16px; }
          .print-date { font-size: 10px; color: #999; text-align: left; margin-top: 5px; }
          
          table { width: 100%; border-collapse: collapse; border: 1px solid #000; table-layout: fixed; }
          th, td { border: 1px solid #444; vertical-align: top; }
          th { background-color: #f3f4f6; padding: 8px; text-align: center; font-weight: bold; font-size: 14px; border-bottom: 2px solid #000; }
          
          .header-col { width: 110px; background-color: #f8fafc; text-align: center; vertical-align: middle; padding: 8px 5px; }
          .date-cell { display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%; }
          .day-name { font-size: 16px; font-weight: 800; color: #000; margin-bottom: 6px; border-bottom: 2px solid #eee; padding-bottom: 4px; width: 100%; display: block; }
          .date-row { margin-top: 4px; margin-bottom: 2px; }
          .date-hijri { font-size: 14px; color: #006d5b; font-weight: bold; display: block; background: #f0fdfa; padding: 2px 6px; border-radius: 4px; }
          .date-greg { font-size: 11px; color: #666; display: block; margin-top: 4px; font-family: sans-serif; }
          
          .data-col { padding: 4px; }
          .exam-group { margin-bottom: 6px; border: 1px solid #ddd; border-radius: 4px; overflow: hidden; page-break-inside: avoid; }
          .exam-header { background: #eef2ff; padding: 4px 6px; border-bottom: 1px solid #e0e7ff; display: flex; justify-content: space-between; align-items: center; }
          .exam-name { font-weight: bold; font-size: 12px; color: #1e3a8a; }
          .exam-spec { font-size: 10px; color: #4338ca; background: #fff; px: 4px; border-radius: 3px; padding: 0 4px; }
          .comm-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(110px, 1fr)); gap: 4px; padding: 4px; background: #fff; }
          .committee-box { border: 1px solid #ccc; border-radius: 3px; padding: 3px; background: #fdfdfd; font-size: 10px; }
          .comm-top { display: flex; justify-content: space-between; margin-bottom: 2px; border-bottom: 1px dashed #eee; padding-bottom: 2px; }
          .comm-id { background: #333; color: #fff; padding: 0 3px; border-radius: 2px; font-weight: bold; }
          .room-badge { font-weight: bold; color: #059669; }
          .proctors-list { color: #444; margin-bottom: 2px; line-height: 1.1; }
          .student-count { text-align: center; background: #fef3c7; color: #92400e; border-radius: 2px; padding: 1px; font-weight: bold; font-size: 9px; }
          .empty-slot { color: #ddd; display: block; text-align: center; padding: 20px; font-size: 20px; }
        </style>
      </head>
      <body>
        <div class="report-header">
            <h1>الكلية التقنية بأحد رفيدة</h1>
            <h2>الجدول العام لتوزيع لجان الاختبارات النهائية</h2>
            <div class="print-date">تم الطباعة بتاريخ: ${new Date().toLocaleDateString('en-GB')}</div>
        </div>
        <table>
          <thead>
            <tr>
              <th style="width: 110px;">اليوم / التاريخ</th>
              ${times.map(t => `<th>الفترة (${t})</th>`).join('')}
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

  const handlePrintReports = () => {
    // ... same as before
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;
    const stats = getProctorStats();
    let rowsHtml = '';
    stats.forEach(p => {
        let detailsHtml = p.details.map(d => {
             const dual = getDualDate(d.date);
             return `<span><small>${dual.greg}</small> <small style="color:#006d5b">(${dual.hijri})</small>: <b>${d.count}</b></span>`;
        }).join(' | ');
        rowsHtml += `
            <tr>
                <td>${p.name}</td>
                <td style="text-align:center"><span class="badge ${p.count > 10 ? 'red' : 'green'}">${p.count}</span></td>
                <td style="text-align:center">${p.days}</td>
                <td style="font-size:11px; color:#555;">${detailsHtml}</td>
            </tr>
        `;
    });
    // ... HTML construction
    const htmlContent = `
      <!DOCTYPE html>
      <html dir="rtl">
      <head>
        <title>تقرير المراقبين</title>
        <link href="https://fonts.googleapis.com/css2?family=Tajawal:wght@400;700&display=swap" rel="stylesheet">
        <style>
            @page { size: A4; margin: 15mm; }
            body { font-family: 'Tajawal', sans-serif; -webkit-print-color-adjust: exact; }
            .header { text-align: center; margin-bottom: 30px; border-bottom: 2px solid #006d5b; padding-bottom: 10px; }
            h1 { color: #006d5b; margin: 0; }
            h2 { color: #555; margin: 5px 0; font-size: 16px; }
            .summary-grid { display: grid; grid-template-columns: repeat(5, 1fr); gap: 10px; margin-bottom: 20px; }
            .card { border: 1px solid #ddd; padding: 15px; text-align: center; border-radius: 8px; background: #f9f9f9; }
            .card-val { display: block; font-size: 24px; font-weight: bold; color: #006d5b; }
            .card-lbl { font-size: 12px; color: #777; }
            table { width: 100%; border-collapse: collapse; font-size: 13px; }
            th, td { border: 1px solid #ddd; padding: 8px; text-align: right; }
            th { background-color: #006d5b; color: white; }
            tr:nth-child(even) { background-color: #f2f2f2; }
            .badge { padding: 2px 8px; border-radius: 10px; color: white; font-weight: bold; font-size: 11px; }
            .green { background-color: #10b981; }
            .red { background-color: #ef4444; }
        </style>
      </head>
      <body>
        <div class="header">
            <h1>الكلية التقنية بأحد رفيدة</h1>
            <h2>تقرير إحصائيات الاختبارات وتوزيع المراقبين</h2>
        </div>
        <div class="summary-grid">
            <div class="card"><span class="card-val">${data.students.length}</span><span class="card-lbl">المتدربين</span></div>
            <div class="card"><span class="card-val">${data.exams.length}</span><span class="card-lbl">الاختبارات</span></div>
            <div class="card"><span class="card-val">${data.committees.length}</span><span class="card-lbl">اللجان</span></div>
            <div class="card"><span class="card-val">${data.proctors.length}</span><span class="card-lbl">المراقبين</span></div>
            <div class="card"><span class="card-val">${data.rooms.length}</span><span class="card-lbl">القاعات</span></div>
        </div>
        <h3>تفاصيل توزيع المراقبين</h3>
        <table>
            <thead>
                <tr>
                    <th>المراقب</th>
                    <th style="width:100px; text-align:center">عدد اللجان</th>
                    <th style="width:100px; text-align:center">أيام الحضور</th>
                    <th>التفاصيل اليومية (ميلادي - هجري)</th>
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

  const renderMasterSchedule = () => {
    // ... same as before
    const { dates, times } = getMatrixData();
    return (
      <div className="fixed inset-0 bg-white z-[100] overflow-y-auto">
        <div className="min-h-screen p-4 md:p-8">
          <div className="flex justify-between items-center mb-8 border-b pb-4">
            <h2 className="text-2xl font-bold flex items-center gap-2">
              <Grid size={24} className="text-tvtc-green" /> الجدول الشبكي للاختبارات النهائية
            </h2>
            <div className="flex gap-4">
              <button 
                onClick={handlePrintMatrix}
                className="bg-blue-600 text-white px-6 py-2 rounded flex items-center gap-2 hover:bg-blue-700"
              >
                <Printer size={18} /> طباعة الجدول
              </button>
              <button 
                onClick={() => setShowMasterSchedule(false)}
                className="bg-gray-200 text-gray-800 px-6 py-2 rounded flex items-center gap-2 hover:bg-gray-300"
              >
                <X size={18} /> إغلاق
              </button>
            </div>
          </div>
          <div className="overflow-x-auto">
              <table className="w-full border-collapse border border-gray-900 text-center text-sm">
                <thead>
                  <tr className="bg-gray-100 text-gray-900">
                    <th className="border border-gray-900 p-2 w-28 font-bold">التاريخ / اليوم</th>
                    {times.map((time, idx) => (
                      <th key={idx} className="border border-gray-900 p-2 font-bold min-w-[200px]">{time}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {dates.map((date, rowIdx) => {
                    const dual = getDualDate(date as string);
                    return (
                        <tr key={rowIdx}>
                          <td className="border border-gray-900 p-2 font-bold bg-gray-50 align-middle">
                              <div className="text-sm">{dual.dayName}</div>
                              <div className="text-xs text-gray-800 dir-ltr">{dual.greg}</div>
                              <div className="text-[10px] text-tvtc-green mt-1">{dual.hijri}</div>
                          </td>
                          {times.map((time, colIdx) => {
                            const slotExams = data.exams.filter(e => e.date === date && e.time === time);
                            return (
                              <td key={colIdx} className="border border-gray-900 p-1 align-top h-32">
                                {slotExams.length > 0 ? (
                                  <div className="flex flex-col gap-2 h-full">
                                    {slotExams.map((exam, exIdx) => {
                                      const examCommittees = data.committees.filter(c => {
                                          if (c.examCode !== exam.courseCode) return false;
                                          if (exam.specialization !== 'جميع التخصصات' && exam.specialization !== 'عام') {
                                              return c.specialization === exam.specialization;
                                          }
                                          return true;
                                      });
                                      if (examCommittees.length === 0) return null;
                                      return (
                                        <div key={exIdx} className="bg-white border border-gray-300 p-1 rounded text-right h-full shadow-sm">
                                          <div className="font-bold text-center text-sm bg-gray-100 p-1 border-b mb-1">
                                            {exam.courseName} <br/> <span className="text-[10px] text-gray-500 font-normal">({exam.specialization})</span>
                                          </div>
                                          <div className="space-y-1">
                                            {examCommittees.map((comm) => {
                                              const room = data.rooms.find(r => r.id === comm.roomId);
                                              const p1 = data.proctors.find(p => p.id === comm.proctorIds[0]);
                                              const p2 = data.proctors.find(p => p.id === comm.proctorIds[1]);
                                              return (
                                                <div key={comm.id} className="text-[10px] border border-gray-200 p-1 rounded bg-gray-50">
                                                  <div className="flex justify-between items-center font-bold mb-1 border-b border-gray-200 pb-1">
                                                     <div className="flex items-center gap-1">
                                                        <span className="bg-black text-white px-1 rounded">{comm.id}</span>
                                                        <span className="bg-tvtc-gold text-white px-1.5 rounded text-[10px]" title="عدد المتدربين">{comm.studentIds.length} متدرب</span>
                                                     </div>
                                                     <span>{room?.name || '---'}</span>
                                                  </div>
                                                  <div className="text-gray-700 leading-tight">
                                                     <div>1. {p1?.name || '-'}</div>
                                                     <div>2. {p2?.name || '-'}</div>
                                                  </div>
                                                </div>
                                              );
                                            })}
                                          </div>
                                        </div>
                                      );
                                    })}
                                  </div>
                                ) : (
                                  <span className="text-gray-300">-</span>
                                )}
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
    );
  };
  
  const safeStats = [
    { name: 'المتدربين', value: data.students.length },
    { name: 'الاختبارات', value: data.exams.length },
    { name: 'القاعات', value: data.rooms.length },
    { name: 'المراقبين', value: data.proctors.length },
    { name: 'اللجان', value: data.committees.length },
  ];

  return (
    <div className="space-y-6 relative">
      {/* Read-Only Warning Banner */}
      {isReadOnly && (
        <div className="bg-yellow-50 border-l-4 border-yellow-400 p-4 rounded-lg shadow-sm">
          <div className="flex items-center gap-3">
            <AlertCircle className="text-yellow-600" size={24} />
            <div>
              <h3 className="font-bold text-yellow-800">وضع القراءة فقط</h3>
              <p className="text-sm text-yellow-700">أنت تتصفح النظام بصلاحيات محدودة. لا يمكنك إجراء تعديلات أو حفظ التغييرات في قاعدة البيانات.</p>
            </div>
          </div>
        </div>
      )}
      
      <header className="flex justify-between items-center bg-white p-4 rounded-lg shadow-sm">
        <h2 className="text-2xl font-bold text-gray-800">لوحة تحكم المدير</h2>
        <div className="flex gap-2">
            <button 
                onClick={() => setShowShareModal(true)}
                className="px-4 py-2 rounded-lg bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-100 flex items-center gap-2 font-bold"
            >
                <Smartphone size={18} /> رابط المتدربين
            </button>
            <div className="h-8 w-px bg-gray-300 mx-2"></div>
            <button 
                onClick={() => setActiveSection('upload')}
                className={`px-4 py-2 rounded-lg ${activeSection === 'upload' ? 'bg-tvtc-green text-white' : 'bg-gray-100'}`}
            >
                1. البيانات
            </button>
            <button 
                onClick={() => setActiveSection('create')}
                className={`px-4 py-2 rounded-lg ${activeSection === 'create' ? 'bg-tvtc-green text-white' : 'bg-gray-100'}`}
            >
                2. إنشاء اللجان
            </button>
            <button 
                onClick={() => setActiveSection('reports')}
                className={`px-4 py-2 rounded-lg ${activeSection === 'reports' ? 'bg-tvtc-green text-white' : 'bg-gray-100'}`}
            >
                3. التقارير
            </button>
        </div>
      </header>

      {/* Share Link Modal */}
      {showShareModal && (
          <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
              <div className="bg-white rounded-xl shadow-2xl p-8 max-w-lg w-full text-center">
                  <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4 text-blue-600">
                      <Smartphone size={32} />
                  </div>
                  <h3 className="text-2xl font-bold mb-2">رابط الدخول للمتدربين</h3>
                  <p className="text-gray-600 mb-6">
                      قم بإرسال الرابط التالي للمتدربين ليتمكنوا من استعراض جداولهم عبر هواتفهم.
                      <br/>
                      <span className="text-sm text-red-500">ملاحظة: يجب أن يكون المتدرب متصلاً بنفس شبكة الإنترنت (Wi-Fi).</span>
                  </p>
                  
                  <div className="bg-gray-100 p-4 rounded-lg border-2 border-dashed border-gray-300 mb-6 select-all">
                      <p className="font-mono text-xl font-bold text-blue-800 dir-ltr">{getShareLink()}</p>
                  </div>

                  <button 
                      onClick={() => setShowShareModal(false)}
                      className="bg-gray-800 text-white px-8 py-3 rounded-lg hover:bg-gray-900"
                  >
                      إغلاق
                  </button>
              </div>
          </div>
      )}

      {/* Preview Confirmation Modal */}
      {showPreview && previewData && (
        <div className="fixed inset-0 bg-black/60 z-[60] flex items-center justify-center p-4">
            <div className="bg-white rounded-lg shadow-2xl w-full max-w-3xl overflow-hidden animate-scale-in flex flex-col max-h-[90vh]">
                <div className="p-4 border-b bg-gray-50 flex justify-between items-center">
                    <h3 className="text-xl font-bold flex items-center gap-2 text-gray-800">
                        <FileCheck size={24} className="text-tvtc-green"/> تأكيد استيراد البيانات
                    </h3>
                    <button onClick={() => { setShowPreview(false); setPreviewData(null); }} className="text-gray-400 hover:text-gray-600">
                        <X size={24}/>
                    </button>
                </div>
                
                <div className="p-6 space-y-6 overflow-y-auto">
                    {/* Stats */}
                    <div className="grid grid-cols-2 gap-4">
                        <div className="bg-blue-50 p-4 rounded-lg border border-blue-100">
                            <span className="text-blue-600 text-sm font-bold block mb-1">نوع الملف</span>
                            <span className="font-bold text-xl text-gray-800">
                                {previewType === 'exams' ? 'جدول الاختبارات' : 
                                 previewType === 'students' ? 'سجل المتدربين' :
                                 previewType === 'rooms' ? 'القاعات والمعامل' : 'المراقبين'}
                            </span>
                        </div>
                        <div className="bg-blue-50 p-4 rounded-lg border border-blue-100">
                            <span className="text-blue-600 text-sm font-bold block mb-1">عدد السجلات</span>
                            <span className={`font-bold text-xl ${getDataCount(previewData) > 0 ? 'text-green-600' : 'text-red-600'}`}>
                                {getDataCount(previewData)}
                            </span>
                        </div>
                    </div>

                    {/* Validation Message */}
                    {getDataCount(previewData) === 0 ? (
                        <div className="bg-red-50 text-red-800 p-4 rounded-lg border border-red-200 flex items-start gap-3">
                            <AlertCircle size={24} className="mt-0.5 shrink-0"/>
                            <div>
                                <h4 className="font-bold">خطأ في البيانات</h4>
                                <p className="text-sm mt-1">لم يتم العثور على سجلات صالحة. يرجى التأكد من أن ملف CSV يحتوي على الأعمدة المطلوبة ومحفوظ بتنسيق UTF-8.</p>
                            </div>
                        </div>
                    ) : (
                        <div className="bg-green-50 text-green-800 p-4 rounded-lg border border-green-200 flex items-start gap-3">
                            <CheckCircle size={24} className="mt-0.5 shrink-0"/>
                            <div>
                                <h4 className="font-bold">البيانات صالحة للاستيراد</h4>
                                <p className="text-sm mt-1">
                                    تم التحقق من هيكل الملف بنجاح. البيانات جاهزة للاستخدام في عملية توزيع اللجان.
                                </p>
                            </div>
                        </div>
                    )}

                    {/* Preview Table */}
                    {getDataCount(previewData) > 0 && (
                        <div className="border rounded-lg overflow-hidden">
                            <div className="bg-gray-100 px-4 py-2 border-b font-bold text-sm text-gray-600 flex justify-between items-center">
                                <span>معاينة البيانات (أول 5 سجلات)</span>
                                <span className="text-xs font-normal">تأكد من صحة الأعمدة أدناه</span>
                            </div>
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm text-right">
                                    <thead className="bg-gray-50 text-gray-700">
                                        {renderPreviewHeader()}
                                    </thead>
                                    <tbody className="divide-y">
                                        {renderPreviewRows()}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}
                </div>

                <div className="p-4 bg-gray-50 border-t flex justify-end gap-3">
                    <button 
                        onClick={() => { setShowPreview(false); setPreviewData(null); }}
                        className="px-6 py-2.5 rounded-lg text-gray-700 bg-white border border-gray-300 hover:bg-gray-100 font-bold transition-colors"
                    >
                        إلغاء الأمر
                    </button>
                    <button 
                        onClick={handleConfirmUpload}
                        disabled={getDataCount(previewData) === 0 || isReadOnly}
                        className="px-8 py-2.5 rounded-lg bg-tvtc-green text-white hover:bg-green-800 font-bold disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 shadow-sm transition-all transform active:scale-95"
                        title={isReadOnly ? 'الصلاحيات: قراءة فقط' : ''}
                    >
                        <CheckCircle size={18}/> تأكيد وحفظ البيانات
                    </button>
                </div>
            </div>
        </div>
      )}

      {/* Upload Section */}
      {activeSection === 'upload' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-100">
                  <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
                      <Upload size={20} className="text-tvtc-green"/> رفع الملفات (CSV)
                  </h3>
                  <div className="space-y-6">
                      <div>
                          <div className="flex justify-between items-end mb-1">
                              <label className="block text-sm font-medium">ملف الاختبارات</label>
                              <button onClick={() => handleDownloadTemplate('exams')} className="text-xs text-blue-600 flex items-center gap-1 hover:text-blue-800 transition-colors">
                                  <FileDown size={14}/> نموذج
                              </button>
                          </div>
                          <input type="file" accept=".csv" onChange={(e) => handleFileUpload(e, 'exams')} disabled={isReadOnly} title={isReadOnly ? 'الصلاحيات: قراءة فقط' : ''} className="block w-full text-sm text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-tvtc-green/10 file:text-tvtc-green hover:file:bg-tvtc-green/20 disabled:opacity-50 disabled:cursor-not-allowed"/>
                      </div>
                      <div>
                          <div className="flex justify-between items-end mb-1">
                              <label className="block text-sm font-medium">ملف المتدربين</label>
                              <button onClick={() => handleDownloadTemplate('students')} className="text-xs text-blue-600 flex items-center gap-1 hover:text-blue-800 transition-colors">
                                  <FileDown size={14}/> نموذج
                              </button>
                          </div>
                          <input type="file" accept=".csv" onChange={(e) => handleFileUpload(e, 'students')} disabled={isReadOnly} title={isReadOnly ? 'الصلاحيات: قراءة فقط' : ''} className="block w-full text-sm text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-tvtc-green/10 file:text-tvtc-green hover:file:bg-tvtc-green/20 disabled:opacity-50 disabled:cursor-not-allowed"/>
                          <p className="text-xs text-gray-400 mt-1">ملاحظة: سيتم تسجيل المتدرب فقط في المقررات التي تطابق تخصصه أو المتاحة لجميع التخصصات.</p>
                      </div>
                      
                      {/* Room Management Section */}
                      <div className="border-t border-gray-100 pt-4">
                          <div className="flex justify-between items-center mb-2">
                              <label className="block text-sm font-medium">القاعات والمعامل</label>
                              <div className="flex gap-2">
                                <button onClick={() => handleDownloadTemplate('rooms')} className="text-xs text-blue-600 flex items-center gap-1 hover:text-blue-800 transition-colors bg-blue-50 px-2 py-1 rounded">
                                    <FileDown size={14}/> نموذج
                                </button>
                                <button 
                                    onClick={openAddRoomModal}
                                    disabled={isReadOnly}
                                    title={isReadOnly ? 'الصلاحيات: قراءة فقط' : ''}
                                    className="text-xs bg-tvtc-green text-white px-2 py-1 rounded flex items-center gap-1 hover:bg-green-800 disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    <Plus size={12}/> إضافة يدوي
                                </button>
                              </div>
                          </div>
                          <input type="file" accept=".csv" onChange={(e) => handleFileUpload(e, 'rooms')} disabled={isReadOnly} title={isReadOnly ? 'الصلاحيات: قراءة فقط' : ''} className="block w-full text-sm text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-tvtc-green/10 file:text-tvtc-green hover:file:bg-tvtc-green/20 mb-2 disabled:opacity-50 disabled:cursor-not-allowed"/>
                          
                          {/* Room List Preview */}
                          {data.rooms.length > 0 && (
                            <div className="bg-gray-50 rounded border border-gray-200 max-h-48 overflow-y-auto text-sm">
                              <table className="w-full text-right">
                                <thead className="bg-gray-100 sticky top-0">
                                  <tr>
                                    <th className="p-2 text-xs">الاسم</th>
                                    <th className="p-2 text-xs">النوع</th>
                                    <th className="p-2 text-xs">السعة</th>
                                    <th className="p-2 text-xs w-16">تحكم</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {data.rooms.map((room) => (
                                    <tr key={room.id} className="border-t border-gray-200 hover:bg-white">
                                      <td className="p-2">{room.name}</td>
                                      <td className="p-2 text-xs">{room.type === 'Lab' ? 'معمل' : 'قاعة'}</td>
                                      <td className="p-2">{room.capacity}</td>
                                      <td className="p-2 flex gap-1 justify-end">
                                        <button onClick={() => openEditRoomModal(room)} disabled={isReadOnly} title={isReadOnly ? 'الصلاحيات: قراءة فقط' : ''} className="text-blue-600 hover:text-blue-800 p-1 disabled:opacity-30 disabled:cursor-not-allowed"><Edit size={14}/></button>
                                        <button onClick={() => handleDeleteRoom(room.id)} disabled={isReadOnly} title={isReadOnly ? 'الصلاحيات: قراءة فقط' : ''} className="text-red-600 hover:text-red-800 p-1 disabled:opacity-30 disabled:cursor-not-allowed"><Trash2 size={14}/></button>
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          )}
                      </div>

                      <div className="border-t border-gray-100 pt-4">
                          <div className="flex justify-between items-end mb-1">
                              <label className="block text-sm font-medium">المراقبين</label>
                              <button onClick={() => handleDownloadTemplate('proctors')} className="text-xs text-blue-600 flex items-center gap-1 hover:text-blue-800 transition-colors">
                                  <FileDown size={14}/> نموذج
                              </button>
                          </div>
                          <input type="file" accept=".csv" onChange={(e) => handleFileUpload(e, 'proctors')} disabled={isReadOnly} title={isReadOnly ? 'الصلاحيات: قراءة فقط' : ''} className="block w-full text-sm text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-tvtc-green/10 file:text-tvtc-green hover:file:bg-tvtc-green/20 disabled:opacity-50 disabled:cursor-not-allowed"/>
                      </div>
                  </div>
              </div>

              <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-100">
                  <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
                      <Activity size={20} className="text-tvtc-gold"/> نظام التحليل الذكي
                  </h3>
                  <div className="mb-4">
                      <p className="text-gray-600 text-sm mb-4">
                          يقوم النظام بتحليل البيانات محلياً لحساب السعة المطلوبة، وكشف أوقات الذروة، واقتراح توزيع المراقبين دون الحاجة للإنترنت.
                      </p>
                      <button 
                          onClick={handleAiAdvice}
                          disabled={loadingAi || data.exams.length === 0}
                          className="bg-tvtc-gold text-white px-4 py-2 rounded hover:bg-yellow-600 disabled:opacity-50 w-full flex justify-center items-center gap-2"
                      >
                          {loadingAi ? 'جاري التحليل...' : 'تحليل البيانات وتقديم النصيحة'}
                      </button>
                  </div>
                  {aiAdvice && (
                      <div className="bg-yellow-50 p-4 rounded border border-yellow-200 text-sm whitespace-pre-line leading-relaxed">
                          {aiAdvice}
                      </div>
                  )}
              </div>
          </div>

          <div className="bg-red-50 p-6 rounded-lg border border-red-200 flex flex-col md:flex-row items-center justify-between gap-4">
              <div>
                  <h3 className="text-red-800 font-bold text-lg flex items-center gap-2">
                      <Trash2 size={20}/> إعادة تعيين النظام (منطقة الخطر)
                  </h3>
                  <p className="text-red-700 text-sm mt-1 max-w-2xl">
                      سيؤدي هذا الإجراء إلى مسح كافة البيانات من النظام (المتدربين، الاختبارات، القاعات، اللجان) وإعادته إلى وضع البداية. استخدم هذا الزر فقط عند الرغبة في بدء فصل دراسي جديد.
                  </p>
              </div>
              <button 
                  type="button"
                  onClick={handleResetSystem}
                  disabled={isReadOnly}
                  title={isReadOnly ? 'الصلاحيات: قراءة فقط' : ''}
                  className="bg-red-600 text-white px-6 py-3 rounded-lg font-bold hover:bg-red-700 shadow-sm transition-colors whitespace-nowrap flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                  <Trash2 size={18} />
                  تصفير النظام بالكامل
              </button>
          </div>
        </div>
      )}

      {/* Create Section */}
      {activeSection === 'create' && (
        <div className="space-y-6">
            <div className="bg-white p-6 rounded-lg shadow-sm">
                <div className="flex justify-between items-center mb-6">
                    <h3 className="text-lg font-bold">توزيع اللجان</h3>
                    <div className="flex gap-2">
                        <button onClick={handleExportStudentMasterSchedule} className="bg-orange-600 text-white px-4 py-2 rounded hover:bg-orange-700 flex items-center gap-2 text-sm">
                            <FileDown size={16} /> تصدير شامل للمتدربين
                        </button>
                        <button onClick={generateCommittees} disabled={isReadOnly} title={isReadOnly ? 'الصلاحيات: قراءة فقط' : ''} className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed">توزيع تلقائي (متوازن)</button>
                        <button onClick={handleExportSchedule} className="bg-gray-600 text-white px-4 py-2 rounded hover:bg-gray-700 flex items-center gap-2">
                            <Download size={16} /> تصدير الجدول
                        </button>
                        <button onClick={() => setShowMasterSchedule(true)} className="bg-purple-600 text-white px-4 py-2 rounded hover:bg-purple-700 flex items-center gap-2">
                            <Grid size={16} /> طباعة الجدول الشبكي
                        </button>
                        <button onClick={executeAndValidate} disabled={isReadOnly} title={isReadOnly ? 'الصلاحيات: قراءة فقط' : ''} className="bg-tvtc-green text-white px-4 py-2 rounded hover:bg-green-700 flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed">
                            <Play size={16} /> تنفيذ واعتماد
                        </button>
                    </div>
                </div>

                {/* Validation Status */}
                {executionStatus === 'failed' && (
                    <div className="mb-6 bg-red-50 border border-red-200 rounded p-4">
                        <h4 className="font-bold text-red-800 flex items-center gap-2 mb-2">
                            <AlertCircle size={18}/> تنبيه: لا يمكن التنفيذ لوجود تعارضات
                        </h4>
                        <ul className="list-disc list-inside text-sm text-red-700 space-y-1">
                            {validationErrors.map((err, idx) => (
                                <li key={idx}>{err.message}</li>
                            ))}
                        </ul>
                    </div>
                )}
                
                {executionStatus === 'success' && (
                     <div className="mb-6 bg-green-50 border border-green-200 rounded p-4 flex items-center gap-2 text-green-800">
                        <CheckCircle size={20}/>
                        <span>تم التحقق من الشروط بنجاح! الجدول جاهز للنشر.</span>
                     </div>
                )}

                {/* Committees List */}
                <div className="overflow-x-auto">
                    <table className="w-full text-right border-collapse">
                        <thead className="bg-gray-50">
                            <tr>
                                <th className="p-3 border-b">رقم اللجنة</th>
                                <th className="p-3 border-b">المقرر</th>
                                <th className="p-3 border-b">التخصص</th>
                                <th className="p-3 border-b">القاعة</th>
                                <th className="p-3 border-b">المراقبين</th>
                                <th className="p-3 border-b">عدد المتدربين</th>
                                <th className="p-3 border-b">الإجراءات</th>
                            </tr>
                        </thead>
                        <tbody>
                            {data.committees.map(comm => {
                                let exam = data.exams.find(e => e.courseCode === comm.examCode && e.specialization === comm.specialization);
                                if (!exam) exam = data.exams.find(e => e.courseCode === comm.examCode);

                                const room = data.rooms.find(r => r.id === comm.roomId);
                                const proctorNames = comm.proctorIds.map(pid => 
                                    data.proctors.find(p => p.id === pid)?.name || 'غير معين'
                                ).join(' ، ');

                                return (
                                    <tr key={comm.id} className="border-b hover:bg-gray-50">
                                        <td className="p-3">{comm.id}</td>
                                        <td className="p-3">
                                            <div className="font-medium">{exam?.courseName}</div>
                                            <div className="text-xs text-gray-500">{exam?.date} | {exam?.time}</div>
                                        </td>
                                        <td className="p-3 text-sm text-gray-600">{exam?.specialization || 'عام'}</td>
                                        <td className="p-3">{room?.name}</td>
                                        <td className="p-3 text-sm">{proctorNames}</td>
                                        <td className="p-3">{comm.studentIds.length}</td>
                                        <td className="p-3">
                                            <button 
                                                onClick={() => openEditCommitteeModal(comm)}
                                                disabled={isReadOnly}
                                                title={isReadOnly ? 'الصلاحيات: قراءة فقط' : ''}
                                                className="text-blue-600 hover:text-blue-800 text-sm flex items-center gap-1 disabled:opacity-30 disabled:cursor-not-allowed"
                                            >
                                                <Edit size={14} /> تعديل
                                            </button>
                                        </td>
                                    </tr>
                                );
                            })}
                            {data.committees.length === 0 && (
                                <tr>
                                    <td colSpan={7} className="p-8 text-center text-gray-400">لا توجد لجان منشأة بعد. قم بالتوزيع التلقائي أو أضف يدوياً.</td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
      )}

      {/* Reports Section */}
      {activeSection === 'reports' && (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
               <h3 className="text-xl font-bold">التقارير والإحصائيات</h3>
               <button 
                    onClick={handlePrintReports} 
                    className="bg-gray-800 text-white px-4 py-2 rounded flex items-center gap-2 hover:bg-gray-900 shadow-sm"
               >
                   <Printer size={18} /> طباعة التقرير / حفظ PDF
               </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
               {safeStats.map((stat) => (
                   <div key={stat.name} className="bg-white p-4 rounded-lg shadow-sm border border-gray-100 flex flex-col items-center justify-center">
                       <span className="text-gray-500 text-sm">{stat.name}</span>
                       <span className="text-3xl font-bold text-tvtc-green">{stat.value}</span>
                   </div>
               ))}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="bg-white p-6 rounded-lg shadow-sm h-96">
                    <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
                        <PieChart size={20}/> ملخص البيانات
                    </h3>
                    <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={safeStats}>
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis dataKey="name" />
                            <YAxis />
                            <Tooltip />
                            <Bar dataKey="value" fill="#006d5b" />
                        </BarChart>
                    </ResponsiveContainer>
                </div>

                <div className="bg-white p-6 rounded-lg shadow-sm h-96 overflow-y-auto">
                     <h3 className="text-lg font-bold mb-4 flex items-center gap-2 sticky top-0 bg-white">
                        <UserCheck size={20}/> تقرير أعباء المراقبين وتفاصيل التوزيع
                    </h3>
                    <div className="overflow-x-auto">
                        <table className="w-full text-right text-sm">
                            <thead className="bg-gray-100 sticky top-0">
                                <tr>
                                    <th className="p-2 border-b">اسم المراقب</th>
                                    <th className="p-2 border-b">عدد المراقبات</th>
                                    <th className="p-2 border-b">أيام الحضور</th>
                                    <th className="p-2 border-b">التفاصيل اليومية</th>
                                </tr>
                            </thead>
                            <tbody>
                                {getProctorStats().map(p => (
                                    <tr key={p.id} className="border-b hover:bg-gray-50 align-top">
                                        <td className="p-2 font-medium">{p.name}</td>
                                        <td className="p-2">
                                            <span className={`px-2 py-1 rounded text-white text-xs ${p.count > 10 ? 'bg-red-500' : 'bg-green-600'}`}>
                                                {p.count}
                                            </span>
                                        </td>
                                        <td className="p-2 text-gray-600">{p.days} أيام</td>
                                        <td className="p-2 text-xs text-gray-500">
                                            {p.details.map((d, i) => (
                                                <div key={i} className="mb-1 border-b border-dashed border-gray-200 pb-1">
                                                    {d.date}: <span className="font-bold text-gray-700">{d.count} لجان</span>
                                                </div>
                                            ))}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>
      )}

      {/* Manage Students Section (NEW) */}
      {activeSection === 'manage-students' && (
        <div className="space-y-6">
          <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-100">
            <h3 className="text-lg font-bold mb-6 flex items-center gap-2">
              <UserCheck size={24} className="text-tvtc-green" />
              إدارة المتدربين (إضافة / حذف بعد رفع الحرمان)
            </h3>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Add Student Section */}
              <div className="border rounded-lg p-6 bg-gradient-to-br from-blue-50 to-blue-0 border-blue-200">
                <h4 className="font-bold text-lg mb-4 flex items-center gap-2 text-blue-800">
                  <Plus size={20} /> إضافة متدرب إلى لجنة
                </h4>

                <button 
                  onClick={() => setIsAddStudentModalOpen(true)}
                  disabled={isReadOnly || data.committees.length === 0}
                  className="w-full bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed font-bold flex items-center justify-center gap-2 transition-colors"
                >
                  <Plus size={20} /> فتح نافذة الإضافة
                </button>

                <div className="mt-4 p-4 bg-blue-100 rounded border border-blue-300">
                  <p className="text-sm text-blue-900">
                    💡 <b>كيفية الاستخدام:</b><br/>
                    1. اختر "متدرب موجود" أو "متدرب جديد"<br/>
                    2. أدخل بيانات المتدرب<br/>
                    3. اختر اللجنة المراد الإضافة إليها<br/>
                    4. راجع التحذيرات والتعارضات<br/>
                    5. أكد الإضافة
                  </p>
                </div>
              </div>

              {/* Delete Student Section */}
              <div className="border rounded-lg p-6 bg-gradient-to-br from-red-50 to-red-0 border-red-200">
                <h4 className="font-bold text-lg mb-4 flex items-center gap-2 text-red-800">
                  <Trash2 size={20} /> حذف متدرب من لجنة
                </h4>

                <div className="space-y-4">
                  {data.exams.length === 0 ? (
                    <p className="text-gray-500 text-sm">لا توجد بيانات اختبارات متاحة. أضف بيانات الامتحانات أولاً.</p>
                  ) : (
                    <div className="space-y-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">1. اختر المقرر / الاختبار</label>
                        <select
                          value={deleteExamKey}
                          onChange={(e) => {
                            setDeleteExamKey(e.target.value);
                            setDeleteCommitteeId('');
                            setDeleteError('');
                          }}
                          className="w-full border-gray-300 rounded-lg shadow-sm focus:ring-tvtc-green focus:border-tvtc-green"
                        >
                          <option value="">اختر المقرر</option>
                          {data.exams.map(exam => (
                            <option key={`${exam.courseCode}:::${exam.specialization}`} value={`${exam.courseCode}:::${exam.specialization}`}>
                              {exam.courseCode} - {exam.courseName}{exam.specialization && exam.specialization !== 'عام' ? ` (${exam.specialization})` : ''}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">2. اختر اللجنة</label>
                        <select
                          value={deleteCommitteeId}
                          onChange={(e) => {
                            setDeleteCommitteeId(e.target.value);
                            setDeleteError('');
                          }}
                          disabled={!selectedDeleteExam || deleteCommitteesByExam.length === 0}
                          className="w-full border-gray-300 rounded-lg shadow-sm focus:ring-tvtc-green focus:border-tvtc-green disabled:cursor-not-allowed disabled:bg-gray-100"
                        >
                          <option value="">اختر اللجنة</option>
                          {deleteCommitteesByExam.map(committee => (
                            <option key={committee.id} value={committee.id}>
                              {committee.id} — غرفة {committee.roomId} — {committee.studentIds.length} متدربين
                            </option>
                          ))}
                        </select>
                      </div>

                      {deleteError && <div className="text-sm text-red-700">{deleteError}</div>}

                      <div className="bg-white rounded-lg border border-gray-200 p-4">
                        <div className="font-semibold mb-2">3. قائمة المتدربين في اللجنة</div>
                        {selectedDeleteCommittee ? (
                          deleteStudents.length > 0 ? (
                            <div className="space-y-2 max-h-64 overflow-y-auto">
                              {deleteStudents.map(student => (
                                <div key={student.id} className="flex justify-between items-center bg-gray-50 p-3 rounded">
                                  <div>
                                    <div className="font-medium">{student.name}</div>
                                    <div className="text-xs text-gray-500">{student.id}</div>
                                  </div>
                                  <button
                                    onClick={() => openDeleteModal(student, selectedDeleteCommittee)}
                                    disabled={isReadOnly}
                                    className="text-red-600 hover:text-red-800 px-3 py-1 rounded border border-red-200 hover:bg-red-50 disabled:opacity-30 disabled:cursor-not-allowed"
                                  >
                                    حذف
                                  </button>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <p className="text-gray-500 text-sm">لا يوجد متدربين في هذه اللجنة.</p>
                          )
                        ) : (
                          <p className="text-gray-500 text-sm">اختر لجنة لعرض المتدربين.</p>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Add Student Modal */}
      {isAddStudentModalOpen && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl my-8">
            <div className="p-6 border-b border-gray-200 flex justify-between items-center bg-gradient-to-r from-blue-50 to-blue-0">
              <h3 className="text-xl font-bold flex items-center gap-2">
                <UserCheck size={24} className="text-blue-600" />
                إضافة متدرب إلى لجنة
              </h3>
              <button 
                onClick={() => {
                  setIsAddStudentModalOpen(false);
                  setSelectedStudent(null);
                  setSearchedStudents([]);
                  setNewStudentData({ id: '', name: '', specialization: '', courseCodes: [] });
                }}
                className="text-gray-500 hover:text-gray-700"
              >
                <X size={24} />
              </button>
            </div>

            <div className="p-6 space-y-6 max-h-[70vh] overflow-y-auto">
              {/* Mode Selection */}
              <div className="flex gap-4">
                <label className="flex items-center gap-2 cursor-pointer flex-1 p-3 border-2 rounded-lg transition-colors" style={{borderColor: studentMode === 'existing' ? '#006d5b' : '#ddd', backgroundColor: studentMode === 'existing' ? '#f0fdf4' : '#fff'}}>
                  <input 
                    type="radio" 
                    name="mode" 
                    value="existing" 
                    checked={studentMode === 'existing'} 
                    onChange={(e) => {
                      setStudentMode('existing');
                      setNewStudentData({ id: '', name: '', specialization: '', courseCodes: [] });
                      setSelectedStudent(null);
                    }}
                    className="w-4 h-4"
                  />
                  <span className="font-semibold">متدرب موجود بالفعل</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer flex-1 p-3 border-2 rounded-lg transition-colors" style={{borderColor: studentMode === 'new' ? '#006d5b' : '#ddd', backgroundColor: studentMode === 'new' ? '#f0fdf4' : '#fff'}}>
                  <input 
                    type="radio" 
                    name="mode" 
                    value="new" 
                    checked={studentMode === 'new'} 
                    onChange={(e) => {
                      setStudentMode('new');
                      setSearchedStudents([]);
                      setSelectedStudent(null);
                    }}
                    className="w-4 h-4"
                  />
                  <span className="font-semibold">متدرب جديد</span>
                </label>
              </div>

              {/* Existing Student Mode */}
              {studentMode === 'existing' && (
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium mb-2">ابحث عن المتدرب (الرقم أو الاسم)</label>
                    <input 
                      type="text" 
                      placeholder="مثال: 44110022 أو أحمد" 
                      value={searchStudentId}
                      onChange={(e) => {
                        setSearchStudentId(e.target.value);
                        searchStudents(e.target.value);
                      }}
                      className="w-full border rounded-lg p-3 focus:ring-2 focus:ring-blue-500 outline-none"
                    />
                  </div>

                  {searchedStudents.length > 0 && (
                    <div className="border rounded-lg overflow-hidden">
                      <div className="bg-gray-100 px-4 py-2 font-semibold text-sm">
                        نتائج البحث ({searchedStudents.length})
                      </div>
                      <div className="divide-y max-h-48 overflow-y-auto">
                        {searchedStudents.map(student => (
                          <button 
                            key={student.id}
                            onClick={() => handleSearchAndSelectStudent(student)}
                            className={`w-full text-right p-3 hover:bg-blue-50 transition-colors ${selectedStudent?.id === student.id ? 'bg-blue-100 border-l-4 border-blue-600' : ''}`}
                          >
                            <div className="font-semibold">{student.name}</div>
                            <div className="text-sm text-gray-600">الرقم: {student.id} | التخصص: {student.specialization}</div>
                            <div className="text-xs text-gray-500">المقررات: {student.courseCodes.join(', ')}</div>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* New Student Mode */}
              {studentMode === 'new' && (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium mb-2">الرقم التدريبي *</label>
                      <input 
                        type="text" 
                        placeholder="44110022" 
                        value={newStudentData.id}
                        onChange={(e) => setNewStudentData({...newStudentData, id: e.target.value})}
                        className="w-full border rounded-lg p-2 focus:ring-2 focus:ring-blue-500 outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-2">اسم المتدرب *</label>
                      <input 
                        type="text" 
                        placeholder="أحمد محمد" 
                        value={newStudentData.name}
                        onChange={(e) => setNewStudentData({...newStudentData, name: e.target.value})}
                        className="w-full border rounded-lg p-2 focus:ring-2 focus:ring-blue-500 outline-none"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium mb-2">التخصص *</label>
                    <input 
                      type="text" 
                      placeholder="تقنية شبكات" 
                      value={newStudentData.specialization}
                      onChange={(e) => setNewStudentData({...newStudentData, specialization: e.target.value})}
                      className="w-full border rounded-lg p-2 focus:ring-2 focus:ring-blue-500 outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium mb-2">المقررات المسجلة</label>
                    <div className="border rounded-lg p-3 bg-gray-50 max-h-32 overflow-y-auto space-y-2">
                      {newStudentData.courseCodes.length === 0 ? (
                        <p className="text-gray-500 text-sm">لا توجد مقررات مضافة</p>
                      ) : (
                        newStudentData.courseCodes.map((code, idx) => (
                          <div key={idx} className="flex justify-between items-center bg-white p-2 rounded border">
                            <span className="font-semibold">{code}</span>
                            <button 
                              onClick={() => setNewStudentData({...newStudentData, courseCodes: newStudentData.courseCodes.filter((_, i) => i !== idx)})}
                              className="text-red-600 hover:text-red-800"
                            >
                              <X size={16} />
                            </button>
                          </div>
                        ))
                      )}
                    </div>
                    
                    <div className="flex gap-2 mt-2">
                      <select 
                        value={selectedCourse}
                        onChange={(e) => setSelectedCourse(e.target.value)}
                        className="flex-1 border rounded-lg p-2 bg-white"
                      >
                        <option value="">-- اختر مقرر --</option>
                        {data.exams.map(exam => (
                          <option key={exam.courseCode} value={exam.courseCode}>
                            {exam.courseCode} - {exam.courseName}
                          </option>
                        ))}
                      </select>
                      <button 
                        onClick={() => {
                          if (selectedCourse && !newStudentData.courseCodes.includes(selectedCourse)) {
                            setNewStudentData({...newStudentData, courseCodes: [...newStudentData.courseCodes, selectedCourse]});
                            setSelectedCourse('');
                          }
                        }}
                        className="bg-blue-600 text-white px-4 rounded-lg hover:bg-blue-700"
                      >
                        إضافة
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Committee Selection */}
              {(selectedStudent || (studentMode === 'new' && newStudentData.id && newStudentData.name)) && (
                <div>
                  <label className="block text-sm font-medium mb-2">اختر اللجنة *</label>
                  <select 
                    value={selectedCommitteeId}
                    onChange={(e) => {
                      const committeeId = e.target.value;
                      if (committeeId) {
                        const committee = data.committees.find(c => c.id === committeeId);
                        if (committee) {
                          handleSelectCommittee(committee);
                        }
                      }
                    }}
                    className="w-full border rounded-lg p-3 bg-white focus:ring-2 focus:ring-blue-500 outline-none"
                  >
                    <option value="">-- اختر لجنة --</option>
                    {data.committees.map(committee => {
                      const exam = data.exams.find(e => e.courseCode === committee.examCode && e.specialization === committee.specialization);
                      const room = data.rooms.find(r => r.id === committee.roomId);
                      return (
                        <option key={committee.id} value={committee.id}>
                          {committee.id} - {exam?.courseName} ({exam?.date} - {exam?.time}) | القاعة: {room?.name} | المتدربين: {committee.studentIds.length}
                        </option>
                      );
                    })}
                  </select>
                </div>
              )}
            </div>

            <div className="p-6 border-t bg-gray-50 flex justify-end gap-3">
              <button 
                onClick={() => {
                  setIsAddStudentModalOpen(false);
                  setSelectedStudent(null);
                  setNewStudentData({ id: '', name: '', specialization: '', courseCodes: [] });
                }}
                className="px-6 py-2 rounded-lg border border-gray-300 bg-white hover:bg-gray-100 font-semibold"
              >
                إلغاء
              </button>
              <button 
                onClick={handleConfirmAddStudent}
                disabled={!previewData_Student || isReadOnly}
                className="px-6 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed font-semibold flex items-center gap-2"
              >
                <CheckCircle size={18} /> تأكيد الإضافة
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Preview Add Student Modal */}
      {previewData_Student && !isDeleteStudentModalOpen && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-xl">
            <div className="p-6 border-b bg-gradient-to-r from-green-50 to-green-0">
              <h3 className="text-xl font-bold flex items-center gap-2 text-green-800">
                <CheckCircle size={24} /> معاينة الإضافة
              </h3>
            </div>

            <div className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="p-4 rounded-lg bg-blue-50 border border-blue-200">
                  <div className="text-xs text-blue-600 font-semibold mb-1">المتدرب</div>
                  <div className="font-bold text-lg">{previewData_Student.student.name}</div>
                  <div className="text-sm text-gray-600">{previewData_Student.student.id}</div>
                  <div className="text-sm text-gray-600">{previewData_Student.student.specialization}</div>
                </div>

                <div className="p-4 rounded-lg bg-green-50 border border-green-200">
                  <div className="text-xs text-green-600 font-semibold mb-1">اللجنة</div>
                  <div className="font-bold text-lg">{previewData_Student.committee.id}</div>
                  <div className="text-sm text-gray-600">{previewData_Student.exam.courseName}</div>
                  <div className="text-sm text-gray-600">{previewData_Student.exam.date} - {previewData_Student.exam.time}</div>
                </div>
              </div>

              <div className="p-4 rounded-lg bg-yellow-50 border border-yellow-200">
                <div className="text-xs font-semibold text-yellow-700 mb-2">معلومات اللجنة الحالية</div>
                <div className="grid grid-cols-3 gap-2 text-sm">
                  <div>
                    <span className="text-gray-600">القاعة:</span><br/>
                    <span className="font-semibold">{previewData_Student.room?.name}</span>
                  </div>
                  <div>
                    <span className="text-gray-600">المتدربين الحاليين:</span><br/>
                    <span className="font-semibold">{previewData_Student.committee.studentIds.length}</span>
                  </div>
                  <div>
                    <span className="text-gray-600">السعة:</span><br/>
                    <span className="font-semibold">{previewData_Student.room?.capacity}</span>
                  </div>
                </div>
              </div>

              <div className="p-4 rounded-lg bg-orange-50 border border-orange-200">
                <div className="text-xs font-semibold text-orange-700 mb-2">⚠️ ملاحظات تحذيرية</div>
                <div className="text-sm text-gray-700 space-y-1">
                  {(() => {
                    const validation = validateStudentAddition(previewData_Student.student, previewData_Student.committee);
                    return validation.errors.length > 0 
                      ? validation.errors.map((e, idx) => <div key={idx}>{e}</div>)
                      : <div className="text-green-700 font-semibold">✅ لا توجد تنبيهات</div>;
                  })()}
                </div>
              </div>
            </div>

            <div className="p-6 border-t bg-gray-50 flex justify-end gap-3">
              <button 
                onClick={() => setPreviewData_Student(null)}
                className="px-6 py-2 rounded-lg border border-gray-300 bg-white hover:bg-gray-100 font-semibold"
              >
                عودة
              </button>
              <button 
                onClick={handleConfirmAddStudent}
                disabled={isReadOnly}
                className="px-6 py-2 rounded-lg bg-green-600 text-white hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed font-semibold flex items-center gap-2"
              >
                <CheckCircle size={18} /> تأكيد النهائي وحفظ
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Student Modal */}
      {isDeleteStudentModalOpen && deleteConfirmation && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md">
            <div className="p-6 border-b bg-gradient-to-r from-red-50 to-red-0">
              <h3 className="text-xl font-bold flex items-center gap-2 text-red-800">
                <AlertCircle size={24} /> تأكيد حذف المتدرب
              </h3>
            </div>

            <div className="p-6 space-y-4">
              <div className="p-4 rounded-lg bg-red-50 border border-red-200">
                <div className="text-sm text-red-800 space-y-2">
                  <p>هل أنت متأكد من حذف المتدرب التالي من اللجنة؟</p>
                  <div className="font-semibold text-lg mt-2">{deleteConfirmation.student.name}</div>
                  <div className="text-sm">الرقم: {deleteConfirmation.student.id}</div>
                  <div className="text-sm">اللجنة: {deleteConfirmation.committee.id}</div>
                </div>
              </div>

              <div className="p-4 rounded-lg bg-yellow-50 border border-yellow-200">
                <div className="text-xs font-semibold text-yellow-700 mb-1">⚠️ تنبيه مهم</div>
                <p className="text-sm text-yellow-900">
                  سيتم حذف المتدرب من اللجنة وقاعدة البيانات نهائياً. سيختفي من جميع الكشوفات والتقارير. هذا الإجراء لا يمكن التراجع عنه.
                </p>
              </div>
            </div>

            <div className="p-6 border-t bg-gray-50 flex justify-end gap-3">
              <button 
                onClick={() => {
                  setDeleteConfirmation(null);
                  setIsDeleteStudentModalOpen(false);
                }}
                className="px-6 py-2 rounded-lg border border-gray-300 bg-white hover:bg-gray-100 font-semibold"
              >
                إلغاء الأمر
              </button>
              <button 
                onClick={handleDeleteStudent}
                disabled={isReadOnly}
                className="px-6 py-2 rounded-lg bg-red-600 text-white hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed font-semibold flex items-center gap-2"
              >
                <Trash2 size={18} /> تأكيد الحذف نهائياً
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Room Modal */}
      {isRoomModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg p-6 w-full max-w-md shadow-xl">
                <div className="flex justify-between items-center mb-4">
                    <h3 className="text-xl font-bold">{isEditingRoom ? 'تعديل قاعة/معمل' : 'إضافة قاعة/معمل جديد'}</h3>
                    <button onClick={() => setIsRoomModalOpen(false)} className="text-gray-500 hover:text-gray-700">
                        <X size={24} />
                    </button>
                </div>
                
                <div className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium mb-1">اسم القاعة</label>
                        <input 
                            type="text" 
                            value={currentRoom.name} 
                            onChange={(e) => setCurrentRoom({...currentRoom, name: e.target.value})}
                            className="w-full border rounded p-2 focus:ring-2 focus:ring-tvtc-green outline-none bg-white"
                            placeholder="مثال: قاعة 101"
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium mb-1">النوع</label>
                        <select 
                             value={currentRoom.type}
                             onChange={(e) => setCurrentRoom({...currentRoom, type: e.target.value as 'Hall' | 'Lab'})}
                             className="w-full border rounded p-2 focus:ring-2 focus:ring-tvtc-green outline-none bg-white"
                        >
                            <option value="Hall">قاعة دراسية (ورقي)</option>
                            <option value="Lab">معمل حاسب (بلاكبورد)</option>
                        </select>
                    </div>
                    <div>
                        <label className="block text-sm font-medium mb-1">السعة الاستيعابية</label>
                        <input 
                            type="number" 
                            value={currentRoom.capacity} 
                            onChange={(e) => setCurrentRoom({...currentRoom, capacity: parseInt(e.target.value) || 0})}
                            className="w-full border rounded p-2 focus:ring-2 focus:ring-tvtc-green outline-none bg-white"
                        />
                    </div>
                    
                    <button 
                        onClick={handleSaveRoom}
                        className="w-full bg-tvtc-green text-white py-2 rounded font-bold hover:bg-green-800 flex justify-center items-center gap-2 mt-4"
                    >
                        <Save size={18} /> حفظ
                    </button>
                </div>
            </div>
        </div>
      )}

      {/* Committee Edit Modal */}
      {isCommitteeModalOpen && editingCommittee && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg p-6 w-full max-w-md shadow-xl">
                <div className="flex justify-between items-center mb-4">
                    <h3 className="text-xl font-bold">تعديل اللجنة {editingCommittee.id}</h3>
                    <button onClick={() => setIsCommitteeModalOpen(false)} className="text-gray-500 hover:text-gray-700">
                        <X size={24} />
                    </button>
                </div>
                
                <div className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium mb-1">القاعة</label>
                        <select 
                             value={editingCommittee.roomId}
                             onChange={(e) => setEditingCommittee({...editingCommittee, roomId: e.target.value})}
                             className="w-full border rounded p-2 focus:ring-2 focus:ring-tvtc-green outline-none bg-white"
                        >
                            <option value="">اختر القاعة</option>
                            {data.rooms.map(room => (
                                <option key={room.id} value={room.id}>{room.name} (سعة: {room.capacity})</option>
                            ))}
                        </select>
                    </div>
                    <div>
                        <label className="block text-sm font-medium mb-1">المراقب الأول</label>
                        <select 
                             value={editingCommittee.proctorIds[0] || ''}
                             onChange={(e) => {
                                 const newProctors = [...editingCommittee.proctorIds];
                                 newProctors[0] = e.target.value;
                                 setEditingCommittee({...editingCommittee, proctorIds: newProctors});
                             }}
                             className="w-full border rounded p-2 focus:ring-2 focus:ring-tvtc-green outline-none bg-white"
                        >
                            <option value="">اختر المراقب</option>
                            {data.proctors.map(proctor => (
                                <option key={proctor.id} value={proctor.id}>{proctor.name}</option>
                            ))}
                        </select>
                    </div>
                    <div>
                        <label className="block text-sm font-medium mb-1">المراقب الثاني</label>
                        <select 
                             value={editingCommittee.proctorIds[1] || ''}
                             onChange={(e) => {
                                 const newProctors = [...editingCommittee.proctorIds];
                                 newProctors[1] = e.target.value;
                                 setEditingCommittee({...editingCommittee, proctorIds: newProctors});
                             }}
                             className="w-full border rounded p-2 focus:ring-2 focus:ring-tvtc-green outline-none bg-white"
                        >
                            <option value="">اختر المراقب</option>
                            {data.proctors.map(proctor => (
                                <option key={proctor.id} value={proctor.id}>{proctor.name}</option>
                            ))}
                        </select>
                    </div>
                    
                    <button 
                        onClick={handleSaveCommittee}
                        className="w-full bg-tvtc-green text-white py-2 rounded font-bold hover:bg-green-800 flex justify-center items-center gap-2 mt-4"
                    >
                        <Save size={18} /> حفظ التغييرات
                    </button>
                </div>
            </div>
        </div>
      )}

      {/* Master Schedule Modal */}
      {showMasterSchedule && renderMasterSchedule()}
    </div>
  );
};

export default ManagerDashboard;
