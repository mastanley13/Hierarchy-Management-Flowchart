export type UpdateUplineProducerIdResponse = {
  ok: boolean;
  contactId?: string;
  fieldKey?: 'contact.upline_producer_id';
  fieldId?: string;
  value?: string;
  error?: string;
};

const normalizeDigits = (value: unknown): string => {
  if (value === null || value === undefined) return '';
  if (Array.isArray(value)) return normalizeDigits(value[0]);
  return String(value).replace(/\D+/g, '');
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

export function normalizeUplineProducerIdInput(value: string): string {
  return normalizeDigits(value);
}
