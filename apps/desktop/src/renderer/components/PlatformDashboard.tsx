import React, { useEffect, useState } from 'react';
import './PlatformDashboard.css';

type OrgSummary = {
	id: string;
	name: string;
	created_at: string;
	user_count: number;
	admin_count: number;
};

type UserSummary = {
	id: string;
	email: string;
	role: string;
	is_active: boolean;
	created_at: string;
	org_id: string | null;
	org_name: string | null;
};

type LicenseSummary = {
	id: string;
	status: string;
	plan_code: string;
	max_devices: number;
	expires_at: string | null;
	issued_to_org_id: string | null;
	created_at: string;
	updated_at: string;
	org_name: string | null;
	active_devices: number;
	total_activations: number;
};

interface PlatformDashboardProps {
	apiClient?: any;
	onEnterOrg: (orgId: string, orgName?: string | null) => void;
}

export const PlatformDashboard: React.FC<PlatformDashboardProps> = ({ apiClient, onEnterOrg }) => {
	const [orgs, setOrgs] = useState<OrgSummary[]>([]);
	const [users, setUsers] = useState<UserSummary[]>([]);
	const [licenses, setLicenses] = useState<LicenseSummary[]>([]);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [showIssueForm, setShowIssueForm] = useState(false);
	const [issueFormData, setIssueFormData] = useState({
		orgId: '',
		planCode: 'perpetual',
		maxDevices: 1,
		expiresAt: ''
	});
	const [issuedLicenseKey, setIssuedLicenseKey] = useState<string | null>(null);
	const [issuing, setIssuing] = useState(false);

	useEffect(() => {
		const loadPlatformData = async () => {
			if (!apiClient) return;
			setLoading(true);
			setError(null);
			try {
				const [orgsRes, usersRes, licensesRes] = await Promise.all([
					apiClient.listPlatformOrgs(),
					apiClient.listPlatformUsers(),
					apiClient.listPlatformLicenses()
				]);
				setOrgs(orgsRes.orgs || []);
				setUsers(usersRes.users || []);
				setLicenses(licensesRes.licenses || []);
			} catch (err) {
				setError(err instanceof Error ? err.message : 'Failed to load platform data');
			} finally {
				setLoading(false);
			}
		};

		loadPlatformData();
	}, [apiClient]);

	const handleIssueLicense = async (e: React.FormEvent) => {
		e.preventDefault();
		if (!apiClient || !issueFormData.orgId) return;

		setIssuing(true);
		setError(null);
		try {
			const payload: any = {
				orgId: issueFormData.orgId,
				planCode: issueFormData.planCode || 'perpetual',
				maxDevices: issueFormData.maxDevices || 1
			};
			if (issueFormData.expiresAt) {
				payload.expiresAt = issueFormData.expiresAt;
			}
			const result = await apiClient.platformIssueLicense(payload);
			setIssuedLicenseKey(result.licenseKey);
			setShowIssueForm(false);
			setIssueFormData({
				orgId: '',
				planCode: 'perpetual',
				maxDevices: 1,
				expiresAt: ''
			});

			// Refresh licenses
			const licensesRes = await apiClient.listPlatformLicenses();
			setLicenses(licensesRes.licenses || []);
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Failed to issue license');
		} finally {
			setIssuing(false);
		}
	};

	return (
		<div className="platform-dashboard">
			<h2 className="platform-dashboard__title">Platform Dashboard</h2>
			{error && <div className="platform-dashboard__error">{error}</div>}

			<div className="platform-dashboard__card">
				<div className="platform-dashboard__card-header">
					<h3>Organizations</h3>
					{loading && <span className="platform-dashboard__muted">Loading...</span>}
				</div>
				{orgs.length === 0 ? (
					<div className="platform-dashboard__empty">No organizations found.</div>
				) : (
					<div className="platform-dashboard__list">
						{orgs.map((org) => (
							<div key={org.id} className="platform-dashboard__item">
								<div>
									<div className="platform-dashboard__item-title">{org.name}</div>
									<div className="platform-dashboard__meta">
										Users: {org.user_count} | Admins: {org.admin_count}
									</div>
									<div className="platform-dashboard__meta-muted">ID: {org.id}</div>
								</div>
								<button
									className="platform-dashboard__button"
									onClick={() => onEnterOrg(org.id, org.name)}
								>
									Enter Org Context
								</button>
							</div>
						))}
					</div>
				)}
			</div>

			<div className="platform-dashboard__grid">
				<div className="platform-dashboard__card">
					<h3>Users</h3>
					{users.length === 0 ? (
						<div className="platform-dashboard__empty">No users found.</div>
					) : (
						<div className="platform-dashboard__list">
							{users.slice(0, 10).map((user) => (
								<div key={user.id} className="platform-dashboard__item platform-dashboard__item--compact">
									<div>
										<div className="platform-dashboard__item-title">{user.email}</div>
										<div className="platform-dashboard__meta">Role: {user.role}</div>
										<div className="platform-dashboard__meta-muted">Org: {user.org_name || user.org_id || 'N/A'}</div>
									</div>
								</div>
							))}
						</div>
					)}
				</div>

				<div className="platform-dashboard__card">
					<div className="platform-dashboard__card-header">
						<h3>Licenses</h3>
						<button
							className="platform-dashboard__button"
							onClick={() => setShowIssueForm(true)}
						>
							+ Issue License
						</button>
					</div>
					{licenses.length === 0 ? (
						<div className="platform-dashboard__empty">No licenses found.</div>
					) : (
						<div className="platform-dashboard__list">
							{licenses.slice(0, 10).map((license) => (
								<div key={license.id} className="platform-dashboard__item platform-dashboard__item--compact">
									<div>
										<div className="platform-dashboard__item-title">{license.plan_code} ({license.status})</div>
										<div className="platform-dashboard__meta">Devices: {license.active_devices}/{license.max_devices}</div>
										<div className="platform-dashboard__meta-muted">Org: {license.org_name || license.issued_to_org_id || 'Unassigned'}</div>
									</div>
								</div>
							))}
						</div>
					)}
				</div>
			</div>

			{/* Issue License Form Modal */}
			{showIssueForm && (
				<div className="platform-dashboard__modal-overlay" onClick={() => setShowIssueForm(false)}>
					<div className="platform-dashboard__modal" onClick={(e) => e.stopPropagation()}>
						<h3>Issue New License</h3>
						<form onSubmit={handleIssueLicense}>
							<div className="platform-dashboard__form-group">
								<label htmlFor="orgId">Organization *</label>
								<select
									id="orgId"
									value={issueFormData.orgId}
									onChange={(e) => setIssueFormData({ ...issueFormData, orgId: e.target.value })}
									required
								>
									<option value="">Select Organization</option>
									{orgs.map((org) => (
										<option key={org.id} value={org.id}>{org.name}</option>
									))}
								</select>
							</div>
							<div className="platform-dashboard__form-group">
								<label htmlFor="planCode">Plan Code</label>
								<input
									id="planCode"
									type="text"
									value={issueFormData.planCode}
									onChange={(e) => setIssueFormData({ ...issueFormData, planCode: e.target.value })}
									placeholder="perpetual"
								/>
							</div>
							<div className="platform-dashboard__form-group">
								<label htmlFor="maxDevices">Max Devices</label>
								<input
									id="maxDevices"
									type="number"
									min="1"
									value={issueFormData.maxDevices}
									onChange={(e) => setIssueFormData({ ...issueFormData, maxDevices: parseInt(e.target.value) || 1 })}
								/>
							</div>
							<div className="platform-dashboard__form-group">
								<label htmlFor="expiresAt">Expires At (optional)</label>
								<input
									id="expiresAt"
									type="datetime-local"
									value={issueFormData.expiresAt}
									onChange={(e) => setIssueFormData({ ...issueFormData, expiresAt: e.target.value })}
								/>
							</div>
							<div className="platform-dashboard__form-actions">
								<button
									type="button"
									className="platform-dashboard__button platform-dashboard__button--secondary"
									onClick={() => setShowIssueForm(false)}
								>
									Cancel
								</button>
								<button
									type="submit"
									className="platform-dashboard__button"
									disabled={issuing}
								>
									{issuing ? 'Issuing...' : 'Issue License'}
								</button>
							</div>
						</form>
					</div>
				</div>
			)}

			{/* License Key Display Modal */}
			{issuedLicenseKey && (
				<div className="platform-dashboard__modal-overlay" onClick={() => setIssuedLicenseKey(null)}>
					<div className="platform-dashboard__modal" onClick={(e) => e.stopPropagation()}>
						<h3>License Issued Successfully! 🎉</h3>
						<p className="platform-dashboard__success-message">
							Copy this license key now - it will only be shown once:
						</p>
						<div className="platform-dashboard__license-key">
							{issuedLicenseKey}
						</div>
						<div className="platform-dashboard__form-actions">
							<button
								className="platform-dashboard__button"
								onClick={() => {
									navigator.clipboard.writeText(issuedLicenseKey);
									alert('License key copied to clipboard!');
								}}
							>
								Copy to Clipboard
							</button>
							<button
								className="platform-dashboard__button platform-dashboard__button--secondary"
								onClick={() => setIssuedLicenseKey(null)}
							>
								Close
							</button>
						</div>
					</div>
				</div>
			)}
		</div>
	);
};
