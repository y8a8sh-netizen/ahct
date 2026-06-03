


import React, { useState } from 'react';
import { Search, Calendar, Clock, MapPin, Printer, UserCheck } from 'lucide-react';
import { Student, Exam, Committee, Room, Proctor } from '../types';
import { formatScheduleDateHtml } from '../utils/helpers';
import ScheduleDateDisplay from '../components/ScheduleDateDisplay';
import { fetchProctorPortalSchedule } from '../services/api';

interface ProctorPortalProps {
  data: {
    students: Student[];
    exams: Exam[];
    committees: Committee[];
    rooms: Room[];
    proctors: Proctor[];
  }
}

const ProctorPortal: React.FC<ProctorPortalProps> = ({ data }) => {
  const [searchId, setSearchId] = useState('');
  const [proctor, setProctor] = useState<Proctor | null>(null);
  const [schedule, setSchedule] = useState<any[] | null>(null);
  const [error, setError] = useState('');
  const [searching, setSearching] = useState(false);

  const handleSearch = async () => {
    setError('');
    setSearching(true);

    try {
      if (data.proctors.length === 0) {
        const result = await fetchProctorPortalSchedule(searchId);
        if (!result) {
          setError('لم يتم العثور على مراقب بهذا الرقم أو الاسم');
          setSchedule(null);
          setProctor(null);
          return;
        }
        setProctor(result.proctor);
        setSchedule(result.schedule);
        return;
      }

      const foundProctor = data.proctors.find(p => p.id === searchId || p.name.includes(searchId));
      
      if (!foundProctor) {
        setError('لم يتم العثور على مراقب بهذا الرقم أو الاسم');
        setSchedule(null);
        setProctor(null);
        return;
      }

      setProctor(foundProctor);

        const proctorCommittees = data.committees.filter(comm => comm.proctorIds.includes(foundProctor.id));
        const merged: Record<string, any> = {};
        proctorCommittees.forEach(comm => {
            let exam = data.exams.find(e => e.courseCode === comm.examCode && e.specialization === comm.specialization);
            if (!exam) exam = data.exams.find(e => e.courseCode === comm.examCode);
            const room = data.rooms.find(r => r.id === comm.roomId);
            const partnerId = comm.proctorIds.find(id => id !== foundProctor.id);
            const partner = partnerId ? data.proctors.find(p => p.id === partnerId) : null;
            const slotKey = `${exam?.date || ''}__${exam?.time || ''}__${room?.id || comm.roomId}`;
            if (!merged[slotKey]) {
                merged[slotKey] = {
                    date: exam?.date,
                    time: exam?.time,
                    roomName: room?.name,
                    roomType: room?.type,
                    partnerName: partner?.name || '---',
                    committees: [],
                    courseNames: [],
                    committeeIds: [],
                    studentCount: 0
                };
            }
            merged[slotKey].committees.push(comm);
            merged[slotKey].courseNames.push(exam?.courseName || comm.examCode);
            merged[slotKey].committeeIds.push(comm.id);
            merged[slotKey].studentCount += comm.studentIds.length;
        });
        const proctorSchedule = Object.values(merged).map((item: any) => ({
            date: item.date,
            time: item.time,
            roomName: item.roomName,
            roomType: item.roomType,
            partnerName: item.partnerName,
            courseNames: item.courseNames,
            committeeIds: item.committeeIds,
            studentCount: item.studentCount
        })).sort((a, b) => {
            if (!a.date || !b.date) return 0;
            const dateA = new Date(a.date).getTime();
            const dateB = new Date(b.date).getTime();
            if (dateA !== dateB) return dateA - dateB;
            return (a.time || '').localeCompare(b.time || '');
        });
        setSchedule(proctorSchedule);
    } finally {
      setSearching(false);
    }
  };

  const handlePrint = () => {
    if (!proctor || !schedule) return;

    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    const rowsHtml = schedule.map((item, index) => {
      const courseLabel = item.courseNames?.length > 0
        ? item.courseNames.join(' + ')
        : 'غير محدد';
      const committeeLabel = item.committeeIds?.length > 0
        ? item.committeeIds.join('، ')
        : '---';

      return `
        <tr>
            <td style="text-align:center">${index + 1}</td>
            <td>${formatScheduleDateHtml(item.date || '')}</td>
            <td>${item.time || '---'}</td>
            <td>${courseLabel}</td>
            <td style="font-weight:bold">${item.roomName || '---'}</td>
            <td style="text-align:center">${committeeLabel} <span style="font-size:10px; color:#555;">(${item.studentCount || 0} متدرب)</span></td>
            <td>${item.partnerName || '---'}</td>
        </tr>
    `;
    }).join('');

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
          .header h1 { color: #006d5b; margin: 0; }
          .header h2 { font-size: 14px; color: #555; margin-top: 5px; }
          
          .info-box { background: #f9f9f9; border: 1px solid #ddd; padding: 15px; border-radius: 8px; margin-bottom: 20px; display: flex; justify-content: space-between; }
          .info-item { font-size: 14px; }
          .info-item strong { color: #006d5b; }

          table { width: 100%; border-collapse: collapse; font-size: 13px; }
          th, td { border: 1px solid #ccc; padding: 8px; text-align: right; }
          th { background-color: #eee; font-weight: bold; }
          tr:nth-child(even) { background-color: #fdfdfd; }
          
          .footer { margin-top: 40px; text-align: center; font-size: 12px; color: #777; border-top: 1px solid #eee; padding-top: 10px; }
        </style>
      </head>
      <body>
        <div class="header">
            <h1>الكلية التقنية بأحد رفيدة</h1>
            <h2>جدول تكليف المراقبة للفصل التدريبي الحالي</h2>
        </div>

        <div class="info-box">
            <div class="info-item"><strong>اسم المراقب:</strong> ${proctor.name}</div>
            <div class="info-item"><strong>الرقم الوظيفي:</strong> ${proctor.id}</div>
            <div class="info-item"><strong>القسم:</strong> ${proctor.department || 'عام'}</div>
            <div class="info-item"><strong>عدد اللجان:</strong> ${schedule.length}</div>
        </div>

        <table>
            <thead>
                <tr>
                    <th width="40">م</th>
                    <th>اليوم والتاريخ</th>
                    <th>الوقت</th>
                    <th>المقرر</th>
                    <th>القاعة</th>
                    <th width="100">رقم اللجنة</th>
                    <th>المراقب الزميل</th>
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

  return (
    <div className="max-w-5xl mx-auto space-y-6 sm:space-y-8 px-4 sm:px-6 lg:px-8">
      <div className="text-center space-y-2">
        <h2 className="text-2xl sm:text-3xl font-bold text-tvtc-green flex items-center justify-center gap-2">
            <UserCheck size={28} className="sm:w-8 sm:h-8"/> بوابة المراقبين
        </h2>
        <p className="text-sm sm:text-base text-gray-600">
          {schedule ? 'بإمكانك طباعة الجدول بالضغط على زر الطباعة' : 'أدخل رقمك الوظيفي لاستعراض جدول المراقبة الخاص بك'}
        </p>
      </div>

      {schedule === null && (
        <div className="bg-white p-4 sm:p-6 md:p-8 rounded-xl shadow-md flex flex-col items-center gap-4 border-t-4 border-tvtc-gold">
          <div className="w-full max-w-md relative">
              <input 
                  type="text" 
                  placeholder="أدخل الرقم الوظيفي..." 
                  className="w-full p-3 sm:p-4 pr-10 sm:pr-12 text-base sm:text-lg border rounded-lg focus:ring-2 focus:ring-tvtc-green outline-none bg-white"
                  value={searchId}
                  onChange={(e) => setSearchId(e.target.value)}
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
      )}

      {schedule && proctor && (
        <div className="bg-white rounded-xl shadow-lg overflow-hidden animate-fade-in border border-gray-200">
            <div className="bg-gradient-to-r from-gray-800 to-gray-900 text-white p-3 sm:p-4 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                <div className="flex items-center gap-3 sm:gap-4 w-full sm:w-auto">
                    <div className="w-12 h-12 sm:w-10 sm:h-10 rounded-full bg-tvtc-gold flex items-center justify-center font-bold text-base sm:text-sm flex-shrink-0">
                        {proctor.name.charAt(0)}
                    </div>
                    <div className="flex-1 min-w-0">
                        <h3 className="font-bold text-base sm:text-lg truncate">{proctor.name}</h3>
                        <p className="text-xs sm:text-sm text-gray-300 truncate">{proctor.department} | {proctor.id}</p>
                    </div>
                </div>
                <button 
                    onClick={handlePrint}
                    className="bg-tvtc-gold text-white px-4 py-2.5 rounded-lg flex items-center gap-2 hover:bg-yellow-600 text-sm font-bold shadow-lg w-full sm:w-auto justify-center transition-all hover:scale-105"
                >
                    <Printer size={18}/> طباعة الجدول
                </button>
                <button
                    onClick={() => {
                      setSchedule(null);
                      setProctor(null);
                      setError('');
                    }}
                    className="bg-white text-gray-700 px-4 py-2.5 rounded-lg border border-gray-200 text-sm font-bold w-full sm:w-auto hover:bg-gray-100 transition-colors"
                >
                    بحث جديد
                </button>
            </div>
            
            {/* Mobile Card View */}
            <div className="md:hidden">
                {schedule.length === 0 ? (
                    <div className="p-8 text-center text-gray-500">
                        <UserCheck size={48} className="mx-auto mb-3 text-gray-300"/>
                        <p>لا توجد لجان مسندة إليك في الجدول الحالي.</p>
                    </div>
                ) : (
                    schedule.map((item, idx) => (
                        <div key={idx} className="p-4 m-3 border-2 border-gray-200 rounded-xl shadow-md hover:shadow-lg hover:border-tvtc-green transition-all bg-white">
                            {/* Date & Time Header */}
                            <div className="flex items-center justify-between mb-3 pb-2 border-b-2 border-gray-300">
                                <div>
                                    <div className="flex items-start gap-2 text-tvtc-green font-bold">
                                        <Calendar size={18} className="mt-0.5 flex-shrink-0" />
                                        <ScheduleDateDisplay date={item.date} />
                                    </div>
                                </div>
                                <div className="flex items-center gap-2 bg-gray-100 px-3 py-1 rounded-full">
                                    <Clock size={16}/>
                                    <span className="font-medium text-sm">{item.time}</span>
                                </div>
                            </div>
                            
                            {/* Course Info */}
                                                <div className="mb-3">
                                                        <h4 className="font-bold text-gray-800 text-base mb-1">
                                                            {item.courseNames.length > 1
                                                                ? item.courseNames.map((name, i) => <span key={i}>{name}{i < item.courseNames.length-1 ? ' + ' : ''}</span>)
                                                                : item.courseNames[0]}
                                                        </h4>
                                                        <div className="flex items-center gap-2 text-xs text-gray-600 flex-wrap">
                                                            {item.committeeIds.map((cid, i) => (
                                                                <span key={cid} className="bg-tvtc-green/10 text-tvtc-green px-2 py-1 rounded font-mono">لجنة {cid}</span>
                                                            ))}
                                                            <span className="bg-gray-100 px-2 py-1 rounded">{item.studentCount} متدرب</span>
                                                        </div>
                                                </div>
                            
                            {/* Room & Partner */}
                            <div className="grid grid-cols-2 gap-3">
                                <div className="bg-blue-50 p-2.5 rounded-lg border border-blue-200">
                                    <div className="flex items-center gap-1.5 text-blue-700 mb-1">
                                        <MapPin size={14}/>
                                        <span className="text-xs font-bold">القاعة</span>
                                    </div>
                                    <div className="text-sm font-medium text-gray-800">{item.roomName}</div>
                                </div>
                                <div className="bg-purple-50 p-2.5 rounded-lg border border-purple-200">
                                    <div className="flex items-center gap-1.5 text-purple-700 mb-1">
                                        <UserCheck size={14}/>
                                        <span className="text-xs font-bold">الزميل</span>
                                    </div>
                                    <div className="text-sm font-medium text-gray-800 truncate">{item.partnerName}</div>
                                </div>
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
                            <th className="p-4 text-sm font-bold text-gray-700">التاريخ</th>
                            <th className="p-4 text-sm font-bold text-gray-700">الوقت</th>
                            <th className="p-4 text-sm font-bold text-gray-700">المقرر / اللجنة</th>
                            <th className="p-4 text-sm font-bold text-gray-700">القاعة</th>
                            <th className="p-4 text-sm font-bold text-gray-700">الزميل</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y">
                                                {schedule.map((item, idx) => (
                                                    <tr key={idx} className="hover:bg-gray-50 transition-colors">
                                                        <td className="p-4">
                                                            <div className="flex items-start gap-2 font-bold text-tvtc-green">
                                                                <Calendar size={16} className="mt-1 flex-shrink-0" />
                                                                <ScheduleDateDisplay date={item.date} />
                                                            </div>
                                                        </td>
                                                        <td className="p-4">
                                                            <div className="flex items-center gap-2">
                                                                <Clock size={16}/> {item.time}
                                                            </div>
                                                        </td>
                                                        <td className="p-4">
                                                            <div className="font-bold text-gray-800">
                                                                {item.courseNames.length > 1
                                                                    ? item.courseNames.map((name, i) => <span key={i}>{name}{i < item.courseNames.length-1 ? ' + ' : ''}</span>)
                                                                    : item.courseNames[0]}
                                                            </div>
                                                            <div className="text-xs text-gray-500 mt-1 flex flex-wrap gap-1">
                                                                {item.committeeIds.map((cid, i) => (
                                                                    <span key={cid} className="font-mono bg-gray-200 px-1 rounded">لجنة {cid}</span>
                                                                ))}
                                                                <span className="bg-gray-100 px-2 py-1 rounded">{item.studentCount} متدرب</span>
                                                            </div>
                                                        </td>
                                                        <td className="p-4">
                                                            <div className="flex items-center gap-2">
                                                                <MapPin size={16}/> {item.roomName}
                                                            </div>
                                                        </td>
                                                        <td className="p-4 text-sm text-gray-600">
                                                            {item.partnerName}
                                                        </td>
                                                    </tr>
                                                ))}
                         {schedule.length === 0 && (
                            <tr>
                                <td colSpan={5} className="p-8 text-center text-gray-500">لا توجد لجان مسندة إليك في الجدول الحالي.</td>
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

export default ProctorPortal;
