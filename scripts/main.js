import { parseUrl, positionAt, playState, pauseState, stepIndex, needsSeek } from "./lib.js";

const MOD = "foundry-music";
const EMPTY = { tracks: [], index: 0, playing: false, offset: 0, startedAt: 0, ts: 0 };
const get = (key) => game.settings.get(MOD, key);
// Server time so every client computes the same position despite local clock drift.
const now = () => game.time?.serverTime ?? Date.now();
// With several GMs online, only one reacts to "track ended" / "can't embed", so tracks aren't skipped twice.
const isLead = () => game.user.isGM && game.users.activeGM?.isSelf;

/* ---------- shared state: one world setting, written by the GM only ---------- */

Hooks.once("init", () => {
  game.settings.register(MOD, "state", {
    scope: "world", config: false, type: Object, default: EMPTY, onChange: refresh,
  });
  game.settings.register(MOD, "volume", {
    name: "Music volume", hint: "Your own volume for YouTube tracks.",
    scope: "client", config: true, type: Number, range: { min: 0, max: 100, step: 5 }, default: 60,
    onChange: refresh,
  });
  game.settings.register(MOD, "muted", { scope: "client", config: false, type: Boolean, default: false, onChange: refresh });
});

Hooks.once("ready", () => {
  game.modules.get(MOD).api = { open: openConsole };
  buildBar();
  // Browsers block sound until the page has been clicked; any click counts as joining.
  document.addEventListener("pointerdown", join, { once: true, capture: true });
  refresh();
});

Hooks.on("getSceneControlButtons", (controls) => {
  const sounds = controls.sounds;
  if (!game.user.isGM || !sounds?.tools) return;
  sounds.tools.foundryMusic = {
    name: "foundryMusic", title: "Synced Music", icon: "fas fa-compact-disc",
    order: Object.keys(sounds.tools).length, button: true, visible: true, onChange: openConsole,
  };
});

function setState(patch) {
  return game.settings.set(MOD, "state", { ...get("state"), ...patch });
}

function playAt(index, offset = 0) {
  return setState(playState(index, offset, now()));
}

function toggle() {
  const s = get("state");
  if (s.playing) return setState(pauseState(s, now()));
  return playAt(Math.min(s.index, s.tracks.length - 1), s.offset ?? 0);
}

function skip(step) {
  const s = get("state");
  return playAt(stepIndex(s.index, step, s.tracks.length));
}

async function add(input) {
  const url = input.value.trim();
  const track = parseUrl(url);
  if (!track) return ui.notifications.warn("Synced Music: that isn't a YouTube or Spotify link I can play.");
  input.value = "";
  track.title = await titleFor(url, track);
  return setState({ tracks: [...get("state").tracks, track] });
}

function remove(i) {
  const s = get("state");
  const tracks = s.tracks.filter((_, j) => j !== i);
  if (i < s.index) return setState({ tracks, index: s.index - 1 });
  if (i > s.index) return setState({ tracks });
  // Removed the current track: stop on whatever slid into its place.
  return setState({ tracks, index: Math.min(i, Math.max(0, tracks.length - 1)), playing: false, offset: 0, ts: now() });
}

async function titleFor(url, track) {
  const oembed = track.source === "youtube" ? "https://www.youtube.com/oembed?format=json&url=" : "https://open.spotify.com/oembed?url=";
  try {
    const res = await fetch(oembed + encodeURIComponent(url));
    if (res.ok) return (await res.json()).title;
  } catch { /* offline or blocked: fall back to the id */ }
  return `${track.kind} ${track.id}`;
}

/* ---------- local playback: every browser plays the embeds itself ---------- */

let joined = false;
let loaded = null; // "index:id" of the track this browser has loaded
let yt, ytPromise, spotify, spotifyPromise;
let errors = 0;

function join() {
  if (joined) return;
  joined = true;
  refresh();
}

function refresh() {
  if (!game.ready) return;
  updateBar();
  consoleApp?.rendered && consoleApp.render();
  applyState();
}

async function applyState() {
  if (!joined) return;
  const state = get("state");
  const track = state.tracks[state.index];
  const muted = get("muted");
  const pos = positionAt(state, now());
  const key = track && `${state.index}:${track.id}`;

  if (track?.source !== "youtube") yt?.pauseVideo?.();
  if (track?.source !== "spotify") spotify?.pause();
  if (!track) return;

  if (track.source === "youtube") {
    const p = await youtube();
    if (loaded !== key) {
      loaded = key;
      // shortcut: a YouTube playlist entry syncs only its start; the embed walks the list on its own.
      if (track.kind === "playlist") p.loadPlaylist({ list: track.id, listType: "playlist", index: 0, startSeconds: pos });
      else p.loadVideoById({ videoId: track.id, startSeconds: pos });
    } else if (track.kind === "video" && needsSeek(p.getCurrentTime(), pos)) {
      p.seekTo(pos, true);
    }
    // Muting keeps the video running, so the GM's player still sees "ended" and advances the list.
    muted ? p.mute() : p.unMute();
    p.setVolume(get("volume"));
    state.playing ? p.playVideo() : p.pauseVideo();
    return;
  }

  // Spotify: the embed has no volume API, so "mute" pauses it in this browser only.
  const play = state.playing && !muted;
  if (!spotify) {
    loaded = key;
    await spotifyController(track.uri); // its "ready" listener starts playback
  } else if (loaded !== key) {
    loaded = key;
    spotify.loadUri(track.uri);
  } else {
    play ? spotify.resume() : spotify.pause();
  }
}

function startSpotify() {
  const state = get("state");
  if (state.tracks[state.index]?.source !== "spotify" || !state.playing || get("muted")) return;
  spotify.play();
  const pos = positionAt(state, now());
  // shortcut: Spotify position is best effort; seeking right after play can be ignored by the embed.
  if (pos > 2) setTimeout(() => spotify.seek(positionAt(get("state"), now())), 1500);
}

function host(id) {
  let box = document.getElementById("fm-host");
  if (!box) document.body.append((box = Object.assign(document.createElement("div"), { id: "fm-host" })));
  const el = Object.assign(document.createElement("div"), { id });
  box.append(el);
  return el;
}

function loadScript(src) {
  document.head.append(Object.assign(document.createElement("script"), { src, async: true }));
}

function youtube() {
  return (ytPromise ??= new Promise((resolve) => {
    window.onYouTubeIframeAPIReady = () => {
      yt = new YT.Player(host("fm-yt"), {
        width: 320, height: 180,
        playerVars: { controls: 0, playsinline: 1, rel: 0 },
        events: { onReady: () => resolve(yt), onStateChange: onYtState, onError: onYtError },
      });
    };
    loadScript("https://www.youtube.com/iframe_api");
  }));
}

function spotifyController(uri) {
  return (spotifyPromise ??= new Promise((resolve) => {
    window.onSpotifyIframeApiReady = (api) => {
      api.createController(host("fm-sp"), { uri, width: 300, height: 80 }, (controller) => {
        spotify = controller;
        controller.addListener("ready", startSpotify);
        resolve(controller);
      });
    };
    loadScript("https://open.spotify.com/embed/iframe-api/v1");
  }));
}

function onYtState(e) {
  if (e.data === YT.PlayerState.PLAYING) errors = 0;
  if (e.data !== YT.PlayerState.ENDED || !isLead()) return;
  const track = get("state").tracks[get("state").index];
  if (track?.kind === "playlist" && yt.getPlaylistIndex() < (yt.getPlaylist()?.length ?? 0) - 1) return;
  skip(1);
}

function onYtError(e) {
  const state = get("state");
  const track = state.tracks[state.index];
  if (track?.kind === "playlist") return yt.nextVideo(); // a blocked video inside a YouTube playlist: each browser moves on
  if (!isLead()) return;
  const what = `"${track?.title ?? "track"}"`;
  if (++errors >= state.tracks.length) {
    errors = 0;
    ui.notifications.error(`Synced Music: no track in the playlist would play (last: ${what}, error ${e.data}). Paused.`);
    return setState(pauseState(state, now()));
  }
  const reason = [101, 150].includes(e.data) ? "its owner blocks embedding" : `YouTube error ${e.data}`;
  ui.notifications.warn(`Synced Music: skipped ${what}, ${reason}.`);
  skip(1);
}

/* ---------- UI: GM console window and everyone's now-playing bar ---------- */

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;
let consoleApp;

class MusicConsole extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: "foundry-music-console",
    classes: ["foundry-music"],
    window: { title: "Synced Music", icon: "fas fa-compact-disc", minimizable: true, resizable: true },
    position: { width: 420, height: "auto" },
    actions: {
      toggle: () => toggle(),
      prev: () => skip(-1),
      next: () => skip(1),
      playAt: (_e, target) => playAt(Number(target.dataset.index)),
      remove: (_e, target) => remove(Number(target.dataset.index)),
      add() { return add(this.element.querySelector("input[name=url]")); },
    },
  };

  static PARTS = { main: { template: `modules/${MOD}/templates/console.hbs` } };

  async _prepareContext() {
    const state = get("state");
    const tracks = state.tracks.map((t, i) => ({ ...t, badge: t.source === "youtube" ? "YT" : "SP", current: i === state.index }));
    return { state, tracks, current: tracks[state.index] };
  }

  _onRender() {
    const input = this.element.querySelector("input[name=url]");
    input.addEventListener("keydown", (e) => e.key === "Enter" && add(input));
  }
}

function openConsole() {
  if (!game.user.isGM) return;
  (consoleApp ??= new MusicConsole()).render({ force: true });
}

let bar;

function buildBar() {
  bar = Object.assign(document.createElement("div"), { id: "fm-bar", className: "foundry-music" });
  bar.innerHTML = `
    <button type="button" class="fm-join">♪ Join the music</button>
    <span class="fm-bar-label">AUDIO</span>
    <span class="fm-bar-title"></span>
    <button type="button" class="fm-mute"><i class="fas"></i></button>
    <input type="range" class="fm-vol" min="0" max="100" step="5" aria-label="Music volume">
    ${game.user.isGM ? '<button type="button" class="fm-open" title="Open Synced Music" aria-label="Open Synced Music"><i class="fas fa-compact-disc"></i></button>' : ""}`;
  bar.querySelector(".fm-join").addEventListener("click", join);
  bar.querySelector(".fm-mute").addEventListener("click", () => game.settings.set(MOD, "muted", !get("muted")));
  bar.querySelector(".fm-vol").addEventListener("change", (e) => game.settings.set(MOD, "volume", Number(e.target.value)));
  bar.querySelector(".fm-open")?.addEventListener("click", openConsole);
  document.body.append(bar);
}

function updateBar() {
  if (!bar) return;
  const state = get("state");
  const track = state.tracks[state.index];
  const muted = get("muted");
  bar.querySelector(".fm-join").hidden = joined || !state.playing;
  bar.querySelector(".fm-bar-title").textContent = track ? `${state.playing ? "▶" : "❚❚"} ${track.title}` : "— silence —";
  const mute = bar.querySelector(".fm-mute");
  mute.title = mute.ariaLabel = muted ? "Unmute music" : "Mute music";
  mute.firstElementChild.className = `fas ${muted ? "fa-volume-xmark" : "fa-volume-high"}`;
  bar.querySelector(".fm-vol").value = get("volume");
}
