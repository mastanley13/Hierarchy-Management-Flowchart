import { ChevronRight } from 'lucide-react';
import { useState, type ReactNode } from 'react';

interface CollapsibleSectionProps {
  title: string;
  defaultOpen?: boolean;
  badge?: string | number;
  children: ReactNode;
  tone?: 'default' | 'accent' | 'muted';
}

export const CollapsibleSection = ({
  title,
  defaultOpen = false,
  badge,
  children,
  tone = 'default',
}: CollapsibleSectionProps) => {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <div className={`collapsible-section collapsible-section--${tone}`}>
      <button
        type="button"
        className="collapsible-section__header"
        onClick={() => setIsOpen(!isOpen)}
        aria-expanded={isOpen}
      >
        <ChevronRight size={16} className={isOpen ? 'rotated' : ''} />
        <h4>{title}</h4>
        {badge !== undefined && <span className="badge">{badge}</span>}
      </button>
      <div className={`collapsible-section__content ${isOpen ? 'is-open' : ''}`}>
        {children}
      </div>
    </div>
  );
};
