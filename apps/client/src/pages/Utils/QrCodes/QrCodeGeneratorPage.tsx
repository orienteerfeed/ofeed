import { Alert } from '@/components/organisms';
import { Card } from '@/components/ui/card';
import { useTranslation } from 'react-i18next';
import { MainPageLayout } from '../../../templates/MainPageLayout';
import { QrCodeGeneratorForm } from './QrCodeGeneratorForm';

export const QrCodeGeneratorPage = () => {
  const { t } = useTranslation();

  return (
    <MainPageLayout t={t} pageName={t('Pages.Utils.QrCodes.Title')}>
      <section className="container mx-auto px-4 py-12 md:py-20">
        <div className="mx-auto max-w-3xl space-y-8">
          <div className="space-y-4">
            <h1 className="text-3xl font-bold md:text-4xl">
              {t('Pages.Utils.QrCodes.Title')}
            </h1>
            <p className="text-lg text-muted-foreground">
              {t('Pages.Utils.QrCodes.Description')}
            </p>
          </div>

          <Alert severity="info" variant="outlined">
            {t('Pages.Utils.QrCodes.PrintGuidance')}
          </Alert>

          <Card className="border-border p-6 md:p-8">
            <QrCodeGeneratorForm />
          </Card>
        </div>
      </section>
    </MainPageLayout>
  );
};

export default QrCodeGeneratorPage;
