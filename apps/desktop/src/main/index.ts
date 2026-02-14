import { app, ipcMain } from 'electron';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { createMainWindow } from './window';
import { buildMenu } from './menu';
import { initAutoUpdater } from './updater';

let mainWindow: ReturnType<typeof createMainWindow> | null = null;

const getDeviceId = () => {
	const devicePath = path.join(app.getPath('userData'), 'device.json');
	try {
		const raw = fs.readFileSync(devicePath, 'utf-8');
		const parsed = JSON.parse(raw) as { deviceId?: string };
		if (parsed.deviceId) {
			return parsed.deviceId;
		}
	} catch {
		// ignore and regenerate
	}

	const deviceId = crypto.randomUUID();
	fs.writeFileSync(devicePath, JSON.stringify({ deviceId }));
	return deviceId;
};

const createApp = () => {
	ipcMain.handle('get-device-id', async () => getDeviceId());
	mainWindow = createMainWindow();
	buildMenu(mainWindow);
	initAutoUpdater();
};

app.on('ready', createApp);

app.on('window-all-closed', () => {
	if (process.platform !== 'darwin') {
		app.quit();
	}
});

app.on('activate', () => {
	if (!mainWindow) {
		mainWindow = createMainWindow();
	}
});

app.on('activate', () => {
	if (!mainWindow) {
		mainWindow = createMainWindow();
	}
});
