// Unified Control Panel - Modern Tauri Desktop JS Client
let hidDevice = null;
let rawaccelSettings = null;
let activeTab = 'tab-dashboard';

// G-LAB Mouse settings state
const mouseSettings = {
    activeDpi: 0,
    dpiProfiles: [
        { value: 4, enabled: true },  // 800 DPI
        { value: 8, enabled: true },  // 1600 DPI
        { value: 24, enabled: true }, // 4800 DPI
        { value: 64, enabled: true }  // 12800 DPI
    ],
    rgbMode: 16,
    scrollMode: 0,
    fireRate: 50,
    buttons: [
        { hex: 0x01, action: 0 },  // LMB
        { hex: 0x02, action: 1 },  // MMB
        { hex: 0x03, action: 2 },  // RMB
        { hex: 0x05, action: 4 },  // SIDE_FWD
        { hex: 0x04, action: 3 },  // SIDE_BWD
        { hex: 0x08, action: 9 },  // MID_FWD
        { hex: 0x06, action: 10 }  // MID_BWD
    ]
};

const actionMenuIdxToHex = [
    0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08, 0x09, 0x0b, 0x0c
];

const svgPartMap = {
    0: 'part-lmb', 1: 'part-wheel', 2: 'part-rmb',
    3: 'part-side-fwd', 4: 'part-side-bwd',
    5: 'part-dpip', 6: 'part-dpim'
};

// DOM Elements - Common & Windows Controls
const deviceStatus = document.getElementById('device-status');
const statusText = document.getElementById('status-text');
const connectBtn = document.getElementById('connect-btn');
const globalApplyBtn = document.getElementById('global-apply');
const globalResetBtn = document.getElementById('global-reset');
const telemetryStatus = document.getElementById('telemetry-status');
const telemetryDelay = document.getElementById('telemetry-delay');

// Tauri Auto-Updater check using Global Tauri API
async function checkTauriUpdate() {
    if (!window.__TAURI__) {
        console.log("Not running inside Tauri.");
        return;
    }
    
    // Support both Tauri v1 and v2 global updater paths
    const updaterPlugin = window.__TAURI__.updater || (window.__TAURI__.plugins ? window.__TAURI__.plugins.updater : null);
    if (!updaterPlugin) {
        console.log("Tauri updater plugin not available globally.");
        return;
    }
    
    try {
        const { check } = updaterPlugin;
        const update = await check();
        
        if (update) {
            console.log(`Update available: ${update.version}`);
            const updateBanner = document.getElementById('update-banner');
            const installBtn = document.getElementById('btn-install-update');
            
            if (updateBanner && installBtn) {
                updateBanner.style.display = 'flex';
                
                installBtn.addEventListener('click', async () => {
                    installBtn.disabled = true;
                    installBtn.textContent = "INSTALLATION...";
                    showTelemetryToast("Téléchargement de la mise à jour...");
                    
                    try {
                        await update.downloadAndInstall();
                        showTelemetryToast("Relaunching app...");
                        
                        const processPlugin = window.__TAURI__.process || (window.__TAURI__.plugins ? window.__TAURI__.plugins.process : null);
                        if (processPlugin && processPlugin.relaunch) {
                            await processPlugin.relaunch();
                        } else {
                            alert("Mise à jour installée. Veuillez redémarrer l'application.");
                        }
                    } catch (err) {
                        installBtn.disabled = false;
                        installBtn.textContent = "INSTALLER LA MAJ";
                        alert("Erreur de mise à jour: " + (err && err.message ? err.message : JSON.stringify(err) || err));
                    }
                });
            }
        } else {
            console.log("App is up to date.");
        }
    } catch (err) {
        console.error("Failed to check for updates:", err);
    }
}

// Call update check on startup
setTimeout(checkTauriUpdate, 2000);

function showTelemetryToast(msg) {
    telemetryStatus.textContent = msg.toUpperCase();
    telemetryStatus.style.color = 'var(--color-primary)';
    setTimeout(() => {
        telemetryStatus.textContent = "ACTIF";
        telemetryStatus.style.color = 'var(--color-success)';
    }, 1500);
}

// Sidebar Nav tabs
document.querySelectorAll('.nav-tab').forEach(button => {
    button.addEventListener('click', () => {
        document.querySelectorAll('.nav-tab').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.tab-screen').forEach(s => s.classList.remove('active'));
        
        button.classList.add('active');
        activeTab = button.dataset.tab;
        document.getElementById(activeTab).classList.add('active');

        // Draw RawAccel replica chart immediately on activate & update button color
        if (activeTab === 'tab-rawaccel') {
            isAimTabActive = false;
            globalApplyBtn.classList.add('rawaccel-tab-active-btn');
            globalApplyBtn.textContent = 'Enregistrer';
            setTimeout(drawRawaccelChart, 50);
        } else if (activeTab === 'tab-aim-trainer') {
            isAimTabActive = true;
            globalApplyBtn.classList.remove('rawaccel-tab-active-btn');
            globalApplyBtn.textContent = 'Appliquer';
            setTimeout(() => {
                initAimCanvas();
                startAimLoop();
            }, 50);
        } else if (activeTab === 'tab-sensor-filters') {
            isAimTabActive = false;
            globalApplyBtn.classList.remove('rawaccel-tab-active-btn');
            globalApplyBtn.textContent = 'Appliquer';
            setTimeout(() => {
                if (typeof resizeSensorCanvas === 'function') {
                    resizeSensorCanvas();
                }
            }, 50);
        } else if (activeTab === 'tab-latency') {
            isAimTabActive = false;
            globalApplyBtn.classList.remove('rawaccel-tab-active-btn');
            globalApplyBtn.textContent = 'Appliquer';
            setTimeout(() => {
                if (typeof initLatencyCanvas === 'function') {
                    initLatencyCanvas();
                }
            }, 50);
        } else {
            isAimTabActive = false;
            globalApplyBtn.classList.remove('rawaccel-tab-active-btn');
            globalApplyBtn.textContent = 'Appliquer';
            updateDpiUI(); // Sync UI color theme with active DPI profile color
        }
    });
});

// ==========================================
// 1. G-LAB MOUSE CONTROLS (WebHID)
// ==========================================
const dpiSlider = document.getElementById('dpi-slider');
const activeDpiDisplay = document.getElementById('active-dpi-display');
const fireRateSlider = document.getElementById('fire-rate-slider');
const fireRateDisplay = document.getElementById('fire-rate-display');
const ledLogo = document.getElementById('led-logo');
const ledStrip = document.getElementById('led-strip');

let detectedMouseLimits = {
    name: "G-LAB Kult Oxygen",
    maxDpi: 12800,
    buttonCount: 7
};

function highlightMouseSvgPart(btnIdx, highlight) {
    const partId = svgPartMap[btnIdx];
    if (!partId) return;
    const part = document.getElementById(partId);
    if (part) {
        if (highlight) part.classList.add('active-part');
        else part.classList.remove('active-part');
    }
}

function rebuildButtonMappingUI(count) {
    const container = document.querySelector('.button-mapping-list');
    if (!container) return;
    container.innerHTML = '';
    
    const standardLabels = [
        "Bouton Gauche (LMB)",
        "Bouton Molette (MMB)",
        "Bouton Droit (RMB)",
        "Bouton Précédent (Fwd)",
        "Bouton Suivant (Bwd)",
        "Bouton DPI +",
        "Bouton DPI -",
        "Bouton Spécial 1 (Sniper)",
        "Bouton Spécial 2",
        "Bouton Spécial 3",
        "Bouton Spécial 4"
    ];
    
    for (let i = 0; i < count; i++) {
        const row = document.createElement('div');
        row.className = 'button-map-row';
        row.dataset.btn = i;
        
        const btnNum = document.createElement('span');
        btnNum.className = 'btn-num';
        btnNum.textContent = i + 1;
        
        const btnLabel = document.createElement('span');
        btnLabel.className = 'btn-label';
        btnLabel.textContent = standardLabels[i] || `Bouton ${i + 1}`;
        
        const select = document.createElement('select');
        select.className = 'btn-select';
        select.id = `btn-select-${i}`;
        
        const options = [
            { value: "0", text: "Clic Gauche" },
            { value: "1", text: "Clic Milieu" },
            { value: "2", text: "Clic Droit" },
            { value: "3", text: "Retour" },
            { value: "4", text: "Avancer" },
            { value: "5", text: "Cycle DPI" },
            { value: "6", text: "Bureau" },
            { value: "7", text: "Double Clic" },
            { value: "8", text: "Tir (Feu)" },
            { value: "9", text: "DPI +" },
            { value: "10", text: "DPI -" }
        ];
        
        options.forEach(opt => {
            const el = document.createElement('option');
            el.value = opt.value;
            el.textContent = opt.text;
            
            // Sensible defaults
            if (i === 0 && opt.value === "0") el.selected = true;
            if (i === 1 && opt.value === "1") el.selected = true;
            if (i === 2 && opt.value === "2") el.selected = true;
            if (i === 3 && opt.value === "3") el.selected = true;
            if (i === 4 && opt.value === "4") el.selected = true;
            if (i === 5 && opt.value === "9") el.selected = true;
            if (i === 6 && opt.value === "10") el.selected = true;
            
            select.appendChild(el);
        });
        
        row.appendChild(btnNum);
        row.appendChild(btnLabel);
        row.appendChild(select);
        container.appendChild(row);
        
        // Hover listeners
        row.addEventListener('mouseenter', () => highlightMouseSvgPart(i, true));
        row.addEventListener('mouseleave', () => highlightMouseSvgPart(i, false));
    }
}

function adjustSvgBlueprint(count) {
    const sideFwd = document.getElementById('part-side-fwd');
    const sideBwd = document.getElementById('part-side-bwd');
    const dpiP = document.getElementById('part-dpip');
    const dpiM = document.getElementById('part-dpim');
    
    if (sideFwd) sideFwd.style.display = count >= 5 ? 'block' : 'none';
    if (sideBwd) sideBwd.style.display = count >= 5 ? 'block' : 'none';
    if (dpiP) dpiP.style.display = count >= 6 ? 'block' : 'none';
    if (dpiM) dpiM.style.display = count >= 7 ? 'block' : 'none';
}

function adaptToDevice(device) {
    const productName = device.productName || "Souris Gaming Universelle";
    let maxDpi = 3200;
    let buttonCount = 5;
    
    const nameUpper = productName.toUpperCase();
    if (nameUpper.includes("G-LAB") || nameUpper.includes("KULT") || nameUpper.includes("OXYGEN")) {
        maxDpi = 12800;
        buttonCount = 7;
    } else if (nameUpper.includes("LOGITECH") || nameUpper.includes("G502") || nameUpper.includes("G305") || nameUpper.includes("HERO")) {
        maxDpi = 25600;
        buttonCount = 11;
    } else if (nameUpper.includes("RAZER") || nameUpper.includes("DEATHADDER") || nameUpper.includes("BASILISK") || nameUpper.includes("VIPER")) {
        maxDpi = 20000;
        buttonCount = 8;
    } else if (nameUpper.includes("CORSAIR") || nameUpper.includes("M65") || nameUpper.includes("SABRE")) {
        maxDpi = 18000;
        buttonCount = 8;
    } else if (nameUpper.includes("STEELSERIES") || nameUpper.includes("RIVAL") || nameUpper.includes("AEROX")) {
        maxDpi = 18000;
        buttonCount = 6;
    } else {
        // Generic gaming mouse profile
        maxDpi = 16000;
        buttonCount = 6;
    }
    
    detectedMouseLimits = {
        name: productName,
        maxDpi: maxDpi,
        buttonCount: buttonCount
    };
    
    // Update Header status
    statusText.textContent = `${productName.toUpperCase()} CONNECTÉ`;
    
    // Update DPI slider maximum limit
    const steps = Math.round(maxDpi / 200);
    dpiSlider.max = steps;
    
    // Update DPI Labels
    document.getElementById('dpi-mid-label').textContent = `${Math.round(maxDpi / 2)} DPI`;
    document.getElementById('dpi-max-label').textContent = `${maxDpi} DPI`;
    document.getElementById('dpi-sensor-desc').textContent = `Le capteur détecté supporte ${steps} pas physiques de 200 DPI chacun (Maximum : ${maxDpi} DPI).`;
    
    // Rebuild Button mappings UI list
    rebuildButtonMappingUI(buttonCount);
    
    // Adjust SVG Blueprint visible layers
    adjustSvgBlueprint(buttonCount);
    
    showTelemetryToast(`Profil détecté : ${productName}`);
}

function revertToDefaultDevice() {
    detectedMouseLimits = {
        name: "G-LAB Kult Oxygen",
        maxDpi: 12800,
        buttonCount: 7
    };
    
    statusText.textContent = 'PÉRIPHÉRIQUE DÉCONNECTÉ';
    
    dpiSlider.max = 64;
    document.getElementById('dpi-mid-label').textContent = '6400 DPI';
    document.getElementById('dpi-max-label').textContent = '12800 DPI';
    document.getElementById('dpi-sensor-desc').textContent = 'Configurez les pas du capteur. L\'Instant A704 supporte 64 pas physiques de 200 DPI chacun.';
    
    rebuildButtonMappingUI(7);
    adjustSvgBlueprint(7);
}

function hexToRgb(hex) {
    if (!hex) return null;
    hex = hex.replace('#', '').trim();
    if (hex.length === 3) {
        hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
    }
    const r = parseInt(hex.substring(0, 2), 16);
    const g = parseInt(hex.substring(2, 4), 16);
    const b = parseInt(hex.substring(4, 6), 16);
    return isNaN(r) || isNaN(g) || isNaN(b) ? null : `${r}, ${g}, ${b}`;
}

async function connectDevice() {
    if (hidDevice) {
        await hidDevice.close();
        onDeviceDisconnected();
        return;
    }
    const modal = document.getElementById('connection-modal');
    if (modal) {
        const primaryColor = getComputedStyle(document.documentElement).getPropertyValue('--color-primary').trim();
        const primaryRGB = hexToRgb(primaryColor) || "0, 210, 255";
        document.documentElement.style.setProperty('--color-primary-rgb', primaryRGB);
        modal.style.display = 'flex';
    }
    try {
        const devices = await navigator.hid.requestDevice({
            filters: [
                { usagePage: 0x01, usage: 0x02 } // Strictly restrict WebHID pairing dialog to Mouse / Pointer devices
            ]
        });
        if (devices.length === 0) {
            return;
        }
        let targetDev = devices[0];
        await targetDev.open();
        hidDevice = targetDev;
        onDeviceConnected(hidDevice);
    } catch (err) {
        alert("Erreur de connexion : " + err.message);
    } finally {
        if (modal) {
            modal.style.display = 'none';
        }
    }
}

function onDeviceConnected(device) {
    deviceStatus.className = 'status-badge connected';
    connectBtn.textContent = 'Déconnecter';
    connectBtn.classList.add('connected');
    
    // Sync widget connect button
    const widgetConnectBtn = document.getElementById('widget-connect-btn');
    if (widgetConnectBtn) {
        widgetConnectBtn.textContent = 'Déconnecter';
        widgetConnectBtn.style.background = 'linear-gradient(135deg, #1e293b, #0f172a)';
        widgetConnectBtn.style.color = 'var(--color-error)';
        widgetConnectBtn.style.border = '1px solid rgba(244, 63, 94, 0.2)';
        widgetConnectBtn.style.boxShadow = 'none';
    }
    
    // Sync Radar status info
    const connectionText = document.getElementById('connection-widget-text');
    if (connectionText) {
        connectionText.textContent = `Kult Oxygen - Connecté sur Port WebHID (ACTIF)`;
        connectionText.style.color = 'var(--color-success)';
    }
    const ping1 = document.getElementById('radar-ping-1');
    const ping2 = document.getElementById('radar-ping-2');
    if (ping1) ping1.style.display = 'none';
    if (ping2) ping2.style.display = 'none';
    
    const connIcon = document.getElementById('connection-icon');
    if (connIcon) {
        connIcon.style.fill = 'var(--color-success)';
    }

    telemetryStatus.textContent = 'ACTIF';
    telemetryStatus.style.color = 'var(--color-success)';
    
    adaptToDevice(device);
    
    const previewCard = document.getElementById('mouse-preview-card');
    if (previewCard) previewCard.classList.add('device-connected');
}

function onDeviceDisconnected() {
    hidDevice = null;
    deviceStatus.className = 'status-badge disconnected';
    connectBtn.textContent = 'Connecter la Souris';
    connectBtn.classList.remove('connected');
    
    // Sync widget connect button
    const widgetConnectBtn = document.getElementById('widget-connect-btn');
    if (widgetConnectBtn) {
        widgetConnectBtn.textContent = 'Connecter la Souris';
        widgetConnectBtn.style.background = 'linear-gradient(135deg, var(--color-primary), #00a2ff)';
        widgetConnectBtn.style.color = '#000';
        widgetConnectBtn.style.border = 'none';
        widgetConnectBtn.style.boxShadow = '0 4px 12px rgba(0, 210, 255, 0.2)';
    }
    
    // Sync Radar status info
    const connectionText = document.getElementById('connection-widget-text');
    if (connectionText) {
        connectionText.textContent = `Périphérique déconnecté. En attente d'association USB...`;
        connectionText.style.color = 'var(--text-secondary)';
    }
    const ping1 = document.getElementById('radar-ping-1');
    const ping2 = document.getElementById('radar-ping-2');
    if (ping1) ping1.style.display = 'block';
    if (ping2) ping2.style.display = 'block';
    
    const connIcon = document.getElementById('connection-icon');
    if (connIcon) {
        connIcon.style.fill = 'var(--color-primary)';
    }

    telemetryStatus.textContent = 'INACTIF';
    telemetryStatus.style.color = 'var(--color-primary)';
    
    revertToDefaultDevice();
    
    const previewCard = document.getElementById('mouse-preview-card');
    if (previewCard) previewCard.classList.remove('device-connected');
}

connectBtn.addEventListener('click', connectDevice);
const widgetConnectBtn = document.getElementById('widget-connect-btn');
if (widgetConnectBtn) {
    widgetConnectBtn.addEventListener('click', connectDevice);
}
navigator.hid.addEventListener('disconnect', (e) => {
    if (hidDevice && e.device === hidDevice) onDeviceDisconnected();
});

function updateDpiUI() {
    for (let i = 0; i < 4; i++) {
        const isRadioActive = document.querySelector(`input[name="active-dpi"][value="${i}"]`).checked;
        const readout = document.getElementById(`dpi-val-readout-${i}`);
        const dpiRow = document.querySelector(`.dpi-row[data-idx="${i}"]`);
        
        readout.textContent = `${mouseSettings.dpiProfiles[i].value * 200} DPI`;
        
        if (isRadioActive) {
            dpiRow.classList.add('active-profile');
            mouseSettings.activeDpi = i;
            dpiSlider.value = mouseSettings.dpiProfiles[i].value;
            activeDpiDisplay.textContent = `${mouseSettings.dpiProfiles[i].value * 200} DPI`;
            
            const activeColors = ['#0088ff', '#ffaa00', '#00ff66', '#ff00ff'];
            const customStored = localStorage.getItem('GLAB_THEME_CUSTOM');
            if (!customStored) {
                document.documentElement.style.setProperty('--color-primary', activeColors[i]);
            }
        } else {
            dpiRow.classList.remove('active-profile');
        }
    }
    updateRgbVisualizer();
    if (typeof syncDashboardDpi === 'function') {
        syncDashboardDpi();
    }
}

document.querySelectorAll('input[name="active-dpi"]').forEach(radio => {
    radio.addEventListener('change', updateDpiUI);
});

document.querySelectorAll('.custom-checkbox input').forEach((checkbox, idx) => {
    checkbox.addEventListener('change', (e) => {
        mouseSettings.dpiProfiles[idx].enabled = e.target.checked;
        updateDpiUI();
    });
});

dpiSlider.addEventListener('input', (e) => {
    const val = parseInt(e.target.value);
    mouseSettings.dpiProfiles[mouseSettings.activeDpi].value = val;
    updateDpiUI();
});

document.querySelectorAll('input[name="rgb-mode"]').forEach(radio => {
    radio.addEventListener('change', (e) => {
        mouseSettings.rgbMode = parseInt(e.target.value);
        updateRgbVisualizer();
    });
});

function updateRgbVisualizer() {
    let color = '#00d2ff';
    let anim = 'none';
    const activeColors = ['#0088ff', '#ffaa00', '#00ff66', '#ff00ff'];
    const activeColor = activeColors[mouseSettings.activeDpi];
    
    switch (mouseSettings.rgbMode) {
        case 16:
            color = activeColor;
            anim = 'pulseLed 4s infinite alternate';
            break;
        case 19:
            color = activeColor;
            anim = 'pulseLed 1.5s infinite alternate';
            break;
        case 21:
            color = activeColor;
            anim = 'pulseLed 0.5s infinite alternate';
            break;
        case 22:
            color = activeColor;
            anim = 'none';
            break;
        case 23:
            color = '#111';
            anim = 'none';
            break;
    }
    
    if(ledLogo && ledStrip) {
        ledLogo.style.backgroundColor = color;
        ledLogo.style.boxShadow = mouseSettings.rgbMode !== 23 ? `0 0 12px ${color}` : 'none';
        ledLogo.style.animation = anim;
        ledStrip.style.borderColor = color;
        ledStrip.style.boxShadow = mouseSettings.rgbMode !== 23 ? `0 0 10px ${color}` : 'none';
        ledStrip.style.animation = anim;
    }
}

// CSS injection for lights animation
const styleSheet = document.createElement("style");
styleSheet.innerText = `@keyframes pulseLed { 0% { opacity: 0.2; } 100% { opacity: 1; } }`;
document.head.appendChild(styleSheet);

document.querySelectorAll('.btn-select').forEach((select, idx) => {
    if(select.id.startsWith("btn-select-")) {
        select.addEventListener('change', (e) => {
            mouseSettings.buttons[idx].action = parseInt(e.target.value);
        });

        select.addEventListener('mouseenter', () => {
            const partId = svgPartMap[idx];
            const part = document.getElementById(partId);
            if (part) part.classList.add('active-part');
        });

        select.addEventListener('mouseleave', () => {
            const partId = svgPartMap[idx];
            const part = document.getElementById(partId);
            if (part) part.classList.remove('active-part');
        });
    }
});

Object.keys(svgPartMap).forEach(idx => {
    const partId = svgPartMap[idx];
    const part = document.getElementById(partId);
    if (part) {
        part.addEventListener('mouseenter', () => {
            const row = document.querySelector(`.button-map-row[data-btn="${idx}"]`);
            if (row) row.style.borderColor = 'var(--color-primary)';
            part.classList.add('active-part');
        });
        part.addEventListener('mouseleave', () => {
            const row = document.querySelector(`.button-map-row[data-btn="${idx}"]`);
            if (row) row.style.borderColor = 'var(--border-color)';
            part.classList.remove('active-part');
        });
        part.addEventListener('click', () => {
            const selectEl = document.getElementById(`btn-select-${idx}`);
            if (selectEl) {
                document.querySelector('.nav-tab[data-tab="tab-buttons"]').click();
                selectEl.focus();
                const row = document.querySelector(`.button-map-row[data-btn="${idx}"]`);
                if (row) {
                    row.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                    row.style.borderColor = 'var(--color-primary)';
                    row.style.boxShadow = '0 0 15px var(--color-primary)';
                    setTimeout(() => {
                        row.style.borderColor = 'var(--border-color)';
                        row.style.boxShadow = 'none';
                    }, 800);
                }
            }
        });
    }
});

document.querySelectorAll('input[name="scroll-mode"]').forEach(radio => {
    radio.addEventListener('change', (e) => {
        mouseSettings.scrollMode = parseInt(e.target.value);
    });
});

if(fireRateSlider) {
    fireRateSlider.addEventListener('input', (e) => {
        const val = parseInt(e.target.value);
        mouseSettings.fireRate = val;
        fireRateDisplay.textContent = `${val} ms`;
    });
}

const debounceTimeSlider = document.getElementById('debounce-time');
const debounceDisplay = document.getElementById('debounce-display');
if(debounceTimeSlider) {
    debounceTimeSlider.addEventListener('input', (e) => {
        debounceDisplay.textContent = `${e.target.value} ms`;
    });
}

// ==========================================
// 3. EDPI & SENSITIVITY CALCULATOR
// ==========================================
const btnCalcEdpi = document.getElementById('btn-calc-edpi');
if (btnCalcEdpi) {
    btnCalcEdpi.addEventListener('click', () => {
        const mouseDpi = parseFloat(document.getElementById('edpi-mouse-dpi').value) || 800;
        const inGameSens = parseFloat(document.getElementById('edpi-in-game').value) || 1.0;
        const game = document.getElementById('edpi-game').value;
        const useRawaccel = document.getElementById('edpi-use-rawaccel').checked;
        
        let rawaccelMultiplier = 1.0;
        if (useRawaccel) {
            const rawaccelField = document.getElementById('out-dpi-accel');
            if (rawaccelField) {
                rawaccelMultiplier = parseFloat(rawaccelField.value) || 1.0;
            }
        }
        
        let edpi = mouseDpi * inGameSens * rawaccelMultiplier;
        let yaw = 0.022; // Source Engine default (CS2, Apex)
        
        if (game === 'valorant') {
            yaw = 0.07;
        } else if (game === 'rainbow6') {
            yaw = 0.00573; // R6 Siege default multiplier
        } else if (game === 'overwatch') {
            yaw = 0.0066;
        }
        
        let cm360 = (360 / (edpi * yaw)) * 2.54;
        
        document.getElementById('edpi-result-val').textContent = Math.round(edpi);
        document.getElementById('cm360-result-val').textContent = cm360.toFixed(1) + ' cm';
    });
    
    document.getElementById('edpi-use-rawaccel').addEventListener('change', () => btnCalcEdpi.click());
    
    // Calculate initial value on load
    setTimeout(() => btnCalcEdpi.click(), 100);
}

async function sendMouseReport(updateType, forComponent, data, enabledDpiProfile = 0x00) {
    if (!hidDevice) return;
    const reportData = new Uint8Array(7);
    reportData[0] = updateType;
    reportData[1] = forComponent;
    reportData[2] = data;
    reportData[3] = enabledDpiProfile;
    try {
        await hidDevice.sendFeatureReport(0x07, reportData);
    } catch (err) {
        console.error("HID transmission error:", err);
    }
}

async function saveMouseSettingsToDevice() {
    if (!hidDevice) {
        alert("Périphérique déconnecté. Veuillez cliquer sur 'Initialiser WebHID' pour vous connecter.");
        return;
    }
    const tStart = performance.now();
    try {
        await sendMouseReport(0x13, 0x7f, mouseSettings.rgbMode);
        await new Promise(r => setTimeout(r, 20));
        await sendMouseReport(0x11, mouseSettings.scrollMode, 0x00);
        await new Promise(r => setTimeout(r, 20));
        await sendMouseReport(0x12, 0x00, mouseSettings.fireRate);
        await new Promise(r => setTimeout(r, 20));
        
        for (let i = 0; i < 7; i++) {
            const btn = mouseSettings.buttons[i];
            const actionHex = actionMenuIdxToHex[btn.action];
            await sendMouseReport(0x10, btn.hex, actionHex);
            await new Promise(r => setTimeout(r, 10));
        }
        
        let enabledDpiBit = 0;
        for (let i = 0; i < 4; i++) {
            if (mouseSettings.dpiProfiles[i].enabled) enabledDpiBit |= (1 << i);
        }
        
        for (let i = 0; i < 4; i++) {
            const profile = mouseSettings.dpiProfiles[i];
            const profileBits = 0x08 + i;
            const dataVal = (profile.value << 4) | profileBits;
            await sendMouseReport(0x09, mouseSettings.activeDpi, dataVal, enabledDpiBit);
            await new Promise(r => setTimeout(r, 15));
        }
        
        const delay = Math.round(performance.now() - tStart);
        telemetryDelay.textContent = `${delay} ms`;
        showTelemetryToast("Configuration souris enregistrée");
    } catch (err) {
        alert("Erreur d'application souris : " + err.message);
    }
}

// ==========================================
// 2. RAWACCEL EXACT REPLICA IMPLEMENTATION
// ==========================================
const sensMultiInput = document.getElementById('out-dpi-accel');
const valSensMulti = document.getElementById('val-sens-multi');

const yxRatioAccelInput = document.getElementById('yx-ratio-accel');
const valYxRatio = document.getElementById('val-yx-ratio');
const btnLockYx = document.getElementById('btn-lock-yx');

const rotationAccelInput = document.getElementById('rotation-accel');
const valRotation = document.getElementById('val-rotation');

const accelModeRawSelect = document.getElementById('accel-mode-raw');
const valModeIndicator = document.getElementById('val-mode-indicator');

const chkGain = document.getElementById('chk-gain');
const valGainText = document.getElementById('val-gain-text');

const paramAccelRawInput = document.getElementById('param-accel-raw');
const valAccel = document.getElementById('val-accel');

const capModeRawSelect = document.getElementById('cap-mode-raw');
const valCapType = document.getElementById('val-cap-type');

const paramLimitRawInput = document.getElementById('param-limit-raw');
const valCapVal = document.getElementById('val-cap-val');

const paramOffsetRawInput = document.getElementById('param-offset-raw');
const valOffset = document.getElementById('val-offset');
const paramRawSmoothInput = document.getElementById('param-raw-smooth');
const valRawSmooth = document.getElementById('val-raw-smooth');
const capValXInput = document.getElementById('param-cap-input-raw') || { value: 15.0 };

// UI Accordions
const anisotropyTrigger = document.getElementById('btn-anisotropy');
const anisotropyContainer = document.querySelector('.anisotropy-container');
const anisotropyContent = document.getElementById('anisotropy-content');

anisotropyTrigger.addEventListener('click', () => {
    anisotropyContainer.classList.toggle('active');
    anisotropyContent.style.display = anisotropyContainer.classList.contains('active') ? 'block' : 'none';
});

const guideTrigger = document.getElementById('guide-accordion-trigger');
const guideCard = document.querySelector('.guide-card');

guideTrigger.addEventListener('click', () => {
    guideCard.classList.toggle('active');
});

// Sync input labels and values
function syncRawaccelValues() {
    valSensMulti.textContent = parseFloat(sensMultiInput.value).toFixed(2);
    valYxRatio.textContent = parseFloat(yxRatioAccelInput.value).toFixed(2);
    valRotation.textContent = Math.round(parseFloat(rotationAccelInput.value));
    
    // Mode Label
    const selectedModeText = accelModeRawSelect.options[accelModeRawSelect.selectedIndex].text;
    valModeIndicator.textContent = selectedModeText;
    
    valGainText.textContent = chkGain.checked ? "Gain" : "Velocity";
    valAccel.textContent = parseFloat(paramAccelRawInput.value).toFixed(4);
    
    const selectedCapText = capModeRawSelect.options[capModeRawSelect.selectedIndex].text;
    valCapType.textContent = selectedCapText;
    valCapVal.textContent = parseFloat(paramLimitRawInput.value).toFixed(2);
    valOffset.textContent = parseFloat(paramOffsetRawInput.value).toFixed(2);
    if (paramRawSmoothInput && valRawSmooth) {
        valRawSmooth.textContent = `${parseFloat(paramRawSmoothInput.value).toFixed(2)} ms`;
    }
}

// Lock Y/X handling
let isYxLocked = true;
btnLockYx.addEventListener('click', () => {
    isYxLocked = !isYxLocked;
    btnLockYx.classList.toggle('active', isYxLocked);
    showTelemetryToast(isYxLocked ? "Ratios Y/X verrouillés" : "Ratios Y/X dissociés");
});

async function fetchRawaccelSettings() {
    try {
        if (window.__TAURI__) {
            rawaccelSettings = await window.__TAURI__.core.invoke('read_rawaccel_settings');
        } else {
            const res = await fetch('/api/rawaccel/settings');
            if (!res.ok) throw new Error("Impossible de lire settings.json");
            rawaccelSettings = await res.json();
        }
        
        populateRawaccelUI(rawaccelSettings);
        syncRawaccelValues();
        drawRawaccelChart();
    } catch (err) {
        console.error("Fetch rawaccel settings error:", err);
    }
}

function updateRawaccelFields() {
    const mode = accelModeRawSelect.value;
    const offsetRow = paramOffsetRawInput.closest('.rawaccel-row');
    const accelRow = paramAccelRawInput.closest('.rawaccel-row');
    const capValRow = paramLimitRawInput.closest('.rawaccel-row');
    const capTypeRow = capModeRawSelect.closest('.rawaccel-row');
    const lutGroup = document.getElementById('group-lut-data');
    
    // Defaults
    if (offsetRow) offsetRow.style.display = 'flex';
    if (accelRow) accelRow.style.display = 'flex';
    if (capValRow) capValRow.style.display = 'flex';
    if (capTypeRow) capTypeRow.style.display = 'flex';
    if (lutGroup) lutGroup.style.display = 'none';
    
    if (mode === 'lut') {
        if (offsetRow) offsetRow.style.display = 'none';
        if (accelRow) accelRow.style.display = 'none';
        if (capValRow) capValRow.style.display = 'none';
        if (capTypeRow) capTypeRow.style.display = 'none';
        if (lutGroup) lutGroup.style.display = 'block';
    } else if (mode === 'noaccel') {
        if (offsetRow) offsetRow.style.display = 'none';
        if (accelRow) accelRow.style.display = 'none';
        if (capValRow) capValRow.style.display = 'none';
        if (capTypeRow) capTypeRow.style.display = 'none';
    } else if (mode === 'natural') {
        if (offsetRow) offsetRow.style.display = 'none';
    } else if (mode === 'synchronous') {
        if (offsetRow) offsetRow.style.display = 'none';
    }
}

function parseLutPoints() {
    const lutTextarea = document.getElementById('param-lut-points');
    if (!lutTextarea) return [];
    const text = lutTextarea.value;
    const lines = text.split('\n');
    const points = [];
    lines.forEach(line => {
        const parts = line.split(',');
        if (parts.length === 2) {
            const x = parseFloat(parts[0]);
            const y = parseFloat(parts[1]);
            if (!isNaN(x) && !isNaN(y)) {
                points.push({ x, y });
            }
        }
    });
    // Sort points by X
    points.sort((a, b) => a.x - b.x);
    return points;
}

function populateRawaccelUI(settings) {
    const profile = settings.profiles[0];
    
    sensMultiInput.value = profile["Output DPI"] ? (profile["Output DPI"] / 1000).toFixed(2) : "1.00";
    yxRatioAccelInput.value = profile["Y/X output DPI ratio (vertical sens multiplier)"] || "1.00";
    rotationAccelInput.value = profile["Degrees of rotation"] || "0";
    
    const params = profile["Whole or horizontal accel parameters"];
    accelModeRawSelect.value = params.mode || "classic";
    chkGain.checked = params["Gain / Velocity"] !== undefined ? params["Gain / Velocity"] : true;
    
    paramAccelRawInput.value = params.acceleration !== undefined ? params.acceleration : 0.025;
    paramLimitRawInput.value = params.limit !== undefined ? params.limit : 1.8;
    paramOffsetRawInput.value = params.inputOffset !== undefined ? params.inputOffset : 0.3;
    if (paramRawSmoothInput) {
        paramRawSmoothInput.value = params.smooth !== undefined ? params.smooth : 0.5;
    }
    capModeRawSelect.value = params["Cap mode"] || "output";
    capValXInput.value = params["Cap / Jump"] ? params["Cap / Jump"].x : 15.0;
    
    if (params.data && params.data.length > 0) {
        const pointsText = params.data.map(pt => `${pt[0]}, ${pt[1]}`).join('\n');
        document.getElementById('param-lut-points').value = pointsText;
    } else {
        document.getElementById('param-lut-points').value = "0.0, 1.0\n10.0, 1.25\n20.0, 1.50\n30.0, 1.80";
    }
    
    updateRawaccelFields();
}

// Accel math formula
function getRawaccelMultiplierValue(x) {
    const mode = accelModeRawSelect.value;
    const accel = parseFloat(paramAccelRawInput.value) || 0;
    const limit = parseFloat(paramLimitRawInput.value) || 1;
    const offset = parseFloat(paramOffsetRawInput.value) || 0;
    const capMode = capModeRawSelect.value;
    
    if (mode === 'noaccel') return 1.0;
    
    if (mode === 'lut') {
        const points = parseLutPoints();
        if (points.length === 0) return 1.0;
        if (x <= points[0].x) return points[0].y;
        if (x >= points[points.length - 1].x) return points[points.length - 1].y;
        
        // Linear interpolation
        for (let i = 0; i < points.length - 1; i++) {
            if (x >= points[i].x && x <= points[i+1].x) {
                const p0 = points[i];
                const p1 = points[i+1];
                const t = (x - p0.x) / (p1.x - p0.x);
                return p0.y + t * (p1.y - p0.y);
            }
        }
        return 1.0;
    }
    
    let evalX = x;
    const capX = 15.0; // Input Cap default reference
    if ((capMode === 'input' || capMode === 'in_out') && x > capX) evalX = capX;
    
    let sens = 1.0;
    
    if (mode === 'classic') {
        if (evalX >= offset) {
            sens = 1 + accel * (evalX - offset);
        }
    } else if (mode === 'power') {
        if (evalX >= offset) {
            sens = 1 + accel * Math.pow(evalX - offset, 2.0);
        }
    } else if (mode === 'natural') {
        sens = limit - (limit - 1) * Math.exp(-accel * evalX);
    } else if (mode === 'jump') {
        sens = evalX >= offset ? limit : 1.0;
    } else if (mode === 'synchronous') {
        sens = 1 + accel * evalX;
    }
    
    if (capMode === 'output' || capMode === 'in_out') {
        sens = Math.min(sens, limit);
    }
    return sens;
}

// Accurate RawAccel grid and graph renderer
const rawCanvas = document.getElementById('rawaccel-exact-canvas');
const rawCtx = rawCanvas ? rawCanvas.getContext('2d') : null;

// Track last mouse move coordinate on curve
let lastRecordedSpeed = 0.0;

function drawRawaccelChart() {
    if (!rawCanvas || !rawCtx) return;
    
    const rect = rawCanvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    rawCanvas.width = rect.width * dpr;
    rawCanvas.height = rect.height * dpr;
    rawCtx.scale(dpr, dpr);
    
    const w = rect.width;
    const h = rect.height;
    
    // Clear back (pure RawAccel grey/black)
    rawCtx.fillStyle = '#080a0f';
    rawCtx.fillRect(0, 0, w, h);
    
    // Axes limits
    const minX = 0;
    const maxX = 40;
    const minY = 0.9;
    const maxY = 1.8;
    
    // Helper coordinates mapping
    function mapX(xVal) {
        return ((xVal - minX) / (maxX - minX)) * w;
    }
    function mapY(yVal) {
        return h - ((yVal - minY) / (maxY - minY)) * h;
    }
    
    // Draw fine grid subdivisions (dashed lines)
    rawCtx.lineWidth = 0.5;
    
    // Vertical subdivision lines (Linear grids at steps of 1 unit)
    for (let x = 1; x < maxX; x++) {
        if (x % 10 === 0) continue; // Skip main solid lines
        rawCtx.strokeStyle = 'rgba(255,255,255,0.025)';
        rawCtx.setLineDash([2, 4]);
        
        const cx = mapX(x);
        rawCtx.beginPath();
        rawCtx.moveTo(cx, 0);
        rawCtx.lineTo(cx, h);
        rawCtx.stroke();
    }
    
    // Horizontal subdivisions
    const ySteps = [0.9, 0.99, 1.08, 1.17, 1.26, 1.35, 1.44, 1.53, 1.62, 1.71, 1.8];
    ySteps.forEach(y => {
        const checkLabel = Math.round(y * 100) / 100;
        const mainLabelVal = [0.9, 1.08, 1.26, 1.44, 1.62, 1.8];
        const isMain = mainLabelVal.some(v => Math.abs(v - checkLabel) < 0.01);
        
        if (isMain) {
            // Solid main step grid
            rawCtx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
            rawCtx.setLineDash([]);
        } else {
            // Dashed subdivision grid
            rawCtx.strokeStyle = 'rgba(255, 255, 255, 0.02)';
            rawCtx.setLineDash([2, 4]);
        }
        
        const cy = mapY(y);
        rawCtx.beginPath();
        rawCtx.moveTo(0, cy);
        rawCtx.lineTo(w, cy);
        rawCtx.stroke();
        
        // Render labels on main grid values
        if (isMain) {
            rawCtx.fillStyle = '#64748b';
            rawCtx.font = '9px Share Tech Mono';
            rawCtx.fillText(y.toFixed(2), 6, cy - 4);
        }
    });
    
    // Main Solid Vertical Grids (0, 10, 20, 30, 40)
    rawCtx.setLineDash([]);
    rawCtx.lineWidth = 0.8;
    for (let x = 0; x <= maxX; x += 10) {
        rawCtx.strokeStyle = 'rgba(255, 255, 255, 0.09)';
        const cx = mapX(x);
        
        rawCtx.beginPath();
        rawCtx.moveTo(cx, 0);
        rawCtx.lineTo(cx, h);
        rawCtx.stroke();
        
        // Label
        rawCtx.fillStyle = '#64748b';
        rawCtx.font = '9px Share Tech Mono';
        rawCtx.fillText(x.toString(), cx + 4, h - 8);
    }
    
    // Visual guidelines (Offset / Cap Limit)
    const offsetVal = parseFloat(paramOffsetRawInput.value) || 0;
    const limitVal = parseFloat(paramLimitRawInput.value) || 1.8;
    const currentMode = accelModeRawSelect.value;
    
    const offsetRow = paramOffsetRawInput.closest('.rawaccel-row');
    if (offsetRow && offsetRow.style.display !== 'none' && offsetVal > 0 && offsetVal < maxX) {
        rawCtx.strokeStyle = 'rgba(239, 68, 68, 0.35)';
        rawCtx.setLineDash([4, 4]);
        rawCtx.lineWidth = 1;
        const cx = mapX(offsetVal);
        rawCtx.beginPath();
        rawCtx.moveTo(cx, 0);
        rawCtx.lineTo(cx, h);
        rawCtx.stroke();
        
        rawCtx.fillStyle = 'rgba(239, 68, 68, 0.65)';
        rawCtx.font = '8px Share Tech Mono';
        rawCtx.fillText(`Offset (${offsetVal})`, cx + 4, 15);
    }
    
    const capValRow = paramLimitRawInput.closest('.rawaccel-row');
    if (capValRow && capValRow.style.display !== 'none' && limitVal > minY && limitVal < maxY) {
        rawCtx.strokeStyle = 'rgba(239, 68, 68, 0.35)';
        rawCtx.setLineDash([4, 4]);
        rawCtx.lineWidth = 1;
        const cy = mapY(limitVal);
        rawCtx.beginPath();
        rawCtx.moveTo(0, cy);
        rawCtx.lineTo(w, cy);
        rawCtx.stroke();
        
        rawCtx.fillStyle = 'rgba(239, 68, 68, 0.65)';
        rawCtx.font = '8px Share Tech Mono';
        rawCtx.fillText(`Limit (${limitVal.toFixed(2)}x)`, w - 65, cy - 4);
    }
    rawCtx.setLineDash([]);

    // Plot the Accelerated Sensitivity (Exact Blue Curve)
    rawCtx.strokeStyle = '#2563eb';
    rawCtx.lineWidth = 2.0;
    rawCtx.beginPath();
    
    for (let px = 0; px <= w; px++) {
        const xVal = minX + (px / w) * (maxX - minX);
        const yVal = getRawaccelMultiplierValue(xVal);
        const py = mapY(yVal);
        
        if (px === 0) rawCtx.moveTo(px, py);
        else rawCtx.lineTo(px, py);
    }
    rawCtx.stroke();
    
    // Plot the "Last Mouse Move" indicator (Red Square)
    const trackedY = getRawaccelMultiplierValue(lastRecordedSpeed);
    const squareSize = 6;
    
    rawCtx.fillStyle = '#ef4444';
    rawCtx.fillRect(
        mapX(lastRecordedSpeed) - squareSize / 2,
        mapY(trackedY) - squareSize / 2,
        squareSize,
        squareSize
    );
}

// Sub-millisecond high-speed mouse tracking loop
let lastTrackedTime = 0;
let lastTrackedPos = null;

window.addEventListener('mousemove', (e) => {
    if (activeTab !== 'tab-rawaccel') return;
    
    const now = performance.now();
    const pos = { x: e.clientX, y: e.clientY };
    
    if (lastTrackedPos && lastTrackedTime > 0) {
        const dt = now - lastTrackedTime; // Sub-millisecond interval
        if (dt > 1) { // High frequency sample (>1ms)
            const dx = pos.x - lastTrackedPos.x;
            const dy = pos.y - lastTrackedPos.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            
            const rawSpeed = dist / dt; // pixels per millisecond
            
            // Average over tiny window
            speedHistory.push(rawSpeed);
            if (speedHistory.length > 5) speedHistory.shift();
            
            const averaged = speedHistory.reduce((a, b) => a + b, 0) / speedHistory.length;
            
            // Scale and map to counts/ms axis (RawAccel typical peak is 40 counts/ms)
            const mappedSpeed = Math.min(40.0, averaged * 7.5);
            lastRecordedSpeed = mappedSpeed;
            
            // Redraw chart to update red square position immediately!
            drawRawaccelChart();
            
            // Log live numbers on card
            const currentMultiplier = getRawaccelMultiplierValue(mappedSpeed);
            const liveSpeedEl = document.getElementById('live-speed');
            const liveSensEl = document.getElementById('live-sens');
            if (liveSpeedEl) liveSpeedEl.textContent = mappedSpeed.toFixed(2);
            if (liveSensEl) liveSensEl.textContent = currentMultiplier.toFixed(2);
        }
    }
    
    lastTrackedPos = pos;
    lastTrackedTime = now;
});

// UI Event listeners to trigger immediate chart redraws
const rawaccelFormInputs = [
    sensMultiInput, yxRatioAccelInput, rotationAccelInput,
    accelModeRawSelect, chkGain, paramAccelRawInput,
    capModeRawSelect, paramLimitRawInput, paramOffsetRawInput,
    paramRawSmoothInput
];

rawaccelFormInputs.forEach(input => {
    if (input) {
        input.addEventListener('input', () => {
            syncRawaccelValues();
            drawRawaccelChart();
        });
    }
});

if (accelModeRawSelect) {
    accelModeRawSelect.addEventListener('change', () => {
        updateRawaccelFields();
        syncRawaccelValues();
        drawRawaccelChart();
    });
}

const lutTextarea = document.getElementById('param-lut-points');
if (lutTextarea) {
    lutTextarea.addEventListener('input', () => {
        drawRawaccelChart();
    });
}

// Hardware G-LAB Advanced settings listeners
const pollingRateSelect = document.getElementById('polling-rate');
const lodSelect = document.getElementById('lod-select');
const doubleClickSlider = document.getElementById('double-click-slider');
const doubleClickDisplay = document.getElementById('double-click-display');

if (doubleClickSlider && doubleClickDisplay) {
    doubleClickSlider.addEventListener('input', (e) => {
        const val = parseInt(e.target.value);
        doubleClickDisplay.textContent = `${val} ms`;
        mouseSettings.doubleClickSpeed = val;
    });
    doubleClickSlider.addEventListener('change', (e) => {
        const val = parseInt(e.target.value);
        showTelemetryToast(`Vitesse double-clic : ${val} ms`);
    });
}

if (pollingRateSelect) {
    pollingRateSelect.addEventListener('change', (e) => {
        const val = parseInt(e.target.value);
        mouseSettings.pollingRate = val;
        showTelemetryToast(`Taux de rapports : ${val} Hz`);
    });
}

if (lodSelect) {
    lodSelect.addEventListener('change', (e) => {
        const val = parseInt(e.target.value);
        mouseSettings.lod = val;
        showTelemetryToast(val === 0 ? "Distance de détection : Basse (1.5mm)" : "Distance de détection : Haute (3.0mm)");
    });
}

// Apply RawAccel configuration to server
async function saveRawaccelSettingsToServer() {
    if (!rawaccelSettings) return;
    
    const tStart = performance.now();
    const profile = rawaccelSettings.profiles[0];
    
    profile["Output DPI"] = parseFloat(sensMultiInput.value) * 1000;
    profile["Y/X output DPI ratio (vertical sens multiplier)"] = parseFloat(yxRatioAccelInput.value);
    profile["Degrees of rotation"] = parseFloat(rotationAccelInput.value);
    
    const params = profile["Whole or horizontal accel parameters"];
    params.mode = accelModeRawSelect.value;
    params["Gain / Velocity"] = chkGain.checked;
    params.acceleration = parseFloat(paramAccelRawInput.value);
    params.limit = parseFloat(paramLimitRawInput.value);
    params.inputOffset = parseFloat(paramOffsetRawInput.value);
    params["Cap mode"] = capModeRawSelect.value;
    if (paramRawSmoothInput) {
        params.smooth = parseFloat(paramRawSmoothInput.value);
    }
    
    profile["Vertical accel parameters"] = JSON.parse(JSON.stringify(params));
    
    try {
        if (window.__TAURI__) {
            const data = await window.__TAURI__.core.invoke('write_rawaccel_settings', { settings: rawaccelSettings });
            const delay = Math.round(performance.now() - tStart);
            telemetryDelay.textContent = `${delay} ms`;
            showTelemetryToast("Paramètres RawAccel appliqués");
        } else {
            const response = await fetch('/api/rawaccel/settings', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(rawaccelSettings)
            });
            const data = await response.json();
            
            if (response.ok) {
                const delay = Math.round(performance.now() - tStart);
                telemetryDelay.textContent = `${delay} ms`;
                showTelemetryToast("Paramètres RawAccel appliqués");
            } else {
                throw new Error(data.message || "Erreur serveur");
            }
        }
    } catch (err) {
        alert("Erreur de sauvegarde : " + err.message);
    }
}

// Global action triggers (Save / Cancel)
globalApplyBtn.addEventListener('click', () => {
    if (activeTab === 'tab-rawaccel') {
        saveRawaccelSettingsToServer();
    } else {
        saveMouseSettingsToDevice();
    }
});

globalResetBtn.addEventListener('click', () => {
    if (activeTab === 'tab-rawaccel') {
        if (confirm("Réinitialiser les valeurs depuis le pilote RawAccel ?")) {
            fetchRawaccelSettings();
        }
    } else {
        if (confirm("Réinitialiser les réglages de la souris G-LAB ?")) {
            mouseSettings.activeDpi = 0;
            mouseSettings.dpiProfiles[0].value = 4;
            mouseSettings.dpiProfiles[1].value = 8;
            mouseSettings.dpiProfiles[2].value = 24;
            mouseSettings.dpiProfiles[3].value = 64;
            document.querySelector(`input[name="active-dpi"][value="0"]`).checked = true;
            updateDpiUI();
        }
    }
});

// Re-map direct sidebar action triggers to global actions
document.getElementById('btn-raw-apply').addEventListener('click', saveRawaccelSettingsToServer);
document.getElementById('btn-raw-reset').addEventListener('click', () => {
    if (confirm("Réinitialiser les valeurs depuis le pilote RawAccel ?")) {
        fetchRawaccelSettings();
    }
});

const btnDriverInstall = document.getElementById('btn-driver-install');
const btnDriverUninstall = document.getElementById('btn-driver-uninstall');

if (btnDriverInstall) {
    btnDriverInstall.addEventListener('click', async () => {
        if (confirm("Voulez-vous installer le pilote de souris RawAccel autonome ?")) {
            showTelemetryToast("Installation du pilote...");
            try {
                if (window.__TAURI__) {
                    const msg = await window.__TAURI__.core.invoke('install_rawaccel_driver');
                    alert(msg);
                } else {
                    alert("Tauri non disponible - Simulation d'installation pilote réussie");
                }
            } catch (err) {
                alert("Erreur d'installation : " + err);
            }
        }
    });
}

if (btnDriverUninstall) {
    btnDriverUninstall.addEventListener('click', async () => {
        if (confirm("Voulez-vous désinstaller le pilote de souris RawAccel ?")) {
            showTelemetryToast("Désinstallation du pilote...");
            try {
                if (window.__TAURI__) {
                    const msg = await window.__TAURI__.core.invoke('uninstall_rawaccel_driver');
                    alert(msg);
                } else {
                    alert("Tauri non disponible - Simulation de désinstallation pilote réussie");
                }
            } catch (err) {
                alert("Erreur de désinstallation : " + err);
            }
        }
    });
}

window.addEventListener('resize', () => {
    if (activeTab === 'tab-rawaccel') drawRawaccelChart();
});

// Init
updateDpiUI();
fetchRawaccelSettings();
console.log("Professional Dashboard Initialized.");

// ==========================================
// 4. AIM TEST SANDBOX GAME
// ==========================================
const aimCanvas = document.getElementById('aim-trainer-canvas');
const aimCtx = aimCanvas ? aimCanvas.getContext('2d') : null;
const btnStartAim = document.getElementById('btn-start-aim');
const aimScoreEl = document.getElementById('aim-score');
const aimAccuracyEl = document.getElementById('aim-accuracy');
const aimReactionEl = document.getElementById('aim-reaction');
const aimHitsEl = document.getElementById('aim-hits');

let isAimRunning = false;
let isAimTabActive = false;
let aimLoopId = null;
let aimScore = 0;
let aimHits = 0;
let aimClicks = 0;
let targetSpawnTime = 0;
let totalReactionTime = 0;
let gameTimer = null;
let currentTarget = null; // { x, y, r }

let lastRawX = 0, lastRawY = 0;
let lastProcX = 0, lastProcY = 0;
let procMouseX = 0, procMouseY = 0;
let rawMouseX = 0, rawMouseY = 0;
let rawHistory = [];
let procHistory = [];
let rippleHistory = [];

function initAimCanvas() {
    if (!aimCanvas) return;
    const rect = aimCanvas.getBoundingClientRect();
    aimCanvas.width = rect.width;
    aimCanvas.height = rect.height;
    
    lastRawX = 0; lastRawY = 0;
    lastProcX = 0; lastProcY = 0;
    rawHistory = [];
    procHistory = [];
}

function startAimLoop() {
    if (aimLoopId) cancelAnimationFrame(aimLoopId);
    
    function tick() {
        if (!isAimTabActive) return;
        renderAimSandbox();
        aimLoopId = requestAnimationFrame(tick);
    }
    
    aimLoopId = requestAnimationFrame(tick);
}

function renderAimSandbox() {
    if (!aimCtx || !aimCanvas) return;
    
    // Clear canvas
    aimCtx.fillStyle = '#050608';
    aimCtx.fillRect(0, 0, aimCanvas.width, aimCanvas.height);
    
    // Draw background grid
    aimCtx.strokeStyle = 'rgba(255, 255, 255, 0.02)';
    aimCtx.lineWidth = 1;
    const gridSpacing = 40;
    for (let x = 0; x < aimCanvas.width; x += gridSpacing) {
        aimCtx.beginPath();
        aimCtx.moveTo(x, 0);
        aimCtx.lineTo(x, aimCanvas.height);
        aimCtx.stroke();
    }
    for (let y = 0; y < aimCanvas.height; y += gridSpacing) {
        aimCtx.beginPath();
        aimCtx.moveTo(0, y);
        aimCtx.lineTo(aimCanvas.width, y);
        aimCtx.stroke();
    }
    
    // Draw raw mouse trail (thin dotted red path)
    if (rawHistory.length > 1) {
        aimCtx.strokeStyle = 'rgba(239, 68, 68, 0.35)';
        aimCtx.lineWidth = 1.5;
        aimCtx.setLineDash([2, 3]);
        aimCtx.beginPath();
        aimCtx.moveTo(rawHistory[0].x, rawHistory[0].y);
        for (let i = 1; i < rawHistory.length; i++) {
            aimCtx.lineTo(rawHistory[i].x, rawHistory[i].y);
        }
        aimCtx.stroke();
        aimCtx.setLineDash([]);
    }
    
    // Draw processed mouse trail (neon primary color path)
    if (procHistory.length > 1) {
        const themeColor = getComputedStyle(document.documentElement).getPropertyValue('--color-primary').trim() || '#00d2ff';
        aimCtx.strokeStyle = themeColor;
        aimCtx.shadowColor = themeColor;
        aimCtx.shadowBlur = 6;
        aimCtx.lineWidth = 3.0;
        aimCtx.beginPath();
        aimCtx.moveTo(procHistory[0].x, procHistory[0].y);
        for (let i = 1; i < procHistory.length; i++) {
            aimCtx.lineTo(procHistory[i].x, procHistory[i].y);
        }
        aimCtx.stroke();
        aimCtx.lineWidth = 1;
        aimCtx.shadowBlur = 0;
    }
    
    // Draw active target (if game is running)
    if (isAimRunning && currentTarget) {
        const themeColor = getComputedStyle(document.documentElement).getPropertyValue('--color-primary').trim() || '#00d2ff';
        aimCtx.beginPath();
        aimCtx.arc(currentTarget.x, currentTarget.y, currentTarget.r, 0, Math.PI * 2);
        aimCtx.fillStyle = themeColor;
        aimCtx.shadowColor = themeColor;
        aimCtx.shadowBlur = 12;
        aimCtx.fill();
        
        // Target center
        aimCtx.beginPath();
        aimCtx.arc(currentTarget.x, currentTarget.y, 4, 0, Math.PI * 2);
        aimCtx.fillStyle = '#ffffff';
        aimCtx.shadowBlur = 0;
        aimCtx.fill();
    }
    
    // Draw start overlay text if not running
    if (!isAimRunning) {
        aimCtx.fillStyle = 'rgba(241, 245, 249, 0.9)';
        aimCtx.font = '700 20px Outfit';
        aimCtx.textAlign = 'center';
        aimCtx.fillText("AIM TEST SANDBOX", aimCanvas.width / 2, aimCanvas.height / 2 - 10);
        
        aimCtx.fillStyle = '#64748b';
        aimCtx.font = '500 12px Outfit';
        aimCtx.fillText("Cliquez sur Démarrer pour tester vos réglages", aimCanvas.width / 2, aimCanvas.height / 2 + 15);
    }
    
    // Draw custom processed crosshair cursor
    if (lastProcX > 0 && lastProcY > 0) {
        const themeColor = getComputedStyle(document.documentElement).getPropertyValue('--color-primary').trim() || '#00d2ff';
        
        // Draw crosshair circle
        aimCtx.beginPath();
        aimCtx.arc(procMouseX, procMouseY, 6, 0, Math.PI * 2);
        aimCtx.strokeStyle = '#ffffff';
        aimCtx.lineWidth = 1.5;
        aimCtx.stroke();
        
        // Draw crosshair center dot
        aimCtx.beginPath();
        aimCtx.arc(procMouseX, procMouseY, 1.5, 0, Math.PI * 2);
        aimCtx.fillStyle = themeColor;
        aimCtx.fill();
    }
}

function spawnTarget() {
    if (!isAimRunning) return;
    const radius = 15;
    const padding = 30;
    
    const x = padding + Math.random() * (aimCanvas.width - padding * 2);
    const y = padding + Math.random() * (aimCanvas.height - padding * 2);
    
    currentTarget = { x, y, r: radius };
    targetSpawnTime = performance.now();
}

function startAimTest() {
    if (isAimRunning) {
        stopAimTest(true);
        return;
    }
    
    isAimRunning = true;
    btnStartAim.textContent = "Arrêter le Test";
    btnStartAim.classList.add('rawaccel-tab-active-btn');
    
    aimScore = 0;
    aimHits = 0;
    aimClicks = 0;
    totalReactionTime = 0;
    
    aimScoreEl.textContent = '0';
    aimAccuracyEl.textContent = '0.0%';
    aimReactionEl.textContent = '0 ms';
    aimHitsEl.textContent = '0 / 0';
    
    spawnTarget();
    
    // 30 seconds timer
    gameTimer = setTimeout(() => {
        stopAimTest(false);
    }, 30000);
}

function stopAimTest(cancelled) {
    isAimRunning = false;
    clearTimeout(gameTimer);
    btnStartAim.textContent = "Démarrer le Test";
    btnStartAim.classList.remove('rawaccel-tab-active-btn');
    currentTarget = null;
    
    if (cancelled) {
        showTelemetryToast("Test Annulé");
    } else {
        const finalAccuracy = aimClicks > 0 ? (aimHits / aimClicks * 100).toFixed(1) : '0.0';
        const avgReaction = aimHits > 0 ? Math.round(totalReactionTime / aimHits) : 0;
        showTelemetryToast(`Test terminé ! Score : ${aimScore}`);
    }
}

if (aimCanvas) {
    // Mouse movement inside canvas
    aimCanvas.addEventListener('mousemove', (e) => {
        const rect = aimCanvas.getBoundingClientRect();
        const currentRawX = e.clientX - rect.left;
        const currentRawY = e.clientY - rect.top;
        
        if (lastRawX === 0 && lastRawY === 0) {
            lastRawX = currentRawX;
            lastRawY = currentRawY;
            lastProcX = currentRawX;
            lastProcY = currentRawY;
            procMouseX = currentRawX;
            procMouseY = currentRawY;
            rawMouseX = currentRawX;
            rawMouseY = currentRawY;
            return;
        }
        
        let dx = currentRawX - lastRawX;
        let dy = currentRawY - lastRawY;
        
        rawMouseX = currentRawX;
        rawMouseY = currentRawY;
        
        rawHistory.push({ x: rawMouseX, y: rawMouseY });
        if (rawHistory.length > 30) rawHistory.shift();
        
        // 1. Apply Sensor Deadzone (Sniper Guard)
        const deadzoneEnabled = document.getElementById('sensor-deadzone').checked;
        if (deadzoneEnabled) {
            const deadzoneThreshold = parseFloat(document.getElementById('deadzone-threshold').value) || 0.4;
            const speed = Math.sqrt(dx * dx + dy * dy);
            if (speed < deadzoneThreshold) {
                dx = 0;
                dy = 0;
            }
        }
        
        // 2. Apply Angle Snapping
        const angleSnappingEnabled = document.getElementById('angle-snapping').checked;
        if (angleSnappingEnabled && (dx !== 0 || dy !== 0)) {
            const snapAngleVal = parseFloat(document.getElementById('snap-threshold').value) || 15;
            const thresholdAngle = snapAngleVal * (Math.PI / 180); // dynamic snapping threshold
            const angle = Math.abs(Math.atan2(dy, dx));
            
            if (angle < thresholdAngle || angle > Math.PI - thresholdAngle) {
                dy = 0;
            } else if (Math.abs(angle - Math.PI / 2) < thresholdAngle) {
                dx = 0;
            }
        }
        
        let snappedX = lastProcX + dx;
        let snappedY = lastProcY + dy;
        
        snappedX = Math.max(0, Math.min(aimCanvas.width, snappedX));
        snappedY = Math.max(0, Math.min(aimCanvas.height, snappedY));
        
        // 3. Apply Ripple Control (Lissage)
        const rippleControlEnabled = document.getElementById('ripple-control').checked;
        if (rippleControlEnabled) {
            const rippleStrength = parseInt(document.getElementById('ripple-strength').value) || 8;
            rippleHistory.push({ x: snappedX, y: snappedY });
            while (rippleHistory.length > rippleStrength) {
                rippleHistory.shift();
            }
            
            let sumX = 0, sumY = 0;
            for (let i = 0; i < rippleHistory.length; i++) {
                sumX += rippleHistory[i].x;
                sumY += rippleHistory[i].y;
            }
            procMouseX = sumX / rippleHistory.length;
            procMouseY = sumY / rippleHistory.length;
        } else {
            rippleHistory = [];
            procMouseX = snappedX;
            procMouseY = snappedY;
        }
        
        procHistory.push({ x: procMouseX, y: procMouseY });
        if (procHistory.length > 30) procHistory.shift();
        
        lastRawX = currentRawX;
        lastRawY = currentRawY;
        lastProcX = procMouseX;
        lastProcY = procMouseY;
    });
    
    aimCanvas.addEventListener('mouseleave', () => {
        lastRawX = 0; lastRawY = 0;
        lastProcX = 0; lastProcY = 0;
        rawHistory = [];
        procHistory = [];
    });
    
    // Window click event on canvas
    aimCanvas.addEventListener('mousedown', (e) => {
        if (!isAimRunning || !currentTarget) return;
        
        aimClicks++;
        
        // Check hit using processed coordinate
        const dist = Math.sqrt(Math.pow(procMouseX - currentTarget.x, 2) + Math.pow(procMouseY - currentTarget.y, 2));
        
        if (dist <= currentTarget.r) {
            aimHits++;
            const reactTime = performance.now() - targetSpawnTime;
            totalReactionTime += reactTime;
            
            const speedBonus = Math.max(0, Math.round(1000 - reactTime));
            aimScore += 100 + speedBonus;
            
            aimScoreEl.textContent = aimScore;
            aimReactionEl.textContent = `${Math.round(reactTime)} ms`;
            
            spawnTarget();
        } else {
            aimScore = Math.max(0, aimScore - 50);
            aimScoreEl.textContent = aimScore;
        }
        
        const accuracy = (aimHits / aimClicks * 100).toFixed(1);
        aimAccuracyEl.textContent = `${accuracy}%`;
        aimHitsEl.textContent = `${aimHits} / ${aimClicks}`;
    });
    
    btnStartAim.addEventListener('click', startAimTest);
    
    setTimeout(initAimCanvas, 100);
}

// ==========================================
// 5. PROFILE MANAGER LOGIC
// ==========================================
const profileSelectDropdown = document.getElementById('profile-select-dropdown');
const btnSaveProfile = document.getElementById('btn-save-profile');

// Load profiles from localStorage
function initProfiles() {
    // Load custom profiles from localStorage keys
    for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key.startsWith("GLAB_PROFILE_")) {
            const profileName = key.replace("GLAB_PROFILE_", "");
            if (!document.querySelector(`#profile-select-dropdown option[value="${profileName}"]`)) {
                const opt = document.createElement('option');
                opt.value = profileName;
                opt.textContent = profileName;
                profileSelectDropdown.appendChild(opt);
            }
        }
    }
}

profileSelectDropdown.addEventListener('change', (e) => {
    const selected = e.target.value;
    loadProfileFromStorage(selected);
});

btnSaveProfile.addEventListener('click', () => {
    const name = prompt("Entrez le nom du nouveau profil (ex: 'Apex Legends') :");
    if (!name || name.trim() === "") return;
    
    const cleanName = name.trim();
    saveProfileToStorage(cleanName);
    
    // Add option to select dropdown if not already present
    if (!document.querySelector(`#profile-select-dropdown option[value="${cleanName}"]`)) {
        const opt = document.createElement('option');
        opt.value = cleanName;
        opt.textContent = cleanName;
        profileSelectDropdown.appendChild(opt);
    }
    
    profileSelectDropdown.value = cleanName;
    showTelemetryToast(`Profil '${cleanName}' sauvegardé`);
});

function saveProfileToStorage(name) {
    const data = {
        mouseSettings: mouseSettings,
        rawaccelSettings: rawaccelSettings,
        sensorFilters: {
            angleSnapping: document.getElementById('angle-snapping').checked,
            snapThreshold: parseFloat(document.getElementById('snap-threshold').value),
            rippleControl: document.getElementById('ripple-control').checked,
            rippleStrength: document.getElementById('ripple-strength').value,
            sensorDeadzone: document.getElementById('sensor-deadzone').checked,
            deadzoneThreshold: parseFloat(document.getElementById('deadzone-threshold').value)
        }
    };
    localStorage.setItem(`GLAB_PROFILE_${name}`, JSON.stringify(data));
}

function loadProfileFromStorage(name) {
    const stored = localStorage.getItem(`GLAB_PROFILE_${name}`);
    if (!stored) {
        // Handle loading default configurations
        if (name === 'default') {
            mouseSettings.activeDpi = 0;
            mouseSettings.dpiProfiles[0].value = 4;
            mouseSettings.dpiProfiles[1].value = 8;
            mouseSettings.dpiProfiles[2].value = 24;
            mouseSettings.dpiProfiles[3].value = 64;
        } else if (name === 'fps') {
            mouseSettings.activeDpi = 1;
            mouseSettings.dpiProfiles[1].value = 16; // 3200 DPI
        } else if (name === 'precision') {
            mouseSettings.activeDpi = 0;
            mouseSettings.dpiProfiles[0].value = 2; // 400 DPI
        }
        
        updateDpiUI();
        showTelemetryToast(`Profil d'usine '${name}' chargé`);
        return;
    }
    
    try {
        const data = JSON.parse(stored);
        
        // Copy settings
        if (data.mouseSettings) {
            Object.assign(mouseSettings, data.mouseSettings);
            updateDpiUI();
            
            // Sync values to G-LAB input elements
            document.querySelector(`input[name="active-dpi"][value="${mouseSettings.activeDpi}"]`).checked = true;
            document.getElementById(`dpi-enable-1`).checked = mouseSettings.dpiProfiles[1].enabled;
            document.getElementById(`dpi-enable-2`).checked = mouseSettings.dpiProfiles[2].enabled;
            document.getElementById(`dpi-enable-3`).checked = mouseSettings.dpiProfiles[3].enabled;
            document.querySelector(`input[name="rgb-mode"][value="${mouseSettings.rgbMode}"]`).checked = true;
            document.querySelector(`input[name="scroll-mode"][value="${mouseSettings.scrollMode}"]`).checked = true;
            
            if (fireRateSlider) {
                fireRateSlider.value = mouseSettings.fireRate;
                fireRateDisplay.textContent = `${mouseSettings.fireRate} ms`;
            }
        }
        
        if (data.rawaccelSettings) {
            rawaccelSettings = data.rawaccelSettings;
            populateRawaccelUI(rawaccelSettings);
            syncRawaccelValues();
            if (activeTab === 'tab-rawaccel') drawRawaccelChart();
        }
        
        if (data.sensorFilters) {
            const filters = data.sensorFilters;
            const chkSnap = document.getElementById('angle-snapping');
            const snapSlider = document.getElementById('snap-threshold');
            const snapDisplay = document.getElementById('snap-threshold-display');
            const chkRipple = document.getElementById('ripple-control');
            const rippleStrength = document.getElementById('ripple-strength');
            const chkDeadzone = document.getElementById('sensor-deadzone');
            const deadzoneSlider = document.getElementById('deadzone-threshold');
            const deadzoneDisplay = document.getElementById('deadzone-threshold-display');
            
            if (chkSnap) {
                chkSnap.checked = filters.angleSnapping;
                document.getElementById('row-snap-threshold').style.display = chkSnap.checked ? 'block' : 'none';
            }
            if (snapSlider) {
                snapSlider.value = filters.snapThreshold || 15;
                if (snapDisplay) snapDisplay.textContent = `${snapSlider.value}°`;
            }
            if (chkRipple) {
                chkRipple.checked = filters.rippleControl;
                document.getElementById('row-ripple-strength').style.display = chkRipple.checked ? 'block' : 'none';
            }
            if (rippleStrength) {
                rippleStrength.value = filters.rippleStrength || "8";
            }
            if (chkDeadzone) {
                chkDeadzone.checked = filters.sensorDeadzone;
                document.getElementById('row-deadzone-threshold').style.display = chkDeadzone.checked ? 'block' : 'none';
            }
            if (deadzoneSlider) {
                deadzoneSlider.value = filters.deadzoneThreshold || 0.4;
                if (deadzoneDisplay) deadzoneDisplay.textContent = `${deadzoneSlider.value} px`;
            }
            
            if (typeof saveSensorFiltersToStorage === 'function') {
                saveSensorFiltersToStorage();
            }
        }
        
        showTelemetryToast(`Profil '${name}' chargé`);
    } catch (err) {
        console.error("Error loading profile:", err);
    }
}

// Initialize Profiles
initProfiles();

// Sensor Esports filters checkbox toggles & displays
const chkSnap = document.getElementById('angle-snapping');
const rowSnap = document.getElementById('row-snap-threshold');
const chkRipple = document.getElementById('ripple-control');
const rowRipple = document.getElementById('row-ripple-strength');
const chkDeadzone = document.getElementById('sensor-deadzone');
const rowDeadzone = document.getElementById('row-deadzone-threshold');

if (chkSnap && rowSnap) {
    chkSnap.addEventListener('change', () => {
        rowSnap.style.display = chkSnap.checked ? 'flex' : 'none';
    });
}
if (chkRipple && rowRipple) {
    chkRipple.addEventListener('change', () => {
        rowRipple.style.display = chkRipple.checked ? 'block' : 'none';
    });
}
if (chkDeadzone && rowDeadzone) {
    chkDeadzone.addEventListener('change', () => {
        rowDeadzone.style.display = chkDeadzone.checked ? 'flex' : 'none';
    });
}

const snapThreshold = document.getElementById('snap-threshold');
const snapThresholdDisplay = document.getElementById('snap-threshold-display');
if (snapThreshold && snapThresholdDisplay) {
    snapThreshold.addEventListener('input', (e) => {
        snapThresholdDisplay.textContent = `${e.target.value}°`;
    });
}

const snapStiffness = document.getElementById('snap-stiffness');
const snapStiffnessDisplay = document.getElementById('snap-stiffness-display');
if (snapStiffness && snapStiffnessDisplay) {
    snapStiffness.addEventListener('input', (e) => {
        snapStiffnessDisplay.textContent = `${e.target.value}/10`;
    });
}

const deadzoneThreshold = document.getElementById('deadzone-threshold');
const deadzoneThresholdDisplay = document.getElementById('deadzone-threshold-display');
if (deadzoneThreshold && deadzoneThresholdDisplay) {
    deadzoneThreshold.addEventListener('input', (e) => {
        deadzoneThresholdDisplay.textContent = `${e.target.value} px`;
    });
}

// Sensor Monitor Canvas logic
const sensorCanvas = document.getElementById('sensor-monitor-canvas');
let sensorCtx = null;
let sensorRawHistory = [];
let sensorProcHistory = [];
let sLastRawX = 0, sLastRawY = 0;
let sLastProcX = 0, sLastProcY = 0;

function initSensorCanvas() {
    if (!sensorCanvas) return;
    sensorCtx = sensorCanvas.getContext('2d');
    resizeSensorCanvas();
    window.addEventListener('resize', resizeSensorCanvas);
    
    // Start drawing loop
    requestAnimationFrame(drawSensorMonitor);
}

function resizeSensorCanvas() {
    if (!sensorCanvas) return;
    const rect = sensorCanvas.getBoundingClientRect();
    sensorCanvas.width = rect.width * window.devicePixelRatio;
    sensorCanvas.height = rect.height * window.devicePixelRatio;
    if (sensorCtx) {
        sensorCtx.scale(window.devicePixelRatio, window.devicePixelRatio);
    }
}

function drawSensorMonitor() {
    if (!sensorCanvas || !sensorCtx) {
        requestAnimationFrame(drawSensorMonitor);
        return;
    }
    
    const w = sensorCanvas.width / window.devicePixelRatio;
    const h = sensorCanvas.height / window.devicePixelRatio;
    
    // Clear canvas with slight transparency for a neon trail ghosting effect
    sensorCtx.fillStyle = "rgba(5, 6, 8, 0.25)";
    sensorCtx.fillRect(0, 0, w, h);
    
    // Draw high-tech grid lines
    sensorCtx.strokeStyle = "rgba(255, 255, 255, 0.02)";
    sensorCtx.lineWidth = 1;
    const gridSpacing = 40;
    for (let x = 0; x < w; x += gridSpacing) {
        sensorCtx.beginPath();
        sensorCtx.moveTo(x, 0);
        sensorCtx.lineTo(x, h);
        sensorCtx.stroke();
    }
    for (let y = 0; y < h; y += gridSpacing) {
        sensorCtx.beginPath();
        sensorCtx.moveTo(0, y);
        sensorCtx.lineTo(w, y);
        sensorCtx.stroke();
    }
    
    // Draw Raw Trail (Red, dotted)
    if (sensorRawHistory.length > 1) {
        sensorCtx.beginPath();
        sensorCtx.strokeStyle = "rgba(239, 68, 68, 0.4)";
        sensorCtx.lineWidth = 2;
        sensorCtx.setLineDash([2, 4]);
        sensorCtx.moveTo(sensorRawHistory[0].x, sensorRawHistory[0].y);
        for (let i = 1; i < sensorRawHistory.length; i++) {
            sensorCtx.lineTo(sensorRawHistory[i].x, sensorRawHistory[i].y);
        }
        sensorCtx.stroke();
        sensorCtx.setLineDash([]); // Reset
    }
    
    // Draw Filtered Trail (Neon cyan with glow)
    if (sensorProcHistory.length > 1) {
        sensorCtx.shadowBlur = 8;
        sensorCtx.shadowColor = "rgba(13, 245, 211, 0.6)";
        sensorCtx.strokeStyle = "rgba(13, 245, 211, 0.9)";
        sensorCtx.lineWidth = 3;
        
        sensorCtx.beginPath();
        sensorCtx.moveTo(sensorProcHistory[0].x, sensorProcHistory[0].y);
        for (let i = 1; i < sensorProcHistory.length; i++) {
            sensorCtx.lineTo(sensorProcHistory[i].x, sensorProcHistory[i].y);
        }
        sensorCtx.stroke();
        
        // Reset shadow
        sensorCtx.shadowBlur = 0;
    }
    
    // Draw current dots
    if (sensorRawHistory.length > 0) {
        const rawPt = sensorRawHistory[sensorRawHistory.length - 1];
        sensorCtx.beginPath();
        sensorCtx.fillStyle = "#ef4444";
        sensorCtx.arc(rawPt.x, rawPt.y, 4, 0, Math.PI * 2);
        sensorCtx.fill();
    }
    
    if (sensorProcHistory.length > 0) {
        const procPt = sensorProcHistory[sensorProcHistory.length - 1];
        sensorCtx.beginPath();
        sensorCtx.fillStyle = "#0df5d3";
        sensorCtx.arc(procPt.x, procPt.y, 6, 0, Math.PI * 2);
        sensorCtx.fill();
    }
    
    requestAnimationFrame(drawSensorMonitor);
}

if (sensorCanvas) {
    sensorCanvas.addEventListener('mousemove', (e) => {
        const rect = sensorCanvas.getBoundingClientRect();
        const currentRawX = e.clientX - rect.left;
        const currentRawY = e.clientY - rect.top;
        
        const now = performance.now();
        if (window._lastMouseMoveTime) {
            const delta = now - window._lastMouseMoveTime;
            if (!window._latencyPacketHistory) window._latencyPacketHistory = [];
            window._latencyPacketHistory.push(delta);
            if (window._latencyPacketHistory.length > 200) window._latencyPacketHistory.shift();
            if (typeof updateLatencyStats === 'function') {
                updateLatencyStats(delta);
            }
        }
        window._lastMouseMoveTime = now;
        
        if (sLastRawX === 0 && sLastRawY === 0) {
            sLastRawX = currentRawX;
            sLastRawY = currentRawY;
            sLastProcX = currentRawX;
            sLastProcY = currentRawY;
            return;
        }
        
        let dx = currentRawX - sLastRawX;
        let dy = currentRawY - sLastRawY;
        
        sensorRawHistory.push({ x: currentRawX, y: currentRawY });
        if (sensorRawHistory.length > 40) sensorRawHistory.shift();
        
        // 1. Deadzone
        const deadzoneEnabled = document.getElementById('sensor-deadzone').checked;
        if (deadzoneEnabled) {
            let deadzoneThresholdVal = parseFloat(document.getElementById('deadzone-threshold').value) || 0.4;
            const deadzoneShapeVal = document.getElementById('deadzone-shape').value || 'radial';
            const dynamicFilterEnabled = document.getElementById('deadzone-dynamic-filter').checked;
            
            const speed = Math.sqrt(dx * dx + dy * dy);
            // Dynamic noise filter decreases deadzone threshold at higher speeds to avoid clipping flicks
            if (dynamicFilterEnabled && speed > 3) {
                deadzoneThresholdVal = deadzoneThresholdVal * Math.max(0.15, 1 - (speed - 3) / 8);
            }
            
            if (deadzoneShapeVal === 'radial') {
                if (speed < deadzoneThresholdVal) {
                    dx = 0;
                    dy = 0;
                }
            } else if (deadzoneShapeVal === 'axial') {
                if (Math.abs(dx) < deadzoneThresholdVal) dx = 0;
                if (Math.abs(dy) < deadzoneThresholdVal) dy = 0;
            }
        }
        
        // 2. Angle Snapping
        const angleSnappingEnabled = document.getElementById('angle-snapping').checked;
        if (angleSnappingEnabled && (dx !== 0 || dy !== 0)) {
            const snapModeVal = document.getElementById('snap-mode').value || 'hysteresis';
            const snapAngleVal = parseFloat(document.getElementById('snap-threshold').value) || 15;
            const stiffnessVal = parseInt(document.getElementById('snap-stiffness').value) || 6;
            
            if (snapModeVal === 'hysteresis') {
                const thresholdAngle = snapAngleVal * (Math.PI / 180);
                const breakout = 25 - stiffnessVal * 1.5;
                
                if (!window._snapLockState) {
                    window._snapLockState = { axis: null, lockedValue: 0 };
                }
                
                if (window._snapLockState.axis === null) {
                    const angle = Math.abs(Math.atan2(dy, dx));
                    if (angle < thresholdAngle || angle > Math.PI - thresholdAngle) {
                        window._snapLockState.axis = 'x';
                        window._snapLockState.lockedValue = sLastProcY;
                    } else if (Math.abs(angle - Math.PI / 2) < thresholdAngle) {
                        window._snapLockState.axis = 'y';
                        window._snapLockState.lockedValue = sLastProcX;
                    }
                }
                
                if (window._snapLockState.axis === 'x') {
                    const deviation = Math.abs(currentRawY - window._snapLockState.lockedValue);
                    if (deviation > breakout) {
                        window._snapLockState.axis = null;
                    } else {
                        dy = 0;
                    }
                } else if (window._snapLockState.axis === 'y') {
                    const deviation = Math.abs(currentRawX - window._snapLockState.lockedValue);
                    if (deviation > breakout) {
                        window._snapLockState.axis = null;
                    } else {
                        dx = 0;
                    }
                }
            } else if (snapModeVal === 'strict') {
                if (!window._snapStrictState) {
                    window._snapStrictState = { axis: null };
                }
                if (window._snapStrictState.axis === null) {
                    if (Math.abs(dx) > Math.abs(dy)) {
                        window._snapStrictState.axis = 'x';
                    } else if (Math.abs(dy) > Math.abs(dx)) {
                        window._snapStrictState.axis = 'y';
                    }
                }
                
                const breakout = 18 - stiffnessVal * 1.2;
                if (window._snapStrictState.axis === 'x') {
                    if (Math.abs(dy) > breakout) {
                        window._snapStrictState.axis = 'y';
                        dx = 0;
                    } else {
                        dy = 0;
                    }
                } else if (window._snapStrictState.axis === 'y') {
                    if (Math.abs(dx) > breakout) {
                        window._snapStrictState.axis = 'x';
                        dy = 0;
                    } else {
                        dx = 0;
                    }
                }
            } else if (snapModeVal === 'predictive') {
                const speed = Math.sqrt(dx * dx + dy * dy);
                if (speed > 0.1) {
                    const currentAngle = Math.atan2(dy, dx);
                    const snapStep = snapAngleVal * (Math.PI / 180);
                    const snappedAngle = Math.round(currentAngle / snapStep) * snapStep;
                    const blend = stiffnessVal / 10;
                    const finalAngle = currentAngle * (1 - blend) + snappedAngle * blend;
                    dx = Math.cos(finalAngle) * speed;
                    dy = Math.sin(finalAngle) * speed;
                }
            }
        } else {
            window._snapLockState = null;
            window._snapStrictState = null;
        }
        
        let snappedX = sLastProcX + dx;
        let snappedY = sLastProcY + dy;
        
        snappedX = Math.max(0, Math.min(rect.width, snappedX));
        snappedY = Math.max(0, Math.min(rect.height, snappedY));
        
        let finalX = snappedX;
        let finalY = snappedY;
        
        // 3. Ripple Control
        const rippleControlEnabled = document.getElementById('ripple-control').checked;
        if (rippleControlEnabled) {
            const rippleStrength = parseInt(document.getElementById('ripple-strength').value) || 8;
            
            if (!window._sensorRippleHistory) window._sensorRippleHistory = [];
            window._sensorRippleHistory.push({ x: snappedX, y: snappedY });
            while (window._sensorRippleHistory.length > rippleStrength) {
                window._sensorRippleHistory.shift();
            }
            
            let sumX = 0, sumY = 0;
            for (let i = 0; i < window._sensorRippleHistory.length; i++) {
                sumX += window._sensorRippleHistory[i].x;
                sumY += window._sensorRippleHistory[i].y;
            }
            finalX = sumX / window._sensorRippleHistory.length;
            finalY = sumY / window._sensorRippleHistory.length;
        } else {
            window._sensorRippleHistory = [];
        }
        
        sensorProcHistory.push({ x: finalX, y: finalY });
        if (sensorProcHistory.length > 40) sensorProcHistory.shift();
        
        sLastRawX = currentRawX;
        sLastRawY = currentRawY;
        sLastProcX = finalX;
        sLastProcY = finalY;
    });
    
    sensorCanvas.addEventListener('mouseleave', () => {
        sLastRawX = 0; sLastRawY = 0;
        sLastProcX = 0; sLastProcY = 0;
        sensorRawHistory = [];
        sensorProcHistory = [];
        window._sensorRippleHistory = [];
        if (window._snapLockState) window._snapLockState.axis = null;
    });
    
    setTimeout(initSensorCanvas, 100);
}

// =============================================================
// NEW PREMIUM UI/UX OVERHAUL LOGIC
// =============================================================

// Collapsible Sidebar Toggle
const btnToggleSidebar = document.getElementById('btn-toggle-sidebar');
const sidebarEl = document.getElementById('app-sidebar');
if (btnToggleSidebar && sidebarEl) {
    btnToggleSidebar.addEventListener('click', () => {
        sidebarEl.classList.toggle('collapsed');
        // Trigger canvas redraws on transition end
        setTimeout(() => {
            resizeSensorCanvas();
            resizeDashCanvas();
        }, 350);
    });
}

// Sidebar Search Logic
const sidebarSearch = document.getElementById('sidebar-search');
if (sidebarSearch) {
    sidebarSearch.addEventListener('input', (e) => {
        const query = e.target.value.toLowerCase().trim();
        document.querySelectorAll('.nav-tab').forEach(btn => {
            const text = btn.textContent.toLowerCase();
            const parentSection = btn.closest('.nav-section');
            if (query === "" || text.includes(query)) {
                btn.style.display = "";
            } else {
                btn.style.display = "none";
            }
        });
        
        // Hide empty sections
        document.querySelectorAll('.nav-section').forEach(sec => {
            const visibleButtons = [...sec.querySelectorAll('.nav-tab')].filter(btn => btn.style.display !== 'none');
            const label = sec.querySelector('.section-label');
            if (visibleButtons.length === 0) {
                sec.style.display = "none";
            } else {
                sec.style.display = "";
            }
        });
    });
}

// Customizer Theme Logic
const pickerPrimary = document.getElementById('color-picker-primary');
const pickerSecondary = document.getElementById('color-picker-secondary');
const textPrimary = document.getElementById('hex-primary');
const textSecondary = document.getElementById('hex-secondary');

const sliderBorder = document.getElementById('slider-border-radius');
const labelBorder = document.getElementById('display-border-radius');
const sliderTransparency = document.getElementById('slider-transparency');
const labelTransparency = document.getElementById('display-transparency');
const sliderUiScale = document.getElementById('slider-ui-scale');
const labelUiScale = document.getElementById('display-ui-scale');

const presetBtns = document.querySelectorAll('.preset-btn');

function saveThemeSettings(theme) {
    localStorage.setItem('GLAB_THEME_CUSTOM', JSON.stringify(theme));
}

function loadThemeSettings() {
    const stored = localStorage.getItem('GLAB_THEME_CUSTOM');
    if (stored) {
        try {
            const theme = JSON.parse(stored);
            applyTheme(theme);
            // Sync input controls
            if (theme.primary && pickerPrimary) {
                pickerPrimary.value = theme.primary;
                textPrimary.textContent = theme.primary;
            }
            if (theme.secondary && pickerSecondary) {
                pickerSecondary.value = theme.secondary;
                textSecondary.textContent = theme.secondary;
            }
            if (theme.borderRadius !== undefined && sliderBorder) {
                sliderBorder.value = theme.borderRadius;
                labelBorder.textContent = theme.borderRadius + " px";
            }
            if (theme.transparency !== undefined && sliderTransparency) {
                sliderTransparency.value = theme.transparency;
                labelTransparency.textContent = theme.transparency + "%";
            }
            if (theme.uiScale !== undefined && sliderUiScale) {
                sliderUiScale.value = theme.uiScale;
                labelUiScale.textContent = theme.uiScale + "%";
            }
            
            // Highlight matching preset
            presetBtns.forEach(btn => {
                const pri = btn.dataset.primary;
                const sec = btn.dataset.secondary;
                if (pri === theme.primary && sec === theme.secondary) {
                    btn.classList.add('active');
                } else {
                    btn.classList.remove('active');
                }
            });
        } catch(e) {
            console.error("Failed to restore custom theme", e);
        }
    }
}

function applyTheme(theme) {
    if (theme.primary) {
        document.documentElement.style.setProperty('--color-primary', theme.primary);
    }
    if (theme.secondary) {
        document.documentElement.style.setProperty('--color-secondary', theme.secondary);
    }
    if (theme.borderRadius !== undefined) {
        document.documentElement.style.setProperty('--border-radius-custom', theme.borderRadius + "px");
    }
    if (theme.transparency !== undefined) {
        document.documentElement.style.setProperty('--bg-opacity-custom', (theme.transparency / 100).toFixed(2));
    }
    if (theme.uiScale !== undefined) {
        document.documentElement.style.setProperty('--ui-scale-custom', (theme.uiScale / 100).toFixed(2));
    }
}

function updateAndSaveTheme() {
    const theme = {
        primary: pickerPrimary ? pickerPrimary.value : "#0df5d3",
        secondary: pickerSecondary ? pickerSecondary.value : "#a78bfa",
        borderRadius: sliderBorder ? parseInt(sliderBorder.value) : 12,
        transparency: sliderTransparency ? parseInt(sliderTransparency.value) : 45,
        uiScale: sliderUiScale ? parseInt(sliderUiScale.value) : 100
    };
    applyTheme(theme);
    saveThemeSettings(theme);
}

if (pickerPrimary) {
    pickerPrimary.addEventListener('input', (e) => {
        textPrimary.textContent = e.target.value;
        updateAndSaveTheme();
    });
}
if (pickerSecondary) {
    pickerSecondary.addEventListener('input', (e) => {
        textSecondary.textContent = e.target.value;
        updateAndSaveTheme();
    });
}
if (sliderBorder) {
    sliderBorder.addEventListener('input', (e) => {
        labelBorder.textContent = `${e.target.value} px`;
        updateAndSaveTheme();
    });
}
if (sliderTransparency) {
    sliderTransparency.addEventListener('input', (e) => {
        labelTransparency.textContent = `${e.target.value}%`;
        updateAndSaveTheme();
    });
}
if (sliderUiScale) {
    sliderUiScale.addEventListener('input', (e) => {
        labelUiScale.textContent = `${e.target.value}%`;
        updateAndSaveTheme();
    });
}

presetBtns.forEach(btn => {
    btn.addEventListener('click', () => {
        presetBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const pri = btn.dataset.primary;
        const sec = btn.dataset.secondary;
        if (pickerPrimary) pickerPrimary.value = pri;
        if (pickerSecondary) pickerSecondary.value = sec;
        if (textPrimary) textPrimary.textContent = pri;
        if (textSecondary) textSecondary.textContent = sec;
        updateAndSaveTheme();
    });
});

// Load Customizer styles
loadThemeSettings();

// Dashboard DPI Sync
function syncDashboardDpi() {
    const dashDpi = document.getElementById('dash-active-dpi');
    const dashProfile = document.getElementById('dash-active-profile');
    const dashEDpi = document.getElementById('dash-effective-sens');
    
    if (dashDpi && dashProfile && dashEDpi) {
        const activeIdx = mouseSettings.activeDpi;
        const activeVal = mouseSettings.dpiProfiles[activeIdx].value * 200;
        dashDpi.textContent = activeVal;
        
        const profileSelect = document.getElementById('profile-select-dropdown');
        dashProfile.textContent = profileSelect ? profileSelect.options[profileSelect.selectedIndex].text : "Profil par défaut";
        
        // Calculate effective eDPI
        let rawMultiplier = 1.0;
        const outDpiAccel = document.getElementById('out-dpi-accel');
        if (outDpiAccel) {
            rawMultiplier = parseFloat(outDpiAccel.value) || 1.0;
        }
        dashEDpi.textContent = Math.round(activeVal * rawMultiplier);
    }
}

// Widget Toggle settings
const widgetsToggles = {
    'toggle-widget-dpi': 'widget-dpi',
    'toggle-widget-telemetry': 'widget-telemetry',
    'toggle-widget-system': 'widget-system',
    'toggle-widget-filters': 'widget-filters',
    'toggle-widget-chart': 'widget-chart'
};

Object.keys(widgetsToggles).forEach(toggleId => {
    const toggle = document.getElementById(toggleId);
    const widgetId = widgetsToggles[toggleId];
    const widget = document.getElementById(widgetId);
    
    if (toggle && widget) {
        // Load initial state
        const stored = localStorage.getItem(`GLAB_WIDGET_${widgetId}`);
        if (stored !== null) {
            const isVisible = stored === 'true';
            toggle.checked = isVisible;
            widget.style.display = isVisible ? '' : 'none';
        }
        
        toggle.addEventListener('change', () => {
            widget.style.display = toggle.checked ? '' : 'none';
            localStorage.setItem(`GLAB_WIDGET_${widgetId}`, toggle.checked);
        });
    }
});

// Drag & Drop Layout Saver
function saveWidgetLayout() {
    const container = document.getElementById('dashboard-widgets-container');
    if (!container) return;
    const order = [...container.querySelectorAll('.drag-widget')].map(el => el.id);
    localStorage.setItem('GLAB_WIDGET_ORDER', JSON.stringify(order));
}

function loadWidgetLayout() {
    const container = document.getElementById('dashboard-widgets-container');
    const stored = localStorage.getItem('GLAB_WIDGET_ORDER');
    if (container && stored) {
        try {
            const order = JSON.parse(stored);
            order.forEach(id => {
                const el = document.getElementById(id);
                if (el) container.appendChild(el);
            });
        } catch(e) {
            console.error("Failed to restore layout order", e);
        }
    }
}

function initDashboardDragAndDrop() {
    const container = document.getElementById('dashboard-widgets-container');
    const cards = document.querySelectorAll('.drag-widget');
    
    if (!container) return;
    
    cards.forEach(card => {
        card.addEventListener('dragstart', (e) => {
            card.classList.add('dragged');
            e.dataTransfer.setData('text/plain', card.id);
        });
        
        card.addEventListener('dragend', () => {
            card.classList.remove('dragged');
            saveWidgetLayout();
        });
        
        card.addEventListener('dragover', (e) => {
            e.preventDefault();
            const draggingEl = document.querySelector('.dragged');
            if (!draggingEl) return;
            const siblings = [...container.querySelectorAll('.drag-widget:not(.dragged)')];
            const nextSibling = siblings.find(sibling => {
                const rect = sibling.getBoundingClientRect();
                return e.clientY < rect.top + rect.height / 2 && e.clientX < rect.left + rect.width / 2;
            });
            container.insertBefore(draggingEl, nextSibling);
        });
    });
}

// Mouse Live speed telemetry tracker
let mouseSpeedHistory = [];
let maxMouseAccel = 0;
let lastSpeedX = 0, lastSpeedY = 0;
let lastSpeedTime = performance.now();

window.addEventListener('mousemove', (e) => {
    const now = performance.now();
    const dt = (now - lastSpeedTime) / 1000; // seconds
    if (dt < 0.005) return;
    
    const dx = e.clientX - lastSpeedX;
    const dy = e.clientY - lastSpeedY;
    const distPx = Math.sqrt(dx * dx + dy * dy);
    
    // Assume 96 DPI screen
    const distMeters = (distPx / 96) * 0.0254;
    const speed = distMeters / dt;
    
    const lastSpeed = mouseSpeedHistory.length > 0 ? mouseSpeedHistory[mouseSpeedHistory.length - 1].speed : 0;
    const accel = Math.abs(speed - lastSpeed) / dt;
    const accelG = accel / 9.81;
    
    if (accelG > maxMouseAccel && accelG < 12.0) {
        maxMouseAccel = accelG;
    }
    
    mouseSpeedHistory.push({ time: now, speed: speed, accel: accelG });
    if (mouseSpeedHistory.length > 250) mouseSpeedHistory.shift();
    
    // Live update UI
    const speedEl = document.getElementById('dash-mouse-speed');
    const accelEl = document.getElementById('dash-mouse-accel');
    const speedBar = document.getElementById('speed-progress');
    const accelBar = document.getElementById('accel-progress');
    
    if (speedEl) speedEl.textContent = `${speed.toFixed(2)} m/s`;
    if (accelEl) accelEl.textContent = `${maxMouseAccel.toFixed(2)} G`;
    
    if (speedBar) speedBar.style.width = `${Math.min(100, (speed / 3) * 100)}%`;
    if (accelBar) accelBar.style.width = `${Math.min(100, (maxMouseAccel / 6) * 100)}%`;
    
    lastSpeedX = e.clientX;
    lastSpeedY = e.clientY;
    lastSpeedTime = now;
});

// Interactive Waveform Chart Canvas on Dashboard
const dashCanvas = document.getElementById('dashboard-telemetry-canvas');
let dashCtx = null;
let chartPanOffset = 0;
let isPanningChart = false;
let panStartX = 0;

function initDashCanvas() {
    if (!dashCanvas) return;
    dashCtx = dashCanvas.getContext('2d');
    resizeDashCanvas();
    window.addEventListener('resize', resizeDashCanvas);
    
    // Chart Panning listeners
    dashCanvas.addEventListener('mousedown', (e) => {
        isPanningChart = true;
        panStartX = e.clientX;
    });
    dashCanvas.addEventListener('mousemove', (e) => {
        if (isPanningChart) {
            const dx = e.clientX - panStartX;
            chartPanOffset += dx;
            panStartX = e.clientX;
        } else {
            showChartTooltip(e);
        }
    });
    window.addEventListener('mouseup', () => {
        isPanningChart = false;
    });
    dashCanvas.addEventListener('mouseleave', () => {
        const tooltip = document.getElementById('chart-tooltip-el');
        if (tooltip) tooltip.style.display = 'none';
    });
    
    requestAnimationFrame(drawDashboardChart);
}

function resizeDashCanvas() {
    if (!dashCanvas) return;
    const rect = dashCanvas.getBoundingClientRect();
    dashCanvas.width = rect.width * window.devicePixelRatio;
    dashCanvas.height = rect.height * window.devicePixelRatio;
    if (dashCtx) {
        dashCtx.scale(window.devicePixelRatio, window.devicePixelRatio);
    }
}

function drawDashboardChart() {
    if (!dashCanvas || !dashCtx) {
        requestAnimationFrame(drawDashboardChart);
        return;
    }
    
    const w = dashCanvas.width / window.devicePixelRatio;
    const h = dashCanvas.height / window.devicePixelRatio;
    
    dashCtx.fillStyle = '#050608';
    dashCtx.fillRect(0, 0, w, h);
    
    // Grid Lines
    dashCtx.strokeStyle = 'rgba(255, 255, 255, 0.02)';
    dashCtx.lineWidth = 1;
    for (let x = 0; x < w; x += 30) {
        dashCtx.beginPath();
        dashCtx.moveTo(x, 0);
        dashCtx.lineTo(x, h);
        dashCtx.stroke();
    }
    for (let y = 0; y < h; y += 30) {
        dashCtx.beginPath();
        dashCtx.moveTo(0, y);
        dashCtx.lineTo(w, y);
        dashCtx.stroke();
    }
    
    if (mouseSpeedHistory.length > 1) {
        const zoomSlider = document.getElementById('chart-zoom-slider');
        const zoom = zoomSlider ? parseFloat(zoomSlider.value) : 1.0;
        const spacing = 3 * zoom;
        
        dashCtx.beginPath();
        dashCtx.strokeStyle = 'var(--color-primary)';
        dashCtx.lineWidth = 2.5;
        
        // Ambient Glow Line
        dashCtx.shadowBlur = 8;
        dashCtx.shadowColor = 'var(--color-primary)';
        
        const coords = [];
        for (let i = 0; i < mouseSpeedHistory.length; i++) {
            const pt = mouseSpeedHistory[i];
            const x = w - (mouseSpeedHistory.length - 1 - i) * spacing + chartPanOffset;
            const y = h - (pt.speed * (h / 3)) - 10; // 3m/s max
            coords.push({ x: x, y: y });
        }
        
        if (coords.length > 2) {
            dashCtx.moveTo(coords[0].x, coords[0].y);
            for (let i = 1; i < coords.length - 1; i++) {
                const xc = (coords[i].x + coords[i + 1].x) / 2;
                const yc = (coords[i].y + coords[i + 1].y) / 2;
                dashCtx.quadraticCurveTo(coords[i].x, coords[i].y, xc, yc);
            }
            dashCtx.lineTo(coords[coords.length - 1].x, coords[coords.length - 1].y);
        } else {
            dashCtx.moveTo(coords[0].x, coords[0].y);
            dashCtx.lineTo(coords[1].x, coords[1].y);
        }
        
        dashCtx.stroke();
        dashCtx.shadowBlur = 0; // reset
    }
    
    requestAnimationFrame(drawDashboardChart);
}

function showChartTooltip(e) {
    const tooltip = document.getElementById('chart-tooltip-el');
    if (!tooltip || mouseSpeedHistory.length === 0) return;
    
    const rect = dashCanvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    
    const zoomSlider = document.getElementById('chart-zoom-slider');
    const zoom = zoomSlider ? parseFloat(zoomSlider.value) : 1.0;
    const spacing = 3 * zoom;
    const w = rect.width;
    
    const spacingFromRight = w - mx;
    const indexFromRight = Math.round((spacingFromRight - chartPanOffset) / spacing);
    const dataIndex = mouseSpeedHistory.length - 1 - indexFromRight;
    
    if (dataIndex >= 0 && dataIndex < mouseSpeedHistory.length) {
        const pt = mouseSpeedHistory[dataIndex];
        tooltip.style.display = 'block';
        tooltip.style.left = `${mx + 15}px`;
        tooltip.style.top = `${my - 30}px`;
        tooltip.innerHTML = `Vitesse: ${pt.speed.toFixed(2)} m/s<br>Accel: ${pt.accel.toFixed(2)} G`;
    } else {
        tooltip.style.display = 'none';
    }
}

// Export CSV trigger
const btnExportCSV = document.getElementById('btn-export-csv');
if (btnExportCSV) {
    btnExportCSV.addEventListener('click', () => {
        let csvContent = "data:text/csv;charset=utf-8,Timestamp,Speed (m/s),Acceleration (G)\r\n";
        mouseSpeedHistory.forEach(pt => {
            csvContent += `${pt.time.toFixed(0)},${pt.speed.toFixed(3)},${pt.accel.toFixed(3)}\r\n`;
        });
        const encodedUri = encodeURI(csvContent);
        const link = document.createElement("a");
        link.setAttribute("href", encodedUri);
        link.setAttribute("download", "telemetrie_souris.csv");
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        showTelemetryToast("CSV EXPORTÉ");
    });
}

// CPU/RAM metrics simulator loop & Active Polling Rate measurement
let pollTimestamps = [];
window.addEventListener('mousemove', () => {
    const now = performance.now();
    pollTimestamps.push(now);
    // Keep only timestamps from the last 1000ms
    while (pollTimestamps.length > 0 && pollTimestamps[0] < now - 1000) {
        pollTimestamps.shift();
    }
});

setInterval(() => {
    const cpuVal = document.getElementById('dash-cpu-val');
    const ramVal = document.getElementById('dash-ram-val');
    if (cpuVal) {
        const cpu = (0.4 + Math.random() * 1.2).toFixed(1);
        cpuVal.textContent = `${cpu}%`;
    }
    if (ramVal) {
        const ram = Math.round(14 + Math.random() * 6);
        ramVal.textContent = `${ram} MB`;
    }
    
    // Live Polling rate display
    const rateVal = pollTimestamps.length;
    const pollingEl = document.getElementById('dash-polling-rate');
    if (pollingEl) {
        if (rateVal > 10) {
            pollingEl.textContent = `${rateVal} Hz`;
            pollingEl.style.color = 'var(--color-primary)';
        } else {
            const rateSelect = document.getElementById('polling-rate');
            const selectedRate = rateSelect ? rateSelect.value : '1000';
            pollingEl.textContent = `${selectedRate} Hz (Stable)`;
            pollingEl.style.color = 'var(--text-secondary)';
        }
    }
    
    // Sync filter badges
    const badgeRaw = document.getElementById('badge-rawaccel');
    const badgeSnap = document.getElementById('badge-snap');
    const badgeRipple = document.getElementById('badge-ripple');
    const badgeDeadzone = document.getElementById('badge-deadzone');
    
    if (badgeRaw) {
        const rawaccelEnabled = document.getElementById('accel-mode-raw') && document.getElementById('accel-mode-raw').value !== 'noaccel';
        badgeRaw.className = `filter-badge ${rawaccelEnabled ? 'active' : 'inactive'}`;
    }
    if (badgeSnap) {
        const snapEnabled = document.getElementById('angle-snapping') && document.getElementById('angle-snapping').checked;
        badgeSnap.className = `filter-badge ${snapEnabled ? 'active' : 'inactive'}`;
    }
    if (badgeRipple) {
        const rippleEnabled = document.getElementById('ripple-control') && document.getElementById('ripple-control').checked;
        badgeRipple.className = `filter-badge ${rippleEnabled ? 'active' : 'inactive'}`;
    }
    if (badgeDeadzone) {
        const deadzoneEnabled = document.getElementById('sensor-deadzone') && document.getElementById('sensor-deadzone').checked;
        badgeDeadzone.className = `filter-badge ${deadzoneEnabled ? 'active' : 'inactive'}`;
    }
    
    syncDashboardDpi();
}, 800);

// Sensor Filters Storage
function saveSensorFiltersToStorage() {
    const filters = {
        angleSnapping: document.getElementById('angle-snapping').checked,
        snapMode: document.getElementById('snap-mode').value,
        snapThreshold: parseFloat(document.getElementById('snap-threshold').value),
        snapStiffness: parseInt(document.getElementById('snap-stiffness').value),
        rippleControl: document.getElementById('ripple-control').checked,
        rippleStrength: document.getElementById('ripple-strength').value,
        sensorDeadzone: document.getElementById('sensor-deadzone').checked,
        deadzoneShape: document.getElementById('deadzone-shape').value,
        deadzoneThreshold: parseFloat(document.getElementById('deadzone-threshold').value),
        deadzoneDynamicFilter: document.getElementById('deadzone-dynamic-filter').checked
    };
    localStorage.setItem('GLAB_SENSOR_FILTERS', JSON.stringify(filters));
}

function loadSensorFiltersFromStorage() {
    const stored = localStorage.getItem('GLAB_SENSOR_FILTERS');
    if (stored) {
        try {
            const filters = JSON.parse(stored);
            const chkSnap = document.getElementById('angle-snapping');
            const snapMode = document.getElementById('snap-mode');
            const snapSlider = document.getElementById('snap-threshold');
            const snapDisplay = document.getElementById('snap-threshold-display');
            const snapStiffness = document.getElementById('snap-stiffness');
            const snapStiffnessDisplay = document.getElementById('snap-stiffness-display');
            
            const chkRipple = document.getElementById('ripple-control');
            const rippleStrength = document.getElementById('ripple-strength');
            
            const chkDeadzone = document.getElementById('sensor-deadzone');
            const deadzoneShape = document.getElementById('deadzone-shape');
            const deadzoneSlider = document.getElementById('deadzone-threshold');
            const deadzoneDisplay = document.getElementById('deadzone-threshold-display');
            const deadzoneDynamic = document.getElementById('deadzone-dynamic-filter');
            
            if (chkSnap) {
                chkSnap.checked = filters.angleSnapping;
                document.getElementById('row-snap-threshold').style.display = chkSnap.checked ? 'flex' : 'none';
            }
            if (snapMode && filters.snapMode) {
                snapMode.value = filters.snapMode;
            }
            if (snapSlider) {
                snapSlider.value = filters.snapThreshold || 15;
                if (snapDisplay) snapDisplay.textContent = `${snapSlider.value}°`;
            }
            if (snapStiffness) {
                snapStiffness.value = filters.snapStiffness || 6;
                if (snapStiffnessDisplay) snapStiffnessDisplay.textContent = `${snapStiffness.value}/10`;
            }
            if (chkRipple) {
                chkRipple.checked = filters.rippleControl;
                document.getElementById('row-ripple-strength').style.display = chkRipple.checked ? 'block' : 'none';
            }
            if (rippleStrength) {
                rippleStrength.value = filters.rippleStrength || "8";
            }
            if (chkDeadzone) {
                chkDeadzone.checked = filters.sensorDeadzone;
                document.getElementById('row-deadzone-threshold').style.display = chkDeadzone.checked ? 'flex' : 'none';
            }
            if (deadzoneShape && filters.deadzoneShape) {
                deadzoneShape.value = filters.deadzoneShape;
            }
            if (deadzoneSlider) {
                deadzoneSlider.value = filters.deadzoneThreshold || 0.4;
                if (deadzoneDisplay) deadzoneDisplay.textContent = `${deadzoneSlider.value} px`;
            }
            if (deadzoneDynamic && filters.deadzoneDynamicFilter !== undefined) {
                deadzoneDynamic.checked = filters.deadzoneDynamicFilter;
            }
        } catch(e) {
            console.error("Failed to restore sensor filters", e);
        }
    }
}

// Attach filter listeners
document.getElementById('angle-snapping').addEventListener('change', saveSensorFiltersToStorage);
document.getElementById('snap-mode').addEventListener('change', saveSensorFiltersToStorage);
document.getElementById('snap-threshold').addEventListener('change', saveSensorFiltersToStorage);
document.getElementById('snap-stiffness').addEventListener('change', saveSensorFiltersToStorage);
document.getElementById('ripple-control').addEventListener('change', saveSensorFiltersToStorage);
document.getElementById('ripple-strength').addEventListener('change', saveSensorFiltersToStorage);
document.getElementById('sensor-deadzone').addEventListener('change', saveSensorFiltersToStorage);
document.getElementById('deadzone-shape').addEventListener('change', saveSensorFiltersToStorage);
document.getElementById('deadzone-threshold').addEventListener('change', saveSensorFiltersToStorage);
document.getElementById('deadzone-dynamic-filter').addEventListener('change', saveSensorFiltersToStorage);

// Profile Import & Export Logic
const btnExportProfile = document.getElementById('btn-export-profile');
const btnImportProfile = document.getElementById('btn-import-profile');
const importProfileFile = document.getElementById('import-profile-file');

if (btnExportProfile) {
    btnExportProfile.addEventListener('click', () => {
        const state = {
            mouseSettings: mouseSettings,
            rawaccelSettings: rawaccelSettings,
            sensorFilters: {
                angleSnapping: document.getElementById('angle-snapping').checked,
                snapThreshold: parseFloat(document.getElementById('snap-threshold').value),
                rippleControl: document.getElementById('ripple-control').checked,
                rippleStrength: document.getElementById('ripple-strength').value,
                sensorDeadzone: document.getElementById('sensor-deadzone').checked,
                deadzoneThreshold: parseFloat(document.getElementById('deadzone-threshold').value),
                sensorSmoothing: document.getElementById('sensor-smoothing') ? document.getElementById('sensor-smoothing').checked : false,
                smoothingStrength: document.getElementById('smoothing-strength') ? parseInt(document.getElementById('smoothing-strength').value) : 0
            },
            themeCustomization: localStorage.getItem('GLAB_THEME_CUSTOM') ? JSON.parse(localStorage.getItem('GLAB_THEME_CUSTOM')) : null
        };
        const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(state, null, 2));
        const downloadAnchor = document.createElement('a');
        downloadAnchor.setAttribute("href", dataStr);
        downloadAnchor.setAttribute("download", "glab_config_profile.json");
        document.body.appendChild(downloadAnchor);
        downloadAnchor.click();
        document.body.removeChild(downloadAnchor);
        showTelemetryToast("PROFIL EXPORTÉ");
    });
}

if (btnImportProfile && importProfileFile) {
    btnImportProfile.addEventListener('click', () => {
        importProfileFile.click();
    });
    
    importProfileFile.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;
        
        const reader = new FileReader();
        reader.onload = (event) => {
            try {
                const importedState = JSON.parse(event.target.result);
                
                // Restore logic
                if (importedState.mouseSettings) {
                    Object.assign(mouseSettings, importedState.mouseSettings);
                    updateDpiUI();
                    
                    // Sync inputs
                    const r0 = document.querySelector(`input[name="active-dpi"][value="${mouseSettings.activeDpi}"]`);
                    if (r0) r0.checked = true;
                    const e1 = document.getElementById(`dpi-enable-1`);
                    if (e1) e1.checked = mouseSettings.dpiProfiles[1].enabled;
                    const e2 = document.getElementById(`dpi-enable-2`);
                    if (e2) e2.checked = mouseSettings.dpiProfiles[2].enabled;
                    const e3 = document.getElementById(`dpi-enable-3`);
                    if (e3) e3.checked = mouseSettings.dpiProfiles[3].enabled;
                    const rgb = document.querySelector(`input[name="rgb-mode"][value="${mouseSettings.rgbMode}"]`);
                    if (rgb) rgb.checked = true;
                    const scr = document.querySelector(`input[name="scroll-mode"][value="${mouseSettings.scrollMode}"]`);
                    if (scr) scr.checked = true;
                    
                    if (fireRateSlider) {
                        fireRateSlider.value = mouseSettings.fireRate;
                        fireRateDisplay.textContent = `${mouseSettings.fireRate} ms`;
                    }
                }
                
                if (importedState.rawaccelSettings) {
                    rawaccelSettings = importedState.rawaccelSettings;
                    populateRawaccelUI(rawaccelSettings);
                    syncRawaccelValues();
                    if (activeTab === 'tab-rawaccel') drawRawaccelChart();
                }
                
                if (importedState.sensorFilters) {
                    const filters = importedState.sensorFilters;
                    const chkSnap = document.getElementById('angle-snapping');
                    const snapMode = document.getElementById('snap-mode');
                    const snapSlider = document.getElementById('snap-threshold');
                    const snapDisplay = document.getElementById('snap-threshold-display');
                    const snapStiffness = document.getElementById('snap-stiffness');
                    const snapStiffnessDisplay = document.getElementById('snap-stiffness-display');
                    const chkRipple = document.getElementById('ripple-control');
                    const rippleStrength = document.getElementById('ripple-strength');
                    const chkDeadzone = document.getElementById('sensor-deadzone');
                    const deadzoneShape = document.getElementById('deadzone-shape');
                    const deadzoneSlider = document.getElementById('deadzone-threshold');
                    const deadzoneDisplay = document.getElementById('deadzone-threshold-display');
                    const deadzoneDynamic = document.getElementById('deadzone-dynamic-filter');
                    
                    if (chkSnap) {
                        chkSnap.checked = filters.angleSnapping;
                        document.getElementById('row-snap-threshold').style.display = chkSnap.checked ? 'flex' : 'none';
                    }
                    if (snapMode && filters.snapMode) {
                        snapMode.value = filters.snapMode;
                    }
                    if (snapSlider) {
                        snapSlider.value = filters.snapThreshold || 15;
                        if (snapDisplay) snapDisplay.textContent = `${snapSlider.value}°`;
                    }
                    if (snapStiffness) {
                        snapStiffness.value = filters.snapStiffness || 6;
                        if (snapStiffnessDisplay) snapStiffnessDisplay.textContent = `${snapStiffness.value}/10`;
                    }
                    if (chkRipple) {
                        chkRipple.checked = filters.rippleControl;
                        document.getElementById('row-ripple-strength').style.display = chkRipple.checked ? 'block' : 'none';
                    }
                    if (rippleStrength) {
                        rippleStrength.value = filters.rippleStrength || "8";
                    }
                    if (chkDeadzone) {
                        chkDeadzone.checked = filters.sensorDeadzone;
                        document.getElementById('row-deadzone-threshold').style.display = chkDeadzone.checked ? 'flex' : 'none';
                    }
                    if (deadzoneShape && filters.deadzoneShape) {
                        deadzoneShape.value = filters.deadzoneShape;
                    }
                    if (deadzoneSlider) {
                        deadzoneSlider.value = filters.deadzoneThreshold || 0.4;
                        if (deadzoneDisplay) deadzoneDisplay.textContent = `${deadzoneSlider.value} px`;
                    }
                    if (deadzoneDynamic && filters.deadzoneDynamicFilter !== undefined) {
                        deadzoneDynamic.checked = filters.deadzoneDynamicFilter;
                    }
                    
                    saveSensorFiltersToStorage();
                }
                
                if (importedState.themeCustomization) {
                    applyTheme(importedState.themeCustomization);
                    saveThemeSettings(importedState.themeCustomization);
                    loadThemeSettings();
                }
                
                showTelemetryToast("PROFIL IMPORTÉ");
            } catch (err) {
                alert("Erreur de format de profil : " + err.message);
            }
        };
        reader.readAsText(file);
        // Clear value to allow selecting same file again
        importProfileFile.value = '';
    });
}

// Initialize layouts, filters & graphs
loadWidgetLayout();
initDashboardDragAndDrop();
loadSensorFiltersFromStorage();
setTimeout(initDashCanvas, 200);

// ==========================================
// TELEMETRY & LATENCY ANALYSIS DASHBOARD
// ==========================================
let latencyCanvas = null;
let latencyCtx = null;
let totalPacketsTracked = 0;
let packetLossCount = 0;

function initLatencyCanvas() {
    latencyCanvas = document.getElementById('latency-histogram-canvas');
    if (!latencyCanvas) return;
    latencyCtx = latencyCanvas.getContext('2d');
    
    // Set high-dpi resolution for maximum visual premium quality
    const rect = latencyCanvas.getBoundingClientRect();
    latencyCanvas.width = rect.width * (window.devicePixelRatio || 1);
    latencyCanvas.height = rect.height * (window.devicePixelRatio || 1);
    latencyCtx.scale(window.devicePixelRatio || 1, window.devicePixelRatio || 1);
    
    drawLatencyHistogram();
}

function drawLatencyHistogram() {
    if (!latencyCtx || !latencyCanvas) return;
    const width = latencyCanvas.width / (window.devicePixelRatio || 1);
    const height = latencyCanvas.height / (window.devicePixelRatio || 1);
    
    // Clear Canvas
    latencyCtx.clearRect(0, 0, width, height);
    
    // Draw neon background grid lines
    latencyCtx.strokeStyle = 'rgba(255, 255, 255, 0.025)';
    latencyCtx.lineWidth = 1;
    for (let x = 40; x < width; x += 40) {
        latencyCtx.beginPath();
        latencyCtx.moveTo(x, 10);
        latencyCtx.lineTo(x, height - 30);
        latencyCtx.stroke();
    }
    for (let y = 20; y < height - 30; y += 30) {
        latencyCtx.beginPath();
        latencyCtx.moveTo(40, y);
        latencyCtx.lineTo(width - 20, y);
        latencyCtx.stroke();
    }
    
    // Bottom and left bounding axes
    latencyCtx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
    latencyCtx.beginPath();
    latencyCtx.moveTo(40, height - 30);
    latencyCtx.lineTo(width - 20, height - 30);
    latencyCtx.moveTo(40, 10);
    latencyCtx.lineTo(40, height - 30);
    latencyCtx.stroke();
    
    // Labels
    latencyCtx.fillStyle = 'var(--text-muted)';
    latencyCtx.font = '9px var(--font-mono)';
    latencyCtx.fillText("Intervalle (ms)", width / 2 - 35, height - 6);
    latencyCtx.fillText("Fréq", 12, 18);
    
    const history = window._latencyPacketHistory || [];
    if (history.length < 5) {
        latencyCtx.fillStyle = 'var(--text-muted)';
        latencyCtx.font = '11px var(--font-stack)';
        latencyCtx.fillText("Bougez le curseur pour démarrer le test en direct...", width / 2 - 120, height / 2);
        return;
    }
    
    const pollSelect = document.getElementById('polling-rate');
    const hz = pollSelect ? parseInt(pollSelect.value) : 1000;
    const expected = 1000 / hz;
    const minVal = expected - 0.5;
    const maxVal = expected + 0.5;
    
    const bucketsCount = 28;
    const buckets = new Array(bucketsCount).fill(0);
    
    history.forEach(v => {
        if (v < minVal || v > maxVal) return;
        const ratio = (v - minVal) / (maxVal - minVal);
        const idx = Math.floor(ratio * bucketsCount);
        if (idx >= 0 && idx < bucketsCount) {
            buckets[idx]++;
        }
    });
    
    const maxFreq = Math.max(1, ...buckets);
    const graphWidth = width - 60;
    const graphHeight = height - 50;
    const barWidth = graphWidth / bucketsCount - 2;
    
    // Plot the histogram bars
    for (let i = 0; i < bucketsCount; i++) {
        const freq = buckets[i];
        const barHeight = (freq / maxFreq) * graphHeight;
        const x = 45 + i * (graphWidth / bucketsCount);
        const y = height - 30 - barHeight;
        
        // Gradient fill matching theme accent
        const grad = latencyCtx.createLinearGradient(x, y, x, height - 30);
        grad.addColorStop(0, 'var(--color-primary)');
        grad.addColorStop(1, 'rgba(13, 245, 211, 0.05)');
        
        latencyCtx.fillStyle = grad;
        latencyCtx.fillRect(x, y, barWidth, barHeight);
    }
    
    // Draw tick labels for X axis (min, expected target, max)
    latencyCtx.fillStyle = 'var(--text-secondary)';
    latencyCtx.fillText(`${minVal.toFixed(2)}ms`, 45, height - 16);
    latencyCtx.fillText(`${expected.toFixed(2)}ms (Cible)`, width / 2 - 25, height - 16);
    latencyCtx.fillText(`${maxVal.toFixed(2)}ms`, width - 55, height - 16);
}

function updateLatencyStats(delta) {
    const pollSelect = document.getElementById('polling-rate');
    const hz = pollSelect ? parseInt(pollSelect.value) : 1000;
    const expected = 1000 / hz;
    
    totalPacketsTracked++;
    
    // Jitter (microseconds)
    const jitterMs = Math.abs(delta - expected);
    const jitterMicro = Math.round(jitterMs * 1000);
    
    // Packet loss detection: if interval is > 2.2x expected, we missed a slot!
    if (delta > expected * 2.2) {
        packetLossCount++;
    }
    
    // Update live displays if tab is active
    if (activeTab === 'tab-latency') {
        const motionValEl = document.getElementById('latency-motion-val');
        const jitterValEl = document.getElementById('latency-jitter-val');
        const lossValEl = document.getElementById('latency-packetloss-val');
        const stabilityValEl = document.getElementById('latency-stability-val');
        const avgValEl = document.getElementById('latency-avg-val');
        const usbDelayEl = document.getElementById('pipeline-usb-delay');
        const frameDelayEl = document.getElementById('pipeline-frame-delay');
        
        // Rolling average calculation for display
        const history = window._latencyPacketHistory || [];
        const sum = history.reduce((a, b) => a + b, 0);
        const avg = history.length ? sum / history.length : expected;
        
        if (avgValEl) avgValEl.textContent = `${avg.toFixed(3)} ms`;
        
        // Stability: percentage of packets within 15% of expected interval
        const stableCount = history.filter(v => Math.abs(v - expected) < expected * 0.15).length;
        const stabilityPercent = history.length ? (stableCount / history.length) * 100 : 99.5;
        if (stabilityValEl) {
            stabilityValEl.textContent = `${stabilityPercent.toFixed(1)}%`;
            stabilityValEl.style.color = stabilityPercent > 96 ? 'var(--color-success)' : 'var(--color-error)';
        }
        
        if (motionValEl) {
            // Simulated physical latency based on jitter and USB polling rate
            const simulatedMotionLatency = 0.35 + expected * 0.5 + (jitterMs * 0.5);
            motionValEl.textContent = `${simulatedMotionLatency.toFixed(2)} ms`;
        }
        
        if (jitterValEl) {
            jitterValEl.textContent = `${jitterMicro} \u03BCs`;
            jitterValEl.style.color = jitterMicro < 120 ? 'var(--color-success)' : '#ffaa00';
        }
        
        if (lossValEl) {
            const lossPercent = (packetLossCount / totalPacketsTracked) * 100;
            lossValEl.textContent = `${packetLossCount} (${lossPercent.toFixed(2)}%)`;
            lossValEl.style.color = packetLossCount === 0 ? 'var(--color-success)' : 'var(--color-error)';
        }
        
        if (usbDelayEl) {
            usbDelayEl.textContent = `${expected.toFixed(1)} ms (${hz}Hz)`;
        }
        
        // Frame to input delay depending on 240Hz monitor
        if (frameDelayEl) {
            const frameDelay = 1000 / 240; 
            frameDelayEl.textContent = `~${(frameDelay + expected).toFixed(1)} ms (240Hz)`;
        }
        
        drawLatencyHistogram();
    }
}

// Click Latency Test Interactive Zone
let clickTimes = [];
const clickZone = document.getElementById('click-test-zone');
const clickCountEl = document.getElementById('click-test-count');
const clickValEl = document.getElementById('latency-click-val');
const clickInstruction = document.getElementById('click-test-instruction');
const btnResetClick = document.getElementById('btn-reset-click-test');

if (clickZone) {
    clickZone.addEventListener('mousedown', (e) => {
        e.preventDefault();
        const start = performance.now();
        if (clickInstruction) {
            clickInstruction.textContent = "CLIC DÉTECTÉ !";
            clickInstruction.style.color = 'var(--color-primary)';
        }
        
        const handleMouseUp = () => {
            const duration = performance.now() - start;
            
            // Simulate switch mechanical rebound (typical debounce + trace travel speed)
            const debounceSetting = 3.5;
            const measuredLatency = debounceSetting + Math.min(2.0, duration / 150);
            
            clickTimes.push(measuredLatency);
            if (clickTimes.length > 50) clickTimes.shift();
            
            const avgClick = clickTimes.reduce((a, b) => a + b, 0) / clickTimes.length;
            if (clickValEl) {
                clickValEl.textContent = `${avgClick.toFixed(2)} ms`;
            }
            if (clickCountEl) {
                clickCountEl.textContent = clickTimes.length;
            }
            
            if (clickInstruction) {
                clickInstruction.textContent = "RELÂCHÉ ! RE-CLIQUEZ POUR RE-TESTER";
                clickInstruction.style.color = 'var(--color-secondary)';
            }
            
            window.removeEventListener('mouseup', handleMouseUp);
        };
        window.addEventListener('mouseup', handleMouseUp);
    });
}

if (btnResetClick) {
    btnResetClick.addEventListener('click', () => {
        clickTimes = [];
        if (clickValEl) clickValEl.textContent = "-- ms";
        if (clickCountEl) clickCountEl.textContent = "0";
        if (clickInstruction) {
            clickInstruction.textContent = "CLIQUEZ ICI POUR TESTER";
            clickInstruction.style.color = 'var(--text-secondary)';
        }
    });
}

// Close connection modal manually
const btnCloseConnModal = document.getElementById('btn-close-connection-modal');
if (btnCloseConnModal) {
    btnCloseConnModal.addEventListener('click', () => {
        const modal = document.getElementById('connection-modal');
        if (modal) modal.style.display = 'none';
    });
}


