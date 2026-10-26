import { gql } from '@apollo/client';
import { useMutation, useQuery } from '@apollo/client/react';
import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import {
  getDeviceMetadata,
  logoutSession,
} from '@/stores/auth/session-manager';
import { toast } from '@/utils';

const SESSIONS = gql`
  query DeviceSessions {
    currentSessions {
      id
      deviceId
      deviceName
      current
      createdAt
      lastRefreshedAt
      expiresAt
      absoluteExpiresAt
    }
  }
`;
const REVOKE = gql`
  mutation RevokeDevice($deviceId: String!) {
    revokeDevice(deviceId: $deviceId)
  }
`;
type DeviceSession = {
  id: string;
  deviceId: string;
  deviceName: string;
  current: boolean;
  createdAt: string;
  lastRefreshedAt: string;
  expiresAt: string;
  absoluteExpiresAt: string;
};

export function DeviceSessions() {
  const { t, i18n } = useTranslation();
  const { data, loading, error, refetch } = useQuery<{
    currentSessions: DeviceSession[];
  }>(SESSIONS, { fetchPolicy: 'network-only' });
  const [revoke, { loading: revoking }] = useMutation(REVOKE);
  const format = (value: string) =>
    new Date(value).toLocaleString(i18n.language);
  const revokeSession = async (deviceId: string) => {
    try {
      await revoke({ variables: { deviceId } });
      if (deviceId === getDeviceMetadata().deviceId) await logoutSession();
      else await refetch();
    } catch {
      toast({ title: t('Sessions.Error'), variant: 'error' });
    }
  };
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('Sessions.Title')}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          {t('Sessions.RevocationDelay')}
        </p>
        {loading && <p role="status">{t('Sessions.Loading')}</p>}
        {error && <p role="alert">{t('Sessions.Error')}</p>}
        {data?.currentSessions.map(session => (
          <div
            key={session.id}
            role="group"
            aria-label={session.deviceName}
            className="flex flex-wrap items-center justify-between gap-3 rounded-md border p-3"
          >
            <div className="space-y-1">
              <p className="font-medium">
                {session.deviceName}{' '}
                {session.current && (
                  <span className="text-sm text-muted-foreground">
                    ({t('Sessions.Current')})
                  </span>
                )}
              </p>
              <p className="text-sm">
                {t('Sessions.Created')}: {format(session.createdAt)}
              </p>
              <p className="text-sm">
                {t('Sessions.LastRefresh')}: {format(session.lastRefreshedAt)}
              </p>
              <p className="text-sm">
                {t('Sessions.Expires')}: {format(session.expiresAt)}
              </p>
            </div>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive" disabled={revoking}>
                  {t('Sessions.Revoke')}
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>{t('Sessions.Revoke')}</AlertDialogTitle>
                  <AlertDialogDescription>
                    {t('Sessions.Confirm')}
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>{t('Sessions.Cancel')}</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={() => void revokeSession(session.deviceId)}
                  >
                    {t('Sessions.Revoke')}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
