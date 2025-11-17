import React, { useEffect, useMemo } from 'react';
import { X, ChevronRight } from 'lucide-react';
import type { GHLHierarchyNode } from '../lib/types';
import rawCustomFields from '../../GHL_Custom_Fields_nEEiHT9n7OPxFnBZIycg.json';
import './ContactDetailModal.css';

type ContactDetailModalProps = {
  node: GHLHierarchyNode | null;
  isOpen: boolean;
  onClose: () => void;
  uplinePath?: GHLHierarchyNode[];
};

type RawField = {
  id: string;
  name: string;
  fieldKey: string;
  dataType: string;
  parentId?: string | null;
  position?: number;
};

type PreparedField = {
  id: string;
  fieldKey: string;
  dataType: string;
  position: number;
  displayLabel: string;
};

type PreparedGroup = {
  id: string;
  title: string;
  fields: PreparedField[];
};

type PreparedFieldWithValue = PreparedField & { displayValue: string };
type PreparedGroupWithValues = {
  id: string;
  title: string;
  fields: PreparedFieldWithValue[];
};

const CATEGORY_ORDER = [
  'Onboarding',
  'Upline Information',
  'XCEL Training',
  'Vendor Configuration',
  'Custom Notes',
  'Other',
];

const TRUTHY_CHECKBOX_VALUES = new Set(['true', '1', 'yes', 'checked', 'on']);

const normalizeCategory = (raw: string): string => {
  const value = raw.toLowerCase();
  if (value.includes('onboarding')) return 'Onboarding';
  if (value.includes('upline')) return 'Upline Information';
  if (value.includes('xcel')) return 'XCEL Training';
  if (value.includes('equita') || value.includes('quility') || value.includes('vendor')) {
    return 'Vendor Configuration';
  }
  if (value.includes('note')) return 'Custom Notes';
  return 'Other';
};

const parseFieldMetadata = (field: RawField): { category: string; label: string } => {
  const parts = field.name.split('|').map((part) => part.trim()).filter(Boolean);
  if (parts.length >= 2) {
    const [maybeCategory, ...rest] = parts;
    return {
      category: normalizeCategory(maybeCategory),
      label: rest.join(' | ') || maybeCategory,
    };
  }
  const inferredCategory = normalizeCategory(field.name);
  return { category: inferredCategory, label: parts[0] || field.name };
};

const asRawFields = (): RawField[] => {
  if (Array.isArray(rawCustomFields)) {
    return rawCustomFields as RawField[];
  }
  return [];
};

const buildPreparedGroups = (): PreparedGroup[] => {
  const fields = asRawFields();
  const groups = new Map<string, PreparedGroup>();

  fields.forEach((field) => {
    if (!field || !field.fieldKey) return;
    const { category, label } = parseFieldMetadata(field);
    const groupId = field.parentId ?? category;

    if (!groups.has(groupId)) {
      groups.set(groupId, {
        id: groupId,
        title: category,
        fields: [],
      });
    }

    groups.get(groupId)!.fields.push({
      id: field.id,
      fieldKey: field.fieldKey,
      dataType: field.dataType,
      position: field.position ?? 0,
      displayLabel: label,
    });
  });

  const sortedGroups = Array.from(groups.values());

  sortedGroups.forEach((group) => {
    group.fields.sort((a, b) => a.position - b.position);
  });

  sortedGroups.sort((a, b) => {
    const aIndex = CATEGORY_ORDER.indexOf(a.title);
    const bIndex = CATEGORY_ORDER.indexOf(b.title);
    if (aIndex !== -1 && bIndex !== -1) {
      return aIndex - bIndex;
    }
    if (aIndex !== -1) return -1;
    if (bIndex !== -1) return 1;
    return a.title.localeCompare(b.title);
  });

  return sortedGroups;
};

const PREPARED_GROUPS = buildPreparedGroups();

const readCustomFieldValue = (node: GHLHierarchyNode, fieldKey: string): string | undefined => {
  const direct = node.customFields?.[fieldKey];
  if (direct !== undefined && direct !== null) {
    return String(direct);
  }

  const trimmedKey = fieldKey.replace(/^contact\./, '');
  const trimmedValue = node.customFields?.[trimmedKey];
  if (trimmedValue !== undefined && trimmedValue !== null) {
    return String(trimmedValue);
  }

  return undefined;
};

const getDerivedValue = (
  node: GHLHierarchyNode,
  key: string,
  uplinePath: GHLHierarchyNode[],
): string | undefined => {
  switch (key) {
    case 'onboarding__licensed':
      return node.flags.licensed ? 'Yes' : 'No';
    case 'onboarding__npn':
      return node.npn ?? undefined;
    case 'onboarding__upline_email':
      return node.raw.uplineEmail ?? undefined;
    case 'onboarding__licensing_state':
      return node.licensingState ?? undefined;
    case 'onboarding__comp_level_mrfg':
      return node.compLevel ?? undefined;
    case 'onboarding__xcel_account_created':
      return node.flags.xcelAccountCreated ? 'Yes' : 'No';
    case 'onboarding__xcel_started':
      return node.flags.xcelStarted ? 'Yes' : 'No';
    case 'onboarding__xcel_paid':
      return node.flags.xcelPaid ? 'Yes' : 'No';
    case 'onboarding__xcel_username_email':
      return node.xcel.username || node.email || undefined;
    case 'onboarding__xcel_temp_password':
      return node.xcel.tempPassword || undefined;
    case 'onboarding__quility_profile_created':
      return node.flags.quilityProfile ? 'Yes' : 'No';
    case 'onboarding__equita_profile_created':
      return node.flags.equitaProfile ? 'Yes' : 'No';
    case 'onboarding__producer_number':
      return node.surelcId ?? undefined;
    case 'upline_producer_id':
      return node.raw.uplineProducerId ?? undefined;
    case 'upline_name':
      return uplinePath.length > 1 ? uplinePath[uplinePath.length - 2].label : undefined;
    case 'upline_email':
      return node.raw.uplineEmail ?? undefined;
    case 'upline_highest_stage':
      return node.raw.uplineHighestStage ?? undefined;
    case 'custom_comp_level_notes':
      return node.compLevelNotes ?? undefined;
    case 'xcel_enrollment_date':
      return node.xcel.enrollmentDate || undefined;
    case 'xcel_due_date':
      return node.xcel.dueDate || undefined;
    case 'xcel_last_touch':
      return node.xcel.lastTouch || undefined;
    case 'upline_code_equita':
      return node.vendorFlags.equita ? 'Yes' : undefined;
    case 'upline_code_quility':
      return node.vendorFlags.quility ? 'Yes' : undefined;
    case 'cluster_applies':
      if (node.vendorFlags.equita && node.vendorFlags.quility) return 'Both';
      if (node.vendorFlags.equita) return 'Equita';
      if (node.vendorFlags.quility) return 'Quility';
      return undefined;
    default:
      return undefined;
  }
};

const formatDisplayValue = (value: string | undefined, dataType: string): string => {
  if (!value) {
    return '-';
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return '-';
  }

  if (dataType === 'CHECKBOX') {
    return TRUTHY_CHECKBOX_VALUES.has(trimmed.toLowerCase()) ? 'Yes' : 'No';
  }

  if (dataType === 'DATE') {
    const parsed = new Date(trimmed);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toLocaleDateString();
    }
  }

  return trimmed;
};

const computeGroupsWithValues = (
  node: GHLHierarchyNode | null,
  uplinePath: GHLHierarchyNode[],
): PreparedGroupWithValues[] => {
  if (!node) return [];

  return PREPARED_GROUPS.map((group): PreparedGroupWithValues => ({
    ...group,
    fields: group.fields.map((field): PreparedFieldWithValue => {
      const key = field.fieldKey.replace(/^contact\./, '');
      const directValue = readCustomFieldValue(node, field.fieldKey);
      const derivedValue = getDerivedValue(node, key, uplinePath);
      const valueToShow = directValue !== undefined && directValue !== '' ? directValue : derivedValue;

      return {
        ...field,
        displayValue: formatDisplayValue(valueToShow, field.dataType),
      };
    }),
  }));
};

const ContactDetailModal: React.FC<ContactDetailModalProps> = ({
  node,
  isOpen,
  onClose,
  uplinePath = [],
}) => {
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  const fieldGroups: PreparedGroupWithValues[] = useMemo(
    () => computeGroupsWithValues(node, uplinePath),
    [node, uplinePath],
  );

  if (!isOpen || !node) {
    return null;
  }

  return (
    <div className="contact-detail-modal-overlay" onClick={onClose}>
      <div
        className="contact-detail-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="contact-detail-modal-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="contact-detail-modal__header">
          <div className="contact-detail-modal__header-content">
            <h2 id="contact-detail-modal-title" className="contact-detail-modal__title">
              {node.label}
            </h2>
            {node.npn && (
              <span className="contact-detail-modal__npn">NPN: {node.npn}</span>
            )}
            <span
              className="contact-detail-modal__status"
              style={{
                backgroundColor:
                  node.status === 'ACTIVE'
                    ? '#10b981'
                    : node.status === 'PENDING'
                    ? '#f59e0b'
                    : '#ef4444',
                color: '#ffffff',
              }}
            >
              {node.status}
            </span>
          </div>
          <button className="contact-detail-modal__close" onClick={onClose} aria-label="Close modal">
            <X size={20} />
          </button>
        </div>

        {uplinePath.length > 0 && (
          <div className="contact-detail-modal__breadcrumb" aria-label="Upline path">
            {uplinePath.map((pathNode, index) => (
              <React.Fragment key={pathNode.id}>
                <span
                  className={`breadcrumb-item ${
                    index === uplinePath.length - 1 ? 'breadcrumb-item--current' : ''
                  }`}
                >
                  {pathNode.label}
                </span>
                {index < uplinePath.length - 1 && (
                  <ChevronRight size={14} className="breadcrumb-separator" />
                )}
              </React.Fragment>
            ))}
          </div>
        )}

        <div className="contact-detail-modal__content">
          {fieldGroups.map((group) => (
            <section key={group.id} className="contact-detail-modal__section">
              <h3 className="contact-detail-modal__section-title">{group.title}</h3>
              <div className="contact-detail-modal__fields">
                {group.fields.map((field) => (
                  <div key={field.id} className="contact-detail-modal__field">
                    <span className="contact-detail-modal__field-label">{field.displayLabel}</span>
                    <span className="contact-detail-modal__field-value">{field.displayValue}</span>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
};

export default ContactDetailModal;
