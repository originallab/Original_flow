import { createBrowserRouter, type RouteObject } from 'react-router-dom';
import { ProtectedRoute } from '@/features/auth/ProtectedRoute';
import { RequireWorkspace } from '@/features/workspaces/RequireWorkspace';
import { OnboardingLayout } from '@/layouts/OnboardingLayout';
import { PlatformLayout } from '@/layouts/PlatformLayout';
import { BusinessPage } from '@/pages/BusinessPage';
import { HomePage } from '@/pages/HomePage';
import { LoginPage } from '@/pages/LoginPage';
import { OnboardingPage } from '@/pages/OnboardingPage';

/** Rutas de la aplicación. Cada pieza del front registra aquí sus pantallas. */
export const routes: RouteObject[] = [
  { path: '/login', element: <LoginPage /> },
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
              { path: '/negocio', element: <BusinessPage /> },
            ],
          },
        ],
      },
    ],
  },
];

export const router = createBrowserRouter(routes);
