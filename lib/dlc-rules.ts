import { BINS } from "./wastewise.ts";

// Decision rules for the bin station (DLC): does a detected item belong in this bin?
export type Detected = { category?: string; label?: string; dustbin?: string; score?: number; uncertain?: boolean; isNonWaste?: boolean; id?: number; rawClass?: string };
export type Verdict = { kind: "accept" | "reject" | "check"; item: string; message: string };

/** Maps the detector's category names onto the backend's five bins. */
export function binKeyFor(category = ""): string | null {
  const c = category.toLowerCase();
  if (/wet|biodegrad/.test(c)) return "wet";
  if (/dry|recycl/.test(c)) return "dry";
  if (/hazard|e-waste|special/.test(c)) return "special";
  if (/glass/.test(c)) return "glass";
  if (/general/.test(c)) return "general";
  return null;
}

export function decide(binKey: string, item: Detected): Verdict {
  const name = (item.label || "Item").replace(/^Possible /, "");
  const key = binKeyFor(item.category);
  if (!key) return { kind: "check", item: name, message: "Not sure what this is. Check the label on the bin or ask a staff member." };
  if (key === binKey) return { kind: "accept", item: name, message: "Correct bin. Thank you!" };
  const right = BINS.find((b) => b.id === key);
  return { kind: "reject", item: name, message: `This is ${right?.title.toLowerCase() || "different waste"}. Use the ${right?.destination.toLowerCase() || "correct bin"}.` };
}

