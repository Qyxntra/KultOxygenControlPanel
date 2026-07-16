const { app, BrowserWindow, ipcMain, Tray, Menu } = require('electron');
const path = require('path');
const fs = require('fs');
const { exec } = require('child_process');

let mainWindow = null;
let tray = null;

const RAWACCEL_DIR = 'C:\\ProgramData\\KultOxygenControlPanel\\rawaccel';
const RAWACCEL_SETTINGS = path.join(RAWACCEL_DIR, 'settings.json');
const RAWACCEL_WRITER = path.join(RAWACCEL_DIR, 'writer.exe');
const RAWACCEL_INSTALLER = path.join(RAWACCEL_DIR, 'installer.exe');
const RAWACCEL_UNINSTALLER = path.join(RAWACCEL_DIR, 'uninstaller.exe');

// Map of popular mouse VID/PID
const MOUSE_DATABASE = {
    // THE G-LAB
    "30FA:1440": { product_name: "G-LAB Kult Oxygen", max_dpi: 12800, button_count: 7, has_rgb: true },
    "30FA:1301": { product_name: "G-LAB Kult Nitrogen Core", max_dpi: 10000, button_count: 11, has_rgb: true },
    "30FA:1302": { product_name: "G-LAB Kult Radium", max_dpi: 4800, button_count: 7, has_rgb: true },
    "30FA:1303": { product_name: "G-LAB Kult Helium", max_dpi: 3200, button_count: 6, has_rgb: true },
    "30FA:1304": { product_name: "G-LAB Kult Caesium", max_dpi: 7200, button_count: 6, has_rgb: true },
    "30FA:1305": { product_name: "G-LAB Kult X-Trem", max_dpi: 4800, button_count: 6, has_rgb: true },
    "30FA:1306": { product_name: "G-LAB Kult Promethium", max_dpi: 8200, button_count: 6, has_rgb: true },
    "30FA:1307": { product_name: "G-LAB Kult Elite M150", max_dpi: 26000, button_count: 6, has_rgb: true },
    
    // ATK / VXE
    "35AF:1001": { product_name: "ATK F1 Ultimate", max_dpi: 36000, button_count: 5, has_rgb: false },
    "35AF:1002": { product_name: "ATK F1 Extreme", max_dpi: 36000, button_count: 5, has_rgb: false },
    "35AF:1003": { product_name: "ATK X1 Ultimate", max_dpi: 36000, button_count: 5, has_rgb: false },
    "35AF:1004": { product_name: "VXE R1 SE", max_dpi: 10000, button_count: 5, has_rgb: false },
    "35AF:1005": { product_name: "VXE R1 Pro", max_dpi: 26000, button_count: 5, has_rgb: false },
    "35AF:1006": { product_name: "VXE Dragonfly F1 Pro", max_dpi: 26000, button_count: 5, has_rgb: false },
    
    // CORSAIR
    "1B1C:1B5E": { product_name: "Corsair M65 RGB Elite", max_dpi: 18000, button_count: 8, has_rgb: true },
    "1B1C:1B7A": { product_name: "Corsair Sabre RGB Pro", max_dpi: 18000, button_count: 6, has_rgb: true },
    "1B1C:1B5C": { product_name: "Corsair Harpoon RGB Pro", max_dpi: 12000, button_count: 6, has_rgb: true },
    "1B1C:1B5D": { product_name: "Corsair Ironclaw RGB", max_dpi: 18000, button_count: 10, has_rgb: true },
    "1B1C:1B5F": { product_name: "Corsair Glaive RGB Pro", max_dpi: 18000, button_count: 6, has_rgb: true },
    "1B1C:1B6E": { product_name: "Corsair Dark Core RGB Pro", max_dpi: 18000, button_count: 8, has_rgb: true },
    "1B1C:1B7B": { product_name: "Corsair Katar Pro XT", max_dpi: 18000, button_count: 6, has_rgb: true },
    "1B1C:1B8E": { product_name: "Corsair Scimitar RGB Elite", max_dpi: 18000, button_count: 17, has_rgb: true },
    
    // LOGITECH G
    "046D:C08B": { product_name: "Logitech G502 Hero", max_dpi: 25600, button_count: 11, has_rgb: true },
    "046D:C08A": { product_name: "Logitech G305 Lightspeed", max_dpi: 12000, button_count: 6, has_rgb: false },
    "046D:C084": { product_name: "Logitech G203 Lightsync", max_dpi: 8000, button_count: 6, has_rgb: true },
    "046D:C231": { product_name: "Logitech G102/G203 Prodigy", max_dpi: 8000, button_count: 6, has_rgb: true },
    "046D:C08F": { product_name: "Logitech G403 Hero", max_dpi: 25600, button_count: 6, has_rgb: true },
    "046D:C091": { product_name: "Logitech G903 Hero", max_dpi: 25600, button_count: 11, has_rgb: true },
    "046D:C085": { product_name: "Logitech G Pro Wireless", max_dpi: 25600, button_count: 8, has_rgb: true },
    "046D:C094": { product_name: "Logitech G Pro X Superlight", max_dpi: 25600, button_count: 5, has_rgb: false },
    "046D:C099": { product_name: "Logitech G Pro X Superlight 2", max_dpi: 32000, button_count: 5, has_rgb: false },
    
    // RAZER
    "1532:007A": { product_name: "Razer DeathAdder Essential", max_dpi: 6400, button_count: 5, has_rgb: false },
    "1532:0090": { product_name: "Razer Viper Mini", max_dpi: 8500, button_count: 6, has_rgb: true },
    "1532:0084": { product_name: "Razer DeathAdder V2", max_dpi: 20000, button_count: 8, has_rgb: true },
    "1532:009C": { product_name: "Razer Basilisk V3", max_dpi: 26000, button_count: 11, has_rgb: true },
    "1532:00A6": { product_name: "Razer Viper V2 Pro", max_dpi: 30000, button_count: 5, has_rgb: false },
    "1532:00A5": { product_name: "Razer DeathAdder V3 Pro", max_dpi: 30000, button_count: 5, has_rgb: false },
    "1532:0098": { product_name: "Razer Orochi V2", max_dpi: 18000, button_count: 6, has_rgb: false }
};

// Helper: copy directory recursively
function copyFolderSync(from, to) {
    if (!fs.existsSync(to)) {
        fs.mkdirSync(to, { recursive: true });
    }
    fs.readdirSync(from).forEach(element => {
        const stat = fs.lstatSync(path.join(from, element));
        if (stat.isFile()) {
            fs.copyFileSync(path.join(from, element), path.join(to, element));
        } else if (stat.isDirectory()) {
            copyFolderSync(path.join(from, element), path.join(to, element));
        }
    });
}

// Helper: initialize RawAccel directory in ProgramData
function initRawaccelDirectory() {
    try {
        if (!fs.existsSync(RAWACCEL_DIR)) {
            fs.mkdirSync(RAWACCEL_DIR, { recursive: true });
        }
        
        // Find source files from resources
        const srcPath = app.isPackaged 
            ? path.join(process.resourcesPath, 'rawaccel')
            : path.join(__dirname, 'rawaccel');
            
        if (fs.existsSync(srcPath) && !fs.existsSync(RAWACCEL_WRITER)) {
            copyFolderSync(srcPath, RAWACCEL_DIR);
            console.log("Rawaccel driver files copied to ProgramData.");
        }
        
        // Check fallback if it fails
        const fallbackPath = 'C:\\Users\\Admin\\Downloads\\RawAccel_v1.7.1\\RawAccel';
        if (fs.existsSync(fallbackPath) && !fs.existsSync(RAWACCEL_WRITER)) {
            copyFolderSync(fallbackPath, RAWACCEL_DIR);
            console.log("Rawaccel driver files copied from fallback Downloads.");
        }
    } catch (e) {
        console.error("Failed to init RawAccel directory:", e);
    }
}

// Create the main window
function createWindow() {
    // Check if app is started with minimized argument
    const isMinimized = process.argv.includes('--minimized');

    mainWindow = new BrowserWindow({
        width: 800,
        height: 600,
        resizable: true,
        show: !isMinimized,
        icon: path.join(__dirname, 'assets', 'icon.ico'),
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false
        }
    });

    mainWindow.loadFile('index.html');
    mainWindow.setMenu(null); // Remove default menu bar

    // Intercept close and hide window instead of terminating
    mainWindow.on('close', (event) => {
        if (!app.isQuitting) {
            event.preventDefault();
            mainWindow.hide();
        }
    });

    // Configure WebHID permission checks and device selector handlers
    mainWindow.webContents.session.setPermissionCheckHandler((webContents, permission, requestingOrigin, details) => {
        if (permission === 'hid') return true;
        return false;
    });

    mainWindow.webContents.session.setDevicePermissionHandler((details) => {
        if (details.deviceType === 'hid') return true;
        return false;
    });

    mainWindow.webContents.session.on('select-hid-device', (event, details, callback) => {
        event.preventDefault();
        if (details.deviceList && details.deviceList.length > 0) {
            // Select first G-LAB mouse (vendorId 0x30fa or 12538) if present
            const glab = details.deviceList.find(d => d.vendorId === 0x30fa || d.vendorId === 12538);
            if (glab) {
                callback(glab.deviceId);
            } else {
                callback(details.deviceList[0].deviceId);
            }
        } else {
            callback(null);
        }
    });

    mainWindow.on('closed', () => {
        mainWindow = null;
    });
}

// Create the tray menu
function createTray() {
    const iconPath = path.join(__dirname, 'assets', 'icon.ico');
    if (!fs.existsSync(iconPath)) return;
    
    tray = new Tray(iconPath);
    const contextMenu = Menu.buildFromTemplate([
        { 
            label: 'Afficher', 
            click: () => {
                if (mainWindow) {
                    mainWindow.show();
                    mainWindow.focus();
                }
            } 
        },
        { 
            label: 'Masquer', 
            click: () => {
                if (mainWindow) mainWindow.hide();
            } 
        },
        { type: 'separator' },
        { 
            label: 'Quitter', 
            click: () => {
                app.isQuitting = true;
                app.quit();
            } 
        }
    ]);
    
    tray.setToolTip('Kult Oxygen Control Panel');
    tray.setContextMenu(contextMenu);
    
    tray.on('click', () => {
        if (mainWindow) {
            mainWindow.show();
            mainWindow.focus();
        }
    });
}

// Startup HKCU Run key registry hook
function configureStartup() {
    try {
        const exePath = process.execPath;
        const regCommand = `reg add "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run" /v "KultOxygenControlPanel" /t REG_SZ /d "\\"${exePath}\\\" --minimized" /f`;
        exec(regCommand, (err) => {
            if (err) console.error("Failed to write registry startup:", err);
            else console.log("Registered app for Windows startup.");
        });
    } catch (e) {
        console.error("Startup configuration failed:", e);
    }
}

// Single Instance Lock: Terminate existing instance if found
const lockFilePath = path.join(app.getPath('userData'), 'app.pid');
function enforceSingleInstance() {
    try {
        if (fs.existsSync(lockFilePath)) {
            const oldPid = parseInt(fs.readFileSync(lockFilePath, 'utf-8'));
            if (oldPid && oldPid !== process.pid) {
                try {
                    // Send SIGTERM to old process
                    process.kill(oldPid, 'SIGTERM');
                    console.log(`Sent SIGTERM to old process instance: ${oldPid}`);
                    
                    // Wait synchronously for up to 500ms for it to exit
                    let checkCount = 0;
                    while (checkCount < 10) {
                        try {
                            process.kill(oldPid, 0); // Test if process is still alive
                            const start = Date.now();
                            while (Date.now() - start < 50) {} // Sleep 50ms
                        } catch (e) {
                            // Process is dead
                            break;
                        }
                        checkCount++;
                    }
                    if (checkCount === 10) {
                        // Force kill if it's still alive after 500ms
                        try { process.kill(oldPid, 'SIGKILL'); } catch (e) {}
                    }
                } catch (e) {
                    // Process not found or access denied
                }
            }
        }
        // Write our own PID to lockfile
        fs.writeFileSync(lockFilePath, process.pid.toString(), 'utf-8');
    } catch (err) {
        console.error("Single instance check error:", err);
    }
}

// Init App
app.whenReady().then(() => {
    enforceSingleInstance();
    initRawaccelDirectory();
    createWindow();
    createTray();
    configureStartup();

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

// IPC Handler: read RawAccel settings.json
ipcMain.handle('read-rawaccel-settings', async () => {
    try {
        if (!fs.existsSync(RAWACCEL_SETTINGS)) {
            const defaultTemplate = {
                "version": "1.7.0",
                "profiles": [
                    {
                        "name": "default",
                        "Output DPI": 1000,
                        "Y/X output DPI ratio (vertical sens multiplier)": 1,
                        "Degrees of rotation": 0,
                        "Whole or horizontal accel parameters": {
                            "mode": "classic",
                            "Gain / Velocity": true,
                            "inputOffset": 0.3,
                            "outputOffset": 0,
                            "acceleration": 0.025,
                            "limit": 1.8,
                            "Cap mode": "output",
                            "data": []
                        }
                    }
                ]
            };
            fs.writeFileSync(RAWACCEL_SETTINGS, JSON.stringify(defaultTemplate, null, 2), 'utf-8');
        }
        const data = fs.readFileSync(RAWACCEL_SETTINGS, 'utf-8');
        return JSON.parse(data);
    } catch (e) {
        console.error("Failed to read RawAccel settings:", e);
        throw e;
    }
});

// IPC Handler: write RawAccel settings.json
ipcMain.handle('write-rawaccel-settings', async (event, settings) => {
    return new Promise((resolve, reject) => {
        try {
            fs.writeFileSync(RAWACCEL_SETTINGS, JSON.stringify(settings, null, 2), 'utf-8');
            
            if (fs.existsSync(RAWACCEL_WRITER)) {
                const psScript = `Start-Process -FilePath '${RAWACCEL_WRITER}' -ArgumentList '"${RAWACCEL_SETTINGS}"' -WorkingDirectory '${RAWACCEL_DIR}' -Verb RunAs -WindowStyle Hidden -Wait`;
                const command = `powershell -NoProfile -WindowStyle Hidden -Command "${psScript}"`;
                
                exec(command, (err, stdout, stderr) => {
                    if (err) {
                        reject(`Writer failed: ${stderr || err.message}`);
                    } else {
                        resolve({ status: "success", message: "Settings applied successfully." });
                    }
                });
            } else {
                reject("writer.exe not found at path");
            }
        } catch (e) {
            reject(e.message);
        }
    });
});

// IPC Handler: install RawAccel driver
ipcMain.handle('install-rawaccel-driver', async () => {
    return new Promise((resolve, reject) => {
        if (fs.existsSync(RAWACCEL_INSTALLER)) {
            const command = `powershell -NoProfile -Command "Start-Process -FilePath '${RAWACCEL_INSTALLER}' -WorkingDirectory '${RAWACCEL_DIR}' -Verb RunAs -Wait"`;
            exec(command, (err, stdout, stderr) => {
                if (err) reject(stderr || err.message);
                else resolve("Pilote RawAccel installé avec succès ! Redémarrez votre PC.");
            });
        } else {
            reject("installer.exe introuvable.");
        }
    });
});

// IPC Handler: uninstall RawAccel driver
ipcMain.handle('uninstall-rawaccel-driver', async () => {
    return new Promise((resolve, reject) => {
        if (fs.existsSync(RAWACCEL_UNINSTALLER)) {
            const command = `powershell -NoProfile -Command "Start-Process -FilePath '${RAWACCEL_UNINSTALLER}' -WorkingDirectory '${RAWACCEL_DIR}' -Verb RunAs -Wait"`;
            exec(command, (err, stdout, stderr) => {
                if (err) reject(stderr || err.message);
                else resolve("Pilote RawAccel désinstallé. Redémarrez votre PC.");
            });
        } else {
            reject("uninstaller.exe introuvable.");
        }
    });
});

// IPC Handler: Fetch connected mouse hardware specifications
ipcMain.handle('get-connected-mouse-specs', async () => {
    return new Promise((resolve) => {
        // Query connected pointing devices from WMI via PowerShell
        const query = 'powershell -NoProfile -Command "Get-PnpDevice -Class Mouse -Present | Select-Object InstanceId | ConvertTo-Json"';
        exec(query, async (err, stdout) => {
            let matchedSpecs = { product_name: "Generic Mouse", max_dpi: 16000, button_count: 6, has_rgb: true, source: "default" };
            
            if (err || !stdout) {
                resolve(matchedSpecs);
                return;
            }

            try {
                let devices = JSON.parse(stdout);
                if (!Array.isArray(devices)) {
                    devices = [devices];
                }

                // Look for known VIDs and PIDs
                let foundVidPid = null;
                for (const dev of devices) {
                    if (!dev || !dev.InstanceId) continue;
                    const match = dev.InstanceId.match(/VID_([0-9A-F]{4})&PID_([0-9A-F]{4})/i);
                    if (match) {
                        const vidPid = `${match[1].toUpperCase()}:${match[2].toUpperCase()}`;
                        if (MOUSE_DATABASE[vidPid]) {
                            foundVidPid = vidPid;
                            break;
                        }
                    }
                }

                if (foundVidPid) {
                    const specs = MOUSE_DATABASE[foundVidPid];
                    const parts = foundVidPid.split(":");
                    resolve({ 
                        ...specs, 
                        vendor_id: parseInt(parts[0], 16),
                        product_id: parseInt(parts[1], 16),
                        source: "database" 
                    });
                    return;
                }

                // If not in database, check if there's any general VID/PID
                let rawVidPid = null;
                let rawVid = 0;
                let rawPid = 0;
                for (const dev of devices) {
                    if (!dev || !dev.InstanceId) continue;
                    const match = dev.InstanceId.match(/VID_([0-9A-F]{4})&PID_([0-9A-F]{4})/i);
                    if (match && !dev.InstanceId.includes("VIRTUALDEVICE")) {
                        rawVidPid = `VID_${match[1]} PID_${match[2]}`;
                        rawVid = parseInt(match[1], 16);
                        rawPid = parseInt(match[2], 16);
                        break;
                    }
                }

                if (!rawVidPid) {
                    resolve(matchedSpecs);
                    return;
                }

                // Resolve directly using default specs without performing web crawls
                resolve({
                    product_name: `Mouse (${rawVidPid})`,
                    vendor_id: rawVid,
                    product_id: rawPid,
                    max_dpi: 16000,
                    button_count: 6,
                    has_rgb: true,
                    source: "default"
                });
            } catch (e) {
                console.error("Error parsing mouse devices WMI:", e);
                resolve(matchedSpecs);
            }
        });
    });
});

// Download update helper
function downloadFile(url, dest) {
    const https = require('https');
    return new Promise((resolve, reject) => {
        const file = fs.createWriteStream(dest);
        
        function get(targetUrl) {
            https.get(targetUrl, {
                headers: {
                    'User-Agent': 'KultOxygenControlPanel-Updater'
                }
            }, (response) => {
                if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
                    get(response.headers.location);
                    return;
                }
                
                if (response.statusCode !== 200) {
                    reject(new Error(`Failed to download: HTTP ${response.statusCode}`));
                    return;
                }
                
                response.pipe(file);
                
                file.on('finish', () => {
                    file.close();
                    resolve();
                });
            }).on('error', (err) => {
                fs.unlink(dest, () => {});
                reject(err);
            });
        }
        
        get(url);
    });
}

// IPC: Download and execute update installer
ipcMain.handle('download-and-install-update', async (event, downloadUrl) => {
    const { exec } = require('child_process');
    const os = require('os');
    try {
        const tempPath = path.join(os.tmpdir(), `KultOxygenSetup_${Date.now()}.exe`);
        console.log(`Downloading update from ${downloadUrl} to ${tempPath}...`);
        
        await downloadFile(downloadUrl, tempPath);
        console.log("Download completed. Launching installer...");
        
        // Launch installer with administrator privileges (UAC prompt)
        const cmd = `powershell -NoProfile -Command "Start-Process -FilePath '${tempPath}' -Verb RunAs"`;
        exec(cmd, (err) => {
            if (err) {
                console.error("Failed to run elevated installer:", err);
            }
        });
        
        setTimeout(() => {
            app.isQuitting = true;
            app.quit();
        }, 1500);
        
        return "Mise à jour téléchargée. L'application va se fermer pour lancer l'installateur.";
    } catch (e) {
        console.error("Update failed:", e);
        throw e;
    }
});
