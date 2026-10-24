#!/bin/zsh -il
# Double-click to open WasteWise on phones on the same Wi-Fi (HTTPS, so the camera works).
cd "$(dirname "$0")"
# Stop this folder's previous WasteWise dev server (vinext allows one per folder).
OLD=$(node -e "try{const l=require('./.vinext/dev/lock.json');if(l.cwd===process.cwd())console.log(l.pid)}catch{}" 2>/dev/null)
[ -n "$OLD" ] && kill $OLD 2>/dev/null
PIDS=$(lsof -ti tcp:5187 2>/dev/null); [ -n "$PIDS" ] && kill $PIDS 2>/dev/null
sleep 3
IP=$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null)
if [ -z "$IP" ]; then echo "Could not find this Mac's Wi-Fi address. Turn Wi-Fi on, then try again."; read -k1 "?Press any key to close..."; exit 1; fi
mkdir -p .phone-cert
if [ ! -f .phone-cert/ip ] || [ "$(cat .phone-cert/ip)" != "$IP" ]; then
  openssl req -x509 -newkey rsa:2048 -nodes -days 365 -subj "/CN=WasteWise local" \
    -addext "subjectAltName=IP:$IP,IP:127.0.0.1,DNS:localhost" \
    -keyout .phone-cert/key.pem -out .phone-cert/cert.pem 2>/dev/null
  echo "$IP" > .phone-cert/ip
fi
echo ""
echo "======================================================="
echo " On your phone (same Wi-Fi) open:  https://$IP:5187"
echo " On this Mac:                      https://localhost:5187"
echo " Tap 'Advanced' / 'Show Details', then 'Proceed' / 'visit this website'."
echo " Keep this window open while you use the app."
echo "======================================================="
echo ""
PHONE_HTTPS_CERT=.phone-cert/cert.pem PHONE_HTTPS_KEY=.phone-cert/key.pem npm run dev -- --port 5187
