document.addEventListener('DOMContentLoaded', function() {
    // Seleccionar todos los sliders
    const sliders = document.querySelectorAll('.slider');
    
    sliders.forEach((slider, index) => {
        const knob = slider.querySelector('.knob');
        const circle = slider.querySelector('.dynamic-circle');
        const pointer = slider.querySelector('.pointer');
        const text = slider.querySelector('.text');
        
        let isRotating = false;
        
        knob.addEventListener('mousedown', (e) => {
            isRotating = true;
            e.preventDefault(); // Evitar selección de texto
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
                
                // Ajustar el ángulo para que empiece en -135°
                let rotationAngle = (angleDeg - 135 + 360) % 360;
                
                if (rotationAngle <= 270) {
                    pointer.style.transform = `rotate(${rotationAngle - 45}deg)`;
                    
                    const progressPercent = rotationAngle / 270;
                    const progressValue = Math.round(progressPercent * 100);
                    
                    // Actualizar el círculo de progreso
                    circle.style.strokeDashoffset = `${880 - 660 * progressPercent}`;
                    
                    // Actualizar el texto
                    text.innerHTML = progressValue;
                    
                    // Opcional: Emitir evento personalizado con el valor
                    const event = new CustomEvent('knobChange', {
                        detail: {
                            id: slider.id || `knob-${index + 1}`,
                            value: progressValue
                        }
                    });
                    slider.dispatchEvent(event);
                }
            }
        };
        
        document.addEventListener('mousemove', rotateKnob);
        document.addEventListener('mouseup', () => {
            isRotating = false;
        });
        
        // Opcional: Escuchar cambios en los knobs
        slider.addEventListener('knobChange', (e) => {
            console.log(`Knob ${e.detail.id} cambiado a: ${e.detail.value}%`);
        });
    });
});