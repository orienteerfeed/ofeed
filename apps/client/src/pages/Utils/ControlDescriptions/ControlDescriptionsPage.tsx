import { Alert } from '@/components/organisms';
import { Card } from '@/components/ui/card';
import { useTranslation } from 'react-i18next';
import { BackLink } from '../../../components/molecules';
import { MainPageLayout } from '../../../templates/MainPageLayout';
import { ControlDescriptionsForm } from './ControlDescriptionsForm';

export const ControlDescriptionsPage = () => {
  const { t } = useTranslation();

  return (
    <MainPageLayout t={t} pageName={t('Pages.Utils.ControlDescriptions.Title')}>
      <section className="container mx-auto px-4 py-12 md:py-20">
        <div className="mx-auto max-w-3xl space-y-8">
          <BackLink to="/utils" />

          <div className="space-y-4">
            <h1 className="text-3xl font-bold md:text-4xl">
              {t('Pages.Utils.ControlDescriptions.Title')}
            </h1>
            <p className="text-lg text-muted-foreground">
              {t('Pages.Utils.ControlDescriptions.Description')}
            </p>
          </div>

          <Alert severity="info" variant="outlined">
            {t('Pages.Utils.ControlDescriptions.PrintGuidance')}
          </Alert>

          <Card className="border-border p-6 md:p-8">
            <ControlDescriptionsForm />
          </Card>
        </div>
      </section>
    </MainPageLayout>
  );
};
