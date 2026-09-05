import { ImageResponse } from 'next/og'

export const size = { width: 512, height: 512 }
export const contentType = 'image/png'

/** Icône : une ardoise sombre, un « k » à la craie, un point tomate. */
export default function Icon() {
  return new ImageResponse(
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#24282c',
        borderRadius: 112,
        position: 'relative',
      }}
    >
      <span
        style={{
          fontSize: 340,
          fontWeight: 800,
          color: '#f3f0e7',
          letterSpacing: -20,
          lineHeight: 1,
          marginTop: -20,
        }}
      >
        k
      </span>
      <span
        style={{
          position: 'absolute',
          right: 92,
          bottom: 108,
          width: 72,
          height: 72,
          borderRadius: 36,
          background: '#e8412c',
        }}
      />
    </div>,
    size
  )
}
