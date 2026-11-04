const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

// A viewport changes only how the timeline is drawn, never the song or clip times.
export function timelineView(view, duration) {
  const end = Number.isFinite(duration) && duration > 0 ? duration : 1;
  if (!view || !Number.isFinite(view.start) || !Number.isFinite(view.end) || view.end <= view.start) return { start: 0, end };
  const span = clamp(view.end - view.start, Math.min(.25, end), end);
  const start = clamp(view.start, 0, end - span);
  return { start, end: start + span };
}

export function zoomTimeline(view, duration, factor, anchor = (view.start + view.end) / 2) {
  const current = timelineView(view, duration), span = current.end - current.start;
  const at = clamp(Number.isFinite(anchor) ? anchor : current.start + span / 2, current.start, current.end);
  const nextSpan = clamp(span * factor, Math.min(.25, duration), duration);
  const start = at - (at - current.start) / span * nextSpan;
  return timelineView({ start, end: start + nextSpan }, duration);
}

export function panTimeline(view, duration, direction) {
  const current = timelineView(view, duration), span = current.end - current.start;
  const start = current.start + direction * span * .75;
  return timelineView({ start, end: start + span }, duration);
}

export function fitTimelineSelection(selection, duration) {
  const start = clamp(selection.start, 0, duration), end = clamp(selection.end, start, duration);
  const padding = Math.max(.1, (end - start) * .2), span = Math.max(.5, end - start + padding * 2);
  const left = Math.max(0, start - padding);
  return timelineView({ start: left, end: left + span }, duration);
}

export function timelinePosition(time, view) { return (time - view.start) / (view.end - view.start) * 100; }
export function timelineTime(fraction, view) { return view.start + clamp(fraction, 0, 1) * (view.end - view.start); }

// Read detail from only the source audio visible in this view. Batching at wraps
// keeps long ambience detailed without making a source read for every SVG bar.
export function timelineWaveform(track, region, window, view, readPeaks, bins = 320) {
  const start = Math.max(window.start, view.start), end = Math.min(window.end, view.end);
  const result = { start, end, bars: [] };
  if (end <= start || !region || region.length <= 0) return result;
  const span = end - start, offset = track.sourceOffset || 0;
  const audibleEnd = track.loop ? end : Math.min(end, window.start + region.length - offset);
  if (audibleEnd <= start) return result;
  if (!track.loop) {
    // A left trim draft can reveal source audio before the saved clip region.
    // Read that continuous range once; do not wrap at the old region boundary.
    const audibleStart = Math.max(start, window.start - offset - region.start);
    if (audibleStart >= audibleEnd) return result;
    const sourceStart = Math.max(0, region.start + audibleStart - window.start + offset);
    const sourceEnd = region.start + audibleEnd - window.start + offset;
    const count = Math.max(1, Math.round((audibleEnd - audibleStart) / span * bins));
    const peaks = readPeaks(sourceStart, sourceEnd, count);
    peaks.forEach((peak, i) => result.bars.push({ position: (audibleStart - start + (i + .5) / peaks.length * (audibleEnd - audibleStart)) / span, peak }));
    return result;
  }
  const localAt = time => {
    const elapsed = time - window.start + offset;
    const local = ((elapsed % region.length) + region.length) % region.length;
    return region.length - local < 1e-7 ? 0 : local;
  };
  if (track.loop && Math.ceil((audibleEnd - start) / region.length) + 1 > 8) {
    const peaks = readPeaks(region.start, region.end, bins);
    for (let i = 0; i < bins && peaks.length; i += 1) {
      const position = (i + .5) / bins, local = localAt(start + position * span);
      result.bars.push({ position, peak: peaks[Math.min(peaks.length - 1, Math.floor(local / region.length * peaks.length))] });
    }
    return result;
  }
  let at = start;
  while (at < audibleEnd - 1e-8) {
    const local = localAt(at), next = Math.min(audibleEnd, at + region.length - local);
    if (next <= at + 1e-8) break;
    const count = Math.max(1, Math.round((next - at) / span * bins));
    const peaks = readPeaks(region.start + local, region.start + local + next - at, count);
    peaks.forEach((peak, i) => result.bars.push({ position: (at - start + (i + .5) / peaks.length * (next - at)) / span, peak }));
    at = next;
  }
  return result;
}
