/* ========== VARIABLES GLOBALES ========== */
let audioContext;
let inputGainNode, distortionNode, toneFilter, outputGainNode, destinationNode;
let analyser, canvasCtx, animationId;
let mediaStream, mediaRecorder, audioChunks = [];
let isRecording = false;
let currentDistortionType = 0;
let savedConfigurations = JSON.parse(localStorage.getItem('audioDistortionConfigs')) || [];
let currentConfig = {
  gain: 50,
  drive: 50,
  tone: 50,
  output: 50,
  distortionType: 0
};

/* ========== ELEMENTOS DEL DOM ========== */
const recordBtn = document.getElementById('recordBtn');
const stopBtn = document.getElementById('stopBtn');
const recordingStatus = document.getElementById('recordingStatus');
const audioPlayback = document.getElementById('audioPlayback');
const visualizer = document.getElementById('visualizer');

/* ========== FUNCIONES DE AUDIO ========== */
async function initAudioContext() {
  try {
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
    
    // Crear y configurar nodos de audio
    inputGainNode = audioContext.createGain();
    distortionNode = audioContext.createWaveShaper();
    toneFilter = audioContext.createBiquadFilter();
    outputGainNode = audioContext.createGain();
    analyser = audioContext.createAnalyser();
    destinationNode = audioContext.destination;
    
    // Valores iniciales
    inputGainNode.gain.value = 1;
    distortionNode.oversample = '4x';
    toneFilter.type = "lowpass";
    toneFilter.frequency.value = 2000;
    outputGainNode.gain.value = 0.5;
    analyser.fftSize = 256;
    
    // Conexión de nodos
    inputGainNode.connect(distortionNode);
    distortionNode.connect(toneFilter);
    toneFilter.connect(outputGainNode);
    outputGainNode.connect(analyser);
    outputGainNode.connect(destinationNode);
    
    updateDistortion();
    return true;
  } catch (error) {
    console.error("Error al inicializar AudioContext:", error);
    return false;
  }
}

function updateDistortion() {
  const driveValue = parseInt(document.querySelector('#slider2 .text').textContent) || 50;
  const normalizedDrive = 1 + (driveValue / 100 * 9);
  
  switch(currentDistortionType) {
    case 0: distortionNode.curve = makeDistortionCurve(normalizedDrive * 20, 'soft'); break;
    case 1: distortionNode.curve = makeDistortionCurve(normalizedDrive * 40, 'hard'); break;
    case 2: distortionNode.curve = makeDistortionCurve(normalizedDrive * 60, 'fuzz'); break;
    case 3: distortionNode.curve = makeDistortionCurve(normalizedDrive * 30, 'overdrive'); break;
  }
}

function makeDistortionCurve(amount, type) {
  const samples = 44100;
  const curve = new Float32Array(samples);
  
  for (let i = 0; i < samples; i++) {
    const x = (i * 2) / samples - 1;
    let y;
    
    switch(type) {
      case 'soft': y = (Math.PI + Math.atan(Math.PI * x * amount)) / (Math.PI + Math.atan(Math.PI * amount)); break;
      case 'hard': y = Math.min(0.8, Math.max(-0.8, x * amount)) / amount; break;
      case 'fuzz': y = Math.sin(x * Math.PI * amount) * 0.8; break;
      case 'overdrive': 
        const k = 2 * amount / (1 - amount);
        y = (1 + k) * x / (1 + k * Math.abs(x));
        break;
      default: y = x;
    }
    
    curve[i] = y;
  }
  
  return curve;
}

/* ========== VISUALIZADOR ========== */
function initVisualizer() {
  canvasCtx = visualizer.getContext('2d');
  visualizer.width = visualizer.offsetWidth;
  visualizer.height = visualizer.offsetHeight;
}

function drawVisualizer() {
  if (!analyser) return;
  
  const bufferLength = analyser.frequencyBinCount;
  const dataArray = new Uint8Array(bufferLength);
  analyser.getByteTimeDomainData(dataArray);
  
  canvasCtx.fillStyle = 'rgb(20, 20, 30)';
  canvasCtx.fillRect(0, 0, visualizer.width, visualizer.height);
  
  canvasCtx.lineWidth = 2;
  canvasCtx.strokeStyle = 'rgb(200, 50, 50)';
  canvasCtx.beginPath();
  
  const sliceWidth = visualizer.width * 1.0 / bufferLength;
  let x = 0;
  
  for (let i = 0; i < bufferLength; i++) {
    const v = dataArray[i] / 128.0;
    const y = v * visualizer.height / 2;
    
    if (i === 0) canvasCtx.moveTo(x, y);
    else canvasCtx.lineTo(x, y);
    
    x += sliceWidth;
  }
  
  canvasCtx.lineTo(visualizer.width, visualizer.height / 2);
  canvasCtx.stroke();
  animationId = requestAnimationFrame(drawVisualizer);
}

/* ========== GRABACIÓN ========== */
async function startRecording() {
  try {
    if (!audioContext) await initAudioContext();
    
    mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const source = audioContext.createMediaStreamSource(mediaStream);
    source.connect(inputGainNode);
    
    const audioDest = audioContext.createMediaStreamDestination();
    outputGainNode.connect(audioDest);
    
    mediaRecorder = new MediaRecorder(audioDest.stream);
    audioChunks = [];
    
    mediaRecorder.ondataavailable = event => audioChunks.push(event.data);
    mediaRecorder.onstop = () => {
      const audioBlob = new Blob(audioChunks, { type: 'audio/wav' });
      audioPlayback.src = URL.createObjectURL(audioBlob);
      audioPlayback.style.display = 'block';
      cancelAnimationFrame(animationId);
    };
    
    initVisualizer();
    drawVisualizer();
    mediaRecorder.start();
    isRecording = true;
    
    recordBtn.disabled = true;
    stopBtn.disabled = false;
    recordingStatus.innerHTML = '<span class="material-icons">mic</span><span>Grabando...</span>';
    recordingStatus.classList.add('recording');
  } catch (error) {
    console.error('Error al iniciar grabación:', error);
    recordingStatus.innerHTML = `<span class="material-icons">error</span><span>Error: ${error.message}</span>`;
  }
}

function stopRecording() {
  if (mediaRecorder && isRecording) {
    mediaRecorder.stop();
    isRecording = false;
    mediaStream.getTracks().forEach(track => track.stop());
    recordBtn.disabled = false;
    stopBtn.disabled = true;
    recordingStatus.innerHTML = '<span class="material-icons">check_circle</span><span>Grabación completada</span>';
    recordingStatus.classList.remove('recording');
  }
}

/* ========== CONFIGURACIONES GUARDADAS ========== */
function renderConfigList() {
  const configList = document.getElementById('configList');
  if (!configList) return;
  
  configList.innerHTML = savedConfigurations.map((config, index) => `
    <div class="config-item">
      <div class="config-info">
        <div class="config-name">${config.name}</div>
        <div class="config-date">${config.date}</div>
      </div>
      <div class="config-actions">
        <button class="config-btn load-btn" data-index="${index}">Cargar</button>
        <button class="config-btn delete-btn" data-index="${index}">Eliminar</button>
      </div>
    </div>
  `).join('');
  
  document.querySelectorAll('.load-btn').forEach(btn => {
    btn.addEventListener('click', () => loadConfig(parseInt(btn.dataset.index)));
  });
  
  document.querySelectorAll('.delete-btn').forEach(btn => {
    btn.addEventListener('click', () => deleteConfig(parseInt(btn.dataset.index)));
  });
}

function loadConfig(index) {
  if (index >= 0 && index < savedConfigurations.length) {
    const config = savedConfigurations[index].settings;
    currentConfig = {...config};
    
    setKnobValue('slider1', config.gain);
    setKnobValue('slider2', config.drive);
    setKnobValue('slider3', config.tone);
    setKnobValue('slider4', config.output);
    setKnobValue('stopKnob', config.distortionType);
    
    applyCurrentConfig();
    alert(`Configuración "${savedConfigurations[index].name}" cargada`);
  }
}

function deleteConfig(index) {
  if (index >= 0 && index < savedConfigurations.length && confirm(`¿Eliminar "${savedConfigurations[index].name}"?`)) {
    savedConfigurations.splice(index, 1);
    localStorage.setItem('audioDistortionConfigs', JSON.stringify(savedConfigurations));
    renderConfigList();
  }
}

function saveCurrentConfig() {
  const configName = prompt("Nombre para esta configuración:");
  if (configName) {
    savedConfigurations.unshift({
      name: configName,
      date: new Date().toLocaleString(),
      settings: {...currentConfig}
    });
    localStorage.setItem('audioDistortionConfigs', JSON.stringify(savedConfigurations));
    renderConfigList();
    alert(`"${configName}" guardada`);
  }
}

function resetToDefault() {
  if (confirm("¿Restablecer valores predeterminados?")) {
    currentConfig = { gain: 50, drive: 50, tone: 50, output: 50, distortionType: 0 };
    setKnobValue('slider1', 50);
    setKnobValue('slider2', 50);
    setKnobValue('slider3', 50);
    setKnobValue('slider4', 50);
    setKnobValue('stopKnob', 0);
    applyCurrentConfig();
  }
}

function applyCurrentConfig() {
  if (inputGainNode) inputGainNode.gain.value = currentConfig.gain / 100 * 2;
  if (outputGainNode) outputGainNode.gain.value = currentConfig.output / 100;
  if (toneFilter) toneFilter.frequency.value = 200 + (currentConfig.tone / 100 * 4800);
  currentDistortionType = currentConfig.distortionType;
  updateDistortion();
}

/* ========== FUNCIONES DE KNOBS ========== */
function setKnobValue(knobId, value) {
  const knobElement = document.getElementById(knobId);
  if (!knobElement) return;
  
  const rotationAngle = (value / 100) * 270;
  const pointer = knobElement.querySelector('.pointer');
  const circle = knobElement.querySelector('.dynamic-circle');
  const text = knobElement.querySelector('.text');
  
  if (pointer) pointer.style.transform = `rotate(${rotationAngle - 45}deg)`;
  if (circle) circle.style.strokeDashoffset = `${880 - 660 * (value / 100)}`;
  
  if (text) {
    text.textContent = knobId === 'stopKnob' 
      ? ['SOFT', 'HARD', 'FUZZ', 'OVERDRIVE'][value]
      : value;
  }
}

function setupContinuousKnob(id, callback) {
  const knobElement = document.getElementById(id);
  const knob = knobElement.querySelector('.knob');
  const pointer = knobElement.querySelector('.pointer');
  const circle = knobElement.querySelector('.dynamic-circle');
  const text = knobElement.querySelector('.text');
  
  let isRotating = false;
  
  knob.addEventListener('mousedown', (e) => {
    isRotating = true;
    e.preventDefault();
  });
  
  const rotateKnob = (e) => {
    if (isRotating) {
      const knobRect = knob.getBoundingClientRect();
      const knobX = knobRect.left + knobRect.width / 2;
      const knobY = knobRect.top + knobRect.height / 2;
      
      const deltaX = e.clientX - knobX;
      const deltaY = e.clientY - knobY;
      
      const angleRad = Math.atan2(deltaY, deltaX);
      let angleDeg = (angleRad * 180) / Math.PI;
      let rotationAngle = (angleDeg - 135 + 360) % 360;
      
      if (rotationAngle <= 270) {
        const progressValue = Math.round(rotationAngle / 270 * 100);
        pointer.style.transform = `rotate(${rotationAngle - 45}deg)`;
        circle.style.strokeDashoffset = `${880 - 660 * (progressValue / 100)}`;
        text.textContent = progressValue;
        callback(progressValue);
        currentConfig[id === 'slider1' ? 'gain' : 
                     id === 'slider2' ? 'drive' : 
                     id === 'slider3' ? 'tone' : 'output'] = progressValue;
      }
    }
  };
  
  document.addEventListener('mousemove', rotateKnob);
  document.addEventListener('mouseup', () => isRotating = false);
}

function setupStopKnob(id, callback) {
  const knobElement = document.getElementById(id);
  const knob = knobElement.querySelector('.knob');
  const markers = knobElement.querySelector('.knob-stop-markers');
  const pointer = knobElement.querySelector('.pointer');
  const circle = knobElement.querySelector('.dynamic-circle');
  const text = knobElement.querySelector('.text');
  const distortionNames = ['SOFT', 'HARD', 'FUZZ', 'OVERDRIVE'];
  
  let currentStopIndex = 0;
  
  function createMarkers() {
    markers.innerHTML = '';
    [0, 90, 180, 270].forEach((angle, index) => {
      const angleRad = (angle + 135) * Math.PI / 180;
      const x = 150 + 120 * Math.cos(angleRad);
      const y = 150 + 120 * Math.sin(angleRad);
      
      const stop = document.createElement('div');
      stop.className = `knob-stop ${index === currentStopIndex ? 'active' : ''}`;
      stop.style.left = `${x}px`;
      stop.style.top = `${y}px`;
      markers.appendChild(stop);
    });
  }
  
  function snapToNearestStop(angle) {
    const positions = [0, 90, 180, 270];
    const nearestIndex = positions.reduce((closest, pos, index) => {
      const diff = Math.abs(pos - angle);
      return diff < closest.diff ? { diff, index } : closest;
    }, { diff: Infinity, index: 0 }).index;
    
    currentStopIndex = nearestIndex;
    const snappedAngle = positions[nearestIndex];
    
    pointer.style.transform = `rotate(${snappedAngle - 45}deg)`;
    circle.style.strokeDashoffset = `${880 - 660 * (snappedAngle / 270)}`;
    text.textContent = distortionNames[nearestIndex];
    
    markers.querySelectorAll('.knob-stop').forEach((stop, i) => {
      stop.classList.toggle('active', i === nearestIndex);
    });
    
    callback(nearestIndex);
    currentConfig.distortionType = nearestIndex;
    return snappedAngle;
  }
  
  createMarkers();
  text.textContent = distortionNames[currentStopIndex];
  
  knob.addEventListener('mousedown', (e) => {
    e.preventDefault();
    let isDragging = true;
    
    const rotateKnob = (e) => {
      if (isDragging) {
        const knobRect = knob.getBoundingClientRect();
        const knobX = knobRect.left + knobRect.width / 2;
        const knobY = knobRect.top + knobRect.height / 2;
        
        const deltaX = e.clientX - knobX;
        const deltaY = e.clientY - knobY;
        
        const angleRad = Math.atan2(deltaY, deltaX);
        let angleDeg = (angleRad * 180) / Math.PI;
        let rotationAngle = (angleDeg - 135 + 360) % 360;
        
        if (rotationAngle <= 270) snapToNearestStop(rotationAngle);
      }
    };
    
    document.addEventListener('mousemove', rotateKnob);
    document.addEventListener('mouseup', () => isDragging = false, { once: true });
  });
}

function setupKnobs() {
  setupContinuousKnob('slider1', value => {
    if (inputGainNode) inputGainNode.gain.value = value / 100 * 2;
  });
  
  setupContinuousKnob('slider2', () => updateDistortion());
  
  setupContinuousKnob('slider3', value => {
    if (toneFilter) toneFilter.frequency.value = 200 + (value / 100 * 4800);
  });
  
  setupContinuousKnob('slider4', value => {
    if (outputGainNode) outputGainNode.gain.value = value / 100;
  });
  
  setupStopKnob('stopKnob', position => {
    currentDistortionType = position;
    updateDistortion();
  });
}

/* ========== INICIALIZACIÓN ========== */
document.addEventListener('DOMContentLoaded', () => {
  setupKnobs();
  renderConfigList();
  
  document.getElementById('resetBtn').addEventListener('click', resetToDefault);
  document.getElementById('saveBtn').addEventListener('click', saveCurrentConfig);
  recordBtn.addEventListener('click', startRecording);
  stopBtn.addEventListener('click', stopRecording);
});

window.addEventListener('beforeunload', () => {
  if (isRecording) stopRecording();
  if (audioContext) audioContext.close();
});