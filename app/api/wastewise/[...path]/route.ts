import { env } from "cloudflare:workers";
import { proxyRequest, type BackendEnv } from "../../../../lib/wastewise-proxy";

// /api/wastewise/<endpoint>, including nested paths such as rewards/me and dlc/sessions/<id>.
export async function GET(
  request: Request,
  context: { params: Promise<{ path: string[] }> },
) {
  const { path } = await context.params;
  return proxyRequest(request, (path || []).join("/"), env as BackendEnv);
}
export const POST = GET;
