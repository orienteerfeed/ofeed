import {
  BrowserRouter as Router,
  Navigate,
  Route,
  Routes,
} from 'react-router-dom';
import PATHNAMES from './pathnames';
import { AboutPage } from './pages/about';
import { ContactPage } from './pages/contact';
import {
  SignInPage,
  SignUpPage,
  RequestPasswordResetPage,
  PasswordResetPage,
  PasswordResetEmailSentPage,
} from './pages/auth';
import {
  EventDetailPage,
  EventPage,
  EventSettingsPage,
  MyEventPage,
} from './pages/event';
import { ProfilePage } from './pages/profile';
import { NotFoundPage } from './pages/notFound';
import { LandingPage, FeaturePage } from './pages/landing';

import { useAuth } from './utils';

export const AppRouter = () => {
  return (
    <Router>
      <Routes>
        <Route path={PATHNAMES.empty()} element={<LandingPage />} />
        <Route path={PATHNAMES.feature()} element={<FeaturePage />} />
        <Route path={PATHNAMES.event()} element={<EventPage />} />
        <Route path={PATHNAMES.about()} element={<AboutPage />} />
        <Route path={PATHNAMES.contact()} element={<ContactPage />} />
        <Route path={PATHNAMES.signIn()} element={<SignInPage />} />
        <Route path={PATHNAMES.signUp()} element={<SignUpPage />} />
        <Route
          path={PATHNAMES.resetPassword()}
          element={<RequestPasswordResetPage />}
        />
        <Route
          path={PATHNAMES.passwordResetEmailSentPage()}
          element={<PasswordResetEmailSentPage />}
        />
        <Route
          path={PATHNAMES.passwordResetConfirmation()}
          element={<PasswordResetPage />}
        />
        <Route path={PATHNAMES.eventDetail()} element={<EventDetailPage />} />
        <Route
          path={PATHNAMES.myEvents()}
          element={<PrivateRoute component={<MyEventPage />} />}
        />
        <Route
          path={PATHNAMES.eventSettings()}
          element={<PrivateRoute component={<EventSettingsPage />} />}
        />
        <Route
          path={PATHNAMES.profile()}
          element={<PrivateRoute component={<ProfilePage />} />}
        />
        {/* Not found route */}
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </Router>
  );
};

const PrivateRoute = ({ component }) => {
  const { token } = useAuth();

  return token ? component : <Navigate to={PATHNAMES.signIn()} />;
};
