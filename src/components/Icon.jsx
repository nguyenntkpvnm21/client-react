const shapes = {
  leaf: <><path d="M20 4c-8-2-15 2-15 9a6 6 0 0 0 6 6c7 0 10-7 9-15Z" /><path d="M4 21 15 10" /></>,
  rain: <><path d="M7 13a4 4 0 1 1 1-8 5 5 0 0 1 9 2 3 3 0 0 1 0 6" /><path d="m8 16-1 4m6-4-1 4m6-4-1 4" /></>,
  birds: <><path d="M16 7h3l3 3-3 1v3a6 6 0 0 1-6 6H3l4-4V9a4 4 0 0 1 7-3l2 1Z" /><path d="m8 15 5-4M17 9h.01" /></>,
  music: <><path d="M9 18V5l12-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="18" cy="16" r="3" /></>,
  vocal: <><rect x="9" y="2" width="6" height="12" rx="3" /><path d="M5 10v2a7 7 0 0 0 14 0v-2M12 19v3m-4 0h8" /></>,
  play: <path d="m8 5 11 7-11 7V5Z" />,
  pause: <><path d="M8 5v14M16 5v14" /></>,
  reset: <><path d="M3 10a9 9 0 1 1 2 8M3 4v6h6" /></>,
  plus: <path d="M12 5v14M5 12h14" />,
  check: <path d="m5 12 4 4L19 6" />,
  upload: <><path d="M12 16V3m-5 5 5-5 5 5M4 16v4a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-4" /></>,
  trash: <><path d="M3 6h18M9 6V3h6v3M6 6l1 15h10l1-15M10 10v7m4-7v7" /></>,
  loop: <><path d="M4 8h14l-3-3m3 3-3 3M20 16H6l3 3m-3-3 3-3" /><path d="M20 8v3M4 16v-3" /></>,
  volume: <><path d="m11 5-6 4H2v6h3l6 4V5Z" /><path d="M15 8a5 5 0 0 1 0 8m3-11a9 9 0 0 1 0 14" /></>,
  search: <><circle cx="10" cy="10" r="6" /><path d="m15 15 5 5" /></>,
  arrow: <path d="M5 12h14m-5-5 5 5-5 5" />,
  layers: <><path d="m12 3 10 6-10 6L2 9l10-6Zm-9 11 9 5 9-5M3 19l9 5 9-5" /></>,
  headphones: <><path d="M3 14v-3a9 9 0 0 1 18 0v3" /><rect x="3" y="12" width="4" height="8" rx="2" /><rect x="17" y="12" width="4" height="8" rx="2" /></>,
};

export default function Icon({ name, size = 20, ...props }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"
    strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>{shapes[name] || shapes.leaf}</svg>;
}
