# WhatsApp Cloud API Webhook Samples

## Incoming Message (Text)
```json
{
  "object": "whatsapp_business_account",
  "entry": [
    {
      "id": "WABA_ID",
      "changes": [
        {
          "value": {
            "metadata": {
              "display_phone_number": "+15551234567",
              "phone_number_id": "PHONE_NUMBER_ID"
            },
            "contacts": [{ "wa_id": "15551230000" }],
            "messages": [
              {
                "from": "15551230000",
                "id": "wamid.HBgLN...",
                "timestamp": "1700000000",
                "text": { "body": "Hello" },
                "type": "text"
              }
            ]
          },
          "field": "messages"
        }
      ]
    }
  ]
}
```

## Status Update (Delivered)
```json
{
  "object": "whatsapp_business_account",
  "entry": [
    {
      "id": "WABA_ID",
      "changes": [
        {
          "value": {
            "metadata": {
              "display_phone_number": "+15551234567",
              "phone_number_id": "PHONE_NUMBER_ID"
            },
            "statuses": [
              {
                "id": "wamid.HBgLN...",
                "status": "delivered",
                "timestamp": "1700000001",
                "recipient_id": "15551230000"
              }
            ]
          },
          "field": "messages"
        }
      ]
    }
  ]
}
```
