/**
 * Minimal Expo push client (no SDK dependency).
 * Contract: POST https://exp.host/--/api/v2/push/send with a JSON array of
 * messages; the response `data` holds one ticket per message, in order. An
 * access token is only required when the Expo project enables enhanced push
 * security. Verify against https://docs.expo.dev/push-notifications/sending-notifications/
 * before changing this file.
 */
export const EXPO_PUSH_SEND_URL = 'https://exp.host/--/api/v2/push/send';
export const EXPO_PUSH_BATCH_MAX = 100;

export type ExpoPushMessage = {
  to: string;
  title: string;
  body: string;
  data: Record<string, string>;
  sound?: 'default';
  priority?: 'default' | 'normal' | 'high';
};

export type ExpoPushTicket =
  | { status: 'ok'; id?: string }
  | { status: 'error'; message?: string; details?: { error?: string } };

export type ExpoPushSender = (messages: ExpoPushMessage[]) => Promise<ExpoPushTicket[]>;

export class ExpoPushError extends Error {
  constructor(
    readonly code: string,
    readonly retryable: boolean,
  ) {
    super(`Expo push request failed: ${code}`);
  }
}

export function createExpoPushSender(
  accessToken: string | undefined,
  fetchImpl: typeof fetch = fetch,
): ExpoPushSender {
  return async (messages) => {
    if (messages.length > EXPO_PUSH_BATCH_MAX) {
      throw new ExpoPushError('BATCH_TOO_LARGE', false);
    }
    let response: Response;
    try {
      response = await fetchImpl(EXPO_PUSH_SEND_URL, {
        method: 'POST',
        headers: {
          accept: 'application/json',
          'content-type': 'application/json',
          ...(accessToken ? { authorization: `Bearer ${accessToken}` } : {}),
        },
        body: JSON.stringify(messages),
        signal: AbortSignal.timeout(10_000),
      });
    } catch {
      throw new ExpoPushError('NETWORK', true);
    }
    if (!response.ok) {
      throw new ExpoPushError(
        `HTTP_${response.status}`,
        response.status === 429 || response.status >= 500,
      );
    }
    const body = (await response.json().catch(() => null)) as { data?: unknown } | null;
    if (!Array.isArray(body?.data) || body.data.length !== messages.length) {
      throw new ExpoPushError('BAD_RESPONSE', true);
    }
    return body.data as ExpoPushTicket[];
  };
}
