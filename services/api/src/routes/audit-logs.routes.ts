import { Router } from 'express';
import { db } from '../db/index.js';
import { generateCSV, formatDate, CSVColumn } from '../utils/csvExporter.js';

const router = Router();

/**
 * GET /audit-logs
 * Query audit logs with filtering, pagination, and sorting
 * Query params: startDate, endDate, userId, action, resourceType, page, limit
 */
router.get('/', async (req, res) => {
  try {
    const orgId = (req as any).orgId;
    const {
      startDate,
      endDate,
      userId,
      action,
      resourceType,
      page = '1',
      limit = '100',
    } = req.query;

    const pageNum = parseInt(page as string);
    const limitNum = Math.min(parseInt(limit as string), 1000); // Cap at 1000
    const offset = (pageNum - 1) * limitNum;

    // Build WHERE clause
    const conditions = ['org_id = $1'];
    const params: any[] = [orgId];
    let paramIndex = 2;

    if (startDate) {
      conditions.push(`timestamp >= $${paramIndex}`);
      params.push(startDate);
      paramIndex++;
    }

    if (endDate) {
      conditions.push(`timestamp <= $${paramIndex}`);
      params.push(endDate);
      paramIndex++;
    }

    if (userId) {
      conditions.push(`user_id = $${paramIndex}`);
      params.push(userId);
      paramIndex++;
    }

    if (action) {
      conditions.push(`action = $${paramIndex}`);
      params.push(action);
      paramIndex++;
    }

    if (resourceType) {
      conditions.push(`resource_type = $${paramIndex}`);
      params.push(resourceType);
      paramIndex++;
    }

    const whereClause = conditions.join(' AND ');

    // Get total count
    const countResult = await db.query(
      `SELECT COUNT(*) AS total
       FROM audit_logs
       WHERE ${whereClause}`,
      params
    );

    const total = parseInt(countResult.rows[0].total);

    // Get audit logs
    const logsResult = await db.query(
      `SELECT 
        al.id,
        al.timestamp,
        al.action,
        al.resource_type,
        al.resource_id,
        al.metadata,
        al.ip_address,
        al.user_agent,
        u.email AS user_email,
        u.id AS user_id
      FROM audit_logs al
      LEFT JOIN users u ON al.user_id = u.id
      WHERE ${whereClause}
      ORDER BY al.timestamp DESC
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
      [...params, limitNum, offset]
    );

    const logs = logsResult.rows.map((row: any) => ({
      id: row.id,
      timestamp: row.timestamp,
      action: row.action,
      resourceType: row.resource_type,
      resourceId: row.resource_id,
      metadata: row.metadata,
      ipAddress: row.ip_address,
      userAgent: row.user_agent,
      user: row.user_email ? {
        id: row.user_id,
        email: row.user_email,
      } : null,
    }));

    res.json({
      logs,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum),
      },
    });
  } catch (error: any) {
    console.error('[AuditLogs] Error fetching audit logs:', error);
    res.status(500).json({ error: 'Failed to fetch audit logs' });
  }
});

/**
 * POST /audit-logs/export
 * Export audit logs to CSV
 * Body: { startDate?, endDate?, userId?, action?, resourceType? }
 */
router.post('/export', async (req, res) => {
  try {
    const orgId = (req as any).orgId;
    const { startDate, endDate, userId, action, resourceType } = req.body;

    // Build WHERE clause
    const conditions = ['al.org_id = $1'];
    const params: any[] = [orgId];
    let paramIndex = 2;

    if (startDate) {
      conditions.push(`al.timestamp >= $${paramIndex}`);
      params.push(startDate);
      paramIndex++;
    }

    if (endDate) {
      conditions.push(`al.timestamp <= $${paramIndex}`);
      params.push(endDate);
      paramIndex++;
    }

    if (userId) {
      conditions.push(`al.user_id = $${paramIndex}`);
      params.push(userId);
      paramIndex++;
    }

    if (action) {
      conditions.push(`al.action = $${paramIndex}`);
      params.push(action);
      paramIndex++;
    }

    if (resourceType) {
      conditions.push(`al.resource_type = $${paramIndex}`);
      params.push(resourceType);
      paramIndex++;
    }

    const whereClause = conditions.join(' AND ');

    // Fetch all matching audit logs
    const logsResult = await db.query(
      `SELECT 
        al.id,
        al.timestamp,
        al.action,
        al.resource_type,
        al.resource_id,
        al.metadata,
        al.ip_address,
        al.user_agent,
        u.email AS user_email
      FROM audit_logs al
      LEFT JOIN users u ON al.user_id = u.id
      WHERE ${whereClause}
      ORDER BY al.timestamp DESC`,
      params
    );

    // Define CSV columns
    const columns: CSVColumn[] = [
      { header: 'Timestamp', accessor: 'timestamp', formatter: formatDate },
      { header: 'User', accessor: 'user_email' },
      { header: 'Action', accessor: 'action' },
      { header: 'Resource Type', accessor: 'resource_type' },
      { header: 'Resource ID', accessor: 'resource_id' },
      { header: 'IP Address', accessor: 'ip_address' },
      { header: 'User Agent', accessor: 'user_agent' },
      {
        header: 'Metadata',
        accessor: (row: any) => row.metadata ? JSON.stringify(row.metadata) : '',
      },
    ];

    // Generate CSV stream
    const csvStream = generateCSV(columns, logsResult.rows);

    // Set headers
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename=audit-logs-export-${Date.now()}.csv`
    );

    // Pipe CSV to response
    csvStream.pipe(res);
  } catch (error: any) {
    console.error('[AuditLogs] Error exporting audit logs:', error);
    res.status(500).json({ error: 'Failed to export audit logs' });
  }
});

export default router;
