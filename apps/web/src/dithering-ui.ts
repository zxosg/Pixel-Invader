export const COMPOSER_MIX_STEPS = [0, 25, 50, 75, 100] as const;

export interface ComposerMixOption {
  readonly value: string;
  readonly label: string;
  readonly disabled?: boolean;
}

export function composerMixOptions(current: number): readonly ComposerMixOption[] {
  const options: ComposerMixOption[] = COMPOSER_MIX_STEPS.map((value) => ({
    value: String(value),
    label: `${value}%`,
  }));
  if (COMPOSER_MIX_STEPS.includes(current as (typeof COMPOSER_MIX_STEPS)[number])) {
    return options;
  }
  return [
    { value: String(current), label: `Current · ${current}%`, disabled: true },
    ...options,
  ];
}
