#!/bin/sh
# Bumps the app's release number everywhere it appears, so browsers load fresh code:
# the ?v= labels on the app's files (app/index.html) and the version shown next to the logo (app/app.js).
# Usage: tools/bump-version.sh        (from the project folder)
set -e
cd "$(dirname "$0")/.."
cur=$(grep -o "ver.textContent = 'v[0-9]*'" app/app.js | grep -o '[0-9]*')
next=$((cur + 1))
perl -pi -e "s/\\?v=$cur\"/?v=$next\"/g" app/index.html
perl -pi -e "s/ver\\.textContent = 'v$cur'/ver.textContent = 'v$next'/" app/app.js
echo "v$cur -> v$next"
