require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const whatsappRoutes = require('./routes/whatsapp');
const webhookRoutes = require('./routes/webhook');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Serve static files
app.use(express.static('public'));

// Routes
app.use('/api/whatsapp', whatsappRoutes);
app.use('/webhook', webhookRoutes);

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    name: 'WABSender - WhatsApp Cloud API SaaS',
    version: '1.0.0',
    endpoints: {
      health: '/health',
      sendMessage: 'POST /api/whatsapp/send',
      sendTemplate: 'POST /api/whatsapp/send-template',
      sendMedia: 'POST /api/whatsapp/send-media',
      webhook: '/webhook',
      dashboard: '/dashboard.html'
    }
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(500).json({
    error: 'Internal Server Error',
    message: err.message
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 WABSender server running on port ${PORT}`);
  console.log(`📱 WhatsApp Cloud API integration ready`);
  console.log(`🌐 Dashboard: http://localhost:${PORT}/dashboard.html`);
  console.log(`💚 Health check: http://localhost:${PORT}/health`);
});

module.exports = app;
