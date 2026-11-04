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

/** Same track, new position (seconds); keeps playing or paused as it was. */
export function seekState(state, seconds, now) {
  const offset = Math.max(0, seconds);
  return { ...state, offset, startedAt: now, ts: now };
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

/* ---------- playlists ---------- */

export const EMPTY_STATE = Object.freeze({ playlists: [], active: null, index: 0, playing: false, offset: 0, startedAt: 0, ts: 0 });

/** Fill missing fields, and turn the 0.1.0 single list (`state.tracks`) into one playlist. */
export function normalize(state) {
  if (!state || typeof state !== "object") return { ...EMPTY_STATE };
  const { tracks, ...rest } = state;
  if (Array.isArray(tracks) && !Array.isArray(state.playlists)) {
    return { ...EMPTY_STATE, ...rest, playlists: [{ id: "playlist", name: "Playlist", tracks }], active: tracks.length ? "playlist" : null };
  }
  return { ...EMPTY_STATE, ...rest };
}

export function findPlaylist(state, id) {
  return state.playlists.find((p) => p.id === id);
}

export function currentTrack(state) {
  return findPlaylist(state, state.active)?.tracks[state.index];
}

/** Edits a player may make when the GM allows it; everything else is GM-only. */
export const PLAYER_EDITS = ["create", "add"];

const clean = (text, max) => String(text ?? "").trim().slice(0, max);

/**
 * Apply one playlist edit and return the new state. Throws an Error with a
 * user-readable message when the edit is invalid. Edits:
 *   {type: "create", id, name} · {type: "rename", id, name} · {type: "delete", id}
 *   {type: "add", playlistId, url, title} · {type: "remove", playlistId, index}
 */
export function applyEdit(state, edit, now) {
  const s = normalize(state);
  const name = clean(edit.name, 60);
  const list = findPlaylist(s, edit.playlistId ?? edit.id);
  const replace = (p) => s.playlists.map((q) => (q.id === p.id ? p : q));

  switch (edit.type) {
    case "create":
      if (!name) throw new Error("A playlist needs a name.");
      if (list) throw new Error("That playlist already exists.");
      return { ...s, playlists: [...s.playlists, { id: String(edit.id), name, tracks: [] }] };
    case "rename":
      if (!list) throw new Error("No such playlist.");
      if (!name) throw new Error("A playlist needs a name.");
      return { ...s, playlists: replace({ ...list, name }) };
    case "delete":
      if (!list) throw new Error("No such playlist.");
      return {
        ...s,
        playlists: s.playlists.filter((p) => p !== list),
        ...(s.active === list.id && { active: null, index: 0, playing: false, offset: 0, ts: now }),
      };
    case "add": {
      if (!list) throw new Error("No such playlist.");
      const track = parseUrl(edit.url); // re-parsed here: never trust a track object sent by a client
      if (!track) throw new Error("That isn't a YouTube or Spotify link I can play.");
      track.title = clean(edit.title, 200) || `${track.kind} ${track.id}`;
      return { ...s, playlists: replace({ ...list, tracks: [...list.tracks, track] }) };
    }
    case "remove": {
      const i = edit.index;
      if (!list || !Number.isInteger(i) || !list.tracks[i]) throw new Error("No such track.");
      const tracks = list.tracks.filter((_, j) => j !== i);
      const next = { ...s, playlists: replace({ ...list, tracks }) };
      if (s.active !== list.id || i > s.index) return next;
      if (i < s.index) return { ...next, index: s.index - 1 };
      // Removed the playing track: stop on whatever slid into its place.
      return { ...next, index: Math.min(i, Math.max(0, tracks.length - 1)), playing: false, offset: 0, ts: now };
    }
    default:
      throw new Error(`Unknown edit "${edit.type}".`);
  }
}
