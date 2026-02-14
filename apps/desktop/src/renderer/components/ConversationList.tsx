import React, { useState, useEffect, useCallback } from "react";
import "./ConversationList.css";

type Conversation = {
	id: string;
	contact_id: string;
	phone_e164: string;
	name: string | null;
	last_message_at: string;
	unread_count: number;
	created_at: string;
};

type ConversationListProps = {
	apiClient: any;
	wsClient: any;
	onSelectConversation: (conversationId: string) => void;
	selectedConversationId: string | null;
};

export const ConversationList: React.FC<ConversationListProps> = React.memo(({
	apiClient,
	wsClient,
	onSelectConversation,
	selectedConversationId,
}: ConversationListProps) => {
	const [conversations, setConversations] = useState<Conversation[]>([]);
	const [filter, setFilter] = useState<"all" | "unread" | "closed">("all");
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);

	const loadConversations = async () => {
		try {
			setLoading(true);
			setError(null);
			const response = await apiClient.listConversations({ limit: 100 });
			setConversations(response.conversations || []);
		} catch (err: any) {
			setError(err.message || "Failed to load conversations");
		} finally {
			setLoading(false);
		}
	};

	useEffect(() => {
		loadConversations();

		// Listen for real-time updates only if wsClient exists
		if (!wsClient) {
			return;
		}

		const handleMessageReceived = (payload: any) => {
			// Only update if this conversation is in our list and move it to top
			setConversations((prev) => {
				const existingIndex = prev.findIndex(conv => conv.id === payload.conversationId);
				if (existingIndex === -1) {
					// New conversation, reload the list
					loadConversations();
					return prev;
				}
				
				// Move existing conversation to top with updated timestamp
				const updatedConv = { ...prev[existingIndex], last_message_at: new Date().toISOString() };
				const newList = [updatedConv, ...prev.filter((_, i) => i !== existingIndex)];
				return newList;
			});
		};

		const handleUnreadUpdated = (payload: any) => {
			// Update only the specific conversation without full reload
			setConversations((prev) =>
				prev.map((conv) =>
					conv.id === payload.conversationId
						? { ...conv, last_message_at: payload.lastMessageAt, unread_count: payload.unreadCount || 0 }
						: conv
				)
			);
		};

		if (wsClient.addEventListener) {
			wsClient.addEventListener("message:received", handleMessageReceived);
			wsClient.addEventListener("conversation:unread_updated", handleUnreadUpdated);

			return () => {
				wsClient.removeEventListener("message:received", handleMessageReceived);
				wsClient.removeEventListener("conversation:unread_updated", handleUnreadUpdated);
			};
		} else if (wsClient.on) {
			wsClient.on("message:received", handleMessageReceived);
			wsClient.on("conversation:unread_updated", handleUnreadUpdated);

			return () => {
				wsClient.off("message:received", handleMessageReceived);
				wsClient.off("conversation:unread_updated", handleUnreadUpdated);
			};
		}
	}, [apiClient, wsClient]);

	const filteredConversations = conversations.filter((conv) => {
		if (filter === "unread") return conv.unread_count > 0;
		if (filter === "closed") return false; // TODO: Add status field
		return true;
	});

	const formatTimestamp = (isoString: string) => {
		const date = new Date(isoString);
		const now = new Date();
		const diffMs = now.getTime() - date.getTime();
		const diffMins = Math.floor(diffMs / 60000);
		const diffHours = Math.floor(diffMs / 3600000);
		const diffDays = Math.floor(diffMs / 86400000);

		if (diffMins < 1) return "Just now";
		if (diffMins < 60) return `${diffMins}m ago`;
		if (diffHours < 24) return `${diffHours}h ago`;
		if (diffDays < 7) return `${diffDays}d ago`;
		return date.toLocaleDateString();
	};

	if (loading) {
		return (
			<div className="conversation-list">
				<div className="conversation-list-header">
					<h2>Inbox</h2>
				</div>
				<div className="loading">Loading conversations...</div>
			</div>
		);
	}

	if (error) {
		return (
			<div className="conversation-list">
				<div className="conversation-list-header">
					<h2>Inbox</h2>
				</div>
				<div className="error">{error}</div>
				<button onClick={loadConversations}>Retry</button>
			</div>
		);
	}

	return (
		<div className="conversation-list">
			<div className="conversation-list-header">
				<h2>Inbox</h2>
				<div className="filter-tabs">
					<button
						className={filter === "all" ? "active" : ""}
						onClick={() => setFilter("all")}
					>
						All ({conversations.length})
					</button>
					<button
						className={filter === "unread" ? "active" : ""}
						onClick={() => setFilter("unread")}
					>
						Unread ({conversations.filter((c) => c.unread_count > 0).length})
					</button>
				</div>
			</div>

			<div className="conversation-items">
				{filteredConversations.length === 0 && (
					<div className="empty-state">
						{filter === "unread" ? "No unread conversations" : "No conversations yet"}
					</div>
				)}

				{filteredConversations.map((conv) => (
					<div
						key={conv.id}
						className={`conversation-item ${
							selectedConversationId === conv.id ? "selected" : ""
						} ${conv.unread_count > 0 ? "unread" : ""}`}
						onClick={() => onSelectConversation(conv.id)}
					>
						<div className="conversation-avatar">
							{conv.name?.[0]?.toUpperCase() || conv.phone_e164[1]}
						</div>
						<div className="conversation-info">
							<div className="conversation-header-row">
								<span className="conversation-name">
									{conv.name || conv.phone_e164}
								</span>
								<span className="conversation-time">
									{formatTimestamp(conv.last_message_at)}
								</span>
							</div>
							<div className="conversation-preview-row">
								<span className="conversation-phone">{conv.phone_e164}</span>
								{conv.unread_count > 0 && (
									<span className="unread-badge">{conv.unread_count}</span>
								)}
							</div>
						</div>
					</div>
				))}
			</div>
		</div>
	);
});
