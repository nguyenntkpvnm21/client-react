# NatureMix

A personal audio studio built with React, Vite and Web Audio. Layer real nature
recordings with music, instrumentals, vocals and your own sounds. The interface
uses a dark emerald theme and English labels.

This is an independent personal project. StemForge audio outputs can be imported
as files; there is no direct separation API connection.

## Run and check

Use a Node.js version supported by the installed Vite version (the current
lockfile requires Node 20.19+ or Node 22.12+).

    npm install
    npm run dev
    npm run test
    npm run lint
    npm run build

The automated suite has 95 tests. No additional testing dependency is required.

## Four pages, one workspace

| Page | Purpose |
| --- | --- |
| `#/studio` | Import recordings, browse sounds, balance layers and edit normal clips. |
| `#/rhythm` | Choose rhythm samples, edit steps and audition individual patterns. |
| `#/arrangement` | Arrange tracks on a shared timeline with entry, exit and fades. |
| `#/saved-mixes` | Save, open, update, rename and delete named snapshots. |

Only the selected page is rendered; the audio engine, current mix and shared
transport stay mounted. Navigation preserves mix playback and closes isolated
previews and sample editors. Leaving an editor discards its unapplied draft.

Hash navigation supports direct links, reload and browser Back/Forward without
server rewrites. Legacy `#studio`, `#rhythm`, `#arrangement` and `#saved-mixes`
links still work. Empty, unknown and `#my-sounds` links open Studio. Pages have
one h1, an active navigation link, a distinct document title and main focus.

## Studio and importing

- Included recordings: Rain, Birds and Music, with search/category filters.
- Up to eight layers, including imported files.
- Up to 30 MiB per file and 15 minutes per recording, with a 512 MiB decoded-audio
  budget for the workspace. Browser decoding support determines accepted formats.
- Nature imports loop by default; Music/instrumental and Vocal imports do not.
  The included Music layer has its own looping default. Changing role does not
  silently change an existing Loop setting.
- Independent volume, mute, solo and Loop; shared Master. Muted solo layers stay
  silent. Multiple Solo selections are allowed.
- Balanced, Rainfall and Birdsong adjust included layer levels. Reset levels
  keeps clips, rhythm samples, patterns and timing settings.
- Roles categorize files; they do not separate vocals or identify audio content.

Imported files stay in this browser; no audio is uploaded to a server. Removing
or editing a layer never changes its original file on disk.

## Normal clips and rhythm samples

Every layer has independent source regions:

- **Edit normal clip** in Studio chooses the source for normal playback.
- **Edit sample** in Rhythm chooses the source repeated by rhythm hits.

Applying or resetting either region preserves the other. A layer uses one of
these playback paths at a time. Studio explains when Rhythm is currently active.
Old single-region workspaces retain their audible sample during migration; a
normal region overwritten by an older version cannot be inferred or recovered.

### Selecting audio without typing fractions

The editor loads actual decoded samples and offers:

1. Drag across the large waveform to select a region.
2. Drag the highlighted region to move it without changing its length.
3. Drag either edge to trim. Edge handles also support arrow keys; Shift makes
   smaller adjustments.
4. Zoom in/out, Show selection, Full recording, pan buttons and a full-recording
   overview to move through long recordings. Zoom regenerates waveform detail
   from that visible portion, including both stereo channels.
5. Rhythm duration shortcuts: quarter beat, one beat, two beats, one bar and two
   bars at the current BPM. These resize the draft; they do not change tempo or
   stretch the source recording.
6. Find next sound moves the draft to a later audible region, wrapping to the
   first detected region when necessary. Detection uses signal amplitude and can
   select noise or an imperfect onset; always audition it before applying.
7. Exact Start/End fields and sliders remain under an expandable section.

Selections are nondestructive and must be at least 0.05 seconds, unless the
recording itself is shorter. The editor changes a draft until Apply range or Use
this sample. Applying resets the shared playback position. Closing or navigating
away discards the draft.

Listen auditions the stored rhythm sample once. Preview clip auditions an editor
draft. Both pause the mix and use a separate 40% audition gain, bypassing layer
mute/solo and Master. Stopping preview never automatically resumes the mix.

## Rhythm and pattern audition

A loop contains four beats and sixteen steps. BPM is an integer from 40 to 240,
defaulting to 100. A lit step starts the selected rhythm sample again; Four beats
does not divide a source recording into four different slices.

- Create rhythm initializes steps 1, 5, 9 and 13 only on first creation. If no
  sample was selected, it starts with up to 0.18 seconds from the recording.
- Enable rhythm restores the stored pattern and sample, including a deliberately
  cleared pattern. Use normal playback preserves them for later.
- Four beats changes only the pattern. Clear leaves it intentionally silent.
- Step edits remain live. BPM changes apply at the next loop boundary. Normal
  ambience and music are not time-stretched or tempo-matched.

**Preview pattern** auditions one row independently: one sixteen-step loop, then
any remaining ringing tails. It uses the current BPM, pauses and preserves the
mix position, bypasses mute/solo/Master and ignores Arrangement windows. The row
shows preview progress. Stop preview, editing the pattern/sample/tail policy or
speed, navigation, project opening, removal, hidden-tab handling and disposal
cancel pending/scheduled preview audio. A cleared pattern has no preview hits.

### Sample tails

- **Cut at next hit** preserves legacy monophonic behavior. A hit stops at the
  next lit step on the same row, its source end or Arrangement exit.
- **Let samples ring** allows overlapping tails and plays each selected sample
  through its source end, still respecting Arrangement exit.

At 120 BPM, Four beats starts a sample every 0.5 seconds. A four-second selection
is cut to roughly 0.5 seconds per hit in Cut mode. The row reports selection
length and the shortest hit spacing instead of hiding that truncation. Choose a
shorter sound visually, space hits apart or select Let samples ring.

There are at most 32 simultaneous ringing voices per row; unusually dense/long
patterns warn that older tails may be cut. Small source-boundary fades reduce
clicks. This is not automatic mastering, beat detection or phrase slicing.

The scheduler refills a 120 ms queue every 25 ms and uses the audio clock for
onsets. Live edits cancel/rebuild upcoming hits. Tempo changes replace future
hits at the bar boundary. Pause/resume preserves rhythmic phase and overlapping
tail source offsets, including across tempo changes. Late callbacks skip missed
steps rather than playing a backlog. Pattern playback pauses in a hidden tab.

## Arrangement timeline

Arrangement length is 1–300 seconds, default 30. Each layer has one timing window.
All rows share a time axis; overlapping windows play together.

- Drag the middle of a clip to move it while preserving its length.
- Drag the bottom Entry/Exit handles to resize the timing window.
- Drag top handles for Fade in/out. Arrow keys work on all controls; Shift gives
  fine adjustments. Snap to beats can be switched off.
- During dragging, a temporary draft is shown. Release validates and applies
  once at the current playback position; other layers and the shared clock keep
  running. Only the affected normal source or rhythmic envelope/voices are rebuilt. A canceled gesture does not apply.
- Edit timing retains numeric fields for exact values. Entry must precede Exit
  by at least 0.05 seconds, inside the composition; fades must fit that window.
- Load waveform decodes a row without starting playback. Normal tracks show
  source waveform detail; rhythm tracks show their grid hits.
- Normal rows expose Loop selected clip directly. A one-shot shorter than its
  window has a hatched silent remainder and an explicit source-end message.

A 55-second normal clip in a 70-second window ends at 55 seconds with Loop off;
with Loop on, it repeats the selected region for the remaining 15 seconds. Merely
increasing composition length never turns Loop on or stretches a recording.
One-shot fades fit their audible source duration. Rhythm hits stay on the shared
grid and cannot ring beyond Exit.

Play arrangement enables the finite timeline; playback stops automatically at
its end. Shared Play resumes in the current mode. Switching pages does not switch
modes. Rhythm shows Arrangement is on, each row's Entry/Exit and Switch to Free
mix. Free mix stops/resets playback and disables timeline limits while retaining
all timing and fade settings for reuse.

There is currently one placement per layer. Multiple clips on one track, source
slip editing, drag duplication, effects and rendered audio export are not added.

## Saved mixes and browser storage

Current workspace settings auto-save in localStorage. Imported recordings and up
to twenty named snapshots use IndexedDB (`naturemix-audio-v1`, schema 2). Mix
names are nonempty, at most sixty characters and unique without regard to case.

- Save as new creates a snapshot of current layers, levels, normal clips, rhythm
  samples, tail policy, patterns, tempo, arrangement mode, timing and fades.
- Save changes updates the opened snapshot. Auto-saving the current workspace
  does not silently update a named snapshot.
- Open confirms replacement when appropriate, stops playback and restores at
  zero. Rename does not save current edits. Delete keeps the current workspace.
- Audio files are shared by reference between snapshots. Cleanup only reclaims
  an imported recording after its final saved/current reference is gone.
- Reload restores saved files/settings but not playback position and never
  autoplays. Localhost, Vercel, different browsers and devices have separate
  storage. There is no account or cloud synchronization.
- Missing/corrupt audio or unavailable storage displays a notice; keep originals.

Saved mixes contain configurations, not a rendered WAV/MP3 file.

## Verification

The 95 tests cover migration, separate regions, clear/enable preservation,
selection bounds and stereo detection, timeline bounds/snap/fades, mono/ringing
scheduling, bounded overlaps, finite isolated previews, cancellation, future
entries, source offsets, pause/resume across tempo changes, finite completion,
live controls, snapshots, shared audio references and source cleanup.

Browser checks exercise mouse and touch waveform selection, canceled gestures,
zoom and beat-length shortcuts, cut/ring auditions, keyboard timeline controls,
source-end/Loop feedback, independent regions, saving/reload and responsive
layouts at 320, 390, 768, 1024 and 1440 pixels.

## Source responsibilities

- App.jsx and StudioPages.css: four-page shell and persistent transport layout.
- hooks/useStudio.js: shared state, actions, persistence and engine lifecycle.
- components/ClipEditor.jsx and WaveformSelector.jsx: draft region editing.
- components/StepSequencer.jsx: rhythm controls, audition and tail feedback.
- components/Arrangement.jsx and TimelineClip.jsx: shared timeline interactions.
- lib/audioEngine.js: decoded buffers, normal playback and isolated auditions.
- lib/stepScheduler.js: scheduled rhythm voices and queued tempo changes.
- lib/rhythmState.js: independent sample metadata, initialization and tail policy.
- lib/audioSelection.js: selection geometry, detailed waveform and sound finding.
- lib/timelineEditing.js and arrangementState.js: validated window editing/fades.
- lib/studioState.js, savedMixes.js and audioStorage.js: serialization and storage.

## Source handoff

This update is based on main `884bb0a` plus the delivered four-page/Arrangement
source. The subsequently reported 82-test local revision was not available on
GitHub; its described independent-region and preserved-pattern behavior has
been implemented here and checked with the expanded suite. Commit local work
before applying this source bundle on a new branch, and review any additional
local changes rather than discarding them. For the first review, run
`npm run dev -- --port 5174` so the existing browser data at port 5173 stays
separate; compatibility with the unavailable local revision cannot be verified.

## Included audio and deployment

Actual recordings remain at public/audio/rain.mp3, birds.mp3 and music.mp3. Wind,
leaves, streams and other animals are not bundled; import recordings to use them.

| Recording | Source and permission/license |
| --- | --- |
| Rain | To be documented |
| Birds | To be documented |
| Music | To be documented |

Do not invent credits; document the actual recordings before presentation.

- Frontend: https://client-react-indol.vercel.app/
- Repository: https://github.com/nguyenntkpvnm21/client-react

This release runs in the frontend and does not call the garden API, implement
accounts, upload recordings to a server or perform stem separation.
