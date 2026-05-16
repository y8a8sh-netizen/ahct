import React, { useState, useMemo } from 'react';
import { Printer, Filter, Calendar, Layers, Users, BarChart3, Clock, MapPin, UserCheck, TrendingUp, FileText, Search } from 'lucide-react';
import { Committee, Exam, Room, Student, Proctor } from '../types';
import PrintProctorSchedules from './PrintProctorSchedules';
import { parseAnyDate, formatScheduleDateHtml } from '../utils/helpers';

interface DeptHeadPortalProps {
  data: {
    committees: Committee[];
    exams: Exam[];
    rooms: Room[];
    students: Student[];
    proctors: Proctor[];
  }
}

const DeptHeadPortal: React.FC<DeptHeadPortalProps> = ({ data }) => {
  const [activeTab, setActiveTab] = useState<'committees' | 'print' | 'proctors'>('committees');
  const [selectedDept, setSelectedDept] = useState<string>('');
  const [selectedDate, setSelectedDate] = useState<string>('');
  const [searchTerm, setSearchTerm] = useState('');
  const [viewMode, setViewMode] = useState<'cards' | 'table'>('cards');

  // 1. Extract Unique Departments
  const departments = useMemo(() => {
    const depts = new Set<string>();
    data.exams.forEach(e => {
        if (e.department) depts.add(e.department);
    });
    return Array.from(depts).sort();
  }, [data.exams]);

  // 2. Extract Unique Dates for selected Department
  const availableDates = useMemo(() => {
      const dates = new Set<string>();
      data.exams.forEach(e => {
          if (!selectedDept || e.department === selectedDept) {
              if (e.date) dates.add(e.date);
          }
      });
      return Array.from(dates).sort();
  }, [data.exams, selectedDept]);

  // 3. Filter Committees
  const filteredCommittees = useMemo(() => {
      return data.committees.filter(comm => {
          let exam = data.exams.find(e => e.courseCode === comm.examCode && e.specialization === comm.specialization);
          if (!exam) exam = data.exams.find(e => e.courseCode === comm.examCode);

          if (!exam) return false;
          const deptMatch = selectedDept ? exam.department === selectedDept : true;
          const dateMatch = selectedDate ? exam.date === selectedDate : true;
          
          const searchMatch = searchTerm ? 
            (comm.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
             exam?.courseName.toLowerCase().includes(searchTerm.toLowerCase()) ||
             exam?.courseCode.toLowerCase().includes(searchTerm.toLowerCase())) : true;
          
          return deptMatch && dateMatch && searchMatch;
      });
  }, [data.committees, data.exams, selectedDept, selectedDate, searchTerm]);

  // 4. حساب الإحصائيات
  const statistics = useMemo(() => {
    const filtered = filteredCommittees;
    const totalStudents = filtered.reduce((sum, comm) => sum + comm.studentIds.length, 0);
    const totalProctors = new Set(filtered.flatMap(comm => comm.proctorIds)).size;
    const totalRooms = new Set(filtered.map(comm => comm.roomId)).size;

    return {
      totalCommittees: filtered.length,
      totalStudents,
      totalProctors,
      totalRooms,
      avgStudentsPerCommittee: filtered.length > 0 ? Math.round(totalStudents / filtered.length) : 0,
    };
  }, [filteredCommittees]);

  // 5. تجميع اللجان حسب المقرر
  const groupedByExam = useMemo(() => {
    const groups: Record<string, {
      exam: Exam | undefined;
      committees: Committee[];
      totalStudents: number;
      proctors: Set<string>;
      rooms: Set<string>;
    }> = {};

    filteredCommittees.forEach(comm => {
      let exam = data.exams.find(e => e.courseCode === comm.examCode && e.specialization === comm.specialization);
      if (!exam) exam = data.exams.find(e => e.courseCode === comm.examCode);
      
      if (!exam) return;
      
      const key = `${exam.courseCode}-${exam.date}-${exam.time}`;
      
      if (!groups[key]) {
        groups[key] = {
          exam,
          committees: [],
          totalStudents: 0,
          proctors: new Set(),
          rooms: new Set()
        };
      }
      
      groups[key].committees.push(comm);
      groups[key].totalStudents += comm.studentIds.length;
      comm.proctorIds.forEach(pid => groups[key].proctors.add(pid));
      groups[key].rooms.add(comm.roomId);
    });

    // ترتيب المجموعات حسب التاريخ والوقت
    const sortedGroups = Object.values(groups).sort((a, b) => {
      if (!a.exam || !b.exam) return 0;
      
      // مقارنة التواريخ
      const dateA = parseAnyDate(a.exam.date);
      const dateB = parseAnyDate(b.exam.date);
      
      if (dateA && dateB) {
        const dateDiff = dateA.getTime() - dateB.getTime();
        if (dateDiff !== 0) return dateDiff;
      }
      
      // إذا كان التاريخ نفسه، قارن الوقت
      const timeA = a.exam.time || '';
      const timeB = b.exam.time || '';
      
      // استخراج الساعة من الوقت (مثل "08:00 - 10:00" -> 08:00)
      const getTimeValue = (timeStr: string) => {
        const start = timeStr.split('-')[0].trim();
        const [h, m] = start.split(':').map(Number);
        return h * 60 + (m || 0);
      };
      
      return getTimeValue(timeA) - getTimeValue(timeB);
    });

    return sortedGroups;
  }, [filteredCommittees, data.exams]);

  // دالة طباعة كشوف اللجان
  const handlePrintExamCommittees = (committees: Committee[]) => {
    if (committees.length === 0) return;

    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    const ROWS_PER_PAGE = 18;
    let pagesHtml = '';

    committees.forEach((comm) => {
      let exam = data.exams.find(e => e.courseCode === comm.examCode && e.specialization === comm.specialization);
      if (!exam) exam = data.exams.find(e => e.courseCode === comm.examCode);

      const room = data.rooms.find(r => r.id === comm.roomId);
      const proctors = comm.proctorIds.map(pid => data.proctors.find(p => p.id === pid));
      const proctorNames = proctors.map(p => p?.name || '---').join(' / ');
      const committeeStudents = data.students.filter(s => comm.studentIds.includes(s.id));
      
      const totalPages = Math.ceil(Math.max(committeeStudents.length, 1) / ROWS_PER_PAGE);

      for (let page = 1; page <= totalPages; page++) {
        const startIndex = (page - 1) * ROWS_PER_PAGE;
        const endIndex = startIndex + ROWS_PER_PAGE;
        const pageStudents = committeeStudents.slice(startIndex, endIndex);

        let studentRows = '';
        pageStudents.forEach((student, idx) => {
          const globalIndex = startIndex + idx + 1;
          studentRows += `
            <tr>
              <td style="text-align:center">${globalIndex}</td>
              <td style="font-family: monospace; font-size:14px; text-align:center;">${student.id}</td>
              <td style="padding-right: 10px;">${student.name}</td>
              <td></td>
              <td></td>
            </tr>
          `;
        });

        const rowsOnThisPage = pageStudents.length;
        if (rowsOnThisPage < ROWS_PER_PAGE) {
          const emptyRowsNeeded = ROWS_PER_PAGE - rowsOnThisPage;
          for (let i = 0; i < emptyRowsNeeded; i++) {
            studentRows += `
              <tr>
                <td style="text-align:center; color:#eee;">-</td>
                <td></td>
                <td></td>
                <td></td>
                <td></td>
              </tr>
            `;
          }
        }

        const headerContent = `
          <div class="header">
            <div class="header-right">
              <h1>الكلية التقنية بأحد رفيدة</h1>
              <div class="sub-title">كشف توقيع حضور الاختبار النهائي - ${exam?.department || 'عام'}</div>
            </div>
            <div class="header-left">
              <p><b>التاريخ:</b> ${formatScheduleDateHtml(exam?.date || '')}</p>
              <p><b>الوقت:</b> ${exam?.time}</p>
              <p><b>المدة:</b> ${exam?.duration} دقيقة</p>
            </div>
          </div>

          <div class="info-grid">
            <div><b>المقرر:</b> ${exam?.courseName} (${exam?.courseCode})</div>
            <div><b>القاعة:</b> ${room?.name}</div>
            <div><b>رقم اللجنة:</b> <span class="badge">${comm.id}</span></div>
            <div><b>المراقبين:</b> ${proctorNames}</div>
          </div>
        `;

        const footerContent = `
          <div class="footer-container">
            <div class="proctors-row">
              <div class="proctor-box">
                <p class="label">المراقب الأول</p>
                <p class="name">${proctors[0]?.name || '................................'}</p>
                <p class="sig">التوقيع: ................................</p>
              </div>
              <div class="proctor-box">
                <p class="label">المراقب الثاني</p>
                <p class="name">${proctors[1]?.name || '................................'}</p>
                <p class="sig">التوقيع: ................................</p>
              </div>
            </div>
            
            <div class="head-row">
              <div class="head-name">
                <span class="label">رئيس اللجان:</span> ........................................................
              </div>
              <div class="head-sig">
                <span class="label">التوقيع:</span> ................................
              </div>
            </div>
            
            <div class="page-number">
              صفحة ${page} من ${totalPages}
            </div>
          </div>
        `;

        pagesHtml += `
          <div class="page">
            <div class="content-wrapper">
              ${headerContent}
              
              <table>
                <thead>
                  <tr class="column-headers">
                    <th width="30">م</th>
                    <th width="100">الرقم التدريبي</th>
                    <th>اسم المتدرب</th>
                    <th width="90">التوقيع</th>
                    <th width="90">الملاحظات</th>
                  </tr>
                </thead>
                <tbody>
                  ${studentRows}
                </tbody>
              </table>

              ${footerContent}
            </div>
          </div>
        `;
      }
    });

    const fullHtml = `
      <!DOCTYPE html>
      <html dir="rtl">
      <head>
        <title>كشوف التحضير</title>
        <link href="https://fonts.googleapis.com/css2?family=Tajawal:wght@400;700&display=swap" rel="stylesheet">
        <style>
          @page { size: A4; margin: 0; }
          body { font-family: 'Tajawal', sans-serif; margin: 0; padding: 0; -webkit-print-color-adjust: exact; background: #fff; }
          
          .page { 
            width: 210mm;
            height: 296mm;
            padding: 10mm 10mm;
            box-sizing: border-box;
            page-break-after: always; 
            break-after: page;
            position: relative;
            display: flex;
            flex-direction: column;
          }
          
          .content-wrapper {
            flex: 1;
            display: flex;
            flex-direction: column;
          }
          
          .page-break:last-child { page-break-after: auto; break-after: auto; }
          
          table { width: 100%; border-collapse: collapse; font-size: 13px; margin-bottom: 10px; flex: 1; }
          
          th, td { border: 1px solid #999; padding: 4px 6px; text-align: right; height: 24px; }
          th { background-color: #eee; font-weight: bold; text-align: center; }

          .header { display: flex; justify-content: space-between; border-bottom: 2px solid #333; padding-bottom: 5px; margin-bottom: 10px; padding-top: 5px; }
          .header h1 { margin: 0 0 5px 0; font-size: 20px; color: #006d5b; }
          .sub-title { font-size: 14px; color: #555; }
          .header-left p { margin: 2px 0; font-size: 12px; }

          .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 5px; background: #f9f9f9; padding: 8px; border: 1px solid #ddd; margin-bottom: 10px; font-size: 12px; }
          .badge { background: #000; color: #fff; padding: 2px 6px; border-radius: 4px; font-weight: bold; }

          .footer-container {
            margin-top: auto;
            border-top: 2px solid #333;
            padding-top: 10px;
          }
          
          .proctors-row {
            display: flex;
            justify-content: space-between;
            margin-bottom: 10px;
          }
          
          .proctor-box {
            width: 45%;
            border: 1px solid #eee;
            padding: 5px;
            background: #fdfdfd;
            border-radius: 4px;
          }
          
          .proctor-box .label { font-size: 10px; color: #666; margin: 0 0 2px 0; font-weight: bold; }
          .proctor-box .name { font-size: 12px; font-weight: bold; margin: 0 0 5px 0; border-bottom: 1px dashed #ccc; padding-bottom: 2px; height: 16px; overflow: hidden; }
          .proctor-box .sig { font-size: 11px; margin: 0; color: #333; }
          
          .head-row {
            display: flex;
            justify-content: space-between;
            align-items: center;
            background: #f0fdf4;
            padding: 8px;
            border: 1px solid #dcfce7;
            border-radius: 4px;
            margin-bottom: 5px;
          }
          
          .head-name, .head-sig { font-size: 12px; color: #006d5b; }
          .head-row .label { font-weight: bold; color: #000; margin-left: 5px; }

          .page-number {
            text-align: left;
            font-size: 10px;
            color: #555;
            font-weight: bold;
            margin-top: 5px;
            border-top: 1px solid #eee;
            padding-top: 2px;
          }
        </style>
      </head>
      <body>
        ${pagesHtml}
        <script>window.onload = function() { window.print(); }</script>
      </body>
      </html>
    `;

    printWindow.document.write(fullHtml);
    printWindow.document.close();
  };

  // -------------------------------------------------------------
  // RENDER: Main Component with Tabs
  // -------------------------------------------------------------
  return (
    <div className="space-y-6">
      {/* Header with Title */}
      <div className="bg-gradient-to-r from-tvtc-green to-green-600 text-white p-6 rounded-xl shadow-lg">
        <div className="flex justify-between items-center">
          <div>
            <h2 className="text-3xl font-bold flex items-center gap-3 mb-2">
              <Layers size={32} /> بوابة رئيس القسم
            </h2>
            <p className="text-green-50">إدارة وعرض اللجان الامتحانية وطباعة كشوف الحضور</p>
          </div>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="flex border-b border-gray-200">
          <button
            onClick={() => setActiveTab('committees')}
            className={`flex-1 px-6 py-4 font-semibold text-sm transition-all flex items-center justify-center gap-2 ${
              activeTab === 'committees'
                ? 'bg-tvtc-green text-white border-b-2 border-tvtc-green'
                : 'text-gray-600 hover:bg-gray-50'
            }`}
          >
            <Layers size={18} />
            اللجان الامتحانية
          </button>
          <button
            onClick={() => setActiveTab('print')}
            className={`flex-1 px-6 py-4 font-semibold text-sm transition-all flex items-center justify-center gap-2 ${
              activeTab === 'print'
                ? 'bg-tvtc-green text-white border-b-2 border-tvtc-green'
                : 'text-gray-600 hover:bg-gray-50'
            }`}
          >
            <Printer size={18} />
            طباعة كشوف الحضور
          </button>
          <button
            onClick={() => setActiveTab('proctors')}
            className={`flex-1 px-6 py-4 font-semibold text-sm transition-all flex items-center justify-center gap-2 ${
              activeTab === 'proctors'
                ? 'bg-tvtc-green text-white border-b-2 border-tvtc-green'
                : 'text-gray-600 hover:bg-gray-50'
            }`}
          >
            <Users size={18} />
            جداول المراقبين
          </button>
        </div>
      </div>

      {/* Tab Content */}
      {activeTab === 'committees' && (
        <CommitteesTab 
          data={data}
          filteredCommittees={filteredCommittees}
          groupedByExam={groupedByExam}
          statistics={statistics}
          departments={departments}
          availableDates={availableDates}
          selectedDept={selectedDept}
          setSelectedDept={setSelectedDept}
          selectedDate={selectedDate}
          setSelectedDate={setSelectedDate}
          searchTerm={searchTerm}
          setSearchTerm={setSearchTerm}
          viewMode={viewMode}
          setViewMode={setViewMode}
          handlePrintExamCommittees={handlePrintExamCommittees}
        />
      )}

      {activeTab === 'print' && (
        <PrintTab 
          data={data}
          groupedByExam={groupedByExam}
          departments={departments}
          availableDates={availableDates}
          selectedDept={selectedDept}
          setSelectedDept={setSelectedDept}
          selectedDate={selectedDate}
          setSelectedDate={setSelectedDate}
          handlePrintExamCommittees={handlePrintExamCommittees}
        />
      )}

      {activeTab === 'proctors' && <PrintProctorSchedules data={data} />}
    </div>
  );
};

// -------------------------------------------------------------
// SUB-COMPONENT: Committees Tab
// -------------------------------------------------------------
interface CommitteesTabProps {
  data: DeptHeadPortalProps['data'];
  filteredCommittees: Committee[];
  groupedByExam: any[];
  statistics: any;
  departments: string[];
  availableDates: string[];
  selectedDept: string;
  setSelectedDept: (dept: string) => void;
  selectedDate: string;
  setSelectedDate: (date: string) => void;
  searchTerm: string;
  setSearchTerm: (term: string) => void;
  viewMode: 'cards' | 'table';
  setViewMode: (mode: 'cards' | 'table') => void;
  handlePrintExamCommittees: (committees: Committee[]) => void;
}

const CommitteesTab: React.FC<CommitteesTabProps> = ({
  data,
  filteredCommittees,
  groupedByExam,
  statistics,
  departments,
  availableDates,
  selectedDept,
  setSelectedDept,
  selectedDate,
  setSelectedDate,
  searchTerm,
  setSearchTerm,
  viewMode,
  setViewMode,
  handlePrintExamCommittees
}) => {
  return (
    <div className="space-y-6">
      {/* Statistics Dashboard */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
        <div className="bg-white p-5 rounded-xl shadow-sm border-2 border-blue-100 hover:shadow-md transition-all">
          <div className="flex items-center justify-between mb-2">
            <div className="bg-blue-100 p-3 rounded-lg">
              <Layers size={24} className="text-blue-600" />
            </div>
            <span className="text-3xl font-bold text-blue-600">{statistics.totalCommittees}</span>
          </div>
          <p className="text-sm text-gray-600 font-medium">إجمالي اللجان</p>
        </div>

        <div className="bg-white p-5 rounded-xl shadow-sm border-2 border-green-100 hover:shadow-md transition-all">
          <div className="flex items-center justify-between mb-2">
            <div className="bg-green-100 p-3 rounded-lg">
              <Users size={24} className="text-green-600" />
            </div>
            <span className="text-3xl font-bold text-green-600">{statistics.totalStudents}</span>
          </div>
          <p className="text-sm text-gray-600 font-medium">إجمالي المتدربين</p>
        </div>

        <div className="bg-white p-5 rounded-xl shadow-sm border-2 border-purple-100 hover:shadow-md transition-all">
          <div className="flex items-center justify-between mb-2">
            <div className="bg-purple-100 p-3 rounded-lg">
              <UserCheck size={24} className="text-purple-600" />
            </div>
            <span className="text-3xl font-bold text-purple-600">{statistics.totalProctors}</span>
          </div>
          <p className="text-sm text-gray-600 font-medium">المراقبين المشاركين</p>
        </div>

        <div className="bg-white p-5 rounded-xl shadow-sm border-2 border-orange-100 hover:shadow-md transition-all">
          <div className="flex items-center justify-between mb-2">
            <div className="bg-orange-100 p-3 rounded-lg">
              <MapPin size={24} className="text-orange-600" />
            </div>
            <span className="text-3xl font-bold text-orange-600">{statistics.totalRooms}</span>
          </div>
          <p className="text-sm text-gray-600 font-medium">القاعات المستخدمة</p>
        </div>

        <div className="bg-white p-5 rounded-xl shadow-sm border-2 border-teal-100 hover:shadow-md transition-all">
          <div className="flex items-center justify-between mb-2">
            <div className="bg-teal-100 p-3 rounded-lg">
              <TrendingUp size={24} className="text-teal-600" />
            </div>
            <span className="text-3xl font-bold text-teal-600">{statistics.avgStudentsPerCommittee}</span>
          </div>
          <p className="text-sm text-gray-600 font-medium">متوسط/لجنة</p>
        </div>
      </div>

      {/* Filters and Search Panel */}
      <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
        <div className="flex items-center gap-2 mb-4 pb-3 border-b">
          <Filter size={20} className="text-gray-600" />
          <h3 className="text-lg font-bold text-gray-800">التصفية والبحث</h3>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium mb-2 flex items-center gap-1 text-gray-700">
              <Filter size={16}/> اختر القسم
            </label>
            <select 
              value={selectedDept}
              onChange={(e) => {
                setSelectedDept(e.target.value);
                setSelectedDate('');
              }}
              className="w-full p-3 border-2 border-gray-200 rounded-lg bg-white outline-none focus:ring-2 focus:ring-tvtc-green focus:border-tvtc-green transition-all"
            >
              <option value="">-- جميع الأقسام --</option>
              {departments.map(d => (
                <option key={d} value={d}>{d}</option>
              ))}
            </select>
          </div>
          
          <div>
            <label className="block text-sm font-medium mb-2 flex items-center gap-1 text-gray-700">
              <Calendar size={16}/> اختر التاريخ
            </label>
            <select 
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="w-full p-3 border-2 border-gray-200 rounded-lg bg-white outline-none focus:ring-2 focus:ring-tvtc-green focus:border-tvtc-green transition-all"
            >
              <option value="">-- جميع الأيام --</option>
              {availableDates.map(d => (
                <option key={d} value={d}>{d}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium mb-2 flex items-center gap-1 text-gray-700">
              <Search size={16}/> البحث
            </label>
            <input 
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="ابحث برقم اللجنة أو المقرر..."
              className="w-full p-3 border-2 border-gray-200 rounded-lg bg-white outline-none focus:ring-2 focus:ring-tvtc-green focus:border-tvtc-green transition-all"
            />
          </div>
        </div>

        <div className="flex justify-between items-center mt-4 pt-4 border-t">
          <div className="text-sm">
            <span className="text-gray-600">تم العثور على </span>
            <span className="font-bold text-tvtc-green text-lg">{filteredCommittees.length}</span>
            <span className="text-gray-600"> لجنة</span>
          </div>
          
          <div className="flex gap-2">
            <button
              onClick={() => setViewMode('cards')}
              className={`px-4 py-2 rounded-lg flex items-center gap-2 transition-all ${
                viewMode === 'cards' ? 'bg-tvtc-green text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              <Layers size={16} /> بطاقات
            </button>
            <button
              onClick={() => setViewMode('table')}
              className={`px-4 py-2 rounded-lg flex items-center gap-2 transition-all ${
                viewMode === 'table' ? 'bg-tvtc-green text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              <FileText size={16} /> جدول
            </button>
          </div>
        </div>
      </div>

      {/* Results Display */}
      <div className="space-y-4">
        {filteredCommittees.length === 0 ? (
          <div className="bg-gradient-to-br from-gray-50 to-gray-100 p-16 text-center rounded-xl border-2 border-dashed border-gray-300">
            <div className="bg-white rounded-full w-20 h-20 flex items-center justify-center mx-auto mb-4 shadow-md">
              <Layers size={40} className="text-gray-400" />
            </div>
            <h3 className="text-2xl font-bold mb-2 text-gray-700">لا توجد لجان للعرض</h3>
            <p className="text-gray-500">يرجى تعديل الفلاتر أو البحث للعثور على اللجان المطلوبة</p>
          </div>
        ) : viewMode === 'cards' ? (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {groupedByExam.map((group, idx) => {
              const exam = group.exam;
              
              return (
                <div key={idx} className="bg-white border-2 border-gray-200 rounded-xl shadow-md hover:shadow-xl transition-all">
                  {/* رأس البطاقة - معلومات المقرر */}
                  <div className="bg-gradient-to-r from-tvtc-green to-green-600 text-white p-4 rounded-t-xl">
                    <div className="flex justify-between items-start mb-2">
                      <div className="flex-1">
                        <h3 className="text-xl font-bold mb-1">{exam?.courseName}</h3>
                        <div className="flex items-center gap-3 text-green-50 text-sm">
                          <span className="flex items-center gap-1">
                            <FileText size={14} />
                            {exam?.courseCode}
                          </span>
                          <span className="flex items-center gap-1">
                            <Calendar size={14} />
                            {exam?.date}
                          </span>
                          <span className="flex items-center gap-1">
                            <Clock size={14} />
                            {exam?.time}
                          </span>
                        </div>
                      </div>
                      <button
                        onClick={() => handlePrintExamCommittees(group.committees)}
                        className="bg-white text-tvtc-green px-4 py-2 rounded-lg hover:bg-green-50 transition-all flex items-center gap-2 font-semibold text-sm shadow-md"
                      >
                        <Printer size={16} />
                        طباعة الكشوف
                      </button>
                    </div>
                  </div>

                  {/* إحصائيات المقرر */}
                  <div className="grid grid-cols-3 gap-2 p-3 bg-gray-50 border-b">
                    <div className="text-center">
                      <div className="text-2xl font-bold text-blue-600">{group.committees.length}</div>
                      <div className="text-xs text-gray-600">لجنة</div>
                    </div>
                    <div className="text-center">
                      <div className="text-2xl font-bold text-green-600">{group.totalStudents}</div>
                      <div className="text-xs text-gray-600">متدرب</div>
                    </div>
                    <div className="text-center">
                      <div className="text-2xl font-bold text-purple-600">{group.rooms.size}</div>
                      <div className="text-xs text-gray-600">قاعة</div>
                    </div>
                  </div>

                  {/* قائمة اللجان */}
                  <div className="p-4">
                    <h4 className="text-sm font-bold text-gray-700 mb-3 flex items-center gap-2">
                      <Layers size={16} />
                      اللجان ({group.committees.length})
                    </h4>
                    <div className="space-y-2 max-h-80 overflow-y-auto">
                      {group.committees.map(comm => {
                        const room = data.rooms.find(r => r.id === comm.roomId);
                        const proctors = comm.proctorIds.map(pid => data.proctors.find(p => p.id === pid));
                        
                        return (
                          <div key={comm.id} className="bg-gray-50 p-3 rounded-lg border border-gray-200 hover:border-tvtc-green hover:bg-green-50 transition-all">
                            <div className="flex justify-between items-start mb-2">
                              <div className="flex items-center gap-2">
                                <span className="bg-tvtc-green text-white px-2 py-1 rounded font-bold text-sm">
                                  {comm.id}
                                </span>
                                <span className="bg-blue-100 text-blue-700 px-2 py-1 rounded text-xs font-medium">
                                  {comm.studentIds.length} متدرب
                                </span>
                              </div>
                              <div className="flex items-center gap-1 text-xs text-gray-600">
                                <MapPin size={12} className="text-purple-600" />
                                {room?.name || 'غير محدد'}
                              </div>
                            </div>
                            
                            <div className="text-xs text-gray-600 space-y-1">
                              <div className="flex items-start gap-1">
                                <UserCheck size={12} className="text-green-600 mt-0.5 flex-shrink-0" />
                                <div className="flex flex-wrap gap-1">
                                  {proctors.map((p, pidx) => (
                                    <span key={pidx} className="bg-green-100 text-green-700 px-2 py-0.5 rounded">
                                      {p?.name || 'غير محدد'}
                                    </span>
                                  ))}
                                </div>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gradient-to-r from-gray-50 to-gray-100 border-b-2 border-gray-200">
                  <tr>
                    <th className="px-4 py-3 text-right text-sm font-bold text-gray-700">رقم اللجنة</th>
                    <th className="px-4 py-3 text-right text-sm font-bold text-gray-700">المقرر</th>
                    <th className="px-4 py-3 text-right text-sm font-bold text-gray-700">التاريخ والوقت</th>
                    <th className="px-4 py-3 text-right text-sm font-bold text-gray-700">القاعة</th>
                    <th className="px-4 py-3 text-right text-sm font-bold text-gray-700">المراقبين</th>
                    <th className="px-4 py-3 text-center text-sm font-bold text-gray-700">المتدربين</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filteredCommittees.map((comm, idx) => {
                    let exam = data.exams.find(e => e.courseCode === comm.examCode && e.specialization === comm.specialization);
                    if (!exam) exam = data.exams.find(e => e.courseCode === comm.examCode);
                    
                    const room = data.rooms.find(r => r.id === comm.roomId);
                    const proctors = comm.proctorIds.map(pid => data.proctors.find(p => p.id === pid));
                    
                    return (
                      <tr key={comm.id} className={`hover:bg-green-50 transition-colors ${idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}`}>
                        <td className="px-4 py-3">
                          <span className="bg-tvtc-green text-white px-2 py-1 rounded font-bold text-sm">
                            {comm.id}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="font-medium text-gray-800">{exam?.courseName}</div>
                          <div className="text-xs text-gray-500">{exam?.courseCode}</div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="text-sm text-gray-700">{exam?.date}</div>
                          <div className="text-xs text-gray-500">{exam?.time} • {exam?.duration} دقيقة</div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1 text-sm text-gray-700">
                            <MapPin size={14} className="text-purple-600" />
                            {room?.name || 'غير محدد'}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="text-xs text-gray-600 space-y-0.5">
                            {proctors.map((p, idx) => (
                              <div key={idx}>{p?.name || 'غير محدد'}</div>
                            ))}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span className="bg-blue-100 text-blue-700 px-2 py-1 rounded-full text-sm font-medium">
                            {comm.studentIds.length}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

// -------------------------------------------------------------
// SUB-COMPONENT: Print Tab
// -------------------------------------------------------------
interface PrintTabProps {
  data: DeptHeadPortalProps['data'];
  groupedByExam: any[];
  departments: string[];
  availableDates: string[];
  selectedDept: string;
  setSelectedDept: (dept: string) => void;
  selectedDate: string;
  setSelectedDate: (date: string) => void;
  handlePrintExamCommittees: (committees: Committee[]) => void;
}

const PrintTab: React.FC<PrintTabProps> = ({
  data,
  groupedByExam,
  departments,
  availableDates,
  selectedDept,
  setSelectedDept,
  selectedDate,
  setSelectedDate,
  handlePrintExamCommittees
}) => {
  return (
    <div className="space-y-6">
      {/* Filters Panel */}
      <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
        <div className="flex items-center gap-2 mb-4 pb-3 border-b">
          <Filter size={20} className="text-gray-600" />
          <h3 className="text-lg font-bold text-gray-800">التصفية والبحث</h3>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-2 flex items-center gap-1 text-gray-700">
              <Filter size={16}/> اختر القسم
            </label>
            <select 
              value={selectedDept}
              onChange={(e) => {
                setSelectedDept(e.target.value);
                setSelectedDate('');
              }}
              className="w-full p-3 border-2 border-gray-200 rounded-lg bg-white outline-none focus:ring-2 focus:ring-tvtc-green focus:border-tvtc-green transition-all"
            >
              <option value="">-- جميع الأقسام --</option>
              {departments.map(d => (
                <option key={d} value={d}>{d}</option>
              ))}
            </select>
          </div>
          
          <div>
            <label className="block text-sm font-medium mb-2 flex items-center gap-1 text-gray-700">
              <Calendar size={16}/> اختر التاريخ
            </label>
            <select 
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="w-full p-3 border-2 border-gray-200 rounded-lg bg-white outline-none focus:ring-2 focus:ring-tvtc-green focus:border-tvtc-green transition-all"
            >
              <option value="">-- جميع الأيام --</option>
              {availableDates.map(d => (
                <option key={d} value={d}>{d}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex justify-between items-center mt-4 pt-4 border-t">
          <div className="text-sm">
            <span className="text-gray-600">تم العثور على </span>
            <span className="font-bold text-tvtc-green text-lg">{groupedByExam.length}</span>
            <span className="text-gray-600"> مقرر</span>
          </div>
        </div>
      </div>

      <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
        <div className="flex items-center gap-2 mb-4 pb-3 border-b">
          <Printer size={20} className="text-tvtc-green" />
          <h3 className="text-lg font-bold text-gray-800">طباعة كشوف الحضور</h3>
        </div>

        <p className="text-gray-600 mb-6">
          اختر المقرر الذي ترغب في طباعة كشوف الحضور لجميع لجانه.
        </p>

        {groupedByExam.length === 0 ? (
          <div className="bg-gradient-to-br from-gray-50 to-gray-100 p-16 text-center rounded-xl border-2 border-dashed border-gray-300">
            <div className="bg-white rounded-full w-20 h-20 flex items-center justify-center mx-auto mb-4 shadow-md">
              <Printer size={40} className="text-gray-400" />
            </div>
            <h3 className="text-2xl font-bold mb-2 text-gray-700">لا توجد مقررات للعرض</h3>
            <p className="text-gray-500">يرجى تعديل الفلاتر للعثور على المقررات المطلوبة</p>
          </div>
        ) : (
          <div className="space-y-4">
            {groupedByExam.map((group, idx) => {
              const exam = group.exam;
              
              return (
                <div key={idx} className="bg-gray-50 p-4 rounded-lg border border-gray-200 hover:border-tvtc-green transition-all">
                  <div className="flex justify-between items-center">
                    <div className="flex-1">
                      <h4 className="font-bold text-lg text-gray-800 mb-1">{exam?.courseName}</h4>
                      <div className="flex items-center gap-4 text-sm text-gray-600">
                        <span className="flex items-center gap-1">
                          <FileText size={14} />
                          {exam?.courseCode}
                        </span>
                        <span className="flex items-center gap-1">
                          <Calendar size={14} />
                          {exam?.date}
                        </span>
                        <span className="flex items-center gap-1">
                          <Clock size={14} />
                          {exam?.time}
                        </span>
                        <span className="flex items-center gap-1">
                          <Layers size={14} />
                          {group.committees.length} لجنة
                        </span>
                        <span className="flex items-center gap-1">
                          <Users size={14} />
                          {group.totalStudents} متدرب
                        </span>
                      </div>
                    </div>
                    <button
                      onClick={() => handlePrintExamCommittees(group.committees)}
                      className="bg-tvtc-green text-white px-6 py-3 rounded-lg hover:bg-green-700 transition-all flex items-center gap-2 font-semibold shadow-md"
                    >
                      <Printer size={18} />
                      طباعة الكشوف
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default DeptHeadPortal;
