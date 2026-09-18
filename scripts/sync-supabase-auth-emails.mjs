import fs from 'node:fs/promises';

const token = process.env.SUPABASE_ACCESS_TOKEN;
const ref = process.env.SUPABASE_PROJECT_REF || 'sodcfarvfhkdjecjmdwc';

if (!token) {
  console.error('Defina SUPABASE_ACCESS_TOKEN antes de executar.');
  process.exit(1);
}

const templates = {
  confirmation: {
    subject: 'Confirme seu e-mail | CRM PLUS',
    file: 'supabase/templates/confirmation.html',
  },
  recovery: {
    subject: 'Redefina sua senha | CRM PLUS',
    file: 'supabase/templates/recovery.html',
  },
  invite: {
    subject: 'Convite para acessar o CRM PLUS',
    file: 'supabase/templates/invite.html',
  },
  magic_link: {
    subject: 'Seu acesso ao CRM PLUS',
    file: 'supabase/templates/magic-link.html',
  },
  email_change: {
    subject: 'Confirme seu novo e-mail | CRM PLUS',
    file: 'supabase/templates/email-change.html',
  },
  reauthentication: {
    subject: 'Seu código de segurança | CRM PLUS',
    file: 'supabase/templates/reauthentication.html',
  },
};

const notifications = {
  password_changed: {
    subject: 'Sua senha foi alterada | CRM PLUS',
    file: 'supabase/templates/password-changed.html',
  },
  email_changed: {
    subject: 'Seu e-mail foi alterado | CRM PLUS',
    file: 'supabase/templates/email-changed.html',
  },
  phone_changed: {
    subject: 'Seu telefone foi alterado | CRM PLUS',
    file: 'supabase/templates/phone-changed.html',
  },
  mfa_factor_enrolled: {
    subject: 'Nova verificação adicionada | CRM PLUS',
    file: 'supabase/templates/mfa-factor-enrolled.html',
  },
  mfa_factor_unenrolled: {
    subject: 'Verificação removida | CRM PLUS',
    file: 'supabase/templates/mfa-factor-unenrolled.html',
  },
  identity_linked: {
    subject: 'Novo método de acesso vinculado | CRM PLUS',
    file: 'supabase/templates/identity-linked.html',
  },
  identity_unlinked: {
    subject: 'Método de acesso removido | CRM PLUS',
    file: 'supabase/templates/identity-unlinked.html',
  },
};

const payload = {};
for (const [key, value] of Object.entries(templates)) {
  payload[`mailer_subjects_${key}`] = value.subject;
  payload[`mailer_templates_${key}_content`] = await fs.readFile(value.file, 'utf8');
}
for (const [key, value] of Object.entries(notifications)) {
  payload[`mailer_notifications_${key}_enabled`] = true;
  payload[`mailer_subjects_${key}_notification`] = value.subject;
  payload[`mailer_templates_${key}_notification_content`] = await fs.readFile(value.file, 'utf8');
}

const response = await fetch(`https://api.supabase.com/v1/projects/${ref}/config/auth`, {
  method: 'PATCH',
  headers: {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify(payload),
});

const body = await response.text();
if (!response.ok) {
  console.error(`Falha ao atualizar templates: ${response.status}`);
  console.error(body);
  process.exit(1);
}

console.log('Templates de autenticação atualizados com sucesso.');
