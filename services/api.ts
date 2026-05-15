
import { SystemState } from '../types';

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
            },
            body: JSON.stringify(data),
        });
        return response.ok;
    } catch (error) {
        console.warn('Sync failed (Offline Mode):', error instanceof Error ? error.message : error);
        return false;
    }
};
// دالة تسجيل دخول المتدرب الجديدة
export const loginStudent = async (studentId: string): Promise<{
    success: boolean;
    role: string;
    studentData: any;
    redirectUrl: string;
    message?: string;
} | null> => {
    try {
        const url = `${getApiUrl()}/student-login`; // سيقوم بطلب المسار الذي أنشأناه في السيرفر
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ studentId }),
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.message || 'فشل تسجيل الدخول');
        }

        return await response.json();
    } catch (error) {
        console.error('Login Error:', error instanceof Error ? error.message : error);
        return null;
    }
};
