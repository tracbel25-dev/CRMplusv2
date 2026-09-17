'use client';

import { useId, useState, type ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';
import { ProfileSettingsControls } from './ProfileSettingsControls';
import './settings-section.css';

export function SettingsSection({ title, description, children, action, defaultOpen = false, className = '' }: { title: string; description?: ReactNode; children: ReactNode; action?: ReactNode; defaultOpen?: boolean; className?: string }) {
  const [open, setOpen] = useState(defaultOpen);
  const regionId = useId();
  const zeusProfileSection = title === 'Dados da oficina';
  return <section className={`op-section op-settings-section is-collapsible ${open ? 'is-open' : 'is-closed'} ${className}`}>
    <div className="op-section-head">
      <h2><button type="button" className="op-section-toggle" aria-expanded={open} aria-controls={regionId} onClick={() => setOpen(current => !current)}>
        <span className="op-settings-section-copy"><span>{title}</span>{!open && description && <small>{description}</small>}</span>
        <ChevronDown size={18} aria-hidden="true" />
      </button></h2>
      {open && action}
    </div>
    <div id={regionId} className="op-section-body" hidden={!open}>
      {zeusProfileSection && <ProfileSettingsControls fallbackName="" />}
      {children}
    </div>
  </section>;
}
