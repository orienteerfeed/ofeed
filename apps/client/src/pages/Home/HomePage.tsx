import React from 'react';
import { useTranslation } from 'react-i18next';

import { MainPageLayout } from '../../templates';
import { EventsTabs } from './EventsTabs';

const HeroScene: React.FC = () => {
  return (
    <div
      className="
        relative w-full max-w-[900px]
        aspect-[2500/1700]   /* poměr jako v all.svg */
        select-none
      "
    >
      {/* Forest background */}
      <img
        src="/images/illustrations/2025_orienteerfeed_v03_forest_background.svg"
        alt="Forest background scene"
        className="
          absolute top-0 left-1/2 -translate-x-1/2
          w-[155%] md:w-[165%] lg:w-[175%]
          animate-fade-in
          dark:invert dark:brightness-0 dark:hue-rotate-180
        "
      />

      {/* Arena */}
      <img
        src="/images/illustrations/2025_orienteerfeed_v03_arena.svg"
        alt="Arena area"
        className="
          absolute bottom-[33%] left-[55%] -translate-x-1/2
          w-[28%] md:bottom-[36%] md:w-[30%] lg:bottom-[38%] lg:w-[30%]
          z-20
          dark:invert dark:brightness-0 dark:hue-rotate-180
          hover:scale-105 transition-transform duration-300 ease-in-out
        "
      />

      {/* Finish */}
      <img
        src="/images/illustrations/2025_orienteerfeed_v03_finish.svg"
        alt="Finish area"
        className="
          absolute bottom-[9%] left-[4%]
          w-[24%] md:w-[25%] lg:w-[26%]
          z-20
          dark:invert dark:brightness-0 dark:hue-rotate-180
          hover:scale-105 transition-transform duration-300 ease-in-out
        "
      />

      {/* Entries */}
      <img
        src="/images/illustrations/2025_orienteerfeed_v03_entries.svg"
        alt="Entries area"
        className="
          absolute bottom-[11%] right-[5%]
          w-[14%] lg:bottom-[8%] lg:right-[4%] lg:w-[20%]
          z-20
          dark:invert dark:brightness-0 dark:hue-rotate-180
          hover:scale-105 transition-transform duration-300 ease-in-out
        "
      />

      {/* Radio */}
      <img
        src="/images/illustrations/2025_orienteerfeed_v03_radio.svg"
        alt="Radio control points"
        className="
          absolute bottom-[72%] md:bottom-[72%] left-[35%] -translate-x-1/2
          w-[18%]
          z-20
          dark:invert dark:brightness-0 dark:hue-rotate-180
          hover:scale-105 transition-transform duration-300 ease-in-out
        "
      />

      {/* Start */}
      <img
        src="/images/illustrations/2025_orienteerfeed_v03_start.svg"
        alt="Start area"
        className="
          absolute bottom-[32%] md:bottom-[34%] lg:bottom-[36%] right-[-16%] lg:right-[-12%] -translate-x-1/2
          w-[36%] lg:w-[30%]
          z-20
          dark:invert dark:brightness-0 dark:hue-rotate-180
          hover:scale-105 transition-transform duration-300 ease-in-out
        "
      />

      {/* IT centrum */}
      <img
        src="/images/illustrations/2025_orienteerfeed_v03_it_centrum.svg"
        alt="IT centrum"
        className="
          absolute bottom-[6%] sm:bottom-[0%] md:bottom-[6%] left-[48%] -translate-x-1/2
          w-[12%] lg:w-[15%]
          z-20
          dark:invert dark:brightness-0 dark:hue-rotate-180
          hover:scale-105 transition-transform duration-300 ease-in-out
        "
      />

      {/* Results */}
      <img
        src="/images/illustrations/2025_orienteerfeed_v03_results.svg"
        alt="Results lists"
        className="
          absolute bottom-[15%] md:bottom-[15%] lg:bottom-[20%] left-[68%] -translate-x-1/2
          w-[11%] md:w-[12%] lg:left-[67%] lg:w-[12%]
          z-20
          dark:invert dark:brightness-0 dark:hue-rotate-180
          hover:scale-105 transition-transform duration-300 ease-in-out
        "
      />
    </div>
  );
};

export const HomePage: React.FC = () => {
  const { t } = useTranslation();

  return (
    <MainPageLayout t={t} pageName={t('Templates.Routes.Home')}>
      {/* Hero Section with Orienteering Illustration */}
      <section className="relative bg-gradient-to-b from-muted/50 to-background py-12 md:py-20 overflow-hidden">
        <div className="container mx-auto px-4 relative">
          <div className="grid lg:grid-cols-2">
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
                  <span>{t('Pages.Home.Hero.LiveEventSynchronization')}</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-primary animate-pulse" />
                  <span>{t('Pages.Home.Hero.LastMinuteChanges')}</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-primary animate-pulse" />
                  <span>{t('Pages.Home.Hero.DetailedSplitAnalysis')}</span>
                </div>
              </div>
            </div>

            {/* Scene in righ panel */}
            <div className="relative mt-4 lg:mt-0">
              <HeroScene />
            </div>
          </div>

          {/* Bottom frame */}
          <img
            src="/images/illustrations/2025_orienteerfeed_v03_bottom_frame.svg"
            alt="Orienteering event scene"
            className="pointer-events-none select-none w-full max-w-none animate-fade-in animate-fade-in dark:invert dark:brightness-0 dark:hue-rotate-180 mt-[-5rem] lg:mt-[-1rem]"
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
