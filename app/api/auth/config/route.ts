import { env } from "cloudflare:workers";

// Firebase web config is public by design (it identifies the project; it is not a secret).
// It is served at runtime so the same build works with any Firebase project.
type FirebaseEnv = {
  WASTEWISE_FIREBASE_API_KEY?: string;
  WASTEWISE_FIREBASE_AUTH_DOMAIN?: string;
  WASTEWISE_FIREBASE_PROJECT_ID?: string;
  WASTEWISE_FIREBASE_APP_ID?: string;
};

export async function GET() {
  const e = env as FirebaseEnv;
  const configured = !!(e.WASTEWISE_FIREBASE_API_KEY && e.WASTEWISE_FIREBASE_AUTH_DOMAIN && e.WASTEWISE_FIREBASE_PROJECT_ID);
  return Response.json(
    configured
      ? {
          configured: true,
          apiKey: e.WASTEWISE_FIREBASE_API_KEY,
          authDomain: e.WASTEWISE_FIREBASE_AUTH_DOMAIN,
          projectId: e.WASTEWISE_FIREBASE_PROJECT_ID,
          appId: e.WASTEWISE_FIREBASE_APP_ID || undefined,
        }
      : { configured: false },
    { headers: { "Cache-Control": "no-store" } },
  );
}
