import { useState } from 'react';
import './SoundMixer.css';

const INITIAL_TRACKS = [
  { id: 'music', name: 'Music', icon: '🎵', volume: 50, muted: false },
  { id: 'rain', name: 'Rain', icon: '🌧️', volume: 30, muted: false },
  { id: 'birds', name: 'Birds', icon: '🐦', volume: 20, muted: false },
];

export default function SoundMixer() {
  const [tracks, setTracks] = useState(INITIAL_TRACKS);

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
