#!/usr/bin/env bash
# Builds the React app in web/ and places it at coach-tools-deploy/v2, so
# the site serves the current app at / and the React rewrite at /v2 until
# every section has moved across (claude/specs/react-rewrite-scope.md).
#
# Deploy previews and branch deploys point the React app at the staging
# Supabase project (A-018), the same as swap-staging-env.sh does for the
# current app. Production builds always use the production defaults
# baked into web/src/lib/supabase.ts.

set -euo pipefail

cd "$(dirname "$0")/../web"

if [ "${CONTEXT:-}" != "production" ] && [ -n "${STAGING_SUPABASE_URL:-}" ] && [ -n "${STAGING_SUPABASE_ANON_KEY:-}" ]; then
  export VITE_SUPABASE_URL="$STAGING_SUPABASE_URL"
  export VITE_SUPABASE_KEY="$STAGING_SUPABASE_ANON_KEY"
  echo "build-web: ${CONTEXT:-local} context, React app points at staging Supabase."
else
  echo "build-web: ${CONTEXT:-local} context, React app points at production Supabase."
fi

npm ci --no-audit --no-fund
npm run build

rm -rf ../coach-tools-deploy/v2
cp -R dist ../coach-tools-deploy/v2
echo "build-web: React app copied to coach-tools-deploy/v2."
