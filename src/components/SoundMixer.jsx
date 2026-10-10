import { useEffect, useState } from 'react';
import './SoundMixer.css';

const STORAGE_KEY = 'nature-mixer-settings-v1';

const INITIAL_TRACKS = [
  { id: 'music', name: 'Music', icon: '🎵', volume: 50, muted: false },
  { id: 'rain', name: 'Rain', icon: '🌧️', volume: 30, muted: false },
  { id: 'birds', name: 'Birds', icon: '🐦', volume: 20, muted: false },
];

function loadTracks() {
  try {
    const savedTracks = JSON.parse(localStorage.getItem(STORAGE_KEY));

    if (!Array.isArray(savedTracks)) return INITIAL_TRACKS;

    return INITIAL_TRACKS.map((track) => {
      const savedTrack = savedTracks.find((item) => item?.id === track.id);

      return {
        ...track,
        volume:
          Number.isInteger(savedTrack?.volume) &&
          savedTrack.volume >= 0 &&
          savedTrack.volume <= 100
            ? savedTrack.volume
            : track.volume,
        muted:
          typeof savedTrack?.muted === 'boolean'
            ? savedTrack.muted
            : track.muted,
      };
    });
  } catch {
    return INITIAL_TRACKS;
  }
}

export default function SoundMixer() {
  const [tracks, setTracks] = useState(loadTracks);

  useEffect(() => {
    try {
      const settings = tracks.map(({ id, volume, muted }) => ({ id, volume, muted }));
      localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    } catch (error) {
      console.warn('Unable to save mixer settings:', error);
    }
  }, [tracks]);

  function updateTrack(id, changes) {
    setTracks((previousTracks) =>
      previousTracks.map((track) =>
        track.id === id ? { ...track, ...changes } : track
      )
    );
  }

  return (
    <section className="clean-card sound-mixer" aria-labelledby="mixer-title">
      <h2 id="mixer-title">Sound Mixer</h2>
      <p className="mixer-description">Build your own peaceful soundscape.</p>

      <div className="mixer-tracks">
        {tracks.map((track) => (
          <div className="mixer-track" key={track.id}>
            <label htmlFor={`volume-${track.id}`}>
              <span aria-hidden="true">{track.icon}</span> {track.name}
            </label>

            <input
              id={`volume-${track.id}`}
              type="range"
              min="0"
              max="100"
              step="1"
              value={track.volume}
              disabled={track.muted}
              onChange={(event) =>
                updateTrack(track.id, { volume: Number(event.target.value) })
              }
            />

            <output htmlFor={`volume-${track.id}`} className="mixer-volume">
              {track.muted ? 'Muted' : `${track.volume}%`}
            </output>

            <button
              type="button"
              className="mixer-mute"
              aria-label={`Mute ${track.name}`}
              aria-pressed={track.muted}
              onClick={() => updateTrack(track.id, { muted: !track.muted })}
            >
              {track.muted ? 'Unmute' : 'Mute'}
            </button>
          </div>
        ))}
      </div>
    </section>
  );
}
