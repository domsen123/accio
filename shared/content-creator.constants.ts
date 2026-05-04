export const PROVIDER_MODELS = {
  anthropic: [
    { label: 'Claude Opus 4', value: 'claude-opus-4-20250514' },
    { label: 'Claude Sonnet 4', value: 'claude-sonnet-4-20250514' },
    { label: 'Claude Haiku 3.5', value: 'claude-3-5-haiku-20241022' },
  ],
  google: [
    { label: 'Gemini 2.0 Flash', value: 'gemini-2.0-flash' },
    { label: 'Gemini 2.5 Flash', value: 'gemini-2.5-flash-preview-05-20' },
    { label: 'Gemini 2.5 Pro', value: 'gemini-2.5-pro-preview-05-06' },
  ],
} as const satisfies Record<string, { label: string, value: string }[]>

export const DEFAULT_MODELS: Record<string, string> = {
  anthropic: 'claude-sonnet-4-20250514',
  google: 'gemini-2.0-flash',
}
