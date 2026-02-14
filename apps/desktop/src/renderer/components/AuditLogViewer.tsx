import React, { useState, useEffect } from 'react';
import './AuditLogViewer.css';

// We'll need to get API_URL from environment or config
const API_URL = 'http://localhost:3000';

interface AuditLog {
  id: string;
  timestamp: string;
  action: string;
  resourceType?: string;
  resourceId?: string;
  metadata?: Record<string, any>;
  ipAddress?: string;
  userAgent?: string;
  user: {
    id: string;
    email: string;
  } | null;
}

interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export const AuditLogViewer: React.FC = () => {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [pagination, setPagination] = useState<Pagination>({
    page: 1,
    limit: 100,
    total: 0,
    totalPages: 0,
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [actionFilter, setActionFilter] = useState('');
  const [resourceTypeFilter, setResourceTypeFilter] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  const fetchLogs = async (page = 1) => {
    setLoading(true);
    setError(null);

    try {
      const params: Record<string, string> = {
        page: page.toString(),
        limit: pagination.limit.toString(),
      };

      if (startDate) params.startDate = new Date(startDate).toISOString();
      if (endDate) params.endDate = new Date(endDate).toISOString();
      if (actionFilter) params.action = actionFilter;
      if (resourceTypeFilter) params.resourceType = resourceTypeFilter;

      const queryString = new URLSearchParams(params).toString();
      const response = await fetch(`${API_URL}/audit-logs?${queryString}`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('accessToken')}`,
        },
      });

      if (!response.ok) throw new Error('Failed to load audit logs');
      
      const data = await response.json();
      setLogs(data.logs);
      setPagination(data.pagination);
    } catch (err: any) {
      setError(err.message || 'Failed to load audit logs');
    } finally {
      setLoading(false);
    }
  };

  const exportLogs = async () => {
    try {
      const body: Record<string, any> = {};
      if (startDate) body.startDate = new Date(startDate).toISOString();
      if (endDate) body.endDate = new Date(endDate).toISOString();
      if (actionFilter) body.action = actionFilter;
      if (resourceTypeFilter) body.resourceType = resourceTypeFilter;

      const response = await fetch(`${API_URL}/audit-logs/export`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('accessToken')}`,
        },
        body: JSON.stringify(body),
      });

      if (!response.ok) throw new Error('Failed to export audit logs');

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `audit-logs-${Date.now()}.csv`);
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (err: any) {
      setError('Failed to export audit logs');
    }
  };

  useEffect(() => {
    fetchLogs(1);
  }, [startDate, endDate, actionFilter, resourceTypeFilter]);

  const filteredLogs = searchQuery
    ? logs.filter(
        (log) =>
          log.resourceId?.includes(searchQuery) ||
          log.action.toLowerCase().includes(searchQuery.toLowerCase()) ||
          log.user?.email.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : logs;

  const formatTimestamp = (timestamp: string) => {
    return new Date(timestamp).toLocaleString();
  };

  const formatMetadata = (metadata?: Record<string, any>) => {
    if (!metadata) return '-';
    return JSON.stringify(metadata, null, 2);
  };

  return (
    <div className="audit-log-viewer">
      <div className="audit-header">
        <h2>Audit Logs</h2>
        <p className="audit-subtitle">
          Comprehensive audit trail for compliance and security monitoring
        </p>
      </div>

      <div className="audit-filters">
        <div className="filter-group">
          <label>Start Date</label>
          <input
            type="datetime-local"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            aria-label="Start date filter"
          />
        </div>

        <div className="filter-group">
          <label>End Date</label>
          <input
            type="datetime-local"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            aria-label="End date filter"
          />
        </div>

        <div className="filter-group">
          <label>Action</label>
          <select
            value={actionFilter}
            onChange={(e) => setActionFilter(e.target.value)}
            aria-label="Action filter"
          >
            <option value="">All Actions</option>
            <option value="auth.login">Login</option>
            <option value="auth.logout">Logout</option>
            <option value="auth.failed">Failed Login</option>
            <option value="campaign.created">Campaign Created</option>
            <option value="campaign.started">Campaign Started</option>
            <option value="contact.imported">Contact Imported</option>
            <option value="message.sent">Message Sent</option>
            <option value="automation.triggered">Automation Triggered</option>
            <option value="export.generated">Export Generated</option>
          </select>
        </div>

        <div className="filter-group">
          <label>Resource Type</label>
          <select
            value={resourceTypeFilter}
            onChange={(e) => setResourceTypeFilter(e.target.value)}
            aria-label="Resource type filter"
          >
            <option value="">All Resources</option>
            <option value="campaign">Campaign</option>
            <option value="contact">Contact</option>
            <option value="message">Message</option>
            <option value="template">Template</option>
            <option value="automation">Automation</option>
          </select>
        </div>

        <div className="filter-group search-group">
          <label>Search</label>
          <input
            type="text"
            placeholder="Search by resource ID, action, or user..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            aria-label="Search audit logs"
          />
        </div>

        <div className="filter-actions">
          <button onClick={exportLogs} className="btn-export">
            Export CSV
          </button>
        </div>
      </div>

      {error && <div className="error-message">{error}</div>}

      {loading ? (
        <div className="loading">Loading audit logs...</div>
      ) : (
        <>
          <div className="audit-table-container">
            <table className="audit-table">
              <thead>
                <tr>
                  <th>Timestamp</th>
                  <th>User</th>
                  <th>Action</th>
                  <th>Resource</th>
                  <th>IP Address</th>
                  <th>Details</th>
                </tr>
              </thead>
              <tbody>
                {filteredLogs.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="no-data">
                      No audit logs found
                    </td>
                  </tr>
                ) : (
                  filteredLogs.map((log) => (
                    <tr key={log.id}>
                      <td>{formatTimestamp(log.timestamp)}</td>
                      <td>{log.user?.email || 'System'}</td>
                      <td>
                        <span className="action-badge">{log.action}</span>
                      </td>
                      <td>
                        {log.resourceType && (
                          <div>
                            <div className="resource-type">{log.resourceType}</div>
                            {log.resourceId && (
                              <div className="resource-id">{log.resourceId}</div>
                            )}
                          </div>
                        )}
                        {!log.resourceType && '-'}
                      </td>
                      <td>{log.ipAddress || '-'}</td>
                      <td>
                        {log.metadata && (
                          <details>
                            <summary>View Metadata</summary>
                            <pre>{formatMetadata(log.metadata)}</pre>
                          </details>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div className="pagination">
            <div className="pagination-info">
              Showing {(pagination.page - 1) * pagination.limit + 1} to{' '}
              {Math.min(pagination.page * pagination.limit, pagination.total)} of{' '}
              {pagination.total} logs
            </div>
            <div className="pagination-controls">
              <button
                onClick={() => fetchLogs(pagination.page - 1)}
                disabled={pagination.page === 1}
              >
                Previous
              </button>
              <span>
                Page {pagination.page} of {pagination.totalPages}
              </span>
              <button
                onClick={() => fetchLogs(pagination.page + 1)}
                disabled={pagination.page === pagination.totalPages}
              >
                Next
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
};
