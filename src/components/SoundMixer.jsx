import { useEffect, useRef, useState } from 'react';
import './SoundMixer.css';
import Icon from './Icon';

const STORAGE_KEY = 'nature-mixer-settings-v1';

const INITIAL_TRACKS = [
  { id: 'music', name: 'Music', icon: 'music', src: '/audio/music.mp3', volume: 50, muted: false },
  { id: 'rain', name: 'Rain', icon: 'rain', src: '/audio/rain.mp3', volume: 30, muted: false },
  { id: 'birds', name: 'Birds', icon: 'birds', src: '/audio/birds.mp3', volume: 20, muted: false },
];

const MIX_PRESETS = [
  { id: 'balanced', name: 'Balanced', volumes: { music: 50, rain: 30, birds: 20 } },
  { id: 'rainy-focus', name: 'Rainy Focus', volumes: { music: 30, rain: 60, birds: 0 } },
  { id: 'birdsong', name: 'Birdsong', volumes: { music: 25, rain: 0, birds: 60 } },
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
  const [playbackState, setPlaybackState] = useState('ready');
  const [playbackError, setPlaybackError] = useState('');
  const audioRefs = useRef({});
  const playbackRequested = useRef(false);
  const playbackRequestId = useRef(0);
  const trackPlaybackStates = useRef({});

  useEffect(() => {
    try {
      const settings = tracks.map(({ id, volume, muted }) => ({ id, volume, muted }));
      localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    } catch (error) {
      console.warn('Unable to save mixer settings:', error);
    }
  }, [tracks]);

  useEffect(() => {
    tracks.forEach((track) => {
      const audio = audioRefs.current[track.id];
      if (audio) {
        audio.volume = track.volume / 100;
        audio.muted = track.muted;
      }
    });
  }, [tracks]);

  useEffect(() => {
    const audioElements = Object.values(audioRefs.current);

    return () => {
      playbackRequested.current = false;
      playbackRequestId.current += 1;
      audioElements.forEach((audio) => audio?.pause());
    };
  }, []);

  function pausePlayback(nextState = 'paused') {
    playbackRequested.current = false;
    playbackRequestId.current += 1;
    Object.values(audioRefs.current).forEach((audio) => audio?.pause());
    setPlaybackState(nextState);
  }

  function failPlayback(message) {
    pausePlayback('error');
    setPlaybackError(message);
  }

  function markTrackPlayback(id, state) {
    if (!playbackRequested.current) return;

    trackPlaybackStates.current[id] = state;
    const states = INITIAL_TRACKS.map((track) => trackPlaybackStates.current[track.id]);

    if (states.every((value) => value === 'playing')) {
      setPlaybackState('playing');
    } else if (states.includes('buffering')) {
      setPlaybackState('buffering');
    } else {
      setPlaybackState('loading');
    }
  }

  async function togglePlayback() {
    if (playbackRequested.current) {
      pausePlayback();
      return;
    }

    playbackRequested.current = true;
    const requestId = ++playbackRequestId.current;
    trackPlaybackStates.current = Object.fromEntries(
      tracks.map((track) => [track.id, 'loading'])
    );
    setPlaybackError('');
    setPlaybackState('loading');

    try {
      await Promise.all(tracks.map((track) => {
        const audio = audioRefs.current[track.id];
        if (!audio) throw new Error(`${track.name} audio is unavailable.`);

        if (audio.error) audio.load();
        audio.volume = track.volume / 100;
        audio.muted = track.muted;

        return audio.play().catch((error) => {
          const message = error.name === 'NotAllowedError'
            ? 'Playback was blocked. Press Play to try again.'
            : `Unable to play ${track.name}. Check ${track.src} and try again.`;
          throw new Error(message, { cause: error });
        });
      }));

      if (requestId !== playbackRequestId.current || !playbackRequested.current) return;

      tracks.forEach((track) => {
        const audio = audioRefs.current[track.id];
        markTrackPlayback(track.id, audio.readyState >= 3 ? 'playing' : 'buffering');
      });
    } catch (error) {
      if (requestId !== playbackRequestId.current || !playbackRequested.current) return;
      failPlayback(error.message);
    }
  }

  function updateTrack(id, changes) {
    setTracks((previousTracks) =>
      previousTracks.map((track) =>
        track.id === id ? { ...track, ...changes } : track
      )
    );
  }

  function resetTracks() {
    setTracks(INITIAL_TRACKS.map((track) => ({ ...track })));
  }

  function applyPreset(preset) {
    setTracks((previousTracks) => previousTracks.map((track) => ({
      ...track,
      volume: preset.volumes[track.id],
      muted: preset.volumes[track.id] === 0,
    })));
  }

  return (
    <section className="panel sound-mixer" aria-labelledby="mixer-title">
      <div className="panel-heading">
        <div><p className="eyebrow">YOUR BACKGROUND, YOUR WAY</p><h2 id="mixer-title">Sound mixer</h2></div>
        <span className="icon-tile"><Icon name="headphones" /></span>
      </div>
      <p className="mixer-description">A soundscape that feels like you.</p>

      {tracks.map((track) => (
        <audio
          key={track.id}
          ref={(element) => { audioRefs.current[track.id] = element; }}
          src={track.src}
          loop
          preload="none"
          muted={track.muted}
          onPlaying={() => markTrackPlayback(track.id, 'playing')}
          onWaiting={() => markTrackPlayback(track.id, 'buffering')}
          onPause={(event) => {
            if (playbackRequested.current && event.currentTarget.paused) {
              failPlayback('Playback was interrupted. Press Play to resume.');
            }
          }}
          onError={() => failPlayback(`Unable to load ${track.name}. Check ${track.src} and try again.`)}
        />
      ))}

      <fieldset className="mixer-presets">
        <legend>Choose a mood</legend>
        <div className="mixer-preset-options">
          {MIX_PRESETS.map((preset) => (
            <button
              key={preset.id}
              type="button"
              className="mixer-preset"
              aria-pressed={tracks.every((track) =>
                track.volume === preset.volumes[track.id] &&
                track.muted === (preset.volumes[track.id] === 0)
              )}
              onClick={() => applyPreset(preset)}
            >
              {preset.name}
            </button>
          ))}
        </div>
      </fieldset>

      <div className="mixer-tracks">
        {tracks.map((track) => (
          <div className="mixer-track" key={track.id}>
            <label htmlFor={`volume-${track.id}`} className="mixer-track-label">
              <span className={`track-icon ${track.id}`}><Icon name={track.icon} size={20} /></span>
              <span><strong>{track.name}</strong><span>{{
                music: 'Background music', rain: 'Rain ambience', birds: 'Bird ambience',
              }[track.id]}</span></span>
            </label>
            <output htmlFor={`volume-${track.id}`} className="mixer-volume">
              {track.muted ? 'Muted' : `${track.volume}%`}
            </output>
            <button
              type="button"
              className="mixer-mute"
              aria-label={`${track.muted ? 'Unmute' : 'Mute'} ${track.name}`}
              title={`${track.muted ? 'Unmute' : 'Mute'} ${track.name}`}
              aria-pressed={track.muted}
              onClick={() => updateTrack(track.id, { muted: !track.muted })}
            >
              <Icon name={track.muted ? 'muted' : 'volume'} size={17} />
            </button>
            <input
              id={`volume-${track.id}`}
              type="range"
              min="0"
              max="100"
              step="1"
              value={track.volume}
              disabled={track.muted}
              style={{ '--volume-level': `${track.volume}%` }}
              onChange={(event) =>
                updateTrack(track.id, { volume: Number(event.target.value) })
              }
            />
          </div>
        ))}
      </div>

      <div className="mixer-actions">
        <button type="button" className="button button-primary mixer-play" onClick={togglePlayback}>
          <Icon name={['loading', 'playing', 'buffering'].includes(playbackState) ? 'pause' : 'play'} size={17} />
          {['loading', 'playing', 'buffering'].includes(playbackState) ? 'Pause mix' : 'Play mix'}
        </button>
        <button type="button" className="button mixer-reset" onClick={resetTracks}>
          <Icon name="reset" size={16} />Reset mixer
        </button>
      </div>

      <p className={`mixer-status ${playbackState}`} role="status" aria-live="polite">
        <span className="mixer-status-dot" />
        {{
          ready: 'Ready to set the mood.',
          loading: 'Starting your soundscape...',
          playing: 'Your soundscape is playing.',
          buffering: 'Buffering audio...',
          paused: 'Your soundscape is paused.',
          error: playbackError,
        }[playbackState]}
      </p>
      <div className="mixer-tip"><Icon name="headphones" size={17} /><span>A good pair of headphones makes a little world of difference.</span></div>
    </section>
  );
}
