import React, { useEffect, useState } from 'react';
import { ImagePlus, Info, Save, Trash2 } from 'lucide-react';
import { StudentInstructions } from '../types';
import { fetchStudentInstructions, updateStudentInstructions } from '../services/api';

interface InstructionsManagementProps {
  currentUserName: string;
}

const MAX_IMAGE_SIZE_BYTES = 2 * 1024 * 1024;
const DEFAULT_TITLE = 'تعليمات عامة قبل الاختبار';

const InstructionsManagement: React.FC<InstructionsManagementProps> = ({ currentUserName }) => {
  const [title, setTitle] = useState(DEFAULT_TITLE);
  const [text, setText] = useState('');
  const [imageDataUrl, setImageDataUrl] = useState('');
  const [updatedAt, setUpdatedAt] = useState<string | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const data = await fetchStudentInstructions();
      if (data) {
        setTitle(data.title || DEFAULT_TITLE);
        setText(data.text || '');
        setImageDataUrl(data.imageDataUrl || '');
        setUpdatedAt(data.updatedAt);
      }
      setLoading(false);
    };
    load();
  }, []);

  const handlePickImage = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      alert('الرجاء اختيار صورة فقط.');
      return;
    }
    if (file.size > MAX_IMAGE_SIZE_BYTES) {
      alert('حجم الصورة كبير. الحد الأقصى 2MB.');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setImageDataUrl(String(reader.result || ''));
    };
    reader.readAsDataURL(file);
  };

  const handleSave = async () => {
    setSaving(true);
    setMessage('');
    const result = await updateStudentInstructions({
      title: title.trim() || DEFAULT_TITLE,
      text: text.trim(),
      imageDataUrl,
    });
    setSaving(false);

    if (!result.ok) {
      setMessage(result.error);
      return;
    }

    setTitle(result.instructions.title || DEFAULT_TITLE);
    setText(result.instructions.text || '');
    setImageDataUrl(result.instructions.imageDataUrl || '');
    setUpdatedAt(result.instructions.updatedAt);
    setMessage('تم حفظ التعليمات بنجاح وستظهر مباشرة في بوابة المتدرب.');
  };

  if (loading) {
    return <p className="text-center text-gray-500 py-20">جاري تحميل إعدادات التعليمات...</p>;
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6" dir="rtl">
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
        <div className="flex items-center justify-between gap-3 mb-5">
          <div>
            <h1 className="text-2xl font-bold text-gray-800">التعليمات العامة للمتدربين</h1>
            <p className="text-sm text-gray-500 mt-1">المدير الحالي: {currentUserName}</p>
          </div>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="px-5 py-2.5 rounded-lg bg-tvtc-green text-white hover:bg-green-700 disabled:opacity-60 font-bold flex items-center gap-2"
          >
            <Save size={18} /> {saving ? 'جاري الحفظ...' : 'حفظ التعليمات'}
          </button>
        </div>

        <div className="bg-blue-50 border border-blue-100 rounded-lg p-3 text-sm text-blue-700 flex items-start gap-2 mb-4">
          <Info size={17} className="mt-0.5" />
          <p>يمكنك كتابة نص وإرفاق صورة واحدة. سيظهر المحتوى في بوابة المتدرب تحت بطاقة إدخال الرقم التدريبي.</p>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-bold mb-2">عنوان التعليمات</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full border border-gray-300 rounded-lg p-3 focus:ring-2 focus:ring-tvtc-green outline-none"
              placeholder={DEFAULT_TITLE}
            />
          </div>
          <div>
            <label className="block text-sm font-bold mb-2">نص التعليمات</label>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={7}
              placeholder="مثال: يرجى الحضور قبل الاختبار بـ 15 دقيقة مع إحضار الهوية..."
              className="w-full border border-gray-300 rounded-lg p-3 focus:ring-2 focus:ring-tvtc-green outline-none"
            />
          </div>

          <div className="border border-dashed border-gray-300 rounded-xl p-4">
            <div className="flex flex-wrap items-center gap-2 mb-3">
              <label className="px-4 py-2 rounded-lg bg-gray-100 hover:bg-gray-200 cursor-pointer text-sm font-bold flex items-center gap-2">
                <ImagePlus size={16} /> رفع صورة
                <input type="file" accept="image/*" onChange={handlePickImage} className="hidden" />
              </label>
              {imageDataUrl && (
                <button
                  type="button"
                  onClick={() => setImageDataUrl('')}
                  className="px-3 py-2 rounded-lg bg-red-50 text-red-700 hover:bg-red-100 text-sm font-bold flex items-center gap-2"
                >
                  <Trash2 size={16} /> حذف الصورة
                </button>
              )}
            </div>

            {imageDataUrl ? (
              <img src={imageDataUrl} alt="معاينة التعليمات" className="max-h-72 rounded-lg border border-gray-200 object-contain bg-gray-50 p-2" />
            ) : (
              <p className="text-sm text-gray-500">لا توجد صورة مرفوعة حالياً.</p>
            )}
          </div>
        </div>

        {message && (
          <p className={`mt-4 text-sm p-3 rounded-lg ${message.includes('نجاح') ? 'bg-green-50 text-green-700 border border-green-100' : 'bg-red-50 text-red-700 border border-red-100'}`}>
            {message}
          </p>
        )}

        <p className="mt-4 text-xs text-gray-400">
          آخر تحديث: {updatedAt ? new Date(updatedAt).toLocaleString('ar-SA') : '—'}
        </p>
      </div>
    </div>
  );
};

export default InstructionsManagement;
