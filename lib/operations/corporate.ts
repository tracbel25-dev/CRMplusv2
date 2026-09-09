export const corporateUi = {
  homeLabel: 'Tela inicial',
  settingsLabel: 'Configurações',
  developerLabel: 'Desenvolvido por CRM PLUS Store'
} as const;

export function corporateDeveloperLine(year = new Date().getFullYear()) {
  return `${corporateUi.developerLabel} · ${year}`;
}
