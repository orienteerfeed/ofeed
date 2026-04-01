import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { Separator } from '@/components/ui/separator';
import { SidebarTrigger } from '@/components/ui/sidebar';
import {
  LanguageSelector,
  ThemeToggleButton,
  UserMenu,
} from '@/components/molecules';
import { useUser } from '@/stores/auth';
import { Link } from '@tanstack/react-router';
import { Fragment } from 'react';
import { useTranslation } from 'react-i18next';

type AdminBreadcrumbItem = {
  label: string;
  to?: string;
};

type AdminHeaderProps = {
  breadcrumbs: AdminBreadcrumbItem[];
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

export function AdminHeader({ breadcrumbs }: AdminHeaderProps) {
  const { t } = useTranslation();
  const user = useUser();

  const userWithInitials = user
    ? {
        ...user,
        initials: getInitials(user.firstname, user.lastname),
      }
    : undefined;

  return (
    <header className="flex h-16 shrink-0 items-center justify-between gap-3 border-b bg-background/80 px-4 backdrop-blur-sm transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-12 lg:px-6">
      <div className="flex min-w-0 items-center gap-2">
        <SidebarTrigger className="-ml-1" />
        <Separator
          orientation="vertical"
          className="mr-2 hidden h-4 sm:block"
        />
        <Breadcrumb>
          <BreadcrumbList>
            {breadcrumbs.map((crumb, index) => {
              const isLast = index === breadcrumbs.length - 1;

              return (
                <Fragment key={`${crumb.label}-${index}`}>
                  {index > 0 ? (
                    <BreadcrumbSeparator className="hidden md:flex" />
                  ) : null}
                  <BreadcrumbItem>
                    {isLast || !crumb.to ? (
                      <BreadcrumbPage>{crumb.label}</BreadcrumbPage>
                    ) : (
                      <BreadcrumbLink asChild className="hidden md:inline-flex">
                        <Link to={crumb.to}>{crumb.label}</Link>
                      </BreadcrumbLink>
                    )}
                  </BreadcrumbItem>
                </Fragment>
              );
            })}
          </BreadcrumbList>
        </Breadcrumb>
      </div>

      <div className="flex items-center gap-2">
        <LanguageSelector />
        <ThemeToggleButton />
        {userWithInitials ? <UserMenu user={userWithInitials} t={t} /> : null}
      </div>
    </header>
  );
}
