#!/usr/bin/env bash
set -euo pipefail

git fetch origin --prune
git checkout main
git reset --hard origin/main
git clean -fd
git status -sb
