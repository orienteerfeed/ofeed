export const PATHNAMES = {
  home: () => ({ to: '/', params: {} as const }),
  about: () => ({ to: '/about', params: {} as const }),
  contact: () => ({ to: '/contact', params: {} as const }),
  event: () => ({ to: '/event', params: {} as const }),
  myEvents: () => ({ to: '/my-events', params: {} as const }),
  eventDetail: (eventId: string) => ({
    to: '/events/$eventId',
    params: { eventId } as const,
    url: `/events/${eventId}`,
  }),
  eventReport: (eventId: string) => ({
    to: '/events/$eventId/report',
    params: { eventId } as const,
    url: `/events/${eventId}/report`,
  }),
  eventSettings: (eventId: string) => ({
    to: '/events/$eventId/settings',
    params: { eventId } as const,
  }),
  classDetail: (eventId: string, classId: string) => ({
    to: '/events/$eventId/class/$classId',
    params: { eventId, classId } as const,
  }),
  profile: () => ({ to: '/profile', params: {} as const }),
  blog: () => ({ to: '/blog', params: {} as const }),
  settings: () => ({ to: '/settings', params: {} as const }),
  signIn: () => ({ to: '/auth/signin', params: {} as const }),
  forgotPassword: () => ({ to: '/auth/forgot-password', params: {} as const }),
  resetPassword: (token: string) => ({
    to: '/auth/reset-password/$token',
    params: { token } as const,
  }),
  getResetPassword: () => ({ to: '/auth/reset-password', params: {} as const }),
} as const;

export default PATHNAMES;
