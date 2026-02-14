import React, { useState } from 'react';
import { CampaignCreate } from './CampaignCreate';
import { CampaignList } from './CampaignList';
import { RecipientTable } from './RecipientTable';

interface CampaignContainerProps {
	apiClient: any;
	wsClient: any;
}

export const CampaignContainer: React.FC<CampaignContainerProps> = ({ apiClient, wsClient }) => {
	const [view, setView] = useState<'list' | 'create' | 'details'>('list');
	const [selectedCampaignId, setSelectedCampaignId] = useState<string | null>(null);

	if (view === 'create') {
		return (
			<CampaignCreate
				apiClient={apiClient}
				onSuccess={() => setView('list')}
				onCancel={() => setView('list')}
			/>
		);
	}

	if (view === 'details' && selectedCampaignId) {
		return (
			<div style={{ padding: '20px' }}>
				<button
					onClick={() => {
						setView('list');
						setSelectedCampaignId(null);
					}}
					style={{
						marginBottom: '20px',
						padding: '10px 20px',
						backgroundColor: '#f5f5f5',
						border: '1px solid #ddd',
						borderRadius: '4px',
						cursor: 'pointer',
					}}
				>
					← Back to Campaigns
				</button>
				<RecipientTable campaignId={selectedCampaignId} apiClient={apiClient} wsClient={wsClient} />
			</div>
		);
	}

	return (
		<CampaignList
			apiClient={apiClient}
			wsClient={wsClient}
			onCreateClick={() => setView('create')}
		/>
	);
};
