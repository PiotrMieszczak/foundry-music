# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

- **Game master (GM)** running a Foundry VTT session for any game system. During play
  the GM sets the mood quickly: opens the console, switches to the right playlist
  (combat, tavern, travel) in one or two clicks, and closes it. Playlists are built
  before the session.
- **Players** connected to the same world. They don't control the music; they see what
  is playing and set their own volume or mute.

## Product Purpose

A Foundry VTT v14 module that plays one GM-controlled soundtrack of YouTube and Spotify
links in sync for every connected player, inside Foundry. Success: the GM changes the
mood mid-scene without breaking the flow of play, and every player hears it.

## Positioning

Each browser plays the official YouTube or Spotify embed itself, driven by one shared
world state that only the GM writes. No server-side audio, no file uploads, and
Spotify support, which other Foundry jukebox modules lack.

## Operating Context

- Lives inside Foundry's canvas UI: a draggable, minimisable GM window (ApplicationV2),
  opened from the Ambient Sound scene controls, and a small now-playing bar for everyone
  at the top of the screen.
- It sits over a game map and next to Foundry's own sidebars and windows, in either of
  Foundry's light or dark interface themes.
- Browsers block autoplay until the page is clicked, so a "Join the music" prompt exists.

## Capabilities and Constraints

- Named playlists, saved in the world. Each holds YouTube videos and playlists, and
  Spotify tracks, albums, playlists and episodes.
- Transport: play/pause, previous, next, play a specific track. YouTube is position
  synced; Spotify syncs track and play/pause only.
- Per-player volume (YouTube only) and mute.
- Plain ES modules, no build step, no dependencies; public Foundry v14 APIs only.
- Game-system agnostic: no genre flavour in names, copy or visuals.

## Brand Commitments

- Name: "Synced Music" (module id `foundry-music`).
- Must look at home in Foundry, like part of its own interface, not a costume.
- Must not look blurry: no glow, haze or soft-focus effects; crisp text and edges.
- Must not be plain: pleasant to use, with some care in the details.

## Product Principles

1. Mood change in two clicks: the active playlist and its play control come first.
2. Belong to Foundry: follow its window, control and theme conventions.
3. Players see, the GM controls: the bar informs, the console operates.
4. Honest about limits: autoplay, ads and Spotify previews are explained, not hidden.
