export const MEOS_MIP_NAMESPACE = 'http://www.melin.nu/mip';

export const MEOS_STATUS_RESPONSE = {
  OK: '<?xml version="1.0"?><MOPStatus status="OK"></MOPStatus>',
  BADCMP: '<?xml version="1.0"?><MOPStatus status="BADCMP"></MOPStatus>',
  BADPWD: '<?xml version="1.0"?><MOPStatus status="BADPWD"></MOPStatus>',
  NOZIP: '<?xml version="1.0"?><MOPStatus status="NOZIP"></MOPStatus>',
  ERROR: '<?xml version="1.0"?><MOPStatus status="ERROR"></MOPStatus>',
} as const;

export type MeosStatus = keyof typeof MEOS_STATUS_RESPONSE;

export function meosStatusXml(status: MeosStatus): Response {
  return new Response(MEOS_STATUS_RESPONSE[status], {
    status: 200,
    headers: { 'Content-Type': 'text/xml; charset=utf-8' },
  });
}

export function parseMeosPositiveIntegerHeader(value: string | undefined): number | null {
  if (!value || !/^\d+$/.test(value)) return null;

  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}
