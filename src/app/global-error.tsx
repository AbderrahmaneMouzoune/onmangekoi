'use client'

export default function GlobalError({ reset }: { error: Error; reset: () => void }) {
  return (
    <html lang="fr">
      <body
        style={{
          margin: 0,
          minHeight: '100svh',
          display: 'grid',
          placeItems: 'center',
          fontFamily: 'system-ui, sans-serif',
          background: '#f4f3ee',
          color: '#1b1a17',
        }}
      >
        <div style={{ textAlign: 'center', padding: 24 }}>
          <h1 style={{ fontSize: 24, marginBottom: 8 }}>Quelque chose a cassé</h1>
          <p style={{ marginBottom: 16, opacity: 0.7 }}>Réessaie dans un instant.</p>
          <button
            type="button"
            onClick={reset}
            style={{
              background: '#e8412c',
              color: '#fff',
              border: 0,
              borderRadius: 12,
              padding: '12px 20px',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Réessayer
          </button>
        </div>
      </body>
    </html>
  )
}
