import { createBrowserRouter, type RouteObject } from 'react-router-dom';
import { ProtectedRoute } from '@/features/auth/ProtectedRoute';
import { RequireWorkspace } from '@/features/workspaces/RequireWorkspace';
import { OnboardingLayout } from '@/layouts/OnboardingLayout';
import { PlatformLayout } from '@/layouts/PlatformLayout';
import { WizardLayout } from '@/layouts/WizardLayout';
import { BusinessPage } from '@/pages/BusinessPage';
import { EditorPage } from '@/pages/EditorPage';
import { FunnelsPage } from '@/pages/FunnelsPage';
import { HomePage } from '@/pages/HomePage';
import { LoginPage } from '@/pages/LoginPage';
import { NotFoundPage } from '@/pages/NotFoundPage';
import { NewFunnelPage } from '@/pages/NewFunnelPage';
import { OnboardingPage } from '@/pages/OnboardingPage';
import { PublicPage } from '@/pages/PublicPage';

/** Rutas de la aplicación. Cada pieza del front registra aquí sus pantallas. */
export const routes: RouteObject[] = [
  { path: '/login', element: <LoginPage /> },
  // La página publicada de un funnel: la ve cualquier visitante, sin sesión.
  { path: '/p/:slug', element: <PublicPage /> },
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
              { path: '/negocio', element: <BusinessPage /> },
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
