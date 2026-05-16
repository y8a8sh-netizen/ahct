export type PortalRole = 'student' | 'proctor';

const PORTAL_PATHS: Record<PortalRole, string> = {
  student: '/student',
  proctor: '/proctor',
};

export function getPortalFromPath(pathname: string): PortalRole | null {
  const normalized = pathname.replace(/\/$/, '') || '/';
  if (normalized === PORTAL_PATHS.student) return 'student';
  if (normalized === PORTAL_PATHS.proctor) return 'proctor';
  return null;
}

export function setPortalPath(role: PortalRole | null): void {
  const path = role ? PORTAL_PATHS[role] : '/';
  if (window.location.pathname !== path) {
    window.history.replaceState(null, '', path);
  }
}

export function createGuestPortalSession(role: PortalRole) {
  return role === 'student'
    ? { id: 'guest-student', name: 'بوابة المتدربين', role: 'student' as const, readOnly: true }
    : { id: 'guest-proctor', name: 'بوابة المراقبين', role: 'proctor' as const, readOnly: true };
}
