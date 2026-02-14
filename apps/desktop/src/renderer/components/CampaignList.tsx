import React, { useState, useEffect } from 'react';

interface Campaign {
	id: string;
	name: string;
	template_id: string;
	scheduled_at: string;
	status: string;
	created_at: string;
}

interface CampaignStats {
	pending: number;
	sent: number;
	delivered: number;
	read: number;
	failed: number;
}

interface CampaignListProps {
	apiClient: any;
	wsClient: any;
	onCreateClick: () => void;
}

export const CampaignList: React.FC<CampaignListProps> = ({ apiClient, wsClient, onCreateClick }) => {
	const [campaigns, setCampaigns] = useState<Campaign[]>([]);
	const [campaignStats, setCampaignStats] = useState<Record<string, CampaignStats>>({});
	const [selectedCampaignId, setSelectedCampaignId] = useState<string | null>(null);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		loadCampaigns();

		// Listen for campaign WebSocket events
		if (wsClient) {
			const handleMessage = (data: any) => {
				const { event, payload } = data;

				if (event === 'campaign:recipient_sent') {
					updateStats(payload.campaign_id);
				} else if (event === 'campaign:recipient_status') {
					updateStats(payload.campaign_id);
				} else if (event === 'campaign:completed') {
					// Reload campaigns to get updated status
					loadCampaigns();
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
	}, [wsClient]);

	const loadCampaigns = async () => {
		try {
			setLoading(true);
			const data = await apiClient.listCampaigns();
			setCampaigns(data);

			// Load stats for each campaign
			for (const campaign of data) {
				const stats = await apiClient.getCampaignStats(campaign.id);
				setCampaignStats((prev) => ({
					...prev,
					[campaign.id]: stats,
				}));
			}
		} catch (err: any) {
			setError(`Failed to load campaigns: ${err.message}`);
		} finally {
			setLoading(false);
		}
	};

	const updateStats = async (campaignId: string) => {
		try {
			const stats = await apiClient.getCampaignStats(campaignId);
			setCampaignStats((prev) => ({
				...prev,
				[campaignId]: stats,
			}));
		} catch (err) {
			// Silently ignore stats update errors
		}
	};

	const handlePause = async (campaignId: string) => {
		try {
			await apiClient.pauseCampaign(campaignId);
			loadCampaigns();
		} catch (err: any) {
			setError(`Failed to pause campaign: ${err.message}`);
		}
	};

	const handleResume = async (campaignId: string) => {
		try {
			await apiClient.resumeCampaign(campaignId);
			loadCampaigns();
		} catch (err: any) {
			setError(`Failed to resume campaign: ${err.message}`);
		}
	};

	const selectedCampaign = campaigns.find((c) => c.id === selectedCampaignId);
	const selectedStats = selectedCampaignId ? campaignStats[selectedCampaignId] : null;

	const getStatusBadgeColor = (status: string): string => {
		switch (status) {
			case 'scheduled':
				return '#FF9800';
			case 'running':
				return '#2196F3';
			case 'paused':
				return '#FF5722';
			case 'completed':
				return '#4CAF50';
			case 'failed':
				return '#F44336';
			default:
				return '#999';
		}
	};

	const formatDate = (dateString: string): string => {
		const date = new Date(dateString);
		return date.toLocaleString();
	};

	return (
		<div style={{ display: 'flex', height: '100vh', backgroundColor: '#f5f5f5' }}>
			{/* Campaign List */}
			<div style={{ flex: 1, borderRight: '1px solid #ddd', overflow: 'auto' }}>
				<div style={{ padding: '20px' }}>
					<div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
						<h2>Campaigns</h2>
						<button
							onClick={onCreateClick}
							style={{
								padding: '10px 20px',
								backgroundColor: '#4CAF50',
								color: '#fff',
								border: 'none',
								borderRadius: '4px',
								cursor: 'pointer',
							}}
						>
							+ New Campaign
						</button>
					</div>

					{error && (
						<div style={{ padding: '10px', marginBottom: '20px', backgroundColor: '#fee', borderRadius: '4px', color: '#c33' }}>
							{error}
						</div>
					)}

					{loading ? (
						<div>Loading campaigns...</div>
					) : campaigns.length === 0 ? (
						<div style={{ color: '#999' }}>No campaigns yet. Create one to get started.</div>
					) : (
						<div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
							{campaigns.map((campaign) => (
								<div
									key={campaign.id}
									onClick={() => setSelectedCampaignId(campaign.id)}
									style={{
										padding: '15px',
										backgroundColor: selectedCampaignId === campaign.id ? '#e3f2fd' : '#fff',
										borderRadius: '4px',
										border: '1px solid #ddd',
										cursor: 'pointer',
										transition: 'background-color 0.2s',
									}}
								>
									<div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
										<div>
											<h4 style={{ margin: '0 0 8px 0' }}>{campaign.name}</h4>
											<small style={{ color: '#666', display: 'block' }}>
												Scheduled: {formatDate(campaign.scheduled_at)}
											</small>
										</div>
										<div
											style={{
												padding: '4px 12px',
												backgroundColor: getStatusBadgeColor(campaign.status),
												color: '#fff',
												borderRadius: '12px',
												fontSize: '12px',
												fontWeight: 'bold',
											}}
										>
											{campaign.status.toUpperCase()}
										</div>
									</div>

									{campaignStats[campaign.id] && (
										<div style={{ marginTop: '10px', display: 'flex', gap: '20px', fontSize: '12px' }}>
											<div>
												<strong>{campaignStats[campaign.id].sent}</strong> Sent
											</div>
											<div>
												<strong>{campaignStats[campaign.id].delivered}</strong> Delivered
											</div>
											<div>
												<strong>{campaignStats[campaign.id].read}</strong> Read
											</div>
											<div>
												<strong>{campaignStats[campaign.id].failed}</strong> Failed
											</div>
										</div>
									)}
								</div>
							))}
						</div>
					)}
				</div>
			</div>

			{/* Campaign Details */}
			{selectedCampaign && selectedStats && (
				<div style={{ flex: 1, padding: '20px', overflow: 'auto', backgroundColor: '#fff' }}>
					<h2>{selectedCampaign.name}</h2>

					<div style={{ marginBottom: '30px' }}>
						<h3>Campaign Details</h3>
						<div style={{ display: 'grid', gridTemplateColumns: '150px 1fr', gap: '15px', marginBottom: '20px' }}>
							<strong>Status:</strong>
							<div>
								<span
									style={{
										padding: '4px 12px',
										backgroundColor: getStatusBadgeColor(selectedCampaign.status),
										color: '#fff',
										borderRadius: '12px',
										fontSize: '14px',
									}}
								>
									{selectedCampaign.status.toUpperCase()}
								</span>
							</div>

							<strong>Scheduled:</strong>
							<div>{formatDate(selectedCampaign.scheduled_at)}</div>

							<strong>Created:</strong>
							<div>{formatDate(selectedCampaign.created_at)}</div>
						</div>

						{selectedCampaign.status === 'paused' && (
							<div style={{ padding: '15px', backgroundColor: '#fff3cd', borderRadius: '4px', marginBottom: '20px' }}>
								<strong>Paused:</strong> This campaign reached daily limits and is paused. It will resume automatically tomorrow.
							</div>
						)}

						{selectedCampaign.status === 'failed' && (
							<div style={{ padding: '15px', backgroundColor: '#f8d7da', borderRadius: '4px', marginBottom: '20px' }}>
								<strong>Failed:</strong> This campaign encountered an error. Please contact support.
							</div>
						)}

						<div style={{ display: 'flex', gap: '10px' }}>
							{selectedCampaign.status === 'running' && (
								<button
									onClick={() => handlePause(selectedCampaign.id)}
									style={{
										padding: '10px 20px',
										backgroundColor: '#FF5722',
										color: '#fff',
										border: 'none',
										borderRadius: '4px',
										cursor: 'pointer',
									}}
								>
									Pause
								</button>
							)}

							{selectedCampaign.status === 'paused' && (
								<button
									onClick={() => handleResume(selectedCampaign.id)}
									style={{
										padding: '10px 20px',
										backgroundColor: '#2196F3',
										color: '#fff',
										border: 'none',
										borderRadius: '4px',
										cursor: 'pointer',
									}}
								>
									Resume
								</button>
							)}

							{(selectedCampaign.status === 'scheduled' || selectedCampaign.status === 'running') && (
								<button
									onClick={() => handlePause(selectedCampaign.id)}
									style={{
										padding: '10px 20px',
										backgroundColor: '#FF5722',
										color: '#fff',
										border: 'none',
										borderRadius: '4px',
										cursor: 'pointer',
									}}
								>
									Pause
								</button>
							)}
						</div>
					</div>

					{/* Stats Dashboard */}
					<div>
						<h3>Campaign Statistics</h3>
						<div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '15px' }}>
							<StatCard label="Sent" value={selectedStats.sent} color="#2196F3" />
							<StatCard label="Delivered" value={selectedStats.delivered} color="#4CAF50" />
							<StatCard label="Read" value={selectedStats.read} color="#8BC34A" />
							<StatCard label="Failed" value={selectedStats.failed} color="#F44336" />
							<StatCard label="Pending" value={selectedStats.pending} color="#FF9800" />
						</div>

						<div style={{ marginTop: '20px', fontSize: '14px', color: '#666' }}>
							<p>Stats update in real-time as webhooks arrive from WhatsApp.</p>
						</div>
					</div>
				</div>
			)}

			{!selectedCampaign && (
				<div style={{ flex: 1, padding: '20px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#999' }}>
					Select a campaign to view details
				</div>
			)}
		</div>
	);
};

interface StatCardProps {
	label: string;
	value: number;
	color: string;
}

const StatCard: React.FC<StatCardProps> = ({ label, value, color }) => (
	<div
		style={{
			padding: '20px',
			backgroundColor: '#f5f5f5',
			borderRadius: '4px',
			textAlign: 'center',
			borderLeft: `4px solid ${color}`,
		}}
	>
		<div style={{ fontSize: '32px', fontWeight: 'bold', color }}>{value}</div>
		<div style={{ fontSize: '14px', color: '#666', marginTop: '5px' }}>{label}</div>
	</div>
);
