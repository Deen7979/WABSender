import React, { useEffect, useState } from 'react';
import './PlatformDashboard.css';
import { SubscriptionLicenseManagement } from './SubscriptionLicenseManagement';

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

interface PlatformDashboardProps {
	apiClient?: any;
	onEnterOrg: (orgId: string, orgName?: string | null) => void;
}

export const PlatformDashboard: React.FC<PlatformDashboardProps> = ({ apiClient, onEnterOrg }) => {
	const [orgs, setOrgs] = useState<OrgSummary[]>([]);
	const [users, setUsers] = useState<UserSummary[]>([]);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [showCreateOrgForm, setShowCreateOrgForm] = useState(false);
	const [createOrgFormData, setCreateOrgFormData] = useState({
		name: ''
	});
	const [creatingOrg, setCreatingOrg] = useState(false);

	useEffect(() => {
		const loadPlatformData = async () => {
			if (!apiClient) return;
			setLoading(true);
			setError(null);
			try {
				const [orgsRes, usersRes] = await Promise.all([
					apiClient.listPlatformOrgs(),
					apiClient.listPlatformUsers()
				]);
				setOrgs(orgsRes.orgs || []);
				setUsers(usersRes.users || []);
			} catch (err) {
				setError(err instanceof Error ? err.message : 'Failed to load platform data');
			} finally {
				setLoading(false);
			}
		};

		loadPlatformData();
	}, [apiClient]);

	const handleCreateOrg = async (e: React.FormEvent) => {
		e.preventDefault();
		if (!apiClient || !createOrgFormData.name.trim()) return;

		setCreatingOrg(true);
		setError(null);
		try {
			await apiClient.post('/orgs', { name: createOrgFormData.name.trim() });
			setShowCreateOrgForm(false);
			setCreateOrgFormData({ name: '' });

			// Refresh orgs
			const orgsRes = await apiClient.listPlatformOrgs();
			setOrgs(orgsRes.orgs || []);
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Failed to create organization');
		} finally {
			setCreatingOrg(false);
		}
	};

	return (
		<div className="platform-dashboard">
			<h2 className="platform-dashboard__title">Platform Dashboard</h2>
			{error && <div className="platform-dashboard__error">{error}</div>}

			<div className="platform-dashboard__card">
				<div className="platform-dashboard__card-header">
					<h3>Organizations</h3>
					<div>
						<button
							className="platform-dashboard__button platform-dashboard__button--primary"
							onClick={() => setShowCreateOrgForm(true)}
							disabled={loading}
						>
							Create Organization
						</button>
						{loading && <span className="platform-dashboard__muted">Loading...</span>}
					</div>
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
			</div>

			{/* Subscription License Management Section */}
			<SubscriptionLicenseManagement apiClient={apiClient} />

			{/* Create Organization Form Modal */}
			{showCreateOrgForm && (
				<div className="platform-dashboard__modal-overlay" onClick={() => setShowCreateOrgForm(false)}>
					<div className="platform-dashboard__modal" onClick={(e) => e.stopPropagation()}>
						<h3>Create New Organization</h3>
						<form onSubmit={handleCreateOrg}>
							<div className="platform-dashboard__form-group">
								<label htmlFor="orgName">Organization Name *</label>
								<input
									id="orgName"
									type="text"
									value={createOrgFormData.name}
									onChange={(e) => setCreateOrgFormData({ name: e.target.value })}
									required
									placeholder="Enter organization name"
								/>
							</div>
							<div className="platform-dashboard__modal-actions">
								<button
									type="button"
									className="platform-dashboard__button"
									onClick={() => setShowCreateOrgForm(false)}
								>
									Cancel
								</button>
								<button
									type="submit"
									className="platform-dashboard__button platform-dashboard__button--primary"
									disabled={creatingOrg}
								>
									{creatingOrg ? 'Creating...' : 'Create Organization'}
								</button>
							</div>
						</form>
					</div>
				</div>
			)}
		</div>
	);
};
