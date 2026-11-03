// Pure helpers: no Foundry, no DOM. Tested by lib.test.mjs with `node --test`.

const YT_ID = /^[\w-]{11}$/;
const SPOTIFY_ID = /^[A-Za-z0-9]{22}$/;
const SPOTIFY_KINDS = ["track", "album", "playlist", "episode"];

/**
 * Turn a pasted link into a track, or null if it is not one we can play.
 * YouTube: {source: "youtube", kind: "video"|"playlist", id}
 * Spotify: {source: "spotify", kind, id, uri}
 */
export function parseUrl(input) {
  const text = String(input ?? "").trim();

  const uri = text.match(/^spotify:(track|album|playlist|episode):([A-Za-z0-9]{22})$/);
  if (uri) return spotify(uri[1], uri[2]);

  let url;
  try {
    url = new URL(text);
  } catch {
    return null;
  }
  const host = url.hostname.replace(/^(www|m|music)\./, "");
  const parts = url.pathname.split("/").filter(Boolean);

  if (host === "youtu.be") return youtubeVideo(parts[0]);
  if (host === "youtube.com" || host === "youtube-nocookie.com") {
    const v = url.searchParams.get("v");
    if (parts[0] === "watch" && v) return youtubeVideo(v);
    if (["embed", "shorts", "live"].includes(parts[0])) return youtubeVideo(parts[1]);
    const list = url.searchParams.get("list");
    if (parts[0] === "playlist" && list) return { source: "youtube", kind: "playlist", id: list };
    return null;
  }

  if (host === "open.spotify.com") {
    if (parts[0]?.startsWith("intl-")) parts.shift();
    if (parts[0] === "embed") parts.shift();
    if (SPOTIFY_KINDS.includes(parts[0]) && SPOTIFY_ID.test(parts[1] ?? "")) return spotify(parts[0], parts[1]);
  }
  return null;
}

function youtubeVideo(id) {
  return YT_ID.test(id ?? "") ? { source: "youtube", kind: "video", id } : null;
}

function spotify(kind, id) {
  return { source: "spotify", kind, id, uri: `spotify:${kind}:${id}` };
}

/** Seconds into the current track at time `now` (ms). */
export function positionAt(state, now) {
  const offset = state?.offset ?? 0;
  if (!state?.playing) return offset;
  return Math.max(0, offset + (now - state.startedAt) / 1000);
}

/** State for "play track `index` from `offset` seconds, starting now". */
export function playState(index, offset, now) {
  return { index, playing: true, offset, startedAt: now, ts: now };
}

/** State for "pause where we are now". */
export function pauseState(state, now) {
  return { ...state, playing: false, offset: positionAt(state, now), startedAt: now, ts: now };
}

/** Next (step 1) or previous (step -1) index, wrapping around the list. */
export function stepIndex(index, step, length) {
  if (length <= 0) return 0;
  return (((index + step) % length) + length) % length;
}

/** True when a player is far enough off the shared position to be worth a seek. */
export function needsSeek(actual, expected, tolerance = 2) {
  return Math.abs(actual - expected) > tolerance;
}
