'use client';

export const ACTIVE_ACCOUNT_STORAGE_KEY = 'crmplus:active-account-id:v1';
export const ACCOUNT_SCOPE_HEADER = 'x-crmplus-account-id';

export function readActiveAccountId() {
  if (typeof window === 'undefined') return '';
  return window.sessionStorage.getItem(ACTIVE_ACCOUNT_STORAGE_KEY)?.trim() || '';
}

export function writeActiveAccountId(accountId: string) {
  if (typeof window === 'undefined') return;
  const value = accountId.trim();
  if (value) window.sessionStorage.setItem(ACTIVE_ACCOUNT_STORAGE_KEY, value);
  else window.sessionStorage.removeItem(ACTIVE_ACCOUNT_STORAGE_KEY);
}

export function accountScopeHeaders(accountId = readActiveAccountId()) {
  const value = accountId.trim();
  return value ? { [ACCOUNT_SCOPE_HEADER]: value } : {};
}
