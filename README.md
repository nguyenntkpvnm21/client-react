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

The automated suite has 129 tests. No additional testing dependency is required.

## Four pages, one workspace

| Page | Purpose |
| --- | --- |
| `#/studio` | Import recordings, browse sounds, balance layers and edit normal clips. |
| `#/rhythm` | Choose rhythm samples, edit steps and audition individual patterns. |
| `#/arrangement` | Arrange tracks, loop a listening section and export the composition as WAV. |
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

Hear sample inside Edit sample auditions the draft once. Preview clip does the
same for a normal clip draft. Both pause the mix and use a separate 40% audition gain, bypassing layer
mute/solo and Master. Stopping preview never automatically resumes the mix.

## Rhythm and pattern audition

A loop contains four beats and sixteen steps. BPM is an integer from 40 to 240,
defaulting to 100. A lit step starts the selected rhythm sample again; Four beats
does not divide a source recording into four different slices.

- Create rhythm initializes steps 1, 5, 9 and 13 only on first creation. If no
  sample was selected, it starts with up to 0.18 seconds from the recording.
- Rhythm on/off controls whether the row contributes its pattern or normal clip
  to the full mix. Turning it on again restores the stored sample and steps,
  including an intentionally empty pattern. Re-enabling a stopped row does not
  start the mix automatically. First-time Create rhythm still starts playback.
- Initialized rows keep their grid visible and editable while off in the mix.
- Pattern options contains Four beats, Clear steps and Sample tails. Four beats
  replaces only the steps; Clear leaves them intentionally empty. Less-used
  controls stay collapsed until needed.
- Step edits remain live. BPM changes apply at the next loop boundary. Normal
  ambience and music are not time-stretched or tempo-matched.

**Hear rhythm** sits beside each grid and auditions one row independently: one sixteen-step loop, then
any remaining ringing tails. It uses the current BPM, pauses and preserves the
mix position, bypasses mute/solo/Master and ignores Arrangement windows. The row
shows preview progress. Step edits during an active audition update upcoming hits
without stopping it or restarting the loop. Already passed steps are heard on the
next audition. Editing during loading cancels that stale pending audition.
Stop preview, sample/tail-policy/speed changes, navigation, project opening,
removal, hidden-tab handling and disposal cancel pending/scheduled audition audio.
A cleared pattern has no preview hits. Play full mix remains a distinct shared
playback action; Hear sample is available inside the sample editor.

### Sample tails

- **Cut at next hit** preserves legacy monophonic behavior. A hit stops at the
  next lit step on the same row, its source end or Arrangement exit.
- **Let samples ring** allows overlapping tails and plays each selected sample
  through its source end, still respecting Arrangement exit.

At 120 BPM, Four beats starts a sample every 0.5 seconds. A four-second selection
is cut to roughly 0.5 seconds per hit in Cut mode. Pattern options flags this
truncation in its summary and explains selection length and hit spacing inside. Choose a
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

Click/tap the time ruler to enable Arrangement and play from that time. Arrow
keys select a position and pause, Shift makes 0.01-second adjustments, Home/End
select the start/end and Enter/Space plays. Selecting the composition end finishes
without jumping back to zero. Changing position cancels pending loading requests,
old sources, rhythm hits and completion timers before rebuilding at the chosen
time. Local source offsets, fades, rhythm phase and Entry/Exit limits still apply.
The playback position is temporary and is not included in saved snapshots.

### Loop a listening section

Listen to a section sits above the ruler. Drag across its strip to select a new
range, drag the center to move it, or drag either edge. The two handles occupy
separate vertical rows so small selections remain selectable on touch screens.
Snap to beats applies here as well. Arrow keys move selection controls; Shift
makes 0.01-second adjustments. Exact section times and keyboard help expands
numeric fields when needed. Sections must be at least 0.25 seconds long.

Play loop enables Arrangement and repeats that region. Pause loop preserves the
position; Play resumes inside the section. Restart returns to the section start.
Turning the loop off continues at the current position when playing. Play full
arrangement exits the loop and starts the composition at zero. A ruler seek
inside the range keeps looping; a seek outside it turns looping off.

The audio clock schedules each wrap ahead of time. Each pass keeps the original
source offsets, Entry/Exit, fades and beat-grid coordinates; samples cannot ring
past the section end. Solo, Mute, volume, pattern and placement edits remain live.
BPM changes take effect at the next section wrap. Missed background callbacks skip
old passes rather than producing a burst; section playback pauses in hidden tabs.

This is a session-only audition region. It does not trim source recordings,
change layer timing or limit an export. Navigation preserves it. Reload, opening
a saved mix, changing composition length and switching to Free mix reset it.

### Export the full arrangement

Export your arrangement creates a stereo 44.1 kHz, 16-bit PCM WAV entirely in the
browser. The file covers zero through the composition end, regardless of the
current transport position, Free mix mode or listening loop. Solo, explicit Mute,
layer/Master levels, normal clip Loop, independent rhythm samples, tail policies,
Entry/Exit and fades all apply. A one-shot does not automatically repeat.

Playback pauses and keeps its position. Editing and project changes are locked
while export runs; navigation and Cancel export stay available. The offline
renderer shares source/voice/envelope scheduling and the master compressor with
live playback. It does not record in real time or add normalization/mastering.
The result downloads with the chosen name; a Download link remains available if
the browser blocks automatic downloads. A new export replaces the previous link.

Progress shows loading, rendering and WAV encoding. Cancellation discards the
result and creates no file. A browser's native offline render cannot be aborted
mid-computation, so Canceling may remain visible until that stage finishes.
Large exports use more memory (about 50.5 MiB of PCM WAV for five minutes, plus
working audio buffers). No server, account, new package or saved-project schema
change is required.

Every Arrangement row has Solo and Mute/Unmute controls, using the same saved
controls as Studio. Solo isolates selected layers while preserving their timings
and fades; it does not restart sources or move the playhead. Multiple solos are
allowed. A muted solo remains silent until unmuted. Clear solos restores the mix
without changing mute or volume settings. Use Solo and the time ruler together
to listen to the entrance, exit or fade you are editing.

There is currently one placement per layer. Multiple clips on one track, source
slip editing, drag duplication and effects are not added.

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

The 129 tests cover migration, separate regions, clear/enable preservation,
selection bounds and stereo detection, timeline bounds/snap/fades, mono/ringing
scheduling, bounded overlaps, finite isolated previews, cancellation, future
entries, source offsets, pause/resume across tempo changes, finite completion,
live controls, snapshots, shared audio references and source cleanup. New cases
cover seeks into fades, silence before/after a window, rhythm phase/tails,
canceling stale decodes, clean end-of-timeline selection, Solo/Mute routing,
live finite-audition edits and migration of nested sequence sample bounds. Section
tests check exact wraps, source offsets, original fades, restored rhythmic tails,
future-edit gating, queued tempo, live routing and source/timer cleanup. Export
tests check full-length scheduling, sample independence, one-shots, PCM headers,
interleaving, clipping, cancellation and failure cleanup.

Browser checks exercise mouse and touch waveform selection, canceled gestures,
zoom and beat-length shortcuts, cut/ring auditions, keyboard timeline controls,
source-end/Loop feedback, independent regions, saving/reload and responsive
layouts at 320, 390, 768, 1024 and 1440 pixels.

The listening-flow browser check also exercised ruler mouse/keyboard playback,
Solo/Mute/Clear without source restarts, live rhythm audition edits, off-row editing,
collapsed pattern options, independent samples and save/reload without autoplay.
The export browser check verifies audio-clock wrap spacing, mouse/keyboard/touch
selection, outside-section seek, full-arrangement playback, actual downloaded WAV
length and audio energy in intro/fades/body/outro, cut/ring output, canceled native
rendering, reload reset and all four page widths from 320 to 1440 pixels.

## Source responsibilities

- App.jsx and StudioPages.css: four-page shell and persistent transport layout.
- hooks/useStudio.js: shared state, actions, persistence and engine lifecycle.
- components/ClipEditor.jsx and WaveformSelector.jsx: draft region editing.
- components/StepSequencer.jsx: rhythm controls, audition and tail feedback.
- components/Arrangement.jsx and TimelineClip.jsx: shared timeline interactions.
- components/ArrangementSection.jsx and ArrangementExport.jsx: listening/export UI.
- lib/loopRegion.js and arrangementLooper.js: session bounds and scheduled wraps.
- lib/audioGraph.js and renderArrangement.js: shared audio graph and WAV rendering.
- lib/audioEngine.js: decoded buffers, normal playback and isolated auditions.
- lib/stepScheduler.js: scheduled rhythm voices and queued tempo changes.
- lib/rhythmState.js: independent sample metadata, initialization and tail policy.
- lib/audioSelection.js: selection geometry, detailed waveform and sound finding.
- lib/timelineEditing.js and arrangementState.js: validated window editing/fades.
- lib/studioState.js, savedMixes.js and audioStorage.js: serialization and storage.

## Source handoff

This update is based on main `57e4d5612f15fef2478649561e0c29a40cad0b00`
(`feat: add timeline audition and simplify rhythm controls`), the 111-test release.
It preserves the four pages, timeline seek, Solo/Mute and simplified Rhythm.
The handoff patch contains only source, documentation and tests; audio files,
dependencies and the lockfile remain unchanged. Apply on a clean branch, run the
checks above, then review and commit. For a separate browser-storage review, run
`npm run dev -- --port 5174`.

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
