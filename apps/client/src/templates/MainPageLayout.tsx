import { TFunction } from 'i18next';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { Footer, Navbar } from '../components/organisms';
import {
  buildLocalizedDocsUrl,
  externalLinks,
} from '../lib/paths/externalLinks';

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
  const { i18n } = useTranslation();
  const currentLanguage = i18n.resolvedLanguage ?? i18n.language;
  const docsLink = React.useMemo(
    () => buildLocalizedDocsUrl(currentLanguage),
    [currentLanguage],
  );

  const navLinks: NavLink[] = React.useMemo(
    () => [
      { path: '/', label: t('Templates.Routes.Events') },
      { path: '/about', label: t('Templates.Routes.About') },
      {
        path: docsLink,
        label: t('Templates.Routes.Docs'),
        external: true,
      },
      {
        path: externalLinks.github,
        label: t('Templates.Routes.GitHub'),
        external: true,
      },
    ],
    [docsLink, t]
  );

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Navbar navLinks={navLinks} t={t} />
      <main className="flex-1">{children}</main>
      <Footer t={t} />
    </div>
  );
};
