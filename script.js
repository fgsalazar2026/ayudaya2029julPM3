// VARIABLES GLOBALES
let usuarios = JSON.parse(localStorage.getItem('usuarios')) || [];
let solicitudes = JSON.parse(localStorage.getItem('solicitudes')) || [];
let usuarioActual = JSON.parse(localStorage.getItem('usuarioActual')) || null;
let usuariosAgregados = JSON.parse(localStorage.getItem('usuariosAgregados')) || [];
let coordenadas = {
    lat: null,
    lon: null
};

let mapaReporte = null;
let marcadorMapa = null;

let adminPaginaActual = 1;
const adminRegistrosPorPagina = 8;
let adminSolicitudesFiltradas = [];
let usuariosPaginaActual = 1;
const usuariosRegistrosPorPagina = 8;
let usuariosListaFiltrada = [];

let solicitudesEliminadas = JSON.parse(localStorage.getItem('solicitudesEliminadas')) || [];
let donaciones = JSON.parse(localStorage.getItem('donaciones')) || [];
let donacionesPaginaActual = 1;
const donacionesRegistrosPorPagina = 8;
let donacionesFiltradas = [];

const firebaseConfig = {
    apiKey: "AIzaSyCCzhQZEjDPdt2MobmkuBdSUUIOhnAZv_s",
    authDomain: "durable-pulsar-382314.firebaseapp.com",
    databaseURL: "https://durable-pulsar-382314-default-rtdb.firebaseio.com",
    projectId: "durable-pulsar-382314",
    storageBucket: "durable-pulsar-382314.firebasestorage.app",
    messagingSenderId: "703766756630",
    appId: "1:703766756630:web:1a792e2ddbd952f15de437",
    measurementId: "G-Z7PF3BNCZ0"
};
let db = null;
let firebaseAuth = null;
let firebaseEnabled = false;
let cuotaAvisada = false;
let cuotaAvisadaSesion = false;

function guardarSolicitudes() {
    try {
        localStorage.setItem('solicitudes', JSON.stringify(solicitudes));
    } catch (error) {
        if (error && error.name === 'QuotaExceededError') {
            console.warn('localStorage lleno, limpiando fotos de solicitudes...');
            solicitudes.forEach(s => { s.foto = null; });
            try {
                localStorage.setItem('solicitudes', JSON.stringify(solicitudes));
            } catch (e) {
                console.error('No se pudo guardar solicitudes incluso sin fotos:', e);
            }
        } else {
            console.error('Error al guardar solicitudes:', error);
        }
    }
}

function guardarSolicitudesEliminadas() {
    try {
        localStorage.setItem('solicitudesEliminadas', JSON.stringify(solicitudesEliminadas));
    } catch (error) {
        console.error('Error al guardar solicitudes eliminadas:', error);
    }
}

function actualizarFirebaseStatus(text, ok = false) {
    const statusEl = document.getElementById('firebase-status');
    if (!statusEl) return;
    statusEl.textContent = `Firebase: ${text}`;
    statusEl.style.color = ok ? '#dff6ee' : '#ffd9d9';
}

function loadScript(src) {
    return new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = src;
        s.async = false;
        s.onload = () => resolve();
        s.onerror = () => reject(new Error('Error loading ' + src));
        document.head.appendChild(s);
    });
}

async function cargarVersion() {
    try {
        const response = await fetch('version.json');
        if (response.ok) {
            const data = await response.json();
            const versionSpan = document.getElementById('app-version');
            if (versionSpan) {
                versionSpan.textContent = data.version;
            }
        }
    } catch (e) {
        console.warn('No se pudo cargar version.json');
    }
}

async function initFirebase() {
    try {
        // Esperar a que firebase esté disponible (cargado desde CDN en index.html)
        let intentos = 0;
        while (typeof firebase === 'undefined' && intentos < 50) {
            await new Promise(r => setTimeout(r, 100));
            intentos++;
        }

        // Reintentar carga dinámica si el <script> del <head> falló (red lenta/transitoria)
        if (typeof firebase === 'undefined') {
            try {
                await loadScript('https://www.gstatic.com/firebasejs/9.6.10/firebase-app-compat.js');
                await loadScript('https://www.gstatic.com/firebasejs/9.6.10/firebase-database-compat.js');
            } catch (e) {
                console.warn('No se pudo recargar Firebase dinámicamente:', e);
            }
            intentos = 0;
            while (typeof firebase === 'undefined' && intentos < 50) {
                await new Promise(r => setTimeout(r, 100));
                intentos++;
            }
        }
        
        if (typeof firebase === 'undefined') {
            console.warn('Firebase SDK no se cargó. Usando localStorage.');
            actualizarFirebaseStatus('SDK no disponible', false);
            return;
        }

        if (!firebaseConfig.apiKey || firebaseConfig.apiKey === 'TU_API_KEY') {
            console.warn('Firebase no configurado. Se usará localStorage.');
            actualizarFirebaseStatus('No configurado', false);
            return;
        }

        firebase.initializeApp(firebaseConfig);
        db = firebase.database();
        firebaseAuth = firebase.auth();
        firebaseEnabled = true;
        
        // Crear colecciones si no existen (esto se hace al primer envío)
        await cargarDatosFirebase();
        actualizarFirebaseStatus('Conectado ✓', true);
        console.log('Firebase inicializado correctamente');
    } catch (error) {
        console.error('Error inicializando Firebase:', error);
        actualizarFirebaseStatus('Error', false);
    }
}

async function probarConexionFirebase() {
    // Diagnóstico detallado antes de intentar conexión
    const details = [];
    details.push('typeof firebase: ' + (typeof firebase));
    details.push('firebaseConfig: ' + (typeof firebaseConfig !== 'undefined' ? 'present' : 'MISSING'));
    try {
        details.push('firebase.apps.length: ' + (firebase && firebase.apps ? firebase.apps.length : 'n/a'));
    } catch (e) {
        details.push('firebase.apps: error');
    }

    if (!firebaseEnabled || !db) {
        // Mostrar diagnóstico al usuario para ayudar a resolver
        console.log('Diagnóstico Firebase:', details.join(' | '));
        let msg = 'Firebase no está configurado en este entorno.\n\nDiagnóstico:\n' + details.join('\n');
        msg += '\n\nSugerencias:\n- Asegúrate de abrir la app via http://127.0.0.1:5500/ (Live Server) o tu host en línea (no file://).\n- Revisa la consola (F12) en busca de errores de carga de scripts.\n- Confirma que los scripts de Firebase están en el <head> y cargaron (Network).';
        alert(msg);
        actualizarFirebaseStatus('No configurado', false);
        return;
    }

    try {
        const ref = db.ref('meta/ping');
        await ref.set({ ts: Date.now() });
        const snap = await ref.once('value');
        const data = snap.val();
        if (data && data.ts) {
            alert('✅ Firebase OK — ping: ' + data.ts);
            actualizarFirebaseStatus('Conectado', true);
        } else {
            alert('❌ No se pudo leer el documento de prueba.');
            actualizarFirebaseStatus('Error lectura', false);
        }
    } catch (err) {
        console.error('Error al probar Firebase:', err);
        alert('❌ Error al probar Firebase: ' + (err && err.message ? err.message : err));
        actualizarFirebaseStatus('Error', false);
    }
}

async function cargarDatosFirebase() {
    // USUARIOS (escucha en tiempo real)
    db.ref('usuarios').on('value', snapshot => {
        usuarios = [];
        if (snapshot.exists()) {
            snapshot.forEach(child => {
                usuarios.push({ id: child.key, docId: child.key, ...child.val() });
                return false;
            });
        }
        localStorage.setItem('usuarios', JSON.stringify(usuarios));
        if (usuarioActual) {
            usuarioActual = usuarios.find(u => String(u.id) === String(usuarioActual.id)) || usuarioActual;
            if (usuarioActual && usuarioActual.rol === 'lider') {
                actualizarTablaUsuarios();
            }
        }
    }, error => console.error('Error cargando usuarios desde Firebase:', error));

    // SOLICITUDES (escucha en tiempo real)
    db.ref('solicitudes').on('value', snapshot => {
        solicitudes = [];
        if (snapshot.exists()) {
            snapshot.forEach(child => {
                solicitudes.push({ id: child.key, docId: child.key, ...child.val() });
                return false;
            });
        }
        guardarSolicitudes();
        if (usuarioActual) {
            actualizarTabla();
            if (usuarioActual.rol === 'lider') {
                actualizarEstadisticas();
                actualizarTablasAdmin();
            }
        }
    }, error => console.error('Error cargando solicitudes desde Firebase:', error));

    // DONACIONES (escucha en tiempo real)
    db.ref('donaciones').on('value', snapshot => {
        donaciones = [];
        if (snapshot.exists()) {
            snapshot.forEach(child => {
                donaciones.push({ id: child.key, docId: child.key, ...child.val() });
                return false;
            });
        }
        guardarDonaciones();
        if (usuarioActual) {
            actualizarTablaMisDonaciones();
            if (usuarioActual.rol === 'lider') {
                actualizarEstadisticasDonaciones();
                actualizarTablaDonaciones();
            }
        }
    }, error => console.error('Error cargando donaciones desde Firebase:', error));
}

// Sincroniza el usuario con Realtime Database SIN bloquear el registro
async function sincronizarUsuarioFirebase(nuevoUsuario) {
    try {
        const { docId, ...data } = nuevoUsuario;
        const ref = db.ref('usuarios').push();
        await ref.set(data);
        nuevoUsuario.docId = ref.key;
        nuevoUsuario.id = ref.key;
        const idx = usuarios.findIndex(u => u.usuario === nuevoUsuario.usuario);
        if (idx >= 0) usuarios[idx] = nuevoUsuario;
        else usuarios.push(nuevoUsuario);
        localStorage.setItem('usuarios', JSON.stringify(usuarios));
        console.log('✅ Usuario sincronizado con Firebase:', nuevoUsuario.usuario);
    } catch (error) {
        console.warn('⚠️ Error al sincronizar con Firebase, guardando localmente:', error);
        usuarios.push(nuevoUsuario);
        localStorage.setItem('usuarios', JSON.stringify(usuarios));
    }
}

async function firebaseAgregarSolicitud(nuevaSolicitud) {
    try {
        const { docId, ...data } = nuevaSolicitud;
        const ref = db.ref('solicitudes').push();
        await ref.set(data);
        nuevaSolicitud.docId = ref.key;
        nuevaSolicitud.id = ref.key;
    } catch (error) {
        console.error('Error guardando solicitud en Firebase:', error);
    }
}

async function firebaseAgregarDonacion(nuevaDonacion) {
    try {
        const { docId, ...data } = nuevaDonacion;
        const ref = db.ref('donaciones').push();
        await ref.set(data);
        nuevaDonacion.docId = ref.key;
        nuevaDonacion.id = ref.key;
    } catch (error) {
        console.error('Error guardando donación en Firebase:', error);
    }
}

// VERIFICAR SI HAY USUARIO LOGUEADO
document.addEventListener('DOMContentLoaded', async function() {
     await initFirebase();
     await cargarVersion();
     if (usuarioActual) {
         mostrarPaginaPrincipal();
     } else {
         mostrarPaginaLogin();
     }
    
    // LISTENERS DE AUTENTICACIÓN
    const formLogin = document.getElementById('form-login');
    const formRegistro = document.getElementById('form-registro');
    const btnLogout = document.getElementById('btn-logout');
    
if (formLogin) formLogin.addEventListener('submit', manejarLogin);
     if (formRegistro) formRegistro.addEventListener('submit', manejarRegistro);
     if (btnLogout) btnLogout.addEventListener('click', cerrarSesion);

     const btnGoogleLogin = document.getElementById('btn-google-login');
     const btnGoogleRegistro = document.getElementById('btn-google-registro');
     if (btnGoogleLogin) btnGoogleLogin.addEventListener('click', manejarGoogleLogin);
     if (btnGoogleRegistro) btnGoogleRegistro.addEventListener('click', manejarGoogleRegistro);

     // MENÚ HAMBURGUESA (MÓVIL)
const menuToggle = document.getElementById('menu-toggle');
const navMenu = document.getElementById('nav-menu');
const navOverlay = document.getElementById('nav-overlay');

function cerrarMenu() {
    if (navMenu) navMenu.classList.remove('active');
    if (menuToggle) menuToggle.classList.remove('active');
    if (navOverlay) navOverlay.classList.remove('active');
}

function abrirMenu() {
    if (navMenu) navMenu.classList.add('active');
    if (menuToggle) menuToggle.classList.add('active');
    if (navOverlay) navOverlay.classList.add('active');
}

if (menuToggle && navMenu) {
    menuToggle.addEventListener('click', () => {
        if (navMenu.classList.contains('active')) {
            cerrarMenu();
        } else {
            abrirMenu();
        }
    });
    navMenu.querySelectorAll('a, button').forEach(el => {
        el.addEventListener('click', () => {
            cerrarMenu();
        });
    });
}

if (navOverlay) {
    navOverlay.addEventListener('click', cerrarMenu);
}

document.addEventListener('click', (e) => {
    if (!navMenu || !menuToggle) return;
    if (navMenu.classList.contains('active') &&
        !navMenu.contains(e.target) &&
        !menuToggle.contains(e.target) &&
        !(navOverlay && navOverlay.contains(e.target))) {
        cerrarMenu();
    }
});
    const btnFirebaseTest = document.getElementById('btn-firebase-test');
    if (btnFirebaseTest) btnFirebaseTest.addEventListener('click', probarConexionFirebase);
    
    // LISTENERS DEL FORMULARIO DE REPORTE
    const formularioReporte = document.getElementById('formulario-reporte');
    if (formularioReporte) {
        formularioReporte.addEventListener('submit', manejarReporte);
    }
    
    // LISTENERS DE UBICACIÓN
    const btnUbicacion = document.getElementById('btn-ubicacion');
    if (btnUbicacion) {
        btnUbicacion.addEventListener('click', detectarUbicacion);
    }

    // ENTIDAD RESPONSABLE SEGÚN TIPO DE NECESIDAD
    const selectTipo = document.getElementById('tipo');
    const inputEntidad = document.getElementById('entidad-responsable');
    const selectSubcaso = document.getElementById('subcaso');
    const textareaDescripcion = document.getElementById('descripcion');
    const entidadesPorTipo = {
        'seguridad': 'Policía Nacional del Ecuador / Segura EP',
        'alumbrado': 'CNEL EP',
        'infraestructura': 'Municipio de Guayaquil',
        'agua': 'Interagua',
        'incendios': 'Cuerpo de Bomberos de Guayaquil / Secretaría Nacional de Gestión de Riesgos',
        'basura': 'Dirección de Aseo Cantonal y Servicios Especiales',
        'iluminarias': 'CNEL EP',
        'asfaltado': 'Dirección de Obras Públicas del Municipio de Guayaquil',
        'otro': 'GAD Municipal'
    };
    const subcasosPorTipo = {
        'seguridad': [
            { value: 'robo-personas', label: 'Robo a personas', description: 'Asaltos o robos en la vía pública.' },
            { value: 'robo-viviendas', label: 'Robo a viviendas', description: 'Ingreso ilegal o intento de robo en domicilios.' },
            { value: 'robo-vehiculos', label: 'Robo de vehículos', description: 'Robo o intento de robo de autos o motocicletas.' },
            { value: 'sospechosos', label: 'Personas sospechosas', description: 'Individuos con comportamiento inusual o sospechoso.' },
            { value: 'drogas', label: 'Venta o consumo de drogas', description: 'Reporte de microtráfico o consumo en espacios públicos.' },
            { value: 'pandillas', label: 'Pandillas', description: 'Presencia de grupos que generan inseguridad.' },
            { value: 'violencia-familiar', label: 'Violencia intrafamiliar', description: 'Casos de violencia dentro del hogar.' },
            { value: 'agresiones-fisicas', label: 'Agresiones físicas', description: 'Peleas o ataques entre personas.' },
            { value: 'acoso-callejero', label: 'Acoso callejero', description: 'Hostigamiento o intimidación en espacios públicos.' },
            { value: 'violencia-genero', label: 'Violencia de género', description: 'Agresiones o amenazas por razones de género.' },
            { value: 'vandalismo', label: 'Vandalismo', description: 'Daños a bienes públicos o privados.' },
            { value: 'riñas', label: 'Riñas en espacios públicos', description: 'Peleas en parques, calles o plazas.' },
            { value: 'disparos', label: 'Disparos o uso de armas', description: 'Reporte de detonaciones o personas armadas.' },
            { value: 'ruido', label: 'Ruido excesivo', description: 'Fiestas, locales o actividades con alto volumen.' },
            { value: 'alumbrado-apagado', label: 'Alumbrado apagado', description: 'Calles oscuras que representan riesgo para la seguridad.' },
            { value: 'camaras-dañadas', label: 'Cámaras dañadas', description: 'Cámaras de vigilancia averiadas o fuera de servicio.' },
            { value: 'emergencia-policial', label: 'Emergencia policial', description: 'Situación que requiere intervención inmediata de la policía.' },
            { value: 'personas-desaparecidas', label: 'Personas desaparecidas', description: 'Reporte de desaparición o búsqueda de personas.' },
            { value: 'amenazas', label: 'Amenazas o extorsión', description: 'Casos de intimidación o cobro ilegal.' },
            { value: 'otro-seguridad', label: 'Otro incidente de seguridad', description: 'Cualquier problema no contemplado en las categorías anteriores.' }
        ],
        'alumbrado': [
            { value: 'luminaria-apagada', label: 'Luminaria apagada', description: 'La lámpara no enciende durante la noche.' },
            { value: 'luminaria-intermitente', label: 'Luminaria intermitente', description: 'La luz enciende y apaga constantemente.' },
            { value: 'poste-caído', label: 'Poste caído', description: 'El poste de alumbrado se encuentra en el suelo.' },
            { value: 'poste-inclinado', label: 'Poste inclinado', description: 'El poste presenta riesgo de caída.' },
            { value: 'luminaria-rotada', label: 'Luminaria rota', description: 'La lámpara o el reflector están dañados.' },
            { value: 'cableado-expuesto', label: 'Cableado expuesto', description: 'Existen cables eléctricos visibles o sueltos.' },
            { value: 'cortocircuito', label: 'Cortocircuito', description: 'Se observan chispas, humo o fallas eléctricas.' },
            { value: 'brazo-dañado', label: 'Brazo de luminaria dañado', description: 'El soporte de la lámpara está roto o doblado.' },
            { value: 'falta-luminaria', label: 'Falta de luminaria', description: 'El poste existe, pero no tiene lámpara.' },
            { value: 'zona-sin-iluminacion', label: 'Zona sin iluminación', description: 'Un sector completo carece de alumbrado público.' },
            { value: 'luminaria-día', label: 'Luminaria encendida de día', description: 'La luz permanece encendida durante el día.' },
            { value: 'baja-intensidad', label: 'Luz con baja intensidad', description: 'La iluminación es insuficiente para la zona.' },
            { value: 'reflector-dañado', label: 'Reflector dañado', description: 'Reflectores de parques o canchas fuera de servicio.' },
            { value: 'caja-electricidad', label: 'Caja eléctrica abierta', description: 'La caja de conexiones está abierta o dañada.' },
            { value: 'poste-chocado', label: 'Poste chocado', description: 'El poste fue impactado por un vehículo.' },
            { value: 'poste-riesgo-electrico', label: 'Poste con riesgo eléctrico', description: 'Se perciben descargas, chispas o cables energizados.' },
            { value: 'luminaria-obstruida', label: 'Luminaria obstruida', description: 'Árboles o estructuras bloquean la iluminación.' },
            { value: 'daño-vandalismo', label: 'Daño por vandalismo', description: 'La luminaria o el poste fueron destruidos intencionalmente.' },
            { value: 'mantenimiento-preventivo', label: 'Mantenimiento preventivo', description: 'Solicitud de revisión antes de una falla.' },
            { value: 'otro-alumbrado', label: 'Otro problema de alumbrado', description: 'Cualquier incidente no contemplado en las categorías anteriores.' }
        ],
        'infraestructura': [
            { value: 'baches', label: 'Baches en la vía', description: 'Huecos o deterioro en calles y avenidas.' },
            { value: 'hundimiento', label: 'Hundimiento de calzada', description: 'Hundimientos o deformaciones del pavimento.' },
            { value: 'acera-dañada', label: 'Acera dañada', description: 'Veredas rotas o con desniveles.' },
            { value: 'bordillos', label: 'Bordillos deteriorados', description: 'Bordillos rotos o desplazados.' },
            { value: 'puente', label: 'Puente en mal estado', description: 'Daños estructurales en puentes peatonales o vehiculares.' },
            { value: 'escalinatas', label: 'Escalinatas deterioradas', description: 'Escaleras públicas con daños o riesgo.' },
            { value: 'barandas', label: 'Barandas dañadas', description: 'Barandas de protección rotas o faltantes.' },
            { value: 'señalizacion', label: 'Señalización vial dañada', description: 'Señales caídas, ilegibles o destruidas.' },
            { value: 'semáforo', label: 'Semáforo averiado', description: 'Semáforos apagados, intermitentes o fuera de servicio.' },
            { value: 'paradero', label: 'Paradero de bus deteriorado', description: 'Marquesinas o paradas de transporte dañadas.' },
            { value: 'parque-infantil', label: 'Parque infantil dañado', description: 'Juegos infantiles rotos o inseguros.' },
            { value: 'mobiliario-urbano', label: 'Mobiliario urbano dañado', description: 'Bancas, basureros o bolardos deteriorados.' },
            { value: 'cancha-deportiva', label: 'Cancha deportiva deteriorada', description: 'Daños en pisos, graderíos o cerramientos.' },
            { value: 'plaza-parque', label: 'Plaza o parque en mal estado', description: 'Áreas públicas con infraestructura deteriorada.' },
            { value: 'rejillas', label: 'Rejillas o tapas de alcantarilla dañadas', description: 'Tapas rotas, hundidas o inexistentes.' },
            { value: 'muros', label: 'Muros o cerramientos dañados', description: 'Muros públicos con grietas o colapsos.' },
            { value: 'deslizamiento', label: 'Deslizamiento de tierra', description: 'Afectación de infraestructura por derrumbes.' },
            { value: 'obra-inconclusa', label: 'Obra pública inconclusa', description: 'Construcciones abandonadas o sin finalizar.' },
            { value: 'riesgo-colapso', label: 'Riesgo de colapso estructural', description: 'Infraestructura con peligro evidente de colapso.' },
            { value: 'otro-infraestructura', label: 'Otro problema de infraestructura', description: 'Cualquier incidente no contemplado en las categorías anteriores.' }
        ],
        'agua': [
            { value: 'fuga-agua', label: 'Fuga de agua', description: 'Derrames o pérdida de agua en la red pública.' },
            { value: 'baja-presion', label: 'Baja presión de agua', description: 'Suministro con presión insuficiente o intermitente.' },
            { value: 'corte-agua', label: 'Corte de agua', description: 'Interrupción del servicio de agua potable.' },
            { value: 'agua-contaminada', label: 'Agua contaminada o turbia', description: 'Agua con color, olor o sabor anormal.' },
            { value: 'medidor-dañado', label: 'Medidor dañado', description: 'Medidor de agua roto o registrando incorrectamente.' },
            { value: 'fuga-medidor', label: 'Fuga en medidor de agua', description: 'El medidor presenta fugas o lecturas erráticas.' },
            { value: 'tuberia-rompida', label: 'Tubería rota o rota', description: 'Fuga o ruptura en la red de tuberías principales.' },
            { value: 'tuberia-obstruida', label: 'Tubería obstruida', description: 'Taponamiento en la red de agua potable.' },
            { value: 'agua-escasa', label: 'Falta de agua en la zona', description: 'Sector sin suministro de agua potable.' },
            { value: 'agua-horario', label: 'Horario de agua insuficiente', description: 'El suministro no cubre las horas necesarias.' },
            { value: 'agua-caliente', label: 'Agua caliente sin calentador', description: 'Falta de sistema de calentamiento de agua.' },
            { value: 'exceso-presion', label: 'Exceso de presión de agua', description: 'La presión del agua es demasiado alta y daña instalaciones.' },
            { value: 'agua-plomeria', label: 'Problemas de plomería', description: 'Fugas o daños en instalaciones internas de plomería.' },
            { value: 'agua-riego', label: 'Problema con sistema de riego', description: 'Fallas en el sistema de riego público o comunitario.' },
            { value: 'agua-residuos', label: 'Agua con residuos o sedimentos', description: 'El agua sale con partículas o material extraño.' },
            { value: 'solicitud-nueva-toma', label: 'Solicitud de nueva toma de agua', description: 'Se requiere instalar un nuevo punto de suministro.' },
            { value: 'reparacion-tuberia', label: 'Reparación de tubería necesaria', description: 'Se necesita mantenimiento urgente en la red de agua.' },
            { value: 'agua-zona-rural', label: 'Agua en zona rural sin cobertura', description: 'Comunidades rurales sin acceso a agua potable.' },
            { value: 'contaminacion-origen', label: 'Contaminación en el origen del agua', description: 'Fuente de agua contaminada que afecta el suministro.' },
            { value: 'otro-agua', label: 'Otro problema de agua', description: 'Cualquier inconveniente no contemplado en las categorías anteriores.' }
        ],
        'incendios': [
            { value: 'incendio-activo', label: 'Incendio forestal activo', description: 'Fuego propagándose en vegetación o bosque.' },
            { value: 'quema-maleza', label: 'Quema de maleza', description: 'Incendio en pastizales o maleza seca.' },
            { value: 'quema-agricola', label: 'Quema agrícola no controlada', description: 'Quema de cultivos que se salió de control.' },
            { value: 'humo-zonal', label: 'Humo en zona forestal', description: 'Presencia de humo que puede indicar un incendio.' },
            { value: 'reignicion', label: 'Reignición de incendio', description: 'Un incendio previamente controlado vuelve a activarse.' },
            { value: 'propagacion-viviendas', label: 'Propagación hacia viviendas', description: 'El fuego amenaza zonas habitadas.' },
            { value: 'propagacion-cultivos', label: 'Propagación hacia cultivos', description: 'El incendio pone en riesgo áreas agrícolas.' },
            { value: 'arbol-incendiado', label: 'Árbol incendiado', description: 'Uno o varios árboles se encuentran en llamas.' },
            { value: 'incendio-parque', label: 'Incendio en parque o área verde', description: 'Fuego en parques, reservas o jardines públicos.' },
            { value: 'incendio-electrico', label: 'Incendio por causas eléctricas', description: 'Fuego originado por postes o líneas eléctricas.' },
            { value: 'incendio-provocado', label: 'Incendio provocado', description: 'Sospecha de incendio intencional.' },
            { value: 'material-inflamable', label: 'Material inflamable en llamas', description: 'Quema de llantas, basura o sustancias inflamables.' },
            { value: 'riesgo-propagacion', label: 'Riesgo de propagación', description: 'Condiciones que favorecen la expansión del fuego.' },
            { value: 'personas-en-riesgo', label: 'Personas atrapadas o en riesgo', description: 'Ciudadanos que requieren evacuación o rescate.' },
            { value: 'animales-afectados', label: 'Animales afectados', description: 'Fauna doméstica o silvestre en peligro por el incendio.' },
            { value: 'acceso-bloqueado', label: 'Acceso bloqueado', description: 'Caminos o vías cerradas por el incendio.' },
            { value: 'apoyo-bomberos', label: 'Solicitud de apoyo de bomberos', description: 'Requerimiento de atención urgente del cuerpo de bomberos.' },
            { value: 'zona-afectada', label: 'Zona afectada después del incendio', description: 'Evaluación de daños tras la extinción del fuego.' },
            { value: 'riesgo-reactivacion', label: 'Riesgo de reactivación', description: 'Existen brasas o focos de calor que pueden reavivar el incendio.' },
            { value: 'otro-incendio', label: 'Otro incidente relacionado', description: 'Cualquier situación no contemplada en las categorías anteriores.' }
        ],
        'basura': [
            { value: 'recoleccion-falta', label: 'Falta de recolección de basura', description: 'Servicio de aseo que no recolecta los desechos regularmente.' },
            { value: 'basura-acumulada', label: 'Basura acumulada en calles', description: 'Desechos abandonados en espacios públicos.' },
            { value: 'vertedero-clandestino', label: 'Vertedero clandestino', description: 'Depósitos ilegales de basura en terrenos baldíos o calles.' },
            { value: 'plagas-basura', label: 'Plagas por basura', description: 'Presencia de roedores, insectos o animales por acumulación de desechos.' },
            { value: 'deseos-peligrosos', label: 'Desechos peligrosos o industriales', description: 'Residuos químicos, médicos o industriales en espacios públicos.' },
            { value: 'basura-hundida', label: 'Basura en alcantarillas o sumideros', description: 'Desechos obstruyendo el sistema de drenaje.' },
            { value: 'basura-playa', label: 'Basura en playas o ríos', description: 'Contaminación de cuerpos de agua con desechos.' },
            { value: 'basura-por-agua', label: 'Basura arrastrada por el agua', description: 'Desechos acumulados por crecidas o lluvias.' },
            { value: 'contenedores-llenos', label: 'Contenedores desbordados', description: 'Basureros públicos llenos sin recolección.' },
            { value: 'sin-contenedores', label: 'Falta de contenedores de basura', description: 'Ausencia de botes de recolección en la zona.' },
            { value: 'basura-organica', label: 'Basura orgánica en mal estado', description: 'Restos de comida o materia orgánica en descomposición.' },
            { value: 'basura-electronica', label: 'Basura electrónica', description: 'Aparatos electrónicos o electrodomésticos abandonados.' },
            { value: 'basura-peligrosa', label: 'Basura que genera riesgo sanitario', description: 'Desechos que representan un riesgo para la salud pública.' },
            { value: 'limpieza-necesaria', label: 'Solicitud de limpieza de zona', description: 'Requerimiento de limpieza o desinfección de un área.' },
            { value: 'basura-construccion', label: 'Escombros o basura de construcción', description: 'Residuos de obra o demolición en la vía pública.' },
            { value: 'basura-privada', label: 'Basura de propiedad privada en la vía', description: 'Desechos de hogares o negocios en la acera o calle.' },
            { value: 'fugas-liquidas', label: 'Fugas de líquidos en la vía', description: 'Derrames de líquidos que contaminan el espacio público.' },
            { value: 'basura-nocturna', label: 'Basura recolectada en horario nocturno', description: 'Problemas con la recolección nocturna de desechos.' },
            { value: 'basura-temporal', label: 'Basura temporal en eventos', description: 'Acumulación de desechos tras eventos públicos.' },
            { value: 'otro-basura', label: 'Otro problema de basura', description: 'Cualquier situación no contemplada en las categorías anteriores.' }
        ],
        'iluminarias': [
            { value: 'luminaria-apagada', label: 'Luminaria apagada', description: 'La lámpara no enciende durante la noche.' },
            { value: 'luminaria-día', label: 'Luminaria encendida de día', description: 'La luz permanece encendida durante el día.' },
            { value: 'luminaria-intermitente', label: 'Luz intermitente', description: 'La luminaria enciende y apaga constantemente.' },
            { value: 'baja-intensidad', label: 'Baja intensidad de luz', description: 'La iluminación es insuficiente.' },
            { value: 'luminaria-rotada', label: 'Luminaria rota', description: 'La lámpara o carcasa está dañada.' },
            { value: 'luminaria-suelelta', label: 'Luminaria desprendida', description: 'La luminaria está suelta o a punto de caer.' },
            { value: 'luminaria-vandalizada', label: 'Luminaria vandalizada', description: 'Ha sido destruida o dañada intencionalmente.' },
            { value: 'foco-quemado', label: 'Foco quemado', description: 'El foco necesita ser reemplazado.' },
            { value: 'cable-expuesto', label: 'Cableado expuesto', description: 'Hay cables visibles que representan un riesgo.' },
            { value: 'cortocircuito', label: 'Cortocircuito', description: 'Se observan chispas, humo o fallas eléctricas.' },
            { value: 'reflector-dañado', label: 'Reflector dañado', description: 'Reflectores de parques o canchas fuera de servicio.' },
            { value: 'brazo-dañado', label: 'Brazo de soporte dañado', description: 'El brazo que sostiene la luminaria está doblado o roto.' },
            { value: 'luminaria-obstruida', label: 'Luminaria obstruida', description: 'Árboles o estructuras bloquean la iluminación.' },
            { value: 'instalacion-incompleta', label: 'Instalación incompleta', description: 'Existe el poste, pero falta instalar la luminaria.' },
            { value: 'exceso-iluminacion', label: 'Exceso de iluminación', description: 'La intensidad afecta a viviendas o conductores.' },
            { value: 'luminaria-parpadeante', label: 'Luz parpadeante', description: 'La luminaria parpadea de forma constante.' },
            { value: 'riesgo-electrico', label: 'Riesgo eléctrico', description: 'La luminaria presenta peligro por fallas eléctricas.' },
            { value: 'solicitud-nueva', label: 'Solicitud de nueva luminaria', description: 'Se requiere instalar iluminación en un sector sin cobertura.' },
            { value: 'mantenimiento-preventivo', label: 'Mantenimiento preventivo', description: 'Solicitud de revisión antes de que ocurra una falla.' },
            { value: 'otro-iluminarias', label: 'Otro problema de iluminación', description: 'Cualquier incidente no contemplado en las categorías anteriores.' }
        ],
        'asfaltado': [
            { value: 'bache-pequeño', label: 'Bache pequeño', description: 'Hueco de tamaño reducido en la calzada.' },
            { value: 'bache-mediano', label: 'Bache mediano', description: 'Hueco de tamaño medio que afecta la circulación.' },
            { value: 'bache-grande', label: 'Bache grande', description: 'Hueco de gran tamaño con alto riesgo de accidentes.' },
            { value: 'multiples-baches', label: 'Múltiples baches', description: 'Varios baches concentrados en un mismo tramo.' },
            { value: 'hundimiento-via', label: 'Hundimiento de la vía', description: 'Deformación o hundimiento del pavimento.' },
            { value: 'grietas', label: 'Grietas en el asfalto', description: 'Fisuras que requieren reparación.' },
            { value: 'asfalto-levantado', label: 'Pavimento levantado', description: 'El asfalto se encuentra desprendido o elevado.' },
            { value: 'desgaste-asfalto', label: 'Desgaste del asfalto', description: 'Deterioro general de la superficie de rodadura.' },
            { value: 'hueco-fuga-agua', label: 'Hueco por fuga de agua', description: 'Daño en la vía causado por una fuga de agua.' },
            { value: 'asfalto-desprendido', label: 'Asfalto desprendido', description: 'Fragmentos de pavimento sueltos en la calzada.' },
            { value: 'calle-sin-pavimentar', label: 'Calle sin pavimentar', description: 'Vía que requiere asfaltado.' },
            { value: 'reparacion-inconclusa', label: 'Reparación inconclusa', description: 'Obra de asfaltado sin finalizar.' },
            { value: 'señalizacion-ausente', label: 'Señalización de obra ausente', description: 'Reparaciones sin señalización preventiva.' },
            { value: 'desnivel-peligroso', label: 'Desnivel peligroso', description: 'Diferencia de altura entre tramos de la vía.' },
            { value: 'daño-lluvias', label: 'Daño después de lluvias', description: 'Pavimento deteriorado por precipitaciones.' },
            { value: 'tapa-hundida', label: 'Tapa de alcantarilla hundida', description: 'Desnivel ocasionado por una tapa de alcantarilla.' },
            { value: 'encharcamiento', label: 'Asfalto con acumulación de agua', description: 'Encharcamientos debido al mal estado de la vía.' },
            { value: 'riesgo-motociclistas', label: 'Riesgo para motociclistas o ciclistas', description: 'Daños que representan peligro especial para vehículos de dos ruedas.' },
            { value: 'solicitud-mantenimiento', label: 'Solicitud de mantenimiento vial', description: 'Petición de reparación preventiva del pavimento.' },
            { value: 'otro-asfaltado', label: 'Otro problema de asfaltado', description: 'Cualquier daño no contemplado en las categorías anteriores.' }
        ],
        'otro': [
            { value: 'otro-general', label: 'Otro problema general', description: 'Cualquier necesidad o problema no contemplado en las categorías anteriores.' }
        ]
    };
    if (selectTipo && inputEntidad) {
        selectTipo.addEventListener('change', () => {
            const tipo = selectTipo.value;
            inputEntidad.value = entidadesPorTipo[tipo] || '';
            if (selectSubcaso) {
                selectSubcaso.innerHTML = '<option value="">-- Selecciona --</option>';
                if (subcasosPorTipo[tipo]) {
                    subcasosPorTipo[tipo].forEach(sub => {
                        const option = document.createElement('option');
                        option.value = sub.value;
                        option.textContent = sub.label;
                        selectSubcaso.appendChild(option);
                    });
                }
            }
        });
    }
    if (selectSubcaso && textareaDescripcion) {
        selectSubcaso.addEventListener('change', () => {
            const tipo = selectTipo ? selectTipo.value : '';
            const subcasoVal = selectSubcaso.value;
            if (tipo && subcasosPorTipo[tipo]) {
                const sub = subcasosPorTipo[tipo].find(s => s.value === subcasoVal);
                if (sub) {
                    const tipoTexto = selectTipo.options[selectTipo.selectedIndex].text;
                    const nombreReporta = usuarioActual ? usuarioActual.nombre : 'Anónimo';
                    textareaDescripcion.value = sub.description + ' — Necesidad: ' + tipoTexto + ' — Reportado por: ' + nombreReporta;
                } else {
                    textareaDescripcion.value = '';
                }
            }
        });
    }

    // LISTENERS DE LA VENTANA MODAL DE REPORTE
    const modalReporte = document.getElementById('modal-reporte');
    const btnAbrirReporte = document.getElementById('btn-abrir-reporte');
    const btnVolverReporte = document.getElementById('btn-volver-reporte');
    if (btnAbrirReporte && modalReporte) {
        btnAbrirReporte.addEventListener('click', () => abrirModalReporte());
    }
    if (btnVolverReporte && modalReporte) {
        btnVolverReporte.addEventListener('click', () => cerrarModalReporte());
    }
    if (modalReporte) {
        // Cerrar al hacer clic fuera de la ventana
        modalReporte.addEventListener('click', (e) => {
            if (e.target === modalReporte) cerrarModalReporte();
        });
        // Cerrar con la tecla Escape
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && modalReporte.style.display === 'flex') cerrarModalReporte();
        });
    }

    // LISTENERS DE LA VENTANA MODAL DE MIS SOLICITUDES
    const modalSolicitudes = document.getElementById('modal-solicitudes');
    const btnAbrirSolicitudes = document.getElementById('btn-abrir-solicitudes');
    const btnVolverSolicitudes = document.getElementById('btn-volver-solicitudes');
    if (btnAbrirSolicitudes && modalSolicitudes) {
        btnAbrirSolicitudes.addEventListener('click', () => abrirModalSolicitudes());
    }
    if (btnVolverSolicitudes && modalSolicitudes) {
        btnVolverSolicitudes.addEventListener('click', () => cerrarModalSolicitudes());
    }
    if (modalSolicitudes) {
        modalSolicitudes.addEventListener('click', (e) => {
            if (e.target === modalSolicitudes) cerrarModalSolicitudes();
        });
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && modalSolicitudes.style.display === 'flex') cerrarModalSolicitudes();
        });
    }

    // LISTENERS DE LA VENTANA MODAL DEL PANEL ADMIN
    const modalAdmin = document.getElementById('modal-admin');
    const btnAbrirAdmin = document.getElementById('btn-abrir-admin');
    const btnVolverAdmin = document.getElementById('btn-volver-admin');
    const btnExportarExcel = document.getElementById('btn-exportar-excel');
    const btnExportarUsuariosExcel = document.getElementById('btn-exportar-usuarios-excel');
    const btnProbarCorreo = document.getElementById('btn-probar-correo');
    if (btnAbrirAdmin && modalAdmin) {
        btnAbrirAdmin.addEventListener('click', () => abrirModalAdmin());
    }
    if (btnVolverAdmin && modalAdmin) {
        btnVolverAdmin.addEventListener('click', () => cerrarModalAdmin());
    }
    if (btnExportarExcel) {
        btnExportarExcel.addEventListener('click', exportarSolicitudesAExcel);
    }
    if (btnExportarUsuariosExcel) {
        btnExportarUsuariosExcel.addEventListener('click', exportarUsuariosAExcel);
    }
    const btnExportarEliminadosExcel = document.getElementById('btn-exportar-eliminados-excel');
    if (btnExportarEliminadosExcel) {
        btnExportarEliminadosExcel.addEventListener('click', exportarEliminadosAExcel);
    }
    if (modalAdmin) {
        modalAdmin.addEventListener('click', (e) => {
            if (e.target === modalAdmin) cerrarModalAdmin();
        });
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && modalAdmin.style.display === 'flex') cerrarModalAdmin();
        });
    }
    initAdminTabs();

    // PREVIEW DE FOTO EN EDITAR PERFIL
    const inputFotoPerfil = document.getElementById('perfil-foto');
    const previewPerfilFoto = document.getElementById('preview-perfil-foto');
    if (inputFotoPerfil && previewPerfilFoto) {
        inputFotoPerfil.addEventListener('change', () => {
            const file = inputFotoPerfil.files[0];
            if (file) {
                const reader = new FileReader();
                reader.onload = (e) => {
                    previewPerfilFoto.src = e.target.result;
                    previewPerfilFoto.style.display = 'block';
                };
                reader.readAsDataURL(file);
            } else {
                previewPerfilFoto.src = usuarioActual && usuarioActual.foto ? usuarioActual.foto : '';
                previewPerfilFoto.style.display = usuarioActual && usuarioActual.foto ? 'block' : 'none';
            }
        });
    }

    // BOTONES DEL MENÚ Y HERO QUE ABREN LOS MODALES DIRECTAMENTE
    const navReportar = document.getElementById('nav-reportar');
    const navSolicitudes = document.getElementById('nav-solicitudes');
    const navAdmin = document.getElementById('nav-admin');
    const heroReportar = document.getElementById('hero-reportar');
    if (navReportar) navReportar.addEventListener('click', () => { abrirModalReporte(); cerrarDropdown(); });
    if (navSolicitudes) navSolicitudes.addEventListener('click', () => { abrirModalSolicitudes(); });
    if (navAdmin) navAdmin.addEventListener('click', () => { abrirModalAdmin(); });
    if (heroReportar) heroReportar.addEventListener('click', () => abrirModalReporte());

    // VENTANA MODAL: ACERCA DE
    const btnAbrirAcerca = document.getElementById('btn-abrir-acerca');
    const btnVolverAcerca = document.getElementById('btn-volver-acerca');
    const navAcerca = document.getElementById('nav-acerca');
    const modalAcerca = document.getElementById('modal-acerca');
    if (btnAbrirAcerca && modalAcerca) {
        btnAbrirAcerca.addEventListener('click', () => abrirModalAcerca());
    }
    if (navAcerca && modalAcerca) {
        navAcerca.addEventListener('click', () => abrirModalAcerca());
    }
    if (btnVolverAcerca && modalAcerca) {
        btnVolverAcerca.addEventListener('click', () => cerrarModalAcerca());
    }
    if (modalAcerca) {
        modalAcerca.addEventListener('click', (e) => {
            if (e.target === modalAcerca) cerrarModalAcerca();
        });
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && modalAcerca.style.display === 'flex') cerrarModalAcerca();
        });
    }

    // VENTANA MODAL: USUARIOS REGISTRADOS
    const navUsuarios = document.getElementById('nav-usuarios');
    const btnVolverUsuarios = document.getElementById('btn-volver-usuarios');
    const modalUsuarios = document.getElementById('modal-usuarios');
    const formAgregarUsuario = document.getElementById('form-agregar-usuario');
    if (navUsuarios && modalUsuarios) {
        navUsuarios.addEventListener('click', () => abrirModalUsuarios());
    }
    if (btnVolverUsuarios && modalUsuarios) {
        btnVolverUsuarios.addEventListener('click', () => cerrarModalUsuarios());
    }
    if (formAgregarUsuario) {
        formAgregarUsuario.addEventListener('submit', manejarAgregarUsuario);
    }
    if (modalUsuarios) {
        modalUsuarios.addEventListener('click', (e) => {
            if (e.target === modalUsuarios) cerrarModalUsuarios();
        });
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && modalUsuarios.style.display === 'flex') cerrarModalUsuarios();
        });
    }

    // VENTANA MODAL: EDITAR PERFIL
    const btnEditarPerfil = document.getElementById('btn-editar-perfil');
    const btnVolverPerfil = document.getElementById('btn-volver-perfil');
    const modalPerfil = document.getElementById('modal-perfil');
    const formPerfil = document.getElementById('form-perfil');
    if (btnEditarPerfil && modalPerfil) {
        btnEditarPerfil.addEventListener('click', () => abrirModalPerfil());
    }
    if (btnVolverPerfil && modalPerfil) {
        btnVolverPerfil.addEventListener('click', () => cerrarModalPerfil());
    }
    if (formPerfil) {
        formPerfil.addEventListener('submit', manejarActualizarPerfil);
    }
    if (modalPerfil) {
        modalPerfil.addEventListener('click', (e) => {
            if (e.target === modalPerfil) cerrarModalPerfil();
        });
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && modalPerfil.style.display === 'flex') cerrarModalPerfil();
        });
    }

    // VENTANAS MODALES: OLVIDÉ MI USUARIO / CONTRASEÑA
    const linkOlvideUsuario = document.getElementById('link-olvide-usuario');
    const linkOlvidePassword = document.getElementById('link-olvide-password');
    const btnVolverOlvideUsuario = document.getElementById('btn-volver-olvide-usuario');
    const btnVolverOlvidePassword = document.getElementById('btn-volver-olvide-password');
    const modalOlvideUsuario = document.getElementById('modal-olvide-usuario');
    const modalOlvidePassword = document.getElementById('modal-olvide-password');
    const formOlvideUsuario = document.getElementById('form-olvide-usuario');
    const formOlvidePassword = document.getElementById('form-olvide-password');
    const formNuevaPassword = document.getElementById('form-nueva-password');

    if (linkOlvideUsuario && modalOlvideUsuario) {
        linkOlvideUsuario.addEventListener('click', (e) => {
            e.preventDefault();
            abrirModalOlvideUsuario();
            alert('Abriendo modal olvide usuario. display=' + modalOlvideUsuario.style.display);
        });
    }
    if (btnVolverOlvideUsuario && modalOlvideUsuario) {
        btnVolverOlvideUsuario.addEventListener('click', () => cerrarModalOlvideUsuario());
    }
    if (formOlvideUsuario) {
        formOlvideUsuario.addEventListener('submit', manejarOlvideUsuario);
    }
    const btnCopiarUsuario = document.getElementById('btn-copiar-usuario');
    if (btnCopiarUsuario) {
        btnCopiarUsuario.addEventListener('click', () => {
            const textoUsuario = document.getElementById('texto-usuario-encontrado');
            if (!textoUsuario) return;
            const texto = (textoUsuario.textContent || '').trim();
            if (!texto || texto === 'No se encontró ninguna cuenta con ese correo') {
                alert('Primero buscá tu usuario por correo.');
                return;
            }
            const copiar = () => {
                btnCopiarUsuario.textContent = '✅ Copiado';
                setTimeout(() => { btnCopiarUsuario.textContent = '📋 Copiar'; }, 1500);
            };
            if (navigator.clipboard && navigator.clipboard.writeText) {
                navigator.clipboard.writeText(texto).then(copiar).catch(() => {
                    alert('No se pudo copiar automáticamente. Tu usuario es: ' + texto);
                });
            } else {
                alert('Tu usuario es: ' + texto);
            }
        });
    }
    if (modalOlvideUsuario) {
        modalOlvideUsuario.addEventListener('click', (e) => {
            if (e.target === modalOlvideUsuario) cerrarModalOlvideUsuario();
        });
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && modalOlvideUsuario.style.display === 'flex') cerrarModalOlvideUsuario();
        });
    }

    if (linkOlvidePassword && modalOlvidePassword) {
        linkOlvidePassword.addEventListener('click', (e) => {
            e.preventDefault();
            abrirModalOlvidePassword();
        });
    }
    if (btnVolverOlvidePassword && modalOlvidePassword) {
        btnVolverOlvidePassword.addEventListener('click', () => cerrarModalOlvidePassword());
    }
    if (formOlvidePassword) {
        formOlvidePassword.addEventListener('submit', manejarOlvidePasswordVerificacion);
    }
    if (formNuevaPassword) {
        formNuevaPassword.addEventListener('submit', manejarNuevaPassword);
    }
    if (modalOlvidePassword) {
        modalOlvidePassword.addEventListener('click', (e) => {
            if (e.target === modalOlvidePassword) cerrarModalOlvidePassword();
        });
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && modalOlvidePassword.style.display === 'flex') cerrarModalOlvidePassword();
        });
    }

    adjuntarEventoTablaAdmin();
    
    // LISTENERS DEL PANEL ADMIN
    const filtroUBusqueda = document.getElementById('filtro-busqueda');
    const filtroEstado = document.getElementById('filtro-estado');
    const filtroUsuarios = document.getElementById('filtro-usuarios');
    if (filtroUBusqueda) {
        filtroUBusqueda.addEventListener('keyup', () => {
            adminPaginaActual = 1;
            actualizarTablasAdmin();
        });
    }
    if (filtroEstado) {
        filtroEstado.addEventListener('change', () => {
            adminPaginaActual = 1;
            actualizarTablasAdmin();
        });
    }
    if (filtroUsuarios) {
        filtroUsuarios.addEventListener('keyup', () => {
            usuariosPaginaActual = 1;
            actualizarTablaUsuarios();
        });
    }

    // DONACIONES
    const btnAbrirDonar = document.getElementById('btn-abrir-donar');
    const btnAbrirMisDonaciones = document.getElementById('btn-abrir-mis-donaciones');
    const btnVolverDonar = document.getElementById('btn-volver-donar');
    const btnVolverMisDonaciones = document.getElementById('btn-volver-mis-donaciones');
    const modalDonar = document.getElementById('modal-donar');
    const modalMisDonaciones = document.getElementById('modal-mis-donaciones');
    const formDonacion = document.getElementById('formulario-donacion');
    const donTipo = document.getElementById('don-tipo');
    const grupoMonto = document.getElementById('grupo-monto');
    const grupoBienes = document.getElementById('grupo-bienes');
    const btnDonUbicacion = document.getElementById('btn-don-ubicacion');
    const logoPrincipal = document.getElementById('logo-principal');
    const navDonar = document.getElementById('nav-donar');

    if (btnAbrirDonar && modalDonar) btnAbrirDonar.addEventListener('click', abrirModalDonar);
    if (navDonar && modalDonar) navDonar.addEventListener('click', abrirModalDonar);
    if (btnVolverDonar && modalDonar) btnVolverDonar.addEventListener('click', cerrarModalDonar);
    if (btnAbrirMisDonaciones && modalMisDonaciones) btnAbrirMisDonaciones.addEventListener('click', abrirModalMisDonaciones);
    if (btnVolverMisDonaciones && modalMisDonaciones) btnVolverMisDonaciones.addEventListener('click', cerrarModalMisDonaciones);
    if (formDonacion) {
        console.log('Formulario de donación encontrado, asignando listener...');
        formDonacion.addEventListener('submit', manejarDonacion);
    } else {
        console.error('Formulario de donación NO encontrado');
    }
    if (logoPrincipal && modalDonar) {
        logoPrincipal.addEventListener('click', () => abrirModalDonar());
    }

    if (donTipo) {
        donTipo.addEventListener('change', () => {
            const tipo = donTipo.value;
            if (grupoMonto) grupoMonto.style.display = 'none';
            if (grupoBienes) grupoBienes.style.display = tipo === 'bienes' ? 'block' : 'none';
        });
    }

    if (btnDonUbicacion) {
        btnDonUbicacion.addEventListener('click', () => {
            if (!navigator.geolocation) {
                alert('Tu navegador no soporta geolocalización.');
                return;
            }
            navigator.geolocation.getCurrentPosition(
                async (position) => {
                    const lat = position.coords.latitude;
                    const lon = position.coords.longitude;
                    coordenadas.lat = lat;
                    coordenadas.lon = lon;
                    document.getElementById('don-lat').textContent = lat.toFixed(4);
                    document.getElementById('don-lon').textContent = lon.toFixed(4);
                    document.getElementById('don-ubicacion-info').style.display = 'block';
                    if (mapaReporte && typeof L !== 'undefined') {
                        mapaReporte.setView([lat, lon], 15);
                        if (marcadorMapa) mapaReporte.removeLayer(marcadorMapa);
                        marcadorMapa = L.marker([lat, lon]).addTo(mapaReporte);
                    }
                    try {
                        const response = await fetch(
                            `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json&language=es`
                        );
                        if (response.ok) {
                            const data = await response.json();
                            let nombreLugar = '';
                            if (data.address) {
                                const addr = data.address;
                                nombreLugar = addr.neighbourhood || addr.suburb || addr.district || addr.city || data.name || 'Ubicación desconocida';
                            }
                            document.getElementById('don-sector').value = nombreLugar;
                        }
                    } catch (e) {
                        console.log('No se pudo obtener el nombre del lugar');
                    }
                },
                () => alert('No se pudo obtener la ubicación.')
            );
        });
    }

    // LISTENERS DE DONACIONES EN PANEL ADMIN
    const filtroDonBusqueda = document.getElementById('filtro-donaciones');
    const filtroDonEstado = document.getElementById('filtro-don-estado');
    const btnExportarDonacionesExcel = document.getElementById('btn-exportar-donaciones-excel');
    if (filtroDonBusqueda) {
        filtroDonBusqueda.addEventListener('keyup', () => {
            donacionesPaginaActual = 1;
            actualizarTablaDonaciones();
        });
    }
    if (filtroDonEstado) {
        filtroDonEstado.addEventListener('change', () => {
            donacionesPaginaActual = 1;
            actualizarTablaDonaciones();
        });
    }
    if (btnExportarDonacionesExcel) {
        btnExportarDonacionesExcel.addEventListener('click', exportarDonacionesAExcel);
    }

    // ESTADÍSTICAS / DASHBOARD
    const btnAbrirEstadisticas = document.getElementById('btn-abrir-estadisticas');
    const btnVolverEstadisticas = document.getElementById('btn-volver-estadisticas');
    const modalEstadisticas = document.getElementById('modal-estadisticas');

    if (btnAbrirEstadisticas && modalEstadisticas) {
        btnAbrirEstadisticas.addEventListener('click', abrirModalEstadisticas);
    }
    if (btnVolverEstadisticas && modalEstadisticas) {
        btnVolverEstadisticas.addEventListener('click', cerrarModalEstadisticas);
    }
    if (modalEstadisticas) {
        modalEstadisticas.addEventListener('click', (e) => {
            if (e.target === modalEstadisticas) cerrarModalEstadisticas();
        });
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && modalEstadisticas.style.display === 'flex') cerrarModalEstadisticas();
        });
    }
    initDashboardTabs();
    
    // Agregar estilos dinámicos
    agregarEstilosDinamicos();
});

// MOSTRAR/OCULTAR FORMULARIOS DE AUTENTICACIÓN
function toggleAuthForms() {
    const loginForm = document.getElementById('login-form');
    const registroForm = document.getElementById('registro-form');
    
    if (loginForm.style.display === 'none') {
        loginForm.style.display = 'block';
        registroForm.style.display = 'none';
    } else {
        loginForm.style.display = 'none';
        registroForm.style.display = 'block';
    }
}

// MANEJAR INICIO DE SESIÓN CON GOOGLE
async function manejarGoogleLogin() {
    if (!firebaseAuth) {
        alert('❌ Firebase Auth no está configurado');
        return;
    }
    try {
        const provider = new firebase.auth.GoogleAuthProvider();
        const result = await firebaseAuth.signInWithPopup(provider);
        const user = result.user;
        if (user) {
            const googleUser = {
                id: user.uid,
                nombre: user.displayName || user.email.split('@')[0],
                usuario: user.email.split('@')[0],
                email: user.email,
                telefono: user.phoneNumber || '',
                foto: user.photoURL || '',
                rol: 'ciudadano',
                password: '',
                googleId: user.uid,
                fecha: new Date().toLocaleDateString('es-ES')
            };
            usuarioActual = googleUser;
            localStorage.setItem('usuarioActual', JSON.stringify(usuarioActual));
            if (firebaseEnabled && db) {
                try {
                    await db.ref('usuarios/' + user.uid).set(googleUser);
                } catch (e) {
                    console.warn('No se pudo sincronizar con Firebase:', e);
                }
            }
            document.getElementById('form-login').reset();
            mostrarPaginaPrincipal();
        }
    } catch (error) {
        console.error('Error en Google Sign-In:', error);
        if (error.code === 'auth/popup-closed-by-user') {
            alert('❌ Cerraste el popup de Google. Intentá de nuevo.');
        } else {
            alert('❌ Error al iniciar sesión con Google: ' + error.message);
        }
    }
}

// MANEJAR REGISTRO CON GOOGLE
async function manejarGoogleRegistro() {
    if (!firebaseAuth) {
        alert('❌ Firebase Auth no está configurado');
        return;
    }
    try {
        const provider = new firebase.auth.GoogleAuthProvider();
        const result = await firebaseAuth.signInWithPopup(provider);
        const user = result.user;
        if (user) {
            const googleUser = {
                id: user.uid,
                nombre: user.displayName || user.email.split('@')[0],
                usuario: user.email.split('@')[0],
                email: user.email,
                telefono: user.phoneNumber || '',
                foto: user.photoURL || '',
                rol: 'ciudadano',
                password: '',
                googleId: user.uid,
                fecha: new Date().toLocaleDateString('es-ES')
            };
            const existe = usuarios.find(u => u.email === googleUser.email);
            if (existe) {
                usuarioActual = existe;
                localStorage.setItem('usuarioActual', JSON.stringify(usuarioActual));
            } else {
                usuarios.push(googleUser);
                localStorage.setItem('usuarios', JSON.stringify(usuarios));
                usuarioActual = googleUser;
                localStorage.setItem('usuarioActual', JSON.stringify(usuarioActual));
                if (firebaseEnabled && db) {
                    try {
                        await db.ref('usuarios/' + user.uid).set(googleUser);
                    } catch (e) {
                        console.warn('No se pudo sincronizar con Firebase:', e);
                    }
                }
            }
            document.getElementById('registro-form').reset();
            mostrarPaginaPrincipal();
        }
    } catch (error) {
        console.error('Error en Google Sign-In:', error);
        if (error.code === 'auth/popup-closed-by-user') {
            alert('❌ Cerraste el popup de Google. Intentá de nuevo.');
        } else {
            alert('❌ Error al registrarse con Google: ' + error.message);
        }
    }
}

// MANEJAR LOGIN
async function manejarLogin(e) {
    e.preventDefault();

    const usuarioOEmail = document.getElementById('login-username').value.trim();
    const password = document.getElementById('login-password').value;
    const usuarioOEmailLower = (usuarioOEmail || '').toLowerCase();

    try {
        let usuario = null;

        if (firebaseEnabled && db) {
            try {
                const snapshot = await db.ref('usuarios').once('value');
                const lista = [];
                if (snapshot.exists()) {
                    snapshot.forEach(child => {
                        lista.push({ id: child.key, docId: child.key, ...child.val() });
                        return false;
                    });
                }
                usuarios = lista;
                localStorage.setItem('usuarios', JSON.stringify(usuarios));
                usuario = lista.find(u => ((u.usuario || '').toLowerCase() === usuarioOEmailLower || (u.email || '').toLowerCase() === usuarioOEmailLower) && u.password === password);

                if (!usuario) {
                    const snapshotAgregados = await db.ref('usuariosAgregados').once('value');
                    const listaAgregados = [];
                    if (snapshotAgregados.exists()) {
                        snapshotAgregados.forEach(child => {
                            listaAgregados.push({ id: child.key, docId: child.key, ...child.val() });
                            return false;
                        });
                    }
                    usuariosAgregados = listaAgregados;
                    localStorage.setItem('usuariosAgregados', JSON.stringify(usuariosAgregados));
                    usuario = listaAgregados.find(u => ((u.usuario || '').toLowerCase() === usuarioOEmailLower || (u.email || '').toLowerCase() === usuarioOEmailLower) && u.password === password);
                }
            } catch (error) {
                alert('❌ No se pudo consultar Firebase para login. Se intentará con datos locales.');
                console.error('Error al consultar Firebase en login:', error);
            }
        }

        if (!usuario) {
            usuarios = JSON.parse(localStorage.getItem('usuarios')) || [];
            usuariosAgregados = JSON.parse(localStorage.getItem('usuariosAgregados')) || [];
            usuario = usuarios.find(u => ((u.usuario || '').toLowerCase() === usuarioOEmailLower || (u.email || '').toLowerCase() === usuarioOEmailLower) && u.password === password);
        }

        if (!usuario) {
            usuario = usuariosAgregados.find(u => ((u.usuario || '').toLowerCase() === usuarioOEmailLower || (u.email || '').toLowerCase() === usuarioOEmailLower) && u.password === password);
        }

        if (usuario) {
            usuarioActual = usuario;
            localStorage.setItem('usuarioActual', JSON.stringify(usuarioActual));
            document.getElementById('form-login').reset();
            mostrarPaginaPrincipal();
            return;
        }

        alert('❌ Usuario/Correo o contraseña incorrectos');
    } catch (error) {
        console.error('Error inesperado en login:', error);
        alert('❌ Ocurrió un error inesperado al iniciar sesión. Por favor recargá la página y volvé a intentar.');
    }
}

// MANEJAR REGISTRO
async function manejarRegistro(e) {
    e.preventDefault();
    
    const nombre = document.getElementById('registro-nombre').value.trim();
    const usuario = document.getElementById('registro-usuario').value.trim();
    const email = document.getElementById('registro-email').value.trim();
    const password = document.getElementById('registro-password').value;
    const passwordConfirm = document.getElementById('registro-password-confirm').value;
    let rol = document.getElementById('registro-rol').value;
    if (!rol) rol = 'ciudadano';

    if (!usuario) { alert('❌ Falta completar el usuario'); return; }
    if (!email) { alert('❌ Falta completar el correo'); return; }
    if (!password) { alert('❌ Falta completar la contraseña'); return; }
    if (!passwordConfirm) { alert('❌ Falta confirmar la contraseña'); return; }

    if (password !== passwordConfirm) {
        alert('❌ Las contraseñas no coinciden');
        return;
    }

    if (usuario.length < 3) {
        alert('❌ El usuario debe tener al menos 3 caracteres');
        return;
    }

    if (!/^[a-zA-Z0-9_]+$/.test(usuario)) {
        alert('❌ El usuario solo puede contener letras, números y guion bajo (_)');
        return;
    }

    if (password.length < 4) {
        alert('❌ La contraseña debe tener al menos 4 caracteres');
        return;
    }

    const usuarioLower = usuario.toLowerCase();
    const emailLower = email.toLowerCase();

    if (usuarios.find(u => (u.usuario || '').toLowerCase() === usuarioLower)) {
        alert('❌ Este nombre de usuario ya está registrado');
        return;
    }

    if (usuarios.find(u => (u.email || '').toLowerCase() === emailLower)) {
        alert('❌ Este correo ya está registrado');
        return;
    }

    if (firebaseEnabled && db) {
        try {
            const snapshot = await db.ref('usuarios').once('value');
            let existeUsuario = false;
            let existeEmail = false;
            if (snapshot.exists()) {
                snapshot.forEach(child => {
                    const u = child.val() || {};
                    const uUser = (u.usuario || '').toLowerCase();
                    const uEmail = (u.email || '').toLowerCase();
                    if (uUser === usuarioLower) existeUsuario = true;
                    if (uEmail === emailLower) existeEmail = true;
                    return false;
                });
            }
            if (existeUsuario) {
                alert('❌ Este nombre de usuario ya está registrado');
                return;
            }
            if (existeEmail) {
                alert('❌ Este correo ya está registrado');
                return;
            }
        } catch (error) {
            alert('❌ No se pudo verificar contra Firebase, se continúa con el registro local.');
            console.warn('No se pudo verificar contra Firebase, se continua con el registro local:', error);
        }
    }

    const nuevoUsuario = {
        id: Date.now(),
        nombre: nombre,
        usuario: usuario,
        email: email,
        password: password,
        rol: rol,
        fechaRegistro: new Date().toLocaleDateString('es-ES')
    };

    try {
        if (firebaseEnabled && db) {
            sincronizarUsuarioFirebase(nuevoUsuario);
        } else {
            usuarios.push(nuevoUsuario);
            localStorage.setItem('usuarios', JSON.stringify(usuarios));
        }

        usuarioActual = nuevoUsuario;
        localStorage.setItem('usuarioActual', JSON.stringify(usuarioActual));

        alert('✅ Cuenta creada exitosamente. ¡Bienvenido!');
        mostrarPaginaPrincipal();
    } catch (error) {
        console.error('Error al guardar el usuario:', error);
        alert('❌ No se pudo guardar el usuario. Verificá que el navegador permita guardar datos locales.');
    }
}

// CERRAR SESIÓN
function cerrarSesion() {
    if (confirm('¿Estás seguro de que deseas cerrar sesión?')) {
        usuarioActual = null;
        localStorage.removeItem('usuarioActual');
        location.reload();
    }
}

function actualizarAvatar() {
    const avatar = document.getElementById('usuario-avatar');
    if (!avatar) return;
    if (usuarioActual && usuarioActual.foto) {
        avatar.src = usuarioActual.foto;
        avatar.style.display = 'block';
    } else {
        avatar.src = '';
        avatar.style.display = 'none';
    }
}

function actualizarVisibilidadFirebase() {
    const soloLider = document.getElementById('solo-lider');
    const firebaseStatus = document.getElementById('firebase-status');
    const rolInfo = document.getElementById('rol-info');
    
    if (!soloLider || !firebaseStatus || !rolInfo) return;
    
    const esLider = usuarioActual && usuarioActual.rol === 'lider';
    const firebaseDisponible = firebaseEnabled && db;
    
    if (esLider && firebaseDisponible) {
        soloLider.style.display = 'flex';
        firebaseStatus.style.display = 'block';
        rolInfo.style.display = 'none';
    } else if (esLider && !firebaseDisponible) {
        soloLider.style.display = 'flex';
        firebaseStatus.style.display = 'block';
        firebaseStatus.textContent = 'Firebase: no disponible';
        firebaseStatus.style.color = '#ffd9d9';
        rolInfo.style.display = 'none';
    } else {
        soloLider.style.display = 'none';
        firebaseStatus.style.display = 'none';
        rolInfo.style.display = 'block';
        rolInfo.textContent = 'Rol: Ciudadano';
        rolInfo.style.color = '#b2dfdb';
    }
}

// ===== RECUPERACIÓN DE USUARIO Y CONTRASEÑA =====

function abrirModalOlvideUsuario() {
    const modal = document.getElementById('modal-olvide-usuario');
    if (!modal) return;
    document.getElementById('form-olvide-usuario').reset();
    document.getElementById('resultado-olvide-usuario').style.display = 'none';
    modal.style.display = 'flex';
}

function cerrarModalOlvideUsuario() {
    const modal = document.getElementById('modal-olvide-usuario');
    if (modal) modal.style.display = 'none';
}

async function manejarOlvideUsuario(e) {
    e.preventDefault();
    const email = document.getElementById('olvide-usuario-email').value.trim().toLowerCase();
    if (!email) {
        alert('❌ Ingresa tu correo electrónico');
        return;
    }

    let usuarioEncontrado = null;
    let listaCompleta = [];
    console.log('Buscando usuario por correo:', email);

    if (firebaseEnabled && db) {
        try {
            const snapshot = await db.ref('usuarios').once('value');
            listaCompleta = [];
            if (snapshot.exists()) {
                snapshot.forEach(child => {
                    listaCompleta.push(child.val());
                    return false;
                });
            }
            console.log('Usuarios en Firebase:', listaCompleta);
            usuarioEncontrado = listaCompleta.find(u => u.email && u.email.toLowerCase() === email);
        } catch (error) {
            console.warn('Error consultando Firebase, se usa respaldo local:', error);
        }
    }

    if (!usuarioEncontrado) {
        usuarioEncontrado = usuarios.find(u => u.email && u.email.toLowerCase() === email);
    }
    if (!usuarioEncontrado) {
        usuarioEncontrado = usuariosAgregados.find(u => u.email && u.email.toLowerCase() === email);
    }
    console.log('Usuario encontrado:', usuarioEncontrado);

    const resultadoDiv = document.getElementById('resultado-olvide-usuario');
    const textoUsuario = document.getElementById('texto-usuario-encontrado');

    if (usuarioEncontrado) {
        textoUsuario.textContent = usuarioEncontrado.usuario || 'Sin nombre de usuario';
        resultadoDiv.style.display = 'block';
    } else {
        textoUsuario.textContent = 'No se encontró ninguna cuenta con ese correo';
        resultadoDiv.style.display = 'block';
    }
}

function abrirModalOlvidePassword() {
    const modal = document.getElementById('modal-olvide-password');
    if (!modal) return;
    document.getElementById('form-olvide-password').reset();
    document.getElementById('form-nueva-password').style.display = 'none';
    modal.style.display = 'flex';
}

function cerrarModalOlvidePassword() {
    const modal = document.getElementById('modal-olvide-password');
    if (modal) modal.style.display = 'none';
}

async function manejarOlvidePasswordVerificacion(e) {
    e.preventDefault();
    const usuario = document.getElementById('olvide-password-usuario').value.trim();
    const email = document.getElementById('olvide-password-email').value.trim().toLowerCase();
    
    if (!usuario || !email) {
        alert('❌ Ingresa tu usuario y correo electrónico');
        return;
    }

    let usuarioEncontrado = null;
    let docId = null;

    if (firebaseEnabled && db) {
        try {
            const snapshot = await db.ref('usuarios').once('value');
            if (snapshot.exists()) {
                snapshot.forEach(child => {
                    const u = child.val();
                    if (u && u.usuario === usuario && u.email && u.email.toLowerCase() === email) {
                        usuarioEncontrado = u;
                        docId = child.key;
                    }
                    return false;
                });
            }
        } catch (error) {
            console.warn('Error consultando Firebase:', error);
        }
    }

    if (!usuarioEncontrado) {
        usuarioEncontrado = usuarios.find(u => u.usuario === usuario && u.email && u.email.toLowerCase() === email);
    }
    if (!usuarioEncontrado) {
        usuarioEncontrado = usuariosAgregados.find(u => u.usuario === usuario && u.email && u.email.toLowerCase() === email);
    }

    if (!usuarioEncontrado) {
        alert('❌ No se encontró una cuenta con ese usuario y correo');
        return;
    }

    document.getElementById('form-olvide-password').style.display = 'none';
    document.getElementById('form-nueva-password').style.display = 'block';
    document.getElementById('form-nueva-password').dataset.docId = docId || '';
    document.getElementById('form-nueva-password').dataset.usuarioId = usuarioEncontrado.id || '';
}

async function manejarNuevaPassword(e) {
    e.preventDefault();
    const password = document.getElementById('nueva-password').value;
    const passwordConfirm = document.getElementById('nueva-password-confirm').value;
    const docId = document.getElementById('form-nueva-password').dataset.docId;
    const usuarioId = document.getElementById('form-nueva-password').dataset.usuarioId;

    if (!password || password.length < 4) {
        alert('❌ La contraseña debe tener al menos 4 caracteres');
        return;
    }
    if (password !== passwordConfirm) {
        alert('❌ Las contraseñas no coinciden');
        return;
    }

    const usuario = usuarios.find(u => String(u.id) === String(usuarioId));
    const agregado = usuariosAgregados.find(u => String(u.id) === String(usuarioId));

    if (usuario) {
        usuario.password = password;
        localStorage.setItem('usuarios', JSON.stringify(usuarios));
    }
    if (agregado) {
        agregado.password = password;
        localStorage.setItem('usuariosAgregados', JSON.stringify(usuariosAgregados));
    }

    if (firebaseEnabled && db && docId) {
        try {
            await db.ref('usuarios/' + docId).update({ password: password });
        } catch (error) {
            console.warn('No se pudo actualizar la contraseña en Firebase:', error);
        }
    }

    alert('✅ Contraseña actualizada correctamente');
    cerrarModalOlvidePassword();
}

// MOSTRAR PÁGINA PRINCIPAL
function mostrarPaginaPrincipal() {
    const authSection = document.getElementById('auth-section');
    const mainContent = document.getElementById('main-content');
    
    authSection.style.display = 'none';
    mainContent.style.display = 'block';
    
    // ACTUALIZAR NOMBRE DE USUARIO
    document.getElementById('usuario-nombre').textContent = `👤 ${usuarioActual.nombre}`;
    actualizarAvatar();
    actualizarVisibilidadFirebase();
    const usuarioRolSpan = document.getElementById('usuario-rol');
    if (usuarioRolSpan) {
        usuarioRolSpan.textContent = usuarioActual.rol === 'lider' ? 'Usted es Líder Comunitario' : '';
    }
    
    // MOSTRAR/OCULTAR PANEL ADMIN Y MENU USUARIOS
    const menuAdmin = document.getElementById('menu-admin');
    const menuUsuarios = document.getElementById('menu-usuarios');
    const adminPanel = document.getElementById('admin');
    
    if (usuarioActual.rol === 'lider') {
        menuAdmin.style.display = 'list-item';
        menuUsuarios.style.display = 'list-item';
        if (adminPanel) {
            adminPanel.style.display = 'block';
        }
        actualizarEstadisticas();
        actualizarTablasAdmin();
        actualizarTablaUsuarios();
    } else {
        menuAdmin.style.display = 'none';
        menuUsuarios.style.display = 'none';
        if (adminPanel) {
            adminPanel.style.display = 'none';
        }
    }
    
    // CARGAR SOLICITUDES
    actualizarTabla();
    
    // PRE-LLENAR DATOS DEL USUARIO EN EL FORMULARIO
    document.getElementById('nombre').value = usuarioActual.nombre;
    document.getElementById('email').value = usuarioActual.email;
}

// MOSTRAR PÁGINA DE LOGIN
function mostrarPaginaLogin() {
    const authSection = document.getElementById('auth-section');
    const mainContent = document.getElementById('main-content');
    
    authSection.style.display = 'flex';
    mainContent.style.display = 'none';
    
    actualizarVisibilidadFirebase();
}

// FUNCIÓN PARA SCROLL SUAVE
function scrollTo(id) {
    const elemento = document.getElementById(id);
    if (elemento) {
        elemento.scrollIntoView({ behavior: 'smooth' });
    }
}

// FUNCIÓN PARA OBTENER UBICACIÓN AUTOMÁTICA
function detectarUbicacion() {
    const btnUbicacion = document.getElementById('btn-ubicacion');
    const sectorInput = document.getElementById('sector');
    const ubicacionInfo = document.getElementById('ubicacion-info');
    
    // VERIFICAR SI EL NAVEGADOR SOPORTA GEOLOCALIZACIÓN
    if (!navigator.geolocation) {
        alert('Tu navegador no soporta geolocalización. Por favor, ingresa tu ubicación manualmente.');
        return;
    }
    
    // CAMBIAR ESTADO DEL BOTÓN
    btnUbicacion.classList.add('cargando');
    btnUbicacion.textContent = '⏳ Detectando...';
    btnUbicacion.disabled = true;
    
    // OBTENER COORDENADAS
    navigator.geolocation.getCurrentPosition(
        function(position) {
            const lat = position.coords.latitude;
            const lon = position.coords.longitude;
            
            // GUARDAR COORDENADAS
            coordenadas.lat = lat;
            coordenadas.lon = lon;
            
            // MOSTRAR COORDENADAS
            document.getElementById('lat').textContent = lat.toFixed(4);
            document.getElementById('lon').textContent = lon.toFixed(4);
            ubicacionInfo.style.display = 'block';
            
            // USAR NOMINATIM PARA OBTENER EL NOMBRE DEL LUGAR
            obtenerNombreLugar(lat, lon);
        },
        function(error) {
            btnUbicacion.classList.remove('cargando');
            btnUbicacion.classList.add('error');
            btnUbicacion.textContent = '❌ Error al detectar';
            btnUbicacion.disabled = false;
            
            let mensajeError = 'Error al obtener ubicación. ';
            
            switch(error.code) {
                case error.PERMISSION_DENIED:
                    mensajeError += 'Debes permitir acceso a tu ubicación.';
                    break;
                case error.POSITION_UNAVAILABLE:
                    mensajeError += 'La información de ubicación no está disponible.';
                    break;
                case error.TIMEOUT:
                    mensajeError += 'La solicitud de ubicación tardó demasiado.';
                    break;
            }
            
            alert(mensajeError);
            
            // RESTAURAR BOTÓN DESPUÉS DE 3 SEGUNDOS
            setTimeout(() => {
                btnUbicacion.classList.remove('error');
                btnUbicacion.textContent = '📍 Detectar Ubicación';
            }, 3000);
        }
    );
}

// FUNCIÓN PARA OBTENER EL NOMBRE DEL LUGAR USANDO NOMINATIM
async function obtenerNombreLugar(lat, lon) {
    const btnUbicacion = document.getElementById('btn-ubicacion');
    const sectorInput = document.getElementById('sector');
    
    try {
        const response = await fetch(
            `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json&language=es`
        );
        
        if (!response.ok) {
            throw new Error('Error en la solicitud');
        }
        
        const data = await response.json();
        
        // EXTRAER INFORMACIÓN DEL LUGAR
        let nombreLugar = '';
        
        // PRIORIDAD: barrio > distrito > ciudad
        if (data.address) {
            const addr = data.address;
            nombreLugar = addr.neighbourhood || 
                         addr.suburb || 
                         addr.district || 
                         addr.city || 
                         data.name || 
                         'Ubicación desconocida';
        }
        
        // LLENAR EL CAMPO
        sectorInput.value = nombreLugar;
        
        // ACTUALIZAR BOTÓN
        btnUbicacion.classList.remove('cargando');
        btnUbicacion.classList.add('exito');
        btnUbicacion.textContent = '✅ Ubicación detectada';
        btnUbicacion.disabled = false;
        
        // RESTAURAR BOTÓN DESPUÉS DE 2 SEGUNDOS
        setTimeout(() => {
            btnUbicacion.classList.remove('exito');
            btnUbicacion.textContent = '📍 Detectar Ubicación';
        }, 2000);
        
    } catch (error) {
        console.error('Error:', error);
        sectorInput.value = `Ubicación: ${lat.toFixed(4)}, ${lon.toFixed(4)}`;
        
        // ACTUALIZAR BOTÓN
        btnUbicacion.classList.remove('cargando');
        btnUbicacion.classList.add('exito');
        btnUbicacion.textContent = '✅ Ubicación detectada';
        btnUbicacion.disabled = false;
        
        // RESTAURAR BOTÓN DESPUÉS DE 2 SEGUNDOS
        setTimeout(() => {
            btnUbicacion.classList.remove('exito');
            btnUbicacion.textContent = '📍 Detectar Ubicación';
        }, 2000);
    }
}

// MANEJO DEL FORMULARIO
async function manejarReporte(e) {
    e.preventDefault();
    if (!usuarioActual) {
        alert('Debes iniciar sesión para enviar una solicitud.');
        mostrarPaginaLogin();
        return;
    }
    
    const nuevaSolicitud = {
        id: Date.now(),
        fecha: new Date().toLocaleDateString('es-ES'),
        nombre: document.getElementById('nombre').value,
        email: document.getElementById('email').value,
        telefono: document.getElementById('telefono').value,
        sector: document.getElementById('sector').value,
        tipo: document.getElementById('tipo').value,
        entidadResponsable: document.getElementById('entidad-responsable').value,
        descripcion: document.getElementById('descripcion').value,
        urgencia: document.getElementById('urgencia').value,
        estado: 'En revisión',
        usuarioId: usuarioActual.id,
        coordenadas: {
            lat: coordenadas.lat,
            lon: coordenadas.lon
        }
    };

    await guardarSolicitud(nuevaSolicitud);
}

async function guardarSolicitud(nuevaSolicitud) {
    // VERIFICAR DUPLICADO IDÉNTICO (no bloquea si falla la red)
    let listaSolicitudes = solicitudes.slice();
    if (firebaseEnabled && db) {
        try {
            const snapshot = await db.ref('solicitudes').once('value');
            if (snapshot.exists()) {
                snapshot.forEach(child => {
                    listaSolicitudes.push({ id: child.key, docId: child.key, ...child.val() });
                    return false;
                });
            }
        } catch (error) {
            console.warn('No se pudo verificar duplicados en Firebase, se continua:', error);
        }
    }
    
    const duplicado = listaSolicitudes.find(s =>
        s.usuarioId === nuevaSolicitud.usuarioId &&
        s.sector === nuevaSolicitud.sector &&
        s.tipo === nuevaSolicitud.tipo &&
        s.descripcion === nuevaSolicitud.descripcion
    );
    
    if (duplicado) {
        alert('⚠️ Ya enviaste una solicitud idéntica. No se registró de nuevo.');
        return;
    }
    
    if (firebaseEnabled) {
        await firebaseAgregarSolicitud(nuevaSolicitud);
    } else {
        solicitudes.push(nuevaSolicitud);
        guardarSolicitudes();
    }
    
    alert('✅ ¡Solicitud registrada exitosamente!');
    cerrarModalReporte();
    document.getElementById('formulario-reporte').reset();
    document.getElementById('entidad-responsable').value = '';
    document.getElementById('nombre').value = usuarioActual.nombre;
    document.getElementById('email').value = usuarioActual.email;
    actualizarTabla();
    if (usuarioActual.rol === 'lider') {
        actualizarEstadisticas();
        actualizarTablasAdmin();
    }
    setTimeout(() => scrollTo('solicitudes'), 500);
}

// ABRIR / CERRAR VENTANA MODAL DE REPORTE
function abrirModalReporte() {
    const modal = document.getElementById('modal-reporte');
    if (!modal) return;
    document.getElementById('formulario-reporte').reset();
    document.getElementById('nombre').value = usuarioActual ? usuarioActual.nombre : '';
    document.getElementById('email').value = usuarioActual ? usuarioActual.email : '';
    const entidadInput = document.getElementById('entidad-responsable');
    if (entidadInput) entidadInput.value = '';
    modal.style.display = 'flex';
    const primerCampo = document.getElementById('sector');
    if (primerCampo) primerCampo.focus();
}

function cerrarModalReporte() {
    const modal = document.getElementById('modal-reporte');
    if (modal) modal.style.display = 'none';
    coordenadas.lat = null;
    coordenadas.lon = null;
}

// ABRIR / CERRAR VENTANA MODAL DE EDITAR PERFIL
function abrirModalPerfil() {
    const modal = document.getElementById('modal-perfil');
    if (!modal || !usuarioActual) return;
    
    document.getElementById('perfil-nombre').value = usuarioActual.nombre || '';
    document.getElementById('perfil-usuario').value = usuarioActual.usuario || '';
    document.getElementById('perfil-email').value = usuarioActual.email || '';
    document.getElementById('perfil-telefono').value = usuarioActual.telefono || '';
    document.getElementById('perfil-password').value = '';
    
    const previewPerfil = document.getElementById('preview-perfil-foto');
    if (previewPerfil && usuarioActual.foto) {
        previewPerfil.src = usuarioActual.foto;
        previewPerfil.style.display = 'block';
    } else if (previewPerfil) {
        previewPerfil.src = '';
        previewPerfil.style.display = 'none';
    }
    
    modal.style.display = 'flex';
}

function cerrarModalPerfil() {
    const modal = document.getElementById('modal-perfil');
    if (modal) modal.style.display = 'none';
    const previewPerfil = document.getElementById('preview-perfil-foto');
    if (previewPerfil) {
        previewPerfil.src = '';
        previewPerfil.style.display = 'none';
    }
    const inputFotoPerfil = document.getElementById('perfil-foto');
    if (inputFotoPerfil) inputFotoPerfil.value = '';
}

async function manejarActualizarPerfil(e) {
    e.preventDefault();
    if (!usuarioActual) return;
    
    const nombre = document.getElementById('perfil-nombre').value.trim();
    const usuario = document.getElementById('perfil-usuario').value.trim();
    const email = document.getElementById('perfil-email').value.trim();
    const telefono = document.getElementById('perfil-telefono').value.trim();
    const password = document.getElementById('perfil-password').value;
    
    if (!nombre || !usuario || !email) {
        alert('❌ Nombre, usuario y correo son obligatorios');
        return;
    }
    
    const inputFotoPerfil = document.getElementById('perfil-foto');
    const fotoFile = inputFotoPerfil && inputFotoPerfil.files && inputFotoPerfil.files[0];
    
    const procesarGuardado = (fotoBase64) => {
        const datosActualizados = {
            ...usuarioActual,
            nombre,
            usuario,
            email,
            telefono,
            foto: fotoBase64 !== undefined ? fotoBase64 : usuarioActual.foto
        };
        
        if (password && password.trim().length >= 4) {
            datosActualizados.password = password;
        }
        
        const idxUsuario = usuarios.findIndex(u => String(u.id) === String(usuarioActual.id));
        if (idxUsuario >= 0) {
            usuarios[idxUsuario] = { ...usuarios[idxUsuario], ...datosActualizados };
            localStorage.setItem('usuarios', JSON.stringify(usuarios));
        }
        
        const idxAgregado = usuariosAgregados.findIndex(u => String(u.id) === String(usuarioActual.id));
        if (idxAgregado >= 0) {
            usuariosAgregados[idxAgregado] = { ...usuariosAgregados[idxAgregado], ...datosActualizados };
            localStorage.setItem('usuariosAgregados', JSON.stringify(usuariosAgregados));
        }
        
        usuarioActual = datosActualizados;
        localStorage.setItem('usuarioActual', JSON.stringify(usuarioActual));
        
        document.getElementById('usuario-nombre').textContent = `👤 ${usuarioActual.nombre}`;
        actualizarAvatar();
        
        if (firebaseEnabled && db) {
            const ref = db.ref('usuarios').child(usuarioActual.docId || usuarioActual.id);
            const { id, docId, ...data } = usuarioActual;
            ref.update(data).catch(err => console.warn('No se pudo actualizar en Firebase:', err));
        }
        
        alert('✅ Perfil actualizado correctamente');
        cerrarModalPerfil();
        actualizarTabla();
        actualizarTablaUsuarios();
        actualizarTablasAdmin();
    };
    
    if (fotoFile) {
        const reader = new FileReader();
        reader.onload = (ev) => procesarGuardado(ev.target.result);
        reader.readAsDataURL(fotoFile);
    } else {
        procesarGuardado(usuarioActual.foto);
    }
}

    // LISTENERS DEL PANEL ADMIN
function abrirModalSolicitudes() {
    const modal = document.getElementById('modal-solicitudes');
    if (!modal) return;
    actualizarTabla(); // refresca la tabla antes de mostrar
    modal.style.display = 'flex';
}

function cerrarModalSolicitudes() {
    const modal = document.getElementById('modal-solicitudes');
    if (modal) modal.style.display = 'none';
}

// ABRIR / CERRAR VENTANA MODAL DEL PANEL ADMIN
function abrirModalAdmin() {
    const modal = document.getElementById('modal-admin');
    if (!modal) return;
    console.log('Abriendo modal admin. solicitudes.length:', solicitudes.length);
    adminPaginaActual = 1;
    actualizarEstadisticas();
    actualizarTablasAdmin();
    actualizarTablaUsuarios();
    actualizarEstadisticasDonaciones();
    actualizarTablaDonaciones();
    
    const tabs = document.querySelectorAll('.admin-tab');
    const contents = document.querySelectorAll('.admin-tab-content');
    tabs.forEach(t => t.classList.remove('active'));
    contents.forEach(c => c.classList.remove('active'));
    const tabSolicitudes = document.querySelector('.admin-tab[data-tab="solicitudes"]');
    const contentSolicitudes = document.getElementById('tab-solicitudes');
    if (tabSolicitudes) tabSolicitudes.classList.add('active');
    if (contentSolicitudes) contentSolicitudes.classList.add('active');
    
    modal.style.display = 'flex';
}

function cerrarModalAdmin() {
    const modal = document.getElementById('modal-admin');
    if (modal) modal.style.display = 'none';
}

// ===== ESTADÍSTICAS / DASHBOARD GERENCIAL =====
function abrirModalEstadisticas() {
    const modal = document.getElementById('modal-estadisticas');
    if (!modal) return;
    modal.style.display = 'flex';
    setTimeout(() => {
        generarGraficoSolicitudes();
        generarGraficoDonaciones();
        generarGraficoUsuarios();
    }, 100);
}

function cerrarModalEstadisticas() {
    const modal = document.getElementById('modal-estadisticas');
    if (modal) modal.style.display = 'none';
}

function generarGraficoSolicitudes() {
    // Solicitudes por sector
    const sectores = {};
    solicitudes.forEach(s => {
        const key = s.sector || 'Sin sector';
        sectores[key] = (sectores[key] || 0) + 1;
    });

    const ctxSector = document.getElementById('chart-solicitudes-sector');
    if (ctxSector) {
        new Chart(ctxSector, {
            type: 'bar',
            data: {
                labels: Object.keys(sectores),
                datasets: [{
                    label: 'Solicitudes',
                    data: Object.values(sectores),
                    backgroundColor: 'rgba(0, 163, 212, 0.8)',
                    borderColor: 'rgba(0, 163, 212, 1)',
                    borderWidth: 1
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    y: { beginAtZero: true, ticks: { stepSize: 1 } }
                }
            }
        });
    }

    // Tipos de necesidades
    const tipos = {};
    solicitudes.forEach(s => {
        const key = s.tipo || 'Sin tipo';
        tipos[key] = (tipos[key] || 0) + 1;
    });

    const ctxTipo = document.getElementById('chart-solicitudes-tipo');
    if (ctxTipo) {
        new Chart(ctxTipo, {
            type: 'doughnut',
            data: {
                labels: Object.keys(tipos),
                datasets: [{
                    data: Object.values(tipos),
                    backgroundColor: [
                        'rgba(0, 163, 212, 0.8)',
                        'rgba(16, 185, 129, 0.8)',
                        'rgba(245, 158, 11, 0.8)',
                        'rgba(239, 68, 68, 0.8)',
                        'rgba(139, 92, 246, 0.8)',
                        'rgba(236, 72, 153, 0.8)',
                        'rgba(107, 114, 128, 0.8)'
                    ]
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false
            }
        });
    }

    // Estados
    const estados = {};
    solicitudes.forEach(s => {
        const key = s.estado || 'Sin estado';
        estados[key] = (estados[key] || 0) + 1;
    });

    const ctxEstado = document.getElementById('chart-solicitudes-estado');
    if (ctxEstado) {
        new Chart(ctxEstado, {
            type: 'pie',
            data: {
                labels: Object.keys(estados),
                datasets: [{
                    data: Object.values(estados),
                    backgroundColor: [
                        'rgba(59, 130, 246, 0.8)',
                        'rgba(16, 185, 129, 0.8)',
                        'rgba(245, 158, 11, 0.8)',
                        'rgba(139, 92, 246, 0.8)'
                    ]
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false
            }
        });
    }

    // Urgencias
    const urgencias = {};
    solicitudes.forEach(s => {
        const key = s.urgencia || 'Sin urgencia';
        urgencias[key] = (urgencias[key] || 0) + 1;
    });

    const ctxUrgencia = document.getElementById('chart-solicitudes-urgencia');
    if (ctxUrgencia) {
        new Chart(ctxUrgencia, {
            type: 'bar',
            data: {
                labels: Object.keys(urgencias),
                datasets: [{
                    label: 'Cantidad',
                    data: Object.values(urgencias),
                    backgroundColor: [
                        'rgba(16, 185, 129, 0.8)',
                        'rgba(245, 158, 11, 0.8)',
                        'rgba(239, 68, 68, 0.8)',
                        'rgba(220, 38, 38, 0.8)'
                    ]
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    y: { beginAtZero: true, ticks: { stepSize: 1 } }
                }
            }
        });
    }
}

function generarGraficoDonaciones() {
    // Donaciones por categoría
    const categorias = {};
    donaciones.forEach(d => {
        const key = d.categoria || 'Sin categoría';
        categorias[key] = (categorias[key] || 0) + 1;
    });

    const ctxCat = document.getElementById('chart-donaciones-categoria');
    if (ctxCat) {
        new Chart(ctxCat, {
            type: 'bar',
            data: {
                labels: Object.keys(categorias),
                datasets: [{
                    label: 'Donaciones',
                    data: Object.values(categorias),
                    backgroundColor: 'rgba(16, 185, 129, 0.8)',
                    borderColor: 'rgba(16, 185, 129, 1)',
                    borderWidth: 1
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    y: { beginAtZero: true, ticks: { stepSize: 1 } }
                }
            }
        });
    }

    // Tipos de donación
    const tipos = {};
    donaciones.forEach(d => {
        const key = d.tipo || 'Sin tipo';
        tipos[key] = (tipos[key] || 0) + 1;
    });

    const ctxTipo = document.getElementById('chart-donaciones-tipo');
    if (ctxTipo) {
        new Chart(ctxTipo, {
            type: 'doughnut',
            data: {
                labels: Object.keys(tipos),
                datasets: [{
                    data: Object.values(tipos),
                    backgroundColor: [
                        'rgba(0, 163, 212, 0.8)',
                        'rgba(16, 185, 129, 0.8)',
                        'rgba(245, 158, 11, 0.8)'
                    ]
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false
            }
        });
    }

    // Estados de donaciones
    const estados = {};
    donaciones.forEach(d => {
        const key = d.estado || 'Sin estado';
        estados[key] = (estados[key] || 0) + 1;
    });

    const ctxEstado = document.getElementById('chart-donaciones-estado');
    if (ctxEstado) {
        new Chart(ctxEstado, {
            type: 'pie',
            data: {
                labels: Object.keys(estados),
                datasets: [{
                    data: Object.values(estados),
                    backgroundColor: [
                        'rgba(59, 130, 246, 0.8)',
                        'rgba(16, 185, 129, 0.8)',
                        'rgba(239, 68, 68, 0.8)'
                    ]
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false
            }
        });
    }

    // Donaciones por mes
    const meses = {};
    donaciones.forEach(d => {
        const fecha = new Date(d.fecha);
        const key = fecha.toLocaleString('es-ES', { month: 'short', year: 'numeric' });
        meses[key] = (meses[key] || 0) + 1;
    });

    const ctxMes = document.getElementById('chart-donaciones-mes');
    if (ctxMes) {
        new Chart(ctxMes, {
            type: 'line',
            data: {
                labels: Object.keys(meses),
                datasets: [{
                    label: 'Donaciones',
                    data: Object.values(meses),
                    borderColor: 'rgba(16, 185, 129, 1)',
                    backgroundColor: 'rgba(16, 185, 129, 0.2)',
                    fill: true,
                    tension: 0.4
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    y: { beginAtZero: true, ticks: { stepSize: 1 } }
                }
            }
        });
    }
}

function generarGraficoUsuarios() {
    // Usuarios por rol
    const roles = {};
    [...usuarios, ...usuariosAgregados].forEach(u => {
        const key = u.rol === 'lider' ? 'Líder' : 'Ciudadano';
        roles[key] = (roles[key] || 0) + 1;
    });

    const ctxRol = document.getElementById('chart-usuarios-rol');
    if (ctxRol) {
        new Chart(ctxRol, {
            type: 'pie',
            data: {
                labels: Object.keys(roles),
                datasets: [{
                    data: Object.values(roles),
                    backgroundColor: [
                        'rgba(139, 92, 246, 0.8)',
                        'rgba(0, 163, 212, 0.8)'
                    ]
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false
            }
        });
    }

    // Registro por mes
    const meses = {};
    [...usuarios, ...usuariosAgregados].forEach(u => {
        if (u.fechaRegistro) {
            const fecha = new Date(u.fechaRegistro);
            const key = fecha.toLocaleString('es-ES', { month: 'short', year: 'numeric' });
            meses[key] = (meses[key] || 0) + 1;
        }
    });

    const ctxMes = document.getElementById('chart-usuarios-mes');
    if (ctxMes) {
        new Chart(ctxMes, {
            type: 'bar',
            data: {
                labels: Object.keys(meses),
                datasets: [{
                    label: 'Usuarios',
                    data: Object.values(meses),
                    backgroundColor: 'rgba(139, 92, 246, 0.8)',
                    borderColor: 'rgba(139, 92, 246, 1)',
                    borderWidth: 1
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    y: { beginAtZero: true, ticks: { stepSize: 1 } }
                }
            }
        });
    }
}

// TABS DEL PANEL ADMIN
function initAdminTabs() {
    const tabs = document.querySelectorAll('.admin-tab');
    if (!tabs.length) return;
    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            const target = tab.dataset.tab;
            if (!target) return;
            tabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            document.querySelectorAll('.admin-tab-content').forEach(content => {
                const isTarget = content.id === 'tab-' + target;
                content.classList.toggle('active', isTarget);
                content.style.display = isTarget ? 'block' : 'none';
            });
            if (target === 'eliminados') {
                mostrarRegistrosEliminados();
            } else if (target === 'solicitudes') {
                const tabla = document.getElementById('tabla-admin-cuerpo');
                const contenedorEliminados = document.getElementById('contenedor-eliminados');
                if (tabla) {
                    tabla.style.display = '';
                    tabla.style.visibility = 'visible';
                }
                if (contenedorEliminados) {
                    contenedorEliminados.style.display = 'none';
                    contenedorEliminados.innerHTML = '';
                }
                const titulo = document.getElementById('titulo-seccion-admin');
                if (titulo) titulo.textContent = 'Solicitudes';
                adminPaginaActual = 1;
                actualizarTablasAdmin();
            } else if (target === 'donaciones') {
                actualizarEstadisticasDonaciones();
                actualizarTablaDonaciones();
            } else if (target === 'usuarios') {
                usuariosPaginaActual = 1;
                actualizarTablaUsuarios();
            }
        });
    });
}

// TABS DEL DASHBOARD DE ESTADÍSTICAS
function initDashboardTabs() {
    const tabs = document.querySelectorAll('.dashboard-tab');
    if (!tabs.length) return;
    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            const target = tab.dataset.dashboard;
            if (!target) return;
            tabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            document.querySelectorAll('.dashboard-content').forEach(content => {
                content.classList.toggle('active', content.id === 'dashboard-' + target);
            });
        });
    });
}

// EXPORTAR SOLICITUDES A EXCEL
function exportarSolicitudesAExcel() {
    if (typeof XLSX === 'undefined') {
        alert('❌ No se pudo exportar porque la librería de Excel no está disponible.');
        return;
    }
    if (!solicitudes || solicitudes.length === 0) {
        alert('❌ No hay solicitudes para exportar.');
        return;
    }

    const datos = solicitudes.map(s => ({
        Fecha: s.fecha || '',
        Usuario: s.nombre || '',
        Sector: s.sector || '',
        Tipo: s.tipo || '',
        Urgencia: s.urgencia || '',
        Estado: s.estado || '',
        Descripcion: s.descripcion || '',
        Latitud: s.lat || '',
        Longitud: s.lon || ''
    }));

    const ws = XLSX.utils.json_to_sheet(datos);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Solicitudes');
    const fecha = new Date().toISOString().slice(0, 10);
    XLSX.writeFile(wb, `solicitudes_${fecha}.xlsx`);
}

function exportarEliminadosAExcel() {
    if (typeof XLSX === 'undefined') {
        alert('❌ No se pudo exportar porque la librería de Excel no está disponible.');
        return;
    }
    if (!solicitudesEliminadas || solicitudesEliminadas.length === 0) {
        alert('❌ No hay registros eliminados para exportar.');
        return;
    }

    const datos = solicitudesEliminadas.map(e => ({
        FechaOriginal: e.fecha || '',
        Usuario: e.nombre || '',
        Sector: e.sector || '',
        Tipo: e.tipo || '',
        Urgencia: e.urgencia || '',
        Estado: e.estado || '',
        FechaEliminacion: e.fechaEliminacion || '',
        EliminadoPor: e.eliminadoPor || '',
        Motivo: e.motivo || ''
    }));

    const ws = XLSX.utils.json_to_sheet(datos);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Eliminados');
    const fecha = new Date().toISOString().slice(0, 10);
    XLSX.writeFile(wb, `registros_eliminados_${fecha}.xlsx`);
}

function exportarUsuariosAExcel() {
    if (typeof XLSX === 'undefined') {
        alert('❌ No se pudo exportar porque la librería de Excel no está disponible.');
        return;
    }
    const lista = (usuarios || []).concat(usuariosAgregados || []);
    if (lista.length === 0) {
        alert('❌ No hay usuarios para exportar.');
        return;
    }

    const datos = lista.map(u => ({
        Nombre: u.nombre || '',
        Usuario: u.usuario || '',
        Correo: u.email || '',
        Rol: u.rol === 'lider' ? 'Líder' : 'Ciudadano',
        FechaRegistro: u.fechaRegistro || ''
    }));

    const ws = XLSX.utils.json_to_sheet(datos);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Usuarios');
    const fecha = new Date().toISOString().slice(0, 10);
    XLSX.writeFile(wb, `usuarios_${fecha}.xlsx`);
}

// ===== DONACIONES =====
function guardarDonaciones() {
    try {
        localStorage.setItem('donaciones', JSON.stringify(donaciones));
        console.log('Donaciones guardadas en localStorage:', donaciones.length);
    } catch (error) {
        console.error('Error al guardar donaciones:', error);
        alert('❌ No se pudo guardar la donación. El almacenamiento local puede estar lleno.');
    }
}

function abrirModalDonar() {
    const modal = document.getElementById('modal-donar');
    if (!modal) {
        console.error('Modal de donación no encontrado');
        return;
    }
    console.log('Abriendo modal de donación...');
    document.getElementById('formulario-donacion').reset();
    document.getElementById('don-sector').value = usuarioActual ? (usuarioActual.sector || usuarioActual.direccion || '') : '';
    document.getElementById('don-solicitud').innerHTML = '<option value="">-- Sin vinculación --</option>';
    (solicitudes || []).forEach(s => {
        const option = document.createElement('option');
        option.value = s.id;
        option.textContent = `${s.fecha} - ${s.sector} - ${s.tipo} - ${s.nombre || ''}`;
        document.getElementById('don-solicitud').appendChild(option);
    });
    modal.style.display = 'flex';
    console.log('Modal de donación abierto');
}

function cerrarModalDonar() {
    const modal = document.getElementById('modal-donar');
    if (modal) modal.style.display = 'none';
}

function eliminarSolicitud(solicitudId) {
    const solicitud = solicitudes.find(s => Number(s.id) === Number(solicitudId));
    if (!solicitud) {
        alert('❌ No se encontró la solicitud');
        return;
    }

    const motivo = prompt('Motivo de eliminación (opcional):', 'Solicitud eliminada por el administrador');
    if (motivo === null) return;

    solicitudesEliminadas.push({
        ...solicitud,
        fechaEliminacion: new Date().toLocaleDateString('es-ES'),
        eliminadoPor: usuarioActual ? usuarioActual.nombre : 'Desconocido',
        motivo: motivo || 'Sin motivo'
    });
    guardarSolicitudesEliminadas();

    solicitudes = solicitudes.filter(s => Number(s.id) !== Number(solicitudId));
    guardarSolicitudes();

    actualizarEstadisticas();
    actualizarTablasAdmin();
    alert('✅ Registro eliminado correctamente');
}

function abrirModalMisDonaciones() {
    const modal = document.getElementById('modal-mis-donaciones');
    if (!modal) return;
    actualizarTablaMisDonaciones();
    modal.style.display = 'flex';
}

function cerrarModalMisDonaciones() {
    const modal = document.getElementById('modal-mis-donaciones');
    if (modal) modal.style.display = 'none';
}

function manejarDonacion(e) {
    e.preventDefault();
    const tipo = document.getElementById('don-tipo').value;
    const categoria = document.getElementById('don-categoria').value;
    const monto = document.getElementById('don-monto').value ? Number(document.getElementById('don-monto').value) : null;
    const descripcionBienes = document.getElementById('don-bienes').value || '';
    const sector = document.getElementById('don-sector').value;
    const solicitudId = document.getElementById('don-solicitud').value ? Number(document.getElementById('don-solicitud').value) : null;

    console.log('Intentando guardar donacion:', { tipo, categoria, monto, sector, solicitudId });
    
    if (!tipo || !categoria || !sector) {
        alert('❌ Completa los campos obligatorios');
        return;
    }

    const nuevaDonacion = {
        id: Date.now(),
        fecha: new Date().toLocaleDateString('es-ES'),
        donante: usuarioActual ? usuarioActual.nombre : 'Anónimo',
        email: usuarioActual ? usuarioActual.email : '',
        telefono: usuarioActual ? (usuarioActual.telefono || '') : '',
        tipo,
        categoria,
        monto: null,
        descripcionBienes,
        sector,
        coordenadas: { ...coordenadas },
        solicitudId,
        estado: 'Pendiente',
        usuarioId: usuarioActual ? usuarioActual.id : null
    };

    console.log('Nueva donacion creada:', nuevaDonacion);

    if (firebaseEnabled && db) {
        console.log('Guardando en Firebase...');
        firebaseAgregarDonacion(nuevaDonacion);
    } else {
        console.log('Guardando localmente...');
        donaciones.push(nuevaDonacion);
        guardarDonaciones();
        console.log('Donaciones guardadas:', donaciones.length);
    }

    alert('✅ Donación registrada exitosamente');
    cerrarModalDonar();
}

function actualizarTablaMisDonaciones() {
    const tabla = document.getElementById('tabla-mis-donaciones-cuerpo');
    if (!tabla) return;
    tabla.innerHTML = '';

    const misDonaciones = donaciones.filter(d => usuarioActual && d.usuarioId === usuarioActual.id);

    if (misDonaciones.length === 0) {
        const tr = document.createElement('tr');
        const td = document.createElement('td');
        td.colSpan = 5;
        td.style.textAlign = 'center';
        td.style.color = '#999';
        td.textContent = 'No hay donaciones registradas';
        tr.appendChild(td);
        tabla.appendChild(tr);
        return;
    }

    misDonaciones.forEach(d => {
        const tr = document.createElement('tr');
        const tdFecha = document.createElement('td'); tdFecha.textContent = d.fecha; tr.appendChild(tdFecha);
        const tdTipo = document.createElement('td'); tdTipo.textContent = d.tipo; tr.appendChild(tdTipo);
        const tdCat = document.createElement('td'); tdCat.textContent = d.categoria; tr.appendChild(tdCat);
        const tdMonto = document.createElement('td'); tdMonto.textContent = d.monto ? `$${d.monto}` : (d.descripcionBienes || '-'); tr.appendChild(tdMonto);
        const tdEstado = document.createElement('td');
        const spanEstado = document.createElement('span');
        const estadoClase = d.estado === 'Recibida' ? 'badge badge-success' : d.estado === 'Rechazada' ? 'badge badge-danger' : 'badge badge-info';
        spanEstado.className = estadoClase;
        spanEstado.textContent = d.estado;
        tdEstado.appendChild(spanEstado);
        tr.appendChild(tdEstado);
        tabla.appendChild(tr);
    });
}

function actualizarTablaDonaciones() {
    const tabla = document.getElementById('tabla-donaciones-cuerpo');
    if (!tabla) return;
    tabla.innerHTML = '';
    const busqueda = document.getElementById('filtro-donaciones')?.value.toLowerCase() || '';
    const filtroEstado = document.getElementById('filtro-don-estado')?.value || '';

    let donacionesFiltradas = donaciones.slice();

    if (busqueda) {
        donacionesFiltradas = donacionesFiltradas.filter(d =>
            (d.donante || '').toLowerCase().includes(busqueda) ||
            (d.categoria || '').toLowerCase().includes(busqueda)
        );
    }

    if (filtroEstado) {
        donacionesFiltradas = donacionesFiltradas.filter(d => d.estado === filtroEstado);
    }

    if (donacionesFiltradas.length === 0) {
        const tr = document.createElement('tr');
        const td = document.createElement('td');
        td.colSpan = 7; td.style.textAlign = 'center'; td.style.color = '#999'; td.textContent = 'No hay donaciones';
        tr.appendChild(td);
        tabla.appendChild(tr);
        return;
    }

    donacionesFiltradas.forEach(d => {
        const tr = document.createElement('tr');
        const tdFecha = document.createElement('td'); tdFecha.textContent = d.fecha; tr.appendChild(tdFecha);
        const tdDonante = document.createElement('td'); tdDonante.textContent = d.donante; tr.appendChild(tdDonante);
        const tdTipo = document.createElement('td'); tdTipo.textContent = d.tipo; tr.appendChild(tdTipo);
        const tdCat = document.createElement('td'); tdCat.textContent = d.categoria; tr.appendChild(tdCat);
        const tdMonto = document.createElement('td'); tdMonto.textContent = d.monto ? `$${d.monto}` : (d.descripcionBienes || '-'); tr.appendChild(tdMonto);
        const tdEstado = document.createElement('td');
        const spanEstado = document.createElement('span');
        const estadoClase = d.estado === 'Recibida' ? 'badge badge-success' : d.estado === 'Rechazada' ? 'badge badge-danger' : 'badge badge-info';
        spanEstado.className = estadoClase;
        spanEstado.textContent = d.estado;
        tdEstado.appendChild(spanEstado);
        tr.appendChild(tdEstado);
        const tdAcc = document.createElement('td');
        const select = document.createElement('select'); select.className = 'btn-cambiar-estado';
        const opt0 = document.createElement('option'); opt0.value = ''; opt0.textContent = '-- Cambiar --'; select.appendChild(opt0);
        const estados = ['Pendiente','Recibida','Rechazada'];
        estados.forEach(val => { const o = document.createElement('option'); o.value = val; o.textContent = val; select.appendChild(o); });
        select.addEventListener('change', function() { cambiarEstadoDonacion(d.id, this.value); });
        tdAcc.appendChild(select);
        tr.appendChild(tdAcc);
        tabla.appendChild(tr);
    });
}

function cambiarEstadoDonacion(donacionId, nuevoEstado) {
    if (!nuevoEstado) return;
    const donacion = donaciones.find(d => Number(d.id) === Number(donacionId));
    if (!donacion) {
        alert('❌ No se encontró la donación');
        return;
    }
    donacion.estado = nuevoEstado;
    guardarDonaciones();
    actualizarEstadisticasDonaciones();
    actualizarTablaDonaciones();
    alert('✅ Estado de donación actualizado correctamente');
}

function actualizarEstadisticasDonaciones() {
    const total = donaciones.length;
    const pendientes = donaciones.filter(d => d.estado === 'Pendiente').length;
    const recibidas = donaciones.filter(d => d.estado === 'Recibida').length;
    const montoTotal = donaciones.reduce((sum, d) => sum + (d.monto || 0), 0);

    const statTotal = document.getElementById('stat-don-total');
    const statPendientes = document.getElementById('stat-don-pendientes');
    const statRecibidas = document.getElementById('stat-don-recibidas');
    const statMonto = document.getElementById('stat-don-monto');
    if (statTotal) statTotal.textContent = total;
    if (statPendientes) statPendientes.textContent = pendientes;
    if (statRecibidas) statRecibidas.textContent = recibidas;
    if (statMonto) statMonto.textContent = `$${montoTotal}`;
}

function exportarDonacionesAExcel() {
    if (typeof XLSX === 'undefined') {
        alert('❌ No se pudo exportar porque la librería de Excel no está disponible.');
        return;
    }
    if (!donaciones || donaciones.length === 0) {
        alert('❌ No hay donaciones para exportar.');
        return;
    }

    const datos = donaciones.map(d => ({
        Fecha: d.fecha || '',
        Donante: d.donante || '',
        Tipo: d.tipo || '',
        Categoria: d.categoria || '',
        Monto: d.monto || '',
        Descripcion: d.descripcionBienes || '',
        Sector: d.sector || '',
        Estado: d.estado || ''
    }));

    const ws = XLSX.utils.json_to_sheet(datos);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Donaciones');
    const fecha = new Date().toISOString().slice(0, 10);
    XLSX.writeFile(wb, `donaciones_${fecha}.xlsx`);
}

// ABRIR / CERRAR VENTANA MODAL DE ACERCA DE
function abrirModalAcerca() {
    const modal = document.getElementById('modal-acerca');
    if (modal) modal.style.display = 'flex';
}

function cerrarModalAcerca() {
    const modal = document.getElementById('modal-acerca');
    if (modal) modal.style.display = 'none';
}

// ABRIR / CERRAR VENTANA MODAL DE USUARIOS REGISTRADOS
async function abrirModalUsuarios() {
    const modal = document.getElementById('modal-usuarios');
    if (!modal) return;
    
    usuarios = JSON.parse(localStorage.getItem('usuarios')) || [];
    usuariosAgregados = JSON.parse(localStorage.getItem('usuariosAgregados')) || [];
    
    if (firebaseEnabled && db) {
        try {
            const snapshot = await db.ref('usuarios').once('value');
            if (snapshot.exists()) {
                usuarios = [];
                snapshot.forEach(child => {
                    usuarios.push({ id: child.key, docId: child.key, ...child.val() });
                    return false;
                });
                localStorage.setItem('usuarios', JSON.stringify(usuarios));
            }
        } catch (error) {
            console.error('Error al cargar usuarios desde Firebase:', error);
        }
    }
    
    actualizarTablaUsuarios();
    modal.style.display = 'flex';
}

function cerrarModalUsuarios() {
    const modal = document.getElementById('modal-usuarios');
    if (modal) modal.style.display = 'none';
}

// AGREGAR NUEVO USUARIO
async function manejarAgregarUsuario(e) {
    e.preventDefault();
    
    const nombre = document.getElementById('agregar-nombre').value.trim();
    const usuario = document.getElementById('agregar-usuario').value.trim();
    const email = document.getElementById('agregar-email').value.trim();
    const password = document.getElementById('agregar-password').value;
    const rol = document.getElementById('agregar-rol').value;
    
    if (!nombre || !usuario || !email || !password) {
        alert('❌ Por favor completa todos los campos');
        return;
    }
    
    if (usuario.length < 3) {
        alert('❌ El usuario debe tener al menos 3 caracteres');
        return;
    }
    
    if (password.length < 4) {
        alert('❌ La contraseña debe tener al menos 4 caracteres');
        return;
    }
    
    const existeUsuario = usuarios.find(u => u.usuario === usuario);
    const existeEmail = usuarios.find(u => u.email === email);
    const existeAgregado = usuariosAgregados.find(u => u.usuario === usuario || u.email === email);
    
    if (existeUsuario || existeAgregado) {
        alert('❌ Este nombre de usuario ya está registrado');
        return;
    }
    if (existeEmail || existeAgregado) {
        alert('❌ Este correo ya está registrado');
        return;
    }
    
    const nuevoUsuario = {
        id: Date.now(),
        nombre: nombre,
        usuario: usuario,
        email: email,
        password: password,
        rol: rol,
        fechaRegistro: new Date().toLocaleDateString('es-ES'),
        agregadoPor: usuarioActual ? usuarioActual.usuario : 'admin'
    };
    
    usuariosAgregados.push(nuevoUsuario);
    localStorage.setItem('usuariosAgregados', JSON.stringify(usuariosAgregados));
    
    if (firebaseEnabled && db) {
        try {
            const ref = db.ref('usuariosAgregados').push();
            await ref.set(nuevoUsuario);
        } catch (error) {
            console.warn('No se pudo sincronizar con Firebase:', error);
        }
    }
    
    alert('✅ Usuario agregado exitosamente');
    document.getElementById('form-agregar-usuario').reset();
    actualizarTablaUsuarios();
}

// FUNCIÓN PARA ACTUALIZAR LA TABLA
function actualizarTabla() {
    const tablaCuerpo = document.getElementById('tabla-cuerpo');
    tablaCuerpo.innerHTML = '';

    if (!usuarioActual) {
        tablaCuerpo.appendChild(createEmptyRow('Debes iniciar sesión para ver tus solicitudes'));
        return;
    }

    // Filtrar solo las solicitudes del usuario actual
    const misSolicitudes = solicitudes.filter(s => s.usuarioId === usuarioActual.id);

    if (misSolicitudes.length === 0) {
        tablaCuerpo.appendChild(createEmptyRow('No hay solicitudes registradas'));
        return;
    }

    misSolicitudes.forEach(sol => {
        const tr = document.createElement('tr');

        const tdFecha = document.createElement('td'); tdFecha.textContent = sol.fecha; tr.appendChild(tdFecha);
        const tdTipo = document.createElement('td'); tdTipo.textContent = sol.tipo; tr.appendChild(tdTipo);
        const tdSector = document.createElement('td'); tdSector.textContent = sol.sector; tr.appendChild(tdSector);
        const tdEstado = document.createElement('td');
        const spanEstado = document.createElement('span');
        const estadoClase = sol.estado === 'Aprobada' ? 'badge badge-success' : sol.estado === 'En proceso' ? 'badge badge-warning' : sol.estado === 'Completada' ? 'badge badge-purple' : 'badge badge-info';
        spanEstado.className = estadoClase;
        spanEstado.textContent = sol.estado;
        tdEstado.appendChild(spanEstado);
        tr.appendChild(tdEstado);
        const tdUrg = document.createElement('td');
        const spanUrg = document.createElement('span'); spanUrg.className = `urgencia-${sol.urgencia}`; spanUrg.textContent = sol.urgencia.toUpperCase(); tdUrg.appendChild(spanUrg); tr.appendChild(tdUrg);

        tablaCuerpo.appendChild(tr);
    });
}

function createEmptyRow(message) {
    const tr = document.createElement('tr');
    const td = document.createElement('td');
    td.colSpan = 5;
    td.style.textAlign = 'center';
    td.style.color = '#999';
    td.textContent = message;
    tr.appendChild(td);
    return tr;
}

// ACTUALIZAR ESTADÍSTICAS DEL PANEL ADMIN
function actualizarEstadisticas() {
    const total = solicitudes.length;
    const enRevision = solicitudes.filter(s => s.estado === 'En revisión').length;
    const aprobadas = solicitudes.filter(s => s.estado === 'Aprobada').length;
    const criticas = solicitudes.filter(s => s.urgencia === 'critica').length;
    
    document.getElementById('stat-total').textContent = total;
    document.getElementById('stat-revision').textContent = enRevision;
    document.getElementById('stat-aprobadas').textContent = aprobadas;
    document.getElementById('stat-criticas').textContent = criticas;
}

// ACTUALIZAR TABLAS DEL PANEL ADMIN
function actualizarTablasAdmin() {
    console.log('actualizarTablasAdmin llamada. solicitudes.length:', solicitudes.length);
    const tabSolicitudes = document.getElementById('tab-solicitudes');
    const tabEliminados = document.getElementById('tab-eliminados');
    const tabDonaciones = document.getElementById('tab-donaciones');
    const tabUsuarios = document.getElementById('tab-usuarios');

    if (tabSolicitudes) {
        tabSolicitudes.classList.add('active');
        tabSolicitudes.style.display = 'block';
    }
    if (tabEliminados) {
        tabEliminados.classList.remove('active');
        tabEliminados.style.display = 'none';
    }
    if (tabDonaciones) {
        tabDonaciones.classList.remove('active');
        tabDonaciones.style.display = 'none';
    }
    if (tabUsuarios) {
        tabUsuarios.classList.remove('active');
        tabUsuarios.style.display = 'none';
    }

    const tabla = document.getElementById('tabla-admin-cuerpo');
    const contenedorEliminados = document.getElementById('contenedor-eliminados');
    if (!tabla || !contenedorEliminados) {
        console.log('actualizarTablasAdmin: tabla o contenedor eliminados no encontrado');
        return;
    }

    if (tabla) {
        tabla.style.display = '';
        tabla.style.visibility = 'visible';
    }
    if (contenedorEliminados) {
        contenedorEliminados.style.display = 'none';
    }

    const titulo = document.getElementById('titulo-seccion-admin');
    if (titulo) titulo.textContent = 'Solicitudes';

    tabla.innerHTML = '';
    const busqueda = document.getElementById('filtro-busqueda')?.value.toLowerCase() || '';
    const filtroEstado = document.getElementById('filtro-estado')?.value || '';

    let solicitudesFiltradas = solicitudes.slice();

    solicitudesFiltradas.sort((a, b) => {
        const fechaA = new Date(a.fecha || 0);
        const fechaB = new Date(b.fecha || 0);
        return fechaB - fechaA;
    });

    if (busqueda) {
        solicitudesFiltradas = solicitudesFiltradas.filter(s =>
            (s.sector || '').toLowerCase().includes(busqueda) ||
            (s.nombre || '').toLowerCase().includes(busqueda)
        );
    }

    if (filtroEstado) {
        solicitudesFiltradas = solicitudesFiltradas.filter(s => s.estado === filtroEstado);
    }

    adminSolicitudesFiltradas = solicitudesFiltradas;

    const totalPaginas = Math.max(1, Math.ceil(adminSolicitudesFiltradas.length / adminRegistrosPorPagina));
    if (adminPaginaActual > totalPaginas) {
        adminPaginaActual = totalPaginas;
    }
    const inicio = (adminPaginaActual - 1) * adminRegistrosPorPagina;
    const solicitudesPaginadas = adminSolicitudesFiltradas.slice(inicio, inicio + adminRegistrosPorPagina);

    if (solicitudesPaginadas.length === 0) {
        const tr = document.createElement('tr');
        const td = document.createElement('td');
        td.colSpan = 9; td.style.textAlign = 'center'; td.style.color = '#999'; td.textContent = 'No hay solicitudes';
        tr.appendChild(td);
        tabla.appendChild(tr);
        console.log('Tabla admin: sin solicitudes filtradas');
        actualizarPaginacionAdmin(totalPaginas);
        return;
    }

    console.log('Tabla admin: renderizando', solicitudesPaginadas.length, 'filas de', adminSolicitudesFiltradas.length);
    solicitudesPaginadas.forEach((sol, index) => {
        const tr = document.createElement('tr');

        const tdNumero = document.createElement('td'); tdNumero.textContent = inicio + index + 1; tr.appendChild(tdNumero);
        const tdFecha = document.createElement('td'); tdFecha.textContent = sol.fecha; tr.appendChild(tdFecha);
        const tdNombre = document.createElement('td'); tdNombre.textContent = sol.nombre; tr.appendChild(tdNombre);
        const tdSector = document.createElement('td'); tdSector.textContent = sol.sector; tr.appendChild(tdSector);
        const tdTipo = document.createElement('td'); tdTipo.textContent = sol.tipo; tr.appendChild(tdTipo);
        const tdEntidad = document.createElement('td');
        const selectEntidad = document.createElement('select'); selectEntidad.className = 'btn-cambiar-estado';
        const entidades = ['','Policía Nacional del Ecuador / Segura EP','CNEL EP','Municipio de Guayaquil','Interagua','Cuerpo de Bomberos de Guayaquil / Secretaría Nacional de Gestión de Riesgos','Dirección de Aseo Cantonal y Servicios Especiales','Dirección de Obras Públicas del Municipio de Guayaquil','Otro'];
        entidades.forEach(val => { const o = document.createElement('option'); o.value = val; o.textContent = val || '-- Seleccionar --'; selectEntidad.appendChild(o); });
        selectEntidad.value = sol.entidadResponsable || '';
        selectEntidad.addEventListener('change', function() {
            console.log('Cambio entidad directo:', sol.id, this.value);
            cambiarEntidadResponsable(sol.id, this.value);
        });
        tdEntidad.appendChild(selectEntidad);
        tr.appendChild(tdEntidad);
        const tdUrg = document.createElement('td'); const spanUrg = document.createElement('span'); spanUrg.className = `urgencia-${sol.urgencia}`; spanUrg.textContent = sol.urgencia.toUpperCase(); tdUrg.appendChild(spanUrg); tr.appendChild(tdUrg);
        const tdEstado = document.createElement('td');
        const spanEstado = document.createElement('span');
        const estadoClaseAdmin = sol.estado === 'Aprobada' ? 'badge badge-success' : sol.estado === 'En proceso' ? 'badge badge-warning' : sol.estado === 'Completada' ? 'badge badge-purple' : 'badge badge-info';
        spanEstado.className = estadoClaseAdmin;
        spanEstado.textContent = sol.estado;
        tdEstado.appendChild(spanEstado);
        tr.appendChild(tdEstado);
        const tdImagen = document.createElement('td');
        if (sol.foto) {
            const img = document.createElement('img');
            img.src = sol.foto;
            img.alt = 'Foto de la necesidad';
            img.style.maxWidth = '50px';
            img.style.maxHeight = '50px';
            img.style.borderRadius = '6px';
            img.style.cursor = 'pointer';
            img.title = 'Ver imagen';
            img.addEventListener('click', () => {
                const win = window.open();
                win.document.write(`<img src="${sol.foto}" style="max-width:100%;">`);
            });
            tdImagen.appendChild(img);
        } else {
            tdImagen.textContent = '-';
        }
        tr.appendChild(tdImagen);
        const tdAcc = document.createElement('td');
        tdAcc.style.whiteSpace = 'nowrap';

        const select = document.createElement('select'); select.className = 'btn-cambiar-estado';
        const opt0 = document.createElement('option'); opt0.value = ''; opt0.textContent = '-- Cambiar --'; select.appendChild(opt0);
        const estados = ['En revisión','Aprobada','En proceso','Completada'];
        estados.forEach(val => { const o = document.createElement('option'); o.value = val; o.textContent = val; select.appendChild(o); });
        select.addEventListener('change', function() {
            console.log('Cambio estado directo:', sol.id, this.value);
            cambiarEstadoSolicitud(sol.id, this.value);
        });
        tdAcc.appendChild(select);

        const btnEliminar = document.createElement('button');
        btnEliminar.textContent = '🗑';
        btnEliminar.className = 'btn-eliminar-solicitud';
        btnEliminar.title = 'Eliminar registro';
        btnEliminar.addEventListener('click', () => {
            if (confirm('¿Estás seguro de que querés eliminar este registro?')) {
                eliminarSolicitud(sol.id);
            }
        });
        tdAcc.appendChild(btnEliminar);

        tr.appendChild(tdAcc);
        tabla.appendChild(tr);
    });

    actualizarPaginacionAdmin(totalPaginas);
}

function actualizarPaginacionAdmin(totalPaginas) {
    const contenedor = document.getElementById('admin-paginacion');
    if (!contenedor) return;
    contenedor.innerHTML = '';

    if (totalPaginas <= 1) return;

    const btnAnterior = document.createElement('button');
    btnAnterior.textContent = '← Anterior';
    btnAnterior.disabled = adminPaginaActual === 1;
    btnAnterior.addEventListener('click', () => {
        if (adminPaginaActual > 1) {
            adminPaginaActual--;
            actualizarTablasAdmin();
        }
    });
    contenedor.appendChild(btnAnterior);

    const info = document.createElement('span');
    info.className = 'admin-paginacion-info';
    info.textContent = `Página ${adminPaginaActual} de ${totalPaginas}`;
    contenedor.appendChild(info);

    const btnSiguiente = document.createElement('button');
    btnSiguiente.textContent = 'Siguiente →';
    btnSiguiente.disabled = adminPaginaActual === totalPaginas;
    btnSiguiente.addEventListener('click', () => {
        if (adminPaginaActual < totalPaginas) {
            adminPaginaActual++;
            actualizarTablasAdmin();
        }
    });
    contenedor.appendChild(btnSiguiente);
}

function adjuntarEventoTablaAdmin() {
    const tabla = document.getElementById('tabla-admin-cuerpo');
    if (!tabla) return;
    tabla.addEventListener('change', (e) => {
        try {
            if (e.target && e.target.classList.contains('btn-cambiar-estado')) {
                const solicitudId = Number(e.target.dataset.solicitudId);
                const nuevoEstado = e.target.value;
                if (!solicitudId || !nuevoEstado) return;
                cambiarEstadoSolicitud(solicitudId, nuevoEstado);
            }
        } catch (error) {
            console.error('Error en event delegation tabla admin:', error);
            alert('❌ Error al actualizar el estado: ' + (error && error.message ? error.message : error));
        }
    });
}

function mostrarRegistrosEliminados() {
    const tabla = document.getElementById('tabla-admin-cuerpo');
    const contenedorEliminados = document.getElementById('contenedor-eliminados');
    if (!tabla || !contenedorEliminados) return;

    const tabSolicitudes = document.getElementById('tab-solicitudes');
    const tabEliminados = document.getElementById('tab-eliminados');
    if (tabSolicitudes) tabSolicitudes.classList.remove('active');
    if (tabEliminados) tabEliminados.classList.add('active');

    const titulo = document.getElementById('titulo-seccion-admin');
    if (titulo) titulo.textContent = 'Registros Eliminados';

    tabla.innerHTML = '';
    tabla.style.display = 'none';
    contenedorEliminados.style.display = 'block';
    contenedorEliminados.innerHTML = '';

    if (solicitudesEliminadas.length === 0) {
        const div = document.createElement('div');
        div.style.textAlign = 'center';
        div.style.padding = '40px';
        div.style.color = '#999';
        div.textContent = 'No hay registros eliminados';
        contenedorEliminados.appendChild(div);
        return;
    }

    solicitudesEliminadas.forEach(eliminado => {
        const div = document.createElement('div');
        div.className = 'registro-eliminado-item';
        div.innerHTML = `
            <div class="registro-eliminado-header">
                <strong>${eliminado.nombre || 'Sin nombre'}</strong>
                <span class="fecha-eliminado">Eliminado: ${eliminado.fechaEliminacion}</span>
            </div>
            <div class="registro-eliminado-body">
                <p><strong>Sector:</strong> ${eliminado.sector || '-'}</p>
                <p><strong>Tipo:</strong> ${eliminado.tipo || '-'}</p>
                <p><strong>Entidad Responsable:</strong> ${eliminado.entidadResponsable || '-'}</p>
                <p><strong>Urgencia:</strong> ${eliminado.urgencia || '-'}</p>
                <p><strong>Eliminado por:</strong> ${eliminado.eliminadoPor || '-'}</p>
                <p><strong>Motivo:</strong> ${eliminado.motivo || 'Sin motivo'}</p>
            </div>
        `;
        contenedorEliminados.appendChild(div);
    });
}

// ACTUALIZAR TABLA DE USUARIOS REGISTRADOS (PANEL ADMIN)
function actualizarTablaUsuarios() {
    const tabla = document.getElementById('tabla-usuarios-cuerpo');
    if (!tabla) return;
    tabla.innerHTML = '';
    console.log('Actualizando tabla de usuarios. Total usuarios:', usuarios.length, 'Total agregados:', usuariosAgregados.length);

    const busqueda = document.getElementById('filtro-usuarios')?.value.toLowerCase() || '';
    let lista = usuarios.slice().concat(usuariosAgregados.slice());

    if (busqueda) {
        lista = lista.filter(u =>
            (u.nombre || '').toLowerCase().includes(busqueda) ||
            (u.email || '').toLowerCase().includes(busqueda) ||
            (u.usuario || '').toLowerCase().includes(busqueda)
        );
    }

    usuariosListaFiltrada = lista;

    const totalPaginas = Math.max(1, Math.ceil(usuariosListaFiltrada.length / usuariosRegistrosPorPagina));
    if (usuariosPaginaActual > totalPaginas) {
        usuariosPaginaActual = totalPaginas;
    }
    const inicio = (usuariosPaginaActual - 1) * usuariosRegistrosPorPagina;
    const usuariosPaginados = usuariosListaFiltrada.slice(inicio, inicio + usuariosRegistrosPorPagina);

    if (usuariosPaginados.length === 0) {
        const tr = document.createElement('tr');
        const td = document.createElement('td');
        td.colSpan = 6;
        td.style.textAlign = 'center';
        td.style.color = '#999';
        td.textContent = usuariosListaFiltrada.length === 0 ? 'No hay usuarios registrados' : 'Sin coincidencias';
        tr.appendChild(td);
        tabla.appendChild(tr);
        actualizarPaginacionUsuarios(totalPaginas);
        return;
    }

    usuariosPaginados.forEach(u => {
        const tr = document.createElement('tr');

        const tdNombre = document.createElement('td'); tdNombre.textContent = u.nombre || '-'; tr.appendChild(tdNombre);
        const tdUsuario = document.createElement('td'); tdUsuario.textContent = u.usuario || '-'; tr.appendChild(tdUsuario);
        const tdEmail = document.createElement('td'); tdEmail.textContent = u.email || '-'; tr.appendChild(tdEmail);
        const tdRol = document.createElement('td');
        const spanRol = document.createElement('span');
        const esLider = u.rol === 'lider';
        spanRol.className = esLider ? 'rol-lider' : 'rol-ciudadano';
        spanRol.textContent = esLider ? '👨‍💼 Líder' : '👤 Ciudadano';
        tdRol.appendChild(spanRol);
        tr.appendChild(tdRol);
        const tdFecha = document.createElement('td'); tdFecha.textContent = u.fechaRegistro || '-'; tr.appendChild(tdFecha);
        
        const tdAcciones = document.createElement('td');
        const selectRol = document.createElement('select');
        selectRol.className = 'btn-cambiar-estado';
        const optLider = document.createElement('option');
        optLider.value = 'lider';
        optLider.textContent = 'Líder';
        const optCiudadano = document.createElement('option');
        optCiudadano.value = 'ciudadano';
        optCiudadano.textContent = 'Ciudadano';
        selectRol.appendChild(optLider);
        selectRol.appendChild(optCiudadano);
        selectRol.value = u.rol || 'ciudadano';
        selectRol.addEventListener('change', function() {
            cambiarRolUsuario(u, this.value);
        });
        tdAcciones.appendChild(selectRol);
        tr.appendChild(tdAcciones);

        tabla.appendChild(tr);
    });

    actualizarPaginacionUsuarios(totalPaginas);
}

function actualizarPaginacionUsuarios(totalPaginas) {
    const contenedor = document.getElementById('usuarios-paginacion');
    if (!contenedor) return;
    contenedor.innerHTML = '';

    if (totalPaginas <= 1) return;

    const btnAnterior = document.createElement('button');
    btnAnterior.textContent = '← Anterior';
    btnAnterior.disabled = usuariosPaginaActual === 1;
    btnAnterior.addEventListener('click', () => {
        if (usuariosPaginaActual > 1) {
            usuariosPaginaActual--;
            actualizarTablaUsuarios();
        }
    });
    contenedor.appendChild(btnAnterior);

    const info = document.createElement('span');
    info.className = 'admin-paginacion-info';
    info.textContent = `Página ${usuariosPaginaActual} de ${totalPaginas}`;
    contenedor.appendChild(info);

    const btnSiguiente = document.createElement('button');
    btnSiguiente.textContent = 'Siguiente →';
    btnSiguiente.disabled = usuariosPaginaActual === totalPaginas;
    btnSiguiente.addEventListener('click', () => {
        if (usuariosPaginaActual < totalPaginas) {
            usuariosPaginaActual++;
            actualizarTablaUsuarios();
        }
    });
    contenedor.appendChild(btnSiguiente);
}

async function cambiarRolUsuario(usuario, nuevoRol) {
    if (!usuario || !nuevoRol) return;
    
    usuario.rol = nuevoRol;
    
    const idxUsuarios = usuarios.findIndex(u => String(u.id) === String(usuario.id));
    if (idxUsuarios >= 0) {
        usuarios[idxUsuarios].rol = nuevoRol;
        localStorage.setItem('usuarios', JSON.stringify(usuarios));
    }
    
    const idxAgregados = usuariosAgregados.findIndex(u => String(u.id) === String(usuario.id));
    if (idxAgregados >= 0) {
        usuariosAgregados[idxAgregados].rol = nuevoRol;
        localStorage.setItem('usuariosAgregados', JSON.stringify(usuariosAgregados));
    }
    
    if (firebaseEnabled && db && usuario.docId) {
        try {
            await db.ref('usuarios/' + usuario.docId).update({ rol: nuevoRol });
        } catch (error) {
            console.warn('No se pudo actualizar el rol en Firebase:', error);
        }
    }
    
    if (usuarioActual && String(usuarioActual.id) === String(usuario.id)) {
        usuarioActual.rol = nuevoRol;
        localStorage.setItem('usuarioActual', JSON.stringify(usuarioActual));
        const usuarioRolSpan = document.getElementById('usuario-rol');
        if (usuarioRolSpan) {
            usuarioRolSpan.textContent = nuevoRol === 'lider' ? 'Usted es Líder Comunitario' : '';
        }
        actualizarVisibilidadFirebase();
    }
    
    actualizarTablaUsuarios();
    actualizarTablasAdmin();
    alert('✅ Rol actualizado correctamente');
}

// CAMBIAR ESTADO DE SOLICITUD (SOLO LÍDERES)
async function cambiarEstadoSolicitud(solicitudId, nuevoEstado) {
    if (!nuevoEstado) return;

    const idNum = Number(solicitudId);
    let solicitud = solicitudes.find(s => Number(s.id) === idNum || String(s.id) === String(solicitudId));
    console.log('Cambiar estado:', solicitudId, nuevoEstado, 'encontrada:', !!solicitud);
    if (!solicitud) {
        if (firebaseEnabled && db) {
            try {
                const snapshot = await db.ref('solicitudes').once('value');
                const lista = [];
                if (snapshot.exists()) {
                    snapshot.forEach(child => {
                        lista.push({ id: child.key, docId: child.key, ...child.val() });
                        return false;
                    });
                }
                solicitudes = lista;
                guardarSolicitudes();
                solicitud = solicitudes.find(s => Number(s.id) === idNum || String(s.id) === String(solicitudId));
                console.log('Solicitud recargada desde Firebase:', !!solicitud, 'total:', solicitudes.length);
            } catch (error) {
                console.error('Error al recargar solicitudes desde Firebase:', error);
            }
        }
    }

    if (!solicitud) {
        alert('❌ No se encontró la solicitud');
        return;
    }

    solicitud.estado = nuevoEstado;
    guardarSolicitudes();
    if (firebaseEnabled && db && solicitud.docId) {
        await db.ref('solicitudes/' + solicitud.docId).update({ estado: nuevoEstado })
            .catch(error => console.error('Error actualizando estado en Firebase:', error));
    }
    adminPaginaActual = 1;
    actualizarEstadisticas();
    actualizarTablasAdmin();
    alert('✅ Estado actualizado correctamente');
}

async function cambiarEntidadResponsable(solicitudId, nuevaEntidad) {
    const idNum = Number(solicitudId);
    let solicitud = solicitudes.find(s => Number(s.id) === idNum || String(s.id) === String(solicitudId));
    if (!solicitud) {
        alert('❌ No se encontró la solicitud');
        return;
    }

    solicitud.entidadResponsable = nuevaEntidad;
    guardarSolicitudes();
    if (firebaseEnabled && db && solicitud.docId) {
        await db.ref('solicitudes/' + solicitud.docId).update({ entidadResponsable: nuevaEntidad })
            .catch(error => console.error('Error actualizando entidad en Firebase:', error));
    }
    adminPaginaActual = 1;
    actualizarTablasAdmin();
    alert('✅ Entidad responsable actualizada');
}

// INICIALIZAR AL CARGAR LA PÁGINA
// (Ya hecho en el evento DOMContentLoaded al principio)

// AGREGAR ESTILOS DINÁMICOS
function agregarEstilosDinamicos() {
    const style = document.createElement('style');
    style.textContent = `
        .estado {
            background: #ffc107;
            color: #000;
            padding: 5px 10px;
            border-radius: 3px;
            font-size: 0.9rem;
            font-weight: 700;
        }
        
        .urgencia-baja {
            color: #0077a8;
            font-weight: 700;
            background: #eef9fd;
            padding: 4px 8px;
            border-radius: 3px;
        }
        
        .urgencia-media {
            color: #ff8c00;
            font-weight: 700;
            background: #fff3e0;
            padding: 4px 8px;
            border-radius: 3px;
        }
        
        .urgencia-alta {
            color: #d32f2f;
            font-weight: 700;
            background: #ffebee;
            padding: 4px 8px;
            border-radius: 3px;
        }
        
        .urgencia-critica {
            color: #8b0000;
            font-weight: 700;
            background: #ffe0e0;
            padding: 4px 8px;
            border-radius: 3px;
        }
    `;
    document.head.appendChild(style);
}
