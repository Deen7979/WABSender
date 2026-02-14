import React, { useState, useEffect } from 'react';

interface CampaignCreateProps {
	apiClient: any;
	onSuccess: () => void;
	onCancel: () => void;
}

export const CampaignCreate: React.FC<CampaignCreateProps> = ({ apiClient, onSuccess, onCancel }) => {
	const [formData, setFormData] = useState({
		name: '',
		templateId: '',
		scheduledAt: '',
		whatsappAccountId: '',
	});

	const [templates, setTemplates] = useState<any[]>([]);
	const [accounts, setAccounts] = useState<any[]>([]);
	const [recipientFile, setRecipientFile] = useState<File | null>(null);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		loadTemplatesAndAccounts();
	}, []);

	const loadTemplatesAndAccounts = async () => {
		try {
			setLoading(true);
			const [templatesData, accountsData] = await Promise.all([
				apiClient.listTemplates(),
				apiClient.listWhatsAppAccounts(),
			]);
			setTemplates(templatesData);
			setAccounts(accountsData);
		} catch (err: any) {
			setError(`Failed to load templates and accounts: ${err.message}`);
		} finally {
			setLoading(false);
		}
	};

	const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
		const file = e.target.files?.[0];
		if (file) {
			setRecipientFile(file);
		}
	};

	const parseRecipientFile = async (__file: File): Promise<Array<{ contactId: string; templateParams?: Record<string, any> }>> => {
		// For now, return empty array - file parsing would be done on backend
		// In a full implementation, we'd parse CSV/XLSX here or use backend API
		return [];
	};

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault();

		if (!formData.name || !formData.templateId || !formData.scheduledAt || !formData.whatsappAccountId) {
			setError('Please fill in all required fields');
			return;
		}

		if (!recipientFile) {
			setError('Please select a recipient file');
			return;
		}

		try {
			setLoading(true);
			setError(null);

			// Parse recipient file
			const recipients = await parseRecipientFile(recipientFile);

			if (recipients.length === 0) {
				setError('No recipients found in file');
				return;
			}

			// Create campaign
			const campaignResponse = await apiClient.createCampaign({
				name: formData.name,
				templateId: formData.templateId,
				recipients,
			});

			// Schedule campaign
			const idempotencyKey = `${campaignResponse.id}-${Date.now()}`;
			await apiClient.scheduleCampaign(campaignResponse.id, {
				scheduledAt: formData.scheduledAt,
				idempotencyKey,
				whatsappAccountId: formData.whatsappAccountId,
			});

			setError(null);
			onSuccess();
		} catch (err: any) {
			setError(`Failed to create campaign: ${err.message}`);
		} finally {
			setLoading(false);
		}
	};

	return (
		<div style={{ padding: '20px', maxWidth: '600px', margin: '0 auto' }}>
			<h2>Create Campaign</h2>

			{error && (
				<div style={{ padding: '10px', marginBottom: '20px', backgroundColor: '#fee', borderRadius: '4px', color: '#c33' }}>
					{error}
				</div>
			)}

			<form onSubmit={handleSubmit}>
				<div style={{ marginBottom: '15px' }}>
					<label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>
						Campaign Name *
					</label>
					<input
						type="text"
						value={formData.name}
						onChange={(e) => setFormData({ ...formData, name: e.target.value })}
						placeholder="e.g., February Promotion"
						style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #ccc' }}
						required
					/>
				</div>

				<div style={{ marginBottom: '15px' }}>
					<label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>
						Template (WhatsApp Template Only) *
					</label>
					<select
						value={formData.templateId}
						onChange={(e) => setFormData({ ...formData, templateId: e.target.value })}
						style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #ccc' }}
						aria-label="Template (WhatsApp Template Only)"
						required
					>
						<option value="">-- Select Template --</option>
						{templates.map((t: any) => (
							<option key={t.id} value={t.id}>
								{t.name} ({t.category})
							</option>
						))}
					</select>
					<small style={{ display: 'block', marginTop: '5px', color: '#666' }}>
						Only pre-approved WhatsApp templates can be used for campaigns
					</small>
				</div>

				<div style={{ marginBottom: '15px' }}>
					<label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>
						WhatsApp Account *
					</label>
					<select
						value={formData.whatsappAccountId}
						onChange={(e) => setFormData({ ...formData, whatsappAccountId: e.target.value })}
						style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #ccc' }}
						aria-label="WhatsApp Account"
						required
					>
						<option value="">-- Select Account --</option>
						{accounts.map((a: any) => (
							<option key={a.id} value={a.id}>
								{a.displayPhoneNumber || a.phoneNumberId}
							</option>
						))}
					</select>
				</div>

				<div style={{ marginBottom: '15px' }}>
					<label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>
						Schedule Time *
					</label>
					<input
						type="datetime-local"
						value={formData.scheduledAt}
						onChange={(e) => setFormData({ ...formData, scheduledAt: e.target.value })}
						style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #ccc' }}
					aria-label="Schedule Time"
					required
				/>
				<small style={{ display: 'block', marginTop: '5px', color: '#666' }}>
					Campaign will start sending at this time
				</small>
			</div>

			<div style={{ marginBottom: '20px' }}>
				<label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>
					Recipients (CSV or XLSX) *
				</label>
				<input
					type="file"
					onChange={handleFileChange}
					accept=".csv,.xlsx,.xls"
					style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #ccc' }}
					aria-label="Recipients (CSV or XLSX)"
						required
					/>
					<small style={{ display: 'block', marginTop: '5px', color: '#666' }}>
						File should contain Contact IDs. One per row.
					</small>
					{recipientFile && (
						<div style={{ marginTop: '8px', padding: '8px', backgroundColor: '#eef', borderRadius: '4px', fontSize: '14px' }}>
							Selected: {recipientFile.name}
						</div>
					)}
				</div>

				<div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
					<button
						type="button"
						onClick={onCancel}
						disabled={loading}
						style={{
							padding: '10px 20px',
							borderRadius: '4px',
							border: '1px solid #ccc',
							backgroundColor: '#fff',
							cursor: 'pointer',
						}}
					>
						Cancel
					</button>
					<button
						type="submit"
						disabled={loading}
						style={{
							padding: '10px 20px',
							borderRadius: '4px',
							border: 'none',
							backgroundColor: loading ? '#ccc' : '#4CAF50',
							color: '#fff',
							cursor: loading ? 'default' : 'pointer',
						}}
					>
						{loading ? 'Creating...' : 'Create Campaign'}
					</button>
				</div>
			</form>
		</div>
	);
};
