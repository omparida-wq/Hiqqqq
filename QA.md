# Verification — 24 October 2026

## Automated

- TypeScript strict no-emit check passed.
- Production build passed.
- 10 Node tests passed: documented headers/body forwarding, configured auth header, missing auth header, rejected unsupported paths/methods/payloads, catalog parameter filtering, honest quota errors, HTML/offline errors, all eight rule-to-bin mappings, unknown/uncertain items, and live-frame payload preservation.

## Live browser / backend

- Desktop 1440 × 1000: dashboard inspected visually.
- Mobile 390 × 844: layout inspected; no horizontal overflow (`scrollWidth === clientWidth === 390`).
- Banana-peel search returned the live backend's green-bin result and R5 quotation.
- Clean pizza-box selection showed blue recycling/R2; greasy selection showed general waste/R7.
- Catalog showed 141 supported items and returned 12 bottle matches.
- Saved banana-peel result survived browser reload.
- Scrolling down applied `nav-hidden`; scrolling up removed it. Both states inspected visually.
- Valid PNG upload produced a preview and enabled analysis. Invalid image produced a recoverable error.
- Real photo request showed the live provider's exhausted-quota error, never an invented result.
- Modal close returned to the dashboard.

## Simulated camera (clearly separated from live AI verification)

A temporary, tab-local synthetic canvas stream and API fixture were used to avoid recording the user's camera while the AI service is unavailable. No fixture code is included in production.

- A 640 × 480 stream produced a 640 × 480 overlay.
- Normalized bounding box `[200, 250, 700, 750]` rendered its left edge at x=160. Sampled border pixel was `[34, 197, 94, 255]`, the exact green-bin color #22c55e.
- Returned item and R5 rule rendered in the results panel.
- Closing the dialog changed the video track state from `live` to `ended` and removed the dialog.
- Reload removed all temporary mocks.

## Verification boundaries

The real `/api/analyze` service is blocked by the upstream provider's exhausted token allowance (backend HTTP 502, provider HTTP 402). Real photo recognition, real-camera accuracy, and successful live AI results remain unverified. Provider `configured: true` is not evidence of available quota. Actual camera hardware/permission behavior also depends on the browser/device.

No claim of universal, zero-error operation is made. Recoverable backend, network, malformed-input, and storage failures have explicit UI handling.
