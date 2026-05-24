
import { ActivityLog, AuthLoginResponse, SystemState, SystemUser, UserRole, UserSession } from '../types';
import { clearAuthToken, getAuthHeaders, setAuthToken } from '../utils/auth';

// تحديد رابط السيرفر ديناميكياً بناءً على رابط المتصفح
// هذا يسمح بالعمل سواء كنت على localhost أو عبر الشبكة (IP Address)
const getApiUrl = () => {
    const configuredUrl = import.meta.env.VITE_API_BASE_URL || '';
    if (configuredUrl.trim()) {
        return `${configuredUrl.replace(/\/$/, '')}/api`;
    }

    let hostname = window.location.hostname;
    if (!hostname || hostname.trim() === '') {
        hostname = '127.0.0.1';
    }

    return `http://${hostname}:3001/api`;
};

export const fetchSystemState = async (): Promise<SystemState | null> => {
    try {
        const url = `${getApiUrl()}/state`;
        const response = await fetch(url);
        if (!response.ok) throw new Error('Network response was not ok');
        return await response.json();
    } catch (error) {
        // Log as info/warn instead of error to avoid alarming user in offline mode
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

export const fetchActivityLogs = async (limit = 200): Promise<ActivityLog[] | null> => {
    try {
        const url = `${getApiUrl()}/logs?limit=${limit}`;
        const response = await fetch(url, { headers: getAuthHeaders() });
        if (!response.ok) return null;
        return await response.json();
    } catch {
        return null;
    }
};

export const clearActivityLogs = async (): Promise<{ ok: boolean; error?: string }> => {
    try {
        const url = `${getApiUrl()}/logs`;
        const response = await fetch(url, {
            method: 'DELETE',
            headers: getAuthHeaders(),
        });
        const body = await response.json().catch(() => ({}));
        if (!response.ok) return { ok: false, error: body.error || 'فشل مسح السجل' };
        return { ok: true };
    } catch {
        return { ok: false, error: 'تعذر الاتصال بالخادم' };
    }
};
