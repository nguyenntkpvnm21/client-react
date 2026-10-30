import assert from 'node:assert/strict';
import { test } from 'node:test';
import { capturePattern, copyPattern, placePattern, patternGroups, editBlock, copyBlock, retimeBlocks, patternSourceCount, blockWindow, selectedPart } from '../src/lib/patternSections.js';
import { defaultMix, serializeMix, validateMix, audibleGain } from '../src/lib/studioState.js';
import { enableRhythmTrack } from '../src/lib/rhythmState.js';
import { MixHistory } from '../src/lib/mixHistory.js';
import { createProjectBackup, inspectProjectBackup, restoredProject } from '../src/lib/projectBackup.js';
import { sameMix, validateProject } from '../src/lib/savedMixes.js';
import { AudioEngine } from '../src/lib/audioEngine.js';
const uuid = (() => { let n = 0;return () => String(++n); })();
function beat() {
  const mix = defaultMix();mix.bpm = 120;
  mix.tracks[0] = enableRhythmTrack({ ...mix.tracks[0], clipStart: 3, clipEnd: 12 }, 20);
  mix.tracks[1] = enableRhythmTrack(mix.tracks[1], 20);
  return mix;
}
function bank() { return capturePattern(beat(), uuid); }
function song() { const mix = bank();return placePattern(mix, mix.patterns[0].id, 2, 4, uuid); }

test('A keeps independent nature samples, normal clips and steps without adding sources', () => {
  const mix = beat(), next = capturePattern(mix, uuid);
  assert.equal(next.patterns[0].name, 'Nature pulse');assert.equal(next.patterns[0].rows.length, 2);
  assert.equal(next.sources, mix.sources);assert.equal(next.tracks, mix.tracks);
  next.patterns[0].rows[0].sequence.steps[1] = true;next.patterns[0].rows[0].rhythm.sampleStart = .02;
  assert.equal(mix.tracks[0].sequence.steps[1], false);assert.notEqual(mix.tracks[0].rhythm.sampleStart, .02);
  assert.equal(next.patterns[0].rows[0].clipStart, 3);
});

test('B is an independent variation; at most two banks, with cleared patterns retained', () => {
  const mix = bank(), next = copyPattern(mix, mix.patterns[0].id, uuid);
  next.patterns[1].rows[0].sequence.steps.fill(false);
  const stored = validateMix(serializeMix(next));
  assert.equal(stored.patterns[1].slot, 'B');assert.ok(stored.patterns[0].rows[0].sequence.steps.some(Boolean));
  assert.ok(stored.patterns[1].rows[0].sequence.steps.every(value => !value));
  assert.throws(() => copyPattern(next, next.patterns[0].id, uuid), /A and B/);
  assert.equal(patternSourceCount(next, 'rain'), 2);
});

test('first placement moves only matching enabled origin rows; next placements share sources but own snapshots', () => {
  let mix = bank();const id = mix.patterns[0].id;
  mix = placePattern(mix, id, 2, 4, uuid);
  assert.equal(mix.tracks.length, 3);assert.equal(mix.sources.length, 3);assert.equal(mix.arrangement.enabled, true);
  let groups = patternGroups(mix.tracks, mix.bpm);assert.equal(groups.length, 1);assert.deepEqual(groups[0].placement, { start:4,end:12,fadeIn:0,fadeOut:0 });
  mix.patterns[0].rows[0].sequence.steps.fill(false);
  assert.ok(groups[0].rows[0].sequence.steps.some(Boolean));
  mix = placePattern(mix, id, 6, 2, uuid);groups = patternGroups(mix.tracks, mix.bpm);
  assert.equal(groups.length, 2);assert.equal(mix.tracks.length, 5);assert.ok(groups[1].rows[0].sequence.steps.every(value => !value));
  assert.equal(groups[0].rows[0].sourceId, groups[1].rows[0].sourceId);
});

test('section moves, repeat count, levels and mute are atomic across sounds', () => {
  let mix = song();const block = patternGroups(mix.tracks, mix.bpm)[0];
  mix = editBlock(mix, block.id, { startBar: 6, bars:8, volume:40, muted:true });
  for (const row of patternGroups(mix.tracks, mix.bpm)[0].rows) {
    assert.deepEqual(row.placement, {start:12,end:28,fadeIn:0,fadeOut:0});assert.equal(audibleGain(row,mix.tracks),0);
  }
  mix = editBlock(mix, block.id, { muted:false });const row = mix.tracks.find(row=>row.patternBlock);
  assert.equal(audibleGain(row,mix.tracks), row.volume /100 *.4);
  assert.equal(selectedPart(mix,block.id).id,block.id);
});

test('changing BPM retains bar positions and normal audio times; rejects beyond five minutes', () => {
  const mix = song(), audio = mix.tracks.find(row=>!row.patternBlock), next = retimeBlocks(mix,60);
  assert.deepEqual(next.tracks.find(row=>row.id===audio.id),audio);
  assert.equal(next.tracks.find(row=>row.patternBlock).placement.start,8);
  assert.throws(()=>blockWindow({startBar:99,bars:5},40),/5:00/);
  assert.throws(()=>editBlock(mix,mix.tracks.at(-1).patternBlock.id,{bars:0}),/valid bar/);
});

test('duplicate section owns metadata and shared source references; capacity counts sounds, not repeats', () => {
  const mix = song(), block = patternGroups(mix.tracks,mix.bpm)[0], next=copyBlock(mix,block.id,uuid);
  const groups=patternGroups(next.tracks,next.bpm);assert.equal(groups.length,2);
  groups[1].rows[0].sequence.steps.fill(false);assert.ok(groups[0].rows[0].sequence.steps.some(Boolean));
  assert.equal(next.sources.length,mix.sources.length);
  assert.equal(editBlock(mix,block.id,{bars:100}).tracks.length,mix.tracks.length);
  const full={...mix,tracks:Array.from({length:32},(_,i)=>({...mix.tracks[0],id:'custom-full-'+i}))};
  assert.throws(()=>placePattern(full,mix.patterns[0].id,0,2,uuid),/clip slots/);
});

test('banks and grouped sections survive save/reload and count as dirty edits', () => {
  const mix=song(), stored=serializeMix(mix), restored=validateMix(stored);
  assert.deepEqual(serializeMix(restored),stored);assert.ok(sameMix(mix,restored));
  assert.ok(validateProject({version:1,id:'mix-patterns',name:'Rain pulse',createdAt:'2026-10-30T00:00:00.000Z',updatedAt:'2026-10-30T00:00:00.000Z',mix:stored}));
  restored.patterns[0].rows[0].volume=12;assert.equal(sameMix(mix,restored),false);
});

test('invalid banks or inconsistent section metadata cannot silently enter a saved project', () => {
  const stored=serializeMix(song());stored.patterns[0].rows[0].sequence.enabled=false;
  assert.equal(validateMix(stored).patterns,undefined);
  const damaged=serializeMix(song());damaged.tracks.filter(row=>row.patternBlock)[0].patternBlock.bars=3;
  assert.equal(validateMix(damaged).tracks.some(row=>row.patternBlock),false);
});

test('pattern row IDs cannot alias another bank or a placed/current clip in saved data', () => {
  const first = bank(), both = copyPattern(first, first.patterns[0].id, uuid);
  for (const collision of ['bank', 'clip']) {
    const stored = serializeMix(both);
    if (collision === 'bank') stored.patterns[1].rows[0].id = stored.patterns[0].rows[0].id;
    else stored.patterns[0].rows[0].id = stored.tracks[0].id;
    assert.throws(() => validateProject({ version: 1, id: 'mix-duplicate-row', name: 'Damaged',
      createdAt: '2026-10-30T00:00:00.000Z', updatedAt: '2026-10-30T00:00:00.000Z', mix: stored }), /invalid data/);
  }
});

test('undo/redo restores a whole section and its source references in one action', () => {
  const before=bank(), after=placePattern(before,before.patterns[0].id,0,4,uuid), history=new MixHistory();
  history.record(before,after,{label:'Add rhythm section'});
  const undone=history.apply('undo',after,null);assert.deepEqual(undone.mix.tracks,serializeMix(before).tracks);
  const redone=history.apply('redo',undone.mix,null);assert.deepEqual(redone.mix.tracks,serializeMix(after).tracks);
});

test('portable backup includes banks and grouped sections with one original per source', async () => {
  let mix=bank();mix=copyPattern(mix,mix.patterns[0].id,uuid);mix=placePattern(mix,mix.patterns[0].id,0,4,uuid);
  let reads=0;
  const blob=await createProjectBackup({mix,name:'Nature song',resolveAudio:source=>{reads++;return new Blob(['original '+source.id],{type:'audio/wav'});}});
  assert.equal(reads,3);
  const parsed=await inspectProjectBackup(blob),restored=restoredProject(parsed,'Restored nature song',uuid);
  assert.equal(restored.mix.patterns.length,2);assert.equal(patternGroups(restored.mix.tracks,restored.mix.bpm).length,1);
  assert.equal(restored.files.size,3);
  for(const pattern of restored.mix.patterns)for(const row of pattern.rows)assert.ok(restored.files.has(row.sourceId));
  const again=await inspectProjectBackup(await createProjectBackup({mix:restored.mix,name:restored.name,resolveAudio:source=>restored.files.get(source.id)}));
  assert.equal(again.mix.patterns.length,2);
});

test('pattern-only sources remain portable after all placed and current rhythm rows are removed', async () => {
  const mix=bank();mix.tracks=[];
  const parsed=await inspectProjectBackup(await createProjectBackup({mix,name:'Only patterns',resolveAudio:()=>new Blob(['original'],{type:'audio/wav'})}));
  assert.equal(parsed.mix.patterns[0].rows.length,2);assert.equal(parsed.mix.tracks.length,0);assert.equal(parsed.files.size,3);
});

test('many sections reuse one decoded source even under different clip IDs', async () => {
  // Use a single bank's identities for the actual engine check.
  const original=bank(),placed=placePattern(original,original.patterns[0].id,0,4,uuid),more=placePattern(placed,original.patterns[0].id,4,8,uuid);
  const engine=new AudioEngine(),buffer={duration:20,length:882000,numberOfChannels:2,getChannelData:()=>new Float32Array(10)};
  engine.buffers.set('rain',buffer);engine.sourceKeys.set('rain','rain');
  const rows=more.tracks.filter(row=>row.sourceId==='rain');engine.setTracks(rows);
  for(const row of rows)assert.equal(engine.buffers.get(row.id),buffer);
  engine.dispose();
});
