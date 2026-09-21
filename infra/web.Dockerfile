# Web app + reverse proxy: Caddy serves the static SPA and forwards /v1 to the API, with
# automatic HTTPS (Let's Encrypt) for DOMAIN. Build from the repository root:
#   docker build -f infra/web.Dockerfile -t wusool-web .
FROM node:24-bookworm-slim AS build
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH CI=true
RUN corepack enable
WORKDIR /repo
COPY . .
RUN pnpm install --frozen-lockfile
# Same origin in production: the app calls /v1 on its own domain (no CORS needed).
ENV VITE_API_URL=/v1
RUN pnpm exec turbo run build --filter=@wusool/web...

FROM caddy:2-alpine
COPY infra/Caddyfile /etc/caddy/Caddyfile
COPY --from=build /repo/apps/web/dist /srv
