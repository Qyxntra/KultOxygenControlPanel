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
    "30FA:1440": { product_name: "G-LAB Kult Oxygen", max_dpi: 10000, button_count: 7, has_rgb: true },
    "046D:C231": { product_name: "Logitech G102/G203 Prodigy", max_dpi: 8000, button_count: 6, has_rgb: true },
    "046D:C084": { product_name: "Logitech G203 Lightsync", max_dpi: 8000, button_count: 6, has_rgb: true },
    "046D:C08B": { product_name: "Logitech G502 Hero", max_dpi: 25600, button_count: 11, has_rgb: true },
    "1532:007A": { product_name: "Razer DeathAdder Essential", max_dpi: 6400, button_count: 5, has_rgb: false },
    "1532:0090": { product_name: "Razer Viper Mini", max_dpi: 8500, button_count: 6, has_rgb: true },
    "35AF:1001": { product_name: "ATK F1", max_dpi: 36000, button_count: 5, has_rgb: false },
    "35AF:1002": { product_name: "VXE R1", max_dpi: 26000, button_count: 5, has_rgb: false }
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

// Init App
app.whenReady().then(() => {
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
                    resolve({ ...specs, source: "database" });
                    return;
                }

                // If not in database, check if there's any general VID/PID
                let rawVidPid = null;
                for (const dev of devices) {
                    if (!dev || !dev.InstanceId) continue;
                    const match = dev.InstanceId.match(/VID_([0-9A-F]{4})&PID_([0-9A-F]{4})/i);
                    if (match && !dev.InstanceId.includes("VIRTUALDEVICE")) {
                        rawVidPid = `VID_${match[1]} PID_${match[2]}`;
                        break;
                    }
                }

                if (!rawVidPid) {
                    resolve(matchedSpecs);
                    return;
                }

                // Run DuckDuckGo web crawl search for this VID/PID
                console.log(`Crawling DuckDuckGo for specs of: ${rawVidPid}`);
                const specs = await crawlSpecsFromWeb(rawVidPid);
                resolve(specs);
            } catch (e) {
                console.error("Error parsing mouse devices WMI:", e);
                resolve(matchedSpecs);
            }
        });
    });
});

// Crawl DuckDuckGo for mouse specs
async function crawlSpecsFromWeb(searchQuery) {
    try {
        const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(searchQuery + " mouse specs dpi rgb buttons")}`;
        const res = await fetch(url, {
            headers: {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
            }
        });
        if (!res.ok) throw new Error("Fetch failed");
        
        const html = await res.text();
        const htmlUpper = html.toUpperCase();
        
        // 1. DPI parsing
        let maxDpi = 16000;
        let dpiMatch = htmlUpper.match(/(\d+)\s*DPI/);
        if (dpiMatch) {
            const val = parseInt(dpiMatch[1]);
            if (val >= 400 && val <= 36000) maxDpi = val;
        }

        // 2. Buttons parsing
        let buttons = 6;
        let btnMatch = htmlUpper.match(/(\d+)\s*BUTTON/);
        if (!btnMatch) btnMatch = htmlUpper.match(/(\d+)\s*BOUTON/);
        if (btnMatch) {
            const val = parseInt(btnMatch[1]);
            if (val >= 2 && val <= 20) buttons = val;
        }

        // 3. RGB checking
        const hasRgb = htmlUpper.includes("RGB") || htmlUpper.includes("CHROMA") || htmlUpper.includes("LIGHTSYNC") || htmlUpper.includes("BACKLIT");

        // Try to fetch a human-readable title for the device from the web page snippets
        let productName = searchQuery;
        const titleMatch = html.match(/<a class="result__url"[^>]*>([^<]+)<\/a>/i);
        if (titleMatch) {
            const cleaned = titleMatch[1].replace(/https?:\/\/(www\.)?/, '').split('/')[0];
            productName = `Mouse (${cleaned})`;
        }

        return {
            product_name: productName,
            max_dpi: maxDpi,
            button_count: buttons,
            has_rgb: hasRgb,
            source: "crawler"
        };
    } catch (e) {
        console.error("DDG crawl failed:", e);
        return { product_name: "Generic USB Mouse", max_dpi: 16000, button_count: 6, has_rgb: true, source: "default" };
    }
}
