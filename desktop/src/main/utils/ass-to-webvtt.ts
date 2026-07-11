/** True when the URL looks like an Advanced SubStation Alpha subtitle file. */
export function isAssSubtitleUrl(url: string): boolean {
  try {
    return /\.(ass|ssa)(?:$|\?)/i.test(new URL(url).pathname);
  } catch {
    return /\.(ass|ssa)(?:$|[?#])/i.test(url);
  }
}

/**
 * Best-effort ASS/SSA → WebVTT for native HTML5 text tracks.
 * Keeps dialogue timing/text; drops styling, positioning, and effects.
 */
export function convertAssToWebVtt(ass: string): string {
  const lines = ["WEBVTT", ""];
  let index = 0;

  for (const raw of ass.split(/\r?\n/)) {
    const line = raw.trim();
    if (!/^dialogue:/i.test(line)) continue;

    // Dialogue: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
    const body = line.replace(/^dialogue:\s*/i, "");
    const parts = body.split(",");
    if (parts.length < 10) continue;

    const start = assTimeToVtt(parts[1] ?? "");
    const end = assTimeToVtt(parts[2] ?? "");
    if (!start || !end) continue;

    let text = parts.slice(9).join(",");
    text = text
      .replace(/\{[^}]*\}/g, "")
      .replace(/\\N/gi, "\n")
      .replace(/\\n/gi, "\n")
      .replace(/\\h/gi, " ")
      .trim();
    if (!text) continue;

    index += 1;
    lines.push(String(index));
    lines.push(`${start} --> ${end}`);
    lines.push(text);
    lines.push("");
  }

  return lines.join("\n");
}

/** ASS `H:MM:SS.cs` (centiseconds) → WebVTT `HH:MM:SS.mmm`. */
function assTimeToVtt(value: string): string | null {
  const match = /^(\d+):(\d{2}):(\d{2})[.:](\d{1,3})$/.exec(value.trim());
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  const seconds = Number(match[3]);
  let frac = match[4] ?? "0";
  // ASS uses centiseconds (2 digits); WebVTT wants milliseconds.
  if (frac.length === 1) frac = `${frac}00`;
  else if (frac.length === 2) frac = `${frac}0`;
  else if (frac.length > 3) frac = frac.slice(0, 3);
  if (![hours, minutes, seconds].every((n) => Number.isFinite(n))) return null;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}.${frac}`;
}
