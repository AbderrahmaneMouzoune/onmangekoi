/** État renvoyé par les Server Actions branchées sur `useActionState`. */
export type FormState = {
  error?: string
  success?: string
  /** Erreurs par champ (clé = name de l'input) */
  fieldErrors?: Record<string, string>
} | null

export type ActionResult<T = undefined> = { ok: true; data: T } | { ok: false; error: string }
