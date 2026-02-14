const ACCESS_KEY = "auth.accessToken";
const REFRESH_KEY = "auth.refreshToken";

export const setTokens = (accessToken: string, refreshToken: string) => {
	localStorage.setItem(ACCESS_KEY, accessToken);
	localStorage.setItem(REFRESH_KEY, refreshToken);
};

export const getAccessToken = () => localStorage.getItem(ACCESS_KEY);
export const getRefreshToken = () => localStorage.getItem(REFRESH_KEY);

export const clearTokens = () => {
	localStorage.removeItem(ACCESS_KEY);
	localStorage.removeItem(REFRESH_KEY);
};

export const isTokenExpired = (token: string): boolean => {
	try {
		const payload = JSON.parse(atob(token.split('.')[1]));
		const currentTime = Date.now() / 1000;
		return payload.exp < currentTime;
	} catch {
		return true; // If we can't decode, consider it expired
	}
};

export const getValidAccessToken = (): string | null => {
	const token = getAccessToken();
	if (!token || isTokenExpired(token)) {
		return null;
	}
	return token;
};
