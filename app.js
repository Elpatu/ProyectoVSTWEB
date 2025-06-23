// Variables globales
let audioContext;
let inputGainNode, distortionNode, toneFilter, outputGainNode, destinationNode;
let analyser, canvasCtx, animationId;
let mediaStream, mediaRecorder, audioChunks = [];
let isRecording = false;
let currentDistortionType = 0;

// Elementos del DOM
const recordBtn = document.getElementById('recordBtn');
const stopBtn = document.getElementById('stopBtn');
const recordingStatus = document.getElementById('recordingStatus');
const audioPlayback = document.getElementById('audioPlayback');
const visualizer = document.getElementById('visualizer');

// Inicializar el contexto de audio
async function initAudioContext() {
  try {
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
    
    // Crear nodos de audio
    inputGainNode = audioContext.createGain();
    distortionNode = audioContext.createWaveShaper();
    toneFilter = audioContext.createBiquadFilter();
    outputGainNode = audioContext.createGain();
    analyser = audioContext.createAnalyser();
    destinationNode = audioContext.destination;
    
    // Configurar valores iniciales
    inputGainNode.gain.value = 1;
    distortionNode.oversample = '4x';
    toneFilter.type = "lowpass";
    toneFilter.frequency.value = 2000;
    outputGainNode.gain.value = 0.5;
    analyser.fftSize = 256;
    
    // Conectar nodos
    inputGainNode.connect(distortionNode);
    distortionNode.connect(toneFilter);
    toneFilter.connect(outputGainNode);
    outputGainNode.connect(analyser);
    outputGainNode.connect(destinationNode);
    
    // Configurar distorsión inicial
    updateDistortion();
    
    console.log("AudioContext inicializado correctamente");
    return true;
  } catch (error) {
    console.error("Error al inicializar AudioContext:", error);
    return false;
  }
}

// Funciones de distorsión
function updateDistortion() {
  const driveValue = document.querySelector('#slider2 .text').textContent / 100 * 10;
  
  switch(currentDistortionType) {
    case 0: // Soft clipping
      distortionNode.curve = makeDistortionCurve(driveValue, 'soft');
      break;
    case 1: // Hard clipping
      distortionNode.curve = makeDistortionCurve(driveValue, 'hard');
      break;
    case 2: // Fuzz
      distortionNode.curve = makeDistortionCurve(driveValue, 'fuzz');
      break;
    case 3: // Overdrive
      distortionNode.curve = makeDistortionCurve(driveValue, 'overdrive');
      break;
  }
}

function makeDistortionCurve(amount, type) {
  const samples = 44100;
  const curve = new Float32Array(samples);
  
  for (let i = 0; i < samples; i++) {
    const x = (i * 2) / samples - 1;
    let y;
    
    switch(type) {
      case 'soft':
        y = Math.sign(x) * (1 - Math.exp(-Math.abs(x) * amount));
        break;
      case 'hard':
        y = Math.min(0.7, Math.max(-0.7, x * amount));
        break;
      case 'fuzz':
        y = Math.sin(x * 10 * amount) / 2;
        break;
      case 'overdrive':
        y = Math.atan(x * 3 * amount);
        break;
      default:
        y = x;
    }
    
    curve[i] = y;
  }
  
  return curve;
}

// Visualizador
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
    
    if (i === 0) {
      canvasCtx.moveTo(x, y);
    } else {
      canvasCtx.lineTo(x, y);
    }
    
    x += sliceWidth;
  }
  
  canvasCtx.lineTo(visualizer.width, visualizer.height / 2);
  canvasCtx.stroke();
  
  animationId = requestAnimationFrame(drawVisualizer);
}

// Grabación de audio
async function startRecording() {
  try {
    if (!audioContext) {
      const success = await initAudioContext();
      if (!success) throw new Error("No se pudo inicializar el audio");
    }
    
    mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const source = audioContext.createMediaStreamSource(mediaStream);
    source.connect(inputGainNode);
    
    // Configurar grabador con audio procesado
    const audioDest = audioContext.createMediaStreamDestination();
    outputGainNode.connect(audioDest);
    
    mediaRecorder = new MediaRecorder(audioDest.stream);
    audioChunks = [];
    
    mediaRecorder.ondataavailable = event => {
      audioChunks.push(event.data);
    };
    
    mediaRecorder.onstop = () => {
      const audioBlob = new Blob(audioChunks, { type: 'audio/wav' });
      const audioUrl = URL.createObjectURL(audioBlob);
      audioPlayback.src = audioUrl;
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

// Configuración de knobs
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
        pointer.style.transform = `rotate(${rotationAngle - 45}deg)`;
        const progressPercent = rotationAngle / 270;
        const progressValue = Math.round(progressPercent * 100);
        
        circle.style.strokeDashoffset = `${880 - 660 * progressPercent}`;
        text.textContent = progressValue;
        callback(progressValue);
      }
    }
  };
  
  document.addEventListener('mousemove', rotateKnob);
  document.addEventListener('mouseup', () => {
    isRotating = false;
  });
}

function setupStopKnob(id, callback) {
  const knobElement = document.getElementById(id);
  const knob = knobElement.querySelector('.knob');
  const markers = knobElement.querySelector('.knob-stop-markers');
  const pointer = knobElement.querySelector('.pointer');
  const circle = knobElement.querySelector('.dynamic-circle');
  const text = knobElement.querySelector('.text');
  
  const stopPositions = [0, 90, 180, 270];
  let currentStopIndex = 0;
  
  function createMarkers() {
    markers.innerHTML = '';
    const center = 150;
    const radius = 120;
    
    stopPositions.forEach((angle, index) => {
      const angleRad = (angle + 135) * Math.PI / 180;
      const x = center + radius * Math.cos(angleRad);
      const y = center + radius * Math.sin(angleRad);
      
      const stop = document.createElement('div');
      stop.className = 'knob-stop';
      stop.style.left = `${x}px`;
      stop.style.top = `${y}px`;
      if (index === currentStopIndex) stop.classList.add('active');
      
      markers.appendChild(stop);
    });
  }
  
  function snapToNearestStop(angle) {
    let minDiff = Infinity;
    let nearestStopIndex = 0;
    
    stopPositions.forEach((stopAngle, index) => {
      const diff = Math.abs(stopAngle - angle);
      if (diff < minDiff) {
        minDiff = diff;
        nearestStopIndex = index;
      }
    });
    
    currentStopIndex = nearestStopIndex;
    const snappedAngle = stopPositions[currentStopIndex];
    
    pointer.style.transform = `rotate(${snappedAngle - 45}deg)`;
    circle.style.strokeDashoffset = `${880 - 660 * (snappedAngle / 270)}`;
    text.textContent = currentStopIndex + 1;
    
    document.querySelectorAll(`#${id} .knob-stop`).forEach((stop, index) => {
      stop.classList.toggle('active', index === currentStopIndex);
    });
    
    callback(currentStopIndex);
    return snappedAngle;
  }
  
  createMarkers();
  
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
        
        if (rotationAngle <= 270) {
          snapToNearestStop(rotationAngle);
        }
      }
    };
    
    document.addEventListener('mousemove', rotateKnob);
    document.addEventListener('mouseup', () => {
      isDragging = false;
      document.removeEventListener('mousemove', rotateKnob);
    }, { once: true });
  });
}

function setupKnobs() {
  // Knob 1 - Ganancia de entrada (0-2)
  setupContinuousKnob('slider1', value => {
    if (inputGainNode) inputGainNode.gain.value = value / 100 * 2;
  });
  
  // Knob 2 - Drive de distorsión (1-10)
  setupContinuousKnob('slider2', () => {
    updateDistortion();
  });
  
  // Knob 3 - Tono (200Hz-5kHz)
  setupContinuousKnob('slider3', value => {
    if (toneFilter) toneFilter.frequency.value = 200 + (value / 100 * 4800);
  });
  
  // Knob 4 - Salida (0-1)
  setupContinuousKnob('slider4', value => {
    if (outputGainNode) outputGainNode.gain.value = value / 100;
  });
  
  // Knob de distorsión (0-3)
  setupStopKnob('stopKnob', position => {
    currentDistortionType = position;
    updateDistortion();
  });
}

// Inicialización
document.addEventListener('DOMContentLoaded', () => {
  setupKnobs();
  
  recordBtn.addEventListener('click', startRecording);
  stopBtn.addEventListener('click', stopRecording);
});

// Limpieza
window.addEventListener('beforeunload', () => {
  if (isRecording) stopRecording();
  if (audioContext) audioContext.close();
});