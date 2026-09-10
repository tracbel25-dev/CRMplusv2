import type { Customer, Data } from './model';
import { normalize, uid } from './model';

export type CustomerDraft = {
  phone?: string;
  email?: string;
  notes?: string;
};

const cleanPhone = (value = '') => value.replace(/\D/g, '');
const cleanEmail = (value = '') => value.trim().toLocaleLowerCase('pt-BR');

export function customerSuggestions(data: Data) {
  return data.customers
    .map(customer => customer.name.trim())
    .filter(Boolean)
    .filter((name, index, values) => values.findIndex(value => normalize(value) === normalize(name)) === index)
    .sort((a, b) => a.localeCompare(b, 'pt-BR'));
}

export function findCustomerFromInput(data: Data, input: string, draft: CustomerDraft = {}) {
  const raw = input.trim();
  if (!raw) return undefined;

  const direct = data.customers.find(customer => customer.id === raw);
  if (direct) return direct;

  const phone = cleanPhone(draft.phone);
  if (phone) {
    const byPhone = data.customers.find(customer => cleanPhone(customer.phone) === phone);
    if (byPhone) return byPhone;
  }

  const email = cleanEmail(draft.email);
  if (email) {
    const byEmail = data.customers.find(customer => cleanEmail(customer.email) === email);
    if (byEmail) return byEmail;
  }

  const nameKey = normalize(raw);
  const byName = data.customers.filter(customer => normalize(customer.name) === nameKey);
  return byName.length === 1 ? byName[0] : undefined;
}

export function resolveCustomer(data: Data, input: string, draft?: CustomerDraft, options?: { optional?: false }): Customer;
export function resolveCustomer(data: Data, input: string, draft: CustomerDraft | undefined, options: { optional: true }): Customer | null;
export function resolveCustomer(data: Data, input: string, draft: CustomerDraft = {}, options: { optional?: boolean } = {}): Customer | null {
  const name = input.trim();
  if (!name) {
    if (options.optional) return null;
    throw new Error('Informe o cliente. Se ele ainda não existir, o cadastro será criado automaticamente.');
  }

  const existing = findCustomerFromInput(data, name, draft);
  if (existing) {
    const phone = draft.phone?.trim() || '';
    const email = draft.email?.trim() || '';
    if (!existing.phone && phone) existing.phone = phone;
    if (!existing.email && email) existing.email = email;
    if (!existing.notes && draft.notes?.trim()) existing.notes = draft.notes.trim();
    return existing;
  }

  const sameName = data.customers.filter(customer => normalize(customer.name) === normalize(name));
  if (sameName.length > 1) {
    throw new Error('Há mais de um cliente com esse nome. Informe telefone ou e-mail para o sistema reaproveitar o cadastro correto.');
  }

  const customer: Customer = {
    id: uid(),
    name,
    phone: draft.phone?.trim() || '',
    email: draft.email?.trim() || '',
    notes: draft.notes?.trim() || ''
  };
  data.customers.push(customer);
  return customer;
}

const LOCATION_KEYS = {
  address: '__customer_address',
  lat: '__customer_lat',
  lng: '__customer_lng'
} as const;

export type CustomerLocation = { address: string; lat: number | null; lng: number | null };

export function getCustomerLocation(data: Data, customerId: string): CustomerLocation {
  const values = data.customFieldValues?.[customerId] || {};
  const rawLat = values[LOCATION_KEYS.lat];
  const rawLng = values[LOCATION_KEYS.lng];
  const lat = rawLat ? Number(rawLat) : Number.NaN;
  const lng = rawLng ? Number(rawLng) : Number.NaN;
  return {
    address: values[LOCATION_KEYS.address] || '',
    lat: Number.isFinite(lat) ? lat : null,
    lng: Number.isFinite(lng) ? lng : null
  };
}

export function setCustomerLocation(data: Data, customerId: string, location: Partial<CustomerLocation>) {
  data.customFieldValues ??= {};
  const values = { ...(data.customFieldValues[customerId] || {}) };
  if (location.address !== undefined) values[LOCATION_KEYS.address] = location.address.trim();
  if (location.lat !== undefined) values[LOCATION_KEYS.lat] = location.lat === null ? '' : String(location.lat);
  if (location.lng !== undefined) values[LOCATION_KEYS.lng] = location.lng === null ? '' : String(location.lng);
  data.customFieldValues[customerId] = values;
}
