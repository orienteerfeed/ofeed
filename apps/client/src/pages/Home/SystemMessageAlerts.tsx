import { Alert } from '@/components/organisms';
import type { AlertProps } from '@/components/organisms/Alert';
import { gql } from '@apollo/client';
import { useQuery } from '@apollo/client/react';
import type { SystemMessage, SystemMessageSeverity } from '@repo/shared';

type ActiveSystemMessagesData = {
  activeSystemMessages: SystemMessage[];
};

type AlertSeverity = NonNullable<AlertProps['severity']>;

const ACTIVE_SYSTEM_MESSAGES_QUERY = gql`
  query ActiveSystemMessages {
    activeSystemMessages {
      id
      title
      message
      severity
      publishedAt
      expiresAt
      createdAt
      updatedAt
    }
  }
`;

function mapSeverityToAlertSeverity(
  severity: SystemMessageSeverity
): AlertSeverity {
  switch (severity) {
    case 'SUCCESS':
      return 'success';
    case 'WARNING':
      return 'warning';
    case 'ERROR':
      return 'error';
    case 'INFO':
    default:
      return 'info';
  }
}

export const SystemMessageAlerts = () => {
  const { data, error } = useQuery<ActiveSystemMessagesData>(
    ACTIVE_SYSTEM_MESSAGES_QUERY
  );

  if (error) {
    console.error('Failed to load system messages', error);
    return null;
  }

  const messages = data?.activeSystemMessages ?? [];

  if (messages.length === 0) {
    return null;
  }

  return (
    <div className="container mx-auto px-4 pt-4 pb-2 md:pt-6 md:pb-0">
      <div className="space-y-3">
        {messages.map(message => {
          const titleProps = message.title ? { title: message.title } : {};

          return (
            <Alert
              key={message.id}
              severity={mapSeverityToAlertSeverity(message.severity)}
              variant="outlined"
              className="border-current/20 bg-background/85 shadow-sm backdrop-blur"
              {...titleProps}
            >
              <span className="whitespace-pre-line">{message.message}</span>
            </Alert>
          );
        })}
      </div>
    </div>
  );
};
