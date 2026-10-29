export const STUDIO_PAGES = [
  { id: 'studio', label: 'Studio', title: 'Mix your sounds.', description: 'Add audio and adjust each clip’s volume.' },
  { id: 'rhythm', label: 'Rhythm', title: 'Create a rhythm.', description: 'Start with four beats, then make your own pattern.' },
  { id: 'arrangement', label: 'Arrangement', title: 'Arrange your mix.', description: 'Choose when each clip starts and ends.' },
  { id: 'saved-mixes', label: 'Saved mixes', title: 'Your saved mixes.', description: 'Save a mix or open one you made earlier.' },
];

export function pageFromHash(hash = '') {
  const id = hash.replace(/^#\/?/, '').replace(/\/$/, '');
  return STUDIO_PAGES.find((page) => page.id === id) || STUDIO_PAGES[0];
}
