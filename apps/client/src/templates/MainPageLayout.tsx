import { TFunction } from 'i18next';
import React from 'react';
import { Footer, Navbar } from '../components/organisms';
import { externalLinks } from '../lib/paths/externalLinks';

export interface NavLink {
  path: string;
  label: string;
  external?: boolean;
}

interface EventPageLayoutProps {
  children: React.ReactNode;
  t: TFunction;
  pageName?: string;
}

export const MainPageLayout: React.FC<EventPageLayoutProps> = ({
  children,
  t,
}) => {
  const navLinks: NavLink[] = React.useMemo(
    () => [
      { path: '/', label: t('Templates.Routes.Events') },
      { path: '/about', label: t('Templates.Routes.About') },
      {
        path: externalLinks.docs,
        label: t('Templates.Routes.Docs'),
        external: true,
      },
      {
        path: externalLinks.github,
        label: t('Templates.Routes.GitHub'),
        external: true,
      },
    ],
    [t]
  );

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Navbar navLinks={navLinks} t={t} />
      <main className="flex-1">{children}</main>
      <Footer t={t} />
    </div>
  );
};
