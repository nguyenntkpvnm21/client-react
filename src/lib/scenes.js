import { SOUNDS, createTrack } from '../data/sounds.js';
import { serializeMix } from './studioState.js';
import { fitFades } from './arrangementState.js';

// Reuse the three included recordings; no new sound licenses or downloads are required.
export const SCENES = [
  { id: 'rainy-night', name: 'Rainy night', icon: 'rain', color: 'var(--cyan)', duration: 60,
    description: 'Rain opens the room. Music slowly settles underneath.',
    layers: [{ id: 'rain', volume: 48, start: 0, end: 60, fadeIn: 2, fadeOut: 7 },
      { id: 'music', volume: 28, start: 3, end: 57, fadeIn: 6, fadeOut: 8 }] },
  { id: 'morning-birds', name: 'Morning birds', icon: 'birds', color: 'var(--accent)', duration: 60,
    description: 'Birdsong leads, with a soft musical layer arriving behind it.',
    layers: [{ id: 'birds', volume: 48, start: 0, end: 60, fadeIn: 2, fadeOut: 7 },
      { id: 'music', volume: 22, start: 4, end: 56, fadeIn: 7, fadeOut: 8 }] },
  { id: 'passing-shower', name: 'Passing shower', icon: 'leaf', color: 'var(--purple)', duration: 75,
    description: 'Rain passes through; birds and music carry the scene onward.',
    layers: [{ id: 'rain', volume: 40, start: 0, end: 45, fadeIn: 2, fadeOut: 15 },
      { id: 'birds', volume: 34, start: 6, end: 75, fadeIn: 12, fadeOut: 8 },
      { id: 'music', volume: 25, start: 3, end: 70, fadeIn: 8, fadeOut: 10 }] },
];

export function sceneMix(id) {
  const scene = SCENES.find((item) => item.id === id);
  if (!scene) throw new Error('This scene is unavailable.');
  return serializeMix({ master: 75, bpm: 100, arrangement: { enabled: true, duration: scene.duration },
    tracks: scene.layers.map(({ id: soundId, volume, ...placement }) => ({
      ...createTrack(SOUNDS.find((sound) => sound.id === soundId)), volume, placement,
    })) });
}

// A twelve-second intro excerpt with a short exit fade for the preview.
export function scenePreviewMix(id) {
  const mix = sceneMix(id);
  return { ...mix, arrangement: { ...mix.arrangement, duration: 12 },
    tracks: mix.tracks.map((track) => ({ ...track, placement: fitFades({ ...track.placement, end: 12, fadeOut: .5 }) })) };
}
