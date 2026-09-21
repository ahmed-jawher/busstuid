import { createBrowserRouter } from 'react-router';
import {
  CreateOrgPage,
  HomePage,
  InboxPage,
  PlatformPage,
  SettingsPage,
} from '@/features/account/AccountPages';
import { AdminLayout } from '@/features/admin/admin-org';
import {
  AdminAlertsPage,
  EnrollmentsPage,
  LiveTripsPage,
  MembersPage,
  RouteDetailPage,
  RoutesPage,
  StudentsPage,
  UnreachablePage,
  VehiclesPage,
} from '@/features/admin/AdminPages';
import { AlertPage } from '@/features/alerts/AlertPage';
import {
  ForgotPasswordPage,
  LoginPage,
  RegisterPage,
  ResetPasswordPage,
  VerifyEmailPage,
} from '@/features/auth/AuthPages';
import { DriverTodayPage } from '@/features/driver/DriverTodayPage';
import { TripPage } from '@/features/driver/TripPage';
import { AddChildPage } from '@/features/guardian/AddChildPage';
import { ChildPage, GuardianHomePage } from '@/features/guardian/GuardianPages';
import { NotificationSetupPage } from '@/features/push/NotificationSetupPage';
import { RequireAuth } from './RequireAuth';
import { RootLayout } from './RootLayout';

// Browser routing works both on the web and under capacitor://localhost, where Capacitor
// serves index.html for unknown paths. Deep links: /trip/:id, /child/:id, /alert/:id (PLAN §9.1).
export const routes = [
  {
    element: <RootLayout />,
    children: [
      { path: 'login', element: <LoginPage /> },
      { path: 'register', element: <RegisterPage /> },
      { path: 'verify-email', element: <VerifyEmailPage /> },
      { path: 'forgot-password', element: <ForgotPasswordPage /> },
      { path: 'reset-password', element: <ResetPasswordPage /> },
      {
        element: <RequireAuth />,
        children: [
          { index: true, element: <HomePage /> },
          { path: 'notifications/setup', element: <NotificationSetupPage /> },
          { path: 'inbox', element: <InboxPage /> },
          { path: 'settings', element: <SettingsPage /> },
          { path: 'organizations/new', element: <CreateOrgPage /> },
          { path: 'platform', element: <PlatformPage /> },
          { path: 'driver', element: <DriverTodayPage /> },
          { path: 'trip/:id', element: <TripPage /> },
          { path: 'guardian', element: <GuardianHomePage /> },
          { path: 'children/new', element: <AddChildPage /> },
          { path: 'child/:id', element: <ChildPage /> },
          { path: 'alert/:id', element: <AlertPage /> },
          {
            path: 'admin',
            element: <AdminLayout />,
            children: [
              { index: true, element: <LiveTripsPage /> },
              { path: 'alerts', element: <AdminAlertsPage /> },
              { path: 'enrollments', element: <EnrollmentsPage /> },
              { path: 'students', element: <StudentsPage /> },
              { path: 'routes', element: <RoutesPage /> },
              { path: 'routes/:id', element: <RouteDetailPage /> },
              { path: 'vehicles', element: <VehiclesPage /> },
              { path: 'members', element: <MembersPage /> },
              { path: 'unreachable', element: <UnreachablePage /> },
            ],
          },
        ],
      },
    ],
  },
];

export const createAppRouter = () => createBrowserRouter(routes);
