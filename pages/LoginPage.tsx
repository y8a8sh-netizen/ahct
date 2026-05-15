
import React, { useState } from 'react';
import { Lock, User, ShieldCheck, Users, UserCheck, BookOpen, ArrowRight, Key, LayoutGrid } from 'lucide-react';
import { Student, Proctor, UserSession, UserRole } from '../types';

interface LoginPageProps {
  data: {
    students: Student[];
    proctors: Proctor[];
  };
  onLogin: (user: UserSession) => void;
}

const LoginPage: React.FC<LoginPageProps> = ({ data, onLogin }) => {
  const [selectedRole, setSelectedRole] = useState<UserRole | null>(null);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    const inputUsername = username.trim();
    const inputPassword = password.trim();

    if (!selectedRole) return;

    // 1. Manager Authentication (Read-Write Access)
    if (selectedRole === 'manager') {
        if (inputUsername === 'postgres' && inputPassword === 'admin123') {
            onLogin({ id: 'admin', name: 'مدير النظام', role: 'manager', readOnly: false });
        } else {
            setError('اسم المستخدم أو كلمة المرور غير صحيحة');
        }
        return;
    }

    // 2. Dept Head Authentication (Read-Only Access)
    if (selectedRole === 'dept_head') {
        if (inputPassword === 'DepAdmin') {
            onLogin({ id: 'dep_admin', name: 'رئيس الأقسام', role: 'dept_head', readOnly: true });
        } else {
            setError('كلمة المرور غير صحيحة');
        }
        return;
    }
  };

  const roleConfig = {
      manager: { 
          title: 'مدير النظام', 
          icon: ShieldCheck, 
          color: 'bg-gradient-to-br from-red-600 to-red-800', 
          borderColor: 'border-red-200',
          textColor: 'text-red-700',
          usernamePlaceholder: 'اسم المستخدم',
          passwordPlaceholder: 'كلمة المرور', 
          type: 'password',
          hint: 'صلاحية كاملة للكتابة والتعديل في قاعدة البيانات',
          requiresUsername: true
      },
      dept_head: { 
          title: 'رئيس القسم', 
          icon: Users, 
          color: 'bg-gradient-to-br from-blue-600 to-blue-800', 
          borderColor: 'border-blue-200',
          textColor: 'text-blue-700',
          passwordPlaceholder: 'أدخل كلمة المرور', 
          type: 'password',
          hint: 'الاطلاع والطباعة فقط (قراءة فقط)',
          requiresUsername: false
      },
      proctor: { 
          title: 'المدرب / المراقب', 
          icon: UserCheck, 
          color: 'bg-gradient-to-br from-tvtc-green to-emerald-800', 
          borderColor: 'border-emerald-200',
          textColor: 'text-tvtc-green',
          passwordPlaceholder: 'دخول مباشر', 
          type: 'text',
          hint: 'الاطلاع على جدول المراقبة (قراءة فقط)',
          requiresUsername: false
      },
      student: { 
          title: 'المتدرب', 
          icon: BookOpen, 
          color: 'bg-gradient-to-br from-tvtc-gold to-yellow-600', 
          borderColor: 'border-yellow-200',
          textColor: 'text-yellow-700',
          passwordPlaceholder: 'دخول مباشر', 
          type: 'text',
          hint: 'الاطلاع على جدول الاختبارات (قراءة فقط)',
          requiresUsername: false
      }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-4 relative overflow-hidden" dir="rtl">
      
      {/* Background Decorative Elements */}
      <div className="absolute top-0 left-0 w-full h-full overflow-hidden z-0 pointer-events-none">
          <div className="absolute -top-20 -right-20 w-96 h-96 bg-tvtc-green/5 rounded-full blur-3xl"></div>
          <div className="absolute bottom-0 left-0 w-80 h-80 bg-tvtc-gold/10 rounded-full blur-3xl"></div>
      </div>

      <div className="relative z-10 w-full max-w-4xl flex flex-col items-center px-4">
        {/* Header */}
        <div className="text-center mb-6 sm:mb-8 animate-fade-in">
            <div className="bg-white p-3 sm:p-4 rounded-full shadow-lg w-20 h-20 sm:w-24 sm:h-24 flex items-center justify-center mx-auto mb-3 sm:mb-4 border-4 border-white ring-4 ring-tvtc-green/20">
                <img 
                    src="https://upload.wikimedia.org/wikipedia/ar/2/29/%D8%B4%D8%B9%D8%A7%D8%B1_%D8%A7%D9%84%D9%85%D8%A4%D8%B3%D8%B3%D8%A9_%D8%A7%D9%84%D8%B9%D8%A7%D9%85%D8%A9_%D9%84%D9%84%D8%AA%D8%AF%D8%B1%D9%8A%D8%A8_%D8%A7%D9%84%D8%AA%D9%82%D9%86%D9%8A_%D9%88%D8%A7%D9%84%D9%85%D9%87%D9%86%D9%8A.svg" 
                    alt="Logo" 
                    className="w-12 h-12 sm:w-16 sm:h-16 opacity-90"
                    onError={(e) => {
                        (e.target as HTMLElement).style.display = 'none';
                        ((e.target as HTMLElement).parentElement as HTMLElement).innerHTML = '<span style="font-size:24px; font-weight:bold; color:#006d5b" class="sm:text-3xl">TVTC</span>';
                    }}
                />
            </div>
            <h1 className="text-xl sm:text-2xl md:text-3xl font-bold text-gray-800 mb-2 px-2">الكلية التقنية بأحد رفيدة</h1>
            <div className="flex items-center justify-center gap-2 text-gray-500 text-xs sm:text-sm bg-white/50 py-1 px-3 sm:px-4 rounded-full backdrop-blur-sm inline-flex">
                <LayoutGrid size={14} className="hidden sm:block"/>
                نظام إدارة الاختبارات واللجان
            </div>
        </div>

        {/* View 1: Role Selection Grid */}
        {!selectedRole && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4 md:gap-5 w-full animate-slide-up">
                {(Object.keys(roleConfig) as UserRole[]).map((role) => {
                    const config = roleConfig[role];
                    const Icon = config.icon;
                    
                    // 📱 Mobile: Show only student and proctor
                    // 💻 Desktop: Show all roles
                    const isMobileOnly = role === 'student' || role === 'proctor';
                    const hideOnMobile = !isMobileOnly;
                    
                    return (
                        <button 
                            key={role}
                            onClick={() => {
                                if (role === 'student') {
                                    // Immediate login for students (Read-Only)
                                    onLogin({ id: 'guest-student', name: 'بوابة المتدربين', role: 'student', readOnly: true });
                                } else if (role === 'proctor') {
                                    // Immediate login for proctors (Read-Only)
                                    onLogin({ id: 'guest-proctor', name: 'بوابة المراقبين', role: 'proctor', readOnly: true });
                                } else {
                                    // Require login for managers and dept heads
                                    setSelectedRole(role); 
                                    setError(''); 
                                    setUsername(''); 
                                    setPassword(''); 
                                }
                            }}
                            className={`bg-white p-4 sm:p-5 md:p-6 rounded-xl sm:rounded-2xl shadow-sm hover:shadow-xl transition-all border border-gray-100 hover:border-tvtc-green group text-right flex items-center gap-3 sm:gap-4 md:gap-5 relative overflow-hidden active:scale-95 ${hideOnMobile ? 'hidden md:flex' : ''}`}
                        >
                            <div className={`absolute top-0 right-0 w-1 h-full ${config.color}`}></div>
                            <div className={`w-12 h-12 sm:w-14 sm:h-14 rounded-lg sm:rounded-xl ${config.color} text-white flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform duration-300 flex-shrink-0`}>
                                <Icon size={24} className="sm:w-7 sm:h-7" />
                            </div>
                            <div className="flex-1 min-w-0">
                                <h3 className="text-base sm:text-lg md:text-xl font-bold text-gray-800 group-hover:text-tvtc-green transition-colors truncate">{config.title}</h3>
                                <p className="text-xs sm:text-sm text-gray-500 mt-1 line-clamp-2">{config.hint}</p>
                            </div>
                        </button>
                    );
                })}
            </div>
        )}

        {/* View 2: Authentication Form (Only for Manager/Dept Head) */}
        {selectedRole && (
            <div className="bg-white rounded-xl sm:rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-slide-up ring-1 ring-gray-100">
                {/* Header Card */}
                <div className={`${roleConfig[selectedRole].color} p-4 sm:p-6 text-white flex items-center justify-between`}>
                    <div className="flex items-center gap-4">
                        <div className="bg-white/20 p-2 rounded-lg">
                            {React.createElement(roleConfig[selectedRole].icon, { size: 24 })}
                        </div>
                        <div>
                            <h2 className="text-lg font-bold">{roleConfig[selectedRole].title}</h2>
                            <p className="text-white/80 text-xs">تسجيل الدخول للنظام</p>
                        </div>
                    </div>
                    
                    {/* Top Back Button */}
                    <button 
                        onClick={() => setSelectedRole(null)} 
                        className="bg-white/20 hover:bg-white/30 text-white px-3 py-1.5 rounded-lg text-sm font-medium transition-colors flex items-center gap-1"
                        title="العودة للقائمة السابقة"
                    >
                        <span>تغيير</span>
                        <ArrowRight size={16} />
                    </button>
                </div>
                
                <div className="p-4 sm:p-6 md:p-8">
                    <form onSubmit={handleLogin} className="space-y-4 sm:space-y-6">
                        {/* Username field (only for manager) */}
                        {roleConfig[selectedRole].requiresUsername && (
                            <div>
                                <label className={`block text-sm font-bold mb-2 ${roleConfig[selectedRole].textColor}`}>
                                    اسم المستخدم
                                </label>
                                <div className="relative group">
                                    <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none text-gray-400 group-focus-within:text-tvtc-green transition-colors">
                                        <User size={20}/>
                                    </div>
                                    <input 
                                        type="text"
                                        className="block w-full pr-10 pl-4 py-3 sm:py-3.5 border border-gray-300 rounded-lg sm:rounded-xl focus:ring-2 focus:ring-tvtc-green focus:border-tvtc-green outline-none transition-all text-base sm:text-lg bg-white"
                                        placeholder={roleConfig[selectedRole].usernamePlaceholder}
                                        value={username}
                                        onChange={(e) => setUsername(e.target.value)}
                                        autoFocus
                                    />
                                </div>
                            </div>
                        )}
                        
                        {/* Password field */}
                        <div>
                            <label className={`block text-sm font-bold mb-2 ${roleConfig[selectedRole].textColor}`}>
                                {roleConfig[selectedRole].requiresUsername ? 'كلمة المرور' : roleConfig[selectedRole].passwordPlaceholder}
                            </label>
                            <div className="relative group">
                                <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none text-gray-400 group-focus-within:text-tvtc-green transition-colors">
                                    <Lock size={20}/>
                                </div>
                                <input 
                                    type={roleConfig[selectedRole].type}
                                    className="block w-full pr-10 pl-4 py-3 sm:py-3.5 border border-gray-300 rounded-lg sm:rounded-xl focus:ring-2 focus:ring-tvtc-green focus:border-tvtc-green outline-none transition-all text-base sm:text-lg bg-white"
                                    placeholder={roleConfig[selectedRole].passwordPlaceholder}
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    autoFocus={!roleConfig[selectedRole].requiresUsername}
                                />
                            </div>
                        </div>

                        {error && (
                            <div className="bg-red-50 text-red-600 text-sm p-3 rounded-lg flex items-center gap-2 font-medium border border-red-100 animate-pulse">
                                <ShieldCheck size={16} /> {error}
                            </div>
                        )}

                        <button 
                            type="submit" 
                            className={`w-full text-white py-3 sm:py-3.5 rounded-lg sm:rounded-xl font-bold hover:shadow-lg hover:scale-[1.02] active:scale-[0.98] transition-all text-base sm:text-lg shadow-md ${roleConfig[selectedRole].color}`}
                        >
                            دخول
                        </button>

                        {/* Bottom Back Button */}
                        <div className="pt-2 border-t border-gray-100 mt-4">
                            <button 
                                type="button"
                                onClick={() => setSelectedRole(null)} 
                                className="w-full text-gray-400 hover:text-gray-600 hover:bg-gray-50 py-2 rounded-lg transition-colors text-sm flex items-center justify-center gap-2"
                            >
                                <ArrowRight size={14} />
                                العودة للقائمة الرئيسية
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        )}

        <div className="mt-8 text-center text-xs text-gray-400 font-medium">
            نظام اللجان والاختبارات v2.7 &copy; 2024 الكلية التقنية بأحد رفيدة
        </div>
      </div>
    </div>
  );
};

export default LoginPage;
