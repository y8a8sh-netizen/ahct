
import React, { useCallback, useEffect, useState } from 'react';
import { Shield, Users, Plus, Edit, Trash2, X, Save, RefreshCw, AlertCircle } from 'lucide-react';
import { SystemUser, UserSession } from '../types';
import { createSystemUser, deleteSystemUser, fetchUsers, updateSystemUser } from '../services/api';

interface PermissionsManagementProps {
  currentUser: UserSession;
}

type FormState = {
  username: string;
  name: string;
  password: string;
  role: 'manager' | 'dept_head';
};

const emptyForm = (): FormState => ({
  username: '',
  name: '',
  password: '',
  role: 'dept_head',
});

const roleLabel = (role: string) =>
  role === 'manager' ? 'مدير نظام' : 'رئيس قسم';

const PermissionsManagement: React.FC<PermissionsManagementProps> = ({ currentUser }) => {
  const [users, setUsers] = useState<SystemUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<SystemUser | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm());
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  const loadUsers = useCallback(async () => {
    setLoading(true);
    setError('');
    const list = await fetchUsers();
    if (!list) {
      setError('تعذر تحميل المستخدمين. تأكد من تسجيل الدخول كمدير ومن اتصال الخادم.');
      setUsers([]);
    } else {
      setUsers(list);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm());
    setModalOpen(true);
    setMessage('');
  };

  const openEdit = (user: SystemUser) => {
    setEditing(user);
    setForm({
      username: user.username,
      name: user.name,
      password: '',
      role: user.role,
    });
    setModalOpen(true);
    setMessage('');
  };

  const closeModal = () => {
    setModalOpen(false);
    setEditing(null);
    setForm(emptyForm());
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setMessage('');

    if (editing) {
      const payload: Partial<{ username: string; password: string; role: 'manager' | 'dept_head'; name: string }> = {
        username: form.username.trim(),
        name: form.name.trim(),
        role: form.role,
      };
      if (form.password.trim()) {
        payload.password = form.password.trim();
      }
      const result = await updateSystemUser(editing.id, payload);
      if (!result.ok) {
        setMessage(result.error);
      } else {
        setMessage('تم تحديث المستخدم بنجاح');
        await loadUsers();
        setTimeout(closeModal, 600);
      }
    } else {
      const result = await createSystemUser({
        username: form.username.trim(),
        password: form.password.trim(),
        role: form.role,
        name: form.name.trim(),
      });
      if (!result.ok) {
        setMessage(result.error);
      } else {
        setMessage('تم إنشاء المستخدم بنجاح');
        await loadUsers();
        setTimeout(closeModal, 600);
      }
    }
    setSaving(false);
  };

  const handleDelete = async (user: SystemUser) => {
    if (!confirm(`حذف المستخدم «${user.name}» (${user.username})؟`)) return;
    const result = await deleteSystemUser(user.id);
    if (!result.ok) {
      alert(result.error || 'فشل الحذف');
      return;
    }
    await loadUsers();
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6" dir="rtl">
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-tvtc-green/10 flex items-center justify-center">
              <Shield className="text-tvtc-green" size={28} />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-800">إدارة الصلاحيات</h1>
              <p className="text-sm text-gray-500 mt-1">إنشاء وتعديل المدراء ورؤساء الأقسام — {currentUser.name}</p>
            </div>
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={loadUsers} className="px-4 py-2 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 flex items-center gap-2 text-sm">
              <RefreshCw size={16} /> تحديث
            </button>
            <button type="button" onClick={openCreate} className="px-4 py-2 rounded-lg bg-tvtc-green text-white hover:bg-green-700 flex items-center gap-2 text-sm font-bold">
              <Plus size={18} /> مستخدم جديد
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
        ) : users.length === 0 && !error ? (
          <p className="text-center text-gray-500 py-12">لا يوجد مستخدمون.</p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-gray-100">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-600">
                <tr>
                  <th className="text-right p-3 font-bold">الاسم</th>
                  <th className="text-right p-3 font-bold">اسم المستخدم</th>
                  <th className="text-right p-3 font-bold">الدور</th>
                  <th className="text-right p-3 font-bold">تاريخ الإنشاء</th>
                  <th className="text-center p-3 font-bold">إجراءات</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id} className="border-t border-gray-50 hover:bg-gray-50/50">
                    <td className="p-3 font-medium">{u.name}</td>
                    <td className="p-3 font-mono text-gray-600">{u.username}</td>
                    <td className="p-3">
                      <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-bold ${u.role === 'manager' ? 'bg-red-100 text-red-700' : 'bg-blue-100 text-blue-700'}`}>
                        {u.role === 'manager' ? <Shield size={12} /> : <Users size={12} />}
                        {roleLabel(u.role)}
                      </span>
                    </td>
                    <td className="p-3 text-gray-500 text-xs">{u.created_at ? new Date(u.created_at).toLocaleString('ar-SA') : '—'}</td>
                    <td className="p-3">
                      <div className="flex justify-center gap-1">
                        <button type="button" onClick={() => openEdit(u)} className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg"><Edit size={16} /></button>
                        <button type="button" onClick={() => handleDelete(u)} disabled={String(u.id) === currentUser.id} className="p-2 text-red-600 hover:bg-red-50 rounded-lg disabled:opacity-30"><Trash2 size={16} /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="mt-4 text-xs text-gray-400">المدراء: تعديل كامل. رؤساء الأقسام: قراءة وطباعة فقط.</p>
      </div>
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold">{editing ? 'تعديل مستخدم' : 'مستخدم جديد'}</h2>
              <button type="button" onClick={closeModal}><X size={22} /></button>
            </div>
            <form onSubmit={handleSave} className="space-y-4">
              <div>
                <label className="block text-sm font-bold mb-1">الاسم</label>
                <input required value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} className="w-full border rounded-lg px-3 py-2" />
              </div>
              <div>
                <label className="block text-sm font-bold mb-1">اسم المستخدم</label>
                <input required value={form.username} onChange={(e) => setForm((f) => ({ ...f, username: e.target.value }))} className="w-full border rounded-lg px-3 py-2 font-mono" dir="ltr" />
              </div>
              <div>
                <label className="block text-sm font-bold mb-1">الدور</label>
                <select value={form.role} onChange={(e) => setForm((f) => ({ ...f, role: e.target.value as 'manager' | 'dept_head' }))} className="w-full border rounded-lg px-3 py-2">
                  <option value="manager">مدير نظام</option>
                  <option value="dept_head">رئيس قسم</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-bold mb-1">{editing ? 'كلمة مرور جديدة (اختياري)' : 'كلمة المرور'}</label>
                <input type="password" required={!editing} minLength={6} value={form.password} onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))} className="w-full border rounded-lg px-3 py-2" dir="ltr" />
              </div>
              {message && <p className={`text-sm p-2 rounded ${message.includes('نجاح') ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-600'}`}>{message}</p>}
              <button type="submit" disabled={saving} className="w-full bg-tvtc-green text-white py-3 rounded-lg font-bold disabled:opacity-50 flex items-center justify-center gap-2">
                <Save size={18} /> {saving ? 'جاري الحفظ...' : 'حفظ'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default PermissionsManagement;