import React, { useState, useEffect } from 'react';
import { createApiClient } from './services/apiClient.js';
import { connectWebSocket } from './services/wsClient.js';
import { getRefreshToken, setTokens, isTokenExpired, getValidAccessToken } from './services/auth.js';
import { CampaignContainer } from './components/CampaignContainer.js';
import { InboxContainer } from './components/InboxContainer.js';
import { AuthScreen } from './components/AuthScreen.js';
import { ActivationScreen } from './components/ActivationScreen.js';
import { TemplatesPage } from './components/TemplatesPage.js';
import { SystemMonitoring } from './components/SystemMonitoring.js';
import { LicenseManagement } from './components/LicenseManagement.js';
import { UserManagement } from './components/UserManagement.js';
import { PlatformDashboard } from './components/PlatformDashboard.js';
import { ManageBrandsPage } from './components/ManageBrandsPage.js';
import { BrandCreatePage } from './components/BrandCreatePage.js';
import { BrandWhatsAppSetupPage } from './components/BrandWhatsAppSetupPage.js';
import './App.css';

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

type View = 'inbox' | 'campaigns' | 'templates' | 'settings' | 'brands' | 'brand-create' | 'brand-whatsapp-setup';
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
	const [activeBrandId, setActiveBrandId] = useState<string | null>(null);
	const [activeBrandName, setActiveBrandName] = useState<string | null>(null);
	const [setupBrandId, setSetupBrandId] = useState<string | null>(null);
	const [deviceId, setDeviceId] = useState<string | null>(null);
	const [activationStatus, setActivationStatus] = useState<ActivationStatus>('unknown');

	const clearAuthState = () => {
		localStorage.removeItem('accessToken');
		localStorage.removeItem('refreshToken');
		localStorage.removeItem('orgName');
		localStorage.removeItem('orgContextId');
		localStorage.removeItem('orgContextName');
		localStorage.removeItem('activeBrandId');
		localStorage.removeItem('activeBrandName');
		setAccessToken(null);
		setRole(null);
		setOrgName(null);
		setOrgContextId(null);
		setOrgContextName(null);
		setActiveBrandId(null);
		setActiveBrandName(null);
		setActivationStatus('unknown');
		if (wsClient) {
			wsClient.close();
			setWsClient(null);
		}
	};

	const setActiveBrand = (brandId: string, brandName?: string | null) => {
		if (!brandId) {
			setActiveBrandId(null);
			setActiveBrandName(null);
			localStorage.removeItem('activeBrandId');
			localStorage.removeItem('activeBrandName');
			setCurrentView('brands');
			return;
		}
		setActiveBrandId(brandId);
		localStorage.setItem('activeBrandId', brandId);
		if (brandName) {
			setActiveBrandName(brandName);
			localStorage.setItem('activeBrandName', brandName);
		}
	};

	useEffect(() => {
		const savedToken = localStorage.getItem('accessToken');
		if (savedToken) {
			setAccessToken(savedToken);
			try {
				const payload = JSON.parse(atob(savedToken.split('.')[1]));
				setOrgId(payload.orgId);
				if (!payload.role) {
					clearAuthState();
					return;
				}
				setRole(payload.role || null);

				if (payload.role === 'super_admin') {
					const storedOrgContextId = localStorage.getItem('orgContextId');
					if (storedOrgContextId) {
						setOrgContextId(storedOrgContextId);
					}
				}
			} catch (e) {
				console.warn('Failed to decode token:', e);
				clearAuthState();
			}
		}

		const storedOrgName = localStorage.getItem('orgName');
		if (storedOrgName) setOrgName(storedOrgName);
		const storedOrgContextName = localStorage.getItem('orgContextName');
		if (storedOrgContextName) setOrgContextName(storedOrgContextName);
		const storedBrandId = localStorage.getItem('activeBrandId');
		if (storedBrandId) setActiveBrandId(storedBrandId);
		const storedBrandName = localStorage.getItem('activeBrandName');
		if (storedBrandName) setActiveBrandName(storedBrandName);
	}, []);

	useEffect(() => {
		let isMounted = true;
		const loadDeviceId = async () => {
			try {
				if (window.desktop?.getDeviceId) {
					const id = await window.desktop.getDeviceId();
					if (isMounted) setDeviceId(id);
					return;
				}
			} catch {
				// fallback below
			}

			const stored = localStorage.getItem('deviceId');
			if (stored) {
				if (isMounted) setDeviceId(stored);
				return;
			}

			const generated = crypto.randomUUID();
			localStorage.setItem('deviceId', generated);
			if (isMounted) setDeviceId(generated);
		};

		loadDeviceId();
		return () => {
			isMounted = false;
		};
	}, []);

	useEffect(() => {
		const client = createApiClient(API_BASE_URL, () => accessToken, () => orgContextId, () => activeBrandId);
		setApiClient(client);

		if (accessToken) {
			const initWebSocket = async () => {
				let tokenToUse = accessToken;
				if (isTokenExpired(accessToken)) {
					try {
						const refreshToken = getRefreshToken();
						if (refreshToken) {
							const newTokens = await client.refresh(refreshToken);
							setTokens(newTokens.accessToken, newTokens.refreshToken);
							setAccessToken(newTokens.accessToken);
							tokenToUse = newTokens.accessToken;
						} else {
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
					activeBrandId,
					(error) => {
						console.error('WebSocket error:', error);
					},
					(event) => {
						console.log('WebSocket closed:', event.code, event.reason);
						if ((event.code === 1008 && event.reason.includes('token')) || event.reason.includes('expired')) {
							setTimeout(() => {
								const currentToken = getValidAccessToken();
								if (currentToken) setAccessToken(currentToken);
							}, 1000);
						}
					}
				);
				setWsClient(ws);
			};

			initWebSocket();
		}
	}, [accessToken, orgContextId, activeBrandId]);

	useEffect(() => {
		if (!apiClient || !accessToken || !role) return;
		if (role === 'super_admin' && !orgContextId) {
			const autoSelectOrgContext = async () => {
				try {
					const orgs = await apiClient.listPlatformOrgs();
					if (orgs && Array.isArray(orgs) && orgs.length > 0) {
						const firstOrg = orgs[0];
						setOrgContextId(firstOrg.id);
						if (firstOrg.name) {
							setOrgContextName(firstOrg.name);
							localStorage.setItem('orgContextId', firstOrg.id);
							localStorage.setItem('orgContextName', firstOrg.name);
						}
					}
				} catch (err) {
					console.warn('Failed to auto-select org context for super_admin:', err);
				}
			};
			autoSelectOrgContext();
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
				if (String(err).includes('Invalid token') || String(err).includes('Unauthorized')) clearAuthState();
			}
		};
		loadOrgName();
	}, [apiClient, accessToken, role, orgContextId]);

	useEffect(() => {
		if (!accessToken || !deviceId || !apiClient || !role) return;
		if (role === 'super_admin') return;

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
					localStorage.setItem('licenseActivation', JSON.stringify(info));
					setActivationStatus('active');
				} else {
					setActivationStatus('inactive');
				}
			} catch (err) {
				console.warn('Activation validation failed:', err);
				setActivationStatus('inactive');
				if (String(err).includes('Invalid token') || String(err).includes('Unauthorized')) clearAuthState();
			}
		};

		validateActivation();
	}, [accessToken, deviceId, apiClient, role, orgContextId]);

	const handleLoginSuccess = (newAccessToken: string, refreshToken: string) => {
		localStorage.setItem('accessToken', newAccessToken);
		localStorage.setItem('refreshToken', refreshToken);
		setAccessToken(newAccessToken);
		setActivationStatus('unknown');
		setOrgName(null);
		localStorage.removeItem('orgName');
		setOrgContextId(null);
		setOrgContextName(null);
		localStorage.removeItem('orgContextId');
		localStorage.removeItem('orgContextName');
		setActiveBrand('', '');
		try {
			const payload = JSON.parse(atob(newAccessToken.split('.')[1]));
			setOrgId(payload.orgId);
			setRole(payload.role || null);
		} catch (e) {
			console.warn('Failed to decode token:', e);
		}
	};

	const handleLogout = () => clearAuthState();

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
		setActiveBrand('', '');
		setCurrentView('settings');
	};

	if (!accessToken) return <AuthScreen apiBaseUrl={API_BASE_URL} onAuthSuccess={handleLoginSuccess} />;
	if (!role) return <div>Initializing...</div>;
	if (!deviceId) return <div>Initializing...</div>;
	if (role === 'super_admin' && !orgContextId) return <PlatformDashboard apiClient={apiClient} onEnterOrg={enterOrgContext} />;

	if (role !== 'super_admin' && activationStatus !== 'active') {
		if (!apiClient) return <div>Initializing...</div>;
		return (
			<ActivationScreen
				deviceId={deviceId}
				apiClient={apiClient}
				onActivated={(info) => {
					localStorage.setItem('licenseActivation', JSON.stringify(info));
					setActivationStatus('active');
				}}
			/>
		);
	}

	if (!apiClient) return <div>Initializing...</div>;
	const shouldForceBrands = role !== 'super_admin' && !activeBrandId;

	return (
		<div className="app-container">
			<nav className="app-nav">
				<div className="nav-left">
					{role === 'super_admin' && orgContextId && <button onClick={exitOrgContext} className="exit-org-btn">Exit Org Context</button>}
					{role === 'super_admin' && orgContextId && <span className="org-context-span">Org: {orgContextName || orgContextId}</span>}
					{activeBrandId && <span className="org-context-span">Brand: {activeBrandName || activeBrandId}</span>}
					<button onClick={() => setCurrentView('brands')} className={`nav-btn ${currentView === 'brands' ? 'active' : ''}`}>🏷️ Brands</button>
					<button onClick={() => setCurrentView('inbox')} className={`nav-btn ${currentView === 'inbox' ? 'active' : ''}`}>💬 Inbox</button>
					<button onClick={() => setCurrentView('campaigns')} className={`nav-btn ${currentView === 'campaigns' ? 'active' : ''}`}>📢 Campaigns</button>
					<button onClick={() => setCurrentView('templates')} className={`nav-btn ${currentView === 'templates' ? 'active' : ''}`}>🧩 Templates</button>
					<button onClick={() => setCurrentView('settings')} className={`nav-btn ${currentView === 'settings' ? 'active' : ''}`}>⚙️ Settings</button>
				</div>
				<button onClick={handleLogout} className="logout-btn">🚪 Logout</button>
			</nav>
			<div className="main-content">
				{(shouldForceBrands || currentView === 'brands') && (
					<ManageBrandsPage
						apiClient={apiClient}
						activeBrandId={activeBrandId}
						onSetActiveBrand={(brandId, brandName) => setActiveBrand(brandId, brandName)}
						onCreateBrand={() => setCurrentView('brand-create')}
						onOpenWhatsAppSetup={(brandId) => {
							setSetupBrandId(brandId);
							setCurrentView('brand-whatsapp-setup');
						}}
					/>
				)}
				{currentView === 'brand-create' && (
					<BrandCreatePage
						apiClient={apiClient}
						onCreated={(brandId, brandName) => {
							setActiveBrand(brandId, brandName);
							setSetupBrandId(brandId);
							setCurrentView('brand-whatsapp-setup');
						}}
					/>
				)}
				{currentView === 'brand-whatsapp-setup' && setupBrandId && <BrandWhatsAppSetupPage apiClient={apiClient} brandId={setupBrandId} />}
				{!shouldForceBrands && currentView === 'inbox' && <InboxContainer apiClient={apiClient} wsClient={wsClient} />}
				{!shouldForceBrands && currentView === 'campaigns' && <CampaignContainer apiClient={apiClient} wsClient={wsClient} />}
				{!shouldForceBrands && currentView === 'templates' && <TemplatesPage apiClient={apiClient} />}
				{!shouldForceBrands && currentView === 'settings' && (
					<div className="settings-container">
						<div className={`role-card ${role === 'admin' ? 'admin' : ''}`}>
							Role: {role || 'unknown'} | Org: {orgName || orgId || 'unknown'}
							{orgName && orgId && <span className={`role-id ${role === 'admin' ? 'admin' : ''}`}> (id: {orgId})</span>}
						</div>
						{role === 'admin' && <LicenseManagement apiClient={apiClient} />}
						{role === 'admin' && <UserManagement apiClient={apiClient} />}
						{role === 'admin' && <SystemMonitoring apiClient={apiClient} />}
					</div>
				)}
			</div>
		</div>
	);
};
