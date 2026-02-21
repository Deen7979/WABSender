/**
 * Subscription License Management Component
 * 
 * Redesigned super admin panel for subscription-based license system
 * 
 * Features:
 * - Create license plans
 * - Issue subscription licenses
 * - View license details with expiry dates
 * - Renew licenses
 * - Revoke licenses
 * - View device activations and heartbeat status
 * - Audit log viewer
 * - License analytics
 */

import React, { useEffect, useState } from 'react';
import './SubscriptionLicenseManagement.css';

interface SubscriptionLicenseManagementProps {
	apiClient: any;
}

type LicensePlan = {
	id: string;
	name: string;
	code: string;
	duration_days: number;
	max_devices: number;
	features: Record<string, any>;
	price_cents: number;
	is_active: boolean;
};

type LicenseInstance = {
	id: string;
	status: string;
	plan_code: string;
	plan_name: string;
	org_id: string;
	org_name: string;
	seats_total: number;
	seats_used: number;
	expires_at: string | null;
	issued_at: string;
	renewed_at: string | null;
	revoked_at: string | null;
	active_devices: number;
	last_heartbeat: string | null;
};

type Activation = {
	id: string;
	device_id: string;
	device_label: string | null;
	activated_at: string;
	last_heartbeat: string;
	last_validated_at: string;
	deactivated_at: string | null;
	user_email: string | null;
	app_version: string | null;
	ip_address: string | null;
};

type AuditLog = {
	id: string;
	action: string;
	actor_id: string;
	timestamp: string;
	details: Record<string, any>;
};

type TabType = 'licenses' | 'plans' | 'analytics';

export const SubscriptionLicenseManagement: React.FC<SubscriptionLicenseManagementProps> = ({ apiClient }) => {
	const [activeTab, setActiveTab] = useState<TabType>('licenses');
	
	// License state
	const [licenses, setLicenses] = useState<LicenseInstance[]>([]);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [expandedLicenseId, setExpandedLicenseId] = useState<string | null>(null);
	const [activations, setActivations] = useState<Record<string, Activation[]>>({});
	const [auditLogs, setAuditLogs] = useState<Record<string, AuditLog[]>>({});
	const [loadingDetails, setLoadingDetails] = useState(false);
	
	// Issue license state
	const [showIssueModal, setShowIssueModal] = useState(false);
	const [selectedOrgId, setSelectedOrgId] = useState('');
	const [selectedPlanCode, setSelectedPlanCode] = useState('');
	const [selectedSeats, setSelectedSeats] = useState(1);
	const [customExpiry, setCustomExpiry] = useState('');
	const [issuedKey, setIssuedKey] = useState<string | null>(null);
	
	// Plans state
	const [plans, setPlans] = useState<LicensePlan[]>([]);
	const [orgs, setOrgs] = useState<Array<{ id: string; name: string }>>([]);

	// Load licenses
	const loadLicenses = async () => {
		setLoading(true);
		setError(null);
		try {
			const response = await apiClient.getSubscriptionLicenses();
			setLicenses(response.licenses || []);
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Failed to load licenses');
		} finally {
			setLoading(false);
		}
	};

	// Load plans
	const loadPlans = async () => {
		try {
			const response = await apiClient.getSubscriptionPlans();
			setPlans(response.plans || []);
		} catch (err) {
			console.error('Failed to load plans:', err);
		}
	};

	// Load organizations
	const loadOrgs = async () => {
		try {
			const response = await apiClient.listPlatformOrgs();
			setOrgs(response.orgs || []);
		} catch (err) {
			console.error('Failed to load orgs:', err);
		}
	};

	useEffect(() => {
		loadLicenses();
		loadPlans();
		loadOrgs();
	}, []);

	// Issue new license
	const handleIssueLicense = async (e: React.FormEvent) => {
		e.preventDefault();
		setError(null);
		setIssuedKey(null);

		if (!selectedOrgId || !selectedPlanCode) {
			setError('Organization and plan are required');
			return;
		}

		try {
			const response = await apiClient.issueSubscriptionLicense({
				orgId: selectedOrgId,
				planCode: selectedPlanCode,
				seats: selectedSeats || undefined,
				expiresAt: customExpiry || undefined
			});

			setIssuedKey(response.licenseKey);
			await loadLicenses();
			
			// Reset form
			setTimeout(() => {
				setShowIssueModal(false);
				setIssuedKey(null);
			}, 5000);
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Failed to issue license');
		}
	};

	// Renew license
	const handleRenewLicense = async (licenseId: string) => {
		if (!confirm('Renew this license for another year?')) return;

		setError(null);
		try {
			await apiClient.renewSubscriptionLicense(licenseId);
			await loadLicenses();
			alert('License renewed successfully');
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Failed to renew license');
		}
	};

	// Revoke license
	const handleRevokeLicense = async (licenseId: string) => {
		const reason = prompt('Reason for revocation (optional):');
		if (reason === null) return; // User cancelled

		setError(null);
		try {
			await apiClient.revokeSubscriptionLicense(licenseId, { reason });
			await loadLicenses();
			alert('License revoked successfully');
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Failed to revoke license');
		}
	};

	// Load license details (activations + audit logs)
	const toggleLicenseDetails = async (licenseId: string) => {
		if (expandedLicenseId === licenseId) {
			setExpandedLicenseId(null);
			return;
		}

		setExpandedLicenseId(licenseId);
		
		if (activations[licenseId]) {
			return; // Already loaded
		}

		setLoadingDetails(true);
		try {
			const response = await apiClient.getSubscriptionLicenseDetails(licenseId);
			setActivations(prev => ({
				...prev,
				[licenseId]: response.activations || []
			}));
			// Optionally load audit logs
			// setAuditLogs(prev => ({ ...prev, [licenseId]: response.auditLogs || [] }));
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Failed to load details');
		} finally {
			setLoadingDetails(false);
		}
	};

	// Helper: Format date
	const formatDate = (dateString: string | null) => {
		if (!dateString) return 'Never';
		return new Date(dateString).toLocaleString();
	};

	// Helper: Format relative time
	const formatRelativeTime = (dateString: string | null) => {
		if (!dateString) return 'Never';
		const date = new Date(dateString);
		const now = new Date();
		const diffMs = now.getTime() - date.getTime();
		const diffMins = Math.floor(diffMs / 60000);
		const diffHours = Math.floor(diffMs / 3600000);
		const diffDays = Math.floor(diffMs / 86400000);

		if (diffMins < 1) return 'Just now';
		if (diffMins < 60) return `${diffMins} min ago`;
		if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
		return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
	};

	// Helper: Get status badge
	const getStatusBadge = (license: LicenseInstance) => {
		if (license.status === 'revoked') {
			return <span className="status-badge status-revoked">Revoked</span>;
		}
		
		if (license.expires_at) {
			const expiryDate = new Date(license.expires_at);
			const now = new Date();
			const daysUntilExpiry = Math.floor((expiryDate.getTime() - now.getTime()) / 86400000);

			if (daysUntilExpiry < 0) {
				return <span className="status-badge status-expired">Expired</span>;
			}
			if (daysUntilExpiry < 30) {
				return <span className="status-badge status-expiring">Expiring Soon</span>;
			}
		}

		return <span className="status-badge status-active">Active</span>;
	};

	// Helper: Get heartbeat indicator
	const getHeartbeatIndicator = (lastHeartbeat: string | null) => {
		if (!lastHeartbeat) return <span className="heartbeat-indicator heartbeat-never">●</span>;
		
		const date = new Date(lastHeartbeat);
		const now = new Date();
		const diffHours = (now.getTime() - date.getTime()) / 3600000;

		if (diffHours < 24) {
			return <span className="heartbeat-indicator heartbeat-recent" title="Active (last 24h)">●</span>;
		}
		if (diffHours < 72) {
			return <span className="heartbeat-indicator heartbeat-warning" title="Warning (1-3 days)">●</span>;
		}
		return <span className="heartbeat-indicator heartbeat-stale" title="Stale (3+ days)">●</span>;
	};

	return (
		<div className="subscription-license-management">
			<div className="header">
				<h2>Subscription License Management</h2>
				<button 
					className="btn btn-primary"
					onClick={() => setShowIssueModal(true)}
				>
					+ Issue New License
				</button>
			</div>

			{error && (
				<div className="alert alert-error">
					{error}
					<button onClick={() => setError(null)}>×</button>
				</div>
			)}

			{/* Tabs */}
			<div className="tabs">
				<button 
					className={`tab ${activeTab === 'licenses' ?  'active' : ''}`}
					onClick={() => setActiveTab('licenses')}
				>
					Licenses ({licenses.length})
				</button>
				<button 
					className={`tab ${activeTab === 'plans' ? 'active' : ''}`}
					onClick={() => setActiveTab('plans')}
				>
					Plans ({plans.length})
				</button>
				<button 
					className={`tab ${activeTab === 'analytics' ? 'active' : ''}`}
					onClick={() => setActiveTab('analytics')}
				>
					Analytics
				</button>
			</div>

			{/* Licenses Tab */}
			{activeTab === 'licenses' && (
				<div className="licenses-tab">
					{loading ? (
						<div className="loading">Loading licenses...</div>
					) : licenses.length === 0 ? (
						<div className="empty-state">
							<p>No licenses issued yet</p>
							<button className="btn btn-primary" onClick={() => setShowIssueModal(true)}>
								Issue First License
							</button>
						</div>
					) : (
						<div className="licenses-grid">
							{licenses.map(license => (
								<div key={license.id} className="license-card">
									<div className="license-header">
										<div>
											<h3>{license.org_name}</h3>
											<span className="license-id">{license.id.substring(0, 8)}</span>
										</div>
										<div className="license-status">
											{getStatusBadge(license)}
											{getHeartbeatIndicator(license.last_heartbeat)}
										</div>
									</div>

									<div className="license-details">
										<div className="detail-row">
											<span className="label">Plan:</span>
											<span className="value">{license.plan_name || license.plan_code}</span>
										</div>
										<div className="detail-row">
											<span className="label">Devices:</span>
											<span className="value">
												{license.active_devices} / {license.seats_total}
												<span className="seats-indicator">
													({license.seats_total - license.active_devices} available)
												</span>
											</span>
										</div>
										<div className="detail-row">
											<span className="label">Expires:</span>
											<span className="value">
												{license.expires_at ? formatDate(license.expires_at) : 'Never'}
											</span>
										</div>
										<div className="detail-row">
											<span className="label">Last Seen:</span>
											<span className="value">
												{formatRelativeTime(license.last_heartbeat)}
											</span>
										</div>
										{license.renewed_at && (
											<div className="detail-row">
												<span className="label">Renewed:</span>
												<span className="value">{formatDate(license.renewed_at)}</span>
											</div>
										)}
									</div>

									<div className="license-actions">
										<button 
											className="btn btn-sm btn-secondary"
											onClick={() => toggleLicenseDetails(license.id)}
										>
											{expandedLicenseId === license.id ? 'Hide' : 'View'} Devices
										</button>
										{license.status === 'active' && (
											<button 
												className="btn btn-sm btn-success"
												onClick={() => handleRenewLicense(license.id)}
											>
												Renew
											</button>
										)}
										{license.status === 'active' && (
											<button 
												className="btn btn-sm btn-danger"
												onClick={() => handleRevokeLicense(license.id)}
											>
												Revoke
											</button>
										)}
									</div>

									{/* Expanded device list */}
									{expandedLicenseId === license.id && (
										<div className="device-list">
											<h4>Active Devices</h4>
											{loadingDetails ? (
												<div className="loading-small">Loading...</div>
											) : (activations[license.id] || []).length === 0 ? (
												<p className="no-devices">No devices activated</p>
											) : (
												<table className="devices-table">
													<thead>
														<tr>
															<th>Device</th>
															<th>User</th>
															<th>Activated</th>
															<th>Last Heartbeat</th>
															<th>Version</th>
															<th>Status</th>
														</tr>
													</thead>
													<tbody>
														{(activations[license.id] || []).map(activation => (
															<tr key={activation.id}>
																<td>
																	<div className="device-name">
																		{activation.device_label || 'Unnamed Device'}
																	</div>
																	<div className="device-id">
																		{activation.device_id.substring(0, 12)}...
																	</div>
																</td>
																<td>{activation.user_email || 'N/A'}</td>
																<td>{formatDate(activation.activated_at)}</td>
																<td>
																	{formatRelativeTime(activation.last_heartbeat)}
																</td>
																<td>{activation.app_version || '-'}</td>
																<td>
																	{activation.deactivated_at ? (
																		<span className="device-status-inactive">Inactive</span>
																	) : (
																		<span className="device-status-active">Active</span>
																	)}
																</td>
															</tr>
														))}
													</tbody>
												</table>
											)}
										</div>
									)}
								</div>
							))}
						</div>
					)}
				</div>
			)}

			{/* Plans Tab */}
			{activeTab === 'plans' && (
				<div className="plans-tab">
					<div className="plans-grid">
						{plans.map(plan => (
							<div key={plan.id} className="plan-card">
								<h3>{plan.name}</h3>
								<div className="plan-price">
									${(plan.price_cents / 100).toFixed(2)} / year
								</div>
								<div className="plan-features">
									<div className="plan-detail">
										<span>Duration:</span>
										<strong>{plan.duration_days} days</strong>
									</div>
									<div className="plan-detail">
										<span>Max Devices:</span>
										<strong>{plan.max_devices}</strong>
									</div>
									<div className="plan-features-list">
										<h4>Features:</h4>
										<pre>{JSON.stringify(plan.features, null, 2)}</pre>
									</div>
								</div>
							</div>
						))}
					</div>
				</div>
			)}

			{/* Analytics Tab */}
			{activeTab === 'analytics' && (
				<div className="analytics-tab">
					<div className="analytics-cards">
						<div className="analytics-card">
							<h3>Total Licenses</h3>
							<div className="analytics-value">{licenses.length}</div>
						</div>
						<div className="analytics-card">
							<h3>Active Licenses</h3>
							<div className="analytics-value">
								{licenses.filter(l => l.status === 'active').length}
							</div>
						</div>
						<div className="analytics-card">
							<h3>Total Devices</h3>
							<div className="analytics-value">
								{licenses.reduce((sum, l) => sum + l.active_devices, 0)}
							</div>
						</div>
						<div className="analytics-card">
							<h3>Expiring Soon</h3>
							<div className="analytics-value">
								{licenses.filter(l => {
									if (!l.expires_at) return false;
									const days = Math.floor((new Date(l.expires_at).getTime() - Date.now()) / 86400000);
									return days > 0 && days < 30;
								}).length}
							</div>
						</div>
					</div>
				</div>
			)}

			{/* Issue License Modal */}
			{showIssueModal && (
				<div className="modal-overlay" onClick={() => setShowIssueModal(false)}>
					<div className="modal" onClick={(e) => e.stopPropagation()}>
						<div className="modal-header">
							<h3>Issue New Subscription License</h3>
							<button onClick={() => setShowIssueModal(false)}>×</button>
						</div>

						<form onSubmit={handleIssueLicense}>
							<div className="form-group">
								<label htmlFor="org-select">Organization *</label>
								<select
									id="org-select"
									value={selectedOrgId}
									onChange={(e) => setSelectedOrgId(e.target.value)}
									required
								>
									<option value="">Select organization...</option>
									{orgs.map(org => (
										<option key={org.id} value={org.id}>{org.name}</option>
									))}
								</select>
							</div>

							<div className="form-group">
								<label htmlFor="plan-select">Plan *</label>
								<select
									id="plan-select"
									value={selectedPlanCode}
									onChange={(e) => setSelectedPlanCode(e.target.value)}
									required
								>
									<option value="">Select plan...</option>
									{plans.map(plan => (
										<option key={plan.id} value={plan.code}>
											{plan.name} - ${(plan.price_cents / 100).toFixed(2)}/year
										</option>
									))}
								</select>
							</div>

							<div className="form-group">
								<label htmlFor="seats-input">Device Seats</label>
								<input
									id="seats-input"
									type="number"
									min="1"
									max="100"
									value={selectedSeats}
									onChange={(e) => setSelectedSeats(parseInt(e.target.value))}
								/>
							</div>

							<div className="form-group">
								<label htmlFor="expiry-input">Custom Expiry (optional)</label>
								<input
									id="expiry-input"
									type="date"
									value={customExpiry}
									onChange={(e) => setCustomExpiry(e.target.value)}
								/>
								<small>Leave empty for default plan duration</small>
							</div>

							<div className="modal-actions">
								<button type="button" className="btn btn-secondary" onClick={() => setShowIssueModal(false)}>
									Cancel
								</button>
								<button type="submit" className="btn btn-primary">
									Issue License
								</button>
							</div>

							{issuedKey && (
								<div className="issued-key-display">
									<strong>License Key Issued:</strong>
									<code className="license-key-code">{issuedKey}</code>
									<button
										type="button"
										onClick={() => navigator.clipboard.writeText(issuedKey)}
										className="btn btn-sm"
									>
										Copy
									</button>
									<small>⚠️ Save this key - it won't be shown again!</small>
								</div>
							)}
						</form>
					</div>
				</div>
			)}
		</div>
	);
};
