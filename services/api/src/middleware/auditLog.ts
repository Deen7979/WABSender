import { Request, Response, NextFunction } from 'express';
import { db } from '../db/index.js';
import { logger } from '../utils/logger.js';

/**
 * Audit action types taxonomy
 */
export enum AuditAction {
  // Authentication
  AUTH_LOGIN = 'auth.login',
  AUTH_LOGOUT = 'auth.logout',
  AUTH_FAILED = 'auth.failed',
  
  // Campaigns
  CAMPAIGN_CREATED = 'campaign.created',
  CAMPAIGN_SCHEDULED = 'campaign.scheduled',
  CAMPAIGN_STARTED = 'campaign.started',
  CAMPAIGN_PAUSED = 'campaign.paused',
  CAMPAIGN_RESUMED = 'campaign.resumed',
  CAMPAIGN_DELETED = 'campaign.deleted',
  
  // Contacts
  CONTACT_IMPORTED = 'contact.imported',
  CONTACT_CREATED = 'contact.created',
  CONTACT_UPDATED = 'contact.updated',
  CONTACT_DELETED = 'contact.deleted',
  
  // Messages
  MESSAGE_SENT = 'message.sent',
  MESSAGE_RECEIVED = 'message.received',
  
  // Templates
  TEMPLATE_SYNCED = 'template.synced',
  TEMPLATE_DELETED = 'template.deleted',
  
  // Automation
  AUTOMATION_CREATED = 'automation.created',
  AUTOMATION_UPDATED = 'automation.updated',
  AUTOMATION_DELETED = 'automation.deleted',
  AUTOMATION_TRIGGERED = 'automation.triggered',
  
  // Business Hours
  BUSINESS_HOURS_UPDATED = 'business_hours.updated',
  
  // Opt-in/Opt-out
  OPT_IN_RECORDED = 'opt_in.recorded',
  OPT_OUT_RECORDED = 'opt_out.recorded',
  
  // Exports
  EXPORT_GENERATED = 'export.generated',
  
  // Users
  USER_CREATED = 'user.created',
  USER_UPDATED = 'user.updated',
  USER_DELETED = 'user.deleted',
  
  // Organizations
  ORG_CREATED = 'org.created',
}

/**
 * Resource types for audit logging
 */
export enum ResourceType {
  CAMPAIGN = 'campaign',
  CONTACT = 'contact',
  MESSAGE = 'message',
  TEMPLATE = 'template',
  AUTOMATION = 'automation',
  BUSINESS_HOURS = 'business_hours',
  OPT_IN = 'opt_in',
  WHATSAPP_ACCOUNT = 'whatsapp_account',
  EXPORT = 'export',
  USER = 'user',
  ORG = 'org',
}

/**
 * Audit log entry interface
 */
export interface AuditLogEntry {
  orgId: string;
  userId?: string;
  action: AuditAction | string;
  resourceType?: ResourceType | string;
  resourceId?: string;
  metadata?: Record<string, any>;
  ipAddress?: string;
  userAgent?: string;
}

/**
 * Log an audit event to the database
 */
export async function logAudit(entry: AuditLogEntry): Promise<void> {
  try {
    const {
      orgId,
      userId,
      action,
      resourceType,
      resourceId,
      metadata,
      ipAddress,
      userAgent,
    } = entry;

    await db.query(
      `INSERT INTO audit_logs (
        org_id, user_id, action, resource_type, resource_id, metadata, ip_address, user_agent
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        orgId,
        userId || null,
        action,
        resourceType || null,
        resourceId || null,
        metadata ? JSON.stringify(metadata) : null,
        ipAddress || null,
        userAgent || null,
      ]
    );

    logger.info('[Audit] Logged action', {
      orgId,
      userId,
      action,
      resourceType,
      resourceId,
    });
  } catch (error: any) {
    // Don't throw - audit failures shouldn't block operations
    logger.error('[Audit] Failed to log action', {
      error: error.message,
      entry,
    });
  }
}

/**
 * Extract IP address from request
 */
function getIpAddress(req: Request): string | undefined {
  return (
    (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
    (req.headers['x-real-ip'] as string) ||
    req.socket.remoteAddress ||
    undefined
  );
}

/**
 * Express middleware to auto-capture audit events
 * Usage: router.post('/resource', auditMiddleware(AuditAction.RESOURCE_CREATED, ResourceType.RESOURCE), handler)
 */
export function auditMiddleware(
  action: AuditAction | string,
  resourceType?: ResourceType | string,
  options?: {
    getResourceId?: (req: Request, res: Response) => string | undefined;
    getMetadata?: (req: Request, res: Response) => Record<string, any> | undefined;
  }
) {
  return async (req: Request, res: Response, next: NextFunction) => {
    // Capture original res.json to intercept successful responses
    const originalJson = res.json.bind(res);

    res.json = function (body: any) {
      // Only log on successful responses (2xx status codes)
      if (res.statusCode >= 200 && res.statusCode < 300) {
        const orgId = (req as any).auth?.orgId;
        const userId = (req as any).auth?.userId;

        if (orgId) {
          // Extract resource ID from response or options
          let resourceId: string | undefined;
          if (options?.getResourceId) {
            resourceId = options.getResourceId(req, res);
          } else if (body?.id) {
            resourceId = body.id;
          } else if ((req.params as any).id) {
            resourceId = (req.params as any).id;
          }

          // Extract metadata from options
          let metadata: Record<string, any> | undefined;
          if (options?.getMetadata) {
            metadata = options.getMetadata(req, res);
          }

          // Log audit event (async, non-blocking)
          logAudit({
            orgId,
            userId,
            action,
            resourceType,
            resourceId,
            metadata,
            ipAddress: getIpAddress(req),
            userAgent: req.headers['user-agent'],
          }).catch((err) => {
            logger.error('[Audit] Async log failed', { error: err.message });
          });
        }
      }

      return originalJson(body);
    };

    next();
  };
}

/**
 * Manual audit logging helper (for use in route handlers)
 */
export async function auditLog(
  req: Request,
  action: AuditAction | string,
  resourceType?: ResourceType | string,
  resourceId?: string,
  metadata?: Record<string, any>
): Promise<void> {
  const orgId = (req as any).auth?.orgId;
  const userId = (req as any).auth?.userId;

  if (!orgId) {
    logger.warn('[Audit] No orgId in request, skipping audit log');
    return;
  }

  await logAudit({
    orgId,
    userId,
    action,
    resourceType,
    resourceId,
    metadata,
    ipAddress: getIpAddress(req),
    userAgent: req.headers['user-agent'],
  });
}
