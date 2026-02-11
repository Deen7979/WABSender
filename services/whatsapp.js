const axios = require('axios');

class WhatsAppService {
  constructor() {
    this.phoneNumberId = process.env.PHONE_NUMBER_ID;
    this.accessToken = process.env.WHATSAPP_TOKEN;
    // Using v18.0 as default - update to latest version as needed
    // Check https://developers.facebook.com/docs/graph-api/changelog for latest versions
    this.apiVersion = process.env.API_VERSION || 'v18.0';
    this.baseUrl = `https://graph.facebook.com/${this.apiVersion}/${this.phoneNumberId}`;
  }

  /**
   * Validate configuration
   */
  validateConfig() {
    if (!this.phoneNumberId || !this.accessToken) {
      throw new Error('WhatsApp configuration missing. Please set PHONE_NUMBER_ID and WHATSAPP_TOKEN in .env file');
    }
  }

  /**
   * Send a text message
   * @param {string} to - Recipient phone number (with country code, no + sign)
   * @param {string} message - Message text
   */
  async sendTextMessage(to, message) {
    this.validateConfig();

    const data = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: to,
      type: 'text',
      text: {
        preview_url: true,
        body: message
      }
    };

    return this.sendRequest('/messages', data);
  }

  /**
   * Send a template message
   * @param {string} to - Recipient phone number
   * @param {string} templateName - Template name
   * @param {string} languageCode - Language code (default: en_US)
   * @param {Array} components - Template components/parameters
   */
  async sendTemplateMessage(to, templateName, languageCode = 'en_US', components = []) {
    this.validateConfig();

    const data = {
      messaging_product: 'whatsapp',
      to: to,
      type: 'template',
      template: {
        name: templateName,
        language: {
          code: languageCode
        },
        components: components
      }
    };

    return this.sendRequest('/messages', data);
  }

  /**
   * Send media message (image, video, document, audio)
   * @param {string} to - Recipient phone number
   * @param {string} mediaType - Type of media (image, video, document, audio)
   * @param {string} mediaUrl - URL or ID of the media
   * @param {string} caption - Optional caption for image/video
   * @param {string} filename - Optional filename for document
   */
  async sendMediaMessage(to, mediaType, mediaUrl, caption = '', filename = '') {
    this.validateConfig();

    const mediaObject = mediaUrl.startsWith('http') 
      ? { link: mediaUrl } 
      : { id: mediaUrl };

    if (caption && (mediaType === 'image' || mediaType === 'video')) {
      mediaObject.caption = caption;
    }

    if (filename && mediaType === 'document') {
      mediaObject.filename = filename;
    }

    const data = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: to,
      type: mediaType,
      [mediaType]: mediaObject
    };

    return this.sendRequest('/messages', data);
  }

  /**
   * Send interactive message with buttons
   * @param {string} to - Recipient phone number
   * @param {string} bodyText - Message body text
   * @param {Array} buttons - Array of button objects {id, title}
   * @param {string} headerText - Optional header text
   * @param {string} footerText - Optional footer text
   */
  async sendButtonMessage(to, bodyText, buttons, headerText = '', footerText = '') {
    this.validateConfig();

    const interactive = {
      type: 'button',
      body: {
        text: bodyText
      },
      action: {
        buttons: buttons.map((btn, index) => ({
          type: 'reply',
          reply: {
            id: btn.id || `btn_${index}`,
            title: btn.title.substring(0, 20) // Max 20 chars
          }
        })).slice(0, 3) // Max 3 buttons
      }
    };

    if (headerText) {
      interactive.header = {
        type: 'text',
        text: headerText
      };
    }

    if (footerText) {
      interactive.footer = {
        text: footerText
      };
    }

    const data = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: to,
      type: 'interactive',
      interactive: interactive
    };

    return this.sendRequest('/messages', data);
  }

  /**
   * Send request to WhatsApp API
   */
  async sendRequest(endpoint, data) {
    try {
      const response = await axios.post(
        `${this.baseUrl}${endpoint}`,
        data,
        {
          headers: {
            'Authorization': `Bearer ${this.accessToken}`,
            'Content-Type': 'application/json'
          }
        }
      );

      return {
        success: true,
        data: response.data
      };
    } catch (error) {
      console.error('WhatsApp API Error:', error.response?.data || error.message);
      return {
        success: false,
        error: error.response?.data || { message: error.message }
      };
    }
  }

  /**
   * Mark message as read
   * @param {string} messageId - Message ID to mark as read
   */
  async markAsRead(messageId) {
    this.validateConfig();

    const data = {
      messaging_product: 'whatsapp',
      status: 'read',
      message_id: messageId
    };

    return this.sendRequest('/messages', data);
  }
}

module.exports = new WhatsAppService();
