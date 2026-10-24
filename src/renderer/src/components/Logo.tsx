// Le logo « Lecture coupée » sans son fond d'icône, pour la barre du haut. Même dessin que resources/icon.svg.
export function Logo({ size = 16 }: { size?: number }): React.JSX.Element {
  return (
    <svg width={size} height={size} viewBox="320 264 480 496" aria-hidden="true">
      <defs>
        <clipPath id="logo-gauche">
          <rect x="0" y="0" width="548" height="1024" />
        </clipPath>
        <clipPath id="logo-droite">
          <rect x="584" y="0" width="440" height="1024" />
        </clipPath>
      </defs>
      <g clipPath="url(#logo-gauche)">
        <path d="M372 316 L372 708 L728 512 Z" fill="var(--text)" stroke="var(--text)" strokeWidth={64} strokeLinejoin="round" />
      </g>
      <g clipPath="url(#logo-droite)" transform="translate(22 0)">
        <path d="M372 316 L372 708 L728 512 Z" fill="var(--accent)" stroke="var(--accent)" strokeWidth={64} strokeLinejoin="round" />
      </g>
    </svg>
  )
}
