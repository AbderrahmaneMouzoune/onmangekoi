import { PseudoForm } from '@/components/pseudo-setup/pseudo-form'

export default function SetupPage() {
  return (
    <div className="flex min-h-svh items-center justify-center p-6">
      <div className="w-full max-w-sm space-y-8">
        <div className="space-y-2 text-center">
          <div className="text-4xl">🍴</div>
          <h1 className="text-2xl font-bold">Bienvenue</h1>
          <p className="text-sm text-muted-foreground">
            Choisis un pseudo pour rejoindre ou créer une session.
          </p>
        </div>
        <PseudoForm />
      </div>
    </div>
  )
}
