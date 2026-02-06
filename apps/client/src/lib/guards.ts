import { gql } from '@apollo/client';
import { redirect } from '@tanstack/react-router';
import { apolloClient } from '../providers/apolloClient';
import { getSession, type Session } from '../stores/auth/session';

type AuthSession = NonNullable<Session>; // = { user: User }

interface EventAuthUsers {
  authorId: number;
  teamUserIds?: number[];
}

interface GetEventAuthUsersResponse {
  event: EventAuthUsers;
}

const GET_EVENT_AUTH_USERS = gql`
  query GetEventAuthUsers($eventId: String!) {
    event(id: $eventId) {
      authorId
    }
  }
`;

export class ForbiddenError extends Error {
  status = 403 as const;
  constructor(message = 'Forbidden') {
    super(message);
    this.name = 'ForbiddenError';
  }
}

export async function requireAuth({
  location,
}: {
  location: { href: string };
}): Promise<AuthSession> {
  const session = await getSession();
  if (!session) {
    throw redirect({ to: '/auth/signin', search: { redirect: location.href } });
  }
  return session;
}

export async function requireAdmin(opts: { location: { href: string } }) {
  const session = await requireAuth(opts);
  if (session.user.role !== 'admin') {
    throw new ForbiddenError();
  }
  return session;
}

export async function requireEventAccess({
  params,
  location,
}: {
  params: { eventId: string };
  location: { href: string };
}) {
  const session = await requireAuth({ location });
  const evt = await getEventAuthUsers(params.eventId);
  const allowed =
    evt.authorId === session.user.id ||
    (evt.teamUserIds ?? []).includes(session.user.id);
  if (!allowed) {
    throw new ForbiddenError();
  }
  return { session, event: evt };
}

export async function requireEventAccessOrForbidden({
  params,
}: {
  params: { eventId: string };
}) {
  const session = await getSession();
  if (!session) {
    throw new ForbiddenError();
  }

  const evt = await getEventAuthUsers(params.eventId);
  const allowed =
    evt.authorId === session.user.id ||
    (evt.teamUserIds ?? []).includes(session.user.id);
  if (!allowed) {
    throw new ForbiddenError();
  }
  return { session, event: evt };
}

// --- helper na event ---
async function getEventAuthUsers(eventId: string): Promise<EventAuthUsers> {
  try {
    const result = await apolloClient.query<GetEventAuthUsersResponse>({
      query: GET_EVENT_AUTH_USERS,
      variables: { eventId },
      fetchPolicy: 'network-only',
    });

    if (result.error) {
      throw new Error(result.error.message || 'GraphQL error');
    }

    if (!result.data?.event) {
      throw new Error('Event not found');
    }

    return {
      authorId: result.data.event.authorId,
      teamUserIds: [],
    };
  } catch (error) {
    console.error('Failed to fetch event auth users:', error);
    throw new Error('Event fetch failed');
  }
}
