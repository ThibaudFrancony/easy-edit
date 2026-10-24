// Icônes au trait fin (2 px), arrondies, en `currentColor`.

const paths = {
  film: ['M4 5h16v14H4z', 'M8 5v14', 'M16 5v14', 'M4 9h4', 'M4 15h4', 'M16 9h4', 'M16 15h4'],
  'frame-back': ['M6 5v14', 'M18 6l-8 6 8 6z'],
  'frame-forward': ['M18 5v14', 'M6 6l8 6-8 6z'],
  play: ['M8 5l11 7-11 7z'],
  pause: ['M7 5h3v14H7z', 'M14 5h3v14h-3z'],
  link: ['M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1', 'M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1'],
  unlink: ['M10 13a5 5 0 0 0 7 0l1-1', 'M14 11a5 5 0 0 0-7 0l-1 1', 'M4 4l16 16'],
  scissors: ['M6 6m-3 0a3 3 0 1 0 6 0a3 3 0 1 0-6 0', 'M6 18m-3 0a3 3 0 1 0 6 0a3 3 0 1 0-6 0', 'M8.6 7.6L20 18', 'M8.6 16.4L20 6'],
  trash: ['M4 7h16', 'M10 11v6', 'M14 11v6', 'M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12', 'M9 7V4h6v3'],
  minus: ['M5 12h14'],
  check: ['M5 12l5 5L20 7'],
  captions: ['M3 6h18v12H3z', 'M10.5 10.2a2 2 0 1 0 0 3.6', 'M17 10.2a2 2 0 1 0 0 3.6'],
  resize: ['M15 3h6v6', 'M9 21H3v-6', 'M21 3l-7 7', 'M3 21l7-7'],
  crop: ['M6 2v14a2 2 0 0 0 2 2h14', 'M18 22V8a2 2 0 0 0-2-2H2'],
  reset: ['M3 12a9 9 0 1 0 3-6.7', 'M3 4v5h5'],
  image: ['M4 5h16v14H4z', 'M4 16l5-5 4 4 2-2 5 5', 'M15 9.5m-1.5 0a1.5 1.5 0 1 0 3 0a1.5 1.5 0 1 0-3 0'],
  export: ['M12 15V3', 'M7 8l5-5 5 5', 'M5 15v4a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-4'],
  close: ['M6 6l12 12', 'M18 6L6 18'],
  speaker: ['M11 5L6 9H2v6h4l5 4z', 'M15.5 8.5a5 5 0 0 1 0 7', 'M19 5a10 10 0 0 1 0 14'],
  'speaker-off': ['M11 5L6 9H2v6h4l5 4z', 'M22 9l-6 6', 'M16 9l6 6'],
  levels: ['M4 10v4', 'M9 6v12', 'M14 8v8', 'M19 10v4'],
  music: ['M9 18V5l12-2v13', 'M6 18m-3 0a3 3 0 1 0 6 0a3 3 0 1 0-6 0', 'M18 16m-3 0a3 3 0 1 0 6 0a3 3 0 1 0-6 0'],
  plus: ['M12 5v14', 'M5 12h14'],
  folder: ['M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z']
} as const

export type IconName = keyof typeof paths

interface IconProps {
  name: IconName
  size?: number
  /** Formes pleines (lecture, pause) plutôt qu'au trait. */
  filled?: boolean
}

export function Icon({ name, size = 16, filled = false }: IconProps): React.JSX.Element {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={filled ? 'currentColor' : 'none'}
      stroke={filled ? 'none' : 'currentColor'}
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[name].map((d) => (
        <path key={d} d={d} />
      ))}
    </svg>
  )
}
