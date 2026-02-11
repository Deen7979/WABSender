# API Usage Examples

This document provides practical examples for using the WABSender API.

## Table of Contents
- [Text Messages](#text-messages)
- [Media Messages](#media-messages)
- [Template Messages](#template-messages)
- [Interactive Buttons](#interactive-buttons)
- [Using with Different Languages](#using-with-different-languages)

---

## Text Messages

### Simple Text Message

```bash
curl -X POST http://localhost:3000/api/whatsapp/send \
  -H "Content-Type: application/json" \
  -d '{
    "to": "1234567890",
    "message": "Hello! This is a test message."
  }'
```

### Text Message with URL Preview

```bash
curl -X POST http://localhost:3000/api/whatsapp/send \
  -H "Content-Type: application/json" \
  -d '{
    "to": "1234567890",
    "message": "Check out this link: https://www.example.com"
  }'
```

---

## Media Messages

### Send an Image

```bash
curl -X POST http://localhost:3000/api/whatsapp/send-media \
  -H "Content-Type: application/json" \
  -d '{
    "to": "1234567890",
    "mediaType": "image",
    "mediaUrl": "https://picsum.photos/800/600",
    "caption": "Beautiful image!"
  }'
```

### Send a Video

```bash
curl -X POST http://localhost:3000/api/whatsapp/send-media \
  -H "Content-Type: application/json" \
  -d '{
    "to": "1234567890",
    "mediaType": "video",
    "mediaUrl": "https://example.com/video.mp4",
    "caption": "Check out this video"
  }'
```

### Send a Document

```bash
curl -X POST http://localhost:3000/api/whatsapp/send-media \
  -H "Content-Type: application/json" \
  -d '{
    "to": "1234567890",
    "mediaType": "document",
    "mediaUrl": "https://example.com/document.pdf",
    "filename": "Invoice_2024.pdf"
  }'
```

### Send an Audio File

```bash
curl -X POST http://localhost:3000/api/whatsapp/send-media \
  -H "Content-Type: application/json" \
  -d '{
    "to": "1234567890",
    "mediaType": "audio",
    "mediaUrl": "https://example.com/audio.mp3"
  }'
```

---

## Template Messages

### Simple Template

```bash
curl -X POST http://localhost:3000/api/whatsapp/send-template \
  -H "Content-Type: application/json" \
  -d '{
    "to": "1234567890",
    "templateName": "hello_world",
    "languageCode": "en_US"
  }'
```

### Template with Parameters

```bash
curl -X POST http://localhost:3000/api/whatsapp/send-template \
  -H "Content-Type: application/json" \
  -d '{
    "to": "1234567890",
    "templateName": "order_confirmation",
    "languageCode": "en",
    "components": [
      {
        "type": "body",
        "parameters": [
          {
            "type": "text",
            "text": "John Doe"
          },
          {
            "type": "text",
            "text": "ORD-12345"
          }
        ]
      }
    ]
  }'
```

---

## Interactive Buttons

### Simple Button Message

```bash
curl -X POST http://localhost:3000/api/whatsapp/send-buttons \
  -H "Content-Type: application/json" \
  -d '{
    "to": "1234567890",
    "bodyText": "Would you like to continue?",
    "buttons": [
      {"id": "yes", "title": "Yes"},
      {"id": "no", "title": "No"}
    ]
  }'
```

### Buttons with Header and Footer

```bash
curl -X POST http://localhost:3000/api/whatsapp/send-buttons \
  -H "Content-Type: application/json" \
  -d '{
    "to": "1234567890",
    "headerText": "Menu Options",
    "bodyText": "Please select your preference:",
    "footerText": "Reply anytime",
    "buttons": [
      {"id": "opt1", "title": "Option 1"},
      {"id": "opt2", "title": "Option 2"},
      {"id": "opt3", "title": "Option 3"}
    ]
  }'
```

---

## Using with Different Languages

### JavaScript (Node.js)

```javascript
const axios = require('axios');

async function sendWhatsAppMessage(to, message) {
  try {
    const response = await axios.post('http://localhost:3000/api/whatsapp/send', {
      to: to,
      message: message
    });
    
    console.log('Success:', response.data);
    return response.data;
  } catch (error) {
    console.error('Error:', error.response?.data || error.message);
    throw error;
  }
}

// Usage
sendWhatsAppMessage('1234567890', 'Hello from Node.js!');
```

### Python

```python
import requests
import json

def send_whatsapp_message(to, message):
    url = 'http://localhost:3000/api/whatsapp/send'
    headers = {'Content-Type': 'application/json'}
    data = {
        'to': to,
        'message': message
    }
    
    response = requests.post(url, headers=headers, data=json.dumps(data))
    
    if response.status_code == 200:
        print('Success:', response.json())
        return response.json()
    else:
        print('Error:', response.text)
        return None

# Usage
send_whatsapp_message('1234567890', 'Hello from Python!')
```

### PHP

```php
<?php

function sendWhatsAppMessage($to, $message) {
    $url = 'http://localhost:3000/api/whatsapp/send';
    $data = array(
        'to' => $to,
        'message' => $message
    );
    
    $options = array(
        'http' => array(
            'header'  => "Content-Type: application/json\r\n",
            'method'  => 'POST',
            'content' => json_encode($data)
        )
    );
    
    $context  = stream_context_create($options);
    $result = file_get_contents($url, false, $context);
    
    if ($result === FALSE) {
        return null;
    }
    
    return json_decode($result, true);
}

// Usage
$response = sendWhatsAppMessage('1234567890', 'Hello from PHP!');
print_r($response);

?>
```

### cURL Examples

#### Send Text with Authorization Header (if you add auth later)

```bash
curl -X POST http://localhost:3000/api/whatsapp/send \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -d '{
    "to": "1234567890",
    "message": "Authenticated message"
  }'
```

#### Pretty Print JSON Response

```bash
curl -X POST http://localhost:3000/api/whatsapp/send \
  -H "Content-Type: application/json" \
  -d '{
    "to": "1234567890",
    "message": "Hello"
  }' | jq
```

---

## Error Handling Examples

### JavaScript with Error Handling

```javascript
async function sendMessage(to, message) {
  try {
    const response = await fetch('http://localhost:3000/api/whatsapp/send', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ to, message })
    });
    
    const data = await response.json();
    
    if (data.success) {
      console.log('✅ Message sent:', data.data.messages[0].id);
    } else {
      console.error('❌ Failed to send:', data.error);
    }
    
    return data;
  } catch (error) {
    console.error('❌ Network error:', error);
    throw error;
  }
}
```

### Python with Error Handling

```python
import requests
from typing import Optional, Dict

def send_message(to: str, message: str) -> Optional[Dict]:
    try:
        response = requests.post(
            'http://localhost:3000/api/whatsapp/send',
            json={'to': to, 'message': message},
            timeout=10
        )
        
        data = response.json()
        
        if data.get('success'):
            print(f"✅ Message sent: {data['data']['messages'][0]['id']}")
        else:
            print(f"❌ Failed to send: {data.get('error')}")
        
        return data
        
    except requests.RequestException as e:
        print(f"❌ Network error: {e}")
        return None
```

---

## Bulk Messaging Example

### Send to Multiple Recipients (JavaScript)

```javascript
async function sendBulkMessages(recipients, message) {
  const results = [];
  
  for (const recipient of recipients) {
    try {
      const response = await axios.post('http://localhost:3000/api/whatsapp/send', {
        to: recipient,
        message: message
      });
      
      results.push({
        recipient,
        success: true,
        messageId: response.data.data.messages[0].id
      });
      
      // Wait 1 second between messages to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 1000));
    } catch (error) {
      results.push({
        recipient,
        success: false,
        error: error.response?.data || error.message
      });
    }
  }
  
  return results;
}

// Usage
const recipients = ['1234567890', '0987654321', '1122334455'];
const message = 'Bulk message to all recipients';

sendBulkMessages(recipients, message)
  .then(results => console.log('Bulk send results:', results));
```

---

## Testing the Webhook

### Simulate Incoming Message

WhatsApp will send POST requests to your webhook. Here's an example payload:

```json
{
  "object": "whatsapp_business_account",
  "entry": [{
    "id": "WHATSAPP_BUSINESS_ACCOUNT_ID",
    "changes": [{
      "value": {
        "messaging_product": "whatsapp",
        "metadata": {
          "display_phone_number": "1234567890",
          "phone_number_id": "PHONE_NUMBER_ID"
        },
        "contacts": [{
          "profile": {
            "name": "John Doe"
          },
          "wa_id": "1234567890"
        }],
        "messages": [{
          "from": "1234567890",
          "id": "wamid.HBgNMTIzNDU2Nzg5MAcVAgA=",
          "timestamp": "1234567890",
          "type": "text",
          "text": {
            "body": "Hello!"
          }
        }]
      },
      "field": "messages"
    }]
  }]
}
```

### Test Webhook Locally

```bash
curl -X POST http://localhost:3000/webhook \
  -H "Content-Type: application/json" \
  -d '{
    "object": "whatsapp_business_account",
    "entry": [{
      "changes": [{
        "value": {
          "messages": [{
            "from": "1234567890",
            "id": "test_message_id",
            "timestamp": "1234567890",
            "type": "text",
            "text": {
              "body": "Test message"
            }
          }]
        }
      }]
    }]
  }'
```

---

## Best Practices

1. **Rate Limiting**: Don't send too many messages too quickly
2. **Error Handling**: Always handle errors gracefully
3. **Phone Number Format**: Use country code without + sign (e.g., 1234567890)
4. **Message Templates**: Pre-approve templates before use
5. **HTTPS**: Use HTTPS for webhooks in production
6. **Logging**: Log all API interactions for debugging

---

For more information, refer to the main [README.md](README.md) file.
