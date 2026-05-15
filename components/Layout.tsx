
import React, { useState } from 'react';
import { Menu, BookOpen, Users, LayoutDashboard, LogOut, UserCheck, Shield, CalendarDays, Sparkles, X, Printer, UserPlus } from 'lucide-react';
import { UserSession } from '../types';

interface LayoutProps {
  children: React.ReactNode;
  activeTab: string;
  setActiveTab: (tab: string) => void;
  currentUser: UserSession | null;
  onLogout: () => void;
}

const Layout: React.FC<LayoutProps> = ({ children, activeTab, setActiveTab, currentUser, onLogout }) => {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  
  // Define permissions
  const canSeeManager = currentUser?.role === 'manager';
  const canSeeDeptHead = currentUser?.role === 'manager' || currentUser?.role === 'dept_head';
  const canSeeProctor = currentUser?.role === 'manager' || currentUser?.role === 'proctor';
  const canSeeStudent = currentUser?.role === 'manager' || currentUser?.role === 'student';

  const handleTabChange = (tab: string) => {
    setActiveTab(tab);
    setIsMobileMenuOpen(false);
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col md:flex-row print:block print:bg-white print:h-auto">
      {/* Mobile Header - Only visible on mobile */}
      <div className="md:hidden bg-tvtc-green text-white p-4 flex items-center justify-between no-print sticky top-0 z-50">
        <div className="flex items-center gap-3">
          <button 
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            className="p-2 hover:bg-white/10 rounded-lg transition-colors"
          >
            {isMobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
          </button>
          <div>
            <h1 className="text-base font-bold">الكلية التقنية</h1>
            <p className="text-xs text-tvtc-gold">نظام جداول الاختبارات</p>
          </div>
        </div>
        {currentUser && (
          <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center font-bold text-sm">
            {currentUser.name.charAt(0)}
          </div>
        )}
      </div>

      {/* Sidebar - Desktop always visible, Mobile conditional */}
      <aside className={`
        w-full md:w-64 bg-tvtc-green text-white shadow-lg flex-shrink-0 no-print flex flex-col
        ${isMobileMenuOpen ? 'fixed inset-0 z-40' : 'hidden md:flex'}
      `}>
        <div className="p-6 flex items-center justify-center border-b border-white/10">
          <div className="text-center">
            <h1 className="text-xl font-bold hidden md:block">الكلية التقنية</h1>
            <h1 className="text-lg font-bold md:hidden">الكلية التقنية</h1>
            <p className="text-sm text-tvtc-gold mt-1">نظام جداول الاختبارات</p>
          </div>
        </div>
        
        {/* User Info */}
        {currentUser && (
            <div className="p-4 bg-black/20 text-sm flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center font-bold">
                    {currentUser.name.charAt(0)}
                </div>
                <div className="overflow-hidden">
                    <div className="font-bold truncate">{currentUser.name}</div>
                    <div className="text-xs text-gray-300 truncate">
                        {currentUser.role === 'manager' ? 'مدير النظام' : 
                         currentUser.role === 'dept_head' ? 'رئيس قسم' :
                         currentUser.role === 'proctor' ? 'مدرب / مراقب' : 'متدرب'}
                    </div>
                </div>
            </div>
        )}

        <nav className="p-4 space-y-2 flex-1 overflow-y-auto">
          {canSeeManager && (
            <>
              <button 
                  onClick={() => handleTabChange('manager')}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors text-sm md:text-base ${activeTab === 'manager' ? 'bg-white/20 font-bold' : 'hover:bg-white/10'}`}
              >
                  <LayoutDashboard size={20} />
                  <span>لوحة تحكم المدير</span>
              </button>
                <button
                  onClick={() => handleTabChange('print_proctor_schedules')}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors text-sm md:text-base ${activeTab === 'print_proctor_schedules' ? 'bg-white/20 font-bold' : 'hover:bg-white/10'}`}
                >
                  <Printer size={20} />
                  <span>طباعة جداول المراقبين</span>
                </button>
              <button 
                  onClick={() => handleTabChange('smart_schedule')}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors text-sm md:text-base ${activeTab === 'smart_schedule' ? 'bg-white/20 font-bold' : 'hover:bg-white/10'}`}
              >
                  <Sparkles size={20} className="text-tvtc-gold" />
                  <span>بناء الجدول الذكي</span>
              </button>
              <button
                onClick={() => setActiveTab('admin_schedule_editor')}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors text-sm md:text-base ${activeTab === 'admin_schedule_editor' ? 'bg-white/20 font-bold' : 'hover:bg-white/10'}`}
              >
                <CalendarDays size={20} />
                <span>لوحة تحكم الجدول المتقدمة</span>
              </button>
              <button
                onClick={() => setActiveTab('manage_students')}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors text-sm md:text-base ${activeTab === 'manage_students' ? 'bg-white/20 font-bold' : 'hover:bg-white/10'}`}
              >
                <UserPlus size={20} className="text-tvtc-gold" />
                <span>إدارة المتدربين</span>
              </button>
            </>
          )}
          
          {canSeeDeptHead && (
            <button 
                onClick={() => handleTabChange('dept')}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors text-sm md:text-base ${activeTab === 'dept' ? 'bg-white/20 font-bold' : 'hover:bg-white/10'}`}
            >
                <Users size={20} />
                <span>رئيس القسم (اللجان)</span>
            </button>
          )}

          {canSeeProctor && (
            <button 
                onClick={() => handleTabChange('proctor')}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors text-sm md:text-base ${activeTab === 'proctor' ? 'bg-white/20 font-bold' : 'hover:bg-white/10'}`}
            >
                <UserCheck size={20} />
                <span>بوابة المراقبين</span>
            </button>
          )}
          
          {canSeeStudent && (
            <button 
                onClick={() => handleTabChange('student')}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors text-sm md:text-base ${activeTab === 'student' ? 'bg-white/20 font-bold' : 'hover:bg-white/10'}`}
            >
                <BookOpen size={20} />
                <span>بوابة المتدربين</span>
            </button>
          )}
        </nav>

        <div className="p-4 border-t border-white/10 space-y-4">
            <button 
                onClick={() => {
                  onLogout();
                  setIsMobileMenuOpen(false);
                }}
                className="w-full flex items-center gap-3 px-4 py-2 rounded-lg hover:bg-red-500/20 text-red-200 hover:text-red-100 transition-colors text-sm md:text-base"
            >
                <LogOut size={20} />
                <span>تسجيل خروج</span>
            </button>

            <div className="text-xs text-center text-gray-300">
                إصدار تجريبي 2.7<br/>
                الكلية التقنية بأحد رفيدة
            </div>
        </div>
      </aside>

      {/* Overlay for mobile menu */}
      {isMobileMenuOpen && (
        <div 
          className="fixed inset-0 bg-black/50 z-30 md:hidden"
          onClick={() => setIsMobileMenuOpen(false)}
        />
      )}

      {/* Main Content - Force visible overflow and block display for printing */}
      <main className="flex-1 p-3 sm:p-4 md:p-8 overflow-y-auto print:overflow-visible print:block print:h-auto print:w-full">
        {children}
      </main>
    </div>
  );
};

export default Layout;
