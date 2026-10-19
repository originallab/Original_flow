import { createBrowserRouter, type RouteObject } from 'react-router-dom';
import { ProtectedRoute } from '@/features/auth/ProtectedRoute';
import { PlatformLayout } from '@/layouts/PlatformLayout';
import { HomePage } from '@/pages/HomePage';
import { LoginPage } from '@/pages/LoginPage';

/** Rutas de la aplicación. Cada pieza del front registra aquí sus pantallas. */
export const routes: RouteObject[] = [
  { path: '/login', element: <LoginPage /> },
  {
    // Todo lo que está aquí dentro exige sesión (se declara una sola vez para el grupo).
    element: <ProtectedRoute />,
    children: [{ element: <PlatformLayout />, children: [{ path: '/', element: <HomePage /> }] }],
  },
];

export const router = createBrowserRouter(routes);
