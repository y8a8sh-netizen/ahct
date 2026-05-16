import React, { useState } from 'react';
import { Printer, Search } from 'lucide-react';
import { Proctor, Committee, Exam, Room } from '../types';
import ScheduleDateDisplay from '../components/ScheduleDateDisplay';
import { formatScheduleDateHtml, formatTodayDateHtml } from '../utils/helpers';

const PRINT_DATE_STYLES = `
  td.date-cell { text-align: center; vertical-align: middle; line-height: 1.4; min-width: 100px; }
  td.date-cell small { font-size: 11px; color: #006d5b; }
  .print-issued-date { text-align: center; font-size: 12px; color: #444; margin-top: 8px; }
`;

interface PrintProctorSchedulesProps {
  data: {
    proctors: Proctor[];
    committees: Committee[];
    exams: Exam[];
    rooms: Room[];
  };
}

const PrintProctorSchedules: React.FC<PrintProctorSchedulesProps> = ({ data }) => {
  const [selectedProctorId, setSelectedProctorId] = useState<string>('');
  const [selectedDepartment, setSelectedDepartment] = useState<string>('');
  const [showPrint, setShowPrint] = useState(false);

  // استخراج جميع الأقسام الفريدة
  const departments = Array.from(new Set(data.proctors.map(p => p.department || 'بدون قسم')));

  // تصفية المراقبين حسب القسم المختار
  const filteredProctors = selectedDepartment
    ? data.proctors.filter(p => (p.department || 'بدون قسم') === selectedDepartment)
    : data.proctors;


  const getExam = (comm: Committee) => {
    return data.exams.find(e => e.courseCode === comm.examCode && e.specialization === comm.specialization) ||
           data.exams.find(e => e.courseCode === comm.examCode);
  };

  const getRoom = (comm: Committee) => {
    return data.rooms.find(r => r.id === comm.roomId);
  };

  const proctor = data.proctors.find(p => p.id === selectedProctorId);
  // تجميع اللجان المتشابهة (نفس التاريخ، الوقت، المقرر، القاعة)
  const committeesRaw = data.committees.filter(c => c.proctorIds.includes(selectedProctorId));
  type GroupKey = string;
  interface GroupedRow {
    date: string;
    time: string;
    roomName: string;
    committeeIds: string[];
    courseNames: string[];
  }
  const grouped: Record<GroupKey, GroupedRow> = {};
  committeesRaw.forEach(comm => {
    const exam = getExam(comm);
    const room = getRoom(comm);
    if (!exam || !room) return;
    // الدمج حسب التاريخ + الوقت + القاعة فقط
    const key = `${exam.date}__${exam.time}__${room.name}`;
    if (!grouped[key]) {
      grouped[key] = {
        date: exam.date,
        time: exam.time,
        roomName: room.name,
        committeeIds: [],
        courseNames: []
      };
    }
    grouped[key].committeeIds.push(comm.id);
    if (!grouped[key].courseNames.includes(exam.courseName)) {
      grouped[key].courseNames.push(exam.courseName);
    }
  });
  const committees = Object.values(grouped);

  const handlePrint = () => {
    if (!proctor || !committees || committees.length === 0) return;

    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    const rowsHtml = committees.map((row, index) => `
      <tr>
        <td style="text-align:center; padding: 8px; border: 1px solid #ccc;">${index + 1}</td>
        <td class="date-cell" style="padding: 8px; border: 1px solid #ccc;">${formatScheduleDateHtml(row.date || '')}</td>
        <td style="padding: 8px; border: 1px solid #ccc;">${row.time || '---'}</td>
        <td style="padding: 8px; border: 1px solid #ccc;">${row.roomName || '---'}</td>
        <td style="padding: 8px; border: 1px solid #ccc;">${row.committeeIds.join(' ، ') || '---'}</td>
        <td style="padding: 8px; border: 1px solid #ccc;">${row.courseNames.join(' ، ') || '---'}</td>
      </tr>
    `).join('');

    const htmlContent = `
      <!DOCTYPE html>
      <html dir="rtl">
      <head>
        <title>جدول المراقبة - ${proctor.name}</title>
        <link href="https://fonts.googleapis.com/css2?family=Tajawal:wght@400;700&display=swap" rel="stylesheet">
        <style>
          @page { size: A4; margin: 15mm; }
          body { font-family: 'Tajawal', sans-serif; -webkit-print-color-adjust: exact; padding: 20px; }
          .header { text-align: center; border-bottom: 2px solid #006d5b; padding-bottom: 10px; margin-bottom: 20px; }
          .header h1 { color: #006d5b; margin: 0; font-size: 20px; }
          .header h2 { font-size: 14px; color: #555; margin-top: 5px; }
          
          .info-box { background: #f9f9f9; border: 1px solid #ddd; padding: 15px; border-radius: 8px; margin-bottom: 20px; display: flex; justify-content: space-between; flex-wrap: wrap; gap: 10px; }
          .info-item { font-size: 13px; flex: 1; min-width: 150px; }
          .info-item strong { color: #006d5b; }

          table { width: 100%; border-collapse: collapse; font-size: 12px; margin-bottom: 20px; }
          th, td { border: 1px solid #ccc; padding: 8px; text-align: right; }
          th { background-color: #eee; font-weight: bold; }
          tr:nth-child(even) { background-color: #fdfdfd; }
          ${PRINT_DATE_STYLES}
          .footer { margin-top: 40px; text-align: center; font-size: 11px; color: #777; border-top: 1px solid #eee; padding-top: 10px; }
          .page-break { page-break-after: always; }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>الكلية التقنية بأحد رفيدة</h1>
          <h2>جدول تكليف المراقبة للفصل التدريبي الحالي</h2>
          <div class="print-issued-date">تاريخ الطباعة: ${formatTodayDateHtml()}</div>
        </div>

        <div class="info-box">
          <div class="info-item"><strong>اسم المراقب:</strong> ${proctor.name}</div>
          <div class="info-item"><strong>الرقم الوظيفي:</strong> ${proctor.id}</div>
          <div class="info-item"><strong>القسم:</strong> ${proctor.department || 'عام'}</div>
          <div class="info-item"><strong>عدد اللجان:</strong> ${committees.length}</div>
        </div>

        <table>
          <thead>
            <tr>
              <th width="30">م</th>
              <th>اليوم والتاريخ</th>
              <th>الوقت</th>
              <th>القاعة</th>
              <th>أرقام اللجان</th>
              <th>المقررات</th>
            </tr>
          </thead>
          <tbody>
            ${rowsHtml}
          </tbody>
        </table>

        <div class="footer">
          <p>ملاحظة: يرجى الحضور قبل موعد الاختبار بـ 15 دقيقة.</p>
          <p>تم استخراج هذا الجدول آلياً من نظام جداول الاختبارات.</p>
        </div>
        <script>window.onload = function() { window.print(); }</script>
      </body>
      </html>
    `;

    printWindow.document.write(htmlContent);
    printWindow.document.close();
  };

  const handlePrintAllByDepartment = () => {
    if (!selectedDepartment || filteredProctors.length === 0) return;

    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    let allPages = '';
    
    filteredProctors.forEach((proc, proctorIndex) => {
      const procCommittees = data.committees.filter(c => c.proctorIds.includes(proc.id));
      type GroupKey = string;
      interface GroupedRow {
        date: string;
        time: string;
        roomName: string;
        committeeIds: string[];
        courseNames: string[];
      }
      const grouped: Record<GroupKey, GroupedRow> = {};
      procCommittees.forEach(comm => {
        const exam = getExam(comm);
        const room = getRoom(comm);
        if (!exam || !room) return;
        const key = `${exam.date}__${exam.time}__${room.name}`;
        if (!grouped[key]) {
          grouped[key] = {
            date: exam.date,
            time: exam.time,
            roomName: room.name,
            committeeIds: [],
            courseNames: []
          };
        }
        grouped[key].committeeIds.push(comm.id);
        if (!grouped[key].courseNames.includes(exam.courseName)) {
          grouped[key].courseNames.push(exam.courseName);
        }
      });
      const procCommitteesGrouped = Object.values(grouped);

      if (procCommitteesGrouped.length === 0) return;

      const rowsHtml = procCommitteesGrouped.map((row, index) => `
        <tr>
          <td style="text-align:center; padding: 8px; border: 1px solid #ccc;">${index + 1}</td>
          <td class="date-cell" style="padding: 8px; border: 1px solid #ccc;">${formatScheduleDateHtml(row.date || '')}</td>
          <td style="padding: 8px; border: 1px solid #ccc;">${row.time || '---'}</td>
          <td style="padding: 8px; border: 1px solid #ccc;">${row.roomName || '---'}</td>
          <td style="padding: 8px; border: 1px solid #ccc;">${row.committeeIds.join(' ، ') || '---'}</td>
          <td style="padding: 8px; border: 1px solid #ccc;">${row.courseNames.join(' ، ') || '---'}</td>
        </tr>
      `).join('');

      const pageContent = `
        <div style="page-break-after: ${proctorIndex < filteredProctors.length - 1 ? 'always' : 'avoid'};">
          <div style="text-align: center; border-bottom: 2px solid #006d5b; padding-bottom: 10px; margin-bottom: 20px;">
            <h1 style="color: #006d5b; margin: 0; font-size: 20px;">الكلية التقنية بأحد رفيدة</h1>
            <h2 style="font-size: 14px; color: #555; margin-top: 5px; margin: 0;">جدول تكليف المراقبة للفصل التدريبي الحالي</h2>
            <div style="font-size: 12px; color: #444; margin-top: 8px;">تاريخ الطباعة: ${formatTodayDateHtml()}</div>
          </div>

          <div style="background: #f9f9f9; border: 1px solid #ddd; padding: 15px; border-radius: 8px; margin-bottom: 20px; display: flex; justify-content: space-between; flex-wrap: wrap; gap: 10px;">
            <div style="font-size: 13px; flex: 1; min-width: 150px;"><strong style="color: #006d5b;">اسم المراقب:</strong> ${proc.name}</div>
            <div style="font-size: 13px; flex: 1; min-width: 150px;"><strong style="color: #006d5b;">الرقم الوظيفي:</strong> ${proc.id}</div>
            <div style="font-size: 13px; flex: 1; min-width: 150px;"><strong style="color: #006d5b;">القسم:</strong> ${proc.department || 'عام'}</div>
            <div style="font-size: 13px; flex: 1; min-width: 150px;"><strong style="color: #006d5b;">عدد اللجان:</strong> ${procCommitteesGrouped.length}</div>
          </div>

          <table style="width: 100%; border-collapse: collapse; font-size: 12px; margin-bottom: 20px;">
            <thead>
              <tr>
                <th style="border: 1px solid #ccc; padding: 8px; text-align: right; background-color: #eee; font-weight: bold; width: 30px;">م</th>
                <th style="border: 1px solid #ccc; padding: 8px; text-align: right; background-color: #eee; font-weight: bold;">اليوم والتاريخ</th>
                <th style="border: 1px solid #ccc; padding: 8px; text-align: right; background-color: #eee; font-weight: bold;">الوقت</th>
                <th style="border: 1px solid #ccc; padding: 8px; text-align: right; background-color: #eee; font-weight: bold;">القاعة</th>
                <th style="border: 1px solid #ccc; padding: 8px; text-align: right; background-color: #eee; font-weight: bold;">أرقام اللجان</th>
                <th style="border: 1px solid #ccc; padding: 8px; text-align: right; background-color: #eee; font-weight: bold;">المقررات</th>
              </tr>
            </thead>
            <tbody>
              ${rowsHtml}
            </tbody>
          </table>

          <div style="margin-top: 40px; text-align: center; font-size: 11px; color: #777; border-top: 1px solid #eee; padding-top: 10px;">
            <p>ملاحظة: يرجى الحضور قبل موعد الاختبار بـ 15 دقيقة.</p>
            <p>تم استخراج هذا الجدول آلياً من نظام جداول الاختبارات.</p>
          </div>
        </div>
      `;

      allPages += pageContent;
    });

    const htmlContent = `
      <!DOCTYPE html>
      <html dir="rtl">
      <head>
        <title>جداول المراقبة - ${selectedDepartment}</title>
        <link href="https://fonts.googleapis.com/css2?family=Tajawal:wght@400;700&display=swap" rel="stylesheet">
        <style>
          @page { size: A4; margin: 15mm; }
          body { font-family: 'Tajawal', sans-serif; -webkit-print-color-adjust: exact; padding: 20px; }
          ${PRINT_DATE_STYLES}
        </style>
      </head>
      <body>
        ${allPages}
        <script>window.onload = function() { window.print(); }</script>
      </body>
      </html>
    `;

    printWindow.document.write(htmlContent);
    printWindow.document.close();
  };

  return (
    <div className="max-w-3xl mx-auto p-4 print:p-0 print:w-full print:max-w-full">
      <style>{`
        @media print {
          body { background: #fff !important; }
          body * { visibility: hidden !important; }
          .print-area, .print-area * { visibility: visible !important; }
          .print-area { position: absolute !important; top: 0 !important; left: 0 !important; width: 100% !important; background: #fff !important; }
          .print-hide, .no-print { display: none !important; }
          .print-table th, .print-table td { font-size: 18px !important; padding: 12px 8px !important; }
          .print-table th { background: #f3f3f3 !important; color: #222 !important; border-bottom: 2px solid #222 !important; }
          .print-table td { border-bottom: 1px solid #bbb !important; }
          .print-table td.text-center { min-width: 120px !important; line-height: 1.4 !important; }
          .print-title { font-size: 28px !important; margin-bottom: 18px !important; }
          .print-proctor { font-size: 22px !important; margin-bottom: 10px !important; }
        }
      `}</style>
      <h2 className="text-xl font-bold mb-4 flex items-center gap-2 print-title print-hide">
        <Printer size={22}/> طباعة جداول المراقبين
      </h2>
      <div className="mb-4 flex gap-2 items-center flex-wrap print-hide">
        <Search size={18}/>
        <select
          className="border rounded p-2 min-w-[160px]"
          value={selectedDepartment}
          onChange={e => {
            setSelectedDepartment(e.target.value);
            setSelectedProctorId('');
          }}
        >
          <option value="">كل الأقسام</option>
          {departments.map(dep => (
            <option key={dep} value={dep}>{dep}</option>
          ))}
        </select>
        <select
          className="border rounded p-2 min-w-[200px]"
          value={selectedProctorId}
          onChange={e => setSelectedProctorId(e.target.value)}
        >
          <option value="">اختر المراقب</option>
          {filteredProctors.map(p => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
        <button
          className="bg-tvtc-green text-white px-4 py-2 rounded ml-2 disabled:opacity-50 disabled:cursor-not-allowed"
          onClick={handlePrint}
          disabled={!selectedProctorId}
        >
          <Printer size={16} className="inline-block mr-1"/> طباعة المراقب
        </button>
        <button
          className="bg-blue-600 text-white px-4 py-2 rounded ml-2 disabled:opacity-50 disabled:cursor-not-allowed"
          onClick={handlePrintAllByDepartment}
          disabled={!selectedDepartment}
        >
          <Printer size={16} className="inline-block mr-1"/> طباعة القسم
        </button>
      </div>
      {proctor && (
        <div className={showPrint ? 'print-area' : ''}>
          <h3 className="font-bold text-lg mb-2 print-proctor">{proctor.name}</h3>
          <table className="w-full border mt-2 print-table" style={{ borderCollapse: 'collapse' }}>
            <thead>
              <tr className="bg-gray-100">
                <th className="p-2 border">اليوم والتاريخ</th>
                <th className="p-2 border">الوقت</th>
                <th className="p-2 border">القاعة</th>
                <th className="p-2 border">أرقام اللجان</th>
                <th className="p-2 border">المقررات</th>
              </tr>
            </thead>
            <tbody>
              {committees.map(row => (
                <tr key={row.date + row.time + row.roomName} style={{ pageBreakInside: 'avoid', height: 40 }}>
                  <td className="p-2 border text-center">
                    <ScheduleDateDisplay date={row.date} />
                  </td>
                  <td className="p-2 border font-semibold text-base">{row.time}</td>
                  <td className="p-2 border font-semibold text-base">{row.roomName}</td>
                  <td className="p-2 border text-base">{row.committeeIds.join(' ، ')}</td>
                  <td className="p-2 border text-base">{row.courseNames.join(' ، ')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default PrintProctorSchedules;
