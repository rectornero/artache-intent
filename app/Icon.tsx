// Small line icons for section headings, drawn on a 24-unit grid.

const PATHS: Record<string, string> = {
  files: "M7 3h7l5 5v12a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z M14 3v5h5 M9 13h6 M9 17h6",
  sheets: "M4 5a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1z M16 7h3a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1h-4 M7 8h6 M7 12h6 M7 16h4",
  character: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8z M4 21a8 8 0 0 1 16 0",
  place: "M12 21s-7-6.2-7-11a7 7 0 0 1 14 0c0 4.8-7 11-7 11z M12 12.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z",
  item: "M3 8l9-5 9 5v8l-9 5-9-5z M3 8l9 5 9-5 M12 13v8",
  minigame: "M6 9h12a3 3 0 0 1 3 3v3a3 3 0 0 1-5.4 1.8L14.5 15h-5l-1.1 1.8A3 3 0 0 1 3 15v-3a3 3 0 0 1 3-3z M8 11v3 M6.5 12.5h3 M15.5 12h.01 M17.5 13.5h.01",
  identity: "M3 6a1 1 0 0 1 1-1h16a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z M9 12a2 2 0 1 0 0-4 2 2 0 0 0 0 4z M5.5 16a3.5 3.5 0 0 1 7 0 M14 9h4 M14 13h4",
  look: "M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z",
  voice: "M4 5h16a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H9l-5 4v-4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z M8 10h8 M8 13h5",
  story: "M4 4.5A1.5 1.5 0 0 1 5.5 3H11v17H5.5A1.5 1.5 0 0 1 4 18.5z M20 4.5A1.5 1.5 0 0 0 18.5 3H13v17h5.5a1.5 1.5 0 0 0 1.5-1.5z",
  game: "M4 4h16v16H4z M4 9h16 M9 4v16",
  sound: "M9 18V6l11-2v12 M9 18a3 3 0 1 1-6 0 3 3 0 0 1 6 0z M20 16a3 3 0 1 1-6 0 3 3 0 0 1 6 0z",
  design: "M12 3l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.4 6.8 19.1l1-5.8L3.5 9.2l5.9-.9z",
  outcome: "M5 21V4 M5 4h11l-2 4 2 4H5",
  data: "M12 3c4.4 0 8 1.3 8 3s-3.6 3-8 3-8-1.3-8-3 3.6-3 8-3z M4 6v12c0 1.7 3.6 3 8 3s8-1.3 8-3V6 M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3",
  engine: "M7 7h10v10H7z M10 3v4 M14 3v4 M10 17v4 M14 17v4 M3 10h4 M3 14h4 M17 10h4 M17 14h4",
  usage: "M4 20V10 M10 20V4 M16 20v-7 M22 20H2",
  notes: "M5 3h14v18H5z M8 8h8 M8 12h8 M8 16h5",
  project: "M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z",
  history: "M3 12a9 9 0 1 0 3-6.7L3 8 M3 3v5h5 M12 7v5l3 2",
  outline: "M8 6h13 M8 12h13 M8 18h13 M3 6h.01 M3 12h.01 M3 18h.01",
};

export function Icon({ name, size = 16 }: { name: string; size?: number }) {
  const d = PATHS[name];
  if (!d) return null;
  return (
    <svg className="icon-svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={d} />
    </svg>
  );
}
