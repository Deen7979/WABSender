import React, { useState, useEffect } from 'react';
import './CampaignReports.css';

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';

interface Campaign {
  id: string;
  name: string;
  status: string;
  created_at: string;
  scheduled_at?: string;
}

interface CampaignReport {
  campaign: Campaign;
  stats: {
    totalRecipients: number;
    sentCount: number;
    deliveredCount: number;
    readCount: number;
    failedCount: number;
    deliveryRate: number;
    readRate: number;
    avgDeliveryTime: number;
  };
  timeline: Array<{
    time: string;
    total: number;
    sent: number;
    failed: number;
  }>;
}

interface CampaignListResponse {
  campaigns: Campaign[];
}

export const CampaignReports: React.FC<{ apiClient?: any }> = () => {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [selectedCampaignId, setSelectedCampaignId] = useState<string | null>(null);
  const [report, setReport] = useState<CampaignReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [startDate, setStartDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return d.toISOString().split('T')[0];
  });
  const [endDate, setEndDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [exporting, setExporting] = useState(false);

  // Load campaigns on mount
  useEffect(() => {
    loadCampaigns();
  }, []);

  // Load report when campaign is selected
  useEffect(() => {
    if (selectedCampaignId) {
      loadCampaignReport();
    }
  }, [selectedCampaignId, startDate, endDate]);

  const loadCampaigns = async () => {
    try {
      setLoading(true);
      const response = await fetch(`${API_URL}/reports/campaigns`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('accessToken')}`,
        },
      });
      if (!response.ok) throw new Error('Failed to load campaigns');
      const data: CampaignListResponse = await response.json();
      setCampaigns(data.campaigns || []);
      if (data.campaigns && data.campaigns.length > 0) {
        setSelectedCampaignId(data.campaigns[0].id);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load campaigns');
    } finally {
      setLoading(false);
    }
  };

  const loadCampaignReport = async () => {
    if (!selectedCampaignId) return;
    try {
      setLoading(true);
      setError(null);
      const params = new URLSearchParams({
        startDate,
        endDate,
      });
      const response = await fetch(`${API_URL}/reports/campaigns/${selectedCampaignId}?${params}`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('accessToken')}`,
        },
      });
      if (!response.ok) throw new Error('Failed to load campaign report');
      const data: CampaignReport = await response.json();
      setReport(data);
    } catch (err: any) {
      setError(err.message || 'Failed to load campaign report');
    } finally {
      setLoading(false);
    }
  };

  const exportReport = async () => {
    if (!selectedCampaignId) return;
    try {
      setExporting(true);
      const response = await fetch(`${API_URL}/reports/campaigns/${selectedCampaignId}/export`, {
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
      link.setAttribute('download', `campaign-report-${selectedCampaignId}-${Date.now()}.csv`);
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
    if (seconds < 60) return `${Math.round(seconds)}s`;
    if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
    return `${Math.round(seconds / 3600)}h`;
  };

  const formatPercentage = (value: number) => {
    return isNaN(value) ? '0%' : `${value.toFixed(1)}%`;
  };

  return (
    <div className="campaign-reports">
      <div className="reports-header">
        <h2>Campaign Reports</h2>
        <p className="reports-subtitle">Track delivery metrics and performance analytics</p>
      </div>

      {error && <div className="error-message">{error}</div>}

      <div className="reports-container">
        {/* Sidebar: Campaign Selection */}
        <div className="reports-sidebar">
          <div className="campaign-list-section">
            <h3>Campaigns</h3>
            {loading && campaigns.length === 0 ? (
              <div className="loading">Loading campaigns...</div>
            ) : campaigns.length === 0 ? (
              <div className="no-campaigns">No campaigns found</div>
            ) : (
              <div className="campaign-list">
                {campaigns.map((campaign) => (
                  <div
                    key={campaign.id}
                    className={`campaign-item ${selectedCampaignId === campaign.id ? 'active' : ''}`}
                    onClick={() => setSelectedCampaignId(campaign.id)}
                  >
                    <div className="campaign-name">{campaign.name}</div>
                    <div className="campaign-status">{campaign.status}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Main: Report View */}
        <div className="reports-main">
          {selectedCampaignId && report ? (
            <>
              {/* Filters */}
              <div className="filters-section">
                <div className="filter-group">
                  <label htmlFor="start-date">Start Date</label>
                  <input
                    id="start-date"
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    aria-label="Filter by start date"
                  />
                </div>
                <div className="filter-group">
                  <label htmlFor="end-date">End Date</label>
                  <input
                    id="end-date"
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

              {/* Metrics Cards */}
              <div className="metrics-grid">
                <div className="metric-card">
                  <div className="metric-label">Total Recipients</div>
                  <div className="metric-value">{report.stats.totalRecipients.toLocaleString()}</div>
                </div>
                <div className="metric-card">
                  <div className="metric-label">Sent</div>
                  <div className="metric-value">{report.stats.sentCount.toLocaleString()}</div>
                </div>
                <div className="metric-card">
                  <div className="metric-label">Delivered</div>
                  <div className="metric-value">{report.stats.deliveredCount.toLocaleString()}</div>
                </div>
                <div className="metric-card">
                  <div className="metric-label">Read</div>
                  <div className="metric-value">{report.stats.readCount.toLocaleString()}</div>
                </div>
                <div className="metric-card">
                  <div className="metric-label">Failed</div>
                  <div className="metric-value error">{report.stats.failedCount.toLocaleString()}</div>
                </div>
              </div>

              {/* Performance Metrics */}
              <div className="performance-grid">
                <div className="performance-card">
                  <div className="performance-label">Delivery Rate</div>
                  <div className="performance-value">{formatPercentage(report.stats.deliveryRate)}</div>
                  <div className="performance-bar">
                    <progress
                      className="performance-progress"
                      value={Math.min(report.stats.deliveryRate, 100)}
                      max={100}
                    />
                  </div>
                </div>
                <div className="performance-card">
                  <div className="performance-label">Read Rate</div>
                  <div className="performance-value">{formatPercentage(report.stats.readRate)}</div>
                  <div className="performance-bar">
                    <progress
                      className="performance-progress"
                      value={Math.min(report.stats.readRate, 100)}
                      max={100}
                    />
                  </div>
                </div>
                <div className="performance-card">
                  <div className="performance-label">Avg Delivery Time</div>
                  <div className="performance-value">{formatDuration(report.stats.avgDeliveryTime)}</div>
                  <div className="performance-bar">
                    <div className="performance-fill performance-fill-full"></div>
                  </div>
                </div>
              </div>

              {/* Timeline Table */}
              {report.timeline && report.timeline.length > 0 && (
                <div className="timeline-section">
                  <h3>Delivery Timeline</h3>
                  <div className="timeline-table-container">
                    <table className="timeline-table">
                      <thead>
                        <tr>
                          <th>Time</th>
                          <th>Total</th>
                          <th>Sent</th>
                          <th>Failed</th>
                          <th>Success Rate</th>
                        </tr>
                      </thead>
                      <tbody>
                        {report.timeline.map((entry, index) => {
                          const successRate = entry.total > 0 ? ((entry.sent / entry.total) * 100) : 0;
                          return (
                            <tr key={index}>
                              <td>{new Date(entry.time).toLocaleString()}</td>
                              <td>{entry.total}</td>
                              <td>{entry.sent}</td>
                              <td className={entry.failed > 0 ? 'error' : ''}>{entry.failed}</td>
                              <td>{formatPercentage(successRate)}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </>
          ) : loading ? (
            <div className="loading-large">Loading report...</div>
          ) : (
            <div className="no-selection">Select a campaign to view report</div>
          )}
        </div>
      </div>
    </div>
  );
};
