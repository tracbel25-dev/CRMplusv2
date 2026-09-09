'use client';

import { useMemo, useState } from 'react';
import { MapPin, Navigation, TriangleAlert } from 'lucide-react';
import type { Workspace } from '@/lib/operations/storage';
import { getCustomerLocation } from '@/lib/operations/customers';
import { getKronosDealMeta, isClosedDeal, kronosSignal, type KronosVisit } from '@/lib/operations/kronos';
import { normalize } from '@/lib/operations/model';
import { Badge, Button, Empty } from './ui';

type PinKind = 'visita' | 'esfriando' | 'proposta' | 'inativo';
type MapPinData = {
  customerId: string;
  name: string;
  lat: number;
  lng: number;
  address: string;
  kinds: PinKind[];
  dealId: string;
  visitAt: string;
};

const labels: Record<PinKind, string> = {
  visita: 'Visita programada',
  esfriando: 'Oportunidade esfriando',
  proposta: 'Proposta em aberto',
  inativo: 'Cliente sem oportunidade ativa'
};

const mercatorY = (lat: number) => Math.log(Math.tan(Math.PI / 4 + Math.max(-85, Math.min(85, lat)) * Math.PI / 360));

export function KronosMap({ w, visits, onOpenDeal }: { w: Workspace; visits: KronosVisit[]; onOpenDeal: (id: string) => void }) {
  const [filters, setFilters] = useState<Record<PinKind, boolean>>({ visita: true, esfriando: true, proposta: true, inativo: false });
  const [selected, setSelected] = useState<string>('');
  const stages = w.data.settings.salesStages;
  const planned = visits.filter(visit => visit.status === 'Planejada');

  const allPins = useMemo<MapPinData[]>(() => w.data.customers.flatMap(customer => {
    const customerDeals = w.data.deals.filter(deal => deal.customerId === customer.id && !isClosedDeal(deal));
    const customerVisits = planned.filter(visit => visit.customerId === customer.id).sort((a, b) => a.at.localeCompare(b.at));
    const firstVisit = customerVisits[0];
    const stored = getCustomerLocation(w.data, customer.id);
    const locatedVisit = customerVisits.find(visit => visit.lat !== null && visit.lng !== null);
    const lat = locatedVisit?.lat ?? stored.lat;
    const lng = locatedVisit?.lng ?? stored.lng;
    if (lat === null || lng === null) return [];

    const kinds: PinKind[] = [];
    if (customerVisits.length) kinds.push('visita');
    if (!customerDeals.length) kinds.push('inativo');
    if (customerDeals.some(deal => {
      const signal = kronosSignal(w.data, deal, stages);
      return signal.label === 'Atenção' || signal.daysWithoutContact >= 15;
    })) kinds.push('esfriando');
    if (customerDeals.some(deal => {
      const meta = getKronosDealMeta(w.data, deal.id);
      return normalize(deal.stage).includes('proposta') || ['Em elaboração', 'Enviada'].includes(meta.quoteStatus);
    })) kinds.push('proposta');

    return [{
      customerId: customer.id,
      name: customer.name,
      lat,
      lng,
      address: locatedVisit?.address || stored.address,
      kinds,
      dealId: customerDeals[0]?.id || '',
      visitAt: firstVisit?.at || ''
    }];
  }), [w.data, planned, stages]);

  const pins = allPins.filter(pin => pin.kinds.some(kind => filters[kind]));
  const relevantCustomerIds = new Set([
    ...planned.map(visit => visit.customerId),
    ...w.data.deals.filter(deal => !isClosedDeal(deal)).map(deal => deal.customerId)
  ]);
  const withoutLocation = [...relevantCustomerIds].filter(customerId => {
    const stored = getCustomerLocation(w.data, customerId);
    const visit = planned.find(item => item.customerId === customerId && item.lat !== null && item.lng !== null);
    return !visit && (stored.lat === null || stored.lng === null);
  }).length;

  const bounds = useMemo(() => {
    if (!pins.length) return null;
    let minLat = Math.min(...pins.map(pin => pin.lat));
    let maxLat = Math.max(...pins.map(pin => pin.lat));
    let minLng = Math.min(...pins.map(pin => pin.lng));
    let maxLng = Math.max(...pins.map(pin => pin.lng));
    const latPad = Math.max(0.015, (maxLat - minLat) * 0.18);
    const lngPad = Math.max(0.02, (maxLng - minLng) * 0.18);
    minLat -= latPad; maxLat += latPad; minLng -= lngPad; maxLng += lngPad;
    return { minLat, maxLat, minLng, maxLng, minY: mercatorY(minLat), maxY: mercatorY(maxLat) };
  }, [pins]);

  const activePin = pins.find(pin => pin.customerId === selected);
  const toggle = (kind: PinKind) => setFilters(current => ({ ...current, [kind]: !current[kind] }));

  return <section className="kronos-map-shell">
    <div className="kronos-map-head">
      <div><span className="op-kicker">Leitura territorial</span><h2>Mapa comercial</h2><p>Ative os sinais que quer enxergar sobre a carteira. O mapa não muda o funil; ele ajuda a decidir onde agir.</p></div>
      <div className="kronos-map-filters">{(Object.keys(labels) as PinKind[]).map(kind => <label key={kind} className={`kronos-map-filter ${filters[kind] ? 'active' : ''}`}><input type="checkbox" checked={filters[kind]} onChange={() => toggle(kind)} /><span>{labels[kind]}</span></label>)}</div>
    </div>

    {bounds && pins.length ? <div className="kronos-map-stage">
      <iframe
        title="Mapa comercial do Kronos"
        loading="lazy"
        src={`https://www.openstreetmap.org/export/embed.html?bbox=${bounds.minLng}%2C${bounds.minLat}%2C${bounds.maxLng}%2C${bounds.maxLat}&layer=mapnik`}
      />
      <div className="kronos-map-overlay" aria-label="Clientes no mapa">
        {pins.map(pin => {
          const left = ((pin.lng - bounds.minLng) / Math.max(0.000001, bounds.maxLng - bounds.minLng)) * 100;
          const top = ((bounds.maxY - mercatorY(pin.lat)) / Math.max(0.000001, bounds.maxY - bounds.minY)) * 100;
          const primary = pin.kinds.includes('visita') ? 'visita' : pin.kinds.includes('esfriando') ? 'esfriando' : pin.kinds.includes('proposta') ? 'proposta' : 'inativo';
          return <button key={pin.customerId} className={`kronos-map-pin pin-${primary}`} style={{ left: `${left}%`, top: `${top}%` }} onClick={() => setSelected(pin.customerId)} title={`${pin.name} · ${pin.kinds.map(kind => labels[kind]).join(' · ')}`} aria-label={`Abrir ${pin.name} no mapa`}><MapPin size={23} /><span>{pin.kinds.length}</span></button>;
        })}
      </div>
      {activePin && <div className="kronos-map-popover">
        <div><strong>{activePin.name}</strong><small>{activePin.address || 'Localização salva no cronograma'}</small></div>
        <div className="kronos-map-tags">{activePin.kinds.map(kind => <Badge key={kind}>{labels[kind]}</Badge>)}</div>
        {activePin.visitAt && <small><Navigation size={13} /> Próximo compromisso: {new Date(activePin.visitAt).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}</small>}
        {activePin.dealId && <Button variant="text" onClick={() => onOpenDeal(activePin.dealId)}>Abrir oportunidade</Button>}
      </div>}
    </div> : <Empty icon={<MapPin size={28} />}>Nenhum cliente localizado para os filtros ativos. Ao informar o endereço de uma visita, o Kronos salva a localização para os próximos usos.</Empty>}

    {withoutLocation > 0 && <div className="kronos-map-note"><TriangleAlert size={16} /><span>{withoutLocation} cliente(s) da operação ainda não têm localização. Isso não bloqueia nenhum fluxo; o endereço pode ser aprendido no próximo agendamento.</span></div>}
  </section>;
}
