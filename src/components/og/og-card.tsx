/**
 * Gabarit partagé des images Open Graph (accueil et invitations).
 * Rendu par Satori : styles inline uniquement, flex explicite.
 */
interface OgCardProps {
  eyebrow: string
  title: string
  subtitle?: string
  footer?: string
}

export function OgCard({ eyebrow, title, subtitle, footer }: OgCardProps) {
  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        padding: 72,
        background: '#24282c',
        color: '#f3f0e7',
        fontFamily: 'sans-serif',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        <div
          style={{
            width: 22,
            height: 22,
            borderRadius: 11,
            background: '#e8412c',
          }}
        />
        <span style={{ fontSize: 30, letterSpacing: 4, textTransform: 'uppercase', opacity: 0.7 }}>
          {eyebrow}
        </span>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
        <span
          style={{
            fontSize: title.length > 40 ? 64 : 84,
            fontWeight: 800,
            lineHeight: 1.05,
            letterSpacing: -3,
          }}
        >
          {title}
        </span>
        {subtitle && <span style={{ fontSize: 36, opacity: 0.75 }}>{subtitle}</span>}
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
        <span style={{ fontSize: 40, fontWeight: 800, letterSpacing: -2 }}>
          onmange<span style={{ color: '#e8412c' }}>koi</span>
        </span>
        {footer && <span style={{ fontSize: 28, opacity: 0.6 }}>{footer}</span>}
      </div>
    </div>
  )
}
