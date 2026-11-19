#!/bin/sh
# Stamps the current git sha into a copy of app/ at dist/ (R6).
set -e
SHA=$(git rev-parse HEAD)
rm -rf dist && cp -R app dist
sed -i '' "s/__BUILD_SHA__/$SHA/g" dist/index.html 2>/dev/null || sed -i "s/__BUILD_SHA__/$SHA/g" dist/index.html
echo "$SHA"
