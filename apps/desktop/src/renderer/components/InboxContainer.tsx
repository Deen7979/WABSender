import React, { useState } from "react";
import { ConversationList } from "./ConversationList";
import { ConversationDetail } from "./ConversationDetail";
import { MessageInput } from "./MessageInput";
import "./InboxContainer.css";

type ConversationSummary = {
	id: string;
	contact_id: string;
	phone_e164: string;
	name: string | null;
};

type InboxContainerProps = {
	apiClient: any;
	wsClient: any;
};

export const InboxContainer: React.FC<InboxContainerProps> = ({
	apiClient,
	wsClient,
}) => {
	const [selectedConversationId, setSelectedConversationId] = useState<string | null>(
		null
	);
	const [selectedConversation, setSelectedConversation] = useState<ConversationSummary | null>(
		null
	);
	const [templates, setTemplates] = useState<Array<{ id: string; name: string; status?: string; components?: any }>>([]);

	// Load templates on mount
	React.useEffect(() => {
		if (!apiClient) return;
		const loadTemplates = async () => {
			try {
				const data = await apiClient.listTemplates();
				setTemplates(data || []);
			} catch (err: any) {
				console.error("Failed to load templates:", err.message || err);
			}
		};
		loadTemplates();
	}, [apiClient]);

	const handleSelectConversation = async (conversationId: string) => {
		setSelectedConversationId(conversationId);
		try {
			const conversation = await apiClient.getConversation(conversationId);
			setSelectedConversation(conversation);
		} catch (err: any) {
			console.error("Failed to load conversation summary:", err.message || err);
			setSelectedConversation(null);
		}
	};

	const handleCloseConversation = () => {
		setSelectedConversationId(null);
		setSelectedConversation(null);
	};

	return (
		<div className="inbox-container">
			<div className="inbox-list-panel">
				<ConversationList
					apiClient={apiClient}
					wsClient={wsClient}
					onSelectConversation={handleSelectConversation}
					selectedConversationId={selectedConversationId}
				/>
			</div>

			<div className="inbox-detail-panel">
				{selectedConversationId ? (
					<>
						<ConversationDetail
							conversationId={selectedConversationId}
							apiClient={apiClient}
							wsClient={wsClient}
							onClose={handleCloseConversation}
						/>
						<MessageInput
							conversationId={selectedConversationId}
							contactId={selectedConversation?.contact_id}
							contactName={selectedConversation?.name}
							contactPhone={selectedConversation?.phone_e164}
							apiClient={apiClient}
							templates={templates}
							onMessageSent={() => {
								// Trigger a reload in ConversationDetail via WebSocket or manual refresh
							}}
						/>
					</>
				) : (
					<div className="inbox-empty-state">
						<div className="empty-icon">💬</div>
						<h3>Select a conversation</h3>
						<p>Choose a conversation from the list to view messages and reply</p>
					</div>
				)}
			</div>
		</div>
	);
};
