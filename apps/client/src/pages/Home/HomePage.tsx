import React from 'react';
import { useTranslation } from 'react-i18next';

import { useAuth } from '@/hooks/useAuth';
import { Button } from '../../components/atoms';
import { Alert } from '../../components/organisms';
import { MainPageLayout } from '../../templates';

export const HomePage: React.FC = () => {
  const { t } = useTranslation();
  const { token } = useAuth();

  return (
    <MainPageLayout t={t} pageName={t('Templates.Routes.Home')}>
      <div className="grid items-start gap-8">
        {token && ( // Zjednodušená podmínka
          <div className="flex justify-end space-x-2">
            <Button variant="default" size="default">
              {t('Pages.Event.Tables.MyEvents')}
            </Button>
          </div>
        )}
        <Alert
          variant="filled"
          severity="warning"
          title={t('Pages.Event.Alert.DemoTitle')}
          className="!pl-14"
        >
          {t('Pages.Event.Alert.DemoDescription')}
        </Alert>
      </div>
    </MainPageLayout>
  );
};
