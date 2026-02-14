import * as React from "react";
import "./ConversationDetail.css";

type Message = {
	id: string;
	direction: "inbound" | "outbound";
	body: string;
	status: "received" | "sent" | "delivered" | "read" | "failed";
	meta_message_id: string;
	created_at: string;
};

type Conversation = {
	id: string;
	contact_id: string;
	phone_e164: string;
	name: string | null;
	last_message_at: string;
	created_at: string;
	status: "active" | "closed" | "archived";
};

type ConversationDetailProps = {
	conversationId: string;
	apiClient: any;
	wsClient: any;
	onClose: () => void;
};

export const ConversationDetail: React.FC<ConversationDetailProps> = ({
	conversationId,
	apiClient,
	wsClient,
	onClose,
}) => {
	const [conversation, setConversation] = React.useState<Conversation | null>(null);
	const [messages, setMessages] = React.useState<Message[]>([]);
	const [loading, setLoading] = React.useState(true);
	const [error, setError] = React.useState<string | null>(null);
	const messagesEndRef = React.useRef<HTMLDivElement>(null);
	const messagesContainerRef = React.useRef<HTMLDivElement>(null);
	const [shouldAutoScroll, setShouldAutoScroll] = React.useState(true);

	const isNearBottom = () => {
		const container = messagesContainerRef.current;
		if (!container) {
			return true;
		}
		const threshold = 80;
		const distanceFromBottom =
			container.scrollHeight - container.scrollTop - container.clientHeight;
		return distanceFromBottom <= threshold;
	};

	const loadConversation = async () => {
		try {
			setLoading(true);
			setError(null);
			const [convData, messagesData] = await Promise.all([
				apiClient.getConversation(conversationId),
				apiClient.getMessages(conversationId, { limit: 100 }),
			]);
			setConversation(convData);
			setMessages((messagesData.messages || []).sort((a, b) =>
				new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
			));
		} catch (err: any) {
			setError(err.message || "Failed to load conversation");
		} finally {
			setLoading(false);
		}
	};

	React.useEffect(() => {
		loadConversation();

		// Listen for new messages in this conversation
		const handleMessageReceived = (payload: any) => {
			if (payload.conversationId === conversationId) {
				const shouldScroll = isNearBottom();
				setMessages((prev) => [
					...prev,
					{
						id: payload.messageId,
						direction: "inbound",
						body: payload.body,
						status: "received",
						meta_message_id: payload.messageId,
						created_at: payload.timestamp,
					},
				]);

				// Auto-mark as read
				apiClient.markConversationAsRead(conversationId);
				
				// Set flag to auto-scroll for new messages
				setShouldAutoScroll(shouldScroll);
			}
		};

		const handleMessageStatus = (payload: any) => {
			// Update message status without triggering scroll
			setMessages((prev) =>
				prev.map((msg) =>
					msg.id === payload.messageId ? { ...msg, status: payload.status } : msg
				)
			);
		};

		if (!wsClient) {
			console.warn("WebSocket client not available");
			return;
		}

		if (wsClient.addEventListener) {
			wsClient.addEventListener("message:received", handleMessageReceived);
			wsClient.addEventListener("message:status", handleMessageStatus);

			return () => {
				wsClient.removeEventListener("message:received", handleMessageReceived);
				wsClient.removeEventListener("message:status", handleMessageStatus);
			};
		}

		if (wsClient.on) {
			wsClient.on("message:received", handleMessageReceived);
			wsClient.on("message:status", handleMessageStatus);

			return () => {
				wsClient.off("message:received", handleMessageReceived);
				wsClient.off("message:status", handleMessageStatus);
			};
		}
	}, [conversationId, apiClient, wsClient]);

	React.useEffect(() => {
		if (!shouldAutoScroll) {
			return;
		}
		if (messagesEndRef.current) {
			messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
			setShouldAutoScroll(false);
		}
	}, [messages, shouldAutoScroll]);

	const handleCloseConversation = async () => {
		try {
			await apiClient.closeConversation(conversationId);
			onClose();
		} catch (err: any) {
			alert(`Failed to close conversation: ${err.message}`);
		}
	};

	const handleArchiveConversation = async () => {
		try {
			await apiClient.archiveConversation(conversationId);
			onClose();
		} catch (err: any) {
			alert(`Failed to archive conversation: ${err.message}`);
		}
	};

	const getStatusIcon = (status: string) => {
		switch (status) {
			case "sent":
				return "✓";
			case "delivered":
				return "✓✓";
			case "read":
				return "🔵";
			case "failed":
				return "❌";
			default:
				return "";
		}
	};

	const formatMessageTime = (dateStr: string): string => {
		return new Date(dateStr).toLocaleTimeString([], {
			hour: "2-digit",
			minute: "2-digit",
		});
	};

	const getStatusColor = (status: string): string => {
		switch (status) {
			case "received":
				return "#999";
			case "sent":
				return "#666";
			case "delivered":
				return "#4CAF50";
			case "read":
				return "#2196F3";
			case "failed":
				return "#F44336";
			default:
				return "#999";
		}
	};

	if (loading) {
		return (
			<div className="conversation-detail">
				<div className="loading">Loading conversation...</div>
			</div>
		);
	}

	if (error || !conversation) {
		return (
			<div className="conversation-detail">
				<div className="error">{error || "Conversation not found"}</div>
			</div>
		);
	}

	return (
		<div className="conversation-detail">
			<div className="conversation-header">
				<div className="contact-info">
					<div className="contact-avatar">
						{conversation.name?.[0]?.toUpperCase() || conversation.phone_e164[1]}
					</div>
					<div>
						<div className="contact-name">
							{conversation.name || conversation.phone_e164}
						</div>
						<div className="contact-phone">{conversation.phone_e164}</div>
					</div>
				</div>
				<div className="conversation-actions">
					<button
						className="action-button archive-button"
						onClick={handleArchiveConversation}
						title="Archive conversation"
					>
						📁
					</button>
					<button
						className="action-button close-button"
						onClick={handleCloseConversation}
						title="Close conversation"
					>
						✖
					</button>
				</div>
			</div>

			<div
				className="messages-container"
				ref={messagesContainerRef}
				onScroll={() => setShouldAutoScroll(isNearBottom())}
			>
				{messages.length === 0 && (
					<div className="empty-state">No messages yet</div>
				)}

				{messages.map((msg) => (
					<div
						key={msg.id}
						className={`message ${msg.direction === "inbound" ? "inbound" : "outbound"}`}
					>
						<div className="message-bubble">
							<div className="message-body">{msg.body}</div>
							<div className="message-meta">
								<span className="message-time">{formatMessageTime(msg.created_at)}</span>
								{msg.direction === "outbound" && (
									<span
										className="message-status"
										style={{ color: getStatusColor(msg.status) }}
									>
										{getStatusIcon(msg.status)}
									</span>
								)}
							</div>
						</div>
					</div>
				))}
				<div ref={messagesEndRef} />
			</div>
		</div>
	);
};
