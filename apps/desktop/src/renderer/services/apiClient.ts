type Tokens = { accessToken: string; refreshToken: string };

export const createApiClient = (
	baseUrl: string,
	getToken: () => string | null,
	getOrgContextId?: () => string | null
) => {
	const request = async <T>(path: string, options: RequestInit = {}): Promise<T> => {
		const token = getToken() || localStorage.getItem("accessToken");
		const orgContextId = getOrgContextId ? getOrgContextId() : null;
		const headers: Record<string, string> = {
			...(options.headers instanceof Headers 
				? Object.fromEntries(options.headers.entries())
				: options.headers as Record<string, string> || {})
		};
		if (token) {
			headers["Authorization"] = `Bearer ${token}`;
		}
		if (orgContextId) {
			headers["X-Org-Id"] = orgContextId;
		}
		const response = await fetch(`${baseUrl}${path}`, { 
			...options, 
			headers 
		});
		if (!response.ok) {
			const text = await response.text();
			try {
				const parsed = JSON.parse(text) as { error?: string; message?: string };
				throw new Error(parsed.error || parsed.message || "Request failed");
			} catch {
				throw new Error(text || "Request failed");
			}
		}
		return (await response.json()) as T;
	};

	return {
		login: (email: string, password: string) =>
			request<Tokens>("/auth/login", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ email, password })
			}),
		register: (orgName: string, email: string, password: string) =>
			request<Tokens>("/auth/register", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ orgName, email, password })
			}),
		refresh: (refreshToken: string) =>
			request<Tokens>("/auth/refresh", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ refreshToken })
			}),
		activateLicense: (licenseKey: string, deviceId: string, deviceLabel?: string) =>
			request("/license/activate", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ licenseKey, deviceId, deviceLabel })
			}),
		validateLicense: (deviceId: string) =>
			request("/license/validate", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ deviceId })
			}),
		getOrgProfile: () => request("/orgs/me"),
		listPlatformOrgs: () => request("/api/platform/orgs"),
		listPlatformUsers: () => request("/api/platform/users"),
		listPlatformLicenses: () => request("/api/platform/licenses"),
		platformIssueLicense: (payload: { orgId: string; planCode?: string; maxDevices?: number; expiresAt?: string }) =>
			request("/api/platform/licenses/issue", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(payload)
			}),
		platformActivateLicense: (payload: { licenseKey: string; deviceId: string; orgId: string; deviceLabel?: string }) =>
			request("/api/platform/licenses/activate", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(payload)
			}),
		issueLicense: (payload: { planCode?: string; maxDevices?: number; expiresAt?: string; metadata?: Record<string, unknown> }) =>
			request("/license/admin/issue", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(payload)
			}),
		listLicenses: () => request("/license/admin/licenses"),
		listLicenseActivations: (licenseId: string) => request(`/license/admin/licenses/${licenseId}/activations`),
		revokeLicense: (licenseId: string) =>
			request("/license/admin/revoke", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ licenseId })
			}),
		deactivateActivation: (activationId: string) =>
			request("/license/admin/deactivate", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ activationId })
			}),
		// Meta OAuth endpoints
		initMetaOAuth: () =>
			request("/auth/meta-oauth/init", {
				method: "GET"
			}),
		getMetaOAuthStatus: () =>
			request("/auth/meta-oauth/status", {
				method: "GET"
			}),
		disconnectMetaOAuth: () =>
			request("/auth/meta-oauth/disconnect", {
				method: "POST",
				headers: { "Content-Type": "application/json" }
			}),
		get: (path: string) =>
			request(path, { method: "GET" }),
		post: (path: string, body: any) =>
			request(path, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(body)
			}),
		listContacts: () => request("/contacts"),
		importContacts: (file: File) => {
			const form = new FormData();
			form.append("file", file);
			return request("/contacts/import", { method: "POST", body: form });
		},
		listTemplates: () => request("/templates"),
		syncTemplates: () => request("/templates/sync", { method: "POST" }),
		sendMessage: (payload: { contactId: string; templateId?: string; messageBody?: string; variables?: Record<string, string>; mediaUrl?: string }) =>
			request("/messages/send", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(payload)
			}),
		createOptInEvent: (payload: { contactId: string; eventType: "opt_in" | "opt_out"; source: string }) =>
			request("/opt-in", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(payload)
			}),
		listWhatsAppAccounts: () => request("/whatsapp-accounts"),
		upsertWhatsAppAccount: (payload: { phoneNumberId: string; wabaId: string; displayPhoneNumber?: string; isActive?: boolean }) =>
			request("/whatsapp-accounts", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(payload)
			}),
		// Campaign API endpoints
		listCampaigns: () => request("/campaigns"),
		createCampaign: (payload: { name: string; templateId: string; recipients: Array<{ contactId: string; templateParams?: Record<string, any> }> }) =>
			request("/campaigns", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(payload)
			}),
		scheduleCampaign: (campaignId: string, payload: { scheduledAt: string; idempotencyKey: string; whatsappAccountId: string }) =>
			request(`/campaigns/${campaignId}/schedule`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(payload)
			}),
		pauseCampaign: (campaignId: string) =>
			request(`/campaigns/${campaignId}/pause`, {
				method: "POST",
				headers: { "Content-Type": "application/json" }
			}),
		resumeCampaign: (campaignId: string) =>
			request(`/campaigns/${campaignId}/resume`, {
				method: "POST",
				headers: { "Content-Type": "application/json" }
			}),
		getCampaignStats: (campaignId: string) =>
			request(`/campaigns/${campaignId}/stats`),
		
		// Conversation API endpoints (Phase 3.3)
		listConversations: (params?: { limit?: number; offset?: number }) =>
			request(`/conversations?limit=${params?.limit || 20}&offset=${params?.offset || 0}`),
		getConversation: (conversationId: string) =>
			request(`/conversations/${conversationId}`),
		getMessages: (conversationId: string, params?: { limit?: number; offset?: number }) =>
			request(`/conversations/${conversationId}/messages?limit=${params?.limit || 50}&offset=${params?.offset || 0}`),
		sendReply: (conversationId: string, payload: { type: "text" | "template"; text?: string; templateId?: string; variables?: Record<string, string>; mediaUrl?: string }) =>
			request(`/conversations/${conversationId}/reply`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(payload)
			}),
		markConversationAsRead: (conversationId: string) =>
			request(`/conversations/${conversationId}/read`, {
				method: "POST",
				headers: { "Content-Type": "application/json" }
			}),
		closeConversation: (conversationId: string, autoReopenOnReply: boolean = true) =>
			request(`/conversations/${conversationId}/close`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ autoReopenOnReply })
			}),
		archiveConversation: (conversationId: string) =>
			request(`/conversations/${conversationId}/archive`, {
				method: "POST",
				headers: { "Content-Type": "application/json" }
			})
	};
};
