/**
 * Inbox Component
 * 
 * Displays list of conversations with:
 * - Contact name / phone number
 * - Last message preview
 * - Unread badge
 * - Delivery status indicators
 * - Last message timestamp
 */

import React, { useState, useEffect } from "react";
import "./Inbox.css";

interface ConversationPreview {
	id: string;
	contactId: string;
	contactName: string | null;
	contactPhone: string;
	lastMessage: string | null;
	lastMessageAt: string;
	unreadCount: number;
	status: "active" | "closed" | "archived";
	deliveryStatus?: "sent" | "delivered" | "read" | "failed";
}

interface InboxProps {
	apiClient?: any;
	onSelectConversation?: (conversationId: string) => void;
	selectedConversationId?: string | null;
}

export const Inbox: React.FC<InboxProps> = ({
	apiClient,
	onSelectConversation,
	selectedConversationId,
}) => {
	const [conversations, setConversations] = useState<ConversationPreview[]>([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [filter, setFilter] = useState<"active" | "closed" | "all">("active");

	useEffect(() => {
		fetchConversations();
	}, []);

	const fetchConversations = async () => {
		try {
			setLoading(true);
			if (!apiClient) {
				setError("API client not initialized");
				return;
			}

			const response = await apiClient.get("/conversations");
			const data = response as { conversations: ConversationPreview[] };
			
			// Sort by most recent first
			const sorted = (data.conversations || []).sort(
				(a, b) => new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime()
			);
			
			setConversations(sorted);
			setError(null);
		} catch (err: any) {
			setError(err.message || "Failed to fetch conversations");
		} finally {
			setLoading(false);
		}
	};

	const filteredConversations = conversations.filter((conv) => {
		if (filter === "all") return true;
		return conv.status === filter;
	});

	const handleSelectConversation = (conversationId: string) => {
		onSelectConversation?.(conversationId);
	};

	const getStatusColor = (status: string | undefined): string => {
		switch (status) {
			case "read":
				return "#10b981"; // green
			case "delivered":
				return "#3b82f6"; // blue
			case "sent":
				return "#8b5cf6"; // purple
			case "failed":
				return "#ef4444"; // red
			default:
				return "#9ca3af"; // gray
		}
	};

	const formatTime = (timestamp: string): string => {
		const date = new Date(timestamp);
		const now = new Date();
		const diffMs = now.getTime() - date.getTime();
		const diffMins = Math.floor(diffMs / 60000);
		const diffHours = Math.floor(diffMins / 60);
		const diffDays = Math.floor(diffHours / 24);

		if (diffMins < 1) return "just now";
		if (diffMins < 60) return `${diffMins}m ago`;
		if (diffHours < 24) return `${diffHours}h ago`;
		if (diffDays < 7) return `${diffDays}d ago`;
		return date.toLocaleDateString();
	};

	if (loading) {
		return (
			<div className="inbox">
				<div className="loading">Loading conversations...</div>
			</div>
		);
	}

	return (
		<div className="inbox">
			<div className="inbox-header">
				<h2>Inbox</h2>
				<div className="filter-buttons">
					<button
						className={`filter-btn ${filter === "active" ? "active" : ""}`}
						onClick={() => setFilter("active")}
					>
						Active
					</button>
					<button
						className={`filter-btn ${filter === "closed" ? "active" : ""}`}
						onClick={() => setFilter("closed")}
					>
						Closed
					</button>
					<button
						className={`filter-btn ${filter === "all" ? "active" : ""}`}
						onClick={() => setFilter("all")}
					>
						All
					</button>
				</div>
			</div>

			{error && <div className="error-message">{error}</div>}

			<div className="conversations-list">
				{filteredConversations.length === 0 ? (
					<div className="empty-state">
						<p>No conversations yet</p>
						<p className="subtitle">Messages will appear here when contacts reply</p>
					</div>
				) : (
					filteredConversations.map((conv) => (
						<div
							key={conv.id}
							className={`conversation-item ${
								selectedConversationId === conv.id ? "selected" : ""
							} ${conv.status}`}
							onClick={() => handleSelectConversation(conv.id)}
						>
							{/* Avatar */}
							<div className="conversation-avatar">
								{(conv.contactName || conv.contactPhone)
									.charAt(0)
									.toUpperCase()}
							</div>

							{/* Content */}
							<div className="conversation-content">
								<div className="conversation-header">
									<h3 className="contact-name">
										{conv.contactName || conv.contactPhone}
									</h3>
									<span className="last-time">
										{formatTime(conv.lastMessageAt)}
									</span>
								</div>

								<div className="conversation-preview">
									<p className="last-message">
										{conv.lastMessage || "(No message preview)"}
									</p>
									{conv.unreadCount > 0 && (
										<span className="unread-badge">{conv.unreadCount}</span>
									)}
								</div>

								{conv.deliveryStatus && (
									<div className="status-indicator">
										<span
											className="status-dot"
											style={{
												backgroundColor: getStatusColor(conv.deliveryStatus),
											}}
										/>
										<span className="status-text">
											{conv.deliveryStatus === "read"
												? "✓ Read"
												: conv.deliveryStatus === "delivered"
												? "✓✓ Delivered"
												: conv.deliveryStatus === "sent"
												? "✓ Sent"
												: "Failed"}
										</span>
									</div>
								)}
							</div>

							{/* Status badge */}
							<div className={`status-badge ${conv.status}`}>
								{conv.status === "closed" ? "Closed" : "Active"}
							</div>
						</div>
					))
				)}
			</div>
		</div>
	);
};
