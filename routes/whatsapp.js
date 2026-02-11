const express = require('express');
const router = express.Router();
const whatsappService = require('../services/whatsapp');

/**
 * Send a text message
 * POST /api/whatsapp/send
 * Body: { to: "1234567890", message: "Hello World" }
 */
router.post('/send', async (req, res) => {
  try {
    const { to, message } = req.body;

    if (!to || !message) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: to, message'
      });
    }

    const result = await whatsappService.sendTextMessage(to, message);
    
    res.json(result);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Send a template message
 * POST /api/whatsapp/send-template
 * Body: { to: "1234567890", templateName: "hello_world", languageCode: "en_US", components: [] }
 */
router.post('/send-template', async (req, res) => {
  try {
    const { to, templateName, languageCode, components } = req.body;

    if (!to || !templateName) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: to, templateName'
      });
    }

    const result = await whatsappService.sendTemplateMessage(
      to,
      templateName,
      languageCode || 'en_US',
      components || []
    );
    
    res.json(result);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Send a media message
 * POST /api/whatsapp/send-media
 * Body: { to: "1234567890", mediaType: "image", mediaUrl: "https://...", caption: "..." }
 */
router.post('/send-media', async (req, res) => {
  try {
    const { to, mediaType, mediaUrl, caption, filename } = req.body;

    if (!to || !mediaType || !mediaUrl) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: to, mediaType, mediaUrl'
      });
    }

    const validMediaTypes = ['image', 'video', 'document', 'audio'];
    if (!validMediaTypes.includes(mediaType)) {
      return res.status(400).json({
        success: false,
        error: `Invalid mediaType. Must be one of: ${validMediaTypes.join(', ')}`
      });
    }

    const result = await whatsappService.sendMediaMessage(
      to,
      mediaType,
      mediaUrl,
      caption || '',
      filename || ''
    );
    
    res.json(result);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Send an interactive button message
 * POST /api/whatsapp/send-buttons
 * Body: { to: "1234567890", bodyText: "Choose an option", buttons: [{id: "1", title: "Option 1"}] }
 */
router.post('/send-buttons', async (req, res) => {
  try {
    const { to, bodyText, buttons, headerText, footerText } = req.body;

    if (!to || !bodyText || !buttons || !Array.isArray(buttons)) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: to, bodyText, buttons (array)'
      });
    }

    if (buttons.length === 0 || buttons.length > 3) {
      return res.status(400).json({
        success: false,
        error: 'Buttons array must contain 1-3 buttons'
      });
    }

    const result = await whatsappService.sendButtonMessage(
      to,
      bodyText,
      buttons,
      headerText || '',
      footerText || ''
    );
    
    res.json(result);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Mark message as read
 * POST /api/whatsapp/mark-read
 * Body: { messageId: "wamid.xxx" }
 */
router.post('/mark-read', async (req, res) => {
  try {
    const { messageId } = req.body;

    if (!messageId) {
      return res.status(400).json({
        success: false,
        error: 'Missing required field: messageId'
      });
    }

    const result = await whatsappService.markAsRead(messageId);
    
    res.json(result);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;
