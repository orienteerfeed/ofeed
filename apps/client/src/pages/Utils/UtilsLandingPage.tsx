import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { externalLinks } from '@/lib/paths/externalLinks';
import PATHNAMES from '@/lib/paths/pathnames';
import { Link } from '@tanstack/react-router';
import { Code2, MessageCircle, Printer, QrCode } from 'lucide-react';
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

          <div className="space-y-3">
            <p className="text-sm leading-relaxed text-muted-foreground">
              {t('Pages.Utils.IdeasNote')}
            </p>
            <div className="flex flex-wrap gap-2">
              <a
                href={externalLinks.discord}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-2 rounded-full bg-[#5865F2] px-3 py-1 text-xs font-medium text-white transition-colors hover:bg-[#4752C4]"
              >
                <MessageCircle className="h-3 w-3" />
                {t('Pages.Utils.IdeasDiscord')}
              </a>
              <a
                href={`${externalLinks.github}/issues/new`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-2 rounded-full border border-slate-300 px-3 py-1 text-xs font-medium text-slate-800 transition-colors hover:bg-slate-100 dark:border-slate-600 dark:text-slate-100 dark:hover:bg-slate-800"
              >
                <Code2 className="h-3 w-3" />
                {t('Pages.Utils.IdeasGithub')}
              </a>
            </div>
          </div>
        </div>
      </section>
    </MainPageLayout>
  );
};

export default UtilsLandingPage;
