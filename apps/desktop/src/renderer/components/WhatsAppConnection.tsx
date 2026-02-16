/**
 * WhatsApp Connection Component
 * 
 * Allows users to connect their WhatsApp Business Account via Meta OAuth
 * Shows connection status, phone number, webhook health, and template sync status
 */

import React, { useState, useEffect } from "react";
import "./WhatsAppConnection.css";

interface ConnectionStatus {
	connected: boolean;
	phoneNumber?: string;
	wabaId?: string;
	tokenExpiresAt?: string;
	isExpiring?: boolean;
	createdAt?: string;
	orgId?: string;
}

interface WebhookHealth {
	webhookVerified: boolean;
	lastWebhookTime: string | null;
	syncStatus: "pending" | "syncing" | "success" | "error";
	lastSyncTime: string | null;
	syncCount: number;
	error: string | null;
	templates?: {
		total: number;
		approved: number;
	};
}

interface WhatsAppConnectionProps {
	apiClient?: any;
	orgId?: string | null;
}

export const WhatsAppConnection: React.FC<WhatsAppConnectionProps> = ({ apiClient, orgId }) => {
	const [status, setStatus] = useState<ConnectionStatus | null>(null);
	const [webhookHealth, setWebhookHealth] = useState<WebhookHealth | null>(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [disconnecting, setDisconnecting] = useState(false);
	const [syncing, setSyncing] = useState(false);

	useEffect(() => {
		checkConnectionStatus();
		if (orgId) {
			checkWebhookHealth();
		}
	}, [orgId]);

	const checkConnectionStatus = async () => {
		try {
			setLoading(true);
			if (!apiClient) {
				setError("API client not initialized");
				return;
			}

			const response = await apiClient.get("/auth/meta-oauth/status");
			setStatus(response as ConnectionStatus);
			setError(null);
		} catch (err: any) {
			setError(err.message || "Failed to check connection status");
			setStatus(null);
		} finally {
			setLoading(false);
		}
	};

	const checkWebhookHealth = async () => {
		try {
			if (!apiClient || !orgId) return;
			const response = await apiClient.get(`/webhook/health/detailed?org_id=${orgId}`);
			setWebhookHealth(response as WebhookHealth);
		} catch (err: any) {
			console.warn("Failed to fetch webhook health:", err.message);
		}
	};

	const handleConnect = async () => {
		try {
			setLoading(true);
			if (!apiClient) {
				setError("API client not initialized");
				return;
			}

			const response = await apiClient.get("/auth/meta-oauth/init");
			const { authUrl } = response as { authUrl: string };

			// Redirect to Meta OAuth
			window.location.href = authUrl;
		} catch (err: any) {
			setError(err.message || "Failed to initiate connection");
		} finally {
			setLoading(false);
		}
	};

	const handleDisconnect = async () => {
		try {
			setDisconnecting(true);
			if (!apiClient) {
				setError("API client not initialized");
				return;
			}

			await apiClient.post("/auth/meta-oauth/disconnect", {});
			setStatus(null);
			setWebhookHealth(null);
			setError(null);
		} catch (err: any) {
			setError(err.message || "Failed to disconnect");
		} finally {
			setDisconnecting(false);
		}
	};

	const handleManualSync = async () => {
		try {
			setSyncing(true);
			if (!apiClient) {
				setError("API client not initialized");
				return;
			}

			await apiClient.post("/templates/sync", {});
			// Refresh webhook health after sync
			if (orgId) {
				checkWebhookHealth();
			}
		} catch (err: any) {
			setError(err.message || "Failed to sync templates");
		} finally {
			setSyncing(false);
		}
	};

	if (loading) {
		return (
			<div className="whatsapp-connection">
				<div className="loading">Loading WhatsApp connection status...</div>
			</div>
		);
	}

	const getSyncStatusIcon = (status?: string) => {
		switch (status) {
			case "success":
				return "✓";
			case "syncing":
				return "↻";
			case "error":
				return "✕";
			default:
				return "◌";
		}
	};

	const getSyncStatusColor = (status?: string) => {
		switch (status) {
			case "success":
				return "#4CAF50";
			case "syncing":
				return "#FFC107";
			case "error":
				return "#f44336";
			default:
				return "#9E9E9E";
		}
	};

	if (loading) {
		return (
			<div className="whatsapp-connection">
				<div className="loading">Loading WhatsApp connection status...</div>
			</div>
		);
	}

	return (
		<div className="whatsapp-connection">
			<div className="connection-card">
				<div className="header">
					<h2>WhatsApp Business Account</h2>
					<div className={`status-badge ${status?.connected ? "connected" : "disconnected"}`}>
						{status?.connected ? "Connected" : "Disconnected"}
					</div>
				</div>

				{error && <div className="error-message">{error}</div>}

				{status?.connected ? (
					<div className="connected-info">
						<div className="info-row">
							<span className="label">Phone Number:</span>
							<span className="value">{status.phoneNumber}</span>
						</div>
						<div className="info-row">
							<span className="label">WABA ID:</span>
							<span className="value">{status.wabaId}</span>
						</div>

						{/* Webhook Health Section */}
						{webhookHealth && (
							<div className="webhook-health-section">
								<h3>Webhook Status</h3>
								<div className="health-item">
									<span className="label">Webhook Verified:</span>
									<span className={`status ${webhookHealth.webhookVerified ? "verified" : "pending"}`}>
										{webhookHealth.webhookVerified ? "✓ Verified" : "◌ Pending"}
									</span>
								</div>
								{webhookHealth.lastWebhookTime && (
									<div className="health-item">
										<span className="label">Last Webhook:</span>
										<span className="value">{new Date(webhookHealth.lastWebhookTime).toLocaleString()}</span>
									</div>
								)}
							</div>
						)}

						{/* Template Sync Section */}
						{webhookHealth && (
							<div className="template-sync-section">
								<div className="sync-header">
									<h3>Template Synchronization</h3>
									<span 
										className={`sync-badge ${webhookHealth.syncStatus}`}
										style={{ color: getSyncStatusColor(webhookHealth.syncStatus) }}
									>
										{getSyncStatusIcon(webhookHealth.syncStatus)} {webhookHealth.syncStatus}
									</span>
								</div>

								{webhookHealth.templates && (
									<div className="template-stats">
										<div className="stat-item">
											<span className="stat-label">Approved Templates:</span>
											<span className="stat-value">{webhookHealth.templates.approved}</span>
										</div>
										<div className="stat-item">
											<span className="stat-label">Total Synced:</span>
											<span className="stat-value">{webhookHealth.templates.total}</span>
										</div>
									</div>
								)}

								{webhookHealth.lastSyncTime && (
									<div className="sync-time">
										Last sync: {new Date(webhookHealth.lastSyncTime).toLocaleString()}
									</div>
								)}

								{webhookHealth.error && (
									<div className="sync-error">
										Error: {webhookHealth.error}
									</div>
								)}

								<button
									onClick={handleManualSync}
									disabled={syncing || webhookHealth.syncStatus === "syncing"}
									className="btn-sync"
								>
									{syncing ? "Syncing..." : "Sync Templates Now"}
								</button>
							</div>
						)}

						{status.isExpiring && (
							<div className="warning-banner">
								⚠️ Your WhatsApp token is expiring soon. Please reconnect to refresh it.
							</div>
						)}
						<div className="token-expiry">
							Token expires: {new Date(status.tokenExpiresAt || "").toLocaleDateString()}
						</div>
						<div className="actions">
							<button
								onClick={handleDisconnect}
								disabled={disconnecting}
								className="btn-disconnect"
							>
								{disconnecting ? "Disconnecting..." : "Disconnect"}
							</button>
							<button
								onClick={handleConnect}
								disabled={disconnecting}
								className="btn-reconnect"
							>
								Reconnect
							</button>
						</div>
					</div>
				) : (
					<div className="disconnected-info">
						<p>
							Connect your WhatsApp Business Account to start sending messages. You'll be
							redirected to Meta to authenticate securely.
						</p>
						<button
							onClick={handleConnect}
							disabled={loading}
							className="btn-connect"
						>
							{loading ? "Connecting..." : "Connect WhatsApp"}
						</button>
					</div>
				)}

				<div className="help-section">
					<h3>Need help?</h3>
					<ul>
						<li>Make sure you have a WhatsApp Business Account</li>
						<li>You must have admin access to the account</li>
						<li>Meta will ask you to grant necessary permissions</li>
					</ul>
				</div>
			</div>
		</div>
	);
};
