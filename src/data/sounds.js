export const MAX_TRACKS = 8; // Unique source recordings.
export const MAX_CLIPS = 32;
export const MAX_FILE_BYTES = 30 * 1024 * 1024;
export const ROLES = [
  { id: 'nature', label: 'Nature sound' },
  { id: 'music', label: 'Music / instrumental' },
  { id: 'vocal', label: 'Vocal' },
];

export const SOUNDS = [
  { id: 'rain', name: 'Rain', role: 'nature', icon: 'rain', src: '/audio/rain.mp3', description: 'A little weather for your world.', volume: 30, loop: true },
  { id: 'birds', name: 'Birds', role: 'nature', icon: 'birds', src: '/audio/birds.mp3', description: 'Let the outside find its way in.', volume: 20, loop: true },
  { id: 'music', name: 'Music', role: 'music', icon: 'music', src: '/audio/music.mp3', description: 'An included musical layer.', volume: 50, loop: true },
];

export function createTrack(sound) {
  return { id: sound.id, catalogId: sound.id, name: sound.name, role: sound.role,
    volume: sound.volume, muted: false, solo: false, loop: sound.loop };
}
