export type UpdateUplineProducerIdResponse = {
  ok: boolean;
  contactId?: string;
  fieldKey?: 'contact.upline_producer_id';
  fieldId?: string;
  value?: string;
  error?: string;
};

export type UpdateCarrierFieldsResponse = {
  ok: boolean;
  contactId?: string;
  fields?: Array<{
    fieldKey: 'contact.carrier_company_name' | 'contact.carrier_agent_number';
    fieldId?: string;
    value?: string;
  }>;
  error?: string;
};

const normalizeDigits = (value: unknown): string => {
  if (value === null || value === undefined) return '';
  if (Array.isArray(value)) return normalizeDigits(value[0]);
  return String(value).replace(/\D+/g, '');
};

const normalizeText = (value: unknown): string => {
  if (value === null || value === undefined) return '';
  if (Array.isArray(value)) return normalizeText(value[0]);
  return String(value).trim();
};

export async function updateUplineProducerId(
  contactId: string,
  uplineProducerId: string | null,
): Promise<UpdateUplineProducerIdResponse> {
  const payload = {
    contactId,
    uplineProducerId: uplineProducerId ? normalizeDigits(uplineProducerId) : '',
  };

  const res = await fetch('/api/ghl/update-upline-producer-id', {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    try {
      const body = (await res.json()) as { error?: string; details?: string };
      const message = body?.error || body?.details;
      throw new Error(message || `Failed to update upline producer id (${res.status})`);
    } catch {
      const text = await res.text().catch(() => '');
      throw new Error(text || `Failed to update upline producer id (${res.status})`);
    }
  }

  return (await res.json()) as UpdateUplineProducerIdResponse;
}

export async function updateCarrierFields(
  contactId: string,
  updates: { carrierCompanyName?: string | null; carrierAgentNumber?: string | null },
): Promise<UpdateCarrierFieldsResponse> {
  const payload = {
    contactId,
    ...(updates.carrierCompanyName !== undefined
      ? { carrierCompanyName: updates.carrierCompanyName ? normalizeText(updates.carrierCompanyName) : '' }
      : {}),
    ...(updates.carrierAgentNumber !== undefined
      ? { carrierAgentNumber: updates.carrierAgentNumber ? normalizeText(updates.carrierAgentNumber) : '' }
      : {}),
  };

  const res = await fetch('/api/ghl/update-carrier-fields', {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    try {
      const body = (await res.json()) as { error?: string; details?: string };
      const message = body?.error || body?.details;
      throw new Error(message || `Failed to update carrier fields (${res.status})`);
    } catch {
      const text = await res.text().catch(() => '');
      throw new Error(text || `Failed to update carrier fields (${res.status})`);
    }
  }

  return (await res.json()) as UpdateCarrierFieldsResponse;
}

export function normalizeUplineProducerIdInput(value: string): string {
  return normalizeDigits(value);
}
