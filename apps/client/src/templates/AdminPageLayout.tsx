import type { CSSProperties, ReactNode } from 'react';

import { AdminHeader, AdminSidebar } from '@/components/organisms';
import {
  SidebarInset,
  SidebarProvider,
  useSidebar,
} from '@/components/ui/sidebar';

type AdminPageLayoutProps = {
  activeItem: 'dashboard' | 'users' | 'events' | 'systemMessages' | 'ranking';
  breadcrumbs: Array<{
    label: string;
    to?: string;
  }>;
  children: ReactNode;
};

export function AdminPageLayout({
  activeItem,
  breadcrumbs,
  children,
}: AdminPageLayoutProps) {
  return (
    <SidebarProvider
      style={
        {
          '--sidebar-width': '12rem',
          '--sidebar-width-icon': '3rem',
          '--sidebar-inset-gap': '0.5rem',
          '--sidebar-width-collapsed': '4rem',
          '--header-height': 'calc(var(--spacing) * 12)',
        } as CSSProperties
      }
    >
      <AdminSidebar activeItem={activeItem} />
      <AdminPageLayoutInset breadcrumbs={breadcrumbs}>
        {children}
      </AdminPageLayoutInset>
    </SidebarProvider>
  );
}

function AdminPageLayoutInset({
  breadcrumbs,
  children,
}: Pick<AdminPageLayoutProps, 'breadcrumbs' | 'children'>) {
  const { isMobile, state } = useSidebar();

  const desktopSidebarWidth =
    state === 'collapsed' ? '0px' : 'var(--sidebar-width)';

  const insetStyle = isMobile
    ? undefined
    : ({
        marginLeft: desktopSidebarWidth,
        width: `calc(100% - ${desktopSidebarWidth})`,
      } as CSSProperties);

  return (
    <SidebarInset
      className="min-h-svh overflow-hidden transition-[margin-left,width] duration-200 ease-linear md:m-0 md:rounded-none md:shadow-none"
      style={insetStyle}
    >
      <AdminHeader breadcrumbs={breadcrumbs} />
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <div className="@container/main flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto">
          {children}
        </div>
      </div>
    </SidebarInset>
  );
}
