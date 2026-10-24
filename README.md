# WasteWise

A responsive waste-sorting frontend inspired by your supplied image: periwinkle panels, rounded cards, lilac and orange accents, animated bins and AI orb, and a floating bottom navigation.

## Start locally

Requires Node.js 22.13+ and npm. Node 26 was used for verification.

```sh
npm ci
# A blank .env is already present in this delivered folder.
# If missing, copy .env.example to .env.
npm run dev -- --port 5186
```

Open http://localhost:5186. Use HTTPS or localhost for camera access. Restart the dev server after editing `.env`.

## Environment configuration

```dotenv
WASTEWISE_API_BASE_URL=https://harness-action-entail.ngrok-free.dev
WASTEWISE_API_KEY=
WASTEWISE_API_KEY_HEADER=
WASTEWISE_API_KEY_PREFIX=
```

The API key is deliberately blank, as requested. No authentication requirement was supplied, and the live backend currently accepts the documented requests without a caller key. If your backend later requires one, fill in its key and **confirmed header name**. For example, only if your backend documents Bearer authentication, use `WASTEWISE_API_KEY_HEADER=Authorization` and `WASTEWISE_API_KEY_PREFIX="Bearer "` (quote the trailing space). For a plain custom key header, leave the prefix blank.

Never use `NEXT_PUBLIC_` or `VITE_` prefixes for API secrets. The browser calls `/api/wastewise/*`; the server proxy adds credentials and the required Content-Type, ngrok-skip-browser-warning, and x-api-client headers. `.env` is git-ignored. `.env.example` contains key names only.

For deployment, configure the same values as **server runtime environment variables** in the host. Local `.env` changes do not automatically update an already deployed site. The backend URL defaults to the supplied live tunnel. Set it to `http://localhost:4173` only when running the backend on the same local computer; a deployed server cannot use your laptop's localhost.

**Provider access is separate:** this frontend key authenticates to your WasteWise backend if required. A Gemini/Apinex provider key belongs in the backend's own configuration. Adding a frontend-proxy key does not restore exhausted provider credits.

## Current live backend verification

Checked 24 October 2026 (Asia/Kolkata):

- `/api/config`: HTTP 200, provider `apinex`, configured `true`.
- `/api/classify`: working; verified banana peel and pizza-box responses.
- `/api/rules`: working; 8 rules from Greenfield Campus.
- `/api/catalog`: working; 141 items; bottle search returned 12 items.
- `/api/analyze`: HTTP 502. The upstream provider reported HTTP 402 and exhausted free tokens. Text analysis and real photo analysis were checked. Successful real AI detection cannot be verified until backend provider access is restored.

The interface displays this failure honestly, with retry controls. There are no fabricated analysis results, offline guesses, fake statistics, or mock responses in the shipped app.

## Implemented flows

- Instant text sorting with a 200 ms debounce and canceled stale requests.
- Photo selection and drag-and-drop for JPG, PNG, WEBP, up to 8 MB. Images are resized to a maximum 1600-pixel edge before upload.
- Live camera frames, sequential requests with a 1.5-second delay after each response. Normalized `[ymin, xmin, ymax, xmax]` boxes are rendered on a correctly sized canvas.
- Camera tracks and requests stop on panel close, Stop, component cleanup, and tab hiding. No audio permission.
- AI description input with real `/api/analyze` integration.
- Five strict bin colors and backend rule quotations. Unknown detections remain unclassified; uncertain detections are labeled.
- Clean/dry vs. greasy pizza-box confirmation using R2 and R7.
- Campus guide, category filters, catalog search, and load-more pagination.
- Up to 30 saved text results in browser localStorage; no photos are saved.
- Bottom navigation hides when scrolling down the page and returns when scrolling up. Keyboard focus keeps navigation accessible.
- Responsive layouts, modal focus trapping/Escape dismissal, reduced-motion support, error/loading/empty states.

## Main files

- `app/page.tsx` — dashboard, guide, history, assistant, photo/camera panels.
- `app/globals.css` — design, responsive breakpoints, animations.
- `lib/wastewise.ts` — typed client, bin mapping, result normalization.
- `lib/wastewise-proxy.ts` — server-only forwarding, validation, timeouts, safe error responses.
- `app/api/wastewise/[endpoint]/route.ts` — API route adapter.
- `tests/backend.test.mjs` — 10 tests for API forwarding, authentication isolation, errors, and bin mapping.
- `QA.md` — verification evidence and boundaries.

## Checks and production build

```sh
npm run typecheck
npm test
npm run build
npm start -- --port 5187
```

This project uses React/TypeScript with the provided Vinext + Cloudflare Workers starter. Keep its `sites()` build integration for Sites hosting. A static-only host cannot run the server proxy. A configured host is required for private server credentials.

## Login (Firebase Authentication)

The whole app sits behind a Firebase login: email/password (sign in, create account, password reset) and Google. The account button in the top-right corner shows who is signed in and signs out.

The browser sends the user's Firebase ID token with every `/api/wastewise/*` request. When `WASTEWISE_FIREBASE_PROJECT_ID` is set, the server proxy verifies that token's signature against Google's public keys (`lib/firebase-auth-server.ts`) and answers 401 without it, so the backend can't be used without signing in.

Setup:

1. Create a project at https://console.firebase.google.com, then **Add app → Web** and copy its config.
2. **Authentication → Sign-in method:** enable **Email/Password** and **Google**.
3. **Authentication → Settings → Authorized domains:** `localhost` is there by default. Add any other address you open the app from (a deployed domain or a tunnel domain). A raw IP such as `10.24.18.89` cannot be authorized for Google sign-in.
4. Fill these in `.env` (and as runtime variables on your host), then restart:

```dotenv
WASTEWISE_FIREBASE_API_KEY=...
WASTEWISE_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
WASTEWISE_FIREBASE_PROJECT_ID=your-project
WASTEWISE_FIREBASE_APP_ID=...
```

These are public identifiers, not secrets. Until they are set the app shows a "Login is not set up yet" screen. Files: `components/auth-gate.tsx`, `lib/firebase-client.ts`, `lib/firebase-auth-server.ts`, `app/api/auth/config/route.ts`.

## Live camera speed (on-device detector)

Live boxes come from an on-device detector that runs in the browser (TensorFlow.js with the MIT-licensed Trash-AI litter model and the Apache-2.0 COCO-SSD model, from the original google-hackathon project). It draws and tracks boxes at display rate and re-detects several times a second, with no network round trip. Files: `public/live-detector.js` and its helpers; models are served from pinned public sources by `app/vision/[...path]/route.ts` (about 46 MB on first use, then cached). Camera images are never sent there.

The backend's Gemini analysis (`POST /api/analyze`, `mode: "live-frame"`) still runs in the background for the exact item, bin and rule. It answers in roughly 3.5–6 s, and requests start at most every 5 s to stay within the backend's rate limit (about 12 per minute). A `429` is treated as "wait and retry", not an error. Gemini's boxes are merged into the live tracker and moved to where each object is now.

## Bin station (DLC)

The header button (bin icon) opens **Bin station**: a device at a bin that checks each item before it's dropped in. Pick the bin it sits on (from `GET /api/dlc/bins`, public), press **Start station**, and hold each item in front of the camera. The same on-device detector as the live scanner recognises it; after about half a second steady the station shows **Accepted** (green, high beep) or **Wrong bin** with where it should go (red, low beep), then resets after 2.2 s. Each item is judged once until it leaves the view. Rules: `lib/dlc-rules.ts`; screen: `components/dlc-station.tsx`.

Deposits are not reported to the backend from this screen: confirming deposits needs the backend's station key, which is not shared with the frontend.

## Account history (Eco Tracker backend)

History and rewards belong to the signed-in Firebase user. The server (`/api/wastewise/*`) verifies the Firebase ID token, then looks up that user's own backend member token in the D1 table `member_accounts`. The first time a user is seen, the server creates their member once with `POST /api/rewards/accounts` (admin key, server-side only) and stores the token. Every later login reuses it. There is no shared token fallback.

Required server settings (never in browser code or Git):

- `WASTEWISE_REWARDS_ADMIN_KEY`: admin key from the backend owner (`.env` locally, a secret on the host).
- D1 binding `DB` (`.openai/hosting.json` has `"d1": "DB"`).
- `WASTEWISE_FIREBASE_*` as before.

Results from photo, text, live scans and the assistant save automatically with a stable ID, so retries and corrections update the same entry. Unsent saves wait in a per-user queue and are sent only when that same user signs in again. Logging out clears history and rewards from the screen and does not delete anything on the backend. Old browser-only history is imported only when the user presses **Import** in History.
