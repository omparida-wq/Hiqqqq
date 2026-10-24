// Serves the on-device detector's files (TensorFlow.js + two pre-trained models) from pinned
// public sources, exactly as the original google-hackathon server did. Camera images are never
// sent here: these are only model downloads (about 46 MB on first use, then browser-cached).
// Licences: licenses/trash-ai-MIT.txt, licenses/tensorflow-models-Apache-2.0.txt
const LITTER_FILES = ["model.json", "name_map.json", ...Array.from({ length: 7 }, (_, i) => `group1-shard${i + 1}of7.bin`)];
const HOUSEHOLD_FILES = ["model.json", ...Array.from({ length: 5 }, (_, i) => `group1-shard${i + 1}of5`)];

function upstream(path: string): string | null {
  if (path === "tf.min.js") return "https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@4.22.0/dist/tf.min.js";
  if (path === "coco-ssd.min.js") return "https://cdn.jsdelivr.net/npm/@tensorflow-models/coco-ssd@2.2.3/dist/coco-ssd.min.js";
  const [dir, file, ...rest] = path.split("/");
  if (rest.length || !file) return null;
  if (dir === "household" && HOUSEHOLD_FILES.includes(file))
    return `https://storage.googleapis.com/tfjs-models/savedmodel/ssdlite_mobilenet_v2/${file}`;
  if (dir === "model" && LITTER_FILES.includes(file))
    return `https://raw.githubusercontent.com/opensacorg/trash-ai/a11de7cb60bfb21399f64c57e48384a61a5044f7/frontend/public/model/${file}`;
  return null;
}

export async function GET(_request: Request, context: { params: Promise<{ path: string[] }> }) {
  const path = ((await context.params).path || []).join("/");
  const url = upstream(path);
  if (!url) return new Response("Not found", { status: 404 });
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(45_000) });
    if (!res.ok) return new Response("Detector asset unavailable", { status: 502 });
    return new Response(res.body, {
      headers: {
        "Content-Type": path.endsWith(".js") ? "text/javascript" : path.endsWith(".json") ? "application/json" : "application/octet-stream",
        "Cache-Control": "public, max-age=86400",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return new Response("Detector download failed", { status: 502 });
  }
}
