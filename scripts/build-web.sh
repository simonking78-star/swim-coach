#!/usr/bin/env bash
# Builds the site Netlify publishes, in site/:
#   /           the React app (web/), built here
# The classic app (/classic/, coach-tools-deploy/) was retired at Phase 6 of the
# club & squad normalisation: it read club and squad name columns that no
# longer exist. Old /classic/ and /v2/ links redirect to the root (netlify.toml).
#
# Deploy previews and branch deploys point the React app at the staging
# Supabase project (A-018); swap-staging-env.sh does the same for the
# classic app before this runs (no longer deployed). Production builds always use the
# production defaults baked into web/src/lib/supabase.ts.

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT/web"

if [ "${CONTEXT:-}" != "production" ] && [ -n "${STAGING_SUPABASE_URL:-}" ] && [ -n "${STAGING_SUPABASE_ANON_KEY:-}" ]; then
  export VITE_SUPABASE_URL="$STAGING_SUPABASE_URL"
  export VITE_SUPABASE_KEY="$STAGING_SUPABASE_ANON_KEY"
  echo "build-web: ${CONTEXT:-local} context, React app points at staging Supabase."
else
  echo "build-web: ${CONTEXT:-local} context, React app points at production Supabase."
fi

npm ci --no-audit --no-fund
npm run build

SITE="$ROOT/site"
rm -rf "$SITE"
mkdir -p "$SITE"
cp -R dist/. "$SITE/"
echo "build-web: site/ assembled — React app at /."
