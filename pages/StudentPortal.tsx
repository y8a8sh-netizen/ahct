


import React, { useEffect, useState } from 'react';
import { Search, Calendar, Clock, MapPin, Printer } from 'lucide-react';
import { Student, Exam, Committee, Room, StudentInstructions } from '../types';
import { formatScheduleDateHtml } from '../utils/helpers';
import ScheduleDateDisplay from '../components/ScheduleDateDisplay';
import { fetchStudentInstructions } from '../services/api';

interface StudentPortalProps {
  data: {
    students: Student[];
    exams: Exam[];
    committees: Committee[];
    rooms: Room[];
  }
}

const StudentPortal: React.FC<StudentPortalProps> = ({ data }) => {
  const DEFAULT_INSTRUCTIONS_TITLE = 'تعليمات عامة قبل الاختبار';
  const [studentId, setStudentId] = useState('');
  const [schedule, setSchedule] = useState<any[] | null>(null);
  const [error, setError] = useState('');
  const [instructions, setInstructions] = useState<StudentInstructions | null>(null);

  useEffect(() => {
    const loadInstructions = async () => {
      const response = await fetchStudentInstructions();
      if (response) setInstructions(response);
    };
    loadInstructions();
  }, []);

  const handleSearch = () => {
    setError('');
    const student = data.students.find(s => s.id === studentId);
    
    if (!student) {
      setError('رقم المتدرب غير موجود في النظام');
      setSchedule(null);
      return;
    }

    // Find exams for this student based on committees assigned
    const studentSchedule = data.committees
        .filter(comm => comm.studentIds.includes(studentId))
        .map(comm => {
            // UPDATED: Lookup exam using specialization for accurate Date/Time
            let exam = data.exams.find(e => e.courseCode === comm.examCode && e.specialization === comm.specialization);
            if (!exam) exam = data.exams.find(e => e.courseCode === comm.examCode);

            const room = data.rooms.find(r => r.id === comm.roomId);
            return {
                ...exam,
                roomName: room?.name,
                roomType: room?.type
            };
        })
        .sort((a, b) => {
             // Sort by date/time
             if (!a.date || !b.date) return 0;
             return new Date(a.date).getTime() - new Date(b.date).getTime();
        });

    setSchedule(studentSchedule);
  };

  const handlePrint = () => {
    if (!schedule || schedule.length === 0) return;

    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    const rowsHtml = schedule.map((exam, index) => `
        <tr>
            <td style="text-align:center">${index + 1}</td>
            <td>${formatScheduleDateHtml(exam.date)}</td>
            <td>${exam.time}</td>
            <td><strong>${exam.courseName}</strong><br><small style="color:#666">${exam.courseCode}</small></td>
            <td>${exam.roomName}</td>
            <td style="text-align:center">
                <span style="background:${exam.type === 'Blackboard' ? '#e9d5ff' : '#dbeafe'}; color:${exam.type === 'Blackboard' ? '#7c3aed' : '#2563eb'}; padding:4px 8px; border-radius:4px; font-size:11px; font-weight:bold">
                    ${exam.type === 'Blackboard' ? 'معمل (Blackboard)' : 'تحريري'}
                </span>
            </td>
        </tr>
    `).join('');

    printWindow.document.write(`
      <!DOCTYPE html>
      <html dir="rtl" lang="ar">
      <head>
        <meta charset="UTF-8">
        <title>جدول الاختبارات - ${studentId}</title>
        <style>
          @page { size: A4; margin: 20mm; }
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; direction: rtl; color: #333; }
          .header h1 { color: #006d5b; font-size: 24px; margin-bottom: 5px; }
          .header h2 { color: #555; font-size: 18px; font-weight: normal; }
          
          .info-box { background: #f8f9fa; padding: 15px; border-radius: 8px; margin-bottom: 20px; border-right: 4px solid #cba052; }
          .info-item { display: inline-block; margin-left: 30px; font-size: 14px; }
          .info-item strong { color: #006d5b; }
          
          table { width: 100%; border-collapse: collapse; margin-top: 20px; }
          th, td { border: 1px solid #ddd; padding: 10px; text-align: right; }
          th { background-color: #006d5b; color: white; font-weight: bold; font-size: 13px; }
          td { font-size: 12px; }
          tr:nth-child(even) { background-color: #fdfdfd; }
          
          .footer { margin-top: 40px; text-align: center; font-size: 12px; color: #777; border-top: 1px solid #eee; padding-top: 10px; }
        </style>
      </head>
      <body>
        <div class="header">
            <h1>الكلية التقنية بأحد رفيدة</h1>
            <h2>جدول الاختبارات النهائية</h2>
        </div>

        <div class="info-box">
            <div class="info-item"><strong>الرقم التدريبي:</strong> ${studentId}</div>
            <div class="info-item"><strong>عدد الاختبارات:</strong> ${schedule.length}</div>
            <div class="info-item"><strong>تاريخ الطباعة:</strong> ${new Date().toLocaleDateString('ar-SA')}</div>
        </div>

        <table>
            <thead>
                <tr>
                    <th width="40">م</th>
                    <th>اليوم والتاريخ</th>
                    <th>الوقت</th>
                    <th>المقرر</th>
                    <th>القاعة</th>
                    <th width="100">نوع الاختبار</th>
                </tr>
            </thead>
            <tbody>
                ${rowsHtml}
            </tbody>
        </table>

        <div class="footer">
            <p><strong>ملاحظة هامة:</strong> يرجى الحضور قبل موعد الاختبار بـ 15 دقيقة وإحضار بطاقة الهوية.</p>
            <p>تم استخراج هذا الجدول آلياً من نظام جداول الاختبارات.</p>
        </div>
        <script>window.onload = function() { window.print(); }</script>
      </body>
      </html>
    `);

    printWindow.document.close();
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8 px-4 sm:px-6 lg:px-8">
      <div className="text-center space-y-2">
        <h2 className="text-2xl sm:text-3xl font-bold text-tvtc-green">جدول الاختبارات النهائية</h2>
        <p className="text-sm sm:text-base text-gray-600">أدخل الرقم التدريبي لاستعراض جدولك ومواقع الاختبار</p>
      </div>

      <div className="bg-white p-4 sm:p-8 rounded-xl shadow-md flex flex-col items-center gap-4 border-t-4 border-tvtc-gold">
        <div className="w-full max-w-md relative">
            <input 
                type="text" 
                placeholder="أدخل الرقم التدريبي هنا..." 
                className="w-full p-3 sm:p-4 pr-10 sm:pr-12 text-base sm:text-lg border rounded-lg focus:ring-2 focus:ring-tvtc-green outline-none bg-white"
                value={studentId}
                onChange={(e) => setStudentId(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            />
            <Search className="absolute top-1/2 right-3 sm:right-4 -translate-y-1/2 text-gray-400" size={20} />
        </div>
        <button 
            onClick={handleSearch}
            className="bg-tvtc-green text-white px-6 sm:px-8 py-2.5 sm:py-3 rounded-lg text-base sm:text-lg font-bold hover:bg-green-800 transition-colors w-full max-w-md"
        >
            بحث
        </button>
        {error && <p className="text-red-500 font-medium">{error}</p>}
      </div>

      {(instructions?.text || instructions?.imageDataUrl) && (
        <div className="bg-white p-4 sm:p-6 rounded-xl shadow-sm border border-gray-100">
          <h3 className="text-lg font-bold text-tvtc-green mb-3">{instructions?.title || DEFAULT_INSTRUCTIONS_TITLE}</h3>
          {instructions?.text && (
            <p className="text-gray-700 whitespace-pre-wrap leading-7 mb-4">{instructions.text}</p>
          )}
          {instructions?.imageDataUrl && (
            <div className="rounded-lg border border-gray-200 bg-gray-50 p-2">
              <img src={instructions.imageDataUrl} alt="تعليمات الاختبارات" className="max-h-[420px] w-full object-contain rounded-md" />
            </div>
          )}
        </div>
      )}

      {schedule && (
        <div className="bg-white rounded-xl shadow-lg overflow-hidden animate-fade-in">
            <div className="bg-gradient-to-r from-gray-800 to-gray-900 text-white p-3 sm:p-4 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                <div className="flex items-center gap-3 sm:gap-4 w-full sm:w-auto">
                    <div className="w-12 h-12 sm:w-10 sm:h-10 rounded-full bg-tvtc-gold flex items-center justify-center font-bold text-base sm:text-sm flex-shrink-0">
                        {studentId.charAt(0)}
                    </div>
                    <div className="flex-1 min-w-0">
                        <h3 className="font-bold text-base sm:text-lg truncate">جدول المتدرب: {studentId}</h3>
                        <span className="text-xs sm:text-sm text-gray-300">{schedule.length} اختبارات</span>
                    </div>
                </div>
                <button 
                    onClick={handlePrint}
                    className="bg-tvtc-gold text-white px-4 py-2.5 rounded-lg flex items-center gap-2 hover:bg-yellow-600 text-sm font-bold shadow-lg w-full sm:w-auto justify-center transition-all hover:scale-105"
                >
                    <Printer size={18}/> طباعة الجدول
                </button>
            </div>
            
            {/* Mobile Card View */}
            <div className="md:hidden">
                {schedule.length === 0 ? (
                    <div className="p-8 text-center text-gray-500">
                        <Calendar size={48} className="mx-auto mb-3 text-gray-300"/>
                        <p>لا يوجد اختبارات مسجلة لهذا الرقم في الجدول الحالي.</p>
                    </div>
                ) : (
                    schedule.map((exam, idx) => (
                        <div key={idx} className="p-4 m-3 border-2 border-gray-200 rounded-xl shadow-md hover:shadow-lg hover:border-tvtc-green transition-all bg-white">
                            {/* Exam Number & Type Badge */}
                            <div className="flex items-center justify-between mb-3">
                                <div className="bg-tvtc-green text-white px-3 py-1 rounded-full text-xs font-bold">
                                    اختبار {idx + 1}
                                </div>
                                <span className={`px-3 py-1 rounded-full text-xs font-bold ${exam.type === 'Blackboard' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'}`}>
                                    {exam.type === 'Blackboard' ? 'معمل (Blackboard)' : 'تحريري'}
                                </span>
                            </div>
                            
                            {/* Course Name */}
                            <div className="mb-3 pb-3 border-b-2 border-gray-300">
                                <h4 className="font-bold text-gray-800 text-base mb-1">{exam.courseName}</h4>
                                <span className="text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded">{exam.courseCode}</span>
                            </div>
                            
                            {/* Date & Time */}
                            <div className="grid grid-cols-2 gap-3 mb-3">
                                <div className="bg-green-50 p-2.5 rounded-lg border border-green-200">
                                    <div className="flex items-center gap-1.5 text-tvtc-green mb-1">
                                        <Calendar size={14}/>
                                        <span className="text-xs font-bold">التاريخ</span>
                                    </div>
                                                                        <ScheduleDateDisplay
                                        date={exam.date}
                                        dayClassName="text-xs text-tvtc-green font-bold"
                                        gregClassName="text-sm font-medium text-gray-800"
                                        hijriClassName="text-xs text-gray-500 mt-0.5"
                                    />
                                </div>
                                <div className="bg-orange-50 p-2.5 rounded-lg border border-orange-200">
                                    <div className="flex items-center gap-1.5 text-orange-700 mb-1">
                                        <Clock size={14}/>
                                        <span className="text-xs font-bold">الوقت</span>
                                    </div>
                                    <div className="text-sm font-medium text-gray-800">{exam.time}</div>
                                </div>
                            </div>
                            
                            {/* Room */}
                            <div className="bg-blue-50 p-3 rounded-lg border border-blue-200">
                                <div className="flex items-center gap-2 text-blue-700 mb-1">
                                    <MapPin size={16}/>
                                    <span className="text-xs font-bold">مكان الاختبار</span>
                                </div>
                                <div className="text-base font-bold text-gray-800">{exam.roomName}</div>
                            </div>
                        </div>
                    ))
                )}
            </div>
            
            {/* Desktop Table View */}
            <div className="hidden md:block overflow-x-auto">
                <table className="w-full text-right">
                    <thead className="bg-gray-50 border-b-2 border-gray-200">
                        <tr>
                            <th className="p-4 text-sm font-bold text-gray-700">المقرر</th>
                            <th className="p-4 text-sm font-bold text-gray-700">التاريخ</th>
                            <th className="p-4 text-sm font-bold text-gray-700">الوقت</th>
                            <th className="p-4 text-sm font-bold text-gray-700">المكان</th>
                            <th className="p-4 text-sm font-bold text-gray-700">النوع</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y">
                        {schedule.map((exam, idx) => (
                            <tr key={idx} className="hover:bg-gray-50 transition-colors">
                                <td className="p-4 font-bold text-gray-800">
                                    <div>{exam.courseName}</div>
                                    <span className="text-xs text-gray-500 block">{exam.courseCode}</span>
                                </td>
                                <td className="p-4 text-tvtc-green font-medium">
                                    <div className="flex items-start gap-2">
                                        <Calendar size={16} className="mt-1 flex-shrink-0" />
                                        <ScheduleDateDisplay date={exam.date} />
                                    </div>
                                </td>
                                <td className="p-4">
                                     <div className="flex items-center gap-2"><Clock size={16}/> {exam.time}</div>
                                </td>
                                <td className="p-4">
                                     <div className="flex items-center gap-2"><MapPin size={16}/> {exam.roomName}</div>
                                </td>
                                <td className="p-4">
                                    <span className={`px-3 py-1 rounded-full text-xs font-bold ${exam.type === 'Blackboard' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'}`}>
                                        {exam.type === 'Blackboard' ? 'معمل (Blackboard)' : 'تحريري'}
                                    </span>
                                </td>
                            </tr>
                        ))}
                         {schedule.length === 0 && (
                            <tr>
                                <td colSpan={5} className="p-8 text-center text-gray-500">لا يوجد اختبارات مسجلة لهذا الرقم في الجدول الحالي.</td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
      )}
    </div>
  );
};

export default StudentPortal;
