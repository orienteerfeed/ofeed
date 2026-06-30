import { logger } from '../../lib/logging.js';
import type { AppOpenAPI } from '../../types/index.js';
import prisma from '../../utils/context.js';

import { verifyMeosEventPassword } from './meos.auth.js';
import { meosStatusXml, parseMeosPositiveIntegerHeader } from './meos.protocol.js';
import { buildMipDocumentForEvent } from './mip.service.js';
import { renderMipDocument, type MipDocument } from './mip.xml.js';

function parseNonNegativeIntegerHeader(value: string | undefined): number | null {
  if (value === undefined || value === '') return 0;
  if (!/^\d+$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

function mipXml(document: MipDocument, status = 200): Response {
  return new Response(renderMipDocument(document), {
    status,
    headers: { 'Content-Type': 'application/xml; charset=utf-8' },
  });
}

export function registerMeosMipHandler(router: AppOpenAPI): void {
  router.get('/mip', async (c) => {
    const lastId = parseNonNegativeIntegerHeader(c.req.header('lastid'));
    if (lastId === null) {
      return mipXml({ lastId: 0, entries: [] }, 400);
    }

    const meosCompetitionId = parseMeosPositiveIntegerHeader(c.req.header('competition'));
    if (meosCompetitionId === null) {
      logger.warn('MeOS MIP poll: missing or invalid competition header');
      return meosStatusXml('BADCMP');
    }

    const binding = await prisma.eventMeosBinding.findFirst({
      where: { id: meosCompetitionId },
      select: { id: true, eventId: true },
    });
    if (!binding) {
      logger.warn('MeOS MIP poll: no binding found', { meosCompetitionId });
      return meosStatusXml('BADCMP');
    }

    const { eventId } = binding;

    const passwordStatus = await verifyMeosEventPassword(eventId, c.req.header('pwd'));
    if (passwordStatus !== 'OK') {
      if (passwordStatus === 'ERROR') {
        logger.error('MeOS MIP poll: password decryption failed', { eventId, meosCompetitionId });
      } else {
        logger.warn('MeOS MIP poll: password missing, expired, or mismatched', {
          eventId,
          meosCompetitionId,
        });
      }
      return meosStatusXml(passwordStatus);
    }

    try {
      const document = await buildMipDocumentForEvent(eventId, lastId);
      logger.info('MeOS MIP poll: success', {
        eventId,
        meosCompetitionId,
        lastId,
        responseLastId: document.lastId,
        entryCount: document.entries.length,
      });

      return new Response(renderMipDocument(document), {
        status: 200,
        headers: { 'Content-Type': 'application/xml; charset=utf-8' },
      });
    } catch (err) {
      logger.error('MeOS MIP poll: failed to build response', {
        eventId,
        meosCompetitionId,
        error: err instanceof Error ? err.message : String(err),
      });
      return mipXml({ lastId, entries: [] }, 500);
    }
  });
}
