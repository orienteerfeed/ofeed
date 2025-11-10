import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { useForm } from '@tanstack/react-form';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Eye, EyeOff, Key, Loader2 } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '../../components/atoms';
import { Field } from '../../components/organisms';
import { config } from '../../config';
import { useApi } from '../../hooks';
import { ENDPOINTS } from '../../lib/api/endpoints';
import { toast } from '../../utils';

interface OAuth2Credentials {
  client_id: string;
  client_secret?: string;
}

interface OAuth2CredentialsResponse {
  data: OAuth2Credentials;
}

interface GenerateCredentialsRequest {
  grants: string;
}

// ReactiveField wrapper component - stejný jako v EventForm
interface ReactiveFieldProps {
  form?: any;
  name: string;
  type?: string;
  validate?: (value: any) => string | undefined;
  placeholder?: string;
  className?: string;
  options?: Array<{ value: string; label: string }>;
  step?: string;
  disabled?: boolean;
  readOnly?: boolean;
  value?: string;
}

const ReactiveField: React.FC<ReactiveFieldProps> = ({
  form,
  disabled: externalDisabled,
  ...props
}) => {
  return (
    <form.Subscribe selector={(state: any) => state.isSubmitting}>
      {(isSubmitting: any) => (
        <Field
          form={form}
          disabled={externalDisabled || (isSubmitting ?? false)}
          {...props}
        />
      )}
    </form.Subscribe>
  );
};

// OAuth2 Credentials Form Component
const OAuth2CredentialsForm = () => {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { get, post, delete: del } = useApi();
  const [clientSecretVisible, setClientSecretVisible] = useState(false);
  const [generatedSecret, setGeneratedSecret] = useState<string>('');

  // Fetch existing credentials
  const { data: credentialsResponse, isLoading } = useQuery({
    queryKey: ['oauth2-credentials'],
    queryFn: () =>
      get<OAuth2CredentialsResponse>(ENDPOINTS.fetchOAuth2Credentials()),
    retry: 1,
  });

  const credentials = credentialsResponse?.data;

  // TanStack Form pro správu formuláře
  const form = useForm({
    defaultValues: {
      clientId: credentials?.client_id || '',
      clientSecret: '',
    },
    onSubmit: async () => {
      // Form submission handled by individual mutations
    },
  });

  // Generate credentials mutation
  const generateMutation = useMutation({
    mutationFn: (data: GenerateCredentialsRequest) =>
      post<OAuth2CredentialsResponse>(
        ENDPOINTS.generateOAuth2Credentials(),
        data
      ),
    onSuccess: response => {
      console.log(response);
      const newCredentials = response.data;
      queryClient.setQueryData(['oauth2-credentials'], response);

      // Update form values
      form.setFieldValue('clientId', newCredentials.client_id);
      if (newCredentials.client_secret) {
        form.setFieldValue('clientSecret', newCredentials.client_secret);
        setGeneratedSecret(newCredentials.client_secret);
      }

      toast({
        title: t('Operations.Success', { ns: 'common' }),
        description: t('Pages.Profile.OAuth2.Toast.GenerateSuccessDescription'),
      });
      setClientSecretVisible(true);
    },
    onError: (error: Error) => {
      toast({
        title: t('Pages.Profile.OAuth2.Toast.GenerateFailTitle'),
        description: error.message,
        variant: 'error',
      });
    },
  });

  // Revoke credentials mutation
  const revokeMutation = useMutation({
    mutationFn: () => {
      if (!credentials?.client_id) {
        throw new Error('No credentials to revoke');
      }
      return del<void>(ENDPOINTS.revokeOAuth2Credentials());
    },
    onSuccess: () => {
      queryClient.setQueryData(['oauth2-credentials'], null);
      queryClient.invalidateQueries({ queryKey: ['oauth2-credentials'] });
      // Reset form values
      form.setFieldValue('clientId', '');
      form.setFieldValue('clientSecret', '');
      setGeneratedSecret('');

      toast({
        title: t('Operations.Success', { ns: 'common' }),
        description: t('Pages.Profile.OAuth2.Toast.RevokeSuccessDescription'),
      });
      setClientSecretVisible(false);
    },
    onError: (error: Error) => {
      toast({
        title: t('Pages.Profile.OAuth2.Toast.RevokeFailTitle'),
        description: error.message,
        variant: 'error',
      });
    },
  });

  const toggleClientSecretVisibility = () => {
    setClientSecretVisible(!clientSecretVisible);
  };

  const getMaskedSecret = () => {
    return '••••••••••••••••••••';
  };

  const handleGenerateCredentials = () => {
    generateMutation.mutate({ grants: 'client_credentials' });
  };

  const handleRevokeCredentials = () => {
    revokeMutation.mutate();
  };

  // Determine which secret to display
  const displaySecret = generatedSecret || credentials?.client_secret;
  const showSecretValue = clientSecretVisible && displaySecret;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <form
      onSubmit={e => {
        e.preventDefault();
        e.stopPropagation();
        form.handleSubmit();
      }}
    >
      <div className="space-y-4">
        {/* Client ID */}
        <div className="space-y-2">
          <Label htmlFor="clientId">{t('Pages.Profile.OAuth2.ClientId')}</Label>
          <ReactiveField
            form={form}
            name="clientId"
            type="text"
            value={credentials?.client_id || ''}
            placeholder="Client ID"
            readOnly
            className="font-mono text-sm"
          />
        </div>

        {/* Client Secret */}
        <div className="space-y-2">
          <Label htmlFor="clientSecret">
            {t('Pages.Profile.OAuth2.ClientSecret')}
          </Label>
          <div className="relative">
            <ReactiveField
              form={form}
              name="clientSecret"
              type={clientSecretVisible ? 'text' : 'password'}
              value={
                displaySecret
                  ? showSecretValue
                    ? displaySecret
                    : getMaskedSecret()
                  : ''
              }
              placeholder="Client Secret"
              readOnly
              className="font-mono text-sm pr-10"
            />
            {displaySecret && (
              <button
                type="button"
                onClick={toggleClientSecretVisibility}
                className="absolute right-3 top-1/2 transform -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                {clientSecretVisible ? (
                  <EyeOff className="h-4 w-4" />
                ) : (
                  <Eye className="h-4 w-4" />
                )}
              </button>
            )}
          </div>
          {showSecretValue && (
            <p className="text-sm text-amber-600 bg-amber-50 p-2 rounded-md border border-amber-200">
              <strong>{t('Pages.Profile.OAuth2.SecretWarning')}:</strong>{' '}
              {t('Pages.Profile.OAuth2.SecretWarningDescription')}
            </p>
          )}
        </div>

        {/* Action Buttons */}
        <div className="flex gap-3 pt-2">
          <Button
            onClick={handleGenerateCredentials}
            disabled={generateMutation.isPending}
            className="flex items-center gap-2"
            type="button"
          >
            {generateMutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Key className="h-4 w-4" />
            )}
            {credentials?.client_id
              ? t('Pages.Profile.OAuth2.Regenerate')
              : t('Pages.Profile.OAuth2.Generate')}
          </Button>

          {credentials?.client_id && (
            <Button
              variant="outline"
              onClick={handleRevokeCredentials}
              disabled={revokeMutation.isPending}
              className="text-red-600 border-red-200 hover:bg-red-50 hover:text-red-700 flex items-center gap-2"
              type="button"
            >
              {revokeMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : null}
              {t('Pages.Profile.OAuth2.Revoke')}
            </Button>
          )}
        </div>

        {/* Information */}
        <div className="rounded-md border bg-blue-50/80 p-4 dark:border-blue-800 dark:bg-blue-950/40">
          <h4 className="mb-2 font-medium text-blue-900 dark:text-blue-100">
            {t('Pages.Profile.OAuth2.HowToUse.Title')}
          </h4>

          <p className="text-sm text-blue-800 dark:text-blue-100/90">
            {t('Pages.Profile.OAuth2.HowToUse.Description')}
          </p>

          {credentials?.client_id && (
            <div className="mt-3 rounded border bg-white/90 p-3 font-mono text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100">
              <pre className="whitespace-pre-wrap break-words">
                {`curl -X POST \\
  ${config.BASE_API_URL}/rest/v1/auth/oauth2/token \\
  -H "Content-Type: application/x-www-form-urlencoded" \\
  -d "grant_type=client_credentials&client_id=${credentials.client_id}&client_secret=YOUR_SECRET"`}
              </pre>
            </div>
          )}
        </div>
      </div>
    </form>
  );
};

// OAuth2 Credentials Card Component
const OAuth2CredentialsCard = () => {
  const { t } = useTranslation();

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Key className="h-5 w-5" />
          {t('Pages.Profile.OAuth2.Title')}
        </CardTitle>
        <CardDescription>
          {t('Pages.Profile.OAuth2.Description')}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <OAuth2CredentialsForm />
      </CardContent>
    </Card>
  );
};

export { OAuth2CredentialsCard };
