import { createRequire } from 'node:module';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AuthenticationError, ValidationError } from '../../exceptions/index.js';
import type { GraphQLContext } from '../context.js';

const eventServiceMock = vi.hoisted(() => ({
  findEventById: vi.fn(),
  findEventsBySport: vi.fn(),
  findEventsByUser: vi.fn(),
  findEventsConnection: vi.fn(),
  getDecryptedEventPassword: vi.fn(),
  searchPublishedEvents: vi.fn(),
  subscribeWinnerUpdated: vi.fn(),
  updateEventVisibility: vi.fn(),
}));

const authServiceMock = vi.hoisted(() => ({
  verifyEmail: vi.fn(),
  authenticateUser: vi.fn(),
  changeAuthenticatedUserPassword: vi.fn(),
  passwordResetConfirm: vi.fn(),
  passwordResetRequest: vi.fn(),
  signupUser: vi.fn(),
}));

const competitorServiceMock = vi.hoisted(() => ({
  changeCompetitorStatusForGraphQL: vi.fn(),
  createCompetitorForGraphQL: vi.fn(),
  findCompetitorById: vi.fn(),
  findCompetitorSplits: vi.fn(),
  findCompetitorsByClass: vi.fn(),
  findCompetitorsByOrganisation: vi.fn(),
  findCompetitorsByTeam: vi.fn(),
  findOrganisationNamesByEvent: vi.fn(),
  findOrganisationsByEvent: vi.fn(),
  searchOrganisationNamesByEvent: vi.fn(),
  subscribeCompetitorUpdated: vi.fn(),
  subscribeCompetitorsByClassUpdated: vi.fn(),
  updateCompetitorForGraphQL: vi.fn(),
}));

const splitServiceMock = vi.hoisted(() => ({
  findSplitPublicationStatus: vi.fn(),
  findSplitsByCompetitor: vi.fn(),
  subscribeSplitCompetitorsByClassUpdated: vi.fn(),
}));

vi.mock('../../modules/event/event.service.js', () => eventServiceMock);
vi.mock('../../modules/auth/auth.service.js', () => authServiceMock);
vi.mock('../../modules/competitor/competitor.service.js', () => competitorServiceMock);
vi.mock('../../modules/split/split.service.js', () => splitServiceMock);

import { schema } from '../schema.js';

const require = createRequire(import.meta.url);
const pothosRequire = createRequire(require.resolve('@pothos/core'));
const { graphql, parse, subscribe } = pothosRequire('graphql') as typeof import('graphql');

const prismaContext = { marker: 'prisma' };
const pubsubContext = { marker: 'pubsub' };

type RuntimeExecutionResult = {
  data?: unknown;
  errors?: ReadonlyArray<{
    message: string;
    extensions?: Record<string, unknown>;
  }>;
};

function createContext(): GraphQLContext {
  return {
    prisma: prismaContext,
    auth: {
      isAuthenticated: true,
      userId: 7,
    },
    activationUrl: 'https://app.example.test/activate',
    resetPasswordUrl: 'https://app.example.test/reset-password',
    pubsub: pubsubContext,
  } as unknown as GraphQLContext;
}

async function execute(
  source: string,
  contextValue = createContext(),
  variableValues?: Record<string, unknown>,
) {
  return graphql({
    schema,
    source,
    contextValue,
    variableValues,
  });
}

function singleValueAsyncIterable<T>(value: T): AsyncIterable<T> {
  return {
    async *[Symbol.asyncIterator]() {
      yield value;
    },
  };
}

function isAsyncIterable(value: unknown): value is AsyncIterable<unknown> {
  return Boolean(
    value &&
    typeof value === 'object' &&
    Symbol.asyncIterator in value &&
    typeof (value as { [Symbol.asyncIterator]?: unknown })[Symbol.asyncIterator] === 'function',
  );
}

async function subscribeOnce(
  source: string,
  contextValue = createContext(),
): Promise<RuntimeExecutionResult> {
  const result = await subscribe({
    schema,
    document: parse(source),
    contextValue,
  });

  if (!isAsyncIterable(result)) {
    throw new Error('Expected subscription to return an async iterable');
  }

  const iterator = result[Symbol.asyncIterator]();
  const next = await iterator.next();
  await iterator.return?.();

  if (next.done) {
    throw new Error('Expected subscription to yield a value');
  }

  return next.value as RuntimeExecutionResult;
}

describe('GraphQL runtime execution', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('executes events(input) and returns the connection shape', async () => {
    const context = createContext();
    eventServiceMock.findEventsConnection.mockResolvedValue({
      edges: [
        {
          cursor: 'event-1',
          node: {
            id: 'event-1',
            name: 'Spring Cup',
          },
        },
      ],
      pageInfo: {
        hasNextPage: false,
        hasPreviousPage: false,
        startCursor: 'event-1',
        endCursor: 'event-1',
      },
    });

    const result = await execute(
      `#graphql
        query EventsConnection {
          events(input: { first: 1, filter: UPCOMING, search: "spring" }) {
            edges {
              cursor
              node {
                id
                name
              }
            }
            pageInfo {
              hasNextPage
              hasPreviousPage
              startCursor
              endCursor
            }
          }
        }
      `,
      context,
    );

    expect(result.errors).toBeUndefined();
    expect(result.data).toEqual({
      events: {
        edges: [
          {
            cursor: 'event-1',
            node: {
              id: 'event-1',
              name: 'Spring Cup',
            },
          },
        ],
        pageInfo: {
          hasNextPage: false,
          hasPreviousPage: false,
          startCursor: 'event-1',
          endCursor: 'event-1',
        },
      },
    });
    expect(eventServiceMock.findEventsConnection).toHaveBeenCalledWith(
      context.prisma,
      expect.objectContaining({
        filter: 'UPCOMING',
        first: 1,
        search: 'spring',
      }),
    );
  });

  it('executes searchEvents through the event service', async () => {
    const context = createContext();
    eventServiceMock.searchPublishedEvents.mockResolvedValue([
      {
        id: 'event-2',
        name: 'Night Sprint',
      },
    ]);

    const result = await execute(
      `#graphql
        query SearchEvents {
          searchEvents(query: "night") {
            id
            name
          }
        }
      `,
      context,
    );

    expect(result.errors).toBeUndefined();
    expect(result.data).toEqual({
      searchEvents: [
        {
          id: 'event-2',
          name: 'Night Sprint',
        },
      ],
    });
    expect(eventServiceMock.searchPublishedEvents).toHaveBeenCalledWith(context.prisma, 'night');
  });

  it('executes updateEventVisibility with auth context and returns EventResponse', async () => {
    const context = createContext();
    eventServiceMock.updateEventVisibility.mockResolvedValue({
      message: 'Event visibility updated to Public',
      event: {
        id: 'event-3',
        published: true,
      },
    });

    const result = await execute(
      `#graphql
        mutation UpdateEventVisibility {
          updateEventVisibility(eventId: "event-3", published: true) {
            message
            event {
              id
              published
            }
          }
        }
      `,
      context,
    );

    expect(result.errors).toBeUndefined();
    expect(result.data).toEqual({
      updateEventVisibility: {
        message: 'Event visibility updated to Public',
        event: {
          id: 'event-3',
          published: true,
        },
      },
    });
    expect(eventServiceMock.updateEventVisibility).toHaveBeenCalledWith(
      context.prisma,
      context.auth,
      'event-3',
      true,
    );
  });

  it('surfaces updateEventVisibility service errors through GraphQL', async () => {
    eventServiceMock.updateEventVisibility.mockRejectedValue(new Error('Forbidden'));

    const result = await execute(
      `#graphql
        mutation UpdateEventVisibilityDenied {
          updateEventVisibility(eventId: "event-3", published: false) {
            message
          }
        }
      `,
    );

    expect(result.data).toBeNull();
    expect(result.errors?.[0]?.message).toBe('Forbidden');
  });

  it('maps signin AuthenticationError("Login failed") to the public GraphQL error', async () => {
    authServiceMock.authenticateUser.mockRejectedValue(new AuthenticationError('Login failed'));

    const result = await execute(
      `#graphql
        mutation Signin {
          signin(input: { username: "runner@example.test", password: "bad-password" }) {
            token
          }
        }
      `,
    );

    expect(result.data).toEqual({ signin: null });
    expect(result.errors?.[0]?.message).toBe('Invalid email or password');
    expect(result.errors?.[0]?.extensions?.code).toBe('UNAUTHENTICATED');
    expect(authServiceMock.authenticateUser).toHaveBeenCalledWith(
      'runner@example.test',
      'bad-password',
    );
  });

  it('rejects signin with overlong username before auth service execution', async () => {
    const result = await execute(
      `#graphql
        mutation SigninValidation($input: LoginInput) {
          signin(input: $input) {
            token
          }
        }
      `,
      createContext(),
      {
        input: {
          username: 'r'.repeat(256),
          password: 'bad-password',
        },
      },
    );

    expect(result.errors?.[0]?.message).toContain(
      'username_String_NotNull_maxLength_255 must be at most 255 characters long',
    );
    expect(authServiceMock.authenticateUser).not.toHaveBeenCalled();
  });

  it('returns token and user details from signup', async () => {
    authServiceMock.signupUser.mockResolvedValue({
      token: 'signup-token',
      user: {
        id: 42,
        role: 'USER',
        organisation: 'OK Test',
        emergencyContact: null,
      },
    });

    const result = await execute(
      `#graphql
        mutation Signup($input: UserInput) {
          signup(input: $input) {
            token
            message
            user {
              id
              firstname
              lastname
              email
              role
              organisation
              emergencyContact
            }
          }
        }
      `,
      createContext(),
      {
        input: {
          email: 'runner@example.test',
          password: 'secret-password',
          firstname: 'Test',
          lastname: 'Runner',
          organisation: 'OK Test',
        },
      },
    );

    expect(result.errors).toBeUndefined();
    expect(result.data).toEqual({
      signup: {
        token: 'signup-token',
        message: 'User successfuly created',
        user: {
          id: 42,
          firstname: 'Test',
          lastname: 'Runner',
          email: 'runner@example.test',
          role: 'USER',
          organisation: 'OK Test',
          emergencyContact: null,
        },
      },
    });
    expect(authServiceMock.signupUser).toHaveBeenCalledWith(
      'runner@example.test',
      'secret-password',
      'Test',
      'Runner',
      'https://app.example.test/activate',
      'OK Test',
    );
  });

  it('maps signup validation failures to public GraphQL errors', async () => {
    authServiceMock.signupUser.mockRejectedValue(new ValidationError('Email already in use'));

    const result = await execute(
      `#graphql
        mutation Signup($input: UserInput) {
          signup(input: $input) {
            token
          }
        }
      `,
      createContext(),
      {
        input: {
          email: 'runner@example.test',
          password: 'secret-password',
          firstname: 'Test',
          lastname: 'Runner',
        },
      },
    );

    expect(result.data).toEqual({ signup: null });
    expect(result.errors?.[0]?.message).toBe('Email already in use');
    expect(result.errors?.[0]?.extensions?.code).toBe('BAD_USER_INPUT');
  });

  it('returns token and user details from email verification', async () => {
    authServiceMock.verifyEmail.mockResolvedValue({
      token: 'verified-token',
      user: {
        userId: 77,
        firstName: 'Verified',
        lastName: 'Runner',
        email: 'verified@example.test',
        role: 'USER',
        organisation: 'OK Test',
        emergencyContact: null,
      },
    });

    const result = await execute(
      `#graphql
        mutation VerifyEmail($token: String!) {
          verifyEmail(token: $token) {
            token
            user {
              id
              firstname
              lastname
              email
              role
              organisation
              emergencyContact
            }
          }
        }
      `,
      createContext(),
      { token: 'email-token' },
    );

    expect(result.errors).toBeUndefined();
    expect(result.data).toEqual({
      verifyEmail: {
        token: 'verified-token',
        user: {
          id: 77,
          firstname: 'Verified',
          lastname: 'Runner',
          email: 'verified@example.test',
          role: 'USER',
          organisation: 'OK Test',
          emergencyContact: null,
        },
      },
    });
    expect(authServiceMock.verifyEmail).toHaveBeenCalledWith('email-token');
  });

  it('rejects createUserCard with an empty card number at GraphQL input validation', async () => {
    const result = await execute(
      `#graphql
        mutation CreateUserCardValidation($input: CreateUserCardInput!) {
          createUserCard(input: $input) {
            id
          }
        }
      `,
      createContext(),
      {
        input: {
          sportId: 1,
          type: 'SPORTIDENT',
          cardNumber: '',
        },
      },
    );

    expect(result.errors?.[0]?.message).toContain(
      'cardNumber_String_NotNull_minLength_1_maxLength_64 must be at least 1 characters long',
    );
  });

  it('executes competitorStatusChange through the guarded competitor service', async () => {
    const context = createContext();
    competitorServiceMock.changeCompetitorStatusForGraphQL.mockResolvedValue({
      message: 'Competitor status changed',
    });

    const result = await execute(
      `#graphql
        mutation CompetitorStatusChange {
          competitorStatusChange(
            input: {
              eventId: "event-4"
              competitorId: 12
              origin: "START"
              status: "Active"
            }
          ) {
            message
          }
        }
      `,
      context,
    );

    expect(result.errors).toBeUndefined();
    expect(result.data).toEqual({
      competitorStatusChange: {
        message: 'Competitor status changed',
      },
    });
    expect(competitorServiceMock.changeCompetitorStatusForGraphQL).toHaveBeenCalledWith(
      context.prisma,
      context.auth,
      {
        competitorId: 12,
        eventId: 'event-4',
        origin: 'START',
        status: 'Active',
      },
    );
  });

  it('rejects competitorStatusChange with an unsupported origin before service execution', async () => {
    const result = await execute(
      `#graphql
        mutation CompetitorStatusChangeValidation($input: StatusChange!) {
          competitorStatusChange(input: $input) {
            message
          }
        }
      `,
      createContext(),
      {
        input: {
          eventId: 'event-4',
          competitorId: 12,
          origin: 'FINISH',
          status: 'Active',
        },
      },
    );

    expect(result.errors?.[0]?.message).toContain(
      'origin_String_NotNull_maxLength_32_pattern_START does not match the required pattern',
    );
    expect(competitorServiceMock.changeCompetitorStatusForGraphQL).not.toHaveBeenCalled();
  });

  it('rejects competitorCreate when Zod input validation fails before service execution', async () => {
    const result = await execute(
      `#graphql
        mutation CompetitorCreateValidation($input: StoreCompetitorInput!) {
          competitorCreate(input: $input) {
            message
          }
        }
      `,
      createContext(),
      {
        input: {
          eventId: 'event-4',
          classId: 21,
          origin: '',
          firstname: 'Ada',
          lastname: 'Runner',
        },
      },
    );

    expect(result.errors?.[0]?.message).toContain('origin');
    expect(competitorServiceMock.createCompetitorForGraphQL).not.toHaveBeenCalled();
  });

  it('rejects changelogByEvent when Zod query input validation fails', async () => {
    const result = await execute(
      `#graphql
        query ChangelogValidation {
          changelogByEvent(eventId: "") {
            id
          }
        }
      `,
    );

    expect(result.data).toEqual({ changelogByEvent: null });
    expect(result.errors?.[0]?.message).toContain('eventId');
  });

  it('executes splitPublicationStatus with auth context', async () => {
    const context = createContext();
    splitServiceMock.findSplitPublicationStatus.mockResolvedValue({
      eventId: 'event-5',
      classId: 21,
      mode: 'LAST_START',
      isPublished: false,
      isAccessible: false,
      publishAt: null,
      reason: 'WAITING_FOR_LAST_START',
    });

    const result = await execute(
      `#graphql
        query SplitPublicationStatus {
          splitPublicationStatus(classId: 21) {
            eventId
            classId
            mode
            isPublished
            isAccessible
            publishAt
            reason
          }
        }
      `,
      context,
    );

    expect(result.errors).toBeUndefined();
    expect(result.data).toEqual({
      splitPublicationStatus: {
        eventId: 'event-5',
        classId: 21,
        mode: 'LAST_START',
        isPublished: false,
        isAccessible: false,
        publishAt: null,
        reason: 'WAITING_FOR_LAST_START',
      },
    });
    expect(splitServiceMock.findSplitPublicationStatus).toHaveBeenCalledWith(
      context.prisma,
      context.auth,
      { classId: 21 },
    );
  });

  it('executes competitorSplits through the split publication guard service', async () => {
    const context = createContext();
    splitServiceMock.findSplitsByCompetitor.mockResolvedValue([
      {
        id: 1,
        competitorId: 12,
        controlCode: 31,
        time: 123,
      },
      {
        id: 2,
        competitorId: 12,
        controlCode: 32,
        time: null,
      },
    ]);

    const result = await execute(
      `#graphql
        query CompetitorSplits {
          competitorSplits(competitorId: 12) {
            id
            competitorId
            controlCode
            time
          }
        }
      `,
      context,
    );

    expect(result.errors).toBeUndefined();
    expect(result.data).toEqual({
      competitorSplits: [
        {
          id: 1,
          competitorId: 12,
          controlCode: 31,
          time: 123,
        },
        {
          id: 2,
          competitorId: 12,
          controlCode: 32,
          time: null,
        },
      ],
    });
    expect(splitServiceMock.findSplitsByCompetitor).toHaveBeenCalledWith(
      context.prisma,
      context.auth,
      { competitorId: 12 },
    );
  });

  it('executes winnerUpdated subscription payloads', async () => {
    const context = createContext();
    eventServiceMock.subscribeWinnerUpdated.mockReturnValue(
      singleValueAsyncIterable({
        winnerUpdated: {
          eventId: 'event-6',
          classId: 31,
          className: 'M21',
          name: 'Ada Runner',
        },
      }),
    );

    const result = await subscribeOnce(
      `#graphql
        subscription WinnerUpdated {
          winnerUpdated(eventId: "event-6") {
            eventId
            classId
            className
            name
          }
        }
      `,
      context,
    );

    expect(result.errors).toBeUndefined();
    expect(result.data).toEqual({
      winnerUpdated: {
        eventId: 'event-6',
        classId: 31,
        className: 'M21',
        name: 'Ada Runner',
      },
    });
    expect(eventServiceMock.subscribeWinnerUpdated).toHaveBeenCalledWith('event-6', context.pubsub);
  });

  it('executes competitorUpdated subscription payloads', async () => {
    const context = createContext();
    competitorServiceMock.subscribeCompetitorUpdated.mockReturnValue(
      singleValueAsyncIterable({
        competitorUpdated: {
          id: 12,
          classId: 21,
          firstname: 'Ada',
          lastname: 'Runner',
          registration: 'ABC1234',
          lateStart: false,
        },
      }),
    );

    const result = await subscribeOnce(
      `#graphql
        subscription CompetitorUpdated {
          competitorUpdated(eventId: "event-7") {
            id
            classId
            firstname
            lastname
            registration
            lateStart
          }
        }
      `,
      context,
    );

    expect(result.errors).toBeUndefined();
    expect(result.data).toEqual({
      competitorUpdated: {
        id: 12,
        classId: 21,
        firstname: 'Ada',
        lastname: 'Runner',
        registration: 'ABC1234',
        lateStart: false,
      },
    });
    expect(competitorServiceMock.subscribeCompetitorUpdated).toHaveBeenCalledWith(
      'event-7',
      context.pubsub,
    );
  });

  it('executes splitCompetitorsByClassUpdated subscription payloads', async () => {
    const context = createContext();
    splitServiceMock.subscribeSplitCompetitorsByClassUpdated.mockReturnValue(
      singleValueAsyncIterable({
        splitCompetitorsByClassUpdated: [
          {
            id: 13,
            classId: 22,
            firstname: 'Beda',
            lastname: 'Runner',
            registration: 'DEF5678',
            lateStart: true,
          },
        ],
      }),
    );

    const result = await subscribeOnce(
      `#graphql
        subscription SplitCompetitorsByClassUpdated {
          splitCompetitorsByClassUpdated(classId: 22) {
            id
            classId
            firstname
            lastname
            registration
            lateStart
          }
        }
      `,
      context,
    );

    expect(result.errors).toBeUndefined();
    expect(result.data).toEqual({
      splitCompetitorsByClassUpdated: [
        {
          id: 13,
          classId: 22,
          firstname: 'Beda',
          lastname: 'Runner',
          registration: 'DEF5678',
          lateStart: true,
        },
      ],
    });
    expect(splitServiceMock.subscribeSplitCompetitorsByClassUpdated).toHaveBeenCalledWith(
      context.prisma,
      context.auth,
      22,
      context.pubsub,
    );
  });
});
