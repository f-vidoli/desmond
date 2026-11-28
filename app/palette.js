export const PRINCIPALS = ['amber', 'phosphor', 'cobalt', 'oxide', 'paper', 'wine']

export function principalVar(name) {
  return `var(--accent-${name})`
}

export function applyTheme(theme = {}) {
  const mode = theme.mode === 'light' ? 'light' : 'dark'
  const principal = PRINCIPALS.includes(theme.principal) ? theme.principal : 'amber'
  document.documentElement.dataset.theme = mode
  document.documentElement.dataset.principal = principal
}
