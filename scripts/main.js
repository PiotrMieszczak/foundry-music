import {
  positionAt, playState, pauseState, seekState, stepIndex, needsSeek, parseUrl,
  normalize, findPlaylist, currentTrack, applyEdit, PLAYER_EDITS, EMPTY_STATE,
} from "./lib.js";

const MOD = "foundry-music";
const SOCKET = `module.${MOD}`;
const get = (key) => game.settings.get(MOD, key);
const state = () => normalize(get("state"));
// Server time so every client computes the same position despite local clock drift.
const now = () => game.time?.serverTime ?? Date.now();
// With several GMs online only one acts on "track ended", errors and player requests.
const isLead = () => game.user.isGM && game.users.activeGM?.isSelf;
const notify = (level, text) => ui.notifications[level](`Synced Music: ${text}`);

/** Whether `user` may create playlists and add tracks. Everything else stays with the GM. */
function canEdit(user = game.user) {
  if (user.isGM) return true;
  const mode = get("editors");
  return mode === "all" || (mode === "some" && get("editorUsers").includes(user.id));
}

/* ---------- settings ---------- */

Hooks.once("init", () => {
  game.settings.register(MOD, "state", { scope: "world", config: false, type: Object, default: { ...EMPTY_STATE }, onChange: refresh });
  game.settings.register(MOD, "editors", {
    name: "Who can create playlists and add tracks",
    hint: "Playback, renaming, deleting and removing tracks always stay with the GM.",
    scope: "world", config: true, type: String, default: "gm",
    choices: { gm: "Only the GM", all: "All players", some: "Chosen players (pick them below)" },
    onChange: () => { refresh(); ui.controls?.render(); },
  });
  game.settings.register(MOD, "editorUsers", { scope: "world", config: false, type: Array, default: [], onChange: refresh });
  game.settings.registerMenu(MOD, "editorPicker", {
    name: "Chosen players", label: "Choose players", hint: "Used when the setting above is “Chosen players”.",
    icon: "fas fa-user-check", type: EditorPicker, restricted: true,
  });
  game.settings.register(MOD, "volume", {
    name: "Music volume", hint: "Your own volume for YouTube tracks.",
    scope: "client", config: true, type: Number, range: { min: 0, max: 100, step: 5 }, default: 60, onChange: refresh,
  });
  game.settings.register(MOD, "muted", { scope: "client", config: false, type: Boolean, default: false, onChange: refresh });
  game.settings.register(MOD, "barPos", { scope: "client", config: false, type: Object, default: null });
});

Hooks.once("ready", () => {
  game.modules.get(MOD).api = { open: openConsole };
  game.socket.on(SOCKET, onRequest);
  buildBar();
  // Browsers block sound until the page has been clicked; any click counts as joining.
  document.addEventListener("pointerdown", join, { once: true, capture: true });
  // Ads and buffering push a YouTube player off the shared position; pull it back regularly.
  setInterval(resync, 10_000);
  setInterval(paintProgress, 1000);
  refresh();
});

Hooks.on("getSceneControlButtons", (controls) => {
  const sounds = controls.sounds;
  if (!sounds?.tools || !canEdit()) return;
  sounds.tools.foundryMusic = {
    name: "foundryMusic", title: "Synced Music", icon: "fas fa-compact-disc",
    order: Object.keys(sounds.tools).length, button: true, visible: true, onChange: openConsole,
  };
});

/* ---------- writing shared state: the GM writes, players ask over the socket ---------- */

function setState(next) {
  return game.settings.set(MOD, "state", next);
}

/** Run a playlist edit: directly for a GM, as a socket request for a permitted player. */
function edit(change) {
  try {
    applyEdit(state(), change, now()); // validate here too, so the player sees mistakes at once
  } catch (err) {
    return notify("warn", err.message);
  }
  if (game.user.isGM) return setState(applyEdit(state(), change, now()));
  if (!canEdit() || !PLAYER_EDITS.includes(change.type)) return notify("warn", "only the GM can do that.");
  if (!game.users.activeGM) return notify("warn", "no GM is connected to save that.");
  game.socket.emit(SOCKET, { edit: change, userId: game.user.id });
}

function onRequest(message, senderId) {
  if (!isLead()) return;
  // shortcut: older cores may not pass the sender's id, so fall back to the one in the message.
  const user = game.users.get(senderId ?? message?.userId);
  const change = message?.edit;
  if (!user || !canEdit(user) || !PLAYER_EDITS.includes(change?.type)) return;
  try {
    setState(applyEdit(state(), change, now()));
  } catch (err) {
    notify("warn", `${user.name}'s change was not saved: ${err.message}`);
  }
}

/* ---------- transport (GM only) ---------- */

function playTrack(playlistId, index, offset = 0) {
  return setState({ ...state(), active: playlistId, ...playState(index, offset, now()) });
}

/** Play/pause; when the GM is looking at another playlist, start that one instead. */
function toggle(viewingId) {
  const s = state();
  if (viewingId && viewingId !== s.active) return findPlaylist(s, viewingId)?.tracks.length && playTrack(viewingId, 0);
  if (s.playing) return setState(pauseState(s, now()));
  const tracks = findPlaylist(s, s.active)?.tracks ?? [];
  if (tracks.length) return playTrack(s.active, Math.min(s.index, tracks.length - 1), s.offset);
}

/** Move the playing track to `seconds` for everyone. */
function seek(seconds) {
  const s = state();
  if (currentTrack(s)) return setState(seekState(s, seconds, now()));
}

function skip(step) {
  const s = state();
  const tracks = findPlaylist(s, s.active)?.tracks ?? [];
  if (tracks.length) return playTrack(s.active, stepIndex(s.index, step, tracks.length));
}

async function titleFor(url) {
  const track = parseUrl(url);
  if (!track) return "";
  const oembed = track.source === "youtube" ? "https://www.youtube.com/oembed?format=json&url=" : "https://open.spotify.com/oembed?url=";
  try {
    const res = await fetch(oembed + encodeURIComponent(url));
    if (res.ok) return (await res.json()).title;
  } catch { /* offline or blocked: applyEdit falls back to the id */ }
  return "";
}

/* ---------- local playback: every browser plays the embeds itself ---------- */

let joined = false;
let loaded = null; // which entry this browser has loaded
let yt, ytPromise, spotify, spotifyPromise;
let errors = 0;
let spotifyProgress = null; // {position, duration} in ms, from the Spotify embed

/** {pos, dur} in seconds as this browser plays the current track, or null when it can't tell. */
function progress() {
  if (!joined) return null;
  const s = state();
  const track = currentTrack(s);
  // The shared position is the truth; the local player only knows the track's length.
  // A YouTube playlist entry only syncs its start, so show the player's own position and allow no seeking.
  if (track?.source === "youtube" && track.kind === "playlist" && yt?.getDuration?.()) return { pos: yt.getCurrentTime(), dur: yt.getDuration(), local: true };
  if (track?.source === "youtube" && yt?.getDuration?.()) return { pos: positionAt(s, now()), dur: yt.getDuration() };
  if (track?.source === "spotify" && spotifyProgress?.duration) return { pos: positionAt(s, now()), dur: spotifyProgress.duration / 1000 };
  return null;
}

/** Range inputs draw as the 2px line, filled up to the handle. */
function fillSlider(slider) {
  const span = Number(slider.max) - Number(slider.min) || 1;
  slider.style.setProperty("--fm-share", `${((Number(slider.value) - Number(slider.min)) / span) * 100}%`);
}

const clock = (sec) => {
  const t = Math.max(0, Math.floor(sec));
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const ss = String(t % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${ss}` : `${m}:${ss}`;
};

/** The signature line under the playing track, and the GM's seek slider. */
function paintProgress() {
  const p = progress();
  const share = p ? Math.min(1, p.pos / p.dur) : 0;
  for (const line of document.querySelectorAll(".foundry-music .fm-progress")) {
    line.hidden = !p;
    line.firstElementChild.style.width = `${share * 100}%`;
  }
  for (const row of document.querySelectorAll(".fm-seek-row")) {
    const slider = row.querySelector(".fm-seek");
    slider.disabled = !p || p.local;
    if (slider.dataset.dragging) continue; // don't yank the handle out of the GM's hand
    slider.max = Math.floor(p?.dur ?? 1);
    slider.value = Math.floor(p?.pos ?? 0);
    fillSlider(slider);
    slider.ariaValueText = p ? `${clock(p.pos)} of ${clock(p.dur)}` : "unknown";
    row.querySelector(".fm-elapsed").textContent = p ? clock(Math.min(p.pos, p.dur)) : "–:––";
    row.querySelector(".fm-duration").textContent = p ? clock(p.dur) : "–:––";
  }
}

function join() {
  if (joined) return;
  joined = true;
  refresh();
}

function refresh() {
  if (!game.ready) return;
  updateBar();
  if (consoleApp?.rendered) consoleApp.render();
  applyState();
}

async function applyState() {
  if (!joined) return;
  const s = state();
  const track = currentTrack(s);
  const muted = get("muted");
  const pos = positionAt(s, now());
  const key = track && `${s.active}:${s.index}:${track.id}`;

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
    s.playing ? p.playVideo() : p.pauseVideo();
    return;
  }

  // Spotify: the embed has no volume API, so "mute" pauses it in this browser only.
  const play = s.playing && !muted;
  if (!spotify) {
    loaded = key;
    await spotifyController(track.uri); // its "ready" listener starts playback
  } else if (loaded !== key) {
    loaded = key;
    spotify.loadUri(track.uri);
  } else {
    play ? spotify.resume() : spotify.pause();
    // Follow the GM's seeks; best effort, the embed reports its position only every so often.
    if (play && spotifyProgress && needsSeek(spotifyProgress.position / 1000, pos, 3)) spotify.seek(pos);
  }
}

/** Pull a playing YouTube video back to the shared position, e.g. after an ad. */
function resync() {
  const s = state();
  const track = currentTrack(s);
  if (!joined || !s.playing || track?.kind !== "video" || track.source !== "youtube") return;
  if (yt?.getPlayerState?.() !== YT.PlayerState.PLAYING) return;
  const pos = positionAt(s, now());
  if (needsSeek(yt.getCurrentTime(), pos, 3)) yt.seekTo(pos, true);
}

function startSpotify() {
  const s = state();
  if (currentTrack(s)?.source !== "spotify" || !s.playing || get("muted")) return;
  spotify.play();
  // shortcut: Spotify position is best effort; seeking right after play can be ignored by the embed.
  if (positionAt(s, now()) > 2) setTimeout(() => spotify.seek(positionAt(state(), now())), 1500);
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
        controller.addListener("playback_update", (e) => (spotifyProgress = e.data));
        resolve(controller);
      });
    };
    loadScript("https://open.spotify.com/embed/iframe-api/v1");
  }));
}

function onYtState(e) {
  if (e.data === YT.PlayerState.PLAYING) {
    errors = 0;
    resync();
  }
  if (e.data !== YT.PlayerState.ENDED || !isLead()) return;
  if (currentTrack(state())?.kind === "playlist" && yt.getPlaylistIndex() < (yt.getPlaylist()?.length ?? 0) - 1) return;
  skip(1);
}

function onYtError(e) {
  const s = state();
  const track = currentTrack(s);
  if (track?.kind === "playlist") return yt.nextVideo(); // a blocked video inside a YouTube playlist: each browser moves on
  if (!isLead()) return;
  const what = `"${track?.title ?? "track"}"`;
  if (++errors >= (findPlaylist(s, s.active)?.tracks.length ?? 0)) {
    errors = 0;
    notify("error", `no track in the playlist would play (last: ${what}, error ${e.data}). Paused.`);
    return setState(pauseState(s, now()));
  }
  const reason = [101, 150].includes(e.data) ? "its owner blocks embedding" : `YouTube error ${e.data}`;
  notify("warn", `skipped ${what}, ${reason}.`);
  skip(1);
}

/* ---------- console window (GM, and players allowed to edit) ---------- */

const { ApplicationV2, HandlebarsApplicationMixin, DialogV2 } = foundry.applications.api;
let consoleApp;

/** Ask for a playlist name; resolves to the trimmed name or null when cancelled. */
async function askName(title, value = "") {
  const input = `<input type="text" name="name" maxlength="60" value="${foundry.utils.escapeHTML?.(value) ?? ""}" autofocus>`;
  const name = await DialogV2.prompt({
    window: { title }, content: input, rejectClose: false,
    ok: { label: "Save", callback: (_e, button) => button.form.elements.name.value },
  });
  return name?.trim() || null;
}

class MusicConsole extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: "foundry-music-console",
    classes: ["foundry-music", "fm-console-app"],
    window: { title: "Synced Music", icon: "fas fa-compact-disc", minimizable: true, resizable: true },
    position: { width: 440, height: "auto" },
    actions: {
      view(_e, t) { this.viewing = t.dataset.id; this.render(); },
      toggle() { return toggle(this.viewingId()); },
      prev: () => skip(-1),
      next: () => skip(1),
      playAt(_e, t) { return playTrack(this.viewingId(), Number(t.dataset.index)); },
      remove(_e, t) { return edit({ type: "remove", playlistId: this.viewingId(), index: Number(t.dataset.index) }); },
      add() { return this.addFromInput(); },
      async create() {
        const name = await askName("New playlist");
        if (!name) return;
        this.viewing = foundry.utils.randomID();
        edit({ type: "create", id: this.viewing, name });
      },
      async rename() {
        const list = findPlaylist(state(), this.viewingId());
        const name = list && (await askName("Rename playlist", list.name));
        if (name) edit({ type: "rename", id: list.id, name });
      },
      async delete() {
        const list = findPlaylist(state(), this.viewingId());
        if (!list) return;
        const ok = await DialogV2.confirm({
          window: { title: "Delete playlist" },
          content: `<p>Delete “${foundry.utils.escapeHTML?.(list.name) ?? "this playlist"}” and its ${list.tracks.length} tracks?</p>`,
          rejectClose: false,
        });
        if (ok) edit({ type: "delete", id: list.id });
      },
    },
  };

  static PARTS = { main: { template: `modules/${MOD}/templates/console.hbs` } };

  viewingId() {
    const s = state();
    return findPlaylist(s, this.viewing)?.id ?? s.active ?? s.playlists[0]?.id ?? null;
  }

  async addFromInput() {
    const input = this.element.querySelector("input[name=url]");
    const url = input.value.trim();
    const playlistId = this.viewingId();
    if (!url || !playlistId) return;
    if (!parseUrl(url)) return notify("warn", "that isn't a YouTube or Spotify link I can play.");
    input.value = "";
    edit({ type: "add", playlistId, url, title: await titleFor(url) });
  }

  async _prepareContext() {
    const s = state();
    const viewingId = this.viewingId();
    const viewing = findPlaylist(s, viewingId);
    const active = findPlaylist(s, s.active);
    const isActive = viewingId === s.active;
    return {
      isGM: game.user.isGM,
      playing: s.playing,
      now: active && currentTrack(s)
        ? { playlist: active.name, title: currentTrack(s).title, source: currentTrack(s).source === "youtube" ? "YouTube" : "Spotify" }
        : null,
      playlists: s.playlists.map((p) => ({ id: p.id, name: p.name, count: p.tracks.length, viewing: p.id === viewingId, active: p.id === s.active })),
      viewing: viewing && {
        name: viewing.name,
        isActive,
        tracks: viewing.tracks.map((t, i) => ({
          title: t.title,
          source: t.source === "youtube" ? "YouTube" : "Spotify",
          icon: t.source === "youtube" ? "fa-youtube" : "fa-spotify",
          kind: t.kind,
          current: isActive && i === s.index,
        })),
      },
      // The big button plays the viewed playlist when it isn't the one playing.
      toggleIcon: !isActive || !s.playing ? "fa-play" : "fa-pause",
      // Starting another playlist says so in words; play/pause of the playing one is icon-only.
      toggleText: !isActive && viewing ? `Play ${viewing.name}` : "",
      canToggle: isActive ? !!active?.tracks.length : !!viewing?.tracks.length,
      toggleLabel: !isActive ? `Play ${viewing?.name ?? ""}` : s.playing ? "Pause" : "Play",
    };
  }

  _onRender() {
    paintProgress();
    const slider = this.element.querySelector(".fm-seek");
    slider?.addEventListener("input", () => {
      slider.dataset.dragging = "1";
      fillSlider(slider);
      slider.closest(".fm-seek-row").querySelector(".fm-elapsed").textContent = clock(Number(slider.value));
    });
    slider?.addEventListener("change", () => {
      delete slider.dataset.dragging;
      seek(Number(slider.value));
    });
    const input = this.element.querySelector("input[name=url]");
    input?.addEventListener("keydown", (e) => e.key === "Enter" && this.addFromInput());
  }
}

function openConsole() {
  if (!canEdit()) return;
  (consoleApp ??= new MusicConsole()).render({ force: true });
}

/* ---------- module settings: pick the players who may edit ---------- */

class EditorPicker extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: "foundry-music-editors",
    tag: "form",
    classes: ["foundry-music"],
    window: { title: "Synced Music: chosen players", icon: "fas fa-user-check" },
    position: { width: 360, height: "auto" },
    form: { handler: EditorPicker.save, closeOnSubmit: true },
  };

  static PARTS = { form: { template: `modules/${MOD}/templates/editors.hbs` } };

  static async save(_event, _form, formData) {
    const ids = Object.entries(formData.object).filter(([, on]) => on).map(([id]) => id);
    await game.settings.set(MOD, "editorUsers", ids);
  }

  async _prepareContext() {
    const chosen = get("editorUsers");
    return {
      users: game.users.filter((u) => !u.isGM).map((u) => ({ id: u.id, name: u.name, checked: chosen.includes(u.id) })),
      modeIsSome: get("editors") === "some",
    };
  }
}

/* ---------- now-playing bar, every user; each user can drag it where they like ---------- */

let bar;

function buildBar() {
  bar = Object.assign(document.createElement("div"), { id: "fm-bar", className: "foundry-music" });
  bar.innerHTML = `
    <span class="fm-grip" role="button" tabindex="0" title="Drag to move. Double-click to put it back." aria-label="Move the music bar"><i class="fas fa-grip-vertical"></i></span>
    <i class="fm-state fas" aria-hidden="true"></i>
    <span class="fm-bar-text"><span class="fm-bar-playlist"></span><span class="fm-bar-title"></span></span>
    <button type="button" class="fm-join">Join the music</button>
    <button type="button" class="fm-mute fm-icon"><i class="fas"></i></button>
    <input type="range" class="fm-vol" min="0" max="100" step="5" aria-label="Music volume">
    <button type="button" class="fm-open fm-icon" title="Open Synced Music" aria-label="Open Synced Music"><i class="fas fa-list-ul"></i></button>
    <div class="fm-progress" aria-hidden="true" hidden><span></span></div>`;
  bar.querySelector(".fm-join").addEventListener("click", join);
  bar.querySelector(".fm-mute").addEventListener("click", () => game.settings.set(MOD, "muted", !get("muted")));
  const vol = bar.querySelector(".fm-vol");
  vol.addEventListener("input", () => fillSlider(vol));
  vol.addEventListener("change", () => game.settings.set(MOD, "volume", Number(vol.value)));
  bar.querySelector(".fm-open").addEventListener("click", openConsole);
  document.body.append(bar);
  makeDraggable(bar.querySelector(".fm-grip"));
  placeBar(get("barPos"));
  window.addEventListener("resize", () => placeBar(get("barPos")));
}

/** Put the bar at a saved {left, top}, kept inside the window; null means the default spot. */
function placeBar(pos) {
  bar.classList.toggle("fm-moved", !!pos);
  if (!pos) return Object.assign(bar.style, { left: "", top: "" });
  const left = Math.min(Math.max(0, pos.left), innerWidth - bar.offsetWidth);
  const top = Math.min(Math.max(0, pos.top), innerHeight - bar.offsetHeight);
  Object.assign(bar.style, { left: `${left}px`, top: `${top}px` });
}

function makeDraggable(grip) {
  const save = () => game.settings.set(MOD, "barPos", { left: bar.offsetLeft, top: bar.offsetTop });
  grip.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    grip.setPointerCapture(e.pointerId);
    const box = bar.getBoundingClientRect();
    const dx = e.clientX - box.left;
    const dy = e.clientY - box.top;
    const move = (ev) => placeBar({ left: ev.clientX - dx, top: ev.clientY - dy });
    grip.addEventListener("pointermove", move);
    grip.addEventListener("pointerup", () => { grip.removeEventListener("pointermove", move); save(); }, { once: true });
  });
  grip.addEventListener("dblclick", () => { game.settings.set(MOD, "barPos", null); placeBar(null); });
  // Keyboard: arrow keys move it 20px at a time.
  grip.addEventListener("keydown", (e) => {
    const step = { ArrowLeft: [-20, 0], ArrowRight: [20, 0], ArrowUp: [0, -20], ArrowDown: [0, 20] }[e.key];
    if (!step) return;
    e.preventDefault();
    placeBar({ left: bar.offsetLeft + step[0], top: bar.offsetTop + step[1] });
    save();
  });
}

function updateBar() {
  if (!bar) return;
  const s = state();
  const track = currentTrack(s);
  const muted = get("muted");
  bar.classList.toggle("fm-playing", !!track && s.playing);
  bar.querySelector(".fm-state").className = `fm-state fas ${track && s.playing ? "fa-play" : "fa-pause"}`;
  bar.querySelector(".fm-bar-playlist").textContent = track ? findPlaylist(s, s.active).name : "";
  bar.querySelector(".fm-bar-title").textContent = track ? track.title : "No music playing";
  bar.querySelector(".fm-join").hidden = joined || !s.playing;
  const mute = bar.querySelector(".fm-mute");
  mute.title = mute.ariaLabel = muted ? "Unmute music" : "Mute music";
  mute.firstElementChild.className = `fas ${muted ? "fa-volume-xmark" : "fa-volume-high"}`;
  const vol = bar.querySelector(".fm-vol");
  vol.value = get("volume");
  fillSlider(vol);
  bar.querySelector(".fm-open").hidden = !canEdit();
  if (bar.classList.contains("fm-moved")) placeBar(get("barPos")); // the width may have changed
}
