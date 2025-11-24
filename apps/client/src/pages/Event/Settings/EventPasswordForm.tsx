import { ButtonWithSpinner } from '@/components/molecules';
import { Label } from '@/components/ui/label';
import { gql } from '@apollo/client';
import { useQuery } from '@apollo/client/react';
import { useForm } from '@tanstack/react-form';
import { TFunction } from 'i18next';
import { Copy, Eye, EyeOff } from 'lucide-react';
import React, { useEffect, useState } from 'react';
import { Button } from '../../../components/atoms';
import { CountdownTimer, Field } from '../../../components/organisms';
import { useRequest } from '../../../hooks/useRequest';
import { ENDPOINTS } from '../../../lib/api/endpoints';
import { toast } from '../../../utils';

const GET_EVENT_PASSWORD = gql`
  query Event($eventId: String!) {
    event(id: $eventId) {
      id
      name
      eventPassword {
        password
        expiresAt
      }
    }
  }
`;

interface EventPasswordFormProps {
  t: TFunction;
  eventId: string;
  onPasswordUpdate?: (password: string) => void;
  password?: string;
  expiresAt?: string;
}

interface ApiError {
  param?: string;
  msg?: string;
}

interface ApiResponse {
  results?: {
    data?: {
      password: string;
      expiresAt: string;
    };
  };
  data?: {
    password: string;
    expiresAt: string;
  };
}

export const EventPasswordForm: React.FC<EventPasswordFormProps> = ({
  t,
  eventId,
  onPasswordUpdate,
  password: initialPassword = '',
  expiresAt,
}) => {
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [password, setPassword] = useState(initialPassword);
  const [expiration, setExpiration] = useState<Date | null>(
    expiresAt ? new Date(parseInt(expiresAt, 10)) : null
  );

  useEffect(() => {
    setPassword(initialPassword ?? '');
  }, [initialPassword]);

  useEffect(() => {
    setExpiration(expiresAt ? new Date(parseInt(expiresAt, 10)) : null);
  }, [expiresAt]);

  const [isGenerating, setIsGenerating] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const request = useRequest();

  // Use Apollo useQuery to fetch event data - prefixed with underscore since it's not used directly
  const { refetch: refetchEvent } = useQuery(GET_EVENT_PASSWORD, {
    variables: { eventId },
    skip: !eventId, // Skip query if no eventId
  });

  const form = useForm({
    defaultValues: {
      password: initialPassword,
    },
    onSubmit: async () => {
      // Handle form submission if needed
    },
  });

  // Toggle password visibility
  const togglePasswordVisibility = () => {
    setPasswordVisible(!passwordVisible);
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(password);
    toast({
      title: t('Operations.Success', { ns: 'common' }),
      description: t('Pages.Event.Password.Toast.CopySuccessDescription'),
      variant: 'default',
    });
  };

  // Generate a new password and set expiration
  const handleGeneratePassword = async () => {
    setIsGenerating(true);

    try {
      await request.request(ENDPOINTS.generateEventPassword(), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          eventId,
        }),
        onSuccess: (response: ApiResponse) => {
          const responseData = response.results?.data || response.data;
          if (!responseData) {
            throw new Error('No data in response');
          }

          const newPassword = responseData.password;
          const newExpiration = new Date(responseData.expiresAt);

          // Update the local state with the new password and expiration from the response
          setPassword(newPassword);
          setExpiration(newExpiration); // Use Date object directly
          onPasswordUpdate?.(newPassword); // Notify parent of updated password

          // Refetch event data to update Apollo cache
          refetchEvent();

          console.log('Password updated successfully');

          // Success notification
          toast({
            title: t('Operations.Success', { ns: 'common' }),
            description: t(
              'Pages.Event.Password.Toast.UpdateSuccessDescription'
            ),
            variant: 'default',
          });
        },
        onError: (err: unknown) => {
          console.log('Error:', err);

          if (
            err &&
            typeof err === 'object' &&
            'errors' in err &&
            Array.isArray((err as any).errors)
          ) {
            (err as any).errors.forEach((error: ApiError) => {
              toast({
                title: t('Pages.Event.Password.Toast.UpdateFailTitle'),
                description: `${error.param || 'unknown'}: ${error.msg || 'Unknown error'}`,
                variant: 'error',
              });
            });
          } else {
            const errorMessage =
              err && typeof err === 'object' && 'message' in err
                ? (err as any).message
                : 'Failed to generate password';

            toast({
              title: t('Pages.Event.Password.Toast.UpdateFailTitle'),
              description: errorMessage,
              variant: 'error',
            });
          }
        },
      });
    } catch (error) {
      console.error('Password generation error:', error);
      toast({
        title: t('Operations.Error', { ns: 'common' }),
        description: 'Network error occurred',
        variant: 'error',
      });
    } finally {
      setIsGenerating(false);
    }
  };

  // Delete the password (disable access)
  const handleDeletePassword = async () => {
    setIsDeleting(true);

    try {
      await request.request(ENDPOINTS.revokeEventPassword(), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          eventId,
        }),
        onSuccess: () => {
          // Update the local state with the new password and expiration from the response
          setPassword('');
          setExpiration(null);

          // Refetch event data to update Apollo cache
          refetchEvent();

          console.log('Password revoked successfully');

          // Success notification
          toast({
            title: t('Operations.Success', { ns: 'common' }),
            description: t(
              'Pages.Event.Password.Toast.RevokeSuccessDescription'
            ),
            variant: 'default',
          });
          onPasswordUpdate?.(''); // Notify parent component that the password is removed
        },
        onError: (err: unknown) => {
          console.log('Error:', err);

          if (
            err &&
            typeof err === 'object' &&
            'errors' in err &&
            Array.isArray((err as any).errors)
          ) {
            (err as any).errors.forEach((error: ApiError) => {
              toast({
                title: t('Pages.Event.Password.Toast.RevokeFailTitle'),
                description: `${error.param || 'unknown'}: ${error.msg || 'Unknown error'}`,
                variant: 'error',
              });
            });
          } else {
            const errorMessage =
              err && typeof err === 'object' && 'message' in err
                ? (err as any).message
                : 'Failed to revoke password';

            toast({
              title: t('Pages.Event.Password.Toast.RevokeFailTitle'),
              description: errorMessage,
              variant: 'error',
            });
          }
        },
      });
    } catch (error) {
      console.error('Password revocation error:', error);
      toast({
        title: t('Operations.Error', { ns: 'common' }),
        description: 'Network error occurred',
        variant: 'error',
      });
    } finally {
      setIsDeleting(false);
    }
  };

  const isLoading = isGenerating || isDeleting;

  return (
    <form
      onSubmit={e => {
        e.preventDefault();
        e.stopPropagation();
        form.handleSubmit();
      }}
    >
      <div className="space-y-4">
        {/* Password Field */}
        <div className="space-y-2">
          <Label htmlFor="password" className="text-sm font-medium">
            {t('Pages.Event.Password.Field.Name')}
          </Label>
          <div className="relative">
            <Field
              form={form}
              name="password"
              type={passwordVisible ? 'text' : 'password'}
              value={password}
              placeholder={t('Pages.Event.Password.Field.Placeholders.Name')}
              autoCapitalize="off"
              autoComplete="off"
              autoCorrect="off"
              readOnly
              disabled={isLoading}
              className="w-full pr-24" // Add padding for buttons
            />

            {/* Copy Button */}
            {password && (
              <Button
                type="button"
                onClick={copyToClipboard}
                variant="outline"
                size="sm"
                className="absolute right-12 top-1/2 transform -translate-y-1/2 h-8 w-8 p-0"
                disabled={isLoading}
              >
                <Copy className="h-4 w-4" />
                <span className="sr-only">
                  {t('Pages.Event.Password.Copy')}
                </span>
              </Button>
            )}

            {/* Visibility Toggle Button */}
            <Button
              type="button"
              onClick={togglePasswordVisibility}
              variant="ghost"
              size="sm"
              className="absolute right-2 top-1/2 transform -translate-y-1/2 h-8 w-8 p-0"
              disabled={isLoading}
            >
              {passwordVisible ? (
                <EyeOff className="h-4 w-4" />
              ) : (
                <Eye className="h-4 w-4" />
              )}
              <span className="sr-only">
                {passwordVisible ? 'Hide password' : 'Show password'}
              </span>
            </Button>
          </div>
        </div>

        {/* Generate/Regenerate Password Button */}
        <div className="space-y-2">
          <ButtonWithSpinner
            type="button"
            onClick={handleGeneratePassword}
            disabled={isLoading}
            isSubmitting={isGenerating}
            className="w-full"
          >
            {password
              ? t('Pages.Event.Password.RegeneratePassword')
              : t('Pages.Event.Password.GeneratePassword')}
          </ButtonWithSpinner>
        </div>

        {/* Expiration and Revoke Section */}
        <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center">
          <div className="space-y-2 flex-1">
            <Label className="text-sm font-medium">
              {t('Pages.Event.Password.PassportExpiration')}
            </Label>
            {/* Pass the expiration state to CountdownTimer */}
            {expiration ? (
              <CountdownTimer expiryDate={expiration} />
            ) : (
              <p className="text-sm text-muted-foreground">
                {t('Pages.Event.Password.NoExpirationSet')}
              </p>
            )}
          </div>

          {/* Delete/Disable Password Button */}
          {password && (
            <ButtonWithSpinner
              type="button"
              variant="destructive"
              onClick={handleDeletePassword}
              disabled={isLoading}
              isSubmitting={isDeleting}
              className="sm:w-auto w-full"
            >
              {t('Pages.Event.Password.Revoke')}
            </ButtonWithSpinner>
          )}
        </div>
      </div>
    </form>
  );
};
