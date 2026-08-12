import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import PATHNAMES from '@/lib/paths/pathnames';
import { Link } from '@tanstack/react-router';
import { Printer, QrCode } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { MainPageLayout } from '../../templates/MainPageLayout';

const UTILS = [
  {
    key: 'qr-codes',
    icon: QrCode,
    titleKey: 'Pages.Utils.QrCodes.TileTitle',
    descriptionKey: 'Pages.Utils.QrCodes.TileDescription',
    to: PATHNAMES.utilsQrCodes(),
  },
  {
    key: 'control-descriptions',
    icon: Printer,
    titleKey: 'Pages.Utils.ControlDescriptions.TileTitle',
    descriptionKey: 'Pages.Utils.ControlDescriptions.TileDescription',
    to: PATHNAMES.utilsControlDescriptions(),
  },
] as const;

export const UtilsLandingPage = () => {
  const { t } = useTranslation();

  return (
    <MainPageLayout t={t} pageName={t('Templates.Routes.Utils')}>
      <section className="container mx-auto px-4 py-12 md:py-20">
        <div className="mx-auto max-w-3xl space-y-8">
          <div className="space-y-4">
            <h1 className="text-3xl font-bold md:text-4xl">
              {t('Pages.Utils.Title')}
            </h1>
            <p className="text-lg text-muted-foreground">
              {t('Pages.Utils.Description')}
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            {UTILS.map(util => {
              const Icon = util.icon;
              return (
                <Link key={util.key} {...util.to} className="block">
                  <Card className="h-full border-border transition-colors hover:border-primary">
                    <CardHeader className="flex flex-row items-start gap-3 space-y-0">
                      <div className="rounded-lg border border-border/70 bg-muted/50 p-2">
                        <Icon className="h-5 w-5 text-muted-foreground" />
                      </div>
                      <CardTitle className="text-lg">
                        {t(util.titleKey)}
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <CardDescription>
                        {t(util.descriptionKey)}
                      </CardDescription>
                    </CardContent>
                  </Card>
                </Link>
              );
            })}
          </div>
        </div>
      </section>
    </MainPageLayout>
  );
};

export default UtilsLandingPage;
