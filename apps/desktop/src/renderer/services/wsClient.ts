export const connectWebSocket = (
	baseUrl: string,
	token: string,
	onMessage: (data: unknown) => void,
	brandId?: string | null,
	onError?: (error: Event) => void,
	onClose?: (event: CloseEvent) => void
) => {
	const url = new URL("/realtime", baseUrl);
	url.searchParams.set("token", token);
	if (brandId) {
		url.searchParams.set("brandId", brandId);
	}

	const socket = new WebSocket(url.toString());
	socket.onmessage = (event) => {
		try {
			onMessage(JSON.parse(event.data));
		} catch {
			onMessage(event.data);
		}
	};

	if (onError) {
		socket.onerror = onError;
	}

	if (onClose) {
		socket.onclose = onClose;
	}

	return socket;
};
