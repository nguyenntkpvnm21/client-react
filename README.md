# NatureMix

A personal audio studio built with React, Vite and Web Audio. Layer real nature
recordings with music, instrumentals, vocals and your own sounds. The interface
uses black/charcoal surfaces, restrained neon highlights and English labels.

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

The automated suite has 188 tests, plus 8 separate Focus Session tests. No additional testing dependency is required.

## Four pages, one workspace

| Page | Purpose |
| --- | --- |
| `#/studio` | Preview scene starters, import recordings, balance layers and edit normal clips. |
| `#/rhythm` | Choose rhythm samples, edit steps and audition individual patterns. |
| `#/arrangement` | Arrange tracks, loop a listening section and export the composition as WAV. |
| `#/saved-mixes` | Manage saved mixes and transfer editable project backups with audio. |

Only the selected page is rendered; the audio engine, current mix and shared
transport stay mounted. Navigation preserves mix playback and closes isolated
previews and sample editors. Leaving an editor discards its unapplied draft.

Hash navigation supports direct links, reload and browser Back/Forward without
server rewrites. Legacy `#studio`, `#rhythm`, `#arrangement` and `#saved-mixes`
links still work. Empty, unknown and `#my-sounds` links open Studio. Pages have
one h1, an active navigation link, a distinct document title and main focus.

## Black studio layout

The desktop frame follows a music-workspace layout: navigation and the current
project/layers sit on the left, the active page occupies the central canvas, and
Studio's sound library/import tools form a separate right column. Intermediate
widths use an icon rail; phones use a compact top navigation. Navigation labels,
current-page state, keyboard focus and direct page links remain available.

The player stays fixed along the bottom, with project information on the left,
play/restart/skip controls and seeking in the center, and Master on the right.
Phone controls reflow within the same player. Its measured height is reserved
below the page so final controls and forms remain reachable. Exact-time entry
opens above the player. Skip links reach the main content or playback controls.

Black and neutral gray are the main surfaces. Lime marks active navigation and
primary actions; cyan, purple and pink identify sound roles and selected audio.
Waveforms, rhythm hits and timeline cues carry color without tinting whole panels.
StudioTheme.css centralizes these surface/role rules and index.css owns tokens.
The layout update does not change the audio engine, saved-data format, import,
clip/sample regions, rhythm, arrangement, section looping or WAV rendering.

## Focused controls and clock times

Studio opens on the mixer. Starter scenes and source reuse expand when needed;
import stays next to the library. Mute, Solo and Repeat use readable labels.
Arrangement keeps the timeline and clip edits visible, with optional listening
loops, fade inputs, detailed help and secondary clip actions behind disclosures.
Hidden help never changes playback mode, clip data or saved projects.

Length, clip/sample boundaries, placement and listening-loop fields display m:ss
and accept both `1:30` and `90`. Decimals such as `0:00.18` remain available for
short samples and fades. The clock formatter removes redundant zeroes, handles
minute rollover and preserves millisecond values in editable fields. Audio/state
still uses seconds. Invalid input leaves applied settings unchanged.

UI review used the direct clip-editing patterns documented by
[Soundtrap](https://blog.soundtrap.com/?p=969) and
[Ableton](https://www.ableton.com/en/live-manual/11/arrangement-view/).
The three additional tests check clock display, rollover and parser round trips.

## Shared listening controls

The persistent transport has a position slider on all four pages. Click or drag
it to choose where to listen; touch works as well. The displayed time follows
the draft during dragging, and the audio engine seeks once on release. Canceling
a gesture leaves playback at its original clock. Arrows move five seconds,
Shift+Arrow moves 0.1 seconds, Home/End select the slider bounds, and Escape
cancels a draft. Back/Forward five-second buttons sit beside Play and Restart.

Click the current time to open Go to time. Enter seconds (`90`, `90.5`) or
minute notation (`1:30`, `1:30.5`). Invalid input leaves playback unchanged.
Escape or Cancel closes the form and restores focus to the time button.

A playing seek continues playing; a paused seek only moves the position. Seeks
cancel old sources and queued rhythm hits, load any missing durations and rebuild
at the correct source offsets, arrangement envelopes and grid phase. Newer seeks
supersede older decode requests. Paused seeks stay paused even when repeated
before loading finishes. Existing Solo/Mute/volume changes during loading apply
when playback resumes. The playhead holds its target during the short audio
scheduling lead-in instead of briefly moving backward.

Arrangement uses the composition duration. Seeking inside the listening loop
keeps that loop; outside disables it. Seeking from Studio, Rhythm or Saved mixes
does not enable Arrangement. Finite Free mix uses the longest selected normal
clip after durations load. Repeating Free mix shows infinity and offers a growing
slider window; Go to time can choose a later position without adding a stop time.
An unknown total shows `--:--` until audio loads. Seeking to a finite end stops
there; pressing Play again starts from the beginning.

Position is temporary. Seeking does not change clip/sample bounds, placements,
BPM, saved snapshots or the full duration of a WAV export. Isolated sample/pattern
auditions remain separate from the shared mix transport.

## Studio and importing

- Included recordings: Rain, Birds and Music, with search/category filters.
- Up to eight unique source recordings and 32 independent clips. Copies share audio.
- Up to 30 MiB per file and 15 minutes per recording, with a 1 GiB decoded-audio
  budget for the workspace. Playback decodes at 44.1 kHz, independent of the device
  sample rate. Eight four-minute stereo layers use about 646 MiB of PCM; compressed
  file sizes do not describe their playback memory usage.
- File reads and decoding run one at a time to limit temporary memory peaks.
  Requests and clips using the same source share one decode and PCM buffer. Under memory pressure,
  unused decoded recordings are released while mix layers and previews stay cached.
  Source files, saved mixes, stereo channels, pitch and timing remain unchanged.
  Browser/device memory can still limit very large mixes.
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

- **Edit audio** in Studio or Arrangement chooses the source for normal playback.
- **Edit sample** in Rhythm chooses the source repeated by rhythm hits.

Applying or resetting either region preserves the other. A layer uses one of
these playback paths at a time. Studio explains when Rhythm is currently active.
Old single-region workspaces retain their audible sample during migration; a
normal region overwritten by an older version cannot be inferred or recovered.

### Selecting audio without typing fractions

The editor loads actual decoded samples and offers:

1. Listen mode is the default. Click or tap to hear the recording at that point
   without changing the selected range. Recording audition has its own cursor
   and clock; it pauses the mix and leaves the shared mix position untouched.
2. Use the full-recording overview to locate an event. The detailed waveform
   opens an eight-second window there, with a time ruler. Set start here and
   Set end here mark the region while audition continues; Stop here retains the
   recording cursor. Preview completion also retains its last observed position.
3. Select region mode lets you drag a new selection. A tap alone still preserves
   it. Drag Move to shift the region, or either 44-pixel edge target to trim.
   Edge and Move controls support arrows (0.01 seconds) and Shift (0.001).
4. Zoom in/out, Show selection, Full recording, pan buttons and a full-recording
   overview to move through long recordings. Zoom regenerates waveform detail
   from that visible portion, including both stereo channels.
5. Rhythm duration shortcuts: quarter beat, one beat and two beats, starting at
   the recording cursor. These resize the draft; they do not change tempo or
   stretch the source recording.
6. Find next sound moves the draft to a later audible region, wrapping to the
   first detected region when necessary. Detection uses signal amplitude and can
   select noise or an imperfect onset; always audition it before applying.
7. Exact Start/End fields and sliders remain under an expandable section.

Selections are nondestructive and must be at least 0.05 seconds, unless the
recording itself is shorter. The editor changes a draft until Apply range or Use
this sample. Applying in Arrangement or Rhythm keeps the shared mix position
and its current play/pause intent; Studio normal-clip apply still restarts it.
Closing or navigating away discards the draft. Use full recording is removed
from the sample editor to avoid accidentally repeating a whole song per hit.

Hear sample inside Edit sample auditions the draft once. Preview clip does the
same for a normal clip draft. Both pause the mix and use a separate 40% audition gain, bypassing layer
mute/solo and Master. Stopping preview never automatically resumes the mix.

## Rhythm and pattern audition

A loop contains four beats and sixteen steps. BPM is an integer from 40 to 240,
defaulting to 100. A lit step starts the selected rhythm sample again; Four beats
does not divide a source recording into four different slices.

- Add drum beat adds Kick, Snare and Hi-hat with complementary starter patterns
  and starts the mix. They are original locally synthesized one-shots, packed
  into one ordinary WAV with three independent clip/sample ranges. All three
  rows use one source slot, one persisted blob and one decoded PCM buffer. The
  source and clip limits remain eight and 32. Add one drum is also available.
  Existing clips and playback mode are kept; a failure while preparing or saving
  the drums publishes none of the new rows. Drums travel in saved mixes and backups.
- Uninitialized recordings stay under Use a sample from your recordings. Choose
  sample opens a short audible draft without changing the mix. Use this sample
  initializes four beats and focuses the new row. Existing initialized rows stay
  visible, with level and Mute beside their grids. Adding drums also focuses the
  first new row; duplicate drum names receive a numbered suffix.
- Rhythm on/off controls whether the row contributes its pattern or normal clip
  to the full mix. Turning it on again restores the stored sample and steps,
  including an intentionally empty pattern. Re-enabling a stopped row does not
  start the mix automatically.
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

Chromium checks for this update include finding/marking a sample in a 3:20
recording, mouse and emulated touch selection/move/trim, Shift adjustments,
live drum edits, failed-storage preservation, save/reload, actual project
download and restore in a second profile, play/seek, and a downloaded six-second
stereo WAV exported while a shorter section loop was active. The shared drum
source and separate one-shots produced native rendered WAVs differing by at most
one 16-bit PCM level. Four pages at six viewport sizes (320–1440 px) were checked
for overflow, bottom actions and the time-entry popup. Physical touch devices,
Safari/Firefox and a beginner user study remain unverified. Rhythm still makes
one-bar sample patterns; it does not provide melodic instruments or song-length
pattern arrangement.

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

Arrangement length is 1–300 seconds, default 30. Each row is an independent clip with its own timing window.
All rows share a time axis; overlapping windows play together.

- Drag the middle of a clip to move it while preserving its length.
- Drag the bottom Entry/Exit handles to trim normal audio and its window. Loop trims preserve phase; trimming hatched silence does not invent more selected audio. Load the waveform first if needed.
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

Each clip currently occupies a separate row. Multiple clips inside one combined lane,
source slip handles, drag duplication and effects are not added. Use Duplicate
or Project sources to create another row referencing the same recording.

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

The 148 tests cover migration, separate regions, clear/enable preservation,
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

The shared-seek tests additionally check time parsing, cropped/unknown/repeating
bounds, paused and playing seeks, synchronized stems, fade/grid restoration,
finite completion, canceled/stale loading and current level routing. The native
Chromium check covers mouse drag-once behavior, touch, keyboard, exact time,
invalid input/focus, all four pages, section-loop boundaries, rapid paused seeks,
repeating Free mix, unchanged persisted metadata and full-length WAV output.
The existing eight Focus Session tests are checked separately.

Memory regressions cover six/eight four-minute stereo layers above the former
512 MiB limit, aligned playback and seeks, cache accounting, fixed decode rate,
serialized reads/decodes, duplicate requests, queued cancellation/failure and
eviction that preserves active layers and previews.

## Source responsibilities

- App.jsx and StudioPages.css: sidebar, four-page canvas and fixed bottom player.
- StudioTheme.css and index.css: neutral surfaces and neon role/selection tokens.
- hooks/useStudio.js: shared state, actions, persistence and engine lifecycle.
- components/ClipEditor.jsx and WaveformSelector.jsx: draft region editing.
- components/StepSequencer.jsx: rhythm controls, audition and tail feedback.
- components/Arrangement.jsx and TimelineClip.jsx: shared timeline interactions.
- components/ArrangementSection.jsx and ArrangementExport.jsx: listening/export UI.
- components/PlaybackSeek.jsx and lib/playbackTimeline.js: shared seek controls and time bounds.
- lib/loopRegion.js and arrangementLooper.js: session bounds and scheduled wraps.
- lib/audioGraph.js and renderArrangement.js: shared audio graph and WAV rendering.
- lib/audioEngine.js: decoded buffers, normal playback and isolated auditions.
- lib/stepScheduler.js: scheduled rhythm voices and queued tempo changes.
- lib/rhythmState.js: independent sample metadata, initialization and tail policy.
- lib/audioSelection.js: selection geometry, detailed waveform and sound finding.
- lib/timelineEditing.js and arrangementState.js: validated window editing/fades.
- lib/studioState.js, savedMixes.js and audioStorage.js: serialization and storage.
- lib/audioSources.js and clipInstances.js: shared source references and independent clip operations.
- components/SourcePool.jsx: reusable project recordings and clip creation.
- lib/projectBackup.js and components/ProjectTransfer.jsx: portable project format and transfer UI.
- lib/scenes.js and components/SceneStarters.jsx: editable starter arrangements and previews.

## Project backups and scene starters

Saved mixes remain local to one browser. In Saved mixes, **Download project**
creates a `.naturemix` file containing the current workspace (including unsaved
metadata changes) and one copy of each source recording, including unused sources. Apply open clip or
placement drafts first. WAV export remains a finished audio render; project
backup is the editable form. Playback position, audition loops and editor drafts
are session state and are not included.

Restore project file checks the container, exact metadata, layer counts, sizes
and SHA-256 hashes before offering a name. Restore as new mix verifies audio
by decoding one layer at a time and immediately releasing its PCM, then commits
the audio and a new saved entry in one IndexedDB transaction. Cancellation is
available before the final storage commit. Failed writes roll back the whole
transaction. Existing projects and the current workspace remain open and
unchanged. Open the restored entry separately when ready.

Included sounds are embedded too. On restore each source gets a fresh private
import ID and its clips retain their shared reference, so a future library URL/content change does not change the restored
sound. A restored Rain layer is therefore independent of the library Rain
button and the base-blend shortcuts. No storage schema migration is required.

The binary container uses an 8-byte `NMIXPK01` signature, a 4-byte
big-endian JSON length, UTF-8 metadata, then concatenated original audio blobs.
New backups have version-2 metadata with shared source references; version-1
backups are still accepted. Older builds cannot read the new version-2 files.
Metadata is limited to 256 KiB; audio retains the existing 8-source and 30 MiB
per-file limits. Hashing and reads are sequential; audio is not converted to
base64 or PCM when backing up. The file is not a ZIP, is not encrypted, and
is intended to be opened with NatureMix. Only share a project file with people
who should receive its included recordings.

Studio offers three editable scene starters: Rainy night (60 s), Morning birds
(60 s) and Passing shower (75 s). They reuse the included recordings with
curated levels, staggered entries and fades. Hear scene plays a finite 12-second
intro preview with an exit fade. Preview pauses the workspace at its existing
position without changing its mix; Play mix returns to that workspace. The
shared player identifies scene playback and provides a stop button. Preview
reuses cached library buffers and checks its additional decoded memory against
the existing workspace budget. Leaving the
page, hiding the tab, starting mix playback or closing an editor stops it.

Use scene first asks whether to replace the workspace, with a route to save or
back it up. The confirmation receives focus and scrolls its actions into view;
canceling returns focus to the scene button. Start scene then opens its normal
editable layers and Arrangement;
no automatic playback or named save is triggered. Existing saved mixes keep
their audio. Add an imported vocal/instrumental and continue with the existing
clip, rhythm, timeline and WAV tools.

## Reusing, cutting and layering recordings

Project sources separates original files from the clips using them. Import a
recording once, then use **Add clip** or **Duplicate** without another upload.
Every clip has independent normal/rhythm ranges, level, Solo/Mute, loop setting,
timing and fades. Editing or deleting a clip never changes its siblings. The
source stays available after the last clip is removed. Remove source appears
only when it is unused; saved mixes still protect their referenced originals.

A practical flow is to import Vocal, Beat and FX, duplicate Vocal and Beat,
then use Edit audio in Arrangement to choose different source ranges. Move the
rows into overlapping windows to layer the sound. Project sources in Arrangement
is expandable; Add clip inserts at the current playhead. Studio also exposes
Project sources and Duplicate clip. There are up to 8 sources and 32 clips.

Pause at a cut point and choose **Split at playhead** on the desired normal row.
Both parts must have at least 0.05 s of audible audio. A one-shot split creates
adjacent source ranges; a looping split preserves the original region and loop
phase. Both preserve the original fade curve, including a cut inside a fade.
Move a split clip to translate that fade segment; editing its fades establishes
a new independent envelope. Split is disabled for rhythm patterns; patterns
can still be duplicated and edited independently.

Bottom timeline edges trim normal audio; numeric Edit timing remains a window
placement tool. Edit audio opens the full waveform selector at that row, with
zoom, visual selection, exact times and isolated preview. Applying an audio
range there keeps the workspace cursor and play/pause intent. Studio's existing
normal-clip apply behavior remains unchanged. Duplicate and split also retain
the current cursor, with the new clip focused/scrolled into view.

Mix metadata adds a source registry and sourceId on clips. Old workspace and
saved records are normalized on read; IndexedDB remains schema 2. Imported blobs
are stored by source ID. Deletion reclaims audio only after its final workspace
source or saved-project reference is gone. The engine caches one PCM buffer and
one pending decode per source, exposing clip aliases to existing playback,
waveform, rhythm and offline-render code. Memory counts unique buffers. Removing
one clip does not abort or free audio used by a sibling; clearing a project
invalidates all its outstanding aliases.

## Source handoff

This update is based on main `f2ca92d`, including project/scene commit `d972399`
and its phone confirmation-focus fix. It keeps the four pages, black/neon theme,
44.1 kHz serialized decoding, 1 GiB memory budget, scene starters, loop audition,
WAV export and imported/saved audio. No dependency, audio asset or database
schema changes are required.

Tests cover 3 sources producing 5 clips; 32 clips sharing one four-minute PCM
allocation; isolated controls/ranges; one-shot/loop splits; inherited fades;
trimming; pending-load cancellation; migration; source lifetime; and project v2
round trips with one payload per source. Version-1 project files remain readable.
Touching scaled fades retain their ramps at split/seek boundaries, including
floating-point rounding when fade-in and fade-out meet without a plateau.
Native Chromium checks cover actual import/duplicate/split/trim/save/reload,
cross-profile backup/restore/play/export, source retention and saved-reference
cleanup, 24 page/size combinations from 320–1440 px, touch controls and focus.
Native WAV comparisons before/after splits inside fades and loops differ by at
most one 16-bit PCM quantization level in the tested fixtures. Firefox, Safari,
physical phones and virtual keyboards are not verified here.

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
