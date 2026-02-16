import React, { useState, useEffect } from 'react';
import './SystemMonitoring.css';

interface RealtimeMetrics {
  activeConversations: number;
  pendingMessages: number;
  activeCampaigns: number;
  webhookHealth: {
    total: number;
    verified: number;
    failing: number;
  };
  throughput: {
    messagesLastHour: number;
    deliveredLastHour: number;
    failedLastHour: number;
  };
  timestamp: string;
}

interface SystemStatus {
  queue: {
    totalJobs: number;
    pendingJobs: number;
    processingJobs: number;
    completedJobs: number;
    failedJobs: number;
    lastJobAt: string | null;
  };
  webhooks: {
    total: number;
    verified: number;
    healthy: number;
    failing: number;
    lastSuccessAt: string | null;
    lastErrorAt: string | null;
  };
  database: {
    connected: boolean;
    dbTime: string;
    dbVersion: string;
  };
  system: {
    uptime: number;
    memory: any;
    nodeVersion: string;
    platform: string;
  };
  timestamp: string;
}

interface SystemMonitoringProps {
  apiClient: any;
}

export const SystemMonitoring: React.FC<SystemMonitoringProps> = ({ apiClient }) => {
  const [realtime, setRealtime] = useState<RealtimeMetrics | null>(null);
  const [status, setStatus] = useState<SystemStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);
      const [realtimeRes, statusRes] = await Promise.all([
        apiClient.get('/reports/realtime'),
        apiClient.get('/reports/status')
      ]);
      setRealtime(realtimeRes);
      setStatus(statusRes);
    } catch (err: any) {
      setError(err.message || 'Failed to load monitoring data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    // Refresh every 30 seconds
    const interval = setInterval(loadData, 30000);
    return () => clearInterval(interval);
  }, []);

  const formatUptime = (seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    return `${hours}h ${minutes}m`;
  };

  const formatMemory = (bytes: number) => {
    return (bytes / 1024 / 1024).toFixed(1) + ' MB';
  };

  return (
    <div className="system-monitoring">
      <div className="monitoring-header">
        <h3>System Monitoring</h3>
        <button onClick={loadData} disabled={loading} className="refresh-btn">
          {loading ? 'Loading...' : 'Refresh'}
        </button>
      </div>

      {error && (
        <div className="error-message">
          {error}
        </div>
      )}

      <div className="monitoring-grid">
        {/* Realtime Metrics */}
        <div className="monitoring-card">
          <h4>Realtime Metrics</h4>
          {realtime ? (
            <div className="metrics-grid">
              <div className="metric">
                <span className="metric-label">Active Conversations</span>
                <span className="metric-value">{realtime.activeConversations}</span>
              </div>
              <div className="metric">
                <span className="metric-label">Pending Messages</span>
                <span className="metric-value">{realtime.pendingMessages}</span>
              </div>
              <div className="metric">
                <span className="metric-label">Active Campaigns</span>
                <span className="metric-value">{realtime.activeCampaigns}</span>
              </div>
              <div className="metric">
                <span className="metric-label">Messages/Hour</span>
                <span className="metric-value">{realtime.throughput.messagesLastHour}</span>
              </div>
              <div className="metric">
                <span className="metric-label">Delivery Rate</span>
                <span className="metric-value">
                  {realtime.throughput.messagesLastHour > 0
                    ? ((realtime.throughput.deliveredLastHour / realtime.throughput.messagesLastHour) * 100).toFixed(1) + '%'
                    : 'N/A'
                  }
                </span>
              </div>
            </div>
          ) : (
            <div className="loading">Loading realtime metrics...</div>
          )}
        </div>

        {/* Queue Status */}
        <div className="monitoring-card">
          <h4>Queue Status</h4>
          {status ? (
            <div className="metrics-grid">
              <div className="metric">
                <span className="metric-label">Total Jobs</span>
                <span className="metric-value">{status.queue.totalJobs}</span>
              </div>
              <div className="metric">
                <span className="metric-label">Pending</span>
                <span className="metric-value pending">{status.queue.pendingJobs}</span>
              </div>
              <div className="metric">
                <span className="metric-label">Processing</span>
                <span className="metric-value processing">{status.queue.processingJobs}</span>
              </div>
              <div className="metric">
                <span className="metric-label">Completed</span>
                <span className="metric-value success">{status.queue.completedJobs}</span>
              </div>
              <div className="metric">
                <span className="metric-label">Failed</span>
                <span className="metric-value error">{status.queue.failedJobs}</span>
              </div>
            </div>
          ) : (
            <div className="loading">Loading queue status...</div>
          )}
        </div>

        {/* Webhook Health */}
        <div className="monitoring-card">
          <h4>Webhook Health</h4>
          {status ? (
            <div className="metrics-grid">
              <div className="metric">
                <span className="metric-label">Total Webhooks</span>
                <span className="metric-value">{status.webhooks.total}</span>
              </div>
              <div className="metric">
                <span className="metric-label">Verified</span>
                <span className="metric-value success">{status.webhooks.verified}</span>
              </div>
              <div className="metric">
                <span className="metric-label">Healthy (1h)</span>
                <span className="metric-value success">{status.webhooks.healthy}</span>
              </div>
              <div className="metric">
                <span className="metric-label">Failing (1h)</span>
                <span className="metric-value error">{status.webhooks.failing}</span>
              </div>
            </div>
          ) : (
            <div className="loading">Loading webhook health...</div>
          )}
        </div>

        {/* System Status */}
        <div className="monitoring-card">
          <h4>System Status</h4>
          {status ? (
            <div className="metrics-grid">
              <div className="metric">
                <span className="metric-label">Uptime</span>
                <span className="metric-value">{formatUptime(status.system.uptime)}</span>
              </div>
              <div className="metric">
                <span className="metric-label">Memory Usage</span>
                <span className="metric-value">{formatMemory(status.system.memory.heapUsed)}</span>
              </div>
              <div className="metric">
                <span className="metric-label">Node Version</span>
                <span className="metric-value">{status.system.nodeVersion}</span>
              </div>
              <div className="metric">
                <span className="metric-label">Database</span>
                <span className={`metric-value ${status.database.connected ? 'success' : 'error'}`}>
                  {status.database.connected ? 'Connected' : 'Disconnected'}
                </span>
              </div>
            </div>
          ) : (
            <div className="loading">Loading system status...</div>
          )}
        </div>
      </div>

      <div className="monitoring-footer">
        Last updated: {realtime?.timestamp ? new Date(realtime.timestamp).toLocaleTimeString() : 'Never'}
      </div>
    </div>
  );
};