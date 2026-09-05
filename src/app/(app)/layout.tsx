import { AppHeader } from '@/components/layout/app-header'
import { SiteFooter } from '@/components/layout/site-footer'

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <AppHeader />
      {children}
      <SiteFooter />
    </>
  )
}
