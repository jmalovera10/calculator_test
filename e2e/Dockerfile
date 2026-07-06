# The official mcr.microsoft.com/playwright image ships Chromium, Firefox,
# AND WebKit plus all of their OS dependencies/fonts — several GB, most of
# which is unused since our specs only ever run against the default project
# (Chromium). A slim Node base + installing just Chromium is an order of
# magnitude smaller and pulls/builds far faster, especially on a first (cold)
# build where the base image isn't already cached.
FROM node:20-bookworm-slim

WORKDIR /e2e

COPY package.json package-lock.json ./
RUN npm ci

# Installs only the Chromium browser binary + its OS-level dependencies,
# matching the @playwright/test version pinned in package.json.
RUN npx playwright install --with-deps chromium

COPY playwright.config.ts ./
COPY e2e ./e2e

# Wait for the backend/frontend containers to actually be ready to serve
# requests (not just "started") before running the suite against them.
# The http-get:// scheme forces a GET request — wait-on's default for a
# plain http:// target is HEAD, which previously 404'd against the
# GET-only /healthz route and hung the whole compose run forever (the
# backend route now answers HEAD too, but this pins the check method
# explicitly so it can't silently regress the same way for either service).
# A bounded timeout means a genuine readiness failure fails fast with a
# clear error instead of hanging the whole compose run indefinitely.
CMD ["sh", "-c", "npx wait-on -t 60000 http-get://backend:8080/healthz http-get://frontend:80 && npx playwright test"]
