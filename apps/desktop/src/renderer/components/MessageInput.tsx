import React, { useState } from "react";
import "./MessageInput.css";

type Template = {
	id: string;
	name: string;
	status?: "APPROVED" | "PENDING_REVIEW" | "REJECTED" | "PAUSED" | "DISABLED";
	components?: Array<{ type: string; text?: string }>;
};

type MessageInputProps = {
	conversationId: string;
	contactId?: string;
	contactName?: string | null;
	contactPhone?: string | null;
	apiClient: any;
	templates?: Template[];
	onMessageSent?: () => void;
};

export const MessageInput: React.FC<MessageInputProps> = React.memo(({
	conversationId,
	contactId,
	contactName,
	contactPhone,
	apiClient,
	templates = [],
	onMessageSent,
}: MessageInputProps) => {
	const [mode, setMode] = useState<"text" | "template">("text");
	const [text, setText] = useState("");
	const [selectedTemplateId, setSelectedTemplateId] = useState("");
	const [templateVariablesRaw, setTemplateVariablesRaw] = useState("");
	const [sending, setSending] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [success, setSuccess] = useState(false);

	// Determine if send button should be enabled
	const canSend = mode === "text" 
		? text.trim().length > 0 && !sending && !!contactId
		: selectedTemplateId && !sending && !!contactId;

	const approvedTemplates = templates.filter(
		(t) => !t.status || t.status === "APPROVED"
	);
	const selectedTemplate = approvedTemplates.find((t) => t.id === selectedTemplateId);

	const handleSendText = async () => {
		if (!text.trim()) {
			setError("Message cannot be empty");
			return;
		}

		if (!contactId) {
			setError("Contact is required to send a message");
			return;
		}

		try {
			setSending(true);
			setError(null);
			await apiClient.sendMessage({
				contactId,
				messageBody: text.trim(),
			});
			setText("");
			setSuccess(true);
			setTimeout(() => setSuccess(false), 2000);
			onMessageSent?.();
		} catch (err: any) {
			setError(err.message || "Failed to send message");
		} finally {
			setSending(false);
		}
	};

	const handleSendTemplate = async () => {
		if (!selectedTemplateId) {
			setError("Please select a template");
			return;
		}

		if (!contactId) {
			setError("Contact is required to send a message");
			return;
		}

		try {
			setSending(true);
			setError(null);

			const values = templateVariablesRaw
				.split(",")
				.map((v) => v.trim())
				.filter((v) => v.length > 0);

			const variables = values.reduce<Record<string, string>>((acc, value, index) => {
				acc[String(index + 1)] = value;
				return acc;
			}, {});

			await apiClient.sendMessage({
				contactId,
				templateId: selectedTemplateId,
				variables,
			});
			setSelectedTemplateId("");
			setTemplateVariablesRaw("");
			setSuccess(true);
			setTimeout(() => setSuccess(false), 2000);
			onMessageSent?.();
		} catch (err: any) {
			setError(err.message || "Failed to send template");
		} finally {
			setSending(false);
		}
	};

	const handleKeyPress = (e: React.KeyboardEvent) => {
		if (e.key === "Enter" && !e.shiftKey) {
			e.preventDefault();
			if (mode === "text") {
				handleSendText();
			} else {
				handleSendTemplate();
			}
		}
	};

	const charCount = text.length;
	const maxChars = 4096;

	return (
		<div className="message-input">
			<div className="input-mode-toggle">
				<button
					className={mode === "text" ? "active" : ""}
					onClick={() => setMode("text")}
					disabled={sending}
				>
					Text
				</button>
				<button
					className={mode === "template" ? "active" : ""}
					onClick={() => setMode("template")}
					disabled={sending || approvedTemplates.length === 0}
				>
					Template
				</button>
			</div>

			{error && <div className="input-error">{error}</div>}
			{success && <div className="input-success">Message sent!</div>}

			{mode === "text" ? (
				<div className="text-input-area">
					<textarea
						value={text}
						onChange={(e) => setText(e.target.value)}
						onKeyPress={handleKeyPress}
						placeholder={`Message to ${contactName || contactPhone || "contact"}...`}
						disabled={sending || !contactId}
						maxLength={maxChars}
					/>
					<div className="input-footer">
						<span className="char-counter">
							{charCount} / {maxChars}
						</span>
						<button
							onClick={handleSendText}
							disabled={!canSend}
							className="btn-send"
						>
							{sending ? "Sending..." : "Send"}
						</button>
					</div>
				</div>
			) : (
				<div className="template-input-area">
					{approvedTemplates.length === 0 ? (
						<div className="input-error">No APPROVED templates available</div>
					) : (
						<>
							<select
								value={selectedTemplateId}
								onChange={(e) => {
									setSelectedTemplateId(e.target.value);
									setTemplateVariablesRaw("");
									setError(null); // Clear any previous errors
								}}
								disabled={sending}
								aria-label="Select template"
							>
								<option value="">Select template...</option>
								{approvedTemplates.map((tpl) => (
									<option key={tpl.id} value={tpl.id}>
										{tpl.name}
									</option>
								))}
							</select>

							{selectedTemplateId && (
								<div className="template-variables">
									<label>Variables (comma-separated):</label>
									<input
										type="text"
										placeholder="value1, value2"
										value={templateVariablesRaw}
										onChange={(e) => setTemplateVariablesRaw(e.target.value)}
										disabled={sending}
									/>
									{selectedTemplate && (
										<p className="template-hint">
											Using template: {selectedTemplate.name}
										</p>
									)}
								</div>
							)}

							<div className="input-footer">
								<button
									onClick={handleSendTemplate}
									disabled={!canSend}
									className="btn-send"
								>
									{sending ? "Sending..." : selectedTemplateId ? "Send Template" : "Select Template"}
								</button>
							</div>
						</>
					)}
				</div>
			)}
		</div>
	);
});
