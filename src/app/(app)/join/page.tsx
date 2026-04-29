import { JoinForm } from '@/components/session/join-form'

interface Props {
  searchParams: Promise<{ error?: string }>
}

export default async function JoinPage({ searchParams }: Props) {
  const { error } = await searchParams

  return (
    <div className="mx-auto max-w-sm space-y-6 p-6">
      <div className="space-y-1">
        <h1 className="text-xl font-semibold">Rejoindre une session</h1>
        <p className="text-sm text-muted-foreground">Entre le code à 6 caractères reçu du host.</p>
      </div>
      <JoinForm initialError={error} />
    </div>
  )
}
