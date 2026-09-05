import 'server-only'

import QRCode from 'qrcode'

/**
 * QR code d'un lien, rendu en SVG côté serveur (aucun JavaScript côté client).
 * Les couleurs sont celles de l'ardoise : modules craie sur fond transparent.
 */
export async function qrCodeSvg(value: string): Promise<string> {
  return QRCode.toString(value, {
    type: 'svg',
    errorCorrectionLevel: 'M',
    margin: 0,
    color: { dark: '#f3f0e7', light: '#00000000' },
  })
}
