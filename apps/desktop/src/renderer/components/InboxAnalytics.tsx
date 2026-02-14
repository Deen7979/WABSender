import React, { useState, useEffect } from 'react';
import './InboxAnalytics.css';

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';

interface InboxStats {
  totalConversations: number;
  activeConversations: number;
  messagesSent: number;
  messagesReceived: number;
  averageResponseTime: number;
}

interface AgentStats {
  userId: string;
  userEmail: string;
  messagesSent: number;
  conversationsHandled: number;
  averageResponseTime: number;
}

interface InboxReport {
  stats: InboxStats;
  agentStats: AgentStats[];
  conversationsByStatus: Array<{
    status: string;
    count: number;
  }>;
  messageVolume: Array<{
    date: string;
    sent: number;
    received: number;
  }>;
}

export const InboxAnalytics: React.FC = () => {
  const [report, setReport] = useState<InboxReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [startDate, setStartDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return d.toISOString().split('T')[0];
  });
  const [endDate, setEndDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [exporting, setExporting] = useState(false);

  // Load report on mount and when dates change
  useEffect(() => {
    loadInboxReport();
  }, [startDate, endDate]);

  const loadInboxReport = async () => {
    try {
      setLoading(true);
      setError(null);
      const params = new URLSearchParams({
        startDate,
        endDate,
      });
      const response = await fetch(`${API_URL}/reports/inbox?${params}`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('accessToken')}`,
        },
      });
      if (!response.ok) throw new Error('Failed to load inbox analytics');
      const data: InboxReport = await response.json();
      setReport(data);
    } catch (err: any) {
      setError(err.message || 'Failed to load inbox analytics');
    } finally {
      setLoading(false);
    }
  };

  const exportReport = async () => {
    try {
      setExporting(true);
      const response = await fetch(`${API_URL}/reports/inbox/export`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('accessToken')}`,
        },
        body: JSON.stringify({ startDate, endDate }),
      });
      if (!response.ok) throw new Error('Failed to export report');
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `inbox-analytics-${Date.now()}.csv`);
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (err: any) {
      setError('Failed to export report');
    } finally {
      setExporting(false);
    }
  };

  const formatDuration = (seconds: number) => {
    if (isNaN(seconds) || seconds < 0) return '-';
    if (seconds < 60) return `${Math.round(seconds)}s`;
    if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
    return `${Math.round(seconds / 3600)}h`;
  };

  const totalStatusCount = report?.conversationsByStatus
    ? report.conversationsByStatus.reduce((sum, item) => sum + item.count, 0)
    : 0;

  if (loading && !report) {
    return (
      <div className="inbox-analytics">
        <div className="analytics-header">
          <h2>Inbox Analytics</h2>
        </div>
        <div className="loading-large">Loading analytics...</div>
      </div>
    );
  }

  return (
    <div className="inbox-analytics">
      <div className="analytics-header">
        <h2>Inbox Analytics</h2>
        <p className="analytics-subtitle">Track conversations, messages, and team performance</p>
      </div>

      {error && <div className="error-message">{error}</div>}

      {report && (
        <>
          {/* Filters */}
          <div className="filters-section">
            <div className="filter-group">
              <label htmlFor="start-date-inbox">Start Date</label>
              <input
                id="start-date-inbox"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                aria-label="Filter by start date"
              />
            </div>
            <div className="filter-group">
              <label htmlFor="end-date-inbox">End Date</label>
              <input
                id="end-date-inbox"
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                aria-label="Filter by end date"
              />
            </div>
            <button
              className="btn-export"
              onClick={exportReport}
              disabled={exporting || loading}
            >
              {exporting ? 'Exporting...' : 'Export CSV'}
            </button>
          </div>

          {/* Key Metrics */}
          <div className="metrics-grid">
            <div className="metric-card">
              <div className="metric-label">Total Conversations</div>
              <div className="metric-value">{report.stats.totalConversations.toLocaleString()}</div>
            </div>
            <div className="metric-card">
              <div className="metric-label">Active Conversations</div>
              <div className="metric-value">{report.stats.activeConversations.toLocaleString()}</div>
            </div>
            <div className="metric-card">
              <div className="metric-label">Messages Sent</div>
              <div className="metric-value">{report.stats.messagesSent.toLocaleString()}</div>
            </div>
            <div className="metric-card">
              <div className="metric-label">Messages Received</div>
              <div className="metric-value">{report.stats.messagesReceived.toLocaleString()}</div>
            </div>
            <div className="metric-card">
              <div className="metric-label">Avg Response Time</div>
              <div className="metric-value">{formatDuration(report.stats.averageResponseTime)}</div>
            </div>
          </div>

          {/* Conversation Status Breakdown */}
          {report.conversationsByStatus && report.conversationsByStatus.length > 0 && (
            <div className="status-grid">
              <div className="status-card">
                <h3>Conversation Status</h3>
                <div className="status-list">
                  {report.conversationsByStatus.map((item) => (
                    <div key={item.status} className="status-item">
                      <div className="status-name">{item.status}</div>
                      <div className="status-bar">
                        <progress
                          className={`status-progress status-progress-${item.status}`}
                          value={item.count}
                          max={Math.max(totalStatusCount, 1)}
                        />
                      </div>
                      <div className="status-count">{item.count}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Agent Performance */}
          {report.agentStats && report.agentStats.length > 0 && (
            <div className="agent-section">
              <h3>Agent Performance</h3>
              <div className="agent-table-container">
                <table className="agent-table">
                  <thead>
                    <tr>
                      <th>Agent</th>
                      <th>Messages Sent</th>
                      <th>Conversations</th>
                      <th>Avg Response Time</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.agentStats.map((agent) => (
                      <tr key={agent.userId}>
                        <td>{agent.userEmail}</td>
                        <td>{agent.messagesSent.toLocaleString()}</td>
                        <td>{agent.conversationsHandled.toLocaleString()}</td>
                        <td>{formatDuration(agent.averageResponseTime)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Message Volume */}
          {report.messageVolume && report.messageVolume.length > 0 && (
            <div className="volume-section">
              <h3>Message Volume Timeline</h3>
              <div className="volume-table-container">
                <table className="volume-table">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Sent</th>
                      <th>Received</th>
                      <th>Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.messageVolume.map((entry) => (
                      <tr key={entry.date}>
                        <td>{new Date(entry.date).toLocaleDateString()}</td>
                        <td>{entry.sent.toLocaleString()}</td>
                        <td>{entry.received.toLocaleString()}</td>
                        <td className="total">{(entry.sent + entry.received).toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};
