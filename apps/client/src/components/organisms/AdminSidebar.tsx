import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from '@/components/ui/sidebar';
import { useUser } from '@/stores/auth';
import { Link, useLocation } from '@tanstack/react-router';
import {
  CalendarDays,
  ExternalLink,
  LayoutDashboard,
  Medal,
  Megaphone,
  Shield,
  Users,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { PATHNAMES } from '@/lib/paths/pathnames';

type AdminNavItemKey =
  | 'dashboard'
  | 'users'
  | 'events'
  | 'systemMessages'
  | 'ranking';

type AdminSidebarProps = {
  activeItem: AdminNavItemKey;
};

function getInitials(...parts: Array<string | null | undefined>) {
  return parts
    .flatMap(part => (part ?? '').trim().split(/\s+/))
    .filter(Boolean)
    .map(part => part[0] as string)
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

export function AdminSidebar({ activeItem }: AdminSidebarProps) {
  const { t } = useTranslation();
  const location = useLocation();
  const user = useUser();

  const navigationItems = [
    {
      key: 'dashboard' as const,
      to: PATHNAMES.adminDashboard().to,
      label: t('Pages.Admin.Navigation.Dashboard'),
      icon: LayoutDashboard,
      active: activeItem === 'dashboard',
    },
    {
      key: 'users' as const,
      to: PATHNAMES.adminUsers().to,
      label: t('Pages.Admin.Navigation.Users'),
      icon: Users,
      active: activeItem === 'users',
    },
    {
      key: 'events' as const,
      to: PATHNAMES.adminEvents().to,
      label: t('Pages.Admin.Navigation.Events'),
      icon: CalendarDays,
      active: activeItem === 'events',
    },
    {
      key: 'systemMessages' as const,
      to: PATHNAMES.adminSystemMessages().to,
      label: t('Pages.Admin.Navigation.SystemMessages'),
      icon: Megaphone,
      active: activeItem === 'systemMessages',
    },
    {
      key: 'ranking' as const,
      to: PATHNAMES.adminCzechRanking().to,
      label: t('Pages.Admin.Navigation.CzechRanking'),
      icon: Medal,
      active: activeItem === 'ranking',
    },
  ];

  const userInitials = getInitials(user?.firstname, user?.lastname);
  const userName = [user?.firstname, user?.lastname].filter(Boolean).join(' ');

  return (
    <Sidebar variant="inset" collapsible="icon">
      <SidebarHeader className="border-b border-sidebar-border/70 p-2">
        <Link
          to={PATHNAMES.adminDashboard().to}
          className="flex items-center gap-3 rounded-xl px-2.5 py-2.5 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground group-data-[collapsible=icon]:mx-auto group-data-[collapsible=icon]:size-9 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0"
        >
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground shadow-sm">
            <Shield className="h-4 w-4" />
          </div>
          <div className="grid flex-1 text-left leading-tight group-data-[collapsible=icon]:hidden">
            <span className="truncate text-sm font-semibold text-sidebar-foreground">
              OFeed
            </span>
            <span className="truncate text-xs text-sidebar-foreground/70">
              {t('Pages.Admin.Common.Zone')}
            </span>
          </div>
        </Link>
      </SidebarHeader>

      <SidebarContent className="gap-0">
        <SidebarGroup className="px-2 py-2">
          <SidebarGroupLabel>
            {t('Pages.Admin.Common.Navigation')}
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {navigationItems.map(item => {
                const Icon = item.icon;
                const isRouteActive =
                  item.to === PATHNAMES.adminDashboard().to
                    ? location.pathname === item.to ||
                      location.pathname === `${item.to}/`
                    : location.pathname.startsWith(item.to);

                return (
                  <SidebarMenuItem key={item.key}>
                    <SidebarMenuButton
                      asChild
                      isActive={item.active || isRouteActive}
                      tooltip={item.label}
                      className="h-10 rounded-xl px-2.5 text-[0.95rem] font-medium group-data-[collapsible=icon]:mx-auto group-data-[collapsible=icon]:!size-9 group-data-[collapsible=icon]:rounded-xl"
                    >
                      <Link to={item.to}>
                        <Icon />
                        <span>{item.label}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="gap-2 border-t border-sidebar-border/70 p-2">
        <div className="flex items-center gap-3 rounded-xl border border-sidebar-border/70 bg-sidebar-accent/40 px-2.5 py-2.5 group-data-[collapsible=icon]:mx-auto group-data-[collapsible=icon]:size-9 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:p-0">
          <Avatar className="h-8 w-8 shrink-0 rounded-lg">
            <AvatarFallback className="rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
              {userInitials || 'AD'}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1 group-data-[collapsible=icon]:hidden">
            <div className="truncate text-sm font-medium text-sidebar-foreground">
              {userName}
            </div>
            <div className="truncate text-xs uppercase tracking-wide text-sidebar-foreground/70">
              {user?.role ?? 'ADMIN'}
            </div>
          </div>
        </div>

        <Button
          variant="outline"
          asChild
          className="h-10 justify-start rounded-xl px-2.5 group-data-[collapsible=icon]:mx-auto group-data-[collapsible=icon]:size-9 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:p-0"
        >
          <Link to={PATHNAMES.home().to}>
            <ExternalLink className="h-4 w-4" />
            <span className="group-data-[collapsible=icon]:hidden">
              {t('Pages.Admin.Navigation.BackToSite')}
            </span>
          </Link>
        </Button>
      </SidebarFooter>

      <SidebarRail />
    </Sidebar>
  );
}
