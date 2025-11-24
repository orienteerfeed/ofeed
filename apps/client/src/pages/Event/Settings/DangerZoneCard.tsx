import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { ENDPOINTS } from '@/lib/api/endpoints';
import { useNavigate } from '@tanstack/react-router';
import { TFunction } from 'i18next';
import { AlertTriangle, Database, Trash2, Users } from 'lucide-react';
import React from 'react';
import { Button } from '../../../components/atoms';
import { ConfirmDialog } from '../../../components/molecules';
import { useConfirmDialog } from '../../../hooks';
import { useRequest } from '../../../hooks/useRequest';
import { toast } from '../../../utils';

interface DangerZoneCardProps {
  t: TFunction;
  eventId: string;
  onEventDataDeleted?: () => void;
}

interface ApiError {
  errors?: Array<{
    param: string;
    msg: string;
  }>;
  message?: string;
}

export const DangerZoneCard: React.FC<DangerZoneCardProps> = ({
  t,
  eventId,
  onEventDataDeleted,
}) => {
  const navigate = useNavigate();
  const { dialogState, showConfirm, hideConfirm, handleConfirm } =
    useConfirmDialog();

  // Use the existing useRequest hook for all operations
  const deleteCompetitorsRequest = useRequest();
  const deleteAllDataRequest = useRequest();
  const deleteEventRequest = useRequest();

  const handleDeleteCompetitors = () => {
    showConfirm(
      t('Pages.Event.DangerZone.DeleteCompetitors.ConfirmTitle'),
      t('Pages.Event.DangerZone.DeleteCompetitors.ConfirmDescription'),
      () => {
        deleteCompetitorsRequest.request(
          ENDPOINTS.deleteEventCompetitors(eventId),
          {
            method: 'DELETE',
            onSuccess: () => {
              // Success handled by useRequest toast
              toast({
                title: t('Operations.Success', { ns: 'common' }),
                description: t(
                  'Pages.Event.DangerZone.Toast.DeleteSuccessDescription'
                ),
                variant: 'default',
              });
            },
            onError: (error: string | ApiError) => {
              console.error('Failed to delete competitors:', error);
              toast({
                title: t('Pages.Event.DangerZone.Toast.DeleteFailTitle'),
                description: error.toString(),
                variant: 'error',
              });
            },
          }
        );
      },
      {
        variant: 'destructive',
        confirmText: t(
          'Pages.Event.DangerZone.DeleteCompetitors.ConfirmButton'
        ),
      }
    );
  };

  const handleDeleteAllEventData = () => {
    showConfirm(
      t('Pages.Event.DangerZone.DeleteAllEventData.ConfirmTitle'),
      t('Pages.Event.DangerZone.DeleteAllEventData.ConfirmDescription'),
      () => {
        deleteAllDataRequest.request(ENDPOINTS.deleteEventData(eventId), {
          method: 'DELETE',
          onSuccess: () => {
            // Success handled by useRequest toast
            toast({
              title: t('Operations.Success', { ns: 'common' }),
              description: t(
                'Pages.Event.DangerZone.Toast.DeleteSuccessDescription'
              ),
              variant: 'default',
            });
            if (onEventDataDeleted) {
              onEventDataDeleted();
            }
          },
          onError: (error: string | ApiError) => {
            console.error('Failed to delete event data:', error);
            toast({
              title: t('Pages.Event.DangerZone.Toast.DeleteFailTitle'),
              description: error.toString(),
              variant: 'error',
            });
          },
        });
      },
      {
        variant: 'destructive',
        confirmText: t(
          'Pages.Event.DangerZone.DeleteAllEventData.ConfirmButton'
        ),
      }
    );
  };

  const handleDeleteEvent = () => {
    showConfirm(
      t('Pages.Event.DangerZone.DeleteEvent.ConfirmTitle'),
      t('Pages.Event.DangerZone.DeleteEvent.ConfirmDescription'),
      () => {
        deleteEventRequest.request(ENDPOINTS.deleteEvent(eventId), {
          method: 'DELETE',
          onSuccess: () => {
            toast({
              title: t('Operations.Success', { ns: 'common' }),
              description: t(
                'Pages.Event.DangerZone.Toast.DeleteSuccessDescription'
              ),
              variant: 'default',
            });
            navigate({ to: '/' });
          },
          onError: (error: string | ApiError) => {
            console.error('Failed to delete event:', error);
            toast({
              title: t('Pages.Event.DangerZone.Toast.DeleteFailTitle'),
              description: error.toString(),
              variant: 'error',
            });
          },
        });
      },
      {
        variant: 'destructive',
        confirmText: t('Pages.Event.DangerZone.DeleteEvent.ConfirmButton'),
      }
    );
  };

  const destructiveActions = [
    {
      title: t('Pages.Event.DangerZone.DeleteCompetitors.Title'),
      description: t('Pages.Event.DangerZone.DeleteCompetitors.Description'),
      icon: Users,
      buttonText: t('Pages.Event.DangerZone.DeleteCompetitors.Button'),
      variant: 'outline' as const,
      onClick: handleDeleteCompetitors,
      request: deleteCompetitorsRequest,
      severity: 'medium' as const,
    },
    {
      title: t('Pages.Event.DangerZone.DeleteAllEventData.Title'),
      description: t('Pages.Event.DangerZone.DeleteAllEventData.Description'),
      icon: Database,
      buttonText: t('Pages.Event.DangerZone.DeleteAllEventData.Button'),
      variant: 'outline' as const,
      onClick: handleDeleteAllEventData,
      request: deleteAllDataRequest,
      severity: 'high' as const,
    },
    {
      title: t('Pages.Event.DangerZone.DeleteEvent.Title'),
      description: t('Pages.Event.DangerZone.DeleteEvent.Description'),
      icon: Trash2,
      buttonText: t('Pages.Event.DangerZone.DeleteEvent.Button'),
      variant: 'destructive' as const,
      onClick: handleDeleteEvent,
      request: deleteEventRequest,
      severity: 'critical' as const,
    },
  ];

  const getSeverityStyles = (severity: 'medium' | 'high' | 'critical') => {
    const styles = {
      medium:
        'border-orange-200 bg-orange-50 dark:bg-orange-950/20 dark:border-orange-800',
      high: 'border-red-200 bg-red-50 dark:bg-red-950/20 dark:border-red-800',
      critical:
        'border-red-300 bg-red-100 dark:bg-red-950/30 dark:border-red-700',
    };
    return styles[severity];
  };

  const getTextColor = (severity: 'medium' | 'high' | 'critical') => {
    const styles = {
      medium: 'text-orange-700 dark:text-orange-300',
      high: 'text-red-700 dark:text-red-300',
      critical: 'text-red-800 dark:text-red-200',
    };
    return styles[severity];
  };

  const getIconColor = (severity: 'medium' | 'high' | 'critical') => {
    const styles = {
      medium: 'text-orange-600',
      high: 'text-red-600',
      critical: 'text-red-700',
    };
    return styles[severity];
  };

  return (
    <>
      <Card className="w-full border-red-200 dark:border-red-800 bg-gradient-to-br from-white to-red-50/30 dark:from-gray-950 dark:to-red-950/10">
        <CardHeader className="pb-4">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-10 h-10 bg-red-100 dark:bg-red-900/30 rounded-lg">
              <AlertTriangle className="h-5 w-5 text-red-600 dark:text-red-400" />
            </div>
            <div>
              <CardTitle className="text-red-600 dark:text-red-400 text-lg">
                {t('Pages.Event.DangerZone.Title')}
              </CardTitle>
              <CardDescription className="text-sm mt-1">
                {t('Pages.Event.DangerZone.Description')}
              </CardDescription>
            </div>
          </div>
        </CardHeader>

        <CardContent className="space-y-4">
          {/* Destructive Actions */}
          <div className="space-y-3">
            {destructiveActions.map((action, index) => (
              <div
                key={index}
                className={`p-4 border-2 rounded-lg transition-all duration-200 hover:shadow-sm ${getSeverityStyles(action.severity)}`}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-3 flex-1 min-w-0">
                    <div
                      className={`flex-shrink-0 mt-0.5 ${getIconColor(action.severity)}`}
                    >
                      <action.icon className="h-5 w-5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3
                        className={`font-semibold text-base ${getTextColor(action.severity)}`}
                      >
                        {action.title}
                      </h3>
                      <p className="text-sm text-muted-foreground mt-1 leading-relaxed">
                        {action.description}
                      </p>
                    </div>
                  </div>

                  <Button
                    variant={action.variant}
                    onClick={action.onClick}
                    disabled={action.request.isLoading}
                    className={`
                      flex-shrink-0 transition-all duration-200
                      ${
                        action.severity === 'critical'
                          ? 'bg-red-600 hover:bg-red-700 text-white'
                          : 'border-current text-current hover:bg-current/10 hover:shadow-sm'
                      }
                      ${action.request.isLoading ? 'opacity-70 cursor-not-allowed' : ''}
                    `}
                    size="sm"
                  >
                    {action.request.isLoading ? (
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" />
                        <span>Deleting...</span>
                      </div>
                    ) : (
                      action.buttonText
                    )}
                  </Button>
                </div>
              </div>
            ))}
          </div>

          {/* Warning Footer */}
          <div className="text-center">
            <p className="text-xs text-muted-foreground italic">
              {t('Pages.Event.DangerZone.Footer')}
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Confirm Dialog */}
      <ConfirmDialog
        open={dialogState.isOpen}
        onOpenChange={hideConfirm}
        title={dialogState.title}
        description={dialogState.description}
        confirmText={dialogState.confirmText}
        cancelText={dialogState.cancelText}
        variant={dialogState.variant}
        onConfirm={handleConfirm}
      />
    </>
  );
};
