import React, { useState } from 'react';
import { Committee, Exam, Room, Proctor } from '../types';

interface AdminScheduleEditorProps {
  data: {
    committees: Committee[];
    exams: Exam[];
    rooms: Room[];
    proctors: Proctor[];
    students: any[];
  };
  setData: React.Dispatch<React.SetStateAction<any>>;
}

const AdminScheduleEditor: React.FC<AdminScheduleEditorProps> = ({ data, setData }) => {
  const [editing, setEditing] = useState<Committee | null>(null);
  const [editRoom, setEditRoom] = useState('');
  const [editProctors, setEditProctors] = useState<string[]>(['','']);
  const [selectedStudents, setSelectedStudents] = useState<string[]>([]);
  const [targetCommitteeId, setTargetCommitteeId] = useState('');
  // فلتر اليوم
  const [selectedDay, setSelectedDay] = useState<string>('الكل');
  // إضافة لجنة جديدة
  const [showAddModal, setShowAddModal] = useState(false);
  const [newExamCode, setNewExamCode] = useState('');
  const [newSpecialization, setNewSpecialization] = useState('');
  const [newRoomId, setNewRoomId] = useState('');
  const [newProctors, setNewProctors] = useState<string[]>(['','']);
  const [newStudentIds, setNewStudentIds] = useState<string[]>([]);

  // حذف لجنة
  const handleDelete = (id: string) => {
    const comm = data.committees.find((c: Committee) => c.id === id);
    if (!comm || comm.studentIds.length > 0) {
      alert('لا يمكن حذف اللجنة إذا كان فيها متدربين.');
      return;
    }
    if (window.confirm('هل أنت متأكد من حذف هذه اللجنة الفارغة؟')) {
      setData((prev: any) => ({
        ...prev,
        committees: prev.committees.filter((c: Committee) => c.id !== id)
      }));
    }
  };

  // بدء التعديل
  const handleEdit = (comm: Committee) => {
    setEditing(comm);
    setEditRoom(comm.roomId);
    setEditProctors([comm.proctorIds[0] || '', comm.proctorIds[1] || '']);
    setSelectedStudents([]);
    setTargetCommitteeId('');
  };

  // حفظ التعديل
  const handleSave = () => {
    if (!editing) return;
    setData((prev: any) => ({
      ...prev,
      committees: prev.committees.map((c: Committee) =>
        c.id === editing.id ? { ...c, roomId: editRoom, proctorIds: editProctors } : c
      )
    }));
    setEditing(null);
  };

  // نقل المتدربين المحددين إلى لجنة أخرى
  const handleMoveStudents = () => {
    if (!editing || !targetCommitteeId || selectedStudents.length === 0) return;
    if (targetCommitteeId === editing.id) return;
    
    // التحقق من أن اللجنة المستقبلة لها نفس اسم المقرر (قيد صارم)
    const targetCommittee = data.committees.find((c: Committee) => c.id === targetCommitteeId);
    if (!targetCommittee || targetCommittee.examCode !== editing.examCode) {
      alert('خطأ: يمكن نقل المتدربين فقط إلى لجنة لها نفس اسم المقرر!');
      return;
    }
    
    const movedCount = selectedStudents.length;
    const movedIds = [...selectedStudents];

    setData((prev: any) => {
      return {
        ...prev,
        committees: prev.committees.map((c: Committee) => {
          if (c.id === editing.id) {
            // إزالة الطلاب من اللجنة الحالية
            return { ...c, studentIds: c.studentIds.filter(sid => !movedIds.includes(sid)) };
          } else if (c.id === targetCommitteeId) {
            // إضافة الطلاب للجنة المستقبلة
            return { ...c, studentIds: [...c.studentIds, ...movedIds] };
          } else {
            return c;
          }
        })
      };
    });

    // تحديث نافذة التعديل فوراً لإزالة المتدربين المنقولين
    setEditing((prev: any) => prev ? { ...prev, studentIds: prev.studentIds.filter((sid: string) => !movedIds.includes(sid)) } : null);
    setSelectedStudents([]);
    setTargetCommitteeId('');
    alert(`✅ تم نقل ${movedCount} متدرب إلى اللجنة ${targetCommitteeId} بنجاح`);
  };

  // إغلاق النافذة
  const handleCancel = () => setEditing(null);

  return (
    <div className="min-h-screen bg-gradient-to-br from-tvtc-green/10 to-white p-6">
      <div className="max-w-6xl mx-auto bg-white rounded-xl shadow-lg p-6">
        <div className="flex flex-col sm:flex-row justify-between items-center mb-4 gap-2">
          <div>
            <h1 className="text-2xl font-bold text-tvtc-green mb-1">لوحة تحكم الجدول المتقدمة</h1>
            <p className="text-gray-600">يمكنك هنا تعديل توزيع اللجان يدويًا، نقل اللجان بين القاعات والفترات، وتعديل المراقبين والمتدربين بسهولة.</p>
          </div>
          <button
            className="bg-tvtc-green text-white px-4 py-2 rounded-lg font-bold hover:bg-green-700 shadow"
            onClick={() => setShowAddModal(true)}
          >
            + إضافة لجنة جديدة
          </button>
        </div>
        
        {/* فلتر باليوم */}
        {data.committees.length > 0 && (() => {
          const allDaysForFilter = Array.from(new Set(data.committees.map(c => {
            const exam = data.exams.find(e => e.courseCode === c.examCode && e.specialization === c.specialization) || data.exams.find(e => e.courseCode === c.examCode);
            return exam ? (exam.date || c.day || '') : (c.day || '');
          }))).filter(d => d).sort();
          
          return allDaysForFilter.length > 1 ? (
            <div className="mb-4 bg-gradient-to-r from-blue-50 to-indigo-50 rounded-lg p-4 border-2 border-blue-200">
              <label className="block mb-2 font-bold text-blue-900 text-lg">🔍 فرز حسب اليوم:</label>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => setSelectedDay('الكل')}
                  className={`px-4 py-2 rounded-lg font-bold transition-all ${
                    selectedDay === 'الكل'
                      ? 'bg-gradient-to-r from-tvtc-green to-green-600 text-white shadow-lg'
                      : 'bg-white text-gray-700 hover:bg-gray-100 border-2 border-gray-300'
                  }`}
                >
                  📅 عرض الكل ({data.committees.length} لجنة)
                </button>
                {allDaysForFilter.map(day => {
                  const dayCommittees = data.committees.filter(c => {
                    const exam = data.exams.find(e => e.courseCode === c.examCode && e.specialization === c.specialization) || data.exams.find(e => e.courseCode === c.examCode);
                    const committeDay = exam ? (exam.date || c.day || '') : (c.day || '');
                    return committeDay === day;
                  });
                  return (
                    <button
                      key={day}
                      onClick={() => setSelectedDay(day)}
                      className={`px-4 py-2 rounded-lg font-bold transition-all ${
                        selectedDay === day
                          ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-lg'
                          : 'bg-white text-gray-700 hover:bg-gray-100 border-2 border-blue-300'
                      }`}
                    >
                      {day} ({dayCommittees.length})
                    </button>
                  );
                })}
              </div>
            </div>
          ) : null;
        })()}
        
        {/* نافذة إضافة لجنة جديدة */}
        {showAddModal && (
                <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
                  <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-lg">
                    <h2 className="text-xl font-bold mb-4 text-tvtc-green">إضافة لجنة جديدة</h2>
                    <div className="space-y-4">
                      <div>
                        <label className="block mb-1 font-medium">المقرر</label>
                        <select value={newExamCode} onChange={e => setNewExamCode(e.target.value)} className="w-full border rounded p-2">
                          <option value="">اختر المقرر</option>
                          {data.exams.map(e => (
                            <option key={e.courseCode + (e.specialization || '')} value={e.courseCode}>
                              {e.courseName} ({e.courseCode})
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block mb-1 font-medium">التخصص (اختياري)</label>
                        <input value={newSpecialization} onChange={e => setNewSpecialization(e.target.value)} className="w-full border rounded p-2" placeholder="مثال: تقنية شبكات الحاسب" />
                      </div>
                      <div>
                        <label className="block mb-1 font-medium">القاعة</label>
                        <select value={newRoomId} onChange={e => setNewRoomId(e.target.value)} className="w-full border rounded p-2">
                          <option value="">اختر القاعة</option>
                          {data.rooms.map(r => (
                            <option key={r.id} value={r.id}>{r.name} (سعة: {r.capacity})</option>
                          ))}
                        </select>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="block mb-1 font-medium">المراقب الأول</label>
                          <select value={newProctors[0]} onChange={e => setNewProctors([e.target.value, newProctors[1]])} className="w-full border rounded p-2">
                            <option value="">اختر المراقب</option>
                            {data.proctors.map(p => (
                              <option key={p.id} value={p.id}>{p.name}</option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="block mb-1 font-medium">المراقب الثاني</label>
                          <select value={newProctors[1]} onChange={e => setNewProctors([newProctors[0], e.target.value])} className="w-full border rounded p-2">
                            <option value="">اختر المراقب</option>
                            {data.proctors.map(p => (
                              <option key={p.id} value={p.id}>{p.name}</option>
                            ))}
                          </select>
                        </div>
                      </div>
                      <div>
                        <label className="block mb-1 font-medium">المتدربون</label>
                        <div className="max-h-32 overflow-y-auto border rounded p-2 bg-gray-50">
                          {data.students
                            .filter(st => newExamCode && st.courseCodes && st.courseCodes.includes(newExamCode))
                            .map(st => {
                              // ابحث عن لجنة الطالب الحالية لنفس المقرر (غير اللجنة الجديدة)
                              const currentCommittee = data.committees.find(c =>
                                c.examCode === newExamCode &&
                                c.studentIds.includes(st.id)
                              );
                              const currentRoom = currentCommittee ? data.rooms.find(r => r.id === currentCommittee.roomId) : null;
                              return (
                                <label key={st.id} className="block cursor-pointer flex items-center gap-2">
                                  <input
                                    type="checkbox"
                                    checked={newStudentIds.includes(st.id)}
                                    onChange={e => {
                                      if (e.target.checked) setNewStudentIds([...newStudentIds, st.id]);
                                      else setNewStudentIds(newStudentIds.filter(s => s !== st.id));
                                    }}
                                    className="ml-2"
                                  />
                                  <span>{st.name}</span>
                                  {currentCommittee && (
                                    <span className="text-xs text-gray-500 bg-gray-100 rounded px-2 py-0.5">
                                      حالياً: لجنة {currentCommittee.id} - {currentRoom ? currentRoom.name : currentCommittee.roomId}
                                    </span>
                                  )}
                                </label>
                              );
                            })}
                          {(!newExamCode || data.students.filter(st => st.courseCodes && st.courseCodes.includes(newExamCode)).length === 0) && (
                            <div className="text-gray-400 text-sm">اختر مقررًا لعرض المتدربين المسجلين فيه</div>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex gap-2 mt-6 justify-end">
                      <button
                        onClick={() => {
                          if (!newExamCode || !newRoomId || !newProctors[0] || !newProctors[1]) {
                            alert('يرجى تعبئة جميع الحقول الأساسية.');
                            return;
                          }
                          const newId = 'C-' + (Math.max(0, ...data.committees.map(c => parseInt((c.id || '').replace('C-', '')))) + 1);
                          setData((prev: any) => {
                            const newCommittee = {
                              id: newId,
                              examCode: newExamCode,
                              specialization: newSpecialization || undefined,
                              roomId: newRoomId,
                              proctorIds: newProctors,
                              studentIds: newStudentIds
                            };
                            // أضف اللجنة الجديدة ثم رتب حسب اليوم/التاريخ ثم الفترة/الوقت ثم id
                            const committees = [...prev.committees, newCommittee];
                            
                            // دالة مساعدة للحصول على معلومات الامتحان
                            const getExamInfo = (comm) => {
                              const exam = prev.exams.find(e => 
                                e.courseCode === comm.examCode && 
                                (e.specialization === comm.specialization || !comm.specialization)
                              ) || prev.exams.find(e => e.courseCode === comm.examCode);
                              return exam;
                            };
                            
                            // دالة لتحويل الوقت إلى دقائق للمقارنة
                            const timeToMinutes = (timeStr) => {
                              if (!timeStr) return 0;
                              const match = timeStr.match(/(\d{1,2}):(\d{2})/);
                              if (!match) return 0;
                              return parseInt(match[1], 10) * 60 + parseInt(match[2], 10);
                            };
                            
                            // ترتيب اللجان بذكاء
                            committees.sort((a, b) => {
                              const examA = getExamInfo(a);
                              const examB = getExamInfo(b);
                              
                              // 1. الترتيب حسب التاريخ/اليوم
                              const dateA = examA?.date || '';
                              const dateB = examB?.date || '';
                              if (dateA && dateB && dateA !== dateB) {
                                return dateA.localeCompare(dateB, 'ar');
                              }
                              
                              // 2. الترتيب حسب الوقت
                              const timeA = examA?.time || '';
                              const timeB = examB?.time || '';
                              if (timeA && timeB && timeA !== timeB) {
                                return timeToMinutes(timeA) - timeToMinutes(timeB);
                              }
                              
                              // 3. الترتيب حسب اسم المقرر
                              const courseA = examA?.courseName || a.examCode;
                              const courseB = examB?.courseName || b.examCode;
                              if (courseA !== courseB) {
                                return courseA.localeCompare(courseB, 'ar');
                              }
                              
                              // 4. الترتيب حسب رقم اللجنة
                              return String(a.id).localeCompare(String(b.id), 'ar', { numeric: true });
                            });
                            
                            return {
                              ...prev,
                              committees
                            };
                          });
                          setShowAddModal(false);
                          setNewExamCode('');
                          setNewSpecialization('');
                          setNewRoomId('');
                          setNewProctors(['','']);
                          setNewStudentIds([]);
                        }}
                        className="bg-tvtc-green text-white px-4 py-2 rounded hover:bg-green-700"
                      >
                        إضافة
                      </button>
                      <button onClick={() => setShowAddModal(false)} className="bg-gray-300 text-gray-700 px-4 py-2 rounded hover:bg-gray-400">إلغاء</button>
                    </div>
                  </div>
                </div>
              )
            }
        
        {/* جدول شبكي بنمط الأعمدة للفترات والصفوف للمقررات */}
        <div className="overflow-x-auto rounded-lg border border-gray-200 shadow-sm mt-6 bg-[#f6f8fa]">
          {data.committees.length === 0 ? (
            <div className="text-center p-8 text-gray-400">لا توجد بيانات بعد</div>
          ) : (
            (() => {
              // تطبيق فلتر اليوم
              const filteredCommittees = selectedDay === 'الكل' 
                ? data.committees 
                : data.committees.filter(c => {
                    const exam = data.exams.find(e => e.courseCode === c.examCode && e.specialization === c.specialization) || data.exams.find(e => e.courseCode === c.examCode);
                    const committeeDay = exam ? (exam.date || c.day || '') : (c.day || '');
                    return committeeDay === selectedDay;
                  });
              
              // استخراج كل الأيام الفريدة مرتبة من الأعلى للأسفل (من اللجان المفلترة)
              const allDays = Array.from(new Set(filteredCommittees.map(c => {
                const exam = data.exams.find(e => e.courseCode === c.examCode && e.specialization === c.specialization) || data.exams.find(e => e.courseCode === c.examCode);
                return exam ? (exam.date || c.day || '') : (c.day || '');
              }))).sort();
              // استخراج كل الفترات الفريدة مرتبة حسب الوقت تصاعديًا (من اللجان المفلترة)
              const allPeriods = Array.from(new Set(filteredCommittees.map(c => {
                const exam = data.exams.find(e => e.courseCode === c.examCode && e.specialization === c.specialization) || data.exams.find(e => e.courseCode === c.examCode);
                return exam ? (exam.time || c.period || '') : (c.period || '');
              }))).sort((a, b) => {
                // ترتيب زمني hh:mm
                const getMinutes = (t) => {
                  const m = t.match(/(\d{1,2}):(\d{2})/);
                  if (!m) return 0;
                  return parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
                };
                return getMinutes(a) - getMinutes(b);
              });
              return (
                <table className="w-full text-center border-separate border-spacing-0 bg-white shadow-md rounded-lg overflow-hidden">
                  <thead className="bg-tvtc-green text-white">
                    <tr>
                      <th className="p-3 sticky right-0 bg-tvtc-green z-10 border-l-2 border-white">اليوم / الفترة</th>
                      {allPeriods.map(period => (
                        <th key={period} className="p-3 border-l border-white min-w-[180px]">{period}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {allDays.map(day => (
                      <tr key={day}>
                        <td className="bg-gray-100 font-bold p-2 text-right sticky right-0 z-10 border-l-2 border-white min-w-[120px] max-w-[160px] align-top">
                          <div className="text-base font-bold leading-tight">{day}</div>
                        </td>
                        {allPeriods.map(period => {
                          // ابحث عن اللجان التي لها نفس اليوم والفترة (من اللجان المفلترة)
                          const cellCommittees = filteredCommittees.filter(c => {
                            const exam = data.exams.find(e => e.courseCode === c.examCode && e.specialization === c.specialization) || data.exams.find(e => e.courseCode === c.examCode);
                            const cDay = exam ? (exam.date || c.day || '') : (c.day || '');
                            const cPeriod = exam ? (exam.time || c.period || '') : (c.period || '');
                            return cDay === day && cPeriod === period;
                          });
                          // استخراج المقررات الفريدة في الخلية
                          const uniqueCourses = Array.from(new Set(cellCommittees.map(c => {
                            const exam = data.exams.find(e => e.courseCode === c.examCode && e.specialization === c.specialization) || data.exams.find(e => e.courseCode === c.examCode);
                            return exam ? (exam.courseCode + '|' + (exam.specialization || '')) : c.examCode;
                          })));
                          // ألوان هادئة ثابتة (يمكنك تعديلها أو زيادتها)
                          const pastelColors = [
                            'bg-yellow-50',
                            'bg-blue-50',
                            'bg-green-50',
                            'bg-pink-50',
                            'bg-purple-50',
                            'bg-orange-50',
                            'bg-teal-50',
                            'bg-indigo-50',
                            'bg-rose-50',
                          ];
                          return (
                            <td key={day + period} className="align-top min-w-[220px] max-w-[260px] border border-gray-200 p-2 bg-white">
                              {cellCommittees.length === 0 ? (
                                <span className="text-gray-300">—</span>
                              ) : (
                                cellCommittees.map(c => {
                                  const exam = data.exams.find(e => e.courseCode === c.examCode && e.specialization === c.specialization) || data.exams.find(e => e.courseCode === c.examCode);
                                  const room = data.rooms.find(r => r.id === c.roomId);
                                  const proctors = c.proctorIds.map(pid => data.proctors.find(p => p.id === pid)?.name || 'غير معين');
                                  // حدد لون البطاقة بناءً على ترتيب المقرر في الخلية
                                  const courseKey = exam ? (exam.courseCode + '|' + (exam.specialization || '')) : c.examCode;
                                  const colorIdx = uniqueCourses.indexOf(courseKey) % pastelColors.length;
                                  const bgColor = pastelColors[colorIdx];
                                  return (
                                    <div key={c.id} className={`mb-3 border border-yellow-300 rounded-lg p-3 ${bgColor} shadow flex flex-col gap-1 text-right relative hover:shadow-lg transition-shadow`}>
                                      <div className="flex justify-between items-center mb-1">
                                        <span className="font-mono text-xs text-tvtc-green">{c.id}</span>
                                        <span className="bg-yellow-400/90 text-xs rounded px-2 py-0.5 font-bold shadow">{c.studentIds.length} متدرب</span>
                                      </div>
                                      <div className="text-xs font-bold text-tvtc-green">{exam ? exam.courseName : c.examCode}</div>
                                      {exam && exam.specialization && (
                                        <div className="text-xs text-gray-500">({exam.specialization})</div>
                                      )}
                                      <div className="text-xs text-gray-700 font-bold">{room ? room.name : c.roomId}</div>
                                      <div className="text-xs text-gray-500">{proctors.join('، ')}</div>
                                      <div className="flex gap-1 mt-2 flex-wrap justify-end">
                                        <button onClick={() => handleEdit(c)} className="bg-blue-600 text-white px-2 py-0.5 rounded text-xs hover:bg-blue-700">تعديل</button>
                                        {c.studentIds.length === 0 && (
                                          <button onClick={() => handleDelete(c.id)} className="bg-red-600 text-white px-2 py-0.5 rounded text-xs hover:bg-red-700">حذف</button>
                                        )}
                                      </div>
                                    </div>
                                  );
                                })
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              );
            })()
          )}
        </div>

        {/* نافذة التعديل */}
        {editing && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl max-h-[90vh] overflow-y-auto">
              {/* رأس النافذة */}
              <div className="bg-gradient-to-r from-tvtc-green to-green-600 text-white p-6 rounded-t-2xl sticky top-0 z-10">
                <div className="flex justify-between items-start">
                  <div>
                    <h2 className="text-3xl font-bold mb-2">تعديل اللجنة {editing.id}</h2>
                    <p className="text-green-100 text-sm">قم بتعديل معلومات اللجنة ونقل المتدربين بين اللجان بسهولة</p>
                  </div>
                  <button onClick={handleCancel} className="text-white hover:bg-white/20 rounded-lg p-2 transition">
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              </div>

              <div className="p-6 space-y-6">
                {/* معلومات اللجنة الأساسية */}
                <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-xl p-6 border-2 border-blue-200">
                  <h3 className="text-xl font-bold text-blue-900 mb-4 flex items-center gap-2">
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                    </svg>
                    معلومات اللجنة الأساسية
                  </h3>
                  
                  <div className="grid md:grid-cols-3 gap-4">
                    <div>
                      <label className="block mb-2 font-bold text-gray-700">القاعة</label>
                      <select value={editRoom} onChange={e => setEditRoom(e.target.value)} className="w-full border-2 border-blue-300 rounded-lg p-3 text-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition">
                        <option value="">اختر القاعة</option>
                        {data.rooms.map(r => (
                          <option key={r.id} value={r.id}>{r.name} (سعة: {r.capacity})</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block mb-2 font-bold text-gray-700">المراقب الأول</label>
                      <select value={editProctors[0]} onChange={e => setEditProctors([e.target.value, editProctors[1]])} className="w-full border-2 border-blue-300 rounded-lg p-3 text-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition">
                        <option value="">اختر المراقب</option>
                        {data.proctors.map(p => (
                          <option key={p.id} value={p.id}>{p.name}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block mb-2 font-bold text-gray-700">المراقب الثاني</label>
                      <select value={editProctors[1]} onChange={e => setEditProctors([editProctors[0], e.target.value])} className="w-full border-2 border-blue-300 rounded-lg p-3 text-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition">
                        <option value="">اختر المراقب</option>
                        {data.proctors.map(p => (
                          <option key={p.id} value={p.id}>{p.name}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>

                {/* نقل المتدربين */}
                <div className="bg-gradient-to-br from-purple-50 to-pink-50 rounded-xl p-6 border-2 border-purple-200">
                  <h3 className="text-xl font-bold text-purple-900 mb-2 flex items-center gap-2">
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
                    </svg>
                    نقل متدربين إلى لجنة أخرى
                  </h3>
                  <p className="text-purple-700 text-sm mb-4">يمكن نقل المتدربين فقط إلى لجان لها نفس اسم المقرر</p>
                  
                  <div className="grid md:grid-cols-2 gap-6">
                    <div>
                      <label className="block mb-2 font-bold text-gray-700 text-lg">اختر المتدربين المراد نقلهم</label>
                      <div className="bg-white border-2 border-purple-300 rounded-lg p-4 max-h-80 overflow-y-auto">
                        {editing.studentIds.length === 0 ? (
                          <div className="text-center text-gray-400 py-8">
                            <svg className="w-16 h-16 mx-auto mb-2 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                            </svg>
                            لا يوجد متدربين في هذه اللجنة
                          </div>
                        ) : (
                          <div className="space-y-2">
                            {editing.studentIds.map(sid => {
                              const student = data.students.find(st => st.id === sid);
                              const isSelected = selectedStudents.includes(sid);
                              return (
                                <div key={sid} className={`flex items-center gap-3 p-3 rounded-lg transition-all hover:bg-purple-100 ${isSelected ? 'bg-purple-100 border-2 border-purple-400' : 'border-2 border-transparent'}`}>
                                  <label className="flex items-center gap-3 flex-1 cursor-pointer">
                                    <input
                                      type="checkbox"
                                      checked={isSelected}
                                      onChange={e => {
                                        if (e.target.checked) setSelectedStudents([...selectedStudents, sid]);
                                        else setSelectedStudents(selectedStudents.filter(s => s !== sid));
                                      }}
                                      className="w-5 h-5 text-purple-600 rounded focus:ring-purple-500"
                                    />
                                    <span className={`text-lg ${isSelected ? 'font-bold text-purple-900' : 'text-gray-700'}`}>
                                      {student ? student.name : sid}
                                    </span>
                                  </label>
                                  <button
                                    title="حذف المتدرب من اللجنة"
                                    onClick={() => {
                                      if (!window.confirm(`هل تريد حذف "${student ? student.name : sid}" من اللجنة؟`)) return;
                                      setData((prev: any) => ({
                                        ...prev,
                                        committees: prev.committees.map((c: Committee) =>
                                          c.id === editing.id ? { ...c, studentIds: c.studentIds.filter((s: string) => s !== sid) } : c
                                        )
                                      }));
                                      setEditing((prev: any) => prev ? { ...prev, studentIds: prev.studentIds.filter((s: string) => s !== sid) } : null);
                                      setSelectedStudents(prev => prev.filter(s => s !== sid));
                                    }}
                                    className="text-red-400 hover:text-red-600 hover:bg-red-100 rounded-lg p-1.5 transition-all flex-shrink-0"
                                  >
                                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                    </svg>
                                  </button>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                      {selectedStudents.length > 0 && (
                        <div className="mt-3 bg-purple-100 rounded-lg p-3 flex items-center justify-between gap-2">
                          <span className="text-purple-900 font-bold text-lg">تم اختيار {selectedStudents.length} متدرب</span>
                          <button
                            onClick={() => {
                              if (!window.confirm(`هل تريد حذف ${selectedStudents.length} متدرب من اللجنة نهائياً؟`)) return;
                              const toDelete = [...selectedStudents];
                              setData((prev: any) => ({
                                ...prev,
                                committees: prev.committees.map((c: Committee) =>
                                  c.id === editing!.id ? { ...c, studentIds: c.studentIds.filter((s: string) => !toDelete.includes(s)) } : c
                                )
                              }));
                              setEditing((prev: any) => prev ? { ...prev, studentIds: prev.studentIds.filter((s: string) => !toDelete.includes(s)) } : null);
                              setSelectedStudents([]);
                              alert(`🗑️ تم حذف ${toDelete.length} متدرب من اللجنة`);
                            }}
                            className="bg-red-600 hover:bg-red-700 text-white px-3 py-1.5 rounded-lg text-sm font-bold flex items-center gap-1 transition-all"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                            حذف المحددين
                          </button>
                        </div>
                      )}
                    </div>
                    
                    <div>
                      <label className="block mb-2 font-bold text-gray-700 text-lg">اختر اللجنة المستقبلة</label>
                      <select 
                        value={targetCommitteeId} 
                        onChange={e => setTargetCommitteeId(e.target.value)} 
                        className="w-full border-2 border-purple-300 rounded-lg p-3 text-lg mb-4 focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition"
                      >
                        <option value="">-- اختر لجنة --</option>
                        {data.committees.filter(c => c.id !== editing.id && c.examCode === editing.examCode).map(c => {
                          const exam = data.exams.find(e => e.courseCode === c.examCode && e.specialization === c.specialization) || data.exams.find(e => e.courseCode === c.examCode);
                          const room = data.rooms.find(r => r.id === c.roomId);
                          return (
                            <option key={c.id} value={c.id}>
                              {c.id} - {exam ? exam.courseName : c.examCode} - {room ? room.name : c.roomId} ({c.studentIds.length} متدرب)
                            </option>
                          );
                        })}
                      </select>
                      
                      <button
                        onClick={handleMoveStudents}
                        disabled={!targetCommitteeId || selectedStudents.length === 0}
                        className="w-full bg-gradient-to-r from-purple-600 to-pink-600 text-white px-6 py-4 rounded-xl text-xl font-bold hover:from-purple-700 hover:to-pink-700 disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-lg hover:shadow-xl transform hover:-translate-y-0.5 flex items-center justify-center gap-2"
                      >
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                        </svg>
                        نقل المتدربين المحددين
                      </button>
                      
                      {!targetCommitteeId && selectedStudents.length > 0 && (
                        <p className="text-orange-600 text-sm mt-3 text-center">⚠️ يرجى اختيار اللجنة المستقبلة أولاً</p>
                      )}
                      
                      {data.committees.filter(c => c.id !== editing.id && c.examCode === editing.examCode).length === 0 && (
                        <div className="bg-yellow-50 border-2 border-yellow-300 rounded-lg p-4 mt-4">
                          <p className="text-yellow-800 text-center">⚠️ لا توجد لجان أخرى لنفس المقرر</p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* أزرار التحكم */}
              <div className="sticky bottom-0 bg-gray-50 border-t-2 border-gray-200 p-6 rounded-b-2xl flex gap-4 justify-end">
                <button 
                  onClick={handleCancel} 
                  className="bg-gray-300 text-gray-800 px-8 py-3 rounded-xl text-lg font-bold hover:bg-gray-400 transition-all shadow hover:shadow-lg"
                >
                  إلغاء
                </button>
                <button 
                  onClick={handleSave} 
                  className="bg-gradient-to-r from-tvtc-green to-green-600 text-white px-8 py-3 rounded-xl text-lg font-bold hover:from-green-600 hover:to-green-700 transition-all shadow-lg hover:shadow-xl transform hover:-translate-y-0.5 flex items-center gap-2"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  حفظ التعديلات
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default AdminScheduleEditor;
