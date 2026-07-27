#!/bin/bash
# Take a daily coverage snapshot and commit it.
#
# Runs both probes, writes dated JSON into data/, and pushes. Intended to be
# driven by launchd once a day. Safe to run by hand.
#
# Nothing is committed unless both probes produced valid JSON — a partial or
# failed run must never land in the record, because the record is the product.

set -uo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO" || exit 1

DATE="$(date +%F)"
POOL="data/pool-depth-${DATE}.json"
REDEEM="data/redemption-${DATE}.json"
MARKETS="data/markets-${DATE}.json"
LOG="/tmp/hatch-snapshot.log"

log() { echo "[$(date +'%F %T')] $*" | tee -a "$LOG"; }

# Foundry lives outside the minimal PATH launchd provides.
export PATH="$HOME/.foundry/bin:/opt/homebrew/bin:/usr/local/bin:$PATH"

command -v cast >/dev/null 2>&1 || { log "FATAL: cast not on PATH"; exit 1; }

# Some networks cert-block *.chain.robinhood.com, which turns every probe into a
# silent zero. Hand the probes a fallback endpoint; they prefer the public RPC
# and only use this if it does not answer. Never committed - read from .env.
ENV_FILE="$HOME/builder-track/.env"
if [ -z "${RHC_RPC:-}" ] && [ -f "$ENV_FILE" ]; then
  RHC_RPC="$(grep -E '^ALCHEMY_RHC_URL=' "$ENV_FILE" | cut -d= -f2- | tr -d '"'"'"'\'"'"' ')"
  export RHC_RPC
fi

log "snapshot start"

python3 probe/markets.py    > "$MARKETS" 2>>"$LOG"
python3 probe/exit_depth.py > "$POOL"    2>>"$LOG"
python3 probe/redemption.py > "$REDEEM"  2>>"$LOG"

# Validate before trusting any of them.
for f in "$MARKETS" "$POOL" "$REDEEM"; do
  if ! python3 -c "import json,sys; json.load(open('$f'))" 2>/dev/null; then
    log "FATAL: $f is not valid JSON - discarding this run"
    rm -f "$MARKETS" "$POOL" "$REDEEM"
    exit 1
  fi
done

# A snapshot with no markets in it is a failure wearing a success costume.
COUNT=$(python3 -c "import json; print(len(json.load(open('$POOL'))['markets']))" 2>/dev/null || echo 0)
if [ "$COUNT" -lt 1 ]; then
  log "FATAL: pool snapshot contains no markets - discarding this run"
  rm -f "$MARKETS" "$POOL" "$REDEEM"
  exit 1
fi

# Rebuild the public page from the snapshots just taken.
if ! python3 site/build.py >>"$LOG" 2>&1; then
  log "FATAL: site build failed - discarding this run"
  rm -f "$MARKETS" "$POOL" "$REDEEM"
  exit 1
fi

git add "$MARKETS" "$POOL" "$REDEEM" docs/index.html || exit 1
if git diff --cached --quiet; then
  log "no change since last snapshot - nothing to commit"
  exit 0
fi

BLOCK=$(python3 -c "import json; print(json.load(open('$POOL'))['block'])" 2>/dev/null || echo unknown)
git commit -q -m "Coverage snapshot ${DATE} (block ${BLOCK})" || { log "commit failed"; exit 1; }

# gh may be pointed at another account; borrow it and hand it back.
PREV="$(gh auth status 2>&1 | grep -B1 'Active account: true' | grep -o 'account [A-Za-z0-9_-]*' | awk '{print $2}' | head -1)"
# gh caches the login name from when the token was issued, so a GitHub
# username change leaves it pointing at the old one. Try both.
for candidate in hatch402 lastoutlabs lastoutxyz; do
  if gh auth switch --hostname github.com --user "$candidate" >/dev/null 2>&1; then
    log "gh account -> $candidate"
    break
  fi
done

if git push -q 2>>"$LOG"; then
  log "pushed snapshot for ${DATE} at block ${BLOCK}"
else
  log "push failed - commit is local, will go out with the next run"
fi

if [ -n "$PREV" ] && [ "$PREV" != "hatch402" ] && [ "$PREV" != "lastoutlabs" ] && [ "$PREV" != "lastoutxyz" ]; then
  gh auth switch --hostname github.com --user "$PREV" >/dev/null 2>&1
  log "restored gh account to ${PREV}"
fi

log "snapshot done"
