import { decodeBase64, decrypt } from '../../lib/crypto/encryption.js';
import prisma from '../../utils/context.js';

export type MeosPasswordVerificationResult = 'OK' | 'BADPWD' | 'ERROR';

export async function verifyMeosEventPassword(
  eventId: string,
  pwdHeader: string | undefined,
): Promise<MeosPasswordVerificationResult> {
  const eventPassword = await prisma.eventPassword.findFirst({
    where: { eventId },
    select: { password: true, expiresAt: true },
  });

  if (!eventPassword || eventPassword.expiresAt <= new Date()) {
    return 'BADPWD';
  }

  let decryptedPassword: string;
  try {
    decryptedPassword = decrypt(decodeBase64(eventPassword.password));
  } catch {
    return 'ERROR';
  }

  return pwdHeader === decryptedPassword ? 'OK' : 'BADPWD';
}
