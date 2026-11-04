---
name: Synced Music
description: A synced soundtrack console and now-playing bar that look like part of Foundry VTT v14.
colors:
  foundry-orange: "#ff6400"
  foundry-orange-deep: "#b84400"
  ember-ink: "#1b1610"
  on-accent-light: "#ffffff"
  text-line: "color-mix(in srgb, currentColor 18%, transparent)"
  text-fill: "color-mix(in srgb, currentColor 7%, transparent)"
  text-fill-strong: "color-mix(in srgb, currentColor 13%, transparent)"
  text-muted: "color-mix(in srgb, currentColor 68%, transparent)"
  playing-wash: "color-mix(in srgb, var(--fm-accent) 14%, transparent)"
  bar-umber: "#1f1d1a"
  bar-bone: "#e7e2d6"
  bar-parchment: "#f1ede4"
  bar-edge-dark: "#000000"
  bar-edge-light: "#b9b2a2"
  bar-line-dark: "rgb(255 255 255 / 0.16)"
  bar-line-light: "rgb(0 0 0 / 0.16)"
  bar-muted-dark: "rgb(231 226 214 / 0.7)"
  bar-muted-light: "rgb(40 36 30 / 0.72)"
typography:
  headline:
    fontFamily: "Signika, sans-serif"
    fontSize: "1.15rem"
    fontWeight: 600
    lineHeight: 1.25
  body:
    fontFamily: "Signika, sans-serif"
    fontWeight: 400
  meta:
    fontFamily: "Signika, sans-serif"
    fontSize: "0.9rem"
    fontWeight: 400
  bar:
    fontFamily: "Signika, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
  numeric:
    fontFamily: "Signika, sans-serif"
    fontSize: "0.8rem"
    fontWeight: 400
    fontFeature: "tnum"
rounded:
  line: "1px"
  bar-control: "3px"
  panel: "4px"
  bar: "5px"
  handle: "50%"
spacing:
  xs: "0.25rem"
  sm: "0.35rem"
  md: "0.5rem"
  lg: "0.75rem"
components:
  button-primary:
    backgroundColor: "{colors.foundry-orange}"
    textColor: "{colors.ember-ink}"
    width: "3.5rem"
    height: "2.25rem"
  button-primary-light:
    backgroundColor: "{colors.foundry-orange-deep}"
    textColor: "{colors.on-accent-light}"
  button-primary-labelled:
    padding: "0 0.9rem"
    typography: "{typography.headline}"
  button-primary-disabled:
    backgroundColor: "{colors.text-fill-strong}"
    textColor: "{colors.text-muted}"
  button-transport:
    width: "2.75rem"
    height: "2.25rem"
  button-icon:
    width: "2rem"
    height: "2rem"
  button-row-icon:
    backgroundColor: "transparent"
    textColor: "{colors.text-muted}"
    width: "1.75rem"
    height: "1.75rem"
  tab:
    backgroundColor: "{colors.text-fill}"
    padding: "0 0.6rem"
    height: "2rem"
  tab-selected:
    backgroundColor: "{colors.text-fill-strong}"
  now-block:
    backgroundColor: "{colors.text-fill}"
    rounded: "{rounded.panel}"
    padding: "0.75rem"
  track-row:
    padding: "0.25rem 0.5rem"
    height: "2.5rem"
  track-row-current:
    backgroundColor: "{colors.playing-wash}"
  progress-line:
    backgroundColor: "{colors.text-line}"
    rounded: "{rounded.line}"
    height: "2px"
  bar:
    backgroundColor: "{colors.bar-umber}"
    textColor: "{colors.bar-bone}"
    rounded: "{rounded.bar}"
    height: "2.5rem"
    typography: "{typography.bar}"
  bar-light:
    backgroundColor: "{colors.bar-parchment}"
    textColor: "{colors.bar-umber}"
  bar-button:
    backgroundColor: "transparent"
    rounded: "{rounded.bar-control}"
    height: "1.875rem"
  bar-join:
    backgroundColor: "{colors.foundry-orange}"
    textColor: "{colors.ember-ink}"
    rounded: "{rounded.bar-control}"
    padding: "0 0.75rem"
---

# Design System: Synced Music

## Overview

**Creative North Star: "A Panel Foundry Could Have Shipped"**

Synced Music borrows Foundry VTT's own window, type, buttons and icons and adds almost nothing of its own. The console is a Foundry ApplicationV2 window; the module never styles the window header or Foundry's header buttons (those icons are drawn in the buttons' own font, and overriding the font turns them into empty boxes). Inside the window, every separator, fill and muted label is mixed from the window's current text colour, so a single stylesheet follows Foundry's light and dark themes without a theme switch.

The care sits in the details: wrapping playlist tabs with tabular counts, a balanced two-line track title, quiet row controls like Foundry's own directory rows, and one signature, a 2px line that fills as the track plays and that grows into the seek and volume sliders. Density is operational: a 440px window holds tabs, the now-playing block, the track list and the paste field without scrolling for a typical playlist.

The look refuses the dark streaming-app card with album art, and it refuses genre costume; nothing is blurred, glowing or soft-focused. Edges and text stay crisp over a game map.

**Key Characteristics:**
- Foundry's window, Signika type, buttons and Font Awesome icons, inherited rather than restyled.
- Lines and fills mixed from currentColor; one stylesheet for light and dark.
- One accent, Foundry orange, reserved for what is playing and the act of playing it.
- The 2px progress line is the signature, reused as both sliders.
- Flat inside the window; only the floating bar casts a shadow.

## Colors

The palette is the window's own text colour at a few strengths, plus one orange that changes depth between themes.

### Primary
- **Foundry Orange** (`foundry-orange`, the dark-theme accent): the playing state (speaker icon on the playing tab, source icon and wash on the current track row, the play glyph in the bar), the primary play button, the progress line and seek fill, "Join the music", and the keyboard focus outline. Text on it is Ember Ink.
- **Foundry Orange, Deep** (`foundry-orange-deep`, the light-theme accent): the same roles on Foundry's light theme, deep enough to carry white text and to read as a line on parchment.
- **Ember Ink** (`ember-ink`) and **White** (`on-accent-light`): the text on the accent in dark and light themes.

### Neutral
- **Text Line** (`text-line`, 18% of currentColor): every border and divider: tabs, the now-playing block, the track list and its row dividers, the empty track of the progress line and sliders, the scrollbar thumb.
- **Text Fill** (`text-fill`, 7%): resting fill of tabs and the now-playing block; track row hover.
- **Text Fill Strong** (`text-fill-strong`, 13%): the selected tab, row-icon hover, and the disabled primary button.
- **Text Muted** (`text-muted`, 68%): secondary text: counts, "playlist · source", times, row icons, empty states, hints.
- **Playing Wash** (`playing-wash`, 14% of the accent): background of the current track row only.

### Now-playing bar
The bar is appended to the page body, outside any themed window, so it carries its own fixed colours matched to Foundry's interface panels: **Bar Umber** surface with **Bar Bone** text on dark, **Bar Parchment** surface with Bar Umber text on light, a black or **Bar Edge Light** (`bar-edge-light`) border, and bar-specific line and muted values. The accent switches with `body.theme-light`.

### Named Rules
**The Current Colour Rule.** Inside a Foundry window, a neutral is never a fixed hex: it is `currentColor` mixed toward transparent. The bar is the one exception, because it has no themed window to inherit from.

**The Only When Playing Rule.** Orange marks what is playing and the control that plays it. Selection, hover and volume are never orange: the selected tab is a stronger text fill with a currentColor border, and the volume slider fills with currentColor.

## Typography

**Body Font:** Signika (with sans-serif), inherited from Foundry; the module declares no font family.

**Character:** Foundry's own humanist sans, used at its own sizes. Hierarchy comes from weight (400 / 600) and from the muted text mix, not from new faces.

### Hierarchy
- **Headline** (600, 1.15rem, 1.25): the now-playing track title, wrapped anywhere and balanced across lines. "Nothing playing" uses it at 400 in muted text.
- **Body** (400, Foundry's base size): tab names, track titles (single line, ellipsis), buttons, empty states (line-height 1.4).
- **Meta** (400, 0.9rem): "playlist · source" under the title, in muted text.
- **Bar** (400, 0.875rem): bar text; the playlist name at 600 with a muted middot after it.
- **Numeric** (400, 0.8rem, tabular figures): elapsed and total time; playlist counts use 0.8em tabular figures.

### Named Rules
**The Inherited Type Rule.** Never set a font family. Size and weight changes stay within 0.8rem to 1.15rem and weights 400 and 600.

**The Tabular Numbers Rule.** Every number that changes or lines up (times, counts) uses tabular figures.

## Layout

The console is a single column with a 0.75rem gap: playlist tabs with an icon-button cluster on the right, the now-playing block, the track list (max 18rem, scrolls with a thin scrollbar), then the paste field with Add. The window sets the width (440px by default); nothing in the console uses breakpoints. Tabs wrap so every playlist is one click away. Inner gaps step through 0.25rem, 0.35rem, 0.5rem and 0.75rem. Controls are at least 2rem tall; track rows are 2.5rem; the transport row is centred.

The bar is fixed at the top centre (0.5rem from the top, 2.5rem tall, at most 36rem or the viewport less 1rem). Users drag it by the grip or move it with the arrow keys; a double-click on the grip puts it back.

## Elevation & Depth

Inside the window the system is flat: depth is tonal, from the 7% and 13% text fills and the 18% line. No shadows, glows or blurs. The floating bar is the only lifted element, with a short, tight drop shadow (stronger on dark, lighter on light) so it separates from the map without softening its edges.

### Shadow Vocabulary
- **Bar lift, dark** (`box-shadow: 0 2px 8px rgb(0 0 0 / 0.45)`): the now-playing bar on Foundry's dark theme.
- **Bar lift, light** (`box-shadow: 0 2px 8px rgb(0 0 0 / 0.2)`): the same on the light theme.

### Named Rules
**The Flat Window Rule.** Nothing inside a Foundry window casts a shadow. Focus is a 2px accent outline with a 1px offset, never a glow.

## Shapes

Small, quiet corners: 4px on the now-playing block and the track list, 5px on the bar, 3px on bar buttons, 1px on the 2px line, and round 12px slider handles. Console buttons keep Foundry's own button shape; the module changes their size and fill, not their corners. Borders are always 1px.

## Components

### Buttons
Foundry's buttons, resized and occasionally recoloured; never restyled from scratch.
- **Shape:** Foundry's own; at least 2rem tall, icon and label centred with a 0.4em gap.
- **Primary (play/pause):** accent fill and border with on-accent text, 3.5rem wide in the transport; with a label ("Play Combat") it grows to fit, up to 14rem, label at 600 with ellipsis. Hover brightens it slightly (`filter: brightness(1.08)`). Disabled: strong text fill, line border, muted text.
- **Transport (previous / next):** Foundry buttons at 2.75rem by 2.25rem.
- **Icon buttons:** 2rem square, Font Awesome glyph only, with a title and aria-label.
- **Row icons (play this, remove):** 1.75rem, transparent with muted glyph at 0.8rem, gaining the strong fill and full text colour on hover, like Foundry's directory rows.
- **Focus:** 2px accent outline, 1px offset, box-shadow removed.

### Playlist tabs
- **Style:** text fill with a line border, 0 0.6rem padding, name then a muted tabular count; long names ellipsize.
- **State:** the viewed tab (`aria-pressed="true"`) gets the strong fill, a full currentColor border and weight 600. The playing playlist carries an accent speaker icon in front of its name, separate from selection.

### Now-playing block
- **Corner Style:** 4px.
- **Background:** text fill with a line border, 0.75rem padding, 0.35rem gap.
- **Content:** headline title, meta line, then the GM's seek row (or the players' progress line), then the centred transport.

### Track list
- **Style:** a bordered, 4px-cornered list with 1px line dividers between rows; rows hover to the text fill.
- **Current row:** playing wash background, title at 600, the brand source icon in accent, and the progress line across the full row width under the title.

### Inputs / Fields
- **Style:** Foundry's own text input, 2rem tall, beside a fitted Add button. The module adds no field styling.
- **Checkbox list (chosen players form):** Foundry checkboxes with labels, 0.5rem gap, a muted hint above.

### The Progress Line (signature)
A 2px line with 1px corners: the empty track is the text line, the filled part is the accent, and the fill moves with `width 1s linear` (no transition under reduced motion). It sits under the now-playing title for players, across the current track row, and along the bottom edge of the bar from the grip to the right end. The GM's seek slider and the bar's volume slider are the same line grown into a control: transparent range input 1rem tall, 2px track filled up to the handle through the `--fm-share` percentage set from script, and a 12px round handle in the fill colour that scales to 1.2 on hover. Seek fills with the accent; volume fills with currentColor, because volume is not "playing".

### Now-playing bar
- **Style:** fixed bar with its own panel colours, 1px border, 5px corners, bar lift shadow, 0.875rem text.
- **Content, left to right:** a 1.5rem grip with a right divider, the play/pause state glyph (muted, accent while playing), playlist name · track title (ellipsis), "Join the music" (accent, shown only when music plays and the browser has not joined yet), mute, the 5rem volume slider, and the open-console button for users who can edit.
- **Buttons:** transparent, 1.875rem tall, line border, 3px corners.

## Do's and Don'ts

### Do:
- **Do** mix every in-window line, fill and muted text from `currentColor` (18%, 7%, 13%, 68%) so light and dark need no separate rules.
- **Do** reserve the accent (#ff6400 dark, #b84400 light) for the playing state, the primary play button, the progress line and seek fill, "Join the music", and the focus outline.
- **Do** reuse the 2px progress line for any new sense of position or level, filled with the accent only when it shows playback.
- **Do** use Font Awesome solid icons for actions and Font Awesome brand icons for YouTube and Spotify, with a title and aria-label on every icon-only button.
- **Do** use tabular figures for times and counts.
- **Do** honour `prefers-reduced-motion` by dropping the progress transition.

### Don't:
- **Don't** style Foundry's window header or its header buttons, or change their font; the header icons are the buttons' own font and render as empty boxes when overridden.
- **Don't** set a font family; Signika is inherited from Foundry.
- **Don't** use the accent for selection, hover or volume.
- **Don't** add shadows, glows, blur or soft-focus inside the window; the bar's tight drop shadow is the only shadow.
- **Don't** bring album art, a streaming-app card or genre flavour into the interface.
- **Don't** hard-code a neutral hex inside a themed window; fixed colours belong only to the body-level bar.
