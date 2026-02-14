import React, { useState, useEffect, useMemo, ChangeEvent, ReactNode } from 'react';

interface Recipient {
	id: string;
	phone_number: string;
	name?: string;
	status: string;
	sent_at?: string;
}

interface RecipientTableProps {
	campaignId: string;
	apiClient?: any;
	wsClient: any;
}

export const RecipientTable: React.FC<RecipientTableProps> = ({ campaignId, wsClient }: RecipientTableProps): ReactNode => {
	const [recipients, setRecipients] = useState<Recipient[]>([]);
	const [statusFilter, setStatusFilter] = useState<string>('all');
	const [searchTerm, setSearchTerm] = useState<string>('');
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		loadRecipients();

		// Listen for WebSocket updates
		if (wsClient) {
			const handleMessage = (data: any) => {
				const { event, payload } = data;

				if (event === 'campaign:recipient_sent' && payload.campaign_id === campaignId) {
					updateRecipientStatus(payload.recipient_id, 'sent');
				} else if (event === 'campaign:recipient_status' && payload.campaign_id === campaignId) {
					updateRecipientStatus(payload.recipient_id, payload.status);
				} else if (event === 'campaign:recipient_failed' && payload.campaign_id === campaignId) {
					updateRecipientStatus(payload.recipient_id, 'failed');
				}
			};

			if (wsClient.onmessage) {
				const originalHandler = wsClient.onmessage;
				wsClient.onmessage = (event: Event) => {
					const data = JSON.parse((event as any).data || '{}');
					handleMessage(data);
					originalHandler?.(event);
				};
			}
		}
	}, [campaignId, wsClient]);

	const loadRecipients = async () => {
		try {
			setLoading(true);
			// Note: This would be a new API endpoint in a full implementation
			// For now, we'll show a placeholder
			setRecipients([]);
		} catch (err: any) {
			setError(`Failed to load recipients: ${err.message}`);
		} finally {
			setLoading(false);
		}
	};

	const updateRecipientStatus = (recipientId: string, newStatus: string): void => {
		setRecipients((prev: Recipient[]) =>
			prev.map((r: Recipient) =>
				r.id === recipientId
					? { ...r, status: newStatus, sent_at: r.sent_at || new Date().toISOString() }
					: r
			)
		);
	};

	const filteredRecipients = useMemo((): Recipient[] => {
		return recipients.filter((r: Recipient) => {
			const matchesStatus = statusFilter === 'all' || r.status === statusFilter;
			const matchesSearch =
				searchTerm === '' ||
				r.phone_number.includes(searchTerm) ||
				(r.name || '').toLowerCase().includes(searchTerm.toLowerCase());
			return matchesStatus && matchesSearch;
		});
	}, [recipients, statusFilter, searchTerm]);

	const statusCounts = useMemo(
		(): Record<string, number> => ({
			all: recipients.length,
			pending: recipients.filter((r: Recipient) => r.status === 'pending').length,
			sent: recipients.filter((r: Recipient) => r.status === 'sent').length,
			delivered: recipients.filter((r: Recipient) => r.status === 'delivered').length,
			read: recipients.filter((r: Recipient) => r.status === 'read').length,
			failed: recipients.filter((r: Recipient) => r.status === 'failed').length,
		}),
		[recipients]
	);

	const getStatusColor = (status: string): string => {
		switch (status) {
			case 'pending':
				return '#FF9800';
			case 'sent':
				return '#2196F3';
			case 'delivered':
				return '#4CAF50';
			case 'read':
				return '#8BC34A';
			case 'failed':
				return '#F44336';
			default:
				return '#999';
		}
	};

	const formatDate = (dateString?: string): string => {
		if (!dateString) return '-';
		const date = new Date(dateString);
		return date.toLocaleString();
	};

	return (
		<div style={{ padding: '20px', backgroundColor: '#fff', borderRadius: '4px' }}>
			<h3>Recipient Status</h3>

			{error && (
				<div style={{ padding: '10px', marginBottom: '20px', backgroundColor: '#fee', borderRadius: '4px', color: '#c33' }}>
					{error}
				</div>
			)}

			{/* Status Filter Tabs */}
			<div style={{ display: 'flex', gap: '10px', marginBottom: '20px', borderBottom: '1px solid #ddd', paddingBottom: '10px' }}>
				{(['all', 'pending', 'sent', 'delivered', 'read', 'failed'] as const).map((status: string) => (
					<button
						key={status}
						onClick={() => setStatusFilter(status)}
						style={{
							padding: '8px 16px',
							backgroundColor: statusFilter === status ? getStatusColor(status) : 'transparent',
							color: statusFilter === status ? '#fff' : '#333',
							border: 'none',
							borderRadius: '4px',
							cursor: 'pointer',
							fontWeight: statusFilter === status ? 'bold' : 'normal',
						}}
					>
						{status.charAt(0).toUpperCase() + status.slice(1)} ({statusCounts[status as keyof typeof statusCounts]})
					</button>
				))}
			</div>

			{/* Search */}
			<div style={{ marginBottom: '20px' }}>
				<input
					type="text"
					placeholder="Search by phone or name..."
					value={searchTerm}
					onChange={(e: ChangeEvent<HTMLInputElement>) => setSearchTerm(e.target.value)}
					style={{
						width: '100%',
						maxWidth: '300px',
						padding: '10px',
						borderRadius: '4px',
						border: '1px solid #ddd',
					}}
				/>
			</div>

			{/* Table */}
			{loading ? (
				<div>Loading recipients...</div>
			) : recipients.length === 0 ? (
				<div style={{ color: '#999' }}>No recipients loaded yet. Recipients will appear as the campaign sends.</div>
			) : (
				<div style={{ overflowX: 'auto' }}>
					<table
						style={{
							width: '100%',
							borderCollapse: 'collapse',
							fontSize: '14px',
						}}
					>
						<thead>
							<tr style={{ backgroundColor: '#f5f5f5', borderBottom: '2px solid #ddd' }}>
								<th style={{ padding: '12px', textAlign: 'left' }}>Phone Number</th>
								<th style={{ padding: '12px', textAlign: 'left' }}>Name</th>
								<th style={{ padding: '12px', textAlign: 'center' }}>Status</th>
								<th style={{ padding: '12px', textAlign: 'left' }}>Sent At</th>
							</tr>
						</thead>
						<tbody>
							{filteredRecipients.map((recipient: Recipient) => (
								<tr key={recipient.id} style={{ borderBottom: '1px solid #ddd' }}>
									<td style={{ padding: '12px' }}>
										<code style={{ backgroundColor: '#f5f5f5', padding: '4px 8px', borderRadius: '4px' }}>
											{recipient.phone_number}
										</code>
									</td>
									<td style={{ padding: '12px' }}>{recipient.name || '-'}</td>
									<td style={{ padding: '12px', textAlign: 'center' }}>
										<span
											style={{
												padding: '4px 12px',
												backgroundColor: getStatusColor(recipient.status),
												color: '#fff',
												borderRadius: '12px',
												fontSize: '12px',
												fontWeight: 'bold',
											}}
										>
											{recipient.status.toUpperCase()}
										</span>
									</td>
									<td style={{ padding: '12px' }}>{formatDate(recipient.sent_at)}</td>
								</tr>
							))}
						</tbody>
					</table>

					{filteredRecipients.length === 0 && (
						<div style={{ padding: '20px', textAlign: 'center', color: '#999' }}>
							No recipients match the current filter
						</div>
					)}

					<div style={{ marginTop: '15px', fontSize: '12px', color: '#666' }}>
						Showing {filteredRecipients.length} of {recipients.length} recipients
					</div>
				</div>
			)}
		</div>
	);
};
