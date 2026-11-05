# NatureMix Studio

A personal, browser-local multitrack audio editor built with React, Vite and Web
Audio. The current foundation follows BandLab's editing conventions: one song
timeline, tracks containing regions, contextual clip controls and a separate drum
machine. NatureMix's more specific creative identity is deferred until this
editing foundation is settled. It is independent of StemForge; files from other
tools can be imported, but no separation API is connected.

## Run and check

Use a Node version supported by the installed Vite version (Node 20.19+ or
22.12+). On Windows PowerShell, use `npm.cmd` if script execution blocks `npm`.

```sh
npm install
npm run dev
npm test
node --test tests/focusSession.test.js
npm run lint
npm run build
git diff --check
```

No dependency was added for the editor rebuild. Browser verification and its
limits are recorded in [the foundation checklist](docs/studio-foundation-check.md).

## One editor

- **Editor** contains the track headers, song timeline, time ruler and clip tools.
  There is no separate mixer page or fixed bottom music player. Playback is in
  the top transport and remains available while editing.
- **Audio** opens import, microphone recording, reusable project files and the
  included Rain/Birds/Music recordings. Files can be dropped onto the timeline.
- **Beats** opens a live 16-step drum machine. On phones it occupies the editing
  area rather than squeezing the timeline above the grid. Close it or select
  Editor to return to the timeline.
- **Projects** manages named local mixes and portable `.naturemix` files. Save
  project updates an opened project; it never silently updates other snapshots.
- **Export** renders the finished full song to WAV. It is distinct from saving
  an editable project.

Old `#/studio` and `#/arrangement` links now open the same Editor. `#/rhythm`
opens Beats; `#/saved-mixes` opens Projects. Existing workspace settings,
recordings, Saved mixes and older portable project files remain readable.
Fresh browser profiles start with an empty song rather than automatic layers.

The dark interface uses lime for active controls, modest role colors for audio
regions and a white selection outline. A viewport-sized frame keeps transport
and navigation visible; tracks, Audio and Beats scroll within their own areas.
The phone editor uses a smaller track header and the same zoom/pan controls.

## Basic workflow

1. Import a recording, drag files from your computer or open Audio → Start
   recording. Imports play once and are placed at the current playhead. Sources
   remain available in Project files even after their last region is deleted.
2. Select a region and drag it in time. Drag an edge to trim actual audio; pull
   a diamond for a fade. The top-right loop handle extends a region by repeating
   its selected source. Ordinary right-edge trimming does not enable repetition.
3. Split at the playhead, duplicate after the selected audible region, or drag a
   region vertically into another audio track. Split/copy regions share the
   original recording. Overlaps are stacked so each region stays reachable.
4. Adjust a track's level, Mute (M) or Solo (S). A track controls all its regions;
   a region retains its own source range, position, repeat, phase and fades.
   Multiple solos are allowed; explicit Mute still silences a soloed track.
5. Use End in the transport for song length, exact cycle bounds and Master
   (also available on small screens). **Fit song to clips** removes trailing
   one-shot silence in one undoable action without changing the source audio.
6. Save project or export. The workspace also auto-saves separately in this
   browser; reload restores it paused at the start.

Selecting **Edit clip** opens position, length and fade fields. Time fields use
minutes:seconds and accept `1:30`, `1:30.5` or `90.5`. **Choose source audio** is
the optional detailed waveform selector: overview, zoom, drag selection,
audition, exact boundaries and sound finding. Closing it discards its draft;
applying keeps the song position and play/pause intention where possible.
Normal audio and rhythm samples remain independent.

Snap offers Beats, Seconds and Off. Zoom, Fit song, Fit clip and pan change the
view only. Clicking/dragging the ruler seeks; a paused song stays paused, and a
playing song resumes at the destination. Moving a clip/edge/diamond does not
also seek. Shift bypasses snap while dragging and makes keyboard nudges smaller.

## Drums and recording

**Add drum track** creates a four-bar section containing kick, snare and hi-hat
at the playhead's bar. Three locally synthesized one-shots share one persisted
source WAV. Adding does not start a paused song. Lit steps play; editing the grid
while the song plays updates future hits. A placed section is edited directly;
there is no required A/B capture-and-placement stage.

Section & sound settings holds bar position/repeat count, individual levels,
sample selection and tail policy. Sections move/resize in whole bars and can be
duplicated after their original. Existing A/B snapshots and old standalone
rhythm clips remain accessible under optional disclosures. They are not
automatically converted or discarded.

BPM is a whole value from 40 to 240. Placed beats retain their bar positions as
tempo changes; normal audio keeps its time and speed. This is not time stretching
or automatic beat matching. Samples can cut at the next hit or ring, with bounded
overlaps and short boundary envelopes. No melodic instruments or effects rack
are included in this foundation.

Microphone capture requires HTTPS or localhost, browser support and permission.
Start recording pauses the song; Stop & add places the result at the captured
starting playhead. Cancel discards it. Editing, project changes and history
shortcuts are blocked during capture. Streams are released on stop, error,
cancel or unmount. Capture stops after five minutes. This is capture-and-import;
there is no simultaneous overdubbing, input monitoring, count-in or latency
compensation yet.

## Playback cycle and keyboard

The strip above the ruler selects a temporary listening cycle. Drag its empty
area to select a range, its center to move, or its edges to resize. Cycle in the
transport enables/disables repetition. Pause preserves position; Restart returns
to the cycle start when enabled, otherwise song start. Seeking outside disables
the cycle. Turning Cycle off preserves the current position and playing intent.
It never limits the exported WAV and is not stored in projects.

| Shortcut | Action |
| --- | --- |
| Space | Play / Pause |
| S | Split selected normal audio at playhead |
| Ctrl / Command D | Duplicate after selected audio clip |
| Ctrl / Command Z | Undo |
| Ctrl / Command Shift Z or Ctrl Y | Redo |
| C | Toggle playback cycle |
| Arrows on a region/handle | Move or adjust it; Shift gives fine steps |
| Arrows on ruler | Seek five seconds; Shift gives 0.1 seconds |
| Delete / Backspace | Delete selected region |

Typing inputs keep native text editing. Undo keeps at most 50 metadata snapshots
and source references, without copying audio. Saved collection operations are
separate from song edit history. Opening a project or reloading starts fresh
history; creating an empty project is undoable in the current session.

## Storage, audio and export

- Up to eight unique sources and 32 internal clip rows, with songs up to 5:00.
  A drum section uses one row per sound. Sources can be up to 30 MiB and 15 minutes;
  the timeline limit still applies to their placement. Originals are retained.
- Web Audio decoding runs serially at 44.1 kHz with a 1 GiB decoded-audio budget.
  Aliases share one decode and PCM buffer per source. The six/eight four-minute
  layer memory regression remains in the automated suite; device limits still
  apply.
- Current metadata uses localStorage. Source files and up to twenty named mixes
  use IndexedDB `naturemix-audio-v1`, schema 2. No database migration, accounts,
  server audio uploads or cloud sync were added. Different sites/profiles have
  separate storage.
- Optional lane metadata groups regions without merging old independent clips
  merely because they share a source. Portable projects remap lane identities
  while retaining grouping; old files without lane fields stay valid.
- Download project embeds workspace metadata and each original source once,
  including catalog audio. Restore checks metadata, size, SHA-256 and sequential
  decoding before one atomic audio-and-snapshot transaction. Failure/cancel keeps
  the current workspace and existing saved entries; open the restored entry
  separately. Both old version-1 and shared-source version-2 files are accepted.
- WAV export renders zero through the configured song end, independent of
  playhead and playback cycle. It includes source regions, phase, normal loops,
  steps, sample tails, timing, fades, Solo/Mute, levels and Master. Output is
  stereo 44.1 kHz, 16-bit PCM; progress, cancellation and a repeat download link
  remain available. Export leaves playback paused. Originals/Saved mixes are not
  modified. Native offline rendering may finish its current stage before cancel
  completes.

## Main source files

| File | Responsibility |
| --- | --- |
| `src/App.jsx`, `src/Editor.css` | Unified frame, transport, dialogs and responsive layout |
| `src/components/EditorTimeline.jsx` | Track headers, regions, handles, ruler, cycle and viewport |
| `src/components/EditorBeats.jsx` | Live placed drum sections and legacy rhythm access |
| `src/components/EditorLibrary.jsx`, `MicrophoneRecorder.jsx` | Audio import/reuse and capture lifecycle |
| `src/lib/editorTracks.js` | Lane grouping, derived audible windows and atomic edit helpers |
| `src/hooks/useStudio.js` | Actions, history, persistence and engine lifecycle |
| `src/lib/audioEngine.js`, `stepScheduler.js`, `arrangementLooper.js` | Shared decoding, playback, rhythm and cycle scheduling |
| `src/lib/audioGraph.js`, `renderArrangement.js` | Live/offline scheduling and WAV encoding |
| `src/lib/studioState.js`, `audioStorage.js`, `projectBackup.js` | Validation, saved data and portable transfers |

The previous four-page components and scene presets remain in source for
reference/compatibility; App no longer mounts that shell. Focus Session tests
also remain, but its dashboard is not part of this editor.

## Reference and limits

BandLab is the primary interaction reference, specifically its official
[Studio introduction](https://help.bandlab.com/hc/en-us/articles/115002945153-Getting-Started-with-the-BandLab-Studio),
[region editing](https://help.bandlab.com/hc/en-us/articles/900003878046-Editing-Audio-Regions),
[slicing](https://help.bandlab.com/hc/en-us/articles/57252800910745-Slicing-and-Merging-Regions),
[region loops and playback cycles](https://help.bandlab.com/hc/en-us/articles/57252306473497-Looping-Regions-and-Setting-a-Playback-Cycle)
and [Drum Machine](https://help.bandlab.com/hc/en-us/articles/115002959894-Using-the-Drum-Machine).
The reference informs interactions, not a claim of BandLab feature/performance
parity. No BandLab branding, proprietary UI assets or application code is used.

This foundation does not include MIDI/piano roll, virtual instruments, effects,
automation, metronome, tempo detection/stretching, recording overdubs,
collaboration or cloud projects. Physical microphones/touch devices,
Firefox/Safari and a beginner user study require further verification.

## Included audio and hosting

Recordings remain in `public/audio/rain.mp3`, `birds.mp3` and `music.mp3`.
Their actual credits/licenses still need to be documented; do not invent them.

- Existing frontend: https://client-react-indol.vercel.app/
- Repository: https://github.com/nguyenntkpvnm21/client-react

Local branch changes do not update the online site. This rebuild does not push,
merge or deploy automatically.
