const AUTH_TOKEN_KEY = 'tvtc_auth_token';

export const getAuthToken = (): string | null => {
    try {
        return sessionStorage.getItem(AUTH_TOKEN_KEY);
    } catch {
        return null;
    }
};

export const setAuthToken = (token: string): void => {
    sessionStorage.setItem(AUTH_TOKEN_KEY, token);
};

export const clearAuthToken = (): void => {
    sessionStorage.removeItem(AUTH_TOKEN_KEY);
};

export const getAuthHeaders = (): Record<string, string> => {
    const token = getAuthToken();
    if (!token) return {};
    return { Authorization: `Bearer ${token}` };
};
