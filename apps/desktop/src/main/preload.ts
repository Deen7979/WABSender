import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('desktop', {
	onUpdateStatus: (callback: (status: string) => void) => {
		ipcRenderer.on('update-status', (_event, status) => callback(status));
	},
	getDeviceId: () => ipcRenderer.invoke('get-device-id'),
});
