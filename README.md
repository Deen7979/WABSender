# WABSender - WhatsApp Cloud API SaaS Software

[![Node.js](https://img.shields.io/badge/Node.js-14%2B-green.svg)](https://nodejs.org/)
[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

A complete SaaS solution for sending WhatsApp messages using the WhatsApp Cloud API. This application provides a simple REST API and web dashboard for sending text messages, media, templates, and interactive buttons via WhatsApp Business.

## Features

✨ **Core Features:**
- 📤 Send text messages
- 🖼️ Send media (images, videos, documents, audio)
- 📋 Send template messages
- 🔘 Send interactive button messages
- 📨 Webhook support for receiving messages
- ✅ Message delivery status tracking
- 🎯 Mark messages as read

🎨 **Web Dashboard:**
- Clean, modern UI for sending messages
- Multiple message type support
- API documentation included
- Real-time response feedback

🔧 **Developer-Friendly:**
- RESTful API endpoints
- Well-documented code
- Easy configuration
- Error handling

## Prerequisites

Before you begin, ensure you have:
- Node.js 14+ installed
- A Meta (Facebook) Business Account
- WhatsApp Business API access
- A verified WhatsApp Business phone number

## Quick Start

### 1. Clone the Repository

```bash
git clone https://github.com/Deen7979/WABSender.git
cd WABSender
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Configure Environment Variables

Copy the example environment file:

```bash
cp .env.example .env
```

Edit `.env` and add your WhatsApp Cloud API credentials:

```env
PHONE_NUMBER_ID=your_phone_number_id_here
WHATSAPP_TOKEN=your_access_token_here
WEBHOOK_VERIFY_TOKEN=your_webhook_verify_token_here
PORT=3000
API_VERSION=v18.0
```

**How to get credentials:**
1. Go to [Meta for Developers](https://developers.facebook.com/)
2. Create or select your app
3. Add WhatsApp product to your app
4. Get your Phone Number ID from the WhatsApp section
5. Generate an access token (temporary or permanent)
6. Set a webhook verify token (any random string you choose)

### 4. Start the Server

```bash
# Production mode
npm start

# Development mode (with auto-reload)
npm run dev
```

The server will start on `http://localhost:3000`

### 5. Access the Dashboard

Open your browser and navigate to:
```
http://localhost:3000/dashboard.html
```

## API Endpoints

### Send Text Message

```bash
POST /api/whatsapp/send
Content-Type: application/json

{
  "to": "1234567890",
  "message": "Hello from WABSender!"
}
```

### Send Media Message

```bash
POST /api/whatsapp/send-media
Content-Type: application/json

{
  "to": "1234567890",
  "mediaType": "image",
  "mediaUrl": "https://example.com/image.jpg",
  "caption": "Check this out!"
}
```

**Supported media types:** `image`, `video`, `document`, `audio`

### Send Template Message

```bash
POST /api/whatsapp/send-template
Content-Type: application/json

{
  "to": "1234567890",
  "templateName": "hello_world",
  "languageCode": "en_US",
  "components": []
}
```

**Note:** Templates must be pre-approved in your Meta Business Manager.

### Send Interactive Buttons

```bash
POST /api/whatsapp/send-buttons
Content-Type: application/json

{
  "to": "1234567890",
  "bodyText": "Choose an option",
  "buttons": [
    {"id": "1", "title": "Option 1"},
    {"id": "2", "title": "Option 2"}
  ],
  "headerText": "Welcome",
  "footerText": "Powered by WABSender"
}
```

**Limitations:**
- Maximum 3 buttons
- Each button title max 20 characters

### Mark Message as Read

```bash
POST /api/whatsapp/mark-read
Content-Type: application/json

{
  "messageId": "wamid.HBgNMTIzNDU2Nzg5MAcVAgA="
}
```

## Webhook Configuration

To receive incoming messages and status updates:

1. **Set up webhook URL:**
   - URL: `https://your-domain.com/webhook`
   - Verify token: (use the token from your `.env` file)

2. **Subscribe to fields:**
   - messages
   - message_status

3. **The webhook will handle:**
   - Incoming text messages
   - Media messages (image, video, audio, document)
   - Interactive message responses
   - Message delivery status updates
   - Auto-marking messages as read

## Project Structure

```
WABSender/
├── server.js              # Main server file
├── package.json           # Dependencies
├── .env.example          # Environment variables template
├── .gitignore           # Git ignore rules
├── README.md            # Documentation
├── services/
│   └── whatsapp.js      # WhatsApp API service
├── routes/
│   ├── whatsapp.js      # Message sending routes
│   └── webhook.js       # Webhook handling routes
└── public/
    └── dashboard.html   # Web dashboard
```

## Development

### Running in Development Mode

```bash
npm run dev
```

This uses nodemon to automatically restart the server when files change.

### Testing the API

Using curl:

```bash
# Send a text message
curl -X POST http://localhost:3000/api/whatsapp/send \
  -H "Content-Type: application/json" \
  -d '{"to":"1234567890","message":"Hello!"}'
```

Using the dashboard:
1. Open `http://localhost:3000/dashboard.html`
2. Fill in the form
3. Click "Send Message"

## Deployment

### Deploy to Production

1. **Set environment variables** on your hosting platform
2. **Install dependencies:**
   ```bash
   npm install --production
   ```
3. **Start the server:**
   ```bash
   npm start
   ```

### Recommended Hosting Platforms

- **Heroku**: Easy deployment with automatic HTTPS
- **Railway**: Modern deployment platform
- **DigitalOcean**: VPS with full control
- **AWS**: Scalable cloud infrastructure

### HTTPS Requirements

WhatsApp webhooks require HTTPS. Use:
- Reverse proxy (nginx) with SSL certificate
- Cloud platform with automatic HTTPS
- Cloudflare for SSL termination

## Security Best Practices

1. **Never commit `.env` file** - it contains sensitive credentials
2. **Use environment variables** for all secrets
3. **Enable HTTPS** for production
4. **Validate webhook signatures** (implement in webhook.js if needed)
5. **Rate limit API endpoints** for production use
6. **Keep dependencies updated** regularly

## Troubleshooting

### Common Issues

**Error: "WhatsApp configuration missing"**
- Solution: Check that `PHONE_NUMBER_ID` and `WHATSAPP_TOKEN` are set in `.env`

**Webhook verification fails**
- Solution: Ensure `WEBHOOK_VERIFY_TOKEN` in `.env` matches the token in Meta for Developers

**Messages not sending**
- Check that your access token is valid
- Verify the phone number format (country code without +)
- Ensure the recipient has WhatsApp installed

**Cannot receive messages**
- Verify webhook URL is accessible via HTTPS
- Check webhook is subscribed to correct fields
- Review webhook logs in Meta for Developers

## API Response Format

### Success Response

```json
{
  "success": true,
  "data": {
    "messaging_product": "whatsapp",
    "contacts": [{"input": "1234567890", "wa_id": "1234567890"}],
    "messages": [{"id": "wamid.HBgNMTIzNDU2Nzg5MAcVAgA="}]
  }
}
```

### Error Response

```json
{
  "success": false,
  "error": {
    "message": "Error description",
    "code": 100
  }
}
```

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Resources

- [WhatsApp Cloud API Documentation](https://developers.facebook.com/docs/whatsapp/cloud-api)
- [Meta for Developers](https://developers.facebook.com/)
- [WhatsApp Business Platform](https://business.whatsapp.com/)

## Support

For issues and questions:
- Create an issue on GitHub
- Check the [official documentation](https://developers.facebook.com/docs/whatsapp)

## Acknowledgments

- Built with Express.js
- Uses WhatsApp Cloud API
- Powered by Meta for Developers

---

**Made with ❤️ for the WhatsApp Business Community**