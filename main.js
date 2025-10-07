const { app, BrowserWindow, ipcMain, Tray, Menu, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs');

let mainWindow;
let tray = null;
let isAlwaysOnTop = true; // Widget mode starts on top

// Simple config storage without electron-store
const configPath = path.join(app.getPath('userData'), 'config.json');

function getConfig() {
    try {
        if (fs.existsSync(configPath)) {
            return JSON.parse(fs.readFileSync(configPath, 'utf8'));
        }
    } catch (error) {
        console.error('Error reading config:', error);
    }
    return {};
}

function saveConfig(config) {
    try {
        const dir = path.dirname(configPath);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
    } catch (error) {
        console.error('Error saving config:', error);
    }
}

function createWindow() {
    // Get saved window bounds or use defaults
    const config = getConfig();
    const savedBounds = config.windowBounds || {
        width: 450,
        height: 650,
        x: null,
        y: null
    };

    mainWindow = new BrowserWindow({
        width: savedBounds.width,
        height: savedBounds.height,
        x: savedBounds.x,
        y: savedBounds.y,
        minWidth: 350,
        minHeight: 400,
        frame: false, // Frameless window for custom UI
        transparent: true,
        resizable: true,
        hasShadow: true,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            nodeIntegration: false,
            contextIsolation: true,
            enableRemoteModule: false,
            sandbox: true
        },
        // icon: path.join(__dirname, 'app_icon.ico'),
        skipTaskbar: true, // Hide from taskbar - widget mode
        alwaysOnTop: true, // Start as widget on top
        backgroundColor: '#00000000', // Transparent background
        roundedCorners: true,
        titleBarStyle: 'hidden',
        show: false, // Don't show until ready
        focusable: true, // Can receive focus when clicked
        acceptFirstMouse: true, // Allow interaction on first click
        minimizable: false, // Widgets don't minimize
        maximizable: false // Widgets don't maximize
    });

    // Position window at bottom-right corner if no saved position
    if (savedBounds.x === null || savedBounds.y === null) {
        const { screen } = require('electron');
        const primaryDisplay = screen.getPrimaryDisplay();
        const { width: screenWidth, height: screenHeight } = primaryDisplay.workAreaSize;

        const windowWidth = savedBounds.width;
        const windowHeight = savedBounds.height;
        const margin = 20;

        mainWindow.setPosition(
            screenWidth - windowWidth - margin,
            screenHeight - windowHeight - margin
        );
    }

    // Load the app
    mainWindow.loadFile('index.html');

    // Remove menu bar
    mainWindow.setMenuBarVisibility(false);

    // Handle window close - minimize to tray instead
    mainWindow.on('close', (event) => {
        if (!app.isQuitting) {
            event.preventDefault();
            mainWindow.hide();
        }
        return false;
    });

    // Prevent navigation to external URLs
    mainWindow.webContents.on('will-navigate', (event, url) => {
        const appURL = mainWindow.webContents.getURL();
        if (url !== appURL) {
            event.preventDefault();
        }
    });

    // Show window when ready (widget mode - show without stealing focus initially)
    mainWindow.once('ready-to-show', () => {
        mainWindow.showInactive(); // Show without focus for widget mode
        mainWindow.setAlwaysOnTop(true, 'floating'); // Keep on top with floating level
        
        // Make window focusable when clicked
        mainWindow.setFocusable(true);
    });
    
    // Handle focus events - when user clicks on window, it should become active
    mainWindow.on('focus', () => {
        console.log('Window focused');
    });
    
    mainWindow.on('blur', () => {
        console.log('Window blurred');
    });

    // Save window bounds on move or resize (with debounce)
    let saveTimeout;
    const saveBounds = () => {
        clearTimeout(saveTimeout);
        saveTimeout = setTimeout(() => {
            const bounds = mainWindow.getBounds();
            const config = getConfig();
            config.windowBounds = bounds;
            saveConfig(config);
            console.log('Window bounds saved:', bounds);
        }, 500); // Save after 500ms of no movement
    };

    mainWindow.on('move', saveBounds);
    mainWindow.on('resize', saveBounds);
    
    // Also save on close
    mainWindow.on('close', () => {
        clearTimeout(saveTimeout);
        const bounds = mainWindow.getBounds();
        const config = getConfig();
        config.windowBounds = bounds;
        saveConfig(config);
    });

    // Set click-through for transparent areas (Windows only)
    if (process.platform === 'win32') {
        mainWindow.setIgnoreMouseEvents(false);
    }

    // Open DevTools in development
    // if (process.env.NODE_ENV === 'development') {
    //     mainWindow.webContents.openDevTools();
    // }

    // Create system tray icon
    createTray();
}

function createTray() {
    try {
        // Create tray icon - try multiple paths
        let trayIcon;
        const iconPaths = [
            path.join(__dirname, 'app_icon.ico'),
            path.join(__dirname, 'app_icon.png'),
        ];
        
        for (const iconPath of iconPaths) {
            if (fs.existsSync(iconPath)) {
                trayIcon = nativeImage.createFromPath(iconPath);
                if (!trayIcon.isEmpty()) {
                    console.log('Tray icon loaded from:', iconPath);
                    break;
                }
            }
        }

        // If no icon found, create a simple one
        if (!trayIcon || trayIcon.isEmpty()) {
            console.log('Creating fallback tray icon');
            // Create a 16x16 canvas with a simple icon
            const canvas = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAABHNCSVQICAgIfAhkiAAAAAlwSFlzAAAAdgAAAHYBTnsmCAAAABl0RVh0U29mdHdhcmUAd3d3Lmlua3NjYXBlLm9yZ5vuPBoAAAE3SURBVDiNpZK/SsNQFMZ/596kSWtTaxGhIA46ODko+Ag+gA/g5OYD6KCTo4uTODo5CCKKi6B0cJAiVGuptqbJ/XMckkbQVoSe6XDO+fjOd74jqCp/EfmLOEDgJLlP0/QmSZI1EbkQkVBEDlT1SUQeVfXGGLMN4I7P55s9Ho/7RVFsA2JRVb0GYlV9AvpcVccA7vl4PK4553YBLKrq3Hv/PAyHw4csy3aBQJZlrPV6vZumaZYB3Dm3q6rrAEEURct5ni8BuGVZcgAopZSllLKsqnIRuQRwL6UEgLquq6qqFgDcZVnGRVFc9Xq9h+l0egFgyuVycT6fH3nnbgDcx8fH2Xq9Pk7TdA3AnXObrVZrC8Bdr9fLu93u8Ww2OwVwG43GYDgcHgO4g8Hgstls7gO4w+Hwcrvd3gdwj46O/in/AH8BvgA7z3YeJ8YAAAAASUVORK5CYII=', 'base64');
            trayIcon = nativeImage.createFromBuffer(canvas);
        }

        // Resize to 16x16 for tray
        const resizedIcon = trayIcon.resize({ width: 16, height: 16 });
        
        if (tray) {
            tray.destroy();
        }
        
        tray = new Tray(resizedIcon);
        console.log('Tray icon created successfully');

        const contextMenu = Menu.buildFromTemplate([
            {
                label: 'TaskMaster Pro',
                enabled: false
            },
            {
                type: 'separator'
            },
            {
                label: 'Göster',
                click: () => {
                    if (mainWindow) {
                        mainWindow.show();
                        mainWindow.focus();
                        mainWindow.moveTop(); // Bring to front
                    }
                }
            },
            {
                label: 'Gizle',
                click: () => {
                    mainWindow.hide();
                }
            },
            {
                type: 'separator'
            },
            {
                label: 'Her Zaman Üstte',
                type: 'checkbox',
                checked: isAlwaysOnTop,
                click: (menuItem) => {
                    isAlwaysOnTop = menuItem.checked;
                    mainWindow.setAlwaysOnTop(isAlwaysOnTop, isAlwaysOnTop ? 'floating' : 'normal');
                    mainWindow.webContents.send('always-on-top-changed', isAlwaysOnTop);
                }
            },
            {
                label: 'Widget Modu',
                type: 'checkbox',
                checked: true,
                enabled: false,
                toolTip: 'Uygulama widget modunda çalışıyor'
            },
            {
                type: 'separator'
            },
            {
                label: 'Çıkış',
                click: () => {
                    app.isQuitting = true;
                    app.quit();
                }
            }
        ]);

        tray.setToolTip('TaskMaster Pro Widget');
        tray.setContextMenu(contextMenu);

        // Single click to show/hide (Windows style)
        tray.on('click', () => {
            if (mainWindow.isVisible()) {
                mainWindow.hide();
            } else {
                mainWindow.show();
                mainWindow.focus();
                mainWindow.moveTop(); // Bring to front
            }
        });

        // Double click to show/hide (alternative)
        tray.on('double-click', () => {
            if (mainWindow.isVisible()) {
                mainWindow.hide();
            } else {
                mainWindow.show();
                mainWindow.focus();
                mainWindow.moveTop(); // Bring to front
            }
        });
    } catch (error) {
        console.error('Error creating tray:', error);
    }
}

// IPC Handlers
ipcMain.on('minimize-window', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
        // In widget mode, minimize means hide
        mainWindow.hide();
    }
});

ipcMain.on('close-window', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.hide();
    }
});

ipcMain.on('toggle-always-on-top', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
        isAlwaysOnTop = !isAlwaysOnTop;
        mainWindow.setAlwaysOnTop(isAlwaysOnTop, isAlwaysOnTop ? 'floating' : 'normal');

        // Update tray menu
        if (tray) {
            createTray();
        }
    }
});

ipcMain.on('set-opacity', (event, opacity) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
        const validOpacity = Math.max(0.1, Math.min(1, opacity / 100));
        mainWindow.setOpacity(validOpacity);
    }
});

// App lifecycle
app.whenReady().then(() => {
    createWindow();

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        } else {
            mainWindow.show();
        }
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

app.on('before-quit', () => {
    app.isQuitting = true;
});

// Prevent multiple instances
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
    app.quit();
} else {
    app.on('second-instance', () => {
        if (mainWindow) {
            if (mainWindow.isMinimized()) mainWindow.restore();
            mainWindow.show();
            mainWindow.focus();
        }
    });
}

