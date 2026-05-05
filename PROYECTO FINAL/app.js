/**
 * Eco-Smart Estación Argentina - Lógica Principal
 * Manejo de decaimiento exponencial y conexión a OpenWeatherMap
 */

// ==========================================
// CONFIGURACIÓN (CONSTANTES)
// ==========================================

// Usaremos la API gratuita de Open-Meteo que no requiere API Key
const LAT = -17.78; // Santa Cruz de la Sierra
const LON = -63.18;

// Constantes de deterioro (k) base de tu estudio (Ajustadas para mayor realismo)
const PRODUCT_CONSTANTS = {
    lechuga: 0.320,
    cebolla: 0.050, // Ajustado a ~32 días críticos
    tomate: 0.200,  // Ajustado a ~8 días críticos
    papa: 0.083
};

const PRODUCT_NAMES = {
    lechuga: "La Lechuga",
    cebolla: "La Cebolla",
    tomate: "El Tomate",
    papa: "La Papa"
};

// ==========================================
// ESTADO GLOBAL
// ==========================================
let currentTemp = null; // Temperatura actual o histórica
let timerInterval = null; // Para el contador regresivo

// ==========================================
// ELEMENTOS DEL DOM
// ==========================================
const form = document.getElementById('calculator-form');
const btnLoader = document.getElementById('btn-loader');
const calculateBtn = document.getElementById('calculate-btn');
const mainCard = document.querySelector('.main-card');
const resultsSection = document.getElementById('results-section');
const resetBtn = document.getElementById('reset-btn');

// Elementos de Resultados
const tempDisplay = document.getElementById('current-temp');
const lightGreen = document.getElementById('light-green');
const lightYellow = document.getElementById('light-yellow');
const lightRed = document.getElementById('light-red');
const statusTitle = document.getElementById('status-title');
const statusDesc = document.getElementById('status-desc');
const criticalDateDisplay = document.getElementById('critical-date');
const currentValueDisplay = document.getElementById('current-value');

// ==========================================
// INICIALIZACIÓN
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
    // Evitar fechas futuras en la Fecha de Compra y fijar hoy por defecto
    const today = new Date().toISOString().split('T')[0];
    const dateInput = document.getElementById('purchase-date');
    dateInput.setAttribute('max', today);
    dateInput.value = today;
    
    // Iniciar fetch de temperatura en background
    fetchWeather();
});

// ==========================================
// API CLIMA (Histórico y Actual)
// ==========================================
async function fetchWeather(purchaseDateStr = null) {
    try {
        tempDisplay.textContent = "Cargando...";
        let url;
        const today = new Date().toISOString().split('T')[0];
        
        if (!purchaseDateStr || purchaseDateStr === today) {
            // Clima de hoy
            url = `https://api.open-meteo.com/v1/forecast?latitude=${LAT}&longitude=${LON}&current_weather=true`;
            const response = await fetch(url);
            if (!response.ok) throw new Error("Error en la respuesta de la API");
            const data = await response.json();
            currentTemp = data.current_weather.temperature;
        } else {
            // Clima histórico (hasta 31 días atrás)
            url = `https://api.open-meteo.com/v1/forecast?latitude=${LAT}&longitude=${LON}&daily=temperature_2m_max&past_days=31&timezone=America%2FLa_Paz`;
            const response = await fetch(url);
            if (!response.ok) throw new Error("Error en la respuesta de la API");
            const data = await response.json();
            
            const index = data.daily.time.indexOf(purchaseDateStr);
            if (index !== -1 && data.daily.temperature_2m_max[index] !== null) {
                currentTemp = data.daily.temperature_2m_max[index];
            } else {
                // Fallback si la fecha es muy antigua
                currentTemp = 28; 
            }
        }
        
        tempDisplay.textContent = `${Math.round(currentTemp)}°C`;
    } catch (error) {
        console.error("No se pudo obtener el clima:", error);
        currentTemp = 28; // Fallback promedio
        tempDisplay.textContent = `${currentTemp}°C (Est.)`;
    }
}

// ==========================================
// LÓGICA MATEMÁTICA
// ==========================================

/**
 * Calcula la constante k ajustada por el clima
 */
function getAdjustedK(productKey) {
    let k = PRODUCT_CONSTANTS[productKey];
    // Factor Clima Cruceño: > 30°C incrementa la merma en 20%
    if (currentTemp && currentTemp > 30) {
        k = k * 1.2;
    }
    return k;
}

/**
 * Calcula la diferencia en días entre dos fechas
 */
function getDaysElapsed(purchaseDateStr) {
    // Evitar desfase de zona horaria parseando la cadena manualmente
    const [year, month, day] = purchaseDateStr.split('-');
    const start = new Date(year, month - 1, day);
    const now = new Date();
    
    // Normalizar a medianoche para evitar decimales por horas
    start.setHours(0, 0, 0, 0);
    now.setHours(0, 0, 0, 0);
    
    const diffTime = now.getTime() - start.getTime();
    const days = Math.floor(diffTime / (1000 * 60 * 60 * 24));
    return days >= 0 ? days : 0;
}

// ==========================================
// MANEJADORES DE EVENTOS
// ==========================================

form.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    // Obtener valores del formulario
    const productKey = document.getElementById('product').value;
    const purchaseDate = document.getElementById('purchase-date').value;
    const v0 = parseFloat(document.getElementById('invested-amount').value);

    // UX: Mostrar loader brevemente
    btnLoader.classList.remove('hidden');
    calculateBtn.querySelector('span').style.opacity = '0';
    
    // Obtener clima específico de la fecha seleccionada
    await fetchWeather(purchaseDate);
    
    setTimeout(() => {
        procesarCalculo(productKey, purchaseDate, v0);
        
        btnLoader.classList.add('hidden');
        calculateBtn.querySelector('span').style.opacity = '1';
        
        // Transición de UI
        mainCard.classList.add('hidden');
        resultsSection.classList.remove('hidden');
    }, 400); // Pequeño delay para sensación de "procesamiento"
});

resetBtn.addEventListener('click', () => {
    resultsSection.classList.add('hidden');
    mainCard.classList.remove('hidden');
    form.reset();
});

// ==========================================
// PROCESAMIENTO Y RENDERIZADO
// ==========================================

function procesarCalculo(productKey, purchaseDateStr, v0) {
    // Limpiar timer viejo si existe
    if (timerInterval) clearInterval(timerInterval);

    // 1. Obtener k ajustado
    const k = getAdjustedK(productKey);
    
    // 2. Calcular t crítico (1.6094 / k para 80% pérdida)
    const tCritico = 1.6094 / k;
    
    // 3. Calcular fecha crítica
    const [year, month, day] = purchaseDateStr.split('-');
    const criticalDateObj = new Date(year, month - 1, day);
    // Sumar los días críticos (redondeados al alza para mayor seguridad)
    criticalDateObj.setDate(criticalDateObj.getDate() + Math.ceil(tCritico));
    
    // Título dinámico
    const titleEl = document.getElementById('critical-title');
    if (titleEl) {
        titleEl.textContent = `${PRODUCT_NAMES[productKey]} comienza a dañarse el:`;
    }

    // Formatear Fecha Crítica
    criticalDateDisplay.textContent = criticalDateObj.toLocaleDateString('es-ES', {
        day: '2-digit', month: 'short', year: 'numeric'
    });

    // Iniciar Cuenta Regresiva
    iniciarCountdown(criticalDateObj);

    // 4. Calcular días transcurridos
    const diasTranscurridos = getDaysElapsed(purchaseDateStr);
    
    // 5. Calcular V(t) = V0 * e^(-k*t)
    const vt = v0 * Math.exp(-k * diasTranscurridos);
    currentValueDisplay.textContent = `Bs. ${vt.toFixed(2)}`;

    // 6. Actualizar Semáforo basándonos en la fórmula (porcentaje de valor restante)
    actualizarSemaforo(vt, v0);
}

function actualizarSemaforo(vt, v0) {
    // Resetear luces
    lightGreen.classList.remove('active');
    lightYellow.classList.remove('active');
    lightRed.classList.remove('active');
    
    // Limpiar clases de colores del título
    statusTitle.className = '';

    // Ratio de valor restante según la fórmula V(t)
    const porcentajeRestante = vt / v0;

    if (porcentajeRestante > 0.70) {
        // VERDE (Mantiene más del 70% de su valor)
        lightGreen.classList.add('active');
        statusTitle.textContent = "Producto Fresco";
        statusTitle.classList.add('status-green');
        statusDesc.textContent = "Venta normal. El producto mantiene su calidad estándar.";
    } else if (porcentajeRestante > 0.20 && porcentajeRestante <= 0.70) {
        // AMARILLO (Mantiene entre 20% y 70% de su valor)
        lightYellow.classList.add('active');
        statusTitle.textContent = "Día de Descuento";
        statusTitle.classList.add('status-yellow');
        statusDesc.textContent = "Aplica ofertas (2x1 o rebajas) rápido para evitar desperdicio total.";
    } else {
        // ROJO (Cae por debajo del 20%, pérdida mayor al 80%)
        lightRed.classList.add('active');
        statusTitle.textContent = "Transferir a Eco-Punto";
        statusTitle.classList.add('status-red');
        statusDesc.textContent = "Merma crítica superada. Llevar a compostaje en el mercado.";
    }
}
