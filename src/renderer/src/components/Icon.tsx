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
