import { z } from 'zod';

/**
 * Única lectura de variables de entorno del backend.
 * Nada más en el proyecto debe usar `process.env` directamente.
 */

const LOG_LEVELS = ['debug', 'info', 'warn', 'error', 'silent'] as const;
export type LogLevel = (typeof LOG_LEVELS)[number];

const originsSchema = z
  .string()
  .default('')
  .transform((raw) =>
    raw
      .split(',')
      .map((origin) => origin.trim())
      .filter((origin) => origin.length > 0),
  )
  // Cada origen debe ser una URL completa; esto también rechaza "*".
  .pipe(z.array(z.url('debe ser una URL completa, por ejemplo http://localhost:5173')));

const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().min(1).max(65535).default(3000),
    LOG_LEVEL: z.enum(LOG_LEVELS).default('info'),
    CORS_ORIGINS: originsSchema,
    // Dónde se muestran las páginas publicadas (el servicio de dominios de la empresa). Solo esos
    // orígenes pueden leer /public/* desde un navegador. Vacío = ninguno.
    PUBLIC_CORS_ORIGINS: originsSchema,
    RATE_LIMIT_PUBLIC_PER_MINUTE: z.coerce.number().int().min(1).max(100_000).default(120),
    // Más estricto: cada petición crea un lead, y más adelante disparará avisos.
    RATE_LIMIT_LEADS_PER_MINUTE: z.coerce.number().int().min(1).max(10_000).default(10),
    DATABASE_URL: z.string().min(1, 'es obligatoria'),

    // Detrás de un proxy inverso (EasyPanel) hay que decir cuántos saltos confiar para
    // leer la IP real del visitante; con 0 se usa la IP de la conexión directa.
    TRUST_PROXY_HOPS: z.coerce.number().int().min(0).max(10).default(0),

    // Sesiones: una sesión que no completa el login caduca pronto; una validada dura más.
    SESSION_PENDING_TTL_MINUTES: z.coerce.number().int().min(1).max(120).default(15),
    SESSION_TTL_DAYS: z.coerce.number().int().min(1).max(365).default(30),
    RATE_LIMIT_AUTH_SESSION_PER_MINUTE: z.coerce.number().int().min(1).max(10_000).default(30),

    // Original Auth: obligatorias, el login no funciona sin ellas. En desarrollo con
    // AUTH_MODE=mock_callback pueden ser valores inventados, solo locales.
    ORIGINALAUTH_TOKEN_APP: z.string().min(1),
    ORIGINALAUTH_SECRET_KEY: z.string().min(1),
    AUTH_MODE: z.enum(['real', 'mock_callback']).default('real'),

    // Demás servicios de The Original Lab. Opcionales mientras no se integre cada uno;
    // cada integración exige las suyas al momento de usarse.
    MEDIAAS_BASE_URL: z.url().optional(),
    MEDIAAS_API_KEY: z.string().min(1).optional(),
    MEDIAAS_SECRET_KEY: z.string().min(1).optional(),
    IAENGINE_BASE_URL: z.url().optional(),
    IAENGINE_API_KEY: z.string().min(1).optional(),
    IAENGINE_SECRET_KEY: z.string().min(1).optional(),
    ORIGINALPAY_BASE_URL: z.url().default('https://api-test.origpay.com/'),
    // Original Flow es UNA sola app de Original Pay: sus credenciales son del servidor, no de cada negocio.
    // `token_app` va en el cuerpo del cobro; ambas autentican el aviso de pago (webhook) que Original Pay envía.
    ORIGINALPAY_TOKEN_APP: z.string().min(1).optional(),
    ORIGINALPAY_SECRET_KEY: z.string().min(1).optional(),
  })
  .superRefine((env, ctx) => {
    // El atajo de login simulado nunca puede llegar a producción.
    if (env.NODE_ENV === 'production' && env.AUTH_MODE !== 'real') {
      ctx.addIssue({
        code: 'custom',
        path: ['AUTH_MODE'],
        message: 'debe ser "real" cuando NODE_ENV es production',
      });
    }
  });

export interface AppConfig {
  env: 'development' | 'test' | 'production';
  port: number;
  logLevel: LogLevel;
  corsOrigins: string[];
  publicCorsOrigins: string[];
  databaseUrl: string;
  trustProxyHops: number;
  session: { pendingTtlMs: number; ttlMs: number };
  rateLimit: { authSessionPerMinute: number; publicPerMinute: number; leadsPerMinute: number };
  originalAuth: { tokenApp: string; secretKey: string; mode: 'real' | 'mock_callback' };
  mediaAas: { baseUrl?: string; apiKey?: string; secretKey?: string };
  aiEngine: { baseUrl?: string; apiKey?: string; secretKey?: string };
  originalPay: { baseUrl: string; tokenApp?: string; secretKey?: string };
}

export class ConfigError extends Error {
  constructor(public readonly problems: string[]) {
    super(`Configuración inválida:\n${problems.map((p) => `  - ${p}`).join('\n')}`);
    this.name = 'ConfigError';
  }
}

/**
 * Valida las variables de entorno y devuelve la configuración tipada.
 * El mensaje de error menciona solo el nombre de cada variable, nunca su valor.
 */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = envSchema.safeParse(env);
  if (!parsed.success) {
    throw new ConfigError(
      parsed.error.issues.map((issue) => `${issue.path.join('.') || 'env'}: ${issue.message}`),
    );
  }
  const e = parsed.data;
  return {
    env: e.NODE_ENV,
    port: e.PORT,
    logLevel: e.LOG_LEVEL,
    corsOrigins: e.CORS_ORIGINS,
    publicCorsOrigins: e.PUBLIC_CORS_ORIGINS,
    databaseUrl: e.DATABASE_URL,
    trustProxyHops: e.TRUST_PROXY_HOPS,
    session: {
      pendingTtlMs: e.SESSION_PENDING_TTL_MINUTES * 60_000,
      ttlMs: e.SESSION_TTL_DAYS * 24 * 60 * 60_000,
    },
    rateLimit: { authSessionPerMinute: e.RATE_LIMIT_AUTH_SESSION_PER_MINUTE, publicPerMinute: e.RATE_LIMIT_PUBLIC_PER_MINUTE,
      leadsPerMinute: e.RATE_LIMIT_LEADS_PER_MINUTE,
    },
    originalAuth: { tokenApp: e.ORIGINALAUTH_TOKEN_APP, secretKey: e.ORIGINALAUTH_SECRET_KEY, mode: e.AUTH_MODE },
    mediaAas: { baseUrl: e.MEDIAAS_BASE_URL, apiKey: e.MEDIAAS_API_KEY, secretKey: e.MEDIAAS_SECRET_KEY },
    aiEngine: { baseUrl: e.IAENGINE_BASE_URL, apiKey: e.IAENGINE_API_KEY, secretKey: e.IAENGINE_SECRET_KEY },
    originalPay: { baseUrl: e.ORIGINALPAY_BASE_URL, tokenApp: e.ORIGINALPAY_TOKEN_APP, secretKey: e.ORIGINALPAY_SECRET_KEY },
  };
}
