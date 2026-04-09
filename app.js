// --- ELEMEN UI ---
const logOutput = document.getElementById('log-output');
const speedSlider = document.getElementById('slider-speed');
const speedVal = document.getElementById('speed-val');
const btnConnect = document.getElementById('btn-connect');
const btStatusDot = document.getElementById('bt-status-dot');
const btStatusText = document.getElementById('bt-status-text');
const padStatusDot = document.getElementById('pad-status-dot');
const padStatusText = document.getElementById('pad-status-text');

const knobLeft = document.getElementById('knob-left');
const knobRight = document.getElementById('knob-right');

// --- PEMBOLEHUBAH BLUETOOTH (Micro:bit UART) ---
const UART_SERVICE_UUID = "6e400001-b5a3-f393-e0a9-e50e24dcca9e";
const UART_TX_CHARACTERISTIC_UUID = "6e400002-b5a3-f393-e0a9-e50e24dcca9e"; // RX di Microbit

let bleDevice;
let bleServer;
let txCharacteristic;
let isConnected = false;

// --- PEMBOLEHUBAH KAWALAN ---
let maxSpeed = 255;
let gamepadIndex = null;
let sendInterval = null;

// Kemas kini nilai slider
speedSlider.addEventListener('input', (e) => {
    maxSpeed = e.target.value;
    speedVal.innerText = maxSpeed;
});

// Fungsi Log
function log(msg) {
    const time = new Date().toLocaleTimeString();
    logOutput.innerHTML = `[${time}] ${msg}<br>` + logOutput.innerHTML;
}

// --- BLUETOOTH CONNECTION ---
btnConnect.addEventListener('click', async () => {
    if (isConnected) {
        bleDevice.gatt.disconnect();
        return;
    }
    try {
        log("Mencari Micro:bit...");
        bleDevice = await navigator.bluetooth.requestDevice({
            filters: [{ namePrefix: 'BBC micro:bit' }],
            optionalServices: [UART_SERVICE_UUID]
        });

        bleDevice.addEventListener('gattserverdisconnected', onDisconnected);
        log("Menyambung ke GATT Server...");
        bleServer = await bleDevice.gatt.connect();

        log("Mendapatkan Servis UART...");
        const service = await bleServer.getPrimaryService(UART_SERVICE_UUID);
        txCharacteristic = await service.getCharacteristic(UART_TX_CHARACTERISTIC_UUID);

        isConnected = true;
        btnConnect.innerText = "Disconnect";
        btStatusDot.className = "dot connected";
        btStatusText.innerText = "BLE Connected";
        log("Berjaya disambung! Bersedia menghantar arahan.");
        
        // Mula loop penghantaran data
        startSendingData();

    } catch (error) {
        log("Ralat: " + error);
    }
});

function onDisconnected() {
    isConnected = false;
    btnConnect.innerText = "Connect BLE";
    btStatusDot.className = "dot disconnected";
    btStatusText.innerText = "BLE Disconnected";
    clearInterval(sendInterval);
    log("Micro:bit terputus sambungan.");
}

// Fungsi hantar data ke Micro:bit
async function sendCommand(leftM, rightM) {
    if (!isConnected || !txCharacteristic) return;
    
    // Format hantar: "M,LeftSpeed,RightSpeed\n"
    // Contoh: "M,255,-255\n"
    let cmd = `M,${Math.round(leftM)},${Math.round(rightM)}\n`;
    let encoder = new TextEncoder();
    try {
        await txCharacteristic.writeValue(encoder.encode(cmd));
    } catch (e) {
        // Abaikan ralat kecil jika data terlalu laju
    }
}

// --- GAMEPAD (PS4) CONTROLLER LOGIC ---
window.addEventListener("gamepadconnected", (e) => {
    gamepadIndex = e.gamepad.index;
    padStatusDot.className = "dot connected";
    padStatusText.innerText = e.gamepad.id.substring(0, 15) + "...";
    log("Gamepad bersambung: " + e.gamepad.id);
    requestAnimationFrame(updateLoop);
});

window.addEventListener("gamepaddisconnected", (e) => {
    if (e.gamepad.index === gamepadIndex) {
        gamepadIndex = null;
        padStatusDot.className = "dot disconnected";
        padStatusText.innerText = "PS4 Disconnected";
        log("Gamepad terputus.");
    }
});

let currentLeftMotor = 0;
let currentRightMotor = 0;

function updateLoop() {
    if (gamepadIndex !== null) {
        const gamepads = navigator.getGamepads();
        const pad = gamepads[gamepadIndex];

        if (pad) {
            // PS4 Mapping Standard
            // Axes[1] = Kiri Analog Y (Atas/Bawah) -> Negatif = Atas
            // Axes[2] atau Axes[3] = Kanan Analog X (Kiri/Kanan)
            let throttleRaw = -pad.axes[1]; // Invert supaya tolak ke atas jadi positif
            let steeringRaw = pad.axes[2];  // Bergantung pada OS, kadang-kadang axes[3]

            // Letak deadzone untuk elak robot gerak sendiri bila analog tak disentuh
            let throttle = Math.abs(throttleRaw) > 0.1 ? throttleRaw : 0;
            let steering = Math.abs(steeringRaw) > 0.1 ? steeringRaw : 0;

            // Update UI Joystick Knob (Visual sahaja)
            knobLeft.style.transform = `translate(-50%, calc(-50% + ${-throttle * 40}px))`;
            knobRight.style.transform = `translate(calc(-50% + ${steering * 40}px), -50%)`;

            // Kira kelajuan Arcade Drive
            let boost = pad.buttons[7].pressed ? 1.5 : 1; // R2 untuk Boost
            let finalMaxSpeed = Math.min(maxSpeed * boost, 255);

            let leftMotor = (throttle + steering) * finalMaxSpeed;
            let rightMotor = (throttle - steering) * finalMaxSpeed;

            // Hadkan nilai dari -255 hingga 255
            currentLeftMotor = Math.max(-255, Math.min(255, leftMotor));
            currentRightMotor = Math.max(-255, Math.min(255, rightMotor));

            // E-STOP: Jika butang X ditekan
            if (pad.buttons[0].pressed) {
                currentLeftMotor = 0;
                currentRightMotor = 0;
            }
        }
        requestAnimationFrame(updateLoop);
    }
}

// Loop untuk hantar data berkala melalui Bluetooth (Setiap 100ms)
function startSendingData() {
    if (sendInterval) clearInterval(sendInterval);
    sendInterval = setInterval(() => {
        sendCommand(currentLeftMotor, currentRightMotor);
    }, 100); // 10 arahan sesaat (Elak Bluetooth jammed)
}
