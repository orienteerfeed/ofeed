export const pathnames = {
  home: () => ({ to: '/', params: {} as const }),
  about: () => ({ to: '/about', params: {} as const }),
  contact: () => ({ to: '/contact', params: {} as const }),
  event: () => ({ to: '/event', params: {} as const }),
  myEvents: () => ({ to: '/my-events', params: {} as const }),
  eventDetail: (eventId: string) => ({
    to: '/event/$eventId',
    params: { eventId } as const,
  }),
  eventReport: (eventId: string) => ({
    to: '/event/$eventId/report',
    params: { eventId } as const,
  }),
  eventSettings: (eventId: string) => ({
    to: '/event/$eventId/settings',
    params: { eventId } as const,
  }),
  classDetail: (eventId: string, classId: string) => ({
    to: '/event/$eventId/class/$classId',
    params: { eventId, classId } as const,
  }),
  profile: () => ({ to: '/profile', params: {} as const }),
  settings: () => ({ to: '/settings', params: {} as const }),
  signIn: () => ({ to: '/signin', params: {} as const }),
  resetPassword: () => ({ to: '/reset-password', params: {} as const }),
  passwordResetConfirmation: (userHash: string) => ({
    to: '/password-reset-confirmation/$userHash',
    params: { userHash } as const,
  }),
  buyMeCoffee: () => ({
    to: 'https://buymeacoffee.com/ofeed',
    params: {} as const,
  }),
  discord: () => ({ to: 'https://discord.gg/YWURC23tHZ', params: {} as const }),
  github: () => ({
    to: 'https://github.com/orienteerfeed/ofeed',
    params: {} as const,
  }),
} as const;

export default pathnames;
