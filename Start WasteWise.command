#!/bin/zsh -il
# Double-click to run this WasteWise copy at http://localhost:5187
cd "$(dirname "$0")"
# Stop this folder's previous WasteWise dev server (vinext allows one per folder).
OLD=$(node -e "try{const l=require('./.vinext/dev/lock.json');if(l.cwd===process.cwd())console.log(l.pid)}catch{}" 2>/dev/null)
[ -n "$OLD" ] && kill $OLD 2>/dev/null
PIDS=$(lsof -ti tcp:5187 2>/dev/null); [ -n "$PIDS" ] && kill $PIDS 2>/dev/null
sleep 3
(sleep 6 && open "http://localhost:5187") &
echo "WasteWise: http://localhost:5187 — keep this window open while you use it."
PUBLIC_TUNNEL=1 npm run dev -- --port 5187
