#!/bin/zsh -il
# Double-click to open WasteWise from any phone or network through a public tunnel.
# Uses ngrok if it is installed and signed in, otherwise a free Cloudflare quick tunnel.
# Anyone with the printed link can open the app (they still need to sign in).
cd "$(dirname "$0")"
OLD=$(node -e "try{const l=require('./.vinext/dev/lock.json');if(l.cwd===process.cwd())console.log(l.pid)}catch{}" 2>/dev/null)
[ -n "$OLD" ] && kill $OLD 2>/dev/null
PIDS=$(lsof -ti tcp:5187 2>/dev/null); [ -n "$PIDS" ] && kill $PIDS 2>/dev/null
sleep 3
PUBLIC_TUNNEL=1 npm run dev -- --port 5187 > .public-dev.log 2>&1 &
APP=$!
trap 'kill $APP 2>/dev/null' EXIT INT TERM
echo "Starting WasteWise…"; sleep 12
rm -f .public-url
show() { echo "$1" > .public-url; echo ""; echo "======================================================="; echo " Open on any phone or computer:  $1"; echo " Keep this window open while people use the app."; echo "======================================================="; echo ""; }
if command -v ngrok >/dev/null 2>&1 && ngrok config check >/dev/null 2>&1; then
  ngrok http 5187 --log stdout --log-format logfmt | while IFS= read -r line; do
    url=$(echo "$line" | grep -oE 'url=https://[^ ]+' | head -1 | cut -d= -f2)
    [ -n "$url" ] && [ ! -f .public-url ] && show "$url"
  done
else
  CF=$(command -v cloudflared || ls /opt/homebrew/bin/cloudflared /usr/local/bin/cloudflared 2>/dev/null | head -1)
  if [ -z "$CF" ]; then echo "Neither ngrok nor cloudflared is installed. Run: brew install ngrok   (or)   brew install cloudflared"; read -k1 "?Press any key to close..."; exit 1; fi
  echo "ngrok is not set up on this Mac, so using a free Cloudflare tunnel."
  echo "{}" > .cloudflared-quick.yml
  "$CF" tunnel --config .cloudflared-quick.yml --no-autoupdate --url http://127.0.0.1:5187 2>&1 | while IFS= read -r line; do
    url=$(echo "$line" | grep -oE 'https://[a-z0-9-]+\.trycloudflare\.com' | head -1)
    [ -n "$url" ] && [ ! -f .public-url ] && show "$url"
  done
fi
