#!/usr/bin/env bash
# A copy of the game to play in, beside the checkout the builders work in (M10.33 K). The cause of lost answers in
# Bram's logs: the development build reloads on every commit of another session, and an answer on its way is gone.
# This makes (or brings up to date) a worktree ../Wisplight-play at origin/main, builds it there, and says how to
# start it. It shares the saves with the development build, so CONTINUE picks up the same game.
set -euo pipefail
ROOT="$(git rev-parse --show-toplevel)"
COPY="$(dirname "$ROOT")/Wisplight-play"
git -C "$ROOT" fetch -q origin
if [ ! -d "$COPY" ]; then
  git -C "$ROOT" worktree add -q --detach "$COPY" origin/main
else
  git -C "$COPY" checkout -q --detach origin/main
fi
# The same packages as the checkout: no second install.
[ -e "$COPY/node_modules" ] || ln -s "$ROOT/node_modules" "$COPY/node_modules"
(cd "$COPY" && npx electron-vite build >/dev/null)
echo "Built $(git -C "$COPY" log --oneline -1) in $COPY."
echo "Start it with: cd \"$COPY\" && npx electron ."
