export type SsoErrorCode =
  | 'invalid_state'
  | 'provider_unavailable'
  | 'email_in_use'
  | 'email_required'
  | 'identity_taken'
  | 'account_inactive'
  | 'last_sign_in_method';

export class SsoError extends Error {
  constructor(public readonly code: SsoErrorCode) {
    super(code);
    this.name = 'SsoError';
  }
}
