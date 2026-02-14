# Meta API Setup Guide

## Getting Started with Meta Credentials

### Step 1: Create a Meta App

1. Go to [Meta Developers](https://developers.facebook.com)
2. Click "My Apps" → "Create App"
3. Choose app type: **Consumer**
4. Enter app name: WABSender
5. Click "Create App"

### Step 2: Add WhatsApp Product

1. In app dashboard, find "Add Product" or "My Products"
2. Search for and add **WhatsApp**
3. Complete setup wizard
4. Go to WhatsApp settings

### Step 3: Get Your Credentials

**In your Meta App Dashboard:**

```
App ID:         [Found in Settings > Basic]
App Secret:     [Found in Settings > Basic]
```

### Step 4: Set Up OAuth Redirect URI

1. Go to Settings > Basic
2. Add Platform if needed
3. In "App Domains" add: `localhost:4000`
4. In "Valid OAuth Redirect URIs" add:
   ```
   http://localhost:4000/auth/meta-oauth/callback
   ```

### Step 5: Update .env File

```env
# In services/api/.env
META_APP_ID=YOUR_APP_ID_HERE
META_APP_SECRET=YOUR_APP_SECRET_HERE
META_OAUTH_REDIRECT_URI=http://localhost:4000/auth/meta-oauth/callback

# Generate encryption key (run in terminal):
# macOS/Linux:   openssl rand -base64 32
# Windows:       openssl rand -base64 32
ENCRYPTION_KEY=your_32_character_key_here
```

### Step 6: Get a WhatsApp Business Account

1. Go to Meta Business Manager (business.facebook.com)
2. Create or select a Business Account
3. Create a WhatsApp Business Account (WABA)
4. Add a phone number to the WABA
5. Get verified (process varies by country)

### Step 7: Test the Connection

1. Start backend: `npm run dev` (in services/api)
2. Start desktop app: `npm run dev` (in apps/desktop)
3. Log in with test credentials
4. Go to Settings tab
5. Click "Connect WhatsApp"
6. You'll be redirected to Facebook Login
7. Approve requested permissions
8. Your phone number appears in the Settings tab

## API Scopes Explained

WABSender requests these scopes during login:

| Scope | Purpose |
|-------|---------|
| `business_management` | Access to your business accounts |
| `whatsapp_business_management` | Manage WhatsApp Business Account (WABA) settings |
| `whatsapp_business_messaging` | Send messages via WhatsApp API |

## Troubleshooting

### "Invalid app" error
- Verify App ID in .env matches Meta Developer console
- Check that localhost:4000 is in App Domains

### "Redirect URI mismatch"
- Ensure `META_OAUTH_REDIRECT_URI` in .env exactly matches the URI in Meta settings
- Make sure backend is running on port 4000

### "No WhatsApp Business Accounts found"
- You need to create a WABA in Meta Business Manager
- The account must be linked to your Meta app
- Add a phone number to the WABA

### "No phone numbers found"
- Add a phone number to your WhatsApp Business Account in Meta
- Phone number must be verified

### Encryption key errors
- Generate a new key: `openssl rand -base64 32`
- Key must be at least 32 characters
- Update ENCRYPTION_KEY in .env

## Security Notes

⚠️ **Never commit credentials to Git!**

```bash
# .env file should be in .gitignore
echo ".env" >> .gitignore
```

✅ **Encryption** - All access tokens are encrypted before storage using AES-256-GCM

✅ **Token Expiry** - Long-lived tokens valid for 60 days; system alerts when expiring

✅ **CSRF Protection** - OAuth state token prevents cross-site attacks

## Production Setup

For production deployment:

1. **Use environment variables** - Never hardcode credentials
2. **Enable HTTPS** - OAuth only works over HTTPS in production
3. **Rotate encryption keys** - Implement key rotation policy
4. **Monitor token expiry** - Set up alerts for expiring tokens
5. **Audit OAuth events** - Log all connection/disconnection events
6. **Rate limiting** - Protect /auth endpoints from abuse

## Support

- Meta Docs: https://developers.facebook.com/docs/whatsapp
- Graph API Ref: https://developers.facebook.com/docs/graph-api
- Business Manager: https://business.facebook.com
