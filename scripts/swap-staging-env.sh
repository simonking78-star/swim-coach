#!/usr/bin/env bash
# Netlify deploy-preview / branch-deploy build step (A-018).
#
# coach-tools-deploy/index.html is a static file with the Supabase URL and
# anon key hardcoded as JS constants -- there's no build pipeline and no
# env-var layer in the app itself. Production deploys must never touch this
# file. For deploy-preview and branch-deploy contexts only, this script
# swaps those two constants to point at the staging Supabase project
# (swimmers-gb-staging) instead, using STAGING_SUPABASE_URL and
# STAGING_SUPABASE_ANON_KEY (set as Netlify env vars scoped to those two
# contexts only -- see netlify.toml).
#
# Matches on the JS variable name, not the current key value, so this
# keeps working if the production key is ever rotated.

set -euo pipefail

FILE="coach-tools-deploy/index.html"

if [ "${CONTEXT:-}" = "production" ]; then
  echo "swap-staging-env: production context, leaving $FILE untouched."
  exit 0
fi

if [ -z "${STAGING_SUPABASE_URL:-}" ] || [ -z "${STAGING_SUPABASE_ANON_KEY:-}" ]; then
  echo "swap-staging-env: STAGING_SUPABASE_URL / STAGING_SUPABASE_ANON_KEY not set, leaving $FILE untouched."
  exit 0
fi

sed -i.bak \
  -e "s#^const SUPABASE_URL = \".*\";#const SUPABASE_URL = \"${STAGING_SUPABASE_URL}\";#" \
  -e "s#^const SUPABASE_KEY = \".*\";#const SUPABASE_KEY = \"${STAGING_SUPABASE_ANON_KEY}\";#" \
  "$FILE"
rm -f "${FILE}.bak"

echo "swap-staging-env: $CONTEXT context, $FILE now points at staging Supabase."
