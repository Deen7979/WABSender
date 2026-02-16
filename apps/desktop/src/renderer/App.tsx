import React, { useState, useEffect } from 'react';
import { createApiClient } from './services/apiClient.js';
import { connectWebSocket } from './services/wsClient.js';
import { getRefreshToken, setTokens, isTokenExpired, getValidAccessToken } from './services/auth.js';
import { CampaignContainer } from './components/CampaignContainer.js';
import { InboxContainer } from './components/InboxContainer.js';
import { AuthScreen } from './components/AuthScreen.js';
import { ActivationScreen } from './components/ActivationScreen.js';
import { WhatsAppConnection } from './components/WhatsAppConnection.js';
import { TemplatesPage } from './components/TemplatesPage.js';
import { SystemMonitoring } from './components/SystemMonitoring.js';
import { PlatformDashboard } from './components/PlatformDashboard.js';

declare global {
	namespace NodeJS {
		interface ProcessEnv {
			REACT_APP_API_URL?: string;
			VITE_API_URL?: string;
		}
	}
}

const API_BASE_URL = 
	((globalThis as any).process?.env?.VITE_API_URL) || 
	((globalThis as any).process?.env?.REACT_APP_API_URL) || 
	'http://localhost:4000';

type View = 'inbox' | 'campaigns' | 'templates' | 'settings';
type ActivationStatus = 'unknown' | 'active' | 'inactive';

export const App: React.FC = () => {
	const [apiClient, setApiClient] = useState<any>(null);
	const [wsClient, setWsClient] = useState<WebSocket | null>(null);
	const [accessToken, setAccessToken] = useState<string | null>(null);
	const [orgId, setOrgId] = useState<string | null>(null);
	const [role, setRole] = useState<string | null>(null);
	const [orgName, setOrgName] = useState<string | null>(null);
	const [currentView, setCurrentView] = useState<View>('inbox');
	const [orgContextId, setOrgContextId] = useState<string | null>(null);
	const [orgContextName, setOrgContextName] = useState<string | null>(null);
	const [deviceId, setDeviceId] = useState<string | null>(null);
	const [activationStatus, setActivationStatus] = useState<ActivationStatus>('unknown');

	const clearAuthState = () => {
		localStorage.removeItem('accessToken');
		localStorage.removeItem('refreshToken');
		localStorage.removeItem('orgName');
		localStorage.removeItem('orgContextId');
		localStorage.removeItem('orgContextName');
		setAccessToken(null);
		setRole(null);
		setOrgName(null);
		setOrgContextId(null);
		setOrgContextName(null);
		setActivationStatus('unknown');
		if (wsClient) {
			wsClient.close();
			setWsClient(null);
		}
	};

	// Load token from localStorage on mount
	useEffect(() => {
		const savedToken = localStorage.getItem('accessToken');
		if (savedToken) {
			setAccessToken(savedToken);
			// Decode JWT to get orgId
			try {
				const payload = JSON.parse(atob(savedToken.split('.')[1]));
				setOrgId(payload.orgId);
				if (!payload.role) {
					clearAuthState();
					return;
				}
				setRole(payload.role || null);
			} catch (e) {
				console.warn('Failed to decode token:', e);
				clearAuthState();
			}
		}

		const storedOrgName = localStorage.getItem('orgName');
		if (storedOrgName) {
			setOrgName(storedOrgName);
		}

		const storedOrgContextId = localStorage.getItem('orgContextId');
		const storedOrgContextName = localStorage.getItem('orgContextName');
		if (storedOrgContextId) {
			setOrgContextId(storedOrgContextId);
		}
		if (storedOrgContextName) {
			setOrgContextName(storedOrgContextName);
		}

		const storedActivation = localStorage.getItem('licenseActivation');
		if (storedActivation) {
			try {
				// setActivationInfo(JSON.parse(storedActivation));
			} catch {
				localStorage.removeItem('licenseActivation');
			}
		}
	}, []);

	useEffect(() => {
		let isMounted = true;
		const loadDeviceId = async () => {
			try {
				if (window.desktop?.getDeviceId) {
					const id = await window.desktop.getDeviceId();
					if (isMounted) {
						setDeviceId(id);
					}
					return;
				}
			} catch {
				// fallback below
			}

			const stored = localStorage.getItem('deviceId');
			if (stored) {
				if (isMounted) {
					setDeviceId(stored);
				}
				return;
			}

			const generated = crypto.randomUUID();
			localStorage.setItem('deviceId', generated);
			if (isMounted) {
				setDeviceId(generated);
			}
		};

		loadDeviceId();
		return () => {
			isMounted = false;
		};
	}, []);

	// Initialize API client and WebSocket when token changes
	useEffect(() => {
		const client = createApiClient(API_BASE_URL, () => accessToken, () => orgContextId);
		setApiClient(client);

		// Initialize WebSocket if token available
		if (accessToken) {
			const initWebSocket = async () => {
				let tokenToUse = accessToken;

				// Check if token is expired and refresh if needed
				if (isTokenExpired(accessToken)) {
					try {
						const refreshToken = getRefreshToken();
						if (refreshToken) {
							const newTokens = await client.refresh(refreshToken);
							setTokens(newTokens.accessToken, newTokens.refreshToken);
							setAccessToken(newTokens.accessToken);
							tokenToUse = newTokens.accessToken;
						} else {
							// No refresh token, clear auth
							clearAuthState();
							return;
						}
					} catch (error) {
						console.error('Failed to refresh token:', error);
						clearAuthState();
						return;
					}
				}

				const ws = connectWebSocket(
					API_BASE_URL,
					tokenToUse,
					(data) => {
						console.log('WebSocket message:', data);
					},
					orgContextId,
					(error) => {
						console.error('WebSocket error:', error);
					},
					(event) => {
						console.log('WebSocket closed:', event.code, event.reason);
						// If closed due to auth error (1008), try to refresh token and reconnect
						if (event.code === 1008 && event.reason.includes('token') || event.reason.includes('expired')) {
							console.log('Token expired, attempting to refresh...');
							// The useEffect will trigger again when accessToken changes
							setTimeout(() => {
								const currentToken = getValidAccessToken();
								if (currentToken) {
									setAccessToken(currentToken);
								}
							}, 1000);
						}
					}
				);
				setWsClient(ws);

				return () => {
					ws.close();
				};
			};

			initWebSocket();
		}
	}, [accessToken, orgContextId]);

	useEffect(() => {
		if (!apiClient || !accessToken) {
			return;
		}

		if (!role) {
			return;
		}

		if (role === 'super_admin' && !orgContextId) {
			return;
		}

		const loadOrgName = async () => {
			try {
				const response = await apiClient.getOrgProfile();
				if (response?.name) {
					setOrgName(response.name);
					localStorage.setItem('orgName', response.name);
				}
			} catch (err) {
				console.warn('Failed to load org profile:', err);
				if (String(err).includes('Invalid token') || String(err).includes('Unauthorized')) {
					clearAuthState();
				}
			}
		};

		loadOrgName();
	}, [apiClient, accessToken, role, orgContextId]);

	useEffect(() => {
		if (!accessToken || !deviceId || !apiClient) {
			return;
		}

		if (!role) {
			return;
		}

		// Super admins don't need license activation
		if (role === 'super_admin') {
			return;
		}

		const validateActivation = async () => {
			try {
				setActivationStatus('unknown');
				const result = await apiClient.validateLicense(deviceId);
				if (result.activated) {
					const info = {
						activationId: result.activationId,
						licenseId: result.licenseId,
						planCode: result.planCode,
						expiresAt: result.expiresAt
					};
					// setActivationInfo(info);
					localStorage.setItem('licenseActivation', JSON.stringify(info));
					setActivationStatus('active');
				} else {
					setActivationStatus('inactive');
				}
			} catch (err) {
				console.warn('Activation validation failed:', err);
				setActivationStatus('inactive');
				if (String(err).includes('Invalid token') || String(err).includes('Unauthorized')) {
					clearAuthState();
				}
			}
		};

		validateActivation();
	}, [accessToken, deviceId, apiClient, role, orgContextId]);

	const handleLoginSuccess = (accessToken: string, refreshToken: string) => {
		localStorage.setItem('accessToken', accessToken);
		localStorage.setItem('refreshToken', refreshToken);
		setAccessToken(accessToken);
		setActivationStatus('unknown');
		setOrgName(null);
		localStorage.removeItem('orgName');
		setOrgContextId(null);
		setOrgContextName(null);
		localStorage.removeItem('orgContextId');
		localStorage.removeItem('orgContextName');
		// Decode JWT to get orgId
		try {
			const payload = JSON.parse(atob(accessToken.split('.')[1]));
			setOrgId(payload.orgId);
			setRole(payload.role || null);
		} catch (e) {
			console.warn('Failed to decode token:', e);
		}
	};

	const handleLogout = () => {
		clearAuthState();
	};

	const enterOrgContext = (id: string, name?: string | null) => {
		setOrgContextId(id);
		localStorage.setItem('orgContextId', id);
		if (name) {
			setOrgContextName(name);
			localStorage.setItem('orgContextName', name);
		} else {
			setOrgContextName(null);
			localStorage.removeItem('orgContextName');
		}
		setCurrentView('inbox');
	};

	const exitOrgContext = () => {
		setOrgContextId(null);
		setOrgContextName(null);
		localStorage.removeItem('orgContextId');
		localStorage.removeItem('orgContextName');
		setCurrentView('settings');
	};

	// Show login if no token
	if (!accessToken) {
		return <AuthScreen apiBaseUrl={API_BASE_URL} onAuthSuccess={handleLoginSuccess} />;
	}

	if (!role) {
		return <div>Initializing...</div>;
	}

	if (!deviceId) {
		return <div>Initializing...</div>;
	}

	if (role === 'super_admin' && !orgContextId) {
		return (
			<PlatformDashboard
				apiClient={apiClient}
				onEnterOrg={enterOrgContext}
			/>
		);
	}

	// Super admins don't need license activation
	if (role !== 'super_admin' && activationStatus !== 'active') {
		if (!apiClient) {
			return <div>Initializing...</div>;
		}
		return (
			<ActivationScreen
				deviceId={deviceId}
				apiClient={apiClient}
				onActivated={(info) => {
					// setActivationInfo(info);
					localStorage.setItem('licenseActivation', JSON.stringify(info));
					setActivationStatus('active');
				}}
			/>
		);
	}

	if (!apiClient) {
		return <div>Initializing...</div>;
	}

	return (
		<div style={{ fontFamily: 'system-ui, -apple-system, sans-serif', minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
			<nav style={{ 
				background: '#075e54', 
				color: '#fff', 
				padding: '12px 24px', 
				display: 'flex', 
				gap: '16px',
				boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
				justifyContent: 'space-between',
				alignItems: 'center'
			}}>
				<div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
					{role === 'super_admin' && orgContextId && (
						<button
							onClick={exitOrgContext}
							style={{
								background: 'rgba(255,255,255,0.2)',
								color: '#fff',
								border: 'none',
								padding: '6px 10px',
								borderRadius: '4px',
								cursor: 'pointer',
								fontSize: '12px',
								fontWeight: 600
							}}
						>
							Exit Org Context
						</button>
					)}
					{role === 'super_admin' && orgContextId && (
						<span style={{ fontSize: '12px', opacity: 0.9 }}>
							Org: {orgContextName || orgContextId}
						</span>
					)}
					<button
						onClick={() => setCurrentView('inbox')}
						style={{
							background: currentView === 'inbox' ? '#25d366' : 'transparent',
							color: '#fff',
							border: 'none',
							padding: '8px 16px',
							borderRadius: '4px',
							cursor: 'pointer',
							fontSize: '14px',
							fontWeight: 600
						}}
					>
						💬 Inbox
					</button>
					<button
						onClick={() => setCurrentView('campaigns')}
						style={{
							background: currentView === 'campaigns' ? '#25d366' : 'transparent',
							color: '#fff',
							border: 'none',
							padding: '8px 16px',
							borderRadius: '4px',
							cursor: 'pointer',
							fontSize: '14px',
							fontWeight: 600
						}}
					>
						📢 Campaigns
					</button>
					<button
						onClick={() => setCurrentView('templates')}
						style={{
							background: currentView === 'templates' ? '#25d366' : 'transparent',
							color: '#fff',
							border: 'none',
							padding: '8px 16px',
							borderRadius: '4px',
							cursor: 'pointer',
							fontSize: '14px',
							fontWeight: 600
						}}
					>
						🧩 Templates
					</button>
					<button
						onClick={() => setCurrentView('settings')}
						style={{
							background: currentView === 'settings' ? '#25d366' : 'transparent',
							color: '#fff',
							border: 'none',
							padding: '8px 16px',
							borderRadius: '4px',
							cursor: 'pointer',
							fontSize: '14px',
							fontWeight: 600
						}}
					>
						⚙️ Settings
					</button>
				</div>
				<button
					onClick={handleLogout}
					style={{
						background: 'rgba(255,255,255,0.2)',
						color: '#fff',
						border: 'none',
						padding: '8px 16px',
						borderRadius: '4px',
						cursor: 'pointer',
						fontSize: '14px',
						fontWeight: 600
					}}
				>
					🚪 Logout
				</button>
			</nav>
			<div style={{ flex: 1, overflowY: 'auto' }}>
				{currentView === 'inbox' && <InboxContainer apiClient={apiClient} wsClient={wsClient} />}
				{currentView === 'campaigns' && <CampaignContainer apiClient={apiClient} wsClient={wsClient} />}
				{currentView === 'templates' && <TemplatesPage apiClient={apiClient} />}
				{currentView === 'settings' && (
					<div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
						<div style={{
							padding: '10px 14px',
							borderRadius: '6px',
							border: '1px solid #e5e5e5',
							background: role === 'admin' ? '#e9f6ef' : '#f5f5f5',
							color: role === 'admin' ? '#0f6b3e' : '#666',
							fontSize: '13px',
							fontWeight: 600
						}}>
							Role: {role || 'unknown'} | Org: {orgName || orgId || 'unknown'}
							{orgName && orgId && (
								<span style={{ fontSize: '11px', fontWeight: 500, color: role === 'admin' ? '#2b7a53' : '#888' }}>
									 (id: {orgId})
								</span>
							)}
						</div>
						<WhatsAppConnection apiClient={apiClient} orgId={orgId} />
						{role === 'admin' && <LicenseManagement apiClient={apiClient} />}
						{role === 'admin' && <UserManagement apiClient={apiClient} />}
						{role === 'admin' && <SystemMonitoring apiClient={apiClient} />}
					</div>
				)}
			</div>
		</div>
	);
};

