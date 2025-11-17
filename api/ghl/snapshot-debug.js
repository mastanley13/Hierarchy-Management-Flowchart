// Add diagnostic endpoint to see raw contact data
// This will help us understand what upline fields are actually populated

export default async function handler(req, res) {
  buildCors(res);
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { debug } = req.query;

    if (debug === 'raw') {
      // Return raw contact data for debugging
      const customFields = await fetchCustomFields();
      const contacts = await fetchAllContacts();
      
      // Sample a few contacts with their custom fields
      const samples = contacts.slice(0, 10).map(contact => {
        const custom = {};
        (contact.customFields || []).forEach((entry) => {
          const field = customFields.byId.get(entry.id);
          const key = field?.fieldKey || entry.id;
          custom[key] = entry.value;
        });

        return {
          id: contact.id,
          name: contact.contactName || `${contact.firstName || ''} ${contact.lastName || ''}`.trim(),
          npn: custom['contact.onboarding__npn'],
          uplineProducerId: custom['contact.upline_producer_id'] || custom['contact.onboarding__upline_npn'],
          uplineEmail: custom['contact.onboarding__upline_email'],
          allCustomFields: custom,
        };
      });

      return res.status(200).json({
        totalContacts: contacts.length,
        samples,
        customFieldKeys: Array.from(new Set(
          contacts.flatMap(c => 
            (c.customFields || []).map(entry => {
              const field = customFields.byId.get(entry.id);
              return field?.fieldKey || entry.id;
            })
          )
        )).sort(),
      });
    }

    // ... rest of original handler code ...
    const customFields = await fetchCustomFields();
    const contacts = await fetchAllContacts();
    const snapshot = buildSnapshot(contacts, customFields.byId);

    return res.status(200).json(snapshot);
  } catch (error) {
    console.error('Error building snapshot:', error);
    return res.status(500).json({ 
      error: 'Failed to build snapshot',
      message: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined,
    });
  }
}

