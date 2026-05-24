import React, { useCallback, useEffect, useState } from 'react';
import { Activity, AlertCircle, RefreshCw, Trash2 } from 'lucide-react';
import { ActivityLog } from '../types';
import { clearActivityLogs, fetchActivityLogs } from '../services/api';

interface LogsPageProps {
  currentUserName: string;
}

const roleLabel = (role: string) => {
  if (role === 'manager') return 'مدير';
  if (role === 'dept_head') return 'رئيس قسم';
  if (role === 'system') return 'النظام';
  return 'غير معروف';
};

const LogsPage: React.FC<LogsPageProps> = ({ currentUserName }) => {
  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const loadLogs = useCallback(async () => {
    setLoading(true);
    setError('');
    const data = await fetchActivityLogs(400);
    if (!data) {
      setError('تعذر تحميل السجل. تأكد من تسجيل الدخول كمدير ومن اتصال الخادم.');
      setLogs([]);
    } else {
      setLogs(data);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    loadLogs();
  }, [loadLogs]);

  const handleClear = async () => {
    if (!confirm('هل تريد حذف كل السجلات؟ لا يمكن التراجع عن هذه العملية.')) return;
    setBusy(true);
    const result = await clearActivityLogs();
    setBusy(false);
    if (!result.ok) {
      alert(result.error || 'فشل حذف السجلات');
      return;
    }
    await loadLogs();
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6" dir="rtl">
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-indigo-50 flex items-center justify-center">
              <Activity className="text-indigo-600" size={28} />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-800">سجل العمليات</h1>
              <p className="text-sm text-gray-500 mt-1">متابعة ما يحدث من المدراء ورؤساء الأقسام — {currentUserName}</p>
            </div>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={loadLogs}
              className="px-4 py-2 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 flex items-center gap-2 text-sm"
            >
              <RefreshCw size={16} /> تحديث
            </button>
            <button
              type="button"
              onClick={handleClear}
              disabled={busy || loading || logs.length === 0}
              className="px-4 py-2 rounded-lg bg-red-600 text-white hover:bg-red-700 disabled:opacity-50 flex items-center gap-2 text-sm font-bold"
            >
              <Trash2 size={16} /> مسح السجلات
            </button>
          </div>
        </div>

        {error && (
          <div className="mb-4 p-4 bg-red-50 text-red-700 rounded-lg flex items-center gap-2 text-sm border border-red-100">
            <AlertCircle size={18} /> {error}
          </div>
        )}

        {loading ? (
          <p className="text-center text-gray-500 py-12">جاري التحميل...</p>
        ) : logs.length === 0 ? (
          <p className="text-center text-gray-500 py-12">لا توجد سجلات حالياً.</p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-gray-100">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-600">
                <tr>
                  <th className="text-right p-3 font-bold">الوقت</th>
                  <th className="text-right p-3 font-bold">المستخدم</th>
                  <th className="text-right p-3 font-bold">الدور</th>
                  <th className="text-right p-3 font-bold">الإجراء</th>
                  <th className="text-right p-3 font-bold">تفاصيل</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => (
                  <tr key={log.id} className="border-t border-gray-50 hover:bg-gray-50/50">
                    <td className="p-3 text-xs text-gray-500">{new Date(log.created_at).toLocaleString('ar-SA')}</td>
                    <td className="p-3 font-medium">{log.actor_name}</td>
                    <td className="p-3">{roleLabel(log.actor_role)}</td>
                    <td className="p-3 font-mono text-xs text-gray-700">{log.action}</td>
                    <td className="p-3 text-gray-600 text-xs whitespace-pre-wrap">{log.details || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="mt-4 text-xs text-gray-400">يمكنك مسح السجل في أي وقت لتخفيف حجم البيانات.</p>
      </div>
    </div>
  );
};

export default LogsPage;
