// templates/MainPageLayout.tsx
import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Navbar, Sidebar } from '../components/organisms';

type TFunction = ReturnType<typeof useTranslation>['t'];

interface RouteItem {
  name: string;
  path: string;
  layout?: string;
}

interface EventPageLayoutProps {
  children: React.ReactNode;
  t: TFunction;
  pageName?: string;
}

const MENU_EXPAND_THRESHOLD = 1280;

export const MainPageLayout: React.FC<EventPageLayoutProps> = ({
  children,
  t,
  pageName,
}) => {
  const routes: RouteItem[] = React.useMemo(
    () => [
      { path: '/', name: t('Templates.Routes.Home') },
      { path: '/events', name: t('Templates.Routes.Events') },
      { path: '/about', name: t('Templates.Routes.About') },
      { path: '/contact', name: t('Templates.Routes.Contact') },
      { path: '/mrb', name: t('Templates.Routes.MRB') },
    ],
    [t]
  );

  const [open, setOpen] = useState<boolean>(
    window.innerWidth > MENU_EXPAND_THRESHOLD
  );

  useEffect(() => {
    const handleResize = (): void => {
      const shouldBeOpen = window.innerWidth > MENU_EXPAND_THRESHOLD;
      setOpen(shouldBeOpen);
    };

    window.addEventListener('resize', handleResize);

    return (): void => {
      window.removeEventListener('resize', handleResize);
    };
  }, []);

  return (
    <div className="flex h-full min-h-screen">
      <Sidebar routes={routes} open={open} onClose={() => setOpen(false)} />

      <div className="flex flex-col flex-1 xl:ml-[325px] bg-blue-50 dark:bg-zinc-800 duration-175">
        <header className="sticky top-0 left-0 xl:left-[325px] w-full z-40 p-1 md:p-4">
          <Navbar
            routes={routes}
            onOpenSidenav={() => setOpen(true)}
            pageName={pageName}
            t={t}
          />
        </header>

        <main className="flex-grow overflow-auto p-1 md:px-4">
          <div className="container 2xl:max-w-none mx-auto lg:mx-0 p-2">
            {children}
          </div>
        </main>

        <footer className="w-full p-1 md:p-4"></footer>
      </div>
    </div>
  );
};
