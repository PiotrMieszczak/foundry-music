# Synced Music (`foundry-music`)

A Foundry VTT v14 module for any game system. The GM keeps named playlists of YouTube and
Spotify links inside Foundry (one per mood: tavern, combat, travel), presses play, and
every connected player hears the same music. No build step, no dependencies.

## How it works

- **Console.** Open it from the **Ambient Sound** scene controls (the disc icon) or the
  list button on the now-playing bar. Playlists are tabs along the top; the one playing
  has a speaker icon. To change the mood, click a playlist tab and press play: two clicks.
  The **+**, pencil and bin buttons create, rename and delete playlists. Paste a link into
  the field at the bottom and press **Add** (or Enter) to add it to the playlist you're
  looking at.
- **Playback (GM).** Play/pause, previous, next, play any track, and drag the position
  slider to move through the playing track for everyone. The GM's now-playing bar also has a
  play/pause button, so the music can be stopped without opening the console.
- **Players** get a now-playing bar showing playlist and track, with their own mute and
  volume. Each player can drag the bar anywhere by its grip (or move it with the arrow
  keys); double-click the grip to put it back. Position, volume and mute are per browser.
- **Sync.** Everything shared lives in one world setting, `foundry-music.state`
  (`{playlists, active, index, playing, offset, startedAt, ts}`), and only GMs write it.
  Each browser plays the official embeds itself and catches up on load, so late joiners
  land on the current track at the current position.
- **Autoplay.** Browsers keep a page silent until it has been clicked. Until a player
  clicks anywhere in Foundry, the bar shows **Join the music**.

### Letting players add music

In **Game Settings → Configure Settings → Synced Music**, press **Choose who can add music**.
Pick **Only the GM**, **All players**, or **Chosen players** and tick the players. Allowed
players see the console and can create playlists and add tracks. They can also open this
form and change who else can add music. Players who can't add music see it read-only.
Changes apply at once, with no reload. Playback, renaming, deleting playlists and removing
tracks stay with the GM.

A player's change (a track, a playlist or who can add music) is sent to the GM's browser
over the module socket and saved there, so **a GM must be connected** for it to stick.

### Ads

YouTube may show ads inside embedded videos, and each player gets their own at a different
moment. The module can't block them. When an ad ends, the player's video jumps back to
the shared position (checked every 10 seconds). Spotify plays ads only to free accounts,
and those aren't synced.

### What a link can be

| Link | Plays as | Sync |
|---|---|---|
| YouTube video (`watch?v=`, `youtu.be/`, `shorts/`, `embed/`, music.youtube.com) | one track | track, play/pause and position |
| YouTube playlist (`playlist?list=`) | one entry; the embed plays the whole list | only the start of the entry is synced |
| Spotify track, album, playlist or episode (link or `spotify:` URI) | one entry; albums and playlists play through in the embed | entry and play/pause; position is best effort |

The list moves on by itself when a YouTube video ends. Spotify entries don't, so the GM
presses next. A YouTube video whose owner blocks embedding (error 101 or 150) is skipped,
and the GM gets a notification.

### Spotify caveats

- Spotify plays **full tracks only for players who are logged into Spotify in the same
  browser** (open.spotify.com). Everyone else hears **30-second previews**.
- The Spotify embed has no volume control, so the volume slider affects YouTube only.
  Muting a Spotify track pauses it in that player's browser.

## Install

Needs Foundry VTT v14 (verified on 14.370). There are two ways to install it.

### From the manifest URL (recommended)

1. In Foundry's **Setup** screen, open **Add-on Modules → Install Module**.
2. Paste this into **Manifest URL** at the bottom and press **Install**:

   ```
   https://github.com/PiotrMieszczak/foundry-music/releases/latest/download/module.json
   ```

Foundry downloads the latest release. When a new release comes out, **Update** on the
module (or **Update All**) fetches it.

### By hand

Use this when you have shell access to the machine Foundry runs on. Clone the repo into
the `Data/modules` folder of your Foundry user data directory (its location is shown in
Foundry's **Setup → Configuration** as the User Data Path):

```bash
git clone https://github.com/PiotrMieszczak/foundry-music.git "<user-data-path>/Data/modules/foundry-music"
```

The files must be readable by the user Foundry runs as. If you cloned as a different user,
for example as root on the host of a Docker container, change the owner to that user:

```bash
chown -R <foundry-user>:<foundry-group> "<user-data-path>/Data/modules/foundry-music"
```

To update later, run `git pull` in that folder (and repeat the `chown` if you needed it).

### Turn it on in a world

1. If Foundry was running when you copied the files, return to Setup (or restart Foundry)
   so it sees the module. The manifest install doesn't need this.
2. Launch the world, open **Game Settings → Manage Modules**, tick **Synced Music** and
   press **Save Module Settings**.
3. After the reload, everyone has the now-playing bar. The GM opens the console from the
   **Ambient Sound** scene controls.

After any update, everyone does a **hard reload**: Ctrl+Shift+R (Cmd+Shift+R on a Mac).
A plain F5 isn't enough. Foundry lets browsers keep module scripts and styles for hours
but always fetches templates fresh, so old code ends up running against the new
templates, and buttons stop working. If that happens, the module says so in a red
notification.

## Releasing a new version

Foundry reads `module.json` from the latest GitHub release and downloads the zip that its
`download` field names. So every release needs both files, and the version in them must
match the tag.

1. In `module.json`, bump `version` and change the tag in the `download` URL to match
   (for example `0.2.0` and `.../download/v0.2.0/foundry-music.zip`). Set `VERSION` in
   `scripts/lib.js` to the same number (`node --test` checks this). Commit and push.
2. Build the zip, with `module.json` at its root:

   ```bash
   git archive --format zip -o foundry-music.zip HEAD module.json scripts styles templates README.md
   ```

3. Publish the release with both files attached:

   ```bash
   gh release create v0.2.0 foundry-music.zip module.json --title v0.2.0 --notes "What changed"
   ```

## Tests

URL parsing, position maths and playlist edits are in `scripts/lib.js`, which has no
Foundry or DOM dependency:

```bash
node --test
```
