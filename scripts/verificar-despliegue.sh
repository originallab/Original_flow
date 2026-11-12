#!/usr/bin/env bash
# Verifica un despliegue en línea sin escribir datos (solo GET y OPTIONS).
# Uso: bash scripts/verificar-despliegue.sh https://frontend.ejemplo.com https://backend.ejemplo.com
set -u
FRONT="${1:-}"; BACK="${2:-}"
[ -z "$FRONT" ] || [ -z "$BACK" ] && { echo "Uso: $0 <url-frontend> <url-backend>"; exit 2; }
FRONT="${FRONT%/}"; BACK="${BACK%/}"
fallos=0
ok()   { echo "OK    $*"; }
fallo(){ echo "FALLO $*"; fallos=$((fallos + 1)); }
codigo() { curl -s -o /dev/null -m 15 -w '%{http_code}' "$@"; }

[ "$(codigo "$BACK/health")" = 200 ] && ok "backend /health responde 200" || fallo "backend /health no responde 200"
[ "$(codigo "$FRONT/health")" = 200 ] && ok "frontend /health responde 200" || fallo "frontend /health no responde 200"
[ "$(codigo "$FRONT/auth/return")" = 200 ] && ok "frontend sirve las rutas de la app (/auth/return)" || fallo "frontend no sirve /auth/return"

# Un recurso inexistente debe dar 404 (no 500: eso indicaría base sin migraciones).
c=$(codigo "$BACK/api/v1/public/pages/no-existe-verificacion")
[ "$c" = 404 ] && ok "base de datos con migraciones (página pública inexistente: 404)" || fallo "página pública inexistente dio $c (esperado 404; 500 = base sin migraciones)"

# CORS: el frontend sí, otro origen no.
permitido=$(curl -s -i -m 15 -X OPTIONS "$BACK/api/v1/auth/session" -H "Origin: $FRONT" -H 'Access-Control-Request-Method: GET' | tr -d '\r' | grep -i '^access-control-allow-origin:' | cut -d' ' -f2-)
[ "$permitido" = "$FRONT" ] && ok "CORS permite al frontend" || fallo "CORS no permite al frontend (devolvió: '${permitido:-nada}')"
ajeno=$(curl -s -i -m 15 -X OPTIONS "$BACK/api/v1/auth/session" -H 'Origin: https://sitio-ajeno.example' -H 'Access-Control-Request-Method: GET' | tr -d '\r' | grep -i '^access-control-allow-origin:' | cut -d' ' -f2-)
[ -z "$ajeno" ] && ok "CORS rechaza otros orígenes" || fallo "CORS permite un origen ajeno ($ajeno)"

# El frontend compilado: apunta al backend correcto y no trae el modo demostración.
html=$(curl -s -m 15 "$FRONT/")
js=$(echo "$html" | grep -o '/assets/index-[A-Za-z0-9_-]*\.js' | head -1)
if [ -z "$js" ]; then
  fallo "no se encontró el archivo principal del frontend"
else
  bundle=$(curl -s -m 30 "$FRONT$js")
  echo "$bundle" | grep -q "$BACK/api/v1" && ok "el frontend está compilado contra $BACK/api/v1" || fallo "el frontend NO apunta a $BACK/api/v1 (reconstruir con VITE_API_URL correcta)"
  echo "$bundle" | grep -q 'originalauth.com/login' && ok "el frontend trae la dirección de inicio de sesión de Original Auth" || fallo "el frontend no trae VITE_ORIGINALAUTH_LOGIN_URL"
  echo "$bundle" | grep -q 'token-app-de-desarrollo' && fallo "el frontend trae credenciales de desarrollo" || ok "el frontend no trae credenciales de desarrollo"
fi

echo
[ "$fallos" -eq 0 ] && echo "Todo en orden." || echo "$fallos comprobación(es) con FALLO."
exit "$fallos"
