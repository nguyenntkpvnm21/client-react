import { useEffect, useRef, useState } from 'react';
import { clockTime } from '../lib/timeFormat.js';

const MAX_RECORDING_MS = 5 * 60 * 1000;
const stopTracks = stream => stream?.getTracks().forEach(track => track.stop());

function disposeSession(session) {
  if (!session) return;
  session.canceled = true;
  clearInterval(session.interval);
  clearTimeout(session.timeout);
  if (session.recorder?.state !== 'inactive') {
    try { session.recorder?.stop(); } catch { /* The recorder may already be stopping. */ }
  }
  stopTracks(session.stream);
  session.chunks = [];
}

function recordingOptions() {
  const formats = ['audio/webm;codecs=opus', 'audio/ogg;codecs=opus', 'audio/mp4'];
  const mimeType = formats.find(format => globalThis.MediaRecorder.isTypeSupported?.(format));
  return mimeType ? { mimeType } : undefined;
}

export default function MicrophoneRecorder({ studio, disabled = false, onRecordingChange }) {
  const [phase, setPhase] = useState('idle');
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState('');
  const active = useRef(null);
  const mounted = useRef(false);
  const studioRef = useRef(studio);
  const notifyRef = useRef(onRecordingChange);

  useEffect(() => { studioRef.current = studio;notifyRef.current = onRecordingChange; }, [studio, onRecordingChange]);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      disposeSession(active.current);
      active.current = null;
      notifyRef.current?.(false);
    };
  }, []);

  function idle(session) {
    if (active.current !== session) return;
    active.current = null;
    notifyRef.current?.(false);
    if (mounted.current) { setPhase('idle');setElapsed(0); }
  }

  function cancel() {
    const session = active.current;
    disposeSession(session);
    idle(session);
  }

  function stopAndAdd(expectedSession) {
    const session = active.current;
    if (!session || (expectedSession && expectedSession !== session) || session.canceled || session.recorder?.state !== 'recording') return;
    clearInterval(session.interval);clearTimeout(session.timeout);
    if (mounted.current) setPhase('adding');
    session.keep = true;
    session.recorder.stop();
    stopTracks(session.stream);
  }

  async function start() {
    if (active.current || studio.busy || disabled) return;
    setError('');
    if (studio.elapsed >= 299.95) {
      setError('Move the playhead earlier before recording. Audio must start before 5:00.');return;
    }
    if (!navigator.mediaDevices?.getUserMedia || typeof globalThis.MediaRecorder !== 'function') {
      setError('Microphone recording needs a supported browser and HTTPS or localhost. You can import an audio file instead.');return;
    }
    const session = { chunks: [], canceled: false, keep: false, stream: null, recorder: null, at: studio.elapsed || 0 };
    active.current = session;
    notifyRef.current?.(true);setPhase('requesting');setElapsed(0);
    try {
      studio.stopPreview();
      if (['playing', 'loading'].includes(studio.status)) await studio.togglePlayback();
      if (!mounted.current || active.current !== session || session.canceled) return;
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      // A permission prompt cannot be aborted; ignore its result after Cancel or unmount.
      if (!mounted.current || active.current !== session || session.canceled) { stopTracks(stream);return; }
      session.stream = stream;
      const recorder = new MediaRecorder(stream, recordingOptions());
      session.recorder = recorder;
      recorder.ondataavailable = event => { if (!session.canceled && event.data.size) session.chunks.push(event.data); };
      recorder.onerror = () => {
        if (active.current !== session) return;
        disposeSession(session);
        if (mounted.current) setError('Recording stopped unexpectedly. Please try again or import an audio file.');
        idle(session);
      };
      recorder.onstop = async () => {
        clearInterval(session.interval);clearTimeout(session.timeout);stopTracks(session.stream);
        if (!session.keep || session.canceled || active.current !== session || !mounted.current) { idle(session);return; }
        try {
          const type = recorder.mimeType || session.chunks[0]?.type || 'audio/webm';
          const blob = new Blob(session.chunks, { type });
          session.chunks = [];
          if (!blob.size || performance.now() - session.started < 150) throw new Error('That recording was too short. Record a little longer before adding it.');
          const extension = type.includes('mp4') ? 'm4a' : type.includes('ogg') ? 'ogg' : 'webm';
          const stamp = new Date().toISOString().slice(0, 19).replace(/[T:]/g, '-');
          const file = new File([blob], 'Recording-' + stamp + '.' + extension, { type });
          await studioRef.current.importFiles([file], 'vocal', false, session.at);
        } catch (problem) { if (mounted.current && active.current === session) setError(problem.message || 'The recording could not be added.'); }
        finally { idle(session); }
      };
      session.started = performance.now();
      recorder.start(250);
      setPhase('recording');
      session.interval = setInterval(() => { if (mounted.current && active.current === session) setElapsed(Math.floor((performance.now() - session.started) / 1000)); }, 250);
      session.timeout = setTimeout(() => stopAndAdd(session), MAX_RECORDING_MS);
    } catch (problem) {
      disposeSession(session);
      if (mounted.current && active.current === session) {
        setError(problem.name === 'NotAllowedError' || problem.name === 'PermissionDeniedError'
          ? 'Microphone access was denied. Allow microphone access in your browser, then try again.'
          : problem.name === 'NotFoundError' || problem.name === 'DevicesNotFoundError'
            ? 'No microphone was found. Connect one or import an audio file.'
            : 'The microphone could not start. Check that another app is not using it, then try again.');
      }
      idle(session);
    }
  }

  return <section className="microphone-recorder" aria-label="Microphone recording">
    <div className="microphone-recorder-heading"><h3>Record audio</h3>{phase === 'recording' && <output aria-label="Recording time"><span className="recording-indicator" />{clockTime(elapsed)}</output>}</div>
    {phase === 'idle' ? <><button type="button" className="microphone-start" disabled={studio.busy || disabled} onClick={start}><span className="record-button-dot" />Start recording</button><p className="recording-hint">Records at the playhead. Playback pauses.</p></>
      : <><p className="recording-state" role="status">{phase === 'requesting' ? 'Allow microphone access in your browser.' : phase === 'adding' ? 'Adding your recording…' : 'Recording · stops after 5:00'}</p><div className="microphone-actions">
        {phase === 'recording' && <button type="button" className="microphone-stop" onClick={() => stopAndAdd()}>Stop &amp; add</button>}
        {phase !== 'adding' && <button type="button" onClick={cancel}>Cancel</button>}
      </div></>}
    {error && <p className="editor-library-error" role="alert">{error}</p>}
  </section>;
}
