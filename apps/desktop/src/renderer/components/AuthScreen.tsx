import React, { useState } from 'react';

interface AuthScreenProps {
	apiBaseUrl: string;
	onAuthSuccess: (accessToken: string, refreshToken: string) => void;
}

type Mode = 'login' | 'register';

export const AuthScreen: React.FC<AuthScreenProps> = ({ apiBaseUrl, onAuthSuccess }) => {
	const [mode, setMode] = useState<Mode>('login');
	const [orgName, setOrgName] = useState('');
	const [email, setEmail] = useState('');
	const [password, setPassword] = useState('');
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault();
		setLoading(true);
		setError(null);

		try {
			const url = mode === 'login' ? '/auth/login' : '/auth/register';
			const payload = mode === 'login'
				? { email, password }
				: { orgName, email, password };

			const response = await fetch(`${apiBaseUrl}${url}`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(payload),
			});

			if (!response.ok) {
				const errorData = await response.json().catch(() => ({}));
				throw new Error(errorData.error || 'Authentication failed');
			}

			const data = await response.json();
			onAuthSuccess(data.accessToken, data.refreshToken);
		} catch (err) {
			setError(err instanceof Error ? err.message : 'An error occurred');
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
				maxWidth: '420px',
				backgroundColor: 'white',
				padding: '40px',
				borderRadius: '8px',
				boxShadow: '0 2px 10px rgba(0,0,0,0.1)'
			}}>
				<h1 style={{ textAlign: 'center', color: '#075e54', marginBottom: '10px' }}>
					WAB Sender
				</h1>
				<p style={{ textAlign: 'center', marginBottom: '24px', color: '#666', fontSize: '14px' }}>
					{mode === 'login' ? 'Log in to continue' : 'Create your account to get started'}
				</p>

				<form onSubmit={handleSubmit}>
					{mode === 'register' && (
						<div style={{ marginBottom: '16px' }}>
							<label style={{
								display: 'block',
								marginBottom: '8px',
								fontWeight: 600,
								color: '#333'
							}}>
								Organization
							</label>
							<input
								type="text"
								value={orgName}
								onChange={(e) => setOrgName(e.target.value)}
								placeholder="Your company name"
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
					)}

					<div style={{ marginBottom: '16px' }}>
						<label style={{
							display: 'block',
							marginBottom: '8px',
							fontWeight: 600,
							color: '#333'
						}}>
							Email
						</label>
						<input
							type="email"
							value={email}
							onChange={(e) => setEmail(e.target.value)}
							placeholder="you@company.com"
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

					<div style={{ marginBottom: '24px' }}>
						<label style={{
							display: 'block',
							marginBottom: '8px',
							fontWeight: 600,
							color: '#333'
						}}>
							Password
						</label>
						<input
							type="password"
							value={password}
							onChange={(e) => setPassword(e.target.value)}
							placeholder="Enter a strong password"
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
						{loading ? 'Please wait...' : mode === 'login' ? 'Log In' : 'Create Account'}
					</button>
				</form>

				<div style={{
					marginTop: '16px',
					textAlign: 'center',
					fontSize: '14px'
				}}>
					{mode === 'login' ? (
						<button
							type="button"
							onClick={() => setMode('register')}
							style={{
								background: 'none',
								border: 'none',
								color: '#075e54',
								cursor: 'pointer',
								fontWeight: 600
							}}
						>
							Create an account
						</button>
					) : (
						<button
							type="button"
							onClick={() => setMode('login')}
							style={{
								background: 'none',
								border: 'none',
								color: '#075e54',
								cursor: 'pointer',
								fontWeight: 600
							}}
						>
							Already have an account? Log in
						</button>
					)}
				</div>
			</div>
		</div>
	);
};
