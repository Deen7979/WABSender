const express = require('express');
const router = express.Router();
const whatsappService = require('../services/whatsapp');

/**
 * Webhook verification (GET)
 * WhatsApp will send a GET request to verify the webhook
 */
router.get('/', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  // Check if a token and mode were sent
  if (mode && token) {
    // Check the mode and token sent is correct
    if (mode === 'subscribe' && token === process.env.WEBHOOK_VERIFY_TOKEN) {
      // Respond with 200 OK and challenge token from the request
      console.log('✅ Webhook verified');
      res.status(200).send(challenge);
    } else {
      // Respond with '403 Forbidden' if verify tokens do not match
      console.error('❌ Webhook verification failed');
      res.sendStatus(403);
    }
  } else {
    res.sendStatus(400);
  }
});

/**
 * Webhook handler (POST)
 * Receives incoming messages, status updates, etc.
 */
router.post('/', async (req, res) => {
  try {
    const body = req.body;

    // Check if this is a WhatsApp message
    if (body.object) {
      if (body.entry && 
          body.entry[0].changes && 
          body.entry[0].changes[0] && 
          body.entry[0].changes[0].value.messages && 
          body.entry[0].changes[0].value.messages[0]
      ) {
        const message = body.entry[0].changes[0].value.messages[0];
        const from = message.from;
        const messageId = message.id;
        const messageType = message.type;

        console.log('📨 Incoming message:', {
          from,
          messageId,
          type: messageType
        });

        // Handle different message types
        switch (messageType) {
          case 'text':
            const textMessage = message.text.body;
            console.log(`Text from ${from}: ${textMessage}`);
            
            // Auto-reply example (uncomment to enable)
            // await whatsappService.sendTextMessage(from, `You said: ${textMessage}`);
            break;

          case 'image':
            console.log(`Image from ${from}:`, message.image);
            break;

          case 'video':
            console.log(`Video from ${from}:`, message.video);
            break;

          case 'audio':
            console.log(`Audio from ${from}:`, message.audio);
            break;

          case 'document':
            console.log(`Document from ${from}:`, message.document);
            break;

          case 'location':
            console.log(`Location from ${from}:`, message.location);
            break;

          case 'interactive':
            console.log(`Interactive message from ${from}:`, message.interactive);
            break;

          default:
            console.log(`Unknown message type: ${messageType}`);
        }

        // Mark message as read
        await whatsappService.markAsRead(messageId);
      }

      // Check for status updates
      if (body.entry &&
          body.entry[0].changes &&
          body.entry[0].changes[0] &&
          body.entry[0].changes[0].value.statuses &&
          body.entry[0].changes[0].value.statuses[0]
      ) {
        const status = body.entry[0].changes[0].value.statuses[0];
        console.log('📊 Message status update:', {
          id: status.id,
          status: status.status,
          timestamp: status.timestamp
        });
      }

      // Return 200 OK
      res.sendStatus(200);
    } else {
      // Not a WhatsApp message
      res.sendStatus(404);
    }
  } catch (error) {
    console.error('Webhook error:', error);
    res.sendStatus(500);
  }
});

module.exports = router;
