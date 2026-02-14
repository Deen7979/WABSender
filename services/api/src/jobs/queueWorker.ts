import { db } from '../db/index.js';
import { logger } from '../utils/logger.js';
import { whatsappPost } from '../services/whatsapp/client.js';
import { broadcastToOrg } from '../websocket/hub.js';

/**
 * Queue Worker
 * 
 * Processes send_queue entries with bounded retry logic.
 * - Polls send_queue for status='pending' or 'retrying'
 * - Attempts to send message via WhatsApp Cloud API
 * - Implements exponential backoff (max 3 retries)
 * - Updates campaign_recipients status based on send result
 * - Fully idempotent via unique constraints and attempt tracking
 */

let workerInterval: NodeJS.Timeout | null = null;
const POLL_INTERVAL_MS = 10_000; // Poll every 10 seconds
const MAX_RETRIES = 3;
const BASE_BACKOFF_MS = 5_000; // 5 seconds base backoff

/**
 * Start the queue worker.
 */
export function startQueueWorker(): void {
  if (workerInterval) {
    logger.warn('Queue worker already running');
    return;
  }

  logger.info('Starting queue worker');
  
  // Run immediately on startup
  processQueue().catch((err) => {
    logger.error('Error in initial queue worker run', { error: err.message });
  });

  // Poll periodically
  workerInterval = setInterval(() => {
    processQueue().catch((err) => {
      logger.error('Error in queue worker poll', { error: err.message });
    });
  }, POLL_INTERVAL_MS);
}

/**
 * Stop the queue worker.
 */
export function stopQueueWorker(): void {
  if (workerInterval) {
    clearInterval(workerInterval);
    workerInterval = null;
    logger.info('Queue worker stopped');
  }
}

/**
 * Main queue processing logic:
 * 1. Find pending/retrying queue entries ready for processing
 * 2. Attempt to send via WhatsApp Cloud API
 * 3. Update queue entry and campaign_recipients based on result
 * 4. Implement retry with exponential backoff
 */
async function processQueue(): Promise<void> {
  try {
    // Find queue entries ready for processing
    const queueEntries = await db.query(
      `SELECT queue_id, org_id, whatsapp_account_id, campaign_id,
              campaign_run_id, recipient_id, phone_number,
              template_params, attempts, next_retry_at
       FROM send_queue
       WHERE status IN ('pending', 'retrying')
         AND (next_retry_at IS NULL OR next_retry_at <= NOW())
       ORDER BY created_at ASC
       LIMIT 20`, // Process 20 entries per poll
      []
    );

    if (queueEntries.rows.length === 0) {
      return; // No entries to process
    }

    logger.info('Processing queue entries', { count: queueEntries.rows.length });

    for (const entry of queueEntries.rows) {
      await processQueueEntry(entry);
    }

    // After processing, check if any campaigns are now complete
    await checkCampaignCompletion();
  } catch (err: any) {
    logger.error('Error processing queue', { error: err.message });
  }
}

/**
 * Process a single queue entry.
 */
async function processQueueEntry(entry: {
  queue_id: string;
  org_id: string;
  whatsapp_account_id: string;
  campaign_id: string;
  campaign_run_id: string;
  recipient_id: string;
  phone_number: string;
  template_params: any;
  attempts: number;
  next_retry_at: string | null;
}): Promise<void> {
  const {
    queue_id,
    org_id,
    whatsapp_account_id,
    campaign_id,
    campaign_run_id,
    recipient_id,
    phone_number,
    template_params,
    attempts,
  } = entry;

  try {
    logger.info('Processing queue entry', {
      queue_id,
      recipient_id,
      attempts,
    });

    // Increment attempts counter
    await db.query(
      `UPDATE send_queue
       SET attempts = attempts + 1
       WHERE queue_id = $1`,
      [queue_id]
    );

    // Get WhatsApp account details
    const whatsappAccount = await db.query(
      `SELECT phone_number_id, access_token
       FROM whatsapp_accounts
       WHERE whatsapp_account_id = $1`,
      [whatsapp_account_id]
    );

    if (whatsappAccount.rows.length === 0) {
      throw new Error('WhatsApp account not found');
    }

    const { phone_number_id, access_token } = whatsappAccount.rows[0];

    // Get campaign template
    const campaign = await db.query(
      `SELECT template_id
       FROM campaigns
       WHERE campaign_id = $1`,
      [campaign_id]
    );

    if (campaign.rows.length === 0) {
      throw new Error('Campaign not found');
    }

    const { template_id } = campaign.rows[0];

    // Get template details
    const template = await db.query(
      `SELECT name, language, components
       FROM templates
       WHERE template_id = $1`,
      [template_id]
    );

    if (template.rows.length === 0) {
      throw new Error('Template not found');
    }

    const { name, language, components } = template.rows[0];

    // Build template payload
    const templatePayload = buildTemplatePayload(
      name,
      language,
      components,
      template_params
    );

    // Send message via WhatsApp Cloud API
    const response = await whatsappPost<{ messages: Array<{ id: string }> }>(
      `/${phone_number_id}/messages`,
      {
        messaging_product: 'whatsapp',
        to: phone_number,
        type: 'template',
        template: templatePayload,
      }
    );

    const metaMessageId = response.messages?.[0]?.id;

    if (!metaMessageId) {
      throw new Error('No message ID in WhatsApp response');
    }

    logger.info('Message sent successfully', {
      queue_id,
      recipient_id,
      metaMessageId,
    });

    // Get contact_id for this recipient
    const recipientData = await db.query(
      `SELECT contact_id FROM campaign_recipients WHERE recipient_id = $1`,
      [recipient_id]
    );
    const contactId = recipientData.rows[0].contact_id;

    // Get or create conversation for this campaign message
    const conversationResult = await db.query(
      `INSERT INTO conversations (org_id, contact_id, last_message_at)
       VALUES ($1, $2, NOW())
       ON CONFLICT (org_id, contact_id)
       DO UPDATE SET last_message_at = NOW()
       RETURNING id`,
      [org_id, contactId]
    );
    const conversationId = conversationResult.rows[0].id;

    // Store message record with retention policy
    const messagePayload = {
      messaging_product: 'whatsapp',
      to: phone_number,
      type: 'template',
      template: templatePayload,
    };

    await db.query(
      `INSERT INTO messages (
        org_id, conversation_id, contact_id, direction,
        body, meta_message_id, status, retention_policy
      )
      VALUES ($1, $2, $3, 'outbound', $4, $5, 'sent', 'campaign')`,
      [
        org_id,
        conversationId,
        contactId,
        JSON.stringify(messagePayload),
        metaMessageId,
      ]
    );

    // Mark queue entry as sent
    await db.query(
      `UPDATE send_queue
       SET status = 'sent', processed_at = NOW()
       WHERE queue_id = $1`,
      [queue_id]
    );

    // Update campaign_recipients status
    await db.query(
      `UPDATE campaign_recipients
       SET status = 'sent', sent_at = NOW()
       WHERE recipient_id = $1`,
      [recipient_id]
    );

    // Broadcast realtime update
    broadcastToOrg(org_id, 'campaign:recipient_sent', {
      campaign_id,
      recipient_id,
      status: 'sent',
    });
  } catch (err: any) {
    logger.error('Error processing queue entry', {
      queue_id,
      recipient_id,
      error: err.message,
      attempts: attempts + 1,
    });

    // Determine if we should retry
    const newAttempts = attempts + 1;
    const shouldRetry = newAttempts < MAX_RETRIES;

    if (shouldRetry) {
      // Calculate next retry time with exponential backoff
      const backoffMs = BASE_BACKOFF_MS * Math.pow(2, newAttempts - 1);
      const nextRetryAt = new Date(Date.now() + backoffMs);

      await db.query(
        `UPDATE send_queue
         SET status = 'retrying', next_retry_at = $1
         WHERE queue_id = $2`,
        [nextRetryAt.toISOString(), queue_id]
      );

      logger.info('Scheduling retry', {
        queue_id,
        recipient_id,
        newAttempts,
        nextRetryAt,
      });
    } else {
      // Max retries exceeded; mark as failed
      await db.query(
        `UPDATE send_queue
         SET status = 'failed', processed_at = NOW()
         WHERE queue_id = $1`,
        [queue_id]
      );

      await db.query(
        `UPDATE campaign_recipients
         SET status = 'failed'
         WHERE recipient_id = $1`,
        [recipient_id]
      );

      logger.error('Max retries exceeded; marking as failed', {
        queue_id,
        recipient_id,
        attempts: newAttempts,
      });

      // Broadcast realtime update
      broadcastToOrg(entry.org_id, 'campaign:recipient_failed', {
        campaign_id,
        recipient_id,
        status: 'failed',
      });
    }
  }
}

/**
 * Build template payload with parameters.
 * Matches the logic from messages.routes.ts single-send.
 */
function buildTemplatePayload(
  name: string,
  language: string,
  components: any[],
  templateParams: any
): any {
  const payload: any = {
    name,
    language: { code: language },
    components: [],
  };

  for (const comp of components) {
    if (comp.type === 'HEADER' && comp.format !== 'TEXT') {
      // Media header (IMAGE, VIDEO, DOCUMENT)
      const mediaUrl = templateParams.header?.media_url;
      if (mediaUrl) {
        payload.components.push({
          type: 'header',
          parameters: [
            {
              type: comp.format.toLowerCase(),
              [comp.format.toLowerCase()]: { link: mediaUrl },
            },
          ],
        });
      }
    } else if (comp.type === 'BODY') {
      // Body parameters
      const bodyParams = templateParams.body || [];
      if (bodyParams.length > 0) {
        payload.components.push({
          type: 'body',
          parameters: bodyParams.map((val: string) => ({
            type: 'text',
            text: val,
          })),
        });
      }
    }
  }

  return payload;
}

/**
 * Check if any campaigns have completed processing.
 * A campaign is complete when all recipients are in terminal states (sent/failed)
 * and no queue entries are pending/retrying.
 */
async function checkCampaignCompletion(): Promise<void> {
  try {
    // Find campaigns with campaign_runs in 'running' status
    const runningCampaigns = await db.query(
      `SELECT campaign_run_id, campaign_id, org_id
       FROM campaign_runs
       WHERE status = 'running'`,
      []
    );

    for (const run of runningCampaigns.rows) {
      const { campaign_run_id, campaign_id, org_id } = run;

      // Check if all queue entries are processed
      const pendingQueue = await db.query(
        `SELECT COUNT(*) as count
         FROM send_queue
         WHERE campaign_run_id = $1
           AND status IN ('pending', 'retrying')`,
        [campaign_run_id]
      );

      const hasPending = parseInt(pendingQueue.rows[0].count, 10) > 0;

      if (!hasPending) {
        // All queue entries processed; mark campaign as completed
        await db.query(
          `UPDATE campaign_runs
           SET status = 'completed', completed_at = NOW()
           WHERE campaign_run_id = $1`,
          [campaign_run_id]
        );

        await db.query(
          `UPDATE campaigns
           SET status = 'completed'
           WHERE campaign_id = $1`,
          [campaign_id]
        );

        logger.info('Campaign completed', { campaign_id, campaign_run_id });

        // Broadcast realtime update
        broadcastToOrg(org_id, 'campaign:completed', {
          campaign_id,
          status: 'completed',
        });
      }
    }
  } catch (err: any) {
    logger.error('Error checking campaign completion', { error: err.message });
  }
}
