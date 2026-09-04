import { ImageResponse } from 'next/og'

export const size = { width: 180, height: 180 }
export const contentType = 'image/png'

export default function AppleIcon() {
  return new ImageResponse(
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#24282c',
        position: 'relative',
      }}
    >
      <span
        style={{
          fontSize: 120,
          fontWeight: 800,
          color: '#f3f0e7',
          letterSpacing: -7,
          lineHeight: 1,
          marginTop: -8,
        }}
      >
        k
      </span>
      <span
        style={{
          position: 'absolute',
          right: 32,
          bottom: 38,
          width: 26,
          height: 26,
          borderRadius: 13,
          background: '#e8412c',
        }}
      />
    </div>,
    size
  )
}
