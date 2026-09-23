import { createBrowserRouter, Navigate } from 'react-router';
import {
  AccountPage,
  CreateOrgPage,
  HomePage,
  InboxPage,
  PlatformPage,
} from '@/features/account/AccountPages';
import { AdminLayout } from '@/features/admin/admin-org';
import {
  AdminAlertPage,
  AdminAlertsPage,
  AdminTripPage,
  AuditPage,
  EnrollmentsPage,
  LiveTripsPage,
  MembersPage,
  RouteDetailPage,
  RoutesPage,
  StudentsPage,
  UnreachablePage,
  VehiclesPage,
} from '@/features/admin/AdminPages';
import { MorePage } from '@/features/admin/MorePage';
import { AlertPage } from '@/features/alerts/AlertPage';
import {
  ForgotPasswordPage,
  LoginPage,
  ReadyPage,
  RegisterPage,
  ResetPasswordPage,
  VerifyEmailPage,
  WelcomePage,
} from '@/features/auth/AuthPages';
import { DriverTodayPage } from '@/features/driver/DriverTodayPage';
import { TripPage } from '@/features/driver/TripPage';
import { AddChildPage } from '@/features/guardian/AddChildPage';
import {
  ChildPage,
  GuardianHomePage,
  GuardianShell,
  HelpPage,
  HistoryPage,
  LinkChildPage,
  ServicesPage,
} from '@/features/guardian/GuardianPages';
import { NotificationSetupPage } from '@/features/push/NotificationSetupPage';
import { RequireAuth } from './RequireAuth';
import { RootLayout } from './RootLayout';

// Browser routing works both on the web and under capacitor://localhost, where Capacitor
// serves index.html for unknown paths. Deep links: /trip/:id, /child/:id, /alert/:id (PLAN §9.1).
export const routes = [
  {
    element: <RootLayout />,
    children: [
      { path: 'welcome', element: <WelcomePage /> },
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
          { path: 'ready', element: <ReadyPage /> },
          { path: 'settings', element: <Navigate to="/account" replace /> },
          { path: 'organizations/new', element: <CreateOrgPage /> },
          { path: 'platform', element: <PlatformPage /> },
          { path: 'driver', element: <DriverTodayPage /> },
          { path: 'trip/:id', element: <TripPage /> },
          { path: 'children/new', element: <AddChildPage /> },
          {
            // Guardian screens with the bottom tab bar (Claude Design "Tammeni Guardian").
            element: <GuardianShell />,
            children: [
              { path: 'guardian', element: <GuardianHomePage /> },
              { path: 'child/:id', element: <ChildPage /> },
              { path: 'inbox', element: <InboxPage /> },
              { path: 'services', element: <ServicesPage /> },
              { path: 'history', element: <HistoryPage /> },
              { path: 'help', element: <HelpPage /> },
              { path: 'link', element: <LinkChildPage /> },
              { path: 'account', element: <AccountPage /> },
            ],
          },
          { path: 'alert/:id', element: <AlertPage /> },
          {
            path: 'admin',
            element: <AdminLayout />,
            children: [
              { index: true, element: <LiveTripsPage /> },
              { path: 'trips/:id', element: <AdminTripPage /> },
              { path: 'alerts', element: <AdminAlertsPage /> },
              { path: 'alerts/:id', element: <AdminAlertPage /> },
              { path: 'more', element: <MorePage /> },
              { path: 'enrollments', element: <EnrollmentsPage /> },
              { path: 'students', element: <StudentsPage /> },
              { path: 'routes', element: <RoutesPage /> },
              { path: 'routes/:id', element: <RouteDetailPage /> },
              { path: 'vehicles', element: <VehiclesPage /> },
              { path: 'members', element: <MembersPage /> },
              { path: 'unreachable', element: <UnreachablePage /> },
              { path: 'audit', element: <AuditPage /> },
            ],
          },
        ],
      },
    ],
  },
];

export const createAppRouter = () => createBrowserRouter(routes);
