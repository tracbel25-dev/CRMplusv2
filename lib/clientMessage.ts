export function clientMessage(value: unknown, fallback = 'Não foi possível concluir esta ação. Tente novamente.') {
  const raw = typeof value === 'string' ? value : value instanceof Error ? value.message : '';
  const text = raw.trim().replace(/^[A-Z][A-Z0-9_]+:\s*/, '');
  if (!text) return fallback;
  const lower = text.toLowerCase();

  if (lower.includes('invalid login credentials')) return 'E-mail ou senha incorretos.';
  if (lower.includes('email not confirmed')) return 'Confirme seu e-mail antes de entrar.';
  if (lower.includes('user already registered') || lower.includes('already been registered')) return 'Já existe uma conta com este e-mail.';
  if (lower.includes('cnpj_already_used')) return 'Este CNPJ já está vinculado a outra conta.';
  if (lower.includes('invalid_cnpj')) return 'CNPJ inválido.';
  if (lower.includes('invalid_person_type')) return 'Selecione Pessoa física ou Pessoa jurídica.';
  if (lower.includes('rate limit') || lower.includes('too many requests')) return 'Muitas tentativas seguidas. Aguarde um momento e tente novamente.';
  if (lower.includes('password should be') || lower.includes('password must')) return 'A senha informada não atende aos requisitos de segurança.';
  if (lower.includes('failed to fetch') || lower.includes('network') || lower.includes('networkerror')) return 'Não foi possível conectar agora. Verifique sua internet e tente novamente.';
  if (lower.includes('jwt') || lower.includes('token has expired') || lower.includes('refresh token')) return 'Seu acesso expirou. Entre novamente para continuar.';

  const technical = /(supabase|postgres|postgrest|sqlstate|sql\b|rpc\b|r2\b|s3\b|bucket|groq|cloudflare|vercel|api\b|endpoint|http\b|status code|tenant|workspace|revision|uuid|jwt|bearer|access[_ -]?token|refresh[_ -]?token|constraint|duplicate key|row.level|\brls\b|schema|column|table|relation .* does not exist|foreign key|edge function|stack trace|exception|fetch failed|ECONN|ENOTFOUND|\b40[0-9]\b|\b41[0-9]\b|\b42[0-9]\b|\b43[0-9]\b|\b50[0-9]\b)/i;
  if (technical.test(text) || /^[A-Z0-9_]{4,}$/.test(text)) return fallback;
  return text;
}
