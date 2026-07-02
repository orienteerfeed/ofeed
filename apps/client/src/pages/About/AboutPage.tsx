import { Card } from '@/components/ui/card';
import { useTranslation } from 'react-i18next';
import { MainPageLayout } from '../../templates/MainPageLayout';

export const AboutPage = () => {
  const { t } = useTranslation();
  return (
    <MainPageLayout t={t} pageName={t('Templates.Routes.About')}>
      <section className="container mx-auto px-4 py-12 md:py-20">
        <div className="max-w-3xl mx-auto space-y-8">
          <div className="space-y-4">
            <h1 className="text-4xl md:text-6xl font-bold">
              About <span className="text-primary">OrienteerFeed</span>
            </h1>
            <p className="text-xl text-muted-foreground">
              The all-in-one platform for orienteering results, live sync, and
              event operations.
            </p>
          </div>

          <Card className="p-6 md:p-8 border-border">
            <h2 className="text-2xl font-bold mb-4">What is OrienteerFeed?</h2>
            <div className="space-y-4 text-muted-foreground">
              <p>
                OrienteerFeed (OFEED) is a comprehensive results and event
                platform for orienteering. It synchronizes data during the race
                so organizers have a second-by-second overview of what’s
                happening on the course and in the arena.
              </p>
              <p>
                Starters get instant visibility into late entries and
                registration edits. Online results remain consistent even if an
                athlete starts with a different chip than the one originally
                reported. Athletes, coaches, and fans get live results, deep
                split analysis, and complete event information in one place.
              </p>
            </div>
          </Card>

          <Card className="p-6 md:p-8 border-border">
            <h2 className="text-2xl font-bold mb-4">Key Capabilities</h2>
            <ul className="space-y-3 text-muted-foreground">
              <li className="flex items-start gap-3">
                <span className="text-primary font-bold">•</span>
                <span>
                  <strong className="text-foreground">
                    Live race synchronization:
                  </strong>{' '}
                  second-by-second updates give organizers continuous
                  situational awareness.
                </span>
              </li>
              <li className="flex items-start gap-3">
                <span className="text-primary font-bold">•</span>
                <span>
                  <strong className="text-foreground">
                    Last-minute changes, handled:
                  </strong>{' '}
                  starters see late entries and registration edits instantly.
                </span>
              </li>
              <li className="flex items-start gap-3">
                <span className="text-primary font-bold">•</span>
                <span>
                  <strong className="text-foreground">
                    Robust online results:
                  </strong>{' '}
                  results stay correct even when a runner starts with a
                  different card.
                </span>
              </li>
              <li className="flex items-start gap-3">
                <span className="text-primary font-bold">•</span>
                <span>
                  <strong className="text-foreground">
                    On-site registration & edits:
                  </strong>{' '}
                  sign up at the event or change your registration on the spot.
                </span>
              </li>
              <li className="flex items-start gap-3">
                <span className="text-primary font-bold">•</span>
                <span>
                  <strong className="text-foreground">
                    Live results & split analysis:
                  </strong>{' '}
                  control-by-control insights, comparisons, and time-loss
                  detection.
                </span>
              </li>
              <li className="flex items-start gap-3">
                <span className="text-primary font-bold">•</span>
                <span>
                  <strong className="text-foreground">
                    Result boards and visualizations:
                  </strong>{' '}
                  dynamic leaderboards projected in the arena
                </span>
              </li>
            </ul>
          </Card>
          <Card className="p-0 border-border overflow-hidden">
            <div className="relative">
              <div className="absolute inset-0 bg-gradient-to-br from-primary/15 via-transparent to-primary/5" />
              <div className="relative p-6 md:p-8 space-y-6">
                <div className="space-y-2">
                  <p className="text-xs uppercase tracking-[0.2em] text-primary font-semibold">
                    OFeed Team
                  </p>
                  <h2 className="text-2xl md:text-3xl font-bold">
                    Built by Orienteers
                  </h2>
                </div>

                <div className="grid gap-5 md:grid-cols-[1fr_1.2fr_1fr] items-stretch">
                  <div className="rounded-xl border border-border/70 bg-background/80 p-5 backdrop-blur-sm">
                    <p className="text-xs uppercase tracking-wide text-muted-foreground mb-2">
                      Author
                    </p>
                    <h3 className="text-xl font-bold">Martin Křivda</h3>
                    <p className="text-sm font-medium text-primary/90 mt-1">
                      K.O.B. Choceň
                    </p>
                    <p className="text-sm text-muted-foreground mt-2">
                      Leads development and shapes the core vision behind
                      OrienteerFeed.
                    </p>
                  </div>

                  <div className="rounded-xl border border-primary/30 bg-background/70 p-2 min-h-44">
                    <img
                      src="/images/team_foto.jpg"
                      alt="Martin Křivda and Lukáš Kettner"
                      className="h-full w-full min-h-40 rounded-lg object-cover"
                    />
                  </div>

                  <div className="rounded-xl border border-border/70 bg-background/80 p-5 backdrop-blur-sm">
                    <p className="text-xs uppercase tracking-wide text-muted-foreground mb-2">
                      Author
                    </p>
                    <h3 className="text-xl font-bold">Lukáš Kettner</h3>
                    <p className="text-sm font-medium text-primary/90 mt-1">
                      OK Kamenice
                    </p>
                    <p className="text-sm text-muted-foreground mt-2">
                      Drives integrations, outreach, and documentation to keep
                      OrienteerFeed connected and accessible.
                    </p>
                  </div>
                </div>

                <p className="text-sm md:text-base text-muted-foreground">
                  We are orienteering enthusiasts who enjoy
                  connecting technology with orienteering.
                </p>

                <p className="text-sm md:text-base text-muted-foreground">
                  After using the core of the platform privately for many years, we
                  decided to open it to the wider orienteering community to make
                  event organization simpler, faster, and more reliable.
                </p>
              </div>
            </div>
          </Card>
          <Card className="p-6 md:p-8 border-border">
            <h2 className="text-2xl font-bold mb-4">Contact</h2>
            <p className="text-muted-foreground">
              Questions or feedback? Get in touch via{' '}
              <a
                href="https://github.com/orienteerfeed"
                target="_blank"
                rel="noreferrer"
                className="text-primary font-medium hover:underline underline-offset-4"
              >
                GitHub
              </a>{' '}
              or check the{' '}
              <a
                href="https://docs.orienteerfeed.com/"
                target="_blank"
                rel="noreferrer"
                className="text-primary font-medium hover:underline underline-offset-4"
              >
                documentation
              </a>{' '}
              for more details.
            </p>
          </Card>
        </div>
      </section>
    </MainPageLayout>
  );
};

export default AboutPage;
