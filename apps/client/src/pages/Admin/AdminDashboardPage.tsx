import type { AdminEventListItem, AdminUserListItem } from '@repo/shared';
import { Link } from '@tanstack/react-router';
import { format } from 'date-fns';
import {
  Activity,
  CalendarRange,
  ShieldCheck,
  Sparkles,
  Users,
} from 'lucide-react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  Legend,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Badge, LoadingDots } from '@/components/atoms';
import { AppDataTable } from '@/components/organisms';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { PATHNAMES } from '@/lib/paths/pathnames';
import { AdminPageLayout } from '@/templates';

import { useAdminDashboardQuery } from './admin.hooks';

function formatDate(value: string | Date) {
  return format(new Date(value), 'dd.MM.yyyy');
}

function formatMonth(value: string | Date) {
  return format(new Date(value), 'LLL yy');
}

function LoadingState({ label }: { label: string }) {
  return (
    <div className="flex items-center justify-center gap-2">
      <LoadingDots />
      <span className="sr-only">{label}</span>
    </div>
  );
}

function DashboardActivityChart({
  isLoading,
  data,
}: {
  isLoading: boolean;
  data: Array<{
    monthStart: string | Date;
    usersCreated: number;
    eventsCreated: number;
  }>;
}) {
  const { t } = useTranslation();
  const loadingLabel = t('Organisms.AppDataTable.Loading', 'Načítání dat...');
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [chartSize, setChartSize] = useState({ width: 0, height: 320 });

  useEffect(() => {
    const container = containerRef.current;

    if (!container) {
      return;
    }

    const updateSize = (width: number, height: number) => {
      if (width <= 0 || height <= 0) {
        return;
      }

      setChartSize(previousSize => {
        if (
          previousSize.width === Math.round(width) &&
          previousSize.height === Math.round(height)
        ) {
          return previousSize;
        }

        return {
          width: Math.round(width),
          height: Math.round(height),
        };
      });
    };

    const rect = container.getBoundingClientRect();
    updateSize(rect.width, rect.height);

    const resizeObserver = new ResizeObserver(entries => {
      const nextEntry = entries[0];

      if (!nextEntry) {
        return;
      }

      updateSize(nextEntry.contentRect.width, nextEntry.contentRect.height);
    });

    resizeObserver.observe(container);

    return () => {
      resizeObserver.disconnect();
    };
  }, []);

  return (
    <div ref={containerRef} className="h-[320px] min-h-[320px] min-w-0">
      {isLoading || chartSize.width <= 0 || chartSize.height <= 0 ? (
        <div className="flex h-full items-center justify-center rounded-lg border border-dashed border-border/60 bg-muted/20">
          <LoadingState label={loadingLabel} />
        </div>
      ) : (
        <AreaChart
          width={chartSize.width}
          height={chartSize.height}
          data={data}
        >
          <CartesianGrid strokeDasharray="3 3" className="stroke-border/60" />
          <XAxis
            dataKey="monthStart"
            tickLine={false}
            axisLine={false}
            tickFormatter={formatMonth}
          />
          <YAxis allowDecimals={false} tickLine={false} axisLine={false} />
          <RechartsTooltip
            formatter={(value, _name, item) => {
              const dataKey = item?.dataKey;

              return [
                typeof value === 'number' ? value : Number(value ?? 0),
                dataKey === 'usersCreated'
                  ? t('Pages.Admin.Dashboard.ChartUsersSeries')
                  : t('Pages.Admin.Dashboard.ChartEventsSeries'),
              ];
            }}
            labelFormatter={label => formatMonth(label as string)}
          />
          <Legend />
          <Area
            type="monotone"
            dataKey="usersCreated"
            name={t('Pages.Admin.Dashboard.ChartUsersSeries')}
            stroke="var(--color-chart-1)"
            fill="var(--color-chart-1)"
            fillOpacity={0.18}
          />
          <Area
            type="monotone"
            dataKey="eventsCreated"
            name={t('Pages.Admin.Dashboard.ChartEventsSeries')}
            stroke="var(--color-chart-2)"
            fill="var(--color-chart-2)"
            fillOpacity={0.18}
          />
        </AreaChart>
      )}
    </div>
  );
}

function RecentUsersCard({
  users,
  isLoading,
}: {
  users: AdminUserListItem[];
  isLoading: boolean;
}) {
  const { t } = useTranslation();

  return (
    <Card className="border-border/70">
      <CardHeader>
        <CardTitle>{t('Pages.Admin.Dashboard.RecentUsersTitle')}</CardTitle>
        <CardDescription>
          {t('Pages.Admin.Dashboard.RecentUsersDescription')}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading ? (
          <div className="flex min-h-32 items-center justify-center">
            <LoadingState
              label={t('Organisms.AppDataTable.Loading', 'Načítání dat...')}
            />
          </div>
        ) : users.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {t('Pages.Admin.Table.Empty')}
          </p>
        ) : (
          users.map(user => (
            <div
              key={user.id}
              className="flex items-center justify-between gap-3 rounded-lg border border-border/60 px-3 py-2"
            >
              <div className="min-w-0">
                <div className="truncate font-medium">
                  {user.firstname} {user.lastname}
                </div>
                <div className="truncate text-sm text-muted-foreground">
                  {user.email}
                </div>
              </div>
              <Badge variant={user.role === 'ADMIN' ? 'default' : 'secondary'}>
                {user.role}
              </Badge>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}

function RecentEventsTable({
  events,
  isLoading,
  error,
}: {
  events: AdminEventListItem[];
  isLoading: boolean;
  error: unknown;
}) {
  const { t } = useTranslation();
  const loadingLabel = t('Organisms.AppDataTable.Loading', 'Načítání dat...');

  return (
    <AppDataTable
      data={events}
      isLoading={isLoading}
      error={error instanceof Error ? error : undefined}
      columnCount={6}
      emptyStateText={t('Pages.Admin.Table.Empty')}
      emptyState={isLoading ? <LoadingState label={loadingLabel} /> : undefined}
      renderHeader={
        <TableHeader>
          <TableRow>
            <TableHead>{t('Pages.Admin.Table.Event')}</TableHead>
            <TableHead>{t('Pages.Admin.Table.Date')}</TableHead>
            <TableHead>{t('Pages.Admin.Table.Organizer')}</TableHead>
            <TableHead>{t('Pages.Admin.Table.Owner')}</TableHead>
            <TableHead>{t('Pages.Admin.Table.Published')}</TableHead>
            <TableHead>{t('Pages.Admin.Table.Ranking')}</TableHead>
          </TableRow>
        </TableHeader>
      }
      renderRow={event => (
        <TableRow key={event.id}>
          <TableCell className="font-medium">
            <Link
              {...PATHNAMES.eventDetail(event.id)}
              className="transition-colors hover:text-primary"
            >
              {event.name}
            </Link>
          </TableCell>
          <TableCell>{formatDate(event.date)}</TableCell>
          <TableCell>{event.organizer || '—'}</TableCell>
          <TableCell>{event.authorName || '—'}</TableCell>
          <TableCell>
            <Badge variant={event.published ? 'default' : 'secondary'}>
              {event.published
                ? t('Pages.Admin.Table.Yes')
                : t('Pages.Admin.Table.No')}
            </Badge>
          </TableCell>
          <TableCell>
            <Badge variant={event.ranking ? 'default' : 'secondary'}>
              {event.ranking
                ? t('Pages.Admin.Table.Yes')
                : t('Pages.Admin.Table.No')}
            </Badge>
          </TableCell>
        </TableRow>
      )}
    />
  );
}

export function AdminDashboardPage() {
  const { t } = useTranslation();
  const { data, isLoading, error } = useAdminDashboardQuery();
  const loadingLabel = t('Organisms.AppDataTable.Loading', 'Načítání dat...');

  const summaryCards = [
    {
      key: 'users',
      label: t('Pages.Admin.Dashboard.Cards.TotalUsers'),
      value: data?.summary.totalUsers ?? 0,
      detail: t('Pages.Admin.Dashboard.Cards.ActiveUsersDetail', {
        count: data?.summary.activeUsers ?? 0,
      }),
      icon: Users,
    },
    {
      key: 'events',
      label: t('Pages.Admin.Dashboard.Cards.TotalEvents'),
      value: data?.summary.totalEvents ?? 0,
      detail: t('Pages.Admin.Dashboard.Cards.PublishedEventsDetail', {
        count: data?.summary.publishedEvents ?? 0,
      }),
      icon: CalendarRange,
    },
    {
      key: 'ranking',
      label: t('Pages.Admin.Dashboard.Cards.RankingEvents'),
      value: data?.summary.rankingEvents ?? 0,
      detail: t('Pages.Admin.Dashboard.Cards.UpcomingEventsDetail', {
        count: data?.summary.upcomingEvents ?? 0,
      }),
      icon: Activity,
    },
    {
      key: 'admins',
      label: t('Pages.Admin.Dashboard.Cards.AdminUsers'),
      value: data?.summary.adminUsers ?? 0,
      detail: t('Pages.Admin.Dashboard.Cards.AdminUsersHint'),
      icon: ShieldCheck,
    },
  ];

  return (
    <AdminPageLayout
      activeItem="dashboard"
      breadcrumbs={[
        {
          label: t('Pages.Admin.Common.Zone'),
          to: PATHNAMES.adminDashboard().to,
        },
        { label: t('Pages.Admin.Navigation.Dashboard') },
      ]}
    >
      <div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6">
        <section className="px-4 lg:px-6">
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              <h1 className="text-2xl font-semibold tracking-tight">
                {t('Pages.Admin.Dashboard.Title')}
              </h1>
            </div>
            <p className="max-w-3xl text-sm text-muted-foreground">
              {t('Pages.Admin.Dashboard.Description')}
            </p>
          </div>
        </section>

        {error ? (
          <section className="px-4 lg:px-6">
            <Alert variant="destructive">
              <AlertTitle>{t('Pages.Admin.Dashboard.ErrorTitle')}</AlertTitle>
              <AlertDescription>
                {error instanceof Error ? error.message : String(error)}
              </AlertDescription>
            </Alert>
          </section>
        ) : null}

        <section className="grid auto-rows-min gap-4 px-4 md:grid-cols-2 xl:grid-cols-4 lg:px-6">
          {summaryCards.map(card => {
            const Icon = card.icon;

            return (
              <Card key={card.key} className="border-border/70">
                <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-3">
                  <div>
                    <CardDescription>{card.label}</CardDescription>
                    <CardTitle className="mt-2 text-3xl">
                      {isLoading ? (
                        <LoadingDots
                          className="mt-1"
                          dotClassName="h-2.5 w-2.5 bg-foreground/70"
                        />
                      ) : (
                        card.value.toLocaleString()
                      )}
                    </CardTitle>
                  </div>
                  <div className="rounded-lg border border-border/70 bg-muted/50 p-2">
                    <Icon className="h-4 w-4 text-muted-foreground" />
                  </div>
                </CardHeader>
                <CardContent>
                  {isLoading ? (
                    <div className="flex h-5 items-center">
                      <LoadingDots dotClassName="bg-muted-foreground/70" />
                      <span className="sr-only">{loadingLabel}</span>
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      {card.detail}
                    </p>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </section>

        <section className="grid gap-4 px-4 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] lg:px-6">
          <Card className="min-w-0 border-border/70">
            <CardHeader>
              <CardTitle>{t('Pages.Admin.Dashboard.ChartTitle')}</CardTitle>
              <CardDescription>
                {t('Pages.Admin.Dashboard.ChartDescription')}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <DashboardActivityChart
                isLoading={isLoading}
                data={data?.monthlyActivity ?? []}
              />
            </CardContent>
          </Card>

          <RecentUsersCard
            users={data?.recentUsers ?? []}
            isLoading={isLoading}
          />
        </section>

        <section className="px-4 lg:px-6">
          <div className="mb-4">
            <h2 className="text-lg font-semibold">
              {t('Pages.Admin.Dashboard.RecentEventsTitle')}
            </h2>
            <p className="text-sm text-muted-foreground">
              {t('Pages.Admin.Dashboard.RecentEventsDescription')}
            </p>
          </div>
          <RecentEventsTable
            events={data?.recentEvents ?? []}
            isLoading={isLoading}
            error={error}
          />
        </section>
      </div>
    </AdminPageLayout>
  );
}
