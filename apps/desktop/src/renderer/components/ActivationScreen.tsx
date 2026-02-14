import React, { useState } from 'react';

interface ActivationScreenProps {
	deviceId: string;
	apiClient: {
		activateLicense: (licenseKey: string, deviceId: string, deviceLabel?: string) => Promise<any>;
	};
	onActivated: (payload: { activationId: string; licenseId: string; planCode: string; expiresAt?: string | null }) => void;
}

export const ActivationScreen: React.FC<ActivationScreenProps> = ({ deviceId, apiClient, onActivated }) => {
	const [licenseKey, setLicenseKey] = useState('');
	const [deviceLabel, setDeviceLabel] = useState('');
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const handleActivate = async (e: React.FormEvent) => {
		e.preventDefault();
		setLoading(true);
		setError(null);

		try {
			const result = await apiClient.activateLicense(licenseKey, deviceId, deviceLabel || undefined);
			onActivated({
				activationId: result.activationId,
				licenseId: result.licenseId,
				planCode: result.planCode,
				expiresAt: result.expiresAt
			});
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Activation failed');
		} finally {
			setLoading(false);
		}
	};

	return (
		<div style={{
			display: 'flex',
			justifyContent: 'center',
			alignItems: 'center',
			minHeight: '100vh',
			backgroundColor: '#f5f5f5',
			fontFamily: 'system-ui, -apple-system, sans-serif'
		}}>
			<div style={{
				width: '100%',
				maxWidth: '440px',
				backgroundColor: 'white',
				padding: '40px',
				borderRadius: '8px',
				boxShadow: '0 2px 10px rgba(0,0,0,0.1)'
			}}>
				<h2 style={{ textAlign: 'center', color: '#075e54', marginBottom: '10px' }}>
					Activate WAB Sender
				</h2>
				<p style={{ textAlign: 'center', marginBottom: '24px', color: '#666', fontSize: '14px' }}>
					Enter your license key to unlock this device.
				</p>

				<form onSubmit={handleActivate}>
					<div style={{ marginBottom: '16px' }}>
						<label style={{
							display: 'block',
							marginBottom: '8px',
							fontWeight: 600,
							color: '#333'
						}}>
							License Key
						</label>
						<input
							type="text"
							value={licenseKey}
							onChange={(e) => setLicenseKey(e.target.value)}
							placeholder="XXXX-XXXX-XXXX-XXXX"
							style={{
								width: '100%',
								padding: '10px 12px',
								border: '1px solid #ddd',
								borderRadius: '4px',
								fontSize: '14px',
								boxSizing: 'border-box'
							}}
							disabled={loading}
							required
						/>
					</div>

					<div style={{ marginBottom: '16px' }}>
						<label style={{
							display: 'block',
							marginBottom: '8px',
							fontWeight: 600,
							color: '#333'
						}}>
							Device Label (optional)
						</label>
						<input
							type="text"
							value={deviceLabel}
							onChange={(e) => setDeviceLabel(e.target.value)}
							placeholder="e.g., Front desk PC"
							style={{
								width: '100%',
								padding: '10px 12px',
								border: '1px solid #ddd',
								borderRadius: '4px',
								fontSize: '14px',
								boxSizing: 'border-box'
							}}
							disabled={loading}
						/>
					</div>

					<div style={{
						backgroundColor: '#f7f7f7',
						borderRadius: '4px',
						padding: '10px 12px',
						fontSize: '12px',
						color: '#666',
						marginBottom: '16px'
					}}>
						Device ID: {deviceId}
					</div>

					{error && (
						<div style={{
							backgroundColor: '#fee',
							color: '#c33',
							padding: '10px 12px',
							borderRadius: '4px',
							marginBottom: '16px',
							fontSize: '14px'
						}}>
							{error}
						</div>
					)}

					<button
						type="submit"
						disabled={loading}
						style={{
							width: '100%',
							padding: '12px',
							backgroundColor: '#075e54',
							color: 'white',
							border: 'none',
							borderRadius: '4px',
							fontSize: '16px',
							fontWeight: 600,
							cursor: loading ? 'not-allowed' : 'pointer',
							opacity: loading ? 0.6 : 1
						}}
					>
						{loading ? 'Activating...' : 'Activate'}
					</button>
				</form>
			</div>
		</div>
	);
};
