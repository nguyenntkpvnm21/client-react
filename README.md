# NatureMix

A personal creative audio studio built with React and Vite. Layer real nature recordings with music, instrumentals, vocals, and your own sounds.

NatureMix is the current working name. This is a personal web homework project, developed independently of the StemForge group project.

## Current features

- Dark nature-inspired interface with restrained neon-green accents and responsive layouts.
- Included Rain, Birds, and Music recordings, with search and category filters.
- Dynamic mixer with up to eight layers.
- Multiple local file import with Nature, Music / instrumental, and Vocal roles.
- Independent volume, mute, solo, loop, track removal, and master volume.
- Balanced, Rainfall, and Birdsong base blends.
- Web Audio playback with a common scheduled start and timeline position.
- Play, Pause, and Restart; pause excludes paused time.
- Waveform summaries calculated from actual decoded audio.
- Mixer settings saved locally, including track membership and role.
- Imported audio stored in IndexedDB and restored after reload.
- English errors for missing, unsupported, invalid, oversized, and unavailable audio.
- Existing mixer levels/mute migrate from the previous settings key.
- The earlier Focus/Break dashboard is no longer rendered.

Wind, leaves, streams, and animals are not bundled yet. Import real recordings to use those sounds.

## Run locally

Use a Node.js version supported by the installed Vite version. The current lockfile requires Node 20.19+ or Node 22.12+.

1. Clone the repository.
2. Run npm install if dependencies are not installed.
3. Run npm run dev.
4. Open the Local URL printed by Vite.

Commands:

    npm run dev
    npm run lint
    npm run test
    npm run build
    npm run preview

The test script runs 13 tests across tests/studio.test.js and tests/audioEngine.test.js. It does not require another testing dependency.

## Included audio

The user-supplied assets remain in:

    public/audio/rain.mp3
    public/audio/birds.mp3
    public/audio/music.mp3

Their public URLs are /audio/rain.mp3, /audio/birds.mp3, and /audio/music.mp3.

| Asset | Source and permission/license |
| --- | --- |
| Rain | To be recorded |
| Birds | To be recorded |
| Music | To be recorded |

Do not invent asset credits. Document the actual recordings before the final presentation.

## Importing custom audio

Choose an import role, click Import audio, and select one or more files. Each file is validated and decoded before it becomes a mixer layer.

- Up to eight total layers.
- Up to 30 MiB per file and 15 minutes per recording.
- Formats depend on browser decoding support; common MP3, WAV, OGG, FLAC, and M4A files are accepted for decoding.
- Nature imports loop by default. Music/instrumental and vocal imports do not.
- Changing a role does not automatically change an existing loop setting.
- Removing a custom layer also removes its stored local audio copy. The original file on the user's computer is not modified.
- Reload restores the saved mix but never automatically starts playback.
- The transport position resets on reload; this version saves settings/files, not the position across visits.

Import is local browser processing, not a cloud upload. Clearing browser site data removes saved files/settings. Localhost and Vercel have separate storage; data does not synchronize across browsers or devices.

If browser storage fails, the interface explains that files/settings may only remain available in the current tab. Keep the original recordings.

## Playback behavior

The engine uses one AudioContext and schedules loaded sources at a shared audio-clock time and offset. Matching stems should come from the same separation result and preserve the same source timeline.

This aligns playback timing. It does not detect BPM, match musical key, remove leading silence, time-stretch audio, or correct errors in a separation output.

- Independent nature loops wrap at their own recording duration.
- Non-looping music and vocal layers stop at their end; looping nature layers can continue.
- A layer added during playback joins at the current timeline position. Restart starts every layer from the beginning.
- Volume/mute/solo/master adjustments do not recreate active sources.
- Solo selects audible layers, but an explicitly muted solo layer remains silent.
- Master volume zero intentionally plays silently.
- A canceled loading request cannot later start playback.
- Pause stops all active source nodes; Resume creates sources at the saved in-visit offset.
- A compressor reduces excessive summed peaks. It is not a mastering or loudness-normalization tool.
- A 512 MiB decoded-audio budget prevents an excessively large working mix. Decoded audio can be much larger than the source files.
- Missing or undecodable audio prevents startup and displays an error; a retry is available.
- StrictMode and unmount cleanup must not create duplicate playback.

## Source responsibilities

- src/App.jsx and src/App.css: studio composition and layout.
- src/components/SoundLibrary.jsx: actual included catalog/search.
- src/components/AudioImport.jsx: local import.
- src/components/MixWorkspace.jsx: blends, mixer, transport, and master controls.
- src/components/TrackControl.jsx: layer controls and waveform summaries.
- src/components/Icon.jsx: SVG icons.
- src/data/sounds.js: catalog and import limits.
- src/hooks/useStudio.js: UI state, persistence, import, and audio lifecycle.
- src/lib/audioEngine.js: decoded audio, routing, scheduling, and cleanup.
- src/lib/audioStorage.js: local imported-file storage.
- src/lib/studioState.js: validation, settings migration, and serialization.

Legacy focus/mixer source files may remain in an existing checkout, but the new App does not import the old dashboard. Existing focus history is not erased.

## Verification

Automated tests cover settings migration, malformed storage, duplicate IDs, metadata serialization, file validation, mute/solo, common scheduling, pause/resume, live controls, canceled decoding, retry, source cleanup, old completion events, recording duration, and decoded-memory limits.

Manual checks:

1. Play the included mix.
2. Adjust volume, mute, solo, loop, and master.
3. Pause; confirm the position remains still. Resume and Restart.
4. Import an instrumental and vocal, then Restart and Play.
5. Reload; confirm custom files, track roles, and levels restore.
6. Remove a custom layer; reload and confirm it stays removed.
7. Try an invalid file and confirm an actionable error.
8. Remove every layer; verify the empty workspace and disabled Play.
9. Add a catalog sound again.
10. Check desktop/mobile layout and keyboard focus.

## StemForge workflow

The intended workflow is to separate a favorite song on the group project, download its instrumental/vocal outputs, and import them here. Verify the actual group-project separation/export capability when running the full demonstration.

There is no direct API connection between these two sites in this release. Matching downloadable audio files are the integration boundary.

## Next milestones

- Named mix projects.
- Sample trimming and selected-region looping.
- Rhythm patterns made from short nature samples.
- Clip arrangement, fades, and selected effects.
- Defined-duration audio rendering/export.
- More real catalog recordings and documented credits.
- Optional cloud persistence if multi-device access becomes useful.

## Deployments

- Frontend: https://client-react-indol.vercel.app/
- Client repository: https://github.com/nguyenntkpvnm21/client-react
- Existing personal API: https://server-api-1-4i16.onrender.com/

This release runs in the frontend. It does not call the garden API or implement server uploads, accounts, or stem separation.
