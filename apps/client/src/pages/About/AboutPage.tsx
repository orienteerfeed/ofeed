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

          <Card className="p-6 md:p-8 border-border">
            <h2 className="text-2xl font-bold mb-4">Contact</h2>
            <p className="text-muted-foreground">
              Questions or feedback? Get in touch via our GitHub repository or
              check the documentation for more details.
            </p>
          </Card>
        </div>
      </section>
    </MainPageLayout>
  );
};

export default AboutPage;
