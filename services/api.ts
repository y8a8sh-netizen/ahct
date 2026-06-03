
import { AuthLoginResponse, StudentInstructions, SystemState, SystemUser, UserRole, UserSession } from '../types';
import { clearAuthToken, getAuthHeaders, setAuthToken } from '../utils/auth';
const DEFAULT_PRODUCTION_API = 'https://ahct.onrender.com';

const resolveApiBase = (): string => {
    let base = (import.meta.env.VITE_API_BASE_URL || '').trim();

    if (!base && typeof window !== 'undefined') {
        const host = window.location.hostname;
        if (host === 'localhost' || host === '127.0.0.1') {
            base = `http://${host}:3001`;
        } else {
            base = DEFAULT_PRODUCTION_API;
        }
    }

    if (!base) {
        base = DEFAULT_PRODUCTION_API;
    }

    return base.replace(/\/$/, '').replace(/\/api$/, '');
};

// هذا يسمح بالعمل سواء كنت على localhost أو عبر الشبكة (IP Address)
const getApiUrl = () => `${resolveApiBase()}/api`;

export const fetchSystemState = async (): Promise<SystemState | null> => {
    try {
        const url = `${getApiUrl()}/state`;
        const response = await fetch(url, { headers: getAuthHeaders() });
        if (response.status === 401) {
            clearAuthToken();
            return null;
        }
        if (response.status === 403) return null;
        if (!response.ok) throw new Error('Network response was not ok');
        return await response.json();
    } catch (error) {
        console.warn('Server connection skipped (Offline Mode):', error instanceof Error ? error.message : error);
        return null;
    }
};

export const syncSystemState = async (data: SystemState): Promise<boolean> => {
    try {
        const url = `${getApiUrl()}/sync`;
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                ...getAuthHeaders(),
            },
            body: JSON.stringify(data),
        });
        return response.ok;
    } catch (error) {
        console.warn('Sync failed (Offline Mode):', error instanceof Error ? error.message : error);
        return false;
    }
};

export const checkServerHealth = async (): Promise<boolean> => {
    try {
        const response = await fetch(`${resolveApiBase()}/api/health`);
        return response.ok;
    } catch {
        return false;
    }
};

export type StudentPortalScheduleItem = {
    courseCode: string;
    courseName: string;
    date: string;
    time: string;
    duration: number;
    type: string;
    department: string;
    specialization: string;
    roomName?: string;
    roomType?: string;
};

export const fetchStudentPortalSchedule = async (
    studentId: string
): Promise<{ student: { id: string; name: string; specialization: string }; schedule: StudentPortalScheduleItem[] } | null> => {
    try {
        const url = `${getApiUrl()}/portal/student/${encodeURIComponent(studentId.trim())}`;
        const response = await fetch(url);
        if (!response.ok) return null;
        return await response.json();
    } catch {
        return null;
    }
};

export type ProctorPortalScheduleItem = {
    date: string;
    time: string;
    roomName?: string;
    roomType?: string;
    partnerName: string;
    courseNames: string[];
    committeeIds: string[];
    studentCount: number;
};

export const fetchProctorPortalSchedule = async (
    query: string
): Promise<{ proctor: { id: string; name: string; department?: string }; schedule: ProctorPortalScheduleItem[] } | null> => {
    try {
        const url = `${getApiUrl()}/portal/proctor-schedule?q=${encodeURIComponent(query.trim())}`;
        const response = await fetch(url);
        if (!response.ok) return null;
        return await response.json();
    } catch {
        return null;
    }
};

export const loginUser = async (
    username: string,
    password: string,
    role: UserRole
): Promise<{ ok: true; user: UserSession } | { ok: false; error: string }> => {
    try {
        const url = `${getApiUrl()}/auth/login`;
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password, role }),
        });
        const body = await response.json().catch(() => ({}));
        if (!response.ok) {
            return { ok: false, error: body.error || 'فشل تسجيل الدخول' };
        }
        const data = body as AuthLoginResponse;
        setAuthToken(data.token);
        return { ok: true, user: data.user };
    } catch {
        return { ok: false, error: 'تعذر الاتصال بالخادم. تأكد من تشغيل السيرفر وربط قاعدة البيانات.' };
    }
};

export const logoutUser = (): void => {
    clearAuthToken();
};

export const fetchUsers = async (): Promise<SystemUser[] | null> => {
    try {
        const url = `${getApiUrl()}/users`;
        const response = await fetch(url, { headers: getAuthHeaders() });
        if (!response.ok) return null;
        return await response.json();
    } catch {
        return null;
    }
};

export const createSystemUser = async (payload: {
    username: string;
    password: string;
    role: 'manager' | 'dept_head';
    name: string;
}): Promise<{ ok: true; user: SystemUser } | { ok: false; error: string }> => {
    try {
        const url = `${getApiUrl()}/users`;
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
            body: JSON.stringify(payload),
        });
        const body = await response.json().catch(() => ({}));
        if (!response.ok) return { ok: false, error: body.error || 'فشل الإنشاء' };
        return { ok: true, user: body as SystemUser };
    } catch {
        return { ok: false, error: 'تعذر الاتصال بالخادم' };
    }
};

export const updateSystemUser = async (
    id: number,
    payload: Partial<{ username: string; password: string; role: 'manager' | 'dept_head'; name: string }>
): Promise<{ ok: true; user: SystemUser } | { ok: false; error: string }> => {
    try {
        const url = `${getApiUrl()}/users/${id}`;
        const response = await fetch(url, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
            body: JSON.stringify(payload),
        });
        const body = await response.json().catch(() => ({}));
        if (!response.ok) return { ok: false, error: body.error || 'فشل التحديث' };
        return { ok: true, user: body as SystemUser };
    } catch {
        return { ok: false, error: 'تعذر الاتصال بالخادم' };
    }
};

export const deleteSystemUser = async (id: number): Promise<{ ok: boolean; error?: string }> => {
    try {
        const url = `${getApiUrl()}/users/${id}`;
        const response = await fetch(url, {
            method: 'DELETE',
            headers: getAuthHeaders(),
        });
        const body = await response.json().catch(() => ({}));
        if (!response.ok) return { ok: false, error: body.error || 'فشل الحذف' };
        return { ok: true };
    } catch {
        return { ok: false, error: 'تعذر الاتصال بالخادم' };
    }
};

export const fetchStudentInstructions = async (): Promise<StudentInstructions | null> => {
    try {
        const url = `${getApiUrl()}/instructions`;
        const response = await fetch(url);
        if (!response.ok) return null;
        return await response.json();
    } catch {
        return null;
    }
};

export const updateStudentInstructions = async (payload: {
    title: string;
    text: string;
    imageDataUrl: string;
}): Promise<{ ok: true; instructions: StudentInstructions } | { ok: false; error: string }> => {
    try {
        const url = `${getApiUrl()}/instructions`;
        const response = await fetch(url, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
            body: JSON.stringify(payload),
        });
        const raw = await response.text();
        let body: any = {};
        try {
            body = raw ? JSON.parse(raw) : {};
        } catch {
            body = {};
        }
        if (!response.ok) {
            const details = body.error || raw || `HTTP ${response.status}`;
            return { ok: false, error: `فشل حفظ التعليمات: ${details}` };
        }
        return { ok: true, instructions: body as StudentInstructions };
    } catch {
        return { ok: false, error: 'تعذر الاتصال بالخادم' };
    }
};
