export const STUDIO_PAGES = [
  { id: 'studio', label: 'Studio', title: 'Build your sound.', description: 'Add recordings and balance your layers. Your mix follows you between pages.' },
  { id: 'rhythm', label: 'Rhythm', title: 'Find your rhythm.', description: 'Choose a sample, create a pattern, and hear it with your mix.' },
  { id: 'arrangement', label: 'Arrangement', title: 'Shape the whole piece.', description: 'Give each layer an entrance, an exit, and room to fade.' },
  { id: 'saved-mixes', label: 'Saved mixes', title: 'Keep what you create.', description: 'Save this workspace or return to a mix you made earlier.' },
];

export function pageFromHash(hash = '') {
  const id = hash.replace(/^#\/?/, '').replace(/\/$/, '');
  return STUDIO_PAGES.find((page) => page.id === id) || STUDIO_PAGES[0];
}
