import { app, dialog, BrowserWindow } from 'electron';
import { autoUpdater } from 'electron-updater';
import log from 'electron-log';

const sendStatus = (message: string) => {
	const windows = BrowserWindow.getAllWindows();
	windows.forEach((win) => win.webContents.send('update-status', message));
};

export const initAutoUpdater = () => {
	if (!app.isPackaged) return;

	log.transports.file.level = 'info';
	autoUpdater.logger = log;

	autoUpdater.autoDownload = true;
	autoUpdater.autoInstallOnAppQuit = true;
	autoUpdater.allowDowngrade = false;

	autoUpdater.on('checking-for-update', () => {
		log.info('Auto-update: checking for updates');
		sendStatus('checking');
	});

	autoUpdater.on('update-available', (info) => {
		log.info(`Auto-update: update available (${info.version})`);
		sendStatus('available');
	});

	autoUpdater.on('update-not-available', (info) => {
		log.info(`Auto-update: no update available (${info.version})`);
		sendStatus('not-available');
	});

	autoUpdater.on('error', (err) => {
		log.error('Auto-update: error', err);
		sendStatus(`error:${err?.message || 'unknown'}`);
	});

	autoUpdater.on('download-progress', (progress) => {
		log.info(`Auto-update: download ${Math.round(progress.percent)}%`);
		sendStatus(`progress:${Math.round(progress.percent)}`);
	});

	autoUpdater.on('update-downloaded', async () => {
		log.info('Auto-update: update downloaded');
		sendStatus('downloaded');
		const result = await dialog.showMessageBox({
			type: 'info',
			buttons: ['Restart Now', 'Later'],
			defaultId: 0,
			cancelId: 1,
			title: 'Update Ready',
			message: 'A new version has been downloaded. Restart to apply the update?',
		});

		if (result.response === 0) {
			autoUpdater.quitAndInstall();
		}
	});

	autoUpdater.checkForUpdates();
};
