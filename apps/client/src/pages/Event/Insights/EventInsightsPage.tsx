import { Link, useParams } from '@tanstack/react-router';
import { ReceiptText } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/atoms';
import { BackLink } from '@/components/molecules';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { MainPageLayout } from '@/templates/MainPageLayout';
import { useEvent } from '@/hooks/useEvent';
import PATHNAMES from '@/lib/paths/pathnames';

const insights = [
  {
    id: 'payments',
    title: 'Pages.Insights.Payments',
    description: 'Pages.Insights.PaymentsDescription',
    path: '/events/$eventId/insights/payments',
    icon: ReceiptText,
  },
] as const;

export function EventInsightsPage() {
  const { eventId } = useParams({ from: '/events/$eventId/insights' });
  const { t } = useTranslation();
  const { event } = useEvent(eventId);
  return (
    <MainPageLayout t={t}>
      <section className="container mx-auto space-y-6 px-4 py-6">
        <BackLink to={PATHNAMES.eventDetail(eventId).url} />
        <header>
          <h1 className="text-2xl font-bold">{t('Pages.Insights.Title')}</h1>
          <p className="text-muted-foreground">{event?.name}</p>
          <p className="mt-2 text-sm text-muted-foreground">
            {t('Pages.Insights.Description')}
          </p>
        </header>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {insights.map(insight => (
            <Card key={insight.id}>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <insight.icon className="h-5 w-5" />
                  {t(insight.title)}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  {t(insight.description)}
                </p>
                <Button asChild>
                  <Link to={insight.path} params={{ eventId }}>
                    {t('Pages.Insights.Open')}
                  </Link>
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>
    </MainPageLayout>
  );
}
