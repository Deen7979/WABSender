import React, { useEffect, useMemo, useState } from "react";
import "./TemplatesPage.css";

type Template = {
	id: string;
	name: string;
	language?: string;
	category?: string;
	status?: string;
	components?: Array<{ type: string; text?: string }>;
};

type TemplatesPageProps = {
	apiClient: any;
};

const getBodyPreview = (components?: Array<{ type: string; text?: string }>) => {
	if (!components) return "";
	const body = components.find((c) => c.type === "BODY");
	return body?.text || "";
};

const getStatusBadge = (status?: string) => {
	const statusClass = status ? `status-${status.toLowerCase()}` : "status-unknown";
	return <span className={`status-badge ${statusClass}`}>{status || "UNKNOWN"}</span>;
};

export const TemplatesPage: React.FC<TemplatesPageProps> = ({ apiClient }) => {
	const [templates, setTemplates] = useState<Template[]>([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [syncing, setSyncing] = useState(false);
	const [query, setQuery] = useState("");

	const loadTemplates = async () => {
		try {
			setLoading(true);
			setError(null);
			console.log("Loading templates...");
			const data = await apiClient.listTemplates();
			console.log("Templates loaded:", data);
			setTemplates(Array.isArray(data) ? data : []);
		} catch (err: any) {
			console.error("Failed to load templates:", err);
			setError(err.message || "Failed to load templates");
		} finally {
			setLoading(false);
		}
	};

	useEffect(() => {
		loadTemplates();
	}, [apiClient]);

	const handleSync = async () => {
		try {
			setSyncing(true);
			setError(null);
			console.log("Syncing templates...");
			await apiClient.syncTemplates();
			console.log("Templates synced, reloading...");
			await loadTemplates();
		} catch (err: any) {
			console.error("Failed to sync templates:", err);
			setError(err.message || "Failed to sync templates");
		} finally {
			setSyncing(false);
		}
	};

	const filteredTemplates = useMemo(() => {
		const q = query.trim().toLowerCase();
		if (!q) return templates;
		return templates.filter((t) =>
			[t.name, t.language, t.category, t.status]
				.filter(Boolean)
				.some((value) => String(value).toLowerCase().includes(q))
		);
	}, [templates, query]);

	return (
		<div className="templates-page">
			<div className="templates-header">
				<div>
					<h2>Templates</h2>
					<p>View and sync WhatsApp message templates.</p>
				</div>
				<div className="templates-actions">
					<input
						value={query}
						onChange={(e) => setQuery(e.target.value)}
						placeholder="Search templates"
						aria-label="Search templates"
					/>
					<button onClick={handleSync} disabled={syncing}>
						{syncing ? "Syncing..." : "Sync Templates"}
					</button>
				</div>
			</div>

			{error && <div className="templates-error">{error}</div>}

			{loading ? (
				<div className="templates-loading">Loading templates...</div>
			) : (
				<div className="templates-table">
					<div className="templates-row templates-row--header">
						<div>Name</div>
						<div>Language</div>
						<div>Status</div>
						<div>Category</div>
						<div>Preview</div>
					</div>
					{filteredTemplates.length === 0 ? (
						<div className="templates-empty">No templates found.</div>
					) : (
						filteredTemplates.map((template) => (
							<div className="templates-row" key={template.id}>
								<div className="templates-name">{template.name}</div>
								<div>{template.language || "und"}</div>
								<div>{getStatusBadge(template.status)}</div>
								<div>{template.category || "UNKNOWN"}</div>
								<div className="templates-preview">
									{getBodyPreview(template.components) || "-"}
								</div>
							</div>
						))
					)}
				</div>
			)}
		</div>
	);
};
