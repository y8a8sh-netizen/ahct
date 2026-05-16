export type PortalRole = 'student' | 'proctor';

const PORTAL_PATHS: Record<PortalRole, string> = {
  student: '/student',
  proctor: '/proctor',
};

export function getPortalFromPath(pathname: string): PortalRole | null {
  const normalized = (pathname.split('?')[0].split('#')[0].replace(/\/$/, '') || '/').toLowerCase();
  if (normalized === PORTAL_PATHS.student || normalized.endsWith('/student')) return 'student';
  if (normalized === PORTAL_PATHS.proctor || normalized.endsWith('/proctor')) return 'proctor';
  return null;
}

export function readPortalFromBrowser(): PortalRole | null {
  if (typeof window === 'undefined') return null;
  return getPortalFromPath(window.location.pathname);
}

export function setPortalPath(role: PortalRole | null): void {
  const path = role ? PORTAL_PATHS[role] : '/';
  if (window.location.pathname !== path) {
    window.history.replaceState(null, '', path);
  }
}

export function getPortalUrl(role: PortalRole): string {
  if (typeof window === 'undefined') return PORTAL_PATHS[role];
  return `${window.location.origin}${PORTAL_PATHS[role]}`;
}

export function createGuestPortalSession(role: PortalRole) {
  return role === 'student'
    ? { id: 'guest-student', name: 'بوابة المتدربين', role: 'student' as const, readOnly: true }
    : { id: 'guest-proctor', name: 'بوابة المراقبين', role: 'proctor' as const, readOnly: true };
}
