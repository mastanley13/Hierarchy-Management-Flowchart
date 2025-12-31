import React, { useEffect, useMemo, useState } from 'react';
import { X, Copy, ExternalLink, Loader2, Save } from 'lucide-react';
import type {
  GHLHierarchyNode,
  GHLCustomFieldDefinition,
} from '../lib/types';
import { normalizeUplineProducerIdInput, updateUplineProducerId } from '../lib/ghlApi';

type ContactDetailsModalProps = {
  node: GHLHierarchyNode | null;
  definitions: GHLCustomFieldDefinition[];
  path?: GHLHierarchyNode[];
  onClose: () => void;
  canEditUplineProducerId?: boolean;
  onUplineProducerIdSaved?: () => void | Promise<void>;
};

type FieldEntry = {
  key: string;
  label: string;
  value: string;
  dataType: string;
  definition?: GHLCustomFieldDefinition;
};

type FieldGroup = {
  category: string;
  fields: FieldEntry[];
};

const categoryOrder = [
  'Onboarding',
  'Upline Information',
  'XCEL Training',
  'Vendor Configuration',
  'Custom Notes',
  'Other Details',
];

const parentCategoryMap: Record<string, string> = {
  fAmPren0CLITSnktRR77: 'Onboarding',
  '1def0CWHynbi1wFv7HwQ': 'XCEL Training',
};

const normalizeValue = (value: unknown, dataType?: string): string => {
  if (dataType === 'CHECKBOX') {
    if (Array.isArray(value)) {
      return value.some((v) => normalizeValue(v) === 'Yes') ? 'Yes' : 'No';
    }
    const normalized = String(value ?? '').trim().toLowerCase();
    if (!normalized) return 'No';
    return ['yes', 'true', '1', 'on', 'checked'].includes(normalized)
      ? 'Yes'
      : 'No';
  }

  if (dataType === 'DATE') {
    const raw = Array.isArray(value) ? value[0] : value;
    if (!raw) return 'N/A';
    const parsed = new Date(String(raw));
    if (Number.isNaN(parsed.getTime())) return String(raw);
    return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(parsed);
  }

  if (Array.isArray(value)) {
    const joined = value.map((entry) => normalizeValue(entry)).join(', ');
    return joined || 'N/A';
  }

  if (value === null || value === undefined) return 'N/A';
  const str = String(value).trim();
  return str.length > 0 ? str : 'N/A';
};

const labelForKey = (
  key: string,
  definition?: GHLCustomFieldDefinition
): string => {
  if (definition?.name) return definition.name;
  const segments = key.split('__');
  if (segments.length > 1) {
    return segments[segments.length - 1]
      .replace(/_/g, ' ')
      .replace(/\b\w/g, (c) => c.toUpperCase());
  }
  return key
    .replace(/\./g, ' ')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
};

const resolveCategory = (
  entry: FieldEntry,
  definition?: GHLCustomFieldDefinition
): string => {
  if (definition?.parentId) {
    const mapped = parentCategoryMap[definition.parentId];
    if (mapped) return mapped;
  }

  const key = entry.key.toLowerCase();
  if (key.includes('onboarding__xcel') || key.includes('xcel_')) {
    return 'XCEL Training';
  }
  if (key.includes('xcel')) {
    return 'XCEL Training';
  }
  if (key.includes('onboarding__')) {
    return 'Onboarding';
  }
  if (key.includes('upline_code') || key.includes('aggregator')) {
    return 'Vendor Configuration';
  }
  if (key.includes('upline')) {
    return 'Upline Information';
  }
  if (key.includes('notes') || key.includes('custom')) {
    return 'Custom Notes';
  }
  return 'Other Details';
};

const ContactDetailsModal: React.FC<ContactDetailsModalProps> = ({
  node,
  definitions,
  path = [],
  onClose,
  canEditUplineProducerId = true,
  onUplineProducerIdSaved,
}) => {
  const [uplineProducerIdDraft, setUplineProducerIdDraft] = useState('');
  const [uplineProducerIdSaving, setUplineProducerIdSaving] = useState(false);
  const [uplineProducerIdError, setUplineProducerIdError] = useState<string | null>(null);
  const [uplineProducerIdSaved, setUplineProducerIdSaved] = useState(false);

  const definitionByKey = useMemo(() => {
    const map = new Map<string, GHLCustomFieldDefinition>();
    definitions.forEach((def) => {
      if (def.fieldKey) map.set(def.fieldKey, def);
      map.set(def.id, def);
    });
    return map;
  }, [definitions]);

  const customFieldEntries = useMemo<FieldEntry[]>(() => {
    if (!node?.customFields) return [];
    return Object.entries(node.customFields)
      .map(([key, rawValue]) => {
        const definition = definitionByKey.get(key);
        return {
          key,
          label: labelForKey(key, definition),
          value: normalizeValue(rawValue, definition?.dataType),
          dataType: definition?.dataType ?? 'TEXT',
          definition,
        };
      })
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [node, definitionByKey]);

  const groupedFields = useMemo<FieldGroup[]>(() => {
    if (!customFieldEntries.length) return [];
    const groups = new Map<string, FieldEntry[]>();

    customFieldEntries.forEach((entry) => {
      const category = resolveCategory(entry, entry.definition);
      const bucket = groups.get(category) ?? [];
      bucket.push(entry);
      groups.set(category, bucket);
    });

    const ordered: FieldGroup[] = [];
    categoryOrder.forEach((category) => {
      const fields = groups.get(category);
      if (fields && fields.length) {
        ordered.push({
          category,
          fields: fields.sort((a, b) => a.label.localeCompare(b.label)),
        });
        groups.delete(category);
      }
    });

    groups.forEach((fields, category) => {
      ordered.push({
        category,
        fields: fields.sort((a, b) => a.label.localeCompare(b.label)),
      });
    });

    return ordered;
  }, [customFieldEntries]);

  useEffect(() => {
    if (!node) return;
    const current =
      node.customFields?.['contact.upline_producer_id'] ||
      node.customFields?.['contact.onboarding__upline_npn'] ||
      node.raw?.uplineProducerId ||
      '';

    setUplineProducerIdDraft(normalizeUplineProducerIdInput(String(current)));
    setUplineProducerIdError(null);
    setUplineProducerIdSaved(false);
  }, [node]);

  useEffect(() => {
    if (!node) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [node, onClose]);

  if (!node) return null;

  const vendorBadges = [
    node.vendorFlags.equita ? 'Equita' : null,
    node.vendorFlags.quility ? 'Quility' : null,
  ].filter(Boolean) as string[];

  const handleOverlayClick = (event: React.MouseEvent<HTMLDivElement>) => {
    if (event.target === event.currentTarget) {
      onClose();
    }
  };

  const handleCopyJson = () => {
    if (!node) return;
    const payload = JSON.stringify(node.customFields, null, 2);
    if (navigator?.clipboard?.writeText) {
      navigator.clipboard.writeText(payload).catch(() => {});
    }
  };

  const canEditThisNode =
    canEditUplineProducerId &&
    Boolean(node.id) &&
    !node.id.startsWith('upline:');

  const handleSaveUplineProducerId = async () => {
    if (!canEditThisNode) return;
    setUplineProducerIdSaving(true);
    setUplineProducerIdError(null);
    setUplineProducerIdSaved(false);
    try {
      const cleaned = normalizeUplineProducerIdInput(uplineProducerIdDraft);
      await updateUplineProducerId(node.id, cleaned.length > 0 ? cleaned : null);
      setUplineProducerIdSaved(true);
      await onUplineProducerIdSaved?.();
    } catch (err) {
      setUplineProducerIdError(err instanceof Error ? err.message : 'Failed to update');
    } finally {
      setUplineProducerIdSaving(false);
    }
  };

  return (
    <div
      className="upline-modal-overlay"
      role="dialog"
      aria-modal="true"
      onClick={handleOverlayClick}
    >
      <div className="upline-modal">
        <header className="upline-modal__header">
          <div>
            <h2>{node.label}</h2>
            <div className="upline-modal__meta">
              <span>NPN {normalizeValue(node.npn)}</span>
              {node.email && <span>{node.email}</span>}
              <span className={`upline-status upline-status--${node.status.toLowerCase()}`}>
                {node.status}
              </span>
            </div>
            {vendorBadges.length > 0 && (
              <div className="upline-vendor-badges">
                {vendorBadges.map((badge) => (
                  <span key={badge} className={`upline-vendor-badge vendor-${badge.toLowerCase()}`}>
                    {badge}
                  </span>
                ))}
              </div>
            )}
            {path.length > 0 && (
              <nav className="upline-modal__breadcrumb" aria-label="Upline path">
                {path.map((segment, index) => (
                  <span key={segment.id} className="upline-modal__breadcrumb-item">
                    {segment.label}
                    {index < path.length - 1 && (
                      <span className="upline-modal__breadcrumb-sep">›</span>
                    )}
                  </span>
                ))}
              </nav>
            )}
          </div>
          <button
            type="button"
            className="upline-modal__close"
            aria-label="Close contact details"
            onClick={onClose}
          >
            <X size={18} />
          </button>
        </header>

        <section className="upline-modal__section">
          <h3>Summary</h3>
          <div className="upline-modal__summary">
            <div>
              <span className="upline-modal__summary-label">Company</span>
              <span>{normalizeValue(node.companyName)}</span>
            </div>
            <div>
              <span className="upline-modal__summary-label">SureLC ID</span>
              <span>{normalizeValue(node.surelcId)}</span>
            </div>
            <div>
              <span className="upline-modal__summary-label">Licensing State</span>
              <span>{normalizeValue(node.licensingState)}</span>
            </div>
            <div>
              <span className="upline-modal__summary-label">Comp Level</span>
              <span>{normalizeValue(node.compLevel)}</span>
            </div>
            <div>
              <span className="upline-modal__summary-label">Direct Reports</span>
              <span>{node.metrics.directReports}</span>
            </div>
            <div>
              <span className="upline-modal__summary-label">Total Downline</span>
              <span>{node.metrics.descendantCount}</span>
            </div>
          </div>
        </section>

        <section className="upline-modal__section">
          <div className="upline-modal__section-head">
            <h3>Upline Producer ID</h3>
            <div className="upline-modal__actions">
              {uplineProducerIdSaved && <span className="upline-modal__hint">Saved</span>}
              {uplineProducerIdError && (
                <span className="upline-modal__hint upline-modal__hint--error">{uplineProducerIdError}</span>
              )}
            </div>
          </div>
          <div className="upline-modal__hint">
            Current: {normalizeValue(node.customFields?.['contact.upline_producer_id'] ?? node.customFields?.['contact.onboarding__upline_npn'] ?? node.raw?.uplineProducerId)}
          </div>
          <div className="upline-modal__edit-row">
            <input
              className="upline-modal__input"
              value={uplineProducerIdDraft}
              onChange={(event) => {
                setUplineProducerIdSaved(false);
                setUplineProducerIdDraft(event.target.value);
              }}
              onBlur={() => setUplineProducerIdDraft((prev) => normalizeUplineProducerIdInput(prev))}
              inputMode="numeric"
              placeholder={normalizeValue(node.customFields?.['contact.upline_producer_id'] ?? node.customFields?.['contact.onboarding__upline_npn'] ?? node.raw?.uplineProducerId) !== 'N/A'
                ? normalizeValue(node.customFields?.['contact.upline_producer_id'] ?? node.customFields?.['contact.onboarding__upline_npn'] ?? node.raw?.uplineProducerId)
                : 'Enter upline NPN'}
              disabled={!canEditThisNode || uplineProducerIdSaving}
              aria-label="Upline Producer ID"
            />
            <button
              type="button"
              className="upline-modal__action upline-modal__action--icon"
              onClick={handleSaveUplineProducerId}
              disabled={!canEditThisNode || uplineProducerIdSaving}
              aria-label="Save Upline Producer ID"
              title="Save Upline Producer ID"
            >
              {uplineProducerIdSaving ? (
                <Loader2 size={16} className="animate-spin" />
              ) : (
                <Save size={16} />
              )}
            </button>
          </div>
          {!canEditThisNode && (
            <div className="upline-modal__hint">
              Editing is disabled for this node.
            </div>
          )}
          <div className="upline-modal__hint">
            Updates `contact.upline_producer_id` in HighLevel and refreshes the hierarchy.
          </div>
        </section>

        <section className="upline-modal__section">
          <div className="upline-modal__section-head">
            <h3>Custom Fields ({customFieldEntries.length})</h3>
            <div className="upline-modal__actions">
              <button
                type="button"
                className="upline-modal__action"
                onClick={handleCopyJson}
              >
                <Copy size={14} />
                Copy JSON
              </button>
              {node.raw?.uplineProducerId && (
                <span className="upline-modal__hint">
                  Upline ID: {normalizeValue(node.raw.uplineProducerId)}
                </span>
              )}
            </div>
          </div>
          <div className="upline-modal__groups">
            {groupedFields.length === 0 && (
              <div className="upline-modal__empty">
                No custom fields received for this contact.
              </div>
            )}
            {groupedFields.map((group) => (
              <div key={group.category} className="upline-modal__group">
                <h4>{group.category}</h4>
                <div className="upline-modal__group-grid">
                  {group.fields.map((entry) => (
                    <div key={entry.key} className="upline-modal__field">
                      <span className="upline-modal__field-label">{entry.label}</span>
                      <span className="upline-modal__field-value">{entry.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>

        <footer className="upline-modal__footer">
          <div>
            <span className="upline-modal__summary-label">Upline Email</span>
            <span>{normalizeValue(node.raw?.uplineEmail)}</span>
          </div>
          {node.raw?.uplineName && (
            <div>
              <span className="upline-modal__summary-label">Upline Name</span>
              <span>{normalizeValue(node.raw.uplineName)}</span>
            </div>
          )}
          {node.email && (
            <button
              type="button"
              className="upline-modal__action"
              onClick={() => {
                const link = `mailto:${node.email}`;
                window.open(link, '_blank', 'noopener,noreferrer');
              }}
            >
              <ExternalLink size={14} />
              Email Contact
            </button>
          )}
        </footer>
      </div>
    </div>
  );
};

export default ContactDetailsModal;
