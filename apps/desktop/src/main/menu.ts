import { Menu, BrowserWindow, dialog, app } from 'electron';
import { autoUpdater } from 'electron-updater';

export const buildMenu = (mainWindow: BrowserWindow | null) => {
	const isMac = process.platform === 'darwin';

	const template: Electron.MenuItemConstructorOptions[] = [
		...(isMac
			? [
					{
						label: app.name,
						submenu: [
							{ role: 'about' },
							{ type: 'separator' },
							{ role: 'services' },
							{ type: 'separator' },
							{ role: 'hide' },
							{ role: 'hideOthers' },
							{ role: 'unhide' },
							{ type: 'separator' },
							{ role: 'quit' },
						],
					},
				]
			: []),
		{
			label: 'Edit',
			submenu: [
				{ role: 'undo' },
				{ role: 'redo' },
				{ type: 'separator' },
				{ role: 'cut' },
				{ role: 'copy' },
				{ role: 'paste' },
				{ role: 'selectAll' },
			],
		},
		{
			label: 'View',
			submenu: [
				{ role: 'reload' },
				{ role: 'forceReload' },
				...(process.env.NODE_ENV === 'development' ? [{ role: 'toggleDevTools' } as any] : []),
				{ type: 'separator' },
				{ role: 'resetZoom' },
				{ role: 'zoomIn' },
				{ role: 'zoomOut' },
				{ type: 'separator' },
				{ role: 'togglefullscreen' },
			],
		},
		{
			label: 'Window',
			submenu: [{ role: 'minimize' }, { role: 'close' }],
		},
		{
			role: 'help',
			submenu: [
				{
					label: 'Check for Updates',
					click: async () => {
						if (!app.isPackaged) {
							dialog.showMessageBox(mainWindow || new BrowserWindow(), {
								type: 'info',
								title: 'Development Mode',
								message: 'Auto-update is disabled in development mode.',
								buttons: ['OK'],
							});
							return;
						}

						try {
							const result = await autoUpdater.checkForUpdates();
							if (!result?.updateInfo) {
								dialog.showMessageBox(mainWindow || new BrowserWindow(), {
									type: 'info',
									title: 'No Updates',
									message: 'You are running the latest version.',
									buttons: ['OK'],
								});
							}
						} catch (err: any) {
							dialog.showErrorBox('Update Check Failed', err?.message || 'An error occurred while checking for updates.');
						}
					},
				},
				{ type: 'separator' },
				{
					label: 'About WAB Sender',
					click: () => {
						dialog.showMessageBox(mainWindow || new BrowserWindow(), {
							type: 'info',
							title: 'About WAB Sender',
							message: 'WAB Sender',
							detail: `Version: ${app.getVersion()}\n\nWhatsApp Cloud Desktop Application\n\nAll rights reserved.`,
							buttons: ['OK'],
						});
					},
				},
			],
		},
	];

	Menu.setApplicationMenu(Menu.buildFromTemplate(template));
};
