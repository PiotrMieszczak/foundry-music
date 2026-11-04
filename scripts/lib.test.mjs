import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parseUrl, positionAt, playState, pauseState, stepIndex, needsSeek,
  normalize, currentTrack, applyEdit, EMPTY_STATE, seekState,
} from "./lib.js";

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

test("seeking moves the shared position", () => {
  const playing = seekState(playState(1, 10, 0), 95, 50_000);
  assert.equal(positionAt(playing, 50_000), 95);
  assert.equal(positionAt(playing, 60_000), 105);
  const paused = seekState(pauseState(playState(1, 10, 0), 5_000), 30, 9_000);
  assert.equal(positionAt(paused, 99_000), 30);
  assert.equal(seekState(paused, -4, 0).offset, 0);
});

test("step and seek", () => {
  assert.equal(stepIndex(2, 1, 3), 0);
  assert.equal(stepIndex(0, -1, 3), 2);
  assert.equal(stepIndex(5, 1, 0), 0);
  assert.equal(needsSeek(10, 11.5), false);
  assert.equal(needsSeek(10, 13), true);
});

test("0.1.0 state becomes one playlist", () => {
  const old = { tracks: [{ source: "youtube", kind: "video", id: V, title: "x" }], index: 0, playing: true, offset: 0, startedAt: 1, ts: 1 };
  const s = normalize(old);
  assert.equal(s.playlists.length, 1);
  assert.equal(s.active, "playlist");
  assert.equal(s.tracks, undefined);
  assert.equal(currentTrack(s).id, V);
  assert.deepEqual(normalize(undefined), { ...EMPTY_STATE });
});

test("playlist edits", () => {
  let s = applyEdit(EMPTY_STATE, { type: "create", id: "t", name: "  Tavern " }, 0);
  assert.equal(s.playlists[0].name, "Tavern");
  assert.throws(() => applyEdit(s, { type: "create", id: "t", name: "Again" }, 0), /exists/);
  assert.throws(() => applyEdit(s, { type: "create", id: "u", name: "  " }, 0), /name/);
  s = applyEdit(s, { type: "add", playlistId: "t", url: `https://youtu.be/${V}`, title: "Lute" }, 0);
  s = applyEdit(s, { type: "add", playlistId: "t", url: `spotify:album:${S}`, title: "" }, 0);
  assert.deepEqual(s.playlists[0].tracks.map((t) => t.title), ["Lute", `album ${S}`]);
  assert.throws(() => applyEdit(s, { type: "add", playlistId: "t", url: "https://evil.example" }, 0), /YouTube or Spotify/);
  assert.throws(() => applyEdit(s, { type: "add", playlistId: "nope", url: `https://youtu.be/${V}` }, 0), /No such playlist/);
  s = applyEdit(s, { type: "rename", id: "t", name: "Inn" }, 0);
  assert.equal(s.playlists[0].name, "Inn");
});

test("removing tracks keeps the playing one", () => {
  let s = applyEdit(EMPTY_STATE, { type: "create", id: "t", name: "T" }, 0);
  for (const id of ["aaaaaaaaaaa", "bbbbbbbbbbb", "ccccccccccc"]) s = applyEdit(s, { type: "add", playlistId: "t", url: `https://youtu.be/${id}` }, 0);
  s = { ...s, active: "t", index: 2, playing: true };
  const before = applyEdit(s, { type: "remove", playlistId: "t", index: 0 }, 5);
  assert.equal(currentTrack(before).id, "ccccccccccc");
  const same = applyEdit(s, { type: "remove", playlistId: "t", index: 2 }, 5);
  assert.deepEqual([same.index, same.playing], [1, false]);
  assert.throws(() => applyEdit(s, { type: "remove", playlistId: "t", index: 9 }, 0), /No such track/);
});

test("deleting the active playlist stops playback", () => {
  let s = applyEdit(EMPTY_STATE, { type: "create", id: "t", name: "T" }, 0);
  s = { ...s, active: "t", playing: true };
  s = applyEdit(s, { type: "delete", id: "t" }, 9);
  assert.deepEqual([s.playlists.length, s.active, s.playing], [0, null, false]);
});
