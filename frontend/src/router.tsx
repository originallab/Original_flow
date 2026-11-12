import { createBrowserRouter, type RouteObject } from 'react-router-dom';
import { ProtectedRoute } from '@/features/auth/ProtectedRoute';
import { RequireWorkspace } from '@/features/workspaces/RequireWorkspace';
import { OnboardingLayout } from '@/layouts/OnboardingLayout';
import { PlatformLayout } from '@/layouts/PlatformLayout';
import { WizardLayout } from '@/layouts/WizardLayout';
import { AuthErrorPage } from '@/pages/AuthErrorPage';
import { AuthReturnPage } from '@/pages/AuthReturnPage';
import { BusinessPage } from '@/pages/BusinessPage';
import { EditorPage } from '@/pages/EditorPage';
import { FunnelsPage } from '@/pages/FunnelsPage';
import { HomePage } from '@/pages/HomePage';
import { LeadsPage } from '@/pages/LeadsPage';
import { LoginPage } from '@/pages/LoginPage';
import { DemoPayPage } from '@/pages/DemoPayPage';
import { NotFoundPage } from '@/pages/NotFoundPage';
import { OrderPage } from '@/pages/OrderPage';
import { NewFunnelPage } from '@/pages/NewFunnelPage';
import { OnboardingPage } from '@/pages/OnboardingPage';
import { PaymentReturnPage } from '@/pages/PaymentReturnPage';
import { PublicPage } from '@/pages/PublicPage';
import { TeamPage } from '@/pages/TeamPage';

/** Rutas de la aplicación. Cada pieza del front registra aquí sus pantallas. */
export const routes: RouteObject[] = [
  { path: '/login', element: <LoginPage /> },
  // A donde regresa Original Auth: con el inicio de sesión correcto (`/auth/return`) o fallido (`/auth/error`). Sin sesión todavía.
  { path: '/auth/return', element: <AuthReturnPage /> },
  { path: '/auth/error', element: <AuthErrorPage /> },
  // La página publicada de un funnel: la ve cualquier visitante, sin sesión.
  { path: '/p/:slug', element: <PublicPage /> },
  // A donde vuelve quien pagó: espera la confirmación del pago y muestra el resultado.
  { path: '/p/:slug/orden/:token', element: <OrderPage /> },
  // Direcciones FIJAS a las que Original Pay devuelve a quien pagó; llevan a la orden (`/p/:slug/orden/:token`).
  { path: '/pago/retorno', element: <PaymentReturnPage /> },
  { path: '/pago/exito', element: <PaymentReturnPage /> },
  { path: '/pago/error', element: <PaymentReturnPage /> },
  // La pasarela de mentira del modo demostración: solo existe en desarrollo (en producción la ruta ni se declara).
  ...(import.meta.env.DEV ? [{ path: '/demo/pago/:token', element: <DemoPayPage /> }] : []),
  {
    // Todo lo que está aquí dentro exige sesión (se declara una sola vez para el grupo).
    element: <ProtectedRoute />,
    children: [
      // El alta del negocio: con sesión, pero todavía sin negocio.
      { element: <OnboardingLayout />, children: [{ path: '/bienvenida', element: <OnboardingPage /> }] },
      // La plataforma: exige además tener un negocio.
      {
        element: <RequireWorkspace />,
        children: [
          {
            element: <PlatformLayout />,
            children: [
              { path: '/', element: <HomePage /> },
              { path: '/funnels', element: <FunnelsPage /> },
              { path: '/leads', element: <LeadsPage /> },
              { path: '/negocio', element: <BusinessPage /> },
              { path: '/equipo', element: <TeamPage /> },
            ],
          },
          // El asistente de creación ocupa toda la pantalla (sin el menú de la plataforma).
          { element: <WizardLayout />, children: [{ path: '/funnels/nuevo', element: <NewFunnelPage /> }] },
          // El editor también ocupa toda la pantalla (lleva su propia barra con el logotipo).
          { path: '/funnels/:id/editor', element: <EditorPage /> },
        ],
      },
    ],
  },
  // Cualquier otra dirección.
  { path: '*', element: <NotFoundPage /> },
];

export const router = createBrowserRouter(routes);
