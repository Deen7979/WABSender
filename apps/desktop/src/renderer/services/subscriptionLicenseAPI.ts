/**
 * Subscription License API Client
 * 
 * API client methods for the new subscription-based license system
 */

// Add these methods to your existing apiClient.ts or create a new module

export const subscriptionLicenseAPI = {
	/**
	 * Get all license plans
	 */
	getSubscriptionPlans: async (baseUrl: string, token: string) => {
		const response = await fetch(`${baseUrl}/subscription/plans`, {
			method: 'GET',
			headers: {
				'Authorization': `Bearer ${token}`,
				'Content-Type': 'application/json'
			}
		});

		if (!response.ok) {
			const error = await response.json();
			throw new Error(error.error || 'Failed to fetch plans');
		}

		return response.json();
	},

	/**
	 * Create a new license plan (super admin only)
	 */
	createSubscriptionPlan: async (
		baseUrl: string,
		token: string,
		data: {
			name: string;
			code: string;
			durationDays?: number;
			maxDevices?: number;
			features?: Record<string, any>;
			priceCents?: number;
		}
	) => {
		const response = await fetch(`${baseUrl}/subscription/plans`, {
			method: 'POST',
			headers: {
				'Authorization': `Bearer ${token}`,
				'Content-Type': 'application/json'
			},
			body: JSON.stringify(data)
		});

		if (!response.ok) {
			const error = await response.json();
			throw new Error(error.error || 'Failed to create plan');
		}

		return response.json();
	},

	/**
	 * Get all subscription licenses
	 */
	getSubscriptionLicenses: async (
		baseUrl: string,
		token: string,
		filters?: { orgId?: string; status?: string }
	) => {
		const params = new URLSearchParams();
		if (filters?.orgId) params.append('orgId', filters.orgId);
		if (filters?.status) params.append('status', filters.status);

		const url = `${baseUrl}/subscription/instances${params.toString() ? `?${params.toString()}` : ''}`;
		
		const response = await fetch(url, {
			method: 'GET',
			headers: {
				'Authorization': `Bearer ${token}`,
				'Content-Type': 'application/json'
			}
		});

		if (!response.ok) {
			const error = await response.json();
			throw new Error(error.error || 'Failed to fetch licenses');
		}

		return response.json();
	},

	/**
	 * Get detailed license information including activations
	 */
	getSubscriptionLicenseDetails: async (baseUrl: string, token: string, licenseId: string) => {
		const response = await fetch(`${baseUrl}/subscription/instances/${licenseId}`, {
			method: 'GET',
			headers: {
				'Authorization': `Bearer ${token}`,
				'Content-Type': 'application/json'
			}
		});

		if (!response.ok) {
			const error = await response.json();
			throw new Error(error.error || 'Failed to fetch license details');
		}

		return response.json();
	},

	/**
	 * Issue a new subscription license
	 */
	issueSubscriptionLicense: async (
		baseUrl: string,
		token: string,
		data: {
			orgId: string;
			planCode: string;
			seats?: number;
			expiresAt?: string;
			metadata?: Record<string, any>;
		}
	) => {
		const response = await fetch(`${baseUrl}/subscription/instances`, {
			method: 'POST',
			headers: {
				'Authorization': `Bearer ${token}`,
				'Content-Type': 'application/json'
			},
			body: JSON.stringify(data)
		});

		if (!response.ok) {
			const error = await response.json();
			throw new Error(error.error || 'Failed to issue license');
		}

		return response.json();
	},

	/**
	 * Renew a subscription license
	 */
	renewSubscriptionLicense: async (
		baseUrl: string,
		token: string,
		licenseId: string,
		extensionDays?: number
	) => {
		const response = await fetch(`${baseUrl}/subscription/instances/${licenseId}/renew`, {
			method: 'PUT',
			headers: {
				'Authorization': `Bearer ${token}`,
				'Content-Type': 'application/json'
			},
			body: JSON.stringify({ extensionDays })
		});

		if (!response.ok) {
			const error = await response.json();
			throw new Error(error.error || 'Failed to renew license');
		}

		return response.json();
	},

	/**
	 * Revoke a subscription license
	 */
	revokeSubscriptionLicense: async (
		baseUrl: string,
		token: string,
		licenseId: string,
		data?: { reason?: string }
	) => {
		const response = await fetch(`${baseUrl}/subscription/instances/${licenseId}/revoke`, {
			method: 'PUT',
			headers: {
				'Authorization': `Bearer ${token}`,
				'Content-Type': 'application/json'
			},
			body: JSON.stringify(data || {})
		});

		if (!response.ok) {
			const error = await response.json();
			throw new Error(error.error || 'Failed to revoke license');
		}

		return response.json();
	},

	/**
	 * Activate license on desktop (desktop client calls this)
	 */
	activateSubscriptionLicense: async (
		baseUrl: string,
		token: string,
		data: {
			licenseKey: string;
			deviceId: string;
			deviceLabel?: string;
			machineInfo?: Record<string, any>;
		}
	) => {
		const response = await fetch(`${baseUrl}/subscription/activate`, {
			method: 'POST',
			headers: {
				'Authorization': `Bearer ${token}`,
				'Content-Type': 'application/json'
			},
			body: JSON.stringify(data)
		});

		if (!response.ok) {
			const error = await response.json();
			throw new Error(error.error || 'Activation failed');
		}

		return response.json();
	},

	/**
	 * Send heartbeat from desktop client
	 */
	sendSubscriptionHeartbeat: async (
		baseUrl: string,
		token: string,
		data: {
			deviceId: string;
			appVersion?: string;
		}
	) => {
		const response = await fetch(`${baseUrl}/subscription/heartbeat`, {
			method: 'POST',
			headers: {
				'Authorization': `Bearer ${token}`,
				'Content-Type': 'application/json'
			},
			body: JSON.stringify(data)
		});

		if (!response.ok) {
			const error = await response.json();
			throw new Error(error.error || error.message || 'Heartbeat failed');
		}

		return response.json();
	},

	/**
	 * Validate license on desktop client startup
	 */
	validateSubscriptionLicense: async (
		baseUrl: string,
		token: string,
		data: {
			deviceId: string;
		}
	) => {
		const response = await fetch(`${baseUrl}/subscription/validate`, {
			method: 'POST',
			headers: {
				'Authorization': `Bearer ${token}`,
				'Content-Type': 'application/json'
			},
			body: JSON.stringify(data)
		});

		if (!response.ok) {
			const error = await response.json();
			throw new Error(error.error || 'Validation failed');
		}

		return response.json();
	}
};

/**
 * Example usage in your existing apiClient:
 * 
 * export const apiClient = {
 *   // ... existing methods ...
 *   
 *   // Subscription license methods
 *   getSubscriptionPlans: () => subscriptionLicenseAPI.getSubscriptionPlans(API_BASE_URL, getToken()),
 *   getSubscriptionLicenses: (filters) => subscriptionLicenseAPI.getSubscriptionLicenses(API_BASE_URL, getToken(), filters),
 *   getSubscriptionLicenseDetails: (id) => subscriptionLicenseAPI.getSubscriptionLicenseDetails(API_BASE_URL, getToken(), id),
 *   issueSubscriptionLicense: (data) => subscriptionLicenseAPI.issueSubscriptionLicense(API_BASE_URL, getToken(), data),
 *   renewSubscriptionLicense: (id, days) => subscriptionLicenseAPI.renewSubscriptionLicense(API_BASE_URL, getToken(), id, days),
 *   revokeSubscriptionLicense: (id, data) => subscriptionLicenseAPI.revokeSubscriptionLicense(API_BASE_URL, getToken(), id, data),
 *   activateSubscriptionLicense: (data) => subscriptionLicenseAPI.activateSubscriptionLicense(API_BASE_URL, getToken(), data),
 *   sendSubscriptionHeartbeat: (data) => subscriptionLicenseAPI.sendSubscriptionHeartbeat(API_BASE_URL, getToken(), data),
 *   validateSubscriptionLicense: (data) => subscriptionLicenseAPI.validateSubscriptionLicense(API_BASE_URL, getToken(), data),
 * };
 */
