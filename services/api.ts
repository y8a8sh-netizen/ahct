
import { SystemState } from '../types';

// تحديد رابط السيرفر ديناميكياً بناءً على رابط المتصفح
// هذا يسمح بالعمل سواء كنت على localhost أو عبر الشبكة (IP Address)
const getApiUrl = () => {
    if (import.meta.env.VITE_API_URL) {
        return import.meta.env.VITE_API_URL;
    }

    let hostname = window.location.hostname;
    
    // Fallback if hostname is empty or undefined (common in some envs)
    if (!hostname || hostname.trim() === '') {
        hostname = '127.0.0.1';
    }
    
    return `http://${hostname}:3001/api`;
};

export const fetchSystemState = async (): Promise<SystemState | null> => {
    try {
        const url = `${getApiUrl()}/state`;
        const response = await fetch(url);
        if (!response.ok) {
            const text = await response.text().catch(() => 'Unable to read response');
            console.warn(`fetchSystemState failed: ${response.status} ${response.statusText} ${text}`);
            return null;
        }
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

        if (!response.ok) {
            const text = await response.text().catch(() => 'Unable to read response');
            console.warn(`syncSystemState failed: ${response.status} ${response.statusText} ${text}`);
            return false;
        }

        return true;
    } catch (error) {
        console.warn('Sync failed (Offline Mode):', error instanceof Error ? error.message : error);
        return false;
    }
};
