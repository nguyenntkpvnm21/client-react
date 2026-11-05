# Studio foundation verification

Checked locally on 2026-11-05, on `feature/studio-foundation`, based on
`dd56b94`. No push, merge or deployment is part of this change.

## Scope and reference

The owner explicitly changed direction to BandLab as the main reference and
authorized rebuilding the editing foundation before adding NatureMix's unique
creative features. Studio and Arrangement are now one Editor; Beats and Projects
are supporting panels/dialogs. This intentionally replaces the former four-page
workflow rather than adding another set of page-level controls.

Official BandLab documentation reviewed: Studio introduction, importing audio,
region editing, splitting, duplication, region looping/playback cycles, Drum
Machine and downloading mixdowns. Links to the primary references are in README.
No feature/performance parity or user-study result is claimed.

## Automated checks

| Command | Result |
| --- | --- |
| `npm test` | 239 passed, 0 failed |
| `node --test tests/focusSession.test.js` | 8 passed, 0 failed |
| `npm run lint` | Passed |
| `npm run build` | Passed |
| `git diff --check` | Passed |

The previous 218 main tests are retained. The 21 new cases exercise explicit
track grouping, independent legacy clips, lane routing/name preservation,
atomic clip moves/trim/repeat, source phase/fades, finite cursor placement,
legacy Free mix duration, project round trips, fitted audible ends and Repeat
checkbox behavior. Several cases compare actual scheduling envelopes rather
than just reproducing helper output. The separate Focus Session dashboard is
not mounted in the new editor, but its existing tests remain unchanged.

## Native browser checks actually performed

Chrome 156.0.8078.80 on Windows, headless native browser, served from Vite at
localhost. Chrome DevTools Protocol drove mouse, emulated touch, keyboard,
native file inputs and downloads. Two isolated temporary profiles kept the
owner's normal browser data untouched. Audio fixtures were generated WAVs,
included Rain, synthesized drums and a fake microphone capture.

| Area | Verified behavior |
| --- | --- |
| Empty workspace/import | Clean profile starts empty. Two 12-second files import as one-shots at the cursor; playback starts and pauses. |
| Seeking | Exact time entry while playing keeps playing. Paused seek stays paused. An off-screen position can be located in the viewport. |
| Clips | Split creates two regions in one track. Duplicate follows audible end and shares the source. Undo/Redo, mouse move, trim, fade, repeat extension, cross-track move and track-wide Mute work. |
| Labels | A moved Vocal region retains its label while adopting the destination track header/routing. |
| Keyboard/touch | Shift+Arrow nudges by 0.01s; focus selects the correct region; Enter opens settings. Emulated touch moves a clip. |
| Source editing | Detailed waveform opens; exact source selection applies and reuses the original. Undo restores it. |
| Cycle | Mouse-selected cycle wraps; Pause retains position; Restart returns to cycle start; outside seek disables it. |
| Drums | One action adds three shared-source rows in a four-bar section without forcing playback. Step edits keep the song playing. BPM change retains playing intent. |
| Recording | Fake device Start → Cancel leaves the mix intact. Start → Stop & add creates a track at the captured playhead. Undo is blocked during recording. A second browser without fake permission UI verifies actual browser permission denial and actionable feedback without changing the workspace. |
| Projects/history | Save/reload retains sources and remains paused. New empty project is undoable and keeps the saved collection. Reopening a project with the same clip IDs reloads waveform metadata and returns to Editor. |
| Source reuse | Native drag/drop with the project-source MIME type adds a region at the timeline destination without adding another source. |
| Legacy padding | A one-shot with a 120-second stored window and 12 seconds of audio stays 12 seconds when Repeat is enabled. |
| Full WAV | Export during an active short cycle produces a real downloaded stereo 44.1 kHz, 16-bit PCM WAV covering the full 91.115102-second fixture song; playback remains paused. |
| Portable project | Download embeds all five sources, including Rain. Restore in a clean profile leaves the empty workspace unchanged until Open. Open → reload → play/seek succeeds with catalog MP3 URLs blocked. |
| Restored render | Restored WAV has the same length and differs by at most one PCM16 level across 8,036,352 sample values compared with the pre-restore render. |
| Responsive | 320×700, 390×844, 768×1024, 1440×1000 and 1280×630 at DPR 1.5. No body overflow. Phone Beats uses the full editing area, navigation closes the covering Audio drawer, and the final expanded drum action passes an actual hit test above the status bar. New project/Master are reachable on phones. |

Issues found during checking were fixed: shared-name loss across tracks, keyboard
selection mismatch, trim-handle clicks seeking the song, inconsistent keyboard
duplication destinations, stale metadata after opening the same project, Undo
during capture, hidden mobile New/Master controls, an Audio drawer covering Beats,
and legacy Repeat unexpectedly expanding into silent placement padding.

Representative screenshots from the checked local build:

- [Desktop editor and drum machine](previews/studio-foundation-desktop.png)
- [Phone editor](previews/studio-foundation-mobile.png)

## Remaining limits

- No physical microphone or phone, Safari/Firefox, virtual keyboard, assistive
  technology audit or beginner user study was tested. Emulation is not a physical
  device result.
- The new frame was exercised in native Chrome against the Vite development
  server. The production bundle builds, but the online site has not been updated
  or verified for this branch.
- Microphone capture pauses playback; live overdub, monitoring, count-in and
  latency compensation are not implemented.
- MIDI/piano roll, virtual instruments, effects, automation, metronome,
  time-stretching/beat detection and cloud collaboration remain outside this
  foundation. Zoom/pan is manual; playback does not automatically scroll the view.
- Existing limits remain eight sources, 32 internal clip rows and a five-minute
  song. Native browser QA used the fixture mix, not eight simultaneous four-minute
  files; the larger-memory regression is automated engine coverage.
- Included-recording credits/licenses are still undocumented from the previous
  project; this update adds no audio assets or invented credits.
