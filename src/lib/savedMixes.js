import { serializeMix, validateMix } from './studioState.js';

export const MAX_SAVED_MIXES = 20;
export const MAX_MIX_NAME = 60;

export function mixName(value) {
  const name = typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : '';
  if (!name) throw new Error('Enter a name for your mix.');
  if (name.length > MAX_MIX_NAME) throw new Error('Mix names must be 60 characters or fewer.');
  return name;
}

export function validateProject(value) {
  const mix = validateMix(value?.mix);
  if (value?.version !== 1 || typeof value.id !== 'string' || !value.id.startsWith('mix-') || value.id.length > 100
    || !mix || mix.tracks.length !== value.mix.tracks.length || value.id.length <= 4
    || typeof value.createdAt !== 'string' || typeof value.updatedAt !== 'string'
    || !Number.isFinite(Date.parse(value.createdAt)) || !Number.isFinite(Date.parse(value.updatedAt))) {
    throw new Error('Saved mixes contain invalid data. Their stored records have been preserved.');
  }
  return { version: 1, id: value.id, name: mixName(value.name), createdAt: value.createdAt,
    updatedAt: value.updatedAt, mix: serializeMix(mix) };
}

export function validateProjects(records) {
  const projects = records.map(validateProject);
  const ids = new Set(projects.map((project) => project.id));
  const names = new Set(projects.map((project) => project.name.toLowerCase()));
  if (projects.length > MAX_SAVED_MIXES || ids.size !== projects.length || names.size !== projects.length) {
    throw new Error('Saved mixes contain conflicting data. Their stored records have been preserved.');
  }
  return projects.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || a.id.localeCompare(b.id));
}

export function changeProject(records, action, { id, name, mix, now = new Date().toISOString() }) {
  const projects = validateProjects(records);
  const previous = projects.find((project) => project.id === id);
  if (action !== 'save' && !previous) throw new Error('This saved mix no longer exists. Reload the page to refresh the list.');
  if (action === 'delete') return projects.filter((project) => project.id !== id);
  if (!['save', 'update', 'rename'].includes(action)) throw new Error('Unknown saved mix action.');
  if (action === 'save' && previous) throw new Error('This mix already exists. Save your changes instead.');
  if (!previous && projects.length >= MAX_SAVED_MIXES) throw new Error('You can save up to 20 mixes. Delete one to make room.');
  const nextName = action === 'update' ? previous.name : mixName(name);
  if (projects.some((project) => project.id !== id && project.name.toLowerCase() === nextName.toLowerCase())) {
    throw new Error('A mix with this name already exists. Choose another name.');
  }
  const next = validateProject({ version: 1, id, name: nextName, createdAt: previous?.createdAt || now,
    updatedAt: now, mix: action === 'rename' ? previous.mix : serializeMix(mix) });
  return validateProjects([...projects.filter((project) => project.id !== id), next]);
}

export function referencedAudio(tracks, projects) {
  return new Set([...tracks, ...projects.flatMap((project) => project.mix.tracks)]
    .filter((track) => !track.catalogId).map((track) => track.id));
}

export function sameMix(left, right) {
  return JSON.stringify(serializeMix(left)) === JSON.stringify(serializeMix(right));
}
