import { db } from '../db/index.js';
import { logger } from '../utils/logger.js';

/**
 * Campaign Scheduler
 * 
 * Restart-safe scheduler that polls for campaigns ready to execute.
 * - Polls campaign_runs for status='scheduled' and scheduled_at <= NOW
 * - Transitions campaign_runs to status='running'
 * - Enqueues recipients to send_queue (respecting daily limits)
 * - Updates campaign status based on queue state
 * 
 * Restart-safety: All state stored in DB; scheduler can crash mid-run and resume safely.
 */

let schedulerInterval: NodeJS.Timeout | null = null;
const POLL_INTERVAL_MS = 30_000; // Poll every 30 seconds

/**
 * Start the campaign scheduler.
 * Polls for due campaigns and enqueues recipients.
 */
export function startScheduler(): void {
  if (schedulerInterval) {
    logger.warn('Campaign scheduler already running');
    return;
  }

  logger.info('Starting campaign scheduler');
  
  // Run immediately on startup
  processDueCampaigns().catch((err) => {
    logger.error('Error in initial scheduler run', { error: err.message });
  });

  // Poll periodically
  schedulerInterval = setInterval(() => {
    processDueCampaigns().catch((err) => {
      logger.error('Error in scheduler poll', { error: err.message });
    });
  }, POLL_INTERVAL_MS);
}

/**
 * Stop the campaign scheduler.
 * Safe to call during graceful shutdown.
 */
export function stopScheduler(): void {
  if (schedulerInterval) {
    clearInterval(schedulerInterval);
    schedulerInterval = null;
    logger.info('Campaign scheduler stopped');
  }
}

/**
 * Main scheduler logic:
 * 1. Find campaigns with status='scheduled' and scheduled_at <= NOW
 * 2. Transition campaign_run to 'running'
 * 3. Enqueue recipients (respecting daily limits)
 * 4. Update campaign status based on enqueue results
 */
async function processDueCampaigns(): Promise<void> {
  try {
    // Find campaigns due for execution
    const dueCampaigns = await db.query(
      `SELECT campaign_run_id, campaign_id, org_id, whatsapp_account_id
       FROM campaign_runs
       WHERE status = 'scheduled'
         AND scheduled_at <= NOW()
       ORDER BY scheduled_at ASC
       LIMIT 10`, // Process 10 campaigns per poll
      []
    );

    if (dueCampaigns.rows.length === 0) {
      return; // No due campaigns
    }

    logger.info('Processing due campaigns', { count: dueCampaigns.rows.length });

    for (const run of dueCampaigns.rows) {
      await processOneCampaign(run);
    }
  } catch (err: any) {
    logger.error('Error processing due campaigns', { error: err.message });
  }
}

/**
 * Process a single campaign run:
 * - Transition to 'running'
 * - Enqueue recipients (with daily limit checks)
 * - Update final status based on enqueue results
 */
async function processOneCampaign(run: {
  campaign_run_id: string;
  campaign_id: string;
  org_id: string;
  whatsapp_account_id: string;
}): Promise<void> {
  const { campaign_run_id, campaign_id, org_id, whatsapp_account_id } = run;

  try {
    logger.info('Processing campaign run', { campaign_run_id, campaign_id });

    // Step 1: Transition to 'running'
    await db.query(
      `UPDATE campaign_runs
       SET status = 'running', started_at = NOW()
       WHERE campaign_run_id = $1 AND status = 'scheduled'`,
      [campaign_run_id]
    );

    // Step 2: Get all pending recipients for this campaign
    const recipients = await db.query(
      `SELECT recipient_id, phone_number, template_params
       FROM campaign_recipients
       WHERE campaign_id = $1 AND status = 'pending'
       ORDER BY recipient_id ASC`,
      [campaign_id]
    );

    if (recipients.rows.length === 0) {
      // No recipients to send
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
      logger.info('Campaign has no pending recipients', { campaign_id });
      return;
    }

    logger.info('Enqueuing campaign recipients', {
      campaign_id,
      recipientCount: recipients.rows.length,
    });

    // Step 3: Enqueue recipients (respecting daily limits)
    let enqueueCount = 0;
    let limitReachedCount = 0;

    for (const recipient of recipients.rows) {
      const enqueued = await enqueueRecipient({
        campaign_run_id,
        campaign_id,
        recipient_id: recipient.recipient_id,
        phone_number: recipient.phone_number,
        template_params: recipient.template_params,
        org_id,
        whatsapp_account_id,
      });

      if (enqueued) {
        enqueueCount++;
      } else {
        limitReachedCount++;
      }
    }

    logger.info('Enqueue complete', {
      campaign_id,
      enqueueCount,
      limitReachedCount,
    });

    // Step 4: Update campaign_run status
    // If all recipients enqueued, mark as 'running' (queue worker will complete it)
    // If some blocked by limits, mark as 'paused' (will retry next day)
    if (limitReachedCount > 0) {
      await db.query(
        `UPDATE campaign_runs
         SET status = 'paused'
         WHERE campaign_run_id = $1`,
        [campaign_run_id]
      );
      await db.query(
        `UPDATE campaigns
         SET status = 'paused'
         WHERE campaign_id = $1`,
        [campaign_id]
      );
      logger.info('Campaign paused due to daily limits', { campaign_id });
    } else {
      // All enqueued; campaign_run stays 'running' until queue worker completes
      logger.info('Campaign fully enqueued', { campaign_id });
    }
  } catch (err: any) {
    logger.error('Error processing campaign run', {
      campaign_run_id,
      error: err.message,
    });
    // Mark campaign as failed
    await db.query(
      `UPDATE campaign_runs
       SET status = 'failed'
       WHERE campaign_run_id = $1`,
      [campaign_run_id]
    );
    await db.query(
      `UPDATE campaigns
       SET status = 'failed'
       WHERE campaign_id = $1`,
      [campaign_id]
    );
  }
}

/**
 * Enqueue a single recipient for sending.
 * Enforces daily limits BEFORE enqueue (not after send).
 * 
 * Returns true if enqueued, false if blocked by daily limit.
 */
async function enqueueRecipient(params: {
  campaign_run_id: string;
  campaign_id: string;
  recipient_id: string;
  phone_number: string;
  template_params: any;
  org_id: string;
  whatsapp_account_id: string;
}): Promise<boolean> {
  const {
    campaign_run_id,
    campaign_id,
    recipient_id,
    phone_number,
    template_params,
    org_id,
    whatsapp_account_id,
  } = params;

  try {
    // Check daily limits before enqueue
    const canSend = await checkDailyLimits(org_id, whatsapp_account_id);
    if (!canSend) {
      logger.info('Daily limit reached; skipping recipient', {
        recipient_id,
        org_id,
        whatsapp_account_id,
      });
      return false; // Blocked by daily limit
    }

    // Enqueue recipient with idempotency key
    const idempotencyKey = `${campaign_run_id}:${recipient_id}`;
    
    await db.query(
      `INSERT INTO send_queue (
        idempotency_key, org_id, whatsapp_account_id,
        campaign_id, campaign_run_id, recipient_id,
        phone_number, template_params, status, attempts
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'pending', 0)
      ON CONFLICT (idempotency_key) DO NOTHING`,
      [
        idempotencyKey,
        org_id,
        whatsapp_account_id,
        campaign_id,
        campaign_run_id,
        recipient_id,
        phone_number,
        JSON.stringify(template_params),
      ]
    );

    // Increment daily limit counters
    await incrementDailyLimit(org_id, whatsapp_account_id);

    logger.info('Recipient enqueued', { recipient_id, idempotencyKey });
    return true; // Successfully enqueued
  } catch (err: any) {
    logger.error('Error enqueuing recipient', {
      recipient_id,
      error: err.message,
    });
    return false;
  }
}

/**
 * Check if org/account can send more messages today.
 * Checks both org-level and account-level daily limits.
 */
async function checkDailyLimits(
  org_id: string,
  whatsapp_account_id: string
): Promise<boolean> {
  const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD

  // Check org-level limit
  const orgLimit = await db.query(
    `SELECT sent_count, limit_count
     FROM daily_limits
     WHERE org_id = $1
       AND whatsapp_account_id IS NULL
       AND limit_date = $2`,
    [org_id, today]
  );

  if (orgLimit.rows.length > 0) {
    const { sent_count, limit_count } = orgLimit.rows[0];
    if (sent_count >= limit_count) {
      logger.info('Org-level daily limit reached', { org_id, sent_count, limit_count });
      return false;
    }
  }

  // Check account-level limit
  const accountLimit = await db.query(
    `SELECT sent_count, limit_count
     FROM daily_limits
     WHERE org_id = $1
       AND whatsapp_account_id = $2
       AND limit_date = $3`,
    [org_id, whatsapp_account_id, today]
  );

  if (accountLimit.rows.length > 0) {
    const { sent_count, limit_count } = accountLimit.rows[0];
    if (sent_count >= limit_count) {
      logger.info('Account-level daily limit reached', {
        whatsapp_account_id,
        sent_count,
        limit_count,
      });
      return false;
    }
  }

  return true; // No limits exceeded
}

/**
 * Increment daily limit counters for org and account.
 * Called when a message is enqueued (not after send).
 */
async function incrementDailyLimit(
  org_id: string,
  whatsapp_account_id: string
): Promise<void> {
  const today = new Date().toISOString().split('T')[0];

  // Increment org-level counter
  await db.query(
    `INSERT INTO daily_limits (org_id, whatsapp_account_id, limit_date, sent_count, limit_count)
     VALUES ($1, NULL, $2, 1, 1000)
     ON CONFLICT (org_id, whatsapp_account_id, limit_date)
     DO UPDATE SET sent_count = daily_limits.sent_count + 1`,
    [org_id, today]
  );

  // Increment account-level counter
  await db.query(
    `INSERT INTO daily_limits (org_id, whatsapp_account_id, limit_date, sent_count, limit_count)
     VALUES ($1, $2, $3, 1, 1000)
     ON CONFLICT (org_id, whatsapp_account_id, limit_date)
     DO UPDATE SET sent_count = daily_limits.sent_count + 1`,
    [org_id, whatsapp_account_id, today]
  );
}
