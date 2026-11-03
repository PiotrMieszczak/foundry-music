import { test } from "node:test";
import assert from "node:assert/strict";
import { parseUrl, positionAt, playState, pauseState, stepIndex, needsSeek } from "./lib.js";

const V = "dQw4w9WgXcQ";
const S = "37i9dQZF1DXcBWIGoYBM5M";

test("YouTube video links", () => {
  for (const url of [
    `https://www.youtube.com/watch?v=${V}`,
    `https://www.youtube.com/watch?v=${V}&list=PL123&index=2`,
    `https://youtu.be/${V}?t=30`,
    `https://music.youtube.com/watch?v=${V}`,
    `https://www.youtube.com/embed/${V}`,
    `https://youtube.com/shorts/${V}`,
  ]) assert.deepEqual(parseUrl(url), { source: "youtube", kind: "video", id: V }, url);
});

test("YouTube playlist link", () => {
  assert.deepEqual(parseUrl("https://www.youtube.com/playlist?list=PLx0sYbCqOb8TBPRdmBHs5Iftvv9TPboYG"), {
    source: "youtube", kind: "playlist", id: "PLx0sYbCqOb8TBPRdmBHs5Iftvv9TPboYG",
  });
});

test("Spotify links and URIs", () => {
  const want = { source: "spotify", kind: "playlist", id: S, uri: `spotify:playlist:${S}` };
  assert.deepEqual(parseUrl(`https://open.spotify.com/playlist/${S}?si=abc`), want);
  assert.deepEqual(parseUrl(`https://open.spotify.com/intl-pl/playlist/${S}`), want);
  assert.deepEqual(parseUrl(`spotify:playlist:${S}`), want);
  assert.equal(parseUrl(`https://open.spotify.com/album/${S}`).uri, `spotify:album:${S}`);
  assert.equal(parseUrl(`https://open.spotify.com/track/${S}`).kind, "track");
});

test("rejects what it cannot play", () => {
  for (const bad of ["", "hello", "https://example.com/watch?v=" + V, "https://youtu.be/short",
    "https://open.spotify.com/artist/" + S, "spotify:track:tooShort", null]) assert.equal(parseUrl(bad), null, bad);
});

test("position maths", () => {
  const s = playState(2, 10, 1_000);
  assert.equal(positionAt(s, 1_000), 10);
  assert.equal(positionAt(s, 31_000), 40);
  const p = pauseState(s, 21_000);
  assert.deepEqual([p.index, p.playing, p.offset], [2, false, 30]);
  assert.equal(positionAt(p, 99_000), 30); // paused: time stops
  assert.equal(positionAt(playState(0, 0, 5_000), 4_000), 0); // clock skew never goes negative
  assert.equal(positionAt(null, 1), 0);
});

test("step and seek", () => {
  assert.equal(stepIndex(2, 1, 3), 0);
  assert.equal(stepIndex(0, -1, 3), 2);
  assert.equal(stepIndex(5, 1, 0), 0);
  assert.equal(needsSeek(10, 11.5), false);
  assert.equal(needsSeek(10, 13), true);
});
