
import React, { useState, useEffect, useCallback } from 'react';
import { Analytics } from '@vercel/analytics/react';
import Layout from './components/Layout';
import ManagerDashboard from './pages/ManagerDashboard';
import StudentPortal from './pages/StudentPortal';
import DeptHeadPortal from './pages/DeptHeadPortal';
import ProctorPortal from './pages/ProctorPortal';
import LoginPage from './pages/LoginPage';
import AiScheduleBuilder from './pages/AiScheduleBuilder';
import AdminScheduleEditor from './pages/AdminScheduleEditor';
import { Student, Exam, Room, Proctor, Committee, DraftSchedule, SystemState, UserSession } from './types';
import PrintProctorSchedules from './pages/PrintProctorSchedules';
import PermissionsManagement from './pages/PermissionsManagement';
import InstructionsManagement from './pages/InstructionsManagement';
import { fetchSystemState, logoutUser, syncSystemState, checkServerHealth } from './services/api';
import { readPortalFromBrowser, setPortalPath, createGuestPortalSession } from './utils/routes';
import { getAuthToken } from './utils/auth';

// Initial Mock Data
const initialData: SystemState = {
  students: [],
  exams: [],
  rooms: [],
  proctors: [],
  committees: [],
  drafts: []
};

const App: React.FC = () => {
  const [currentUser, setCurrentUser] = useState<UserSession | null>(() => {
      const portal = readPortalFromBrowser();
      if (portal) {
          localStorage.removeItem('tvtc_exam_system');
          return createGuestPortalSession(portal);
      }
      return null;
  });
  const [activeTab, setActiveTab] = useState(() => {
      const portal = readPortalFromBrowser();
      if (portal === 'student') return 'student';
      if (portal === 'proctor') return 'proctor';
      return 'manager';
  });
  const [data, setData] = useState<SystemState>(initialData);
  
  const [isServerConnected, setIsServerConnected] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [portalResetKey, setPortalResetKey] = useState(0);

  const loadFullState = useCallback(async () => {
      const serverData = await fetchSystemState();
      if (serverData) {
          setIsServerConnected(true);
          setData(serverData);
          console.log('✅ Loaded data from server (PostgreSQL database)');
          return true;
      }
      setIsServerConnected(false);
      return false;
  }, []);

  const isGuestPortalRole = (role?: string | null) => role === 'student' || role === 'proctor';

  // 1. Initialize Data (Server is the ONLY source of truth)
  useEffect(() => {
      const initData = async () => {
          const portal = readPortalFromBrowser();
          const token = getAuthToken();

          if (portal && isGuestPortalRole(portal)) {
              const healthy = await checkServerHealth();
              setIsServerConnected(healthy);
              setData(initialData);
              setIsInitialized(true);
              return;
          }

          if (token) {
              const loaded = await loadFullState();
              if (!loaded) {
                  console.warn('⚠️ Server unreachable or session expired. Starting with empty data.');
                  setData(initialData);
              }
          } else {
              setData(initialData);
          }

          setIsInitialized(true);
      };

      initData();
  }, [loadFullState]);

  // 🔄 AUTO-REFRESH: Poll server for updates (for read-only users)
  useEffect(() => {
      if (!currentUser || !isServerConnected) return;

      // Only auto-refresh for dept heads (authenticated read-only)
      if (currentUser.readOnly && currentUser.role === 'dept_head') {
          console.log(`🔄 Auto-refresh enabled for ${currentUser.role} (every 10 seconds)`);
          
          const refreshInterval = setInterval(async () => {
              await loadFullState();
              console.log(`🔄 Data refreshed automatically at ${new Date().toLocaleTimeString()}`);
          }, 10000);

          return () => clearInterval(refreshInterval);
      }
  }, [currentUser, isServerConnected, loadFullState]);

  // 2. Auto-Sync Logic (Persist to Local & Server)
  useEffect(() => {
      if (!isInitialized) return;

      // Only managers can write to localStorage and sync to server
      // Read-only users (students, proctors, dept heads) should NOT save or sync
      if (currentUser && !currentUser.readOnly) {
          // Save locally as backup/cache (only for managers)
          localStorage.setItem('tvtc_exam_system', JSON.stringify(data));

          // If connected, sync to server with debounce to avoid flooding
          if (isServerConnected) {
              const timeoutId = setTimeout(() => {
                  syncSystemState(data).then((success) => {
                      if (success) {
                          setLastSaved(new Date());
                      }
                  }).catch(err => console.error("Sync failed", err));
              }, 2000); // 2 second debounce
              return () => clearTimeout(timeoutId);
          }
      }
  }, [data, isServerConnected, isInitialized, currentUser]);

  // Handle Login Logic
  const handleLogin = useCallback((user: UserSession) => {
      setCurrentUser(user);
      
      // Clear localStorage for read-only users to prevent old data pollution
      if (user.readOnly) {
          localStorage.removeItem('tvtc_exam_system');
          console.log("🔒 Read-only user: localStorage cleared to prevent data conflicts");
      }
      
      // Route to appropriate page based on role
      switch (user.role) {
          case 'manager': setActiveTab('manager'); break;
          case 'dept_head': setActiveTab('dept'); break;
          case 'proctor': setActiveTab('proctor'); break;
          case 'student': setActiveTab('student'); break;
          default: setActiveTab('manager');
      }

      if (user.role === 'student' || user.role === 'proctor') {
          setPortalPath(user.role);
      } else {
          setPortalPath(null);
      }

      if (user.role === 'manager' || user.role === 'dept_head') {
          loadFullState();
      }
  }, [loadFullState]);

  const handleLogout = useCallback(() => {
      const role = currentUser?.role;
      if (role === 'student' || role === 'proctor') {
          setPortalPath(role);
          setActiveTab(role);
          setCurrentUser(createGuestPortalSession(role));
          setPortalResetKey((k) => k + 1);
          return;
      }
      logoutUser();
      setCurrentUser(null);
      setActiveTab('manager');
      setPortalPath(null);
  }, [currentUser]);

  // Fallback: open portal when URL is /student or /proctor
  useEffect(() => {
      if (currentUser) return;
      const portal = readPortalFromBrowser();
      if (portal) {
          handleLogin(createGuestPortalSession(portal));
      }
  }, [currentUser, handleLogin]);

  // If not logged in, show Login Page
  if (!currentUser) {
      return <LoginPage data={data} onLogin={handleLogin} />;
  }

  return (
    <Layout 
        activeTab={activeTab} 
        setActiveTab={setActiveTab} 
        currentUser={currentUser}
        onLogout={handleLogout}
    >
            {activeTab === 'manager' && currentUser.role === 'manager' && (
                <ManagerDashboard data={data} setData={setData} currentUser={currentUser} />
            )}
            {activeTab === 'print_proctor_schedules' && currentUser.role === 'manager' && (
                <PrintProctorSchedules data={data} />
            )}
            {activeTab === 'smart_schedule' && currentUser.role === 'manager' && (
                <AiScheduleBuilder data={data} setData={setData} currentUser={currentUser} />
            )}
            {activeTab === 'admin_schedule_editor' && currentUser.role === 'manager' && (
                <AdminScheduleEditor data={data} setData={setData} />
            )}
            {activeTab === 'manage_students' && currentUser.role === 'manager' && (
                <ManagerDashboard data={data} setData={setData} currentUser={currentUser} initialSection="manage-students" />
            )}
            {activeTab === 'permissions' && currentUser.role === 'manager' && (
                <PermissionsManagement currentUser={currentUser} />
            )}
            {activeTab === 'instructions' && currentUser.role === 'manager' && (
                <InstructionsManagement currentUserName={currentUser.name} />
            )}
            {activeTab === 'dept' && (currentUser.role === 'manager' || currentUser.role === 'dept_head') && (
                <DeptHeadPortal data={data} />
            )}
            {activeTab === 'proctor' && (currentUser.role === 'manager' || currentUser.role === 'proctor') && (
                <ProctorPortal key={`proctor-${portalResetKey}`} data={data} />
            )}
            {activeTab === 'student' && (currentUser.role === 'manager' || currentUser.role === 'student') && (
                <StudentPortal key={`student-${portalResetKey}`} data={data} />
            )}
      
      {/* Connection Status Indicator */}
      <div className="fixed bottom-4 left-4 z-50 print:hidden flex flex-col gap-1 items-start">
          {isServerConnected ? (
             <span className="bg-green-100 text-green-800 text-xs px-2 py-1 rounded-full border border-green-200 shadow-sm flex items-center gap-1">
                <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></span> متصل بقاعدة البيانات
             </span>
          ) : (
             <span className="bg-gray-100 text-gray-600 text-xs px-2 py-1 rounded-full border border-gray-200 shadow-sm flex items-center gap-1">
                <span className="w-2 h-2 bg-gray-400 rounded-full"></span> وضع غير متصل (محلي)
             </span>
          )}
          
          {/* Auto-refresh indicator for read-only users */}
          {currentUser && currentUser.readOnly && currentUser.role === 'dept_head' && isServerConnected && (
              <span className="bg-blue-50 text-blue-700 text-[10px] px-2 py-0.5 rounded-full border border-blue-200 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-pulse"></span>
                  تحديث تلقائي كل 10 ثواني
              </span>
          )}
          
          {lastSaved && isServerConnected && currentUser && !currentUser.readOnly && (
              <span className="text-[10px] text-gray-500 font-mono px-1">
                  آخر حفظ تلقائي: {lastSaved.toLocaleTimeString('en-US', {hour: '2-digit', minute:'2-digit', second:'2-digit'})}
              </span>
          )}
      </div>
      <Analytics />
    </Layout>
  );
};

export default App;
