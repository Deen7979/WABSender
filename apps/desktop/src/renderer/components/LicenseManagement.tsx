import React, { useEffect, useState } from 'react';
import './LicenseManagement.css';

interface LicenseManagementProps {
	apiClient?: any;
}

type LicenseSummary = {
	id: string;
	status: string;
	plan_code: string;
	max_devices: number;
	expires_at: string | null;
	created_at: string;
	updated_at: string;
	active_devices: number;
	total_activations: number;
};

type Activation = {
	id: string;
	device_id: string;
	device_label: string | null;
	activated_at: string;
	last_validated_at: string;
	deactivated_at: string | null;
	user_email: string | null;
};

export const LicenseManagement: React.FC<LicenseManagementProps> = ({ apiClient }) => {
	const [licenses, setLicenses] = useState<LicenseSummary[]>([]);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [planCode, setPlanCode] = useState('perpetual');
	const [maxDevices, setMaxDevices] = useState(1);
	const [expiresAt, setExpiresAt] = useState('');
	const [issuedKey, setIssuedKey] = useState<string | null>(null);
	const [expandedLicenseId, setExpandedLicenseId] = useState<string | null>(null);
	const [activations, setActivations] = useState<Record<string, Activation[]>>({});
	const [loadingActivations, setLoadingActivations] = useState(false);

	const loadLicenses = async () => {
		if (!apiClient) return;
		setLoading(true);
		setError(null);
		try {
			const response = await apiClient.listLicenses();
			setLicenses(response.licenses || []);
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Failed to load licenses');
		} finally {
			setLoading(false);
		}
	};

	useEffect(() => {
		loadLicenses();
	}, [apiClient]);

	const handleIssue = async (e: React.FormEvent) => {
		e.preventDefault();
		if (!apiClient) return;
		setError(null);
		setIssuedKey(null);

		try {
			const payload = {
				planCode: planCode.trim() || 'perpetual',
				maxDevices,
				expiresAt: expiresAt ? new Date(expiresAt).toISOString() : undefined
			};
			const result = await apiClient.issueLicense(payload);
			setIssuedKey(result.licenseKey);
			await loadLicenses();
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Failed to issue license');
		}
	};

	const toggleActivations = async (licenseId: string) => {
		if (!apiClient) return;
		if (expandedLicenseId === licenseId) {
			setExpandedLicenseId(null);
			return;
		}

		setExpandedLicenseId(licenseId);
		if (activations[licenseId]) {
			return;
		}

		setLoadingActivations(true);
		try {
			const response = await apiClient.listLicenseActivations(licenseId);
			setActivations((prev) => ({
				...prev,
				[licenseId]: response.activations || []
			}));
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Failed to load activations');
		} finally {
			setLoadingActivations(false);
		}
	};

	const handleRevoke = async (licenseId: string) => {
		if (!apiClient) return;
		setError(null);
		try {
			await apiClient.revokeLicense(licenseId);
			await loadLicenses();
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Failed to revoke license');
		}
	};

	const handleDeactivate = async (activationId: string) => {
		if (!apiClient) return;
		setError(null);
		try {
			await apiClient.deactivateActivation(activationId);
			if (expandedLicenseId) {
				const response = await apiClient.listLicenseActivations(expandedLicenseId);
				setActivations((prev) => ({
					...prev,
					[expandedLicenseId]: response.activations || []
				}));
			}
			await loadLicenses();
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Failed to deactivate device');
		}
	};

	return (
		<div className="license-management">
			<h2 className="license-management__title">License Management</h2>

			<form onSubmit={handleIssue} className="license-management__card license-management__card--spaced">
				<h3 className="license-management__section-title">Issue License</h3>
				<div className="license-management__form-grid">
					<div className="license-management__field">
						<label className="license-management__label" htmlFor="license-plan-code">Plan Code</label>
						<input
							id="license-plan-code"
							type="text"
							value={planCode}
							onChange={(e) => setPlanCode(e.target.value)}
							className="license-management__input"
						/>
					</div>
					<div className="license-management__field license-management__field--narrow">
						<label className="license-management__label" htmlFor="license-max-devices">Max Devices</label>
						<input
							id="license-max-devices"
							type="number"
							min={1}
							value={maxDevices}
							onChange={(e) => setMaxDevices(Number(e.target.value))}
							className="license-management__input"
						/>
					</div>
					<div className="license-management__field license-management__field--medium">
						<label className="license-management__label" htmlFor="license-expires-at">Expires At</label>
						<input
							id="license-expires-at"
							type="date"
							value={expiresAt}
							onChange={(e) => setExpiresAt(e.target.value)}
							className="license-management__input"
						/>
					</div>
				</div>
				<button type="submit" className="license-management__button">
					Issue License
				</button>
				{issuedKey && (
					<div className="license-management__issued-key">
						<strong>New License Key:</strong> {issuedKey}
					</div>
				)}
			</form>

			{error && <div className="license-management__error">{error}</div>}

			<div className="license-management__card">
				<h3 className="license-management__section-title">Licenses</h3>
				{loading ? (
					<div>Loading licenses...</div>
				) : licenses.length === 0 ? (
					<div>No licenses issued yet.</div>
				) : (
					<div className="license-management__list">
						{licenses.map((license) => (
							<div key={license.id} className="license-management__item">
								<div className="license-management__item-header">
									<div>
										<div className="license-management__item-title">License {license.id}</div>
										<div className="license-management__meta">
											Plan: {license.plan_code} | Status: {license.status} | Devices: {license.active_devices}/{license.max_devices}
										</div>
										<div className="license-management__meta-small">
											Expires: {license.expires_at ? new Date(license.expires_at).toLocaleDateString() : 'Never'}
										</div>
									</div>
									<div className="license-management__actions">
										<button
											onClick={() => toggleActivations(license.id)}
											className="license-management__button-secondary"
										>
											{expandedLicenseId === license.id ? 'Hide Devices' : 'View Devices'}
										</button>
										<button
											onClick={() => handleRevoke(license.id)}
											className="license-management__button-danger"
										>
											Revoke
										</button>
									</div>
								</div>

								{expandedLicenseId === license.id && (
									<div className="license-management__activations">
										{loadingActivations ? (
											<div>Loading devices...</div>
										) : (activations[license.id] || []).length === 0 ? (
											<div>No devices activated.</div>
										) : (
											<div className="license-management__activation-list">
												{(activations[license.id] || []).map((activation) => (
													<div key={activation.id} className="license-management__activation-item">
														<div className="license-management__activation-title">
															<strong>{activation.device_label || 'Device'}</strong> ({activation.device_id})
														</div>
														<div className="license-management__activation-meta">
															Activated: {new Date(activation.activated_at).toLocaleString()} | Last check: {new Date(activation.last_validated_at).toLocaleString()}
														</div>
														<div className="license-management__activation-meta license-management__activation-meta--muted">
															User: {activation.user_email || 'N/A'} | Status: {activation.deactivated_at ? 'Deactivated' : 'Active'}
														</div>
														{!activation.deactivated_at && (
															<button
																onClick={() => handleDeactivate(activation.id)}
																className="license-management__button-inline"
															>
																Deactivate
															</button>
														)}
													</div>
												))}
											</div>
										)}
									</div>
								)}
							</div>
						))}
					</div>
				)}
			</div>
		</div>
	);
};
