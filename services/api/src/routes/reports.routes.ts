import { Router } from 'express';
import { db } from '../db/index.js';
import { generateCSV, formatDate, formatPercentage, formatDuration, CSVColumn } from '../utils/csvExporter.js';

const router = Router();

/**
 * GET /reports/campaigns/:campaignId
 * Returns detailed campaign report with delivery funnel, performance metrics, and timeline data
 */
router.get('/campaigns/:campaignId', async (req, res) => {
  try {
    const { campaignId } = req.params;
    const orgId = (req as any).orgId;

    // Get campaign details
    const campaignResult = await db.query(
      `SELECT 
        c.id,
        c.name,
        c.status,
        c.scheduled_at,
        c.created_at,
        t.name AS template_name
      FROM campaigns c
      LEFT JOIN templates t ON c.template_id = t.id
      WHERE c.id = $1 AND c.org_id = $2`,
      [campaignId, orgId]
    );

    if (campaignResult.rows.length === 0) {
      return res.status(404).json({ error: 'Campaign not found' });
    }

    const campaign = campaignResult.rows[0];

    // Get delivery funnel stats
    const statsResult = await db.query(
      `SELECT 
        COUNT(cr.id) AS total_recipients,
        COUNT(cr.id) AS queued_count,
        COUNT(CASE WHEN cr.status IN ('sent') THEN 1 END) AS sent_count,
        COUNT(CASE WHEN m.status IN ('delivered', 'read') THEN 1 END) AS delivered_count,
        COUNT(CASE WHEN m.status = 'read' THEN 1 END) AS read_count,
        COUNT(CASE WHEN cr.status = 'failed' THEN 1 END) AS failed_count,
        AVG(
          CASE 
            WHEN m.status IN ('delivered', 'read') 
            THEN EXTRACT(EPOCH FROM (m.created_at - $2))
            ELSE NULL
          END
        ) AS avg_delivery_seconds
      FROM campaign_recipients cr
      LEFT JOIN messages m ON m.contact_id = cr.contact_id 
        AND m.retention_policy = 'campaign'
        AND m.created_at >= $2
      WHERE cr.campaign_id = $1`,
      [campaignId, campaign.scheduled_at || campaign.created_at]
    );

    const stats = statsResult.rows[0];

    // Calculate performance metrics
    const totalRecipients = parseInt(stats.total_recipients) || 0;
    const sentCount = parseInt(stats.sent_count) || 0;
    const deliveredCount = parseInt(stats.delivered_count) || 0;
    const readCount = parseInt(stats.read_count) || 0;

    const deliveryRate = totalRecipients > 0 ? (sentCount / totalRecipients) * 100 : 0;
    const readRate = deliveredCount > 0 ? (readCount / deliveredCount) * 100 : 0;
    const avgDeliveryTime = parseFloat(stats.avg_delivery_seconds) || 0;

    // Get timeline data (hourly message volume)
    const timelineResult = await db.query(
      `SELECT 
        DATE_TRUNC('hour', m.created_at) AS time_bucket,
        COUNT(*) AS message_count,
        COUNT(CASE WHEN m.status IN ('sent', 'delivered', 'read') THEN 1 END) AS sent,
        COUNT(CASE WHEN m.status = 'failed' THEN 1 END) AS failed
      FROM messages m
      JOIN campaign_recipients cr ON m.contact_id = cr.contact_id
      WHERE cr.campaign_id = $1
        AND m.retention_policy = 'campaign'
        AND m.created_at >= $2
      GROUP BY time_bucket
      ORDER BY time_bucket ASC`,
      [campaignId, campaign.scheduled_at || campaign.created_at]
    );

    const timeline = timelineResult.rows.map((row: Record<string, any>) => ({
      time: row.time_bucket,
      total: parseInt(row.message_count),
      sent: parseInt(row.sent),
      failed: parseInt(row.failed)
    }));

    res.json({
      campaign: {
        id: campaign.id,
        name: campaign.name,
        template: campaign.template_name,
        status: campaign.status,
        scheduledAt: campaign.scheduled_at,
        createdAt: campaign.created_at
      },
      stats: {
        totalRecipients,
        queued: parseInt(stats.queued_count) || 0,
        sent: sentCount,
        delivered: deliveredCount,
        read: readCount,
        failed: parseInt(stats.failed_count) || 0
      },
      metrics: {
        deliveryRate: Math.round(deliveryRate * 10) / 10,
        readRate: Math.round(readRate * 10) / 10,
        avgDeliveryTime: Math.round(avgDeliveryTime)
      },
      timeline
    });

  } catch (error: any) {
    console.error('[Reports] Error fetching campaign report:', error);
    res.status(500).json({ error: 'Failed to generate campaign report' });
  }
});

/**
 * GET /reports/campaigns
 * Returns list of all campaigns with aggregated stats
 * Query params: status, startDate, endDate, templateId, sortBy, page, limit
 */
router.get('/campaigns', async (req, res) => {
  try {
    const orgId = (req as any).orgId;
    const {
      status,
      startDate,
      endDate,
      templateId,
      sortBy = 'created_at',
      order = 'DESC',
      page = '1',
      limit = '50'
    } = req.query;

    const pageNum = parseInt(page as string);
    const limitNum = parseInt(limit as string);
    const offset = (pageNum - 1) * limitNum;

    // Build WHERE clause
    const conditions = ['c.org_id = $1'];
    const params: any[] = [orgId];
    let paramIndex = 2;

    if (status) {
      conditions.push(`c.status = $${paramIndex}`);
      params.push(status);
      paramIndex++;
    }

    if (startDate) {
      conditions.push(`c.created_at >= $${paramIndex}`);
      params.push(startDate);
      paramIndex++;
    }

    if (endDate) {
      conditions.push(`c.created_at <= $${paramIndex}`);
      params.push(endDate);
      paramIndex++;
    }

    if (templateId) {
      conditions.push(`c.template_id = $${paramIndex}`);
      params.push(templateId);
      paramIndex++;
    }

    const whereClause = conditions.join(' AND ');

    // Validate sortBy to prevent SQL injection
    const allowedSortFields = ['created_at', 'name', 'scheduled_at', 'delivery_rate', 'read_rate'];
    const sortField = allowedSortFields.includes(sortBy as string) ? sortBy : 'created_at';
    const sortOrder = order === 'ASC' ? 'ASC' : 'DESC';

    // Get total count
    const countResult = await db.query(
      `SELECT COUNT(DISTINCT c.id) AS total
       FROM campaigns c
       WHERE ${whereClause}`,
      params
    );

    const total = parseInt(countResult.rows[0].total);

    // Get campaigns with aggregated stats
    const campaignsResult = await db.query(
      `SELECT 
        c.id,
        c.name,
        c.status,
        c.scheduled_at,
        c.created_at,
        t.name AS template_name,
        COUNT(cr.id) AS total_recipients,
        COUNT(CASE WHEN cr.status = 'sent' THEN 1 END) AS sent_count,
        COUNT(CASE WHEN m.status IN ('delivered', 'read') THEN 1 END) AS delivered_count,
        COUNT(CASE WHEN m.status = 'read' THEN 1 END) AS read_count,
        COUNT(CASE WHEN cr.status = 'failed' THEN 1 END) AS failed_count,
        CASE 
          WHEN COUNT(cr.id) > 0 
          THEN ROUND((COUNT(CASE WHEN cr.status = 'sent' THEN 1 END)::numeric / COUNT(cr.id)) * 100, 1)
          ELSE 0
        END AS delivery_rate,
        CASE 
          WHEN COUNT(CASE WHEN m.status IN ('delivered', 'read') THEN 1 END) > 0
          THEN ROUND((COUNT(CASE WHEN m.status = 'read' THEN 1 END)::numeric / COUNT(CASE WHEN m.status IN ('delivered', 'read') THEN 1 END)) * 100, 1)
          ELSE 0
        END AS read_rate
      FROM campaigns c
      LEFT JOIN templates t ON c.template_id = t.id
      LEFT JOIN campaign_recipients cr ON c.id = cr.campaign_id
      LEFT JOIN messages m ON m.contact_id = cr.contact_id 
        AND m.retention_policy = 'campaign'
        AND m.created_at >= c.scheduled_at
      WHERE ${whereClause}
      GROUP BY c.id, c.name, c.status, c.scheduled_at, c.created_at, t.name
      ORDER BY ${sortField} ${sortOrder}
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
      [...params, limitNum, offset]
    );

    const campaigns = campaignsResult.rows.map((row: Record<string, any>) => ({
      id: row.id,
      name: row.name,
      template: row.template_name,
      status: row.status,
      scheduledAt: row.scheduled_at,
      createdAt: row.created_at,
      stats: {
        totalRecipients: parseInt(row.total_recipients),
        sent: parseInt(row.sent_count),
        delivered: parseInt(row.delivered_count),
        read: parseInt(row.read_count),
        failed: parseInt(row.failed_count),
        deliveryRate: parseFloat(row.delivery_rate),
        readRate: parseFloat(row.read_rate)
      }
    }));

    res.json({
      campaigns,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum)
      }
    });

  } catch (error: any) {
    console.error('[Reports] Error fetching campaigns list:', error);
    res.status(500).json({ error: 'Failed to fetch campaigns report' });
  }
});

/**
 * GET /reports/inbox/summary
 * Returns inbox analytics summary
 * Query params: startDate, endDate
 */
router.get('/inbox/summary', async (req, res) => {
  try {
    const orgId = (req as any).orgId;
    const { startDate, endDate } = req.query;

    const start = startDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const end = endDate || new Date().toISOString();

    const summaryResult = await db.query(
      `SELECT 
        COUNT(DISTINCT c.id) AS total_conversations,
        COUNT(DISTINCT CASE WHEN c.last_message_at >= NOW() - INTERVAL '24 hours' THEN c.id END) AS active_conversations,
        SUM(cp.unread_count) AS total_unread,
        COUNT(DISTINCT CASE WHEN m.direction = 'inbound' THEN m.id END) AS inbound_messages,
        COUNT(DISTINCT CASE WHEN m.direction = 'outbound' AND m.created_at > c.created_at THEN m.id END) AS outbound_messages
      FROM conversations c
      LEFT JOIN conversation_participants cp ON c.id = cp.conversation_id
      LEFT JOIN messages m ON c.id = m.conversation_id AND m.created_at BETWEEN $2 AND $3
      WHERE c.org_id = $1`,
      [orgId, start, end]
    );

    const summary = summaryResult.rows[0];

    const responseTimeResult = await db.query(
      `SELECT AVG(response_seconds) AS avg_response_seconds
       FROM (
         SELECT 
           EXTRACT(EPOCH FROM (
             (SELECT MIN(m2.created_at) 
              FROM messages m2 
              WHERE m2.conversation_id = m1.conversation_id 
                AND m2.direction = 'outbound' 
                AND m2.created_at > m1.created_at
                AND m2.meta_message_id NOT LIKE 'auto-%')
             - m1.created_at
           )) AS response_seconds
         FROM messages m1
         WHERE m1.org_id = $1
           AND m1.direction = 'inbound'
           AND m1.created_at BETWEEN $2 AND $3
       ) responses
       WHERE response_seconds IS NOT NULL`,
      [orgId, start, end]
    );

    const avgResponseSeconds = parseFloat(responseTimeResult.rows[0]?.avg_response_seconds) || 0;

    res.json({
      summary: {
        totalConversations: parseInt(summary.total_conversations) || 0,
        activeConversations: parseInt(summary.active_conversations) || 0,
        totalUnread: parseInt(summary.total_unread) || 0,
        inboundMessages: parseInt(summary.inbound_messages) || 0,
        outboundMessages: parseInt(summary.outbound_messages) || 0,
        avgResponseTime: Math.round(avgResponseSeconds)
      },
      dateRange: { start, end }
    });

  } catch (error: any) {
    console.error('[Reports] Error fetching inbox summary:', error);
    res.status(500).json({ error: 'Failed to generate inbox summary' });
  }
});

/**
 * GET /reports/inbox/agents
 * Returns per-agent statistics
 */
router.get('/inbox/agents', async (req, res) => {
  try {
    const orgId = (req as any).orgId;
    const { startDate, endDate } = req.query;

    const start = startDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const end = endDate || new Date().toISOString();

    const agentsResult = await db.query(
      `SELECT 
        'All Agents' AS agent_name,
        COUNT(DISTINCT CASE WHEN m.direction = 'outbound' AND m.meta_message_id NOT LIKE 'auto-%' THEN m.id END) AS messages_sent,
        COUNT(DISTINCT CASE WHEN m.direction = 'outbound' AND m.meta_message_id NOT LIKE 'auto-%' THEN m.conversation_id END) AS conversations_handled,
        AVG(
          CASE 
            WHEN m.direction = 'outbound' AND m.meta_message_id NOT LIKE 'auto-%'
            THEN (
              SELECT EXTRACT(EPOCH FROM (m.created_at - m_prev.created_at))
              FROM messages m_prev
              WHERE m_prev.conversation_id = m.conversation_id
                AND m_prev.direction = 'inbound'
                AND m_prev.created_at < m.created_at
              ORDER BY m_prev.created_at DESC
              LIMIT 1
            )
            ELSE NULL
          END
        ) AS avg_response_seconds
      FROM messages m
      WHERE m.org_id = $1
        AND m.created_at BETWEEN $2 AND $3`,
      [orgId, start, end]
    );

    const agents = agentsResult.rows.map((row: Record<string, any>) => ({
      name: row.agent_name,
      messagesSent: parseInt(row.messages_sent) || 0,
      conversationsHandled: parseInt(row.conversations_handled) || 0,
      avgResponseTime: Math.round(parseFloat(row.avg_response_seconds) || 0)
    }));

    res.json({
      agents,
      dateRange: { start, end }
    });

  } catch (error: any) {
    console.error('[Reports] Error fetching agent stats:', error);
    res.status(500).json({ error: 'Failed to generate agent statistics' });
  }
});

/**
 * POST /reports/campaigns/export
 * Export campaign reports to CSV
 * Body: { status?, startDate?, endDate?, templateId? }
 */
router.post('/campaigns/export', async (req, res) => {
  try {
    const orgId = (req as any).orgId;
    const { status, startDate, endDate, templateId } = req.body;

    // Build WHERE clause
    const conditions = ['c.org_id = $1'];
    const params: any[] = [orgId];
    let paramIndex = 2;

    if (status) {
      conditions.push(`c.status = $${paramIndex}`);
      params.push(status);
      paramIndex++;
    }

    if (startDate) {
      conditions.push(`c.created_at >= $${paramIndex}`);
      params.push(startDate);
      paramIndex++;
    }

    if (endDate) {
      conditions.push(`c.created_at <= $${paramIndex}`);
      params.push(endDate);
      paramIndex++;
    }

    if (templateId) {
      conditions.push(`c.template_id = $${paramIndex}`);
      params.push(templateId);
      paramIndex++;
    }

    const whereClause = conditions.join(' AND ');

    // Fetch all campaigns for export
    const campaignsResult = await db.query(
      `SELECT 
        c.id,
        c.name,
        c.status,
        c.scheduled_at,
        c.created_at,
        t.name AS template_name,
        COUNT(cr.id) AS total_recipients,
        COUNT(CASE WHEN cr.status = 'sent' THEN 1 END) AS sent_count,
        COUNT(CASE WHEN m.status IN ('delivered', 'read') THEN 1 END) AS delivered_count,
        COUNT(CASE WHEN m.status = 'read' THEN 1 END) AS read_count,
        COUNT(CASE WHEN cr.status = 'failed' THEN 1 END) AS failed_count,
        CASE 
          WHEN COUNT(cr.id) > 0 
          THEN ROUND((COUNT(CASE WHEN cr.status = 'sent' THEN 1 END)::numeric / COUNT(cr.id)) * 100, 1)
          ELSE 0
        END AS delivery_rate,
        CASE 
          WHEN COUNT(CASE WHEN m.status IN ('delivered', 'read') THEN 1 END) > 0
          THEN ROUND((COUNT(CASE WHEN m.status = 'read' THEN 1 END)::numeric / COUNT(CASE WHEN m.status IN ('delivered', 'read') THEN 1 END)) * 100, 1)
          ELSE 0
        END AS read_rate
      FROM campaigns c
      LEFT JOIN templates t ON c.template_id = t.id
      LEFT JOIN campaign_recipients cr ON c.id = cr.campaign_id
      LEFT JOIN messages m ON m.contact_id = cr.contact_id 
        AND m.retention_policy = 'campaign'
        AND m.created_at >= c.scheduled_at
      WHERE ${whereClause}
      GROUP BY c.id, c.name, c.status, c.scheduled_at, c.created_at, t.name
      ORDER BY c.created_at DESC`,
      params
    );

    // Define CSV columns
    const columns: CSVColumn[] = [
      { header: 'Campaign Name', accessor: 'name' },
      { header: 'Template', accessor: 'template_name' },
      { header: 'Status', accessor: 'status' },
      { header: 'Scheduled At', accessor: 'scheduled_at', formatter: formatDate },
      { header: 'Created At', accessor: 'created_at', formatter: formatDate },
      { header: 'Total Recipients', accessor: 'total_recipients' },
      { header: 'Sent', accessor: 'sent_count' },
      { header: 'Delivered', accessor: 'delivered_count' },
      { header: 'Read', accessor: 'read_count' },
      { header: 'Failed', accessor: 'failed_count' },
      { header: 'Delivery Rate', accessor: 'delivery_rate', formatter: formatPercentage },
      { header: 'Read Rate', accessor: 'read_rate', formatter: formatPercentage }
    ];

    // Generate CSV stream
    const csvStream = generateCSV(columns, campaignsResult.rows);

    // Set headers
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename=campaigns-export-${Date.now()}.csv`);

    // Pipe CSV to response
    csvStream.pipe(res);

  } catch (error: any) {
    console.error('[Reports] Error exporting campaigns:', error);
    res.status(500).json({ error: 'Failed to export campaigns' });
  }
});

/**
 * POST /reports/inbox/export
 * Export inbox conversations to CSV
 * Body: { startDate?, endDate? }
 */
router.post('/inbox/export', async (req, res) => {
  try {
    const orgId = (req as any).orgId;
    const { startDate, endDate } = req.body;

    const start = startDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const end = endDate || new Date().toISOString();

    // Fetch all conversations for export
    const conversationsResult = await db.query(
      `SELECT 
        c.id,
        co.name AS contact_name,
        co.phone_e164 AS contact_phone,
        c.last_message_at,
        c.created_at,
        COALESCE(SUM(cp.unread_count), 0) AS unread_count,
        COUNT(DISTINCT CASE WHEN m.direction = 'inbound' THEN m.id END) AS messages_received,
        COUNT(DISTINCT CASE WHEN m.direction = 'outbound' THEN m.id END) AS messages_sent
      FROM conversations c
      LEFT JOIN contacts co ON c.contact_id = co.id
      LEFT JOIN conversation_participants cp ON c.id = cp.conversation_id
      LEFT JOIN messages m ON c.id = m.conversation_id AND m.created_at BETWEEN $2 AND $3
      WHERE c.org_id = $1
      GROUP BY c.id, co.name, co.phone_e164, c.last_message_at, c.created_at
      ORDER BY c.last_message_at DESC`,
      [orgId, start, end]
    );

    // Define CSV columns
    const columns: CSVColumn[] = [
      { header: 'Contact Name', accessor: 'contact_name' },
      { header: 'Phone Number', accessor: 'contact_phone' },
      { header: 'Last Message At', accessor: 'last_message_at', formatter: formatDate },
      { header: 'First Contact', accessor: 'created_at', formatter: formatDate },
      { header: 'Messages Sent', accessor: 'messages_sent' },
      { header: 'Messages Received', accessor: 'messages_received' },
      { header: 'Unread Count', accessor: 'unread_count' }
    ];

    // Generate CSV stream
    const csvStream = generateCSV(columns, conversationsResult.rows);

    // Set headers
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename=inbox-export-${Date.now()}.csv`);

    // Pipe CSV to response
    csvStream.pipe(res);

  } catch (error: any) {
    console.error('[Reports] Error exporting inbox:', error);
    res.status(500).json({ error: 'Failed to export inbox conversations' });
  }
});

export default router;
