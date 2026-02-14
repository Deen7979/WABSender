# Backend Service Skeleton (Proposed)

```
services/
  api/
    package.json
    src/
      index.ts
      server.ts
      config/
      routes/
        auth.routes.ts
        contacts.routes.ts
        templates.routes.ts
        campaigns.routes.ts
        messages.routes.ts
        conversations.routes.ts
        automations.routes.ts
        reports.routes.ts
        webhooks.routes.ts
      controllers/
      services/
        whatsapp/
        campaigns/
        contacts/
        inbox/
        automations/
        reports/
        media/
      middleware/
        auth.ts
        validation.ts
        rateLimit.ts
      jobs/
        scheduler.ts
        retries.ts
      db/
        migrations/
        seed/
        index.ts
      websocket/
        hub.ts
        events.ts
      utils/
        logger.ts
        errors.ts
```

Notes:
- Webhook processing lives in `webhooks.routes.ts` + `services/whatsapp`.
- Realtime fan‑out is handled by `websocket/hub.ts`.
- Scheduler and retry queues are in `jobs/`.
