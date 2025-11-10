import React from 'react';
import { useTranslation } from 'react-i18next';

import { MainPageLayout } from '../../templates';
import { EventsTabs } from './EventsTabs';

export const HomePage: React.FC = () => {
  const { t } = useTranslation();

  return (
    <MainPageLayout t={t} pageName={t('Templates.Routes.Home')}>
      {/* Hero Section with Orienteering Illustration */}
      <section className="relative bg-gradient-to-b from-muted/50 to-background py-12 md:py-20 overflow-hidden">
        <div className="container mx-auto px-4">
          <div className="grid md:grid-cols-2">
            {/* Text column */}
            <div className="space-y-6">
              <div className="inline-block">
                <h1 className="text-5xl md:text-7xl font-bold tracking-tight mb-2">
                  <span className="text-primary">Orienteer</span>Feed
                </h1>
                <p className="text-sm md:text-base text-muted-foreground font-mono">
                  OFEED
                </p>
              </div>
              <p className="text-xl md:text-2xl text-muted-foreground text-balance">
                {t('Pages.Home.Hero.Subtitle')}
              </p>
              <div className="flex flex-wrap gap-3 text-sm text-muted-foreground">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-primary animate-pulse" />
                  <span>{t('Pages.Home.Hero.LiveResults')}</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-primary animate-pulse" />
                  <span>{t('Pages.Home.Hero.SplitAnalysis')}</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-primary animate-pulse" />
                  <span>{t('Pages.Home.Hero.RealTimeEventControl')}</span>
                </div>
              </div>
            </div>

            {/* Illustration column */}
            <div className="relative flex items-start justify-end">
              <img
                src="/images/illustrations/2025_orienteerfeed_v03_forest_background.svg"
                alt="Orienteering event scene"
                className="
                  w-full max-w-none animate-fade-in
                  md:-ml-16 lg:-ml-24 xl:-ml-32
                  dark:invert dark:brightness-0 dark:hue-rotate-180
                "
              />
            </div>
          </div>

          {/* spodní rám – lehké odsazení od gridu */}
          <img
            src="/images/illustrations/2025_orienteerfeed_v03_bottom_frame.svg"
            alt="Orienteering event scene"
            className="w-full mt-6 md:mt-8 animate-fade-in dark:invert dark:brightness-0 dark:hue-rotate-180"
          />
        </div>
      </section>

      <section>
        <div className="container mx-auto px-4 py-4">
          <EventsTabs t={t} />
        </div>
      </section>
    </MainPageLayout>
  );
};
