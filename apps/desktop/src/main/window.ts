import { app, BrowserWindow } from 'electron';
import * as path from 'path';

export const createMainWindow = () => {
	const mainWindow = new BrowserWindow({
		width: 1200,
		height: 800,
		minWidth: 1000,
		minHeight: 700,
		backgroundColor: '#ffffff',
		webPreferences: {
			contextIsolation: true,
			nodeIntegration: false,
			sandbox: true,
			preload: path.join(__dirname, 'preload.js'),
		},
	});

	const devServerUrl = process.env.VITE_DEV_SERVER_URL;
	if (!app.isPackaged && devServerUrl) {
		mainWindow.loadURL(devServerUrl);
		mainWindow.webContents.openDevTools({ mode: 'detach' });
	} else {
		const appPath = app.getAppPath();
		const indexPath = path.join(appPath, 'dist', 'renderer', 'index.html');
		mainWindow.loadFile(indexPath);
	}

	mainWindow.on('closed', () => {
		mainWindow.destroy();
	});

	return mainWindow;
};
