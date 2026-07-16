// VARIABLES GLOBALES
let usuarios = JSON.parse(localStorage.getItem('usuarios')) || [];
let solicitudes = JSON.parse(localStorage.getItem('solicitudes')) || [];
let usuarioActual = JSON.parse(localStorage.getItem('usuarioActual')) || null;
let coordenadas = {
    lat: null,
    lon: null
};

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
let firebaseEnabled = false;

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
        localStorage.setItem('solicitudes', JSON.stringify(solicitudes));
        if (usuarioActual) {
            actualizarTabla();
            if (usuarioActual.rol === 'lider') {
                actualizarEstadisticas();
                actualizarTablasAdmin();
            }
        }
    }, error => console.error('Error cargando solicitudes desde Firebase:', error));
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
        console.warn('⚠️ Cuenta guardada solo en este dispositivo (no se sincronizó con Firebase):',
            error && error.message ? error.message : error);
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

// VERIFICAR SI HAY USUARIO LOGUEADO
document.addEventListener('DOMContentLoaded', async function() {
    await initFirebase();
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

    // MENÚ HAMBURGUESA (MÓVIL)
    const menuToggle = document.getElementById('menu-toggle');
    const navMenu = document.getElementById('nav-menu');
    if (menuToggle && navMenu) {
        menuToggle.addEventListener('click', () => {
            navMenu.classList.toggle('active');
            menuToggle.classList.toggle('active');
        });
        navMenu.querySelectorAll('a').forEach(link => {
            link.addEventListener('click', () => {
                navMenu.classList.remove('active');
                menuToggle.classList.remove('active');
            });
        });
    }
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
    
    // LISTENERS DEL PANEL ADMIN
    const filtroUBusqueda = document.getElementById('filtro-busqueda');
    const filtroEstado = document.getElementById('filtro-estado');
    const filtroUsuarios = document.getElementById('filtro-usuarios');
    if (filtroUBusqueda) filtroUBusqueda.addEventListener('keyup', actualizarTablasAdmin);
    if (filtroEstado) filtroEstado.addEventListener('change', actualizarTablasAdmin);
    if (filtroUsuarios) filtroUsuarios.addEventListener('keyup', actualizarTablaUsuarios);
    
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

// MANEJAR LOGIN
async function manejarLogin(e) {
    e.preventDefault();
    
    const usuarioOEmail = document.getElementById('login-username').value.trim();
    const password = document.getElementById('login-password').value;
    
    let usuario = null;
    
    // BUSCAR EN FIREBASE (FUENTE DE VERDAD) SI ESTÁ CONECTADO
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
            usuario = lista.find(u => 
                (u.usuario === usuarioOEmail || u.email === usuarioOEmail) && 
                u.password === password
            );
        } catch (error) {
            console.error('Error al consultar Firebase en login:', error);
        }
    }
    
    // RESPALDO LOCAL (si Firebase no está disponible)
    if (!usuario) {
        usuario = usuarios.find(u => 
            (u.usuario === usuarioOEmail || u.email === usuarioOEmail) && 
            u.password === password
        );
    }
    
    if (usuario) {
        // GUARDAR SESIÓN
        usuarioActual = usuario;
        localStorage.setItem('usuarioActual', JSON.stringify(usuarioActual));
        
        // MOSTRAR PÁGINA PRINCIPAL
        mostrarPaginaPrincipal();
        
        // LIMPIAR CAMPOS
        document.getElementById('form-login').reset();
    } else {
        alert('❌ Usuario/Correo o contraseña incorrectos');
        document.getElementById('login-username').focus();
    }
}

// MANEJAR REGISTRO
async function manejarRegistro(e) {
    e.preventDefault();
    
    const nombre = document.getElementById('registro-nombre').value;
    const usuario = document.getElementById('registro-usuario').value;
    const email = document.getElementById('registro-email').value;
    const password = document.getElementById('registro-password').value;
    const passwordConfirm = document.getElementById('registro-password-confirm').value;
    const rol = document.getElementById('registro-rol').value;
    
    // VALIDACIONES
    if (usuario.length < 3) {
        alert('❌ El usuario debe tener al menos 3 caracteres');
        return;
    }
    
    if (!/^[a-zA-Z0-9_]+$/.test(usuario)) {
        alert('❌ El usuario solo puede contener letras, números y guion bajo (_)');
        return;
    }
    
    if (password !== passwordConfirm) {
        alert('❌ Las contraseñas no coinciden');
        return;
    }
    
    if (password.length < 4) {
        alert('❌ La contraseña debe tener al menos 4 caracteres');
        return;
    }
    
    // VALIDAR QUE EL USUARIO NO EXISTA (LOCAL)
    if (usuarios.find(u => u.usuario === usuario)) {
        alert('❌ Este nombre de usuario ya está registrado');
        return;
    }
    
    if (usuarios.find(u => u.email === email)) {
        alert('❌ Este correo ya está registrado');
        return;
    }
    
    // VERIFICAR CONTRA LA NUBE (no bloquea el ingreso si falla la red)
    if (firebaseEnabled && db) {
        try {
            const snapshot = await db.ref('usuarios').once('value');
            let existeUsuario = false;
            let existeEmail = false;
            if (snapshot.exists()) {
                snapshot.forEach(child => {
                    const u = child.val();
                    if (u && u.usuario === usuario) existeUsuario = true;
                    if (u && u.email === email) existeEmail = true;
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
            console.warn('No se pudo verificar contra Firebase, se continua con el registro local:', error);
        }
    }

    // CREAR NUEVO USUARIO
    const nuevoUsuario = {
        id: Date.now(),
        nombre: nombre,
        usuario: usuario,
        email: email,
        password: password,
        rol: rol,
        fechaRegistro: new Date().toLocaleDateString('es-ES')
    };
    
    // GUARDAR USUARIO
    if (firebaseEnabled && db) {
        // El listener de Firebase (on 'value') ya refleja el usuario en el array,
        // así que NO hacemos push local para evitar duplicados.
        sincronizarUsuarioFirebase(nuevoUsuario);
    } else {
        // Sin Firebase: guardamos solo en este dispositivo.
        usuarios.push(nuevoUsuario);
        localStorage.setItem('usuarios', JSON.stringify(usuarios));
    }

    // INICIAR SESIÓN AUTOMÁTICAMENTE
    usuarioActual = nuevoUsuario;
    localStorage.setItem('usuarioActual', JSON.stringify(usuarioActual));

    alert('✅ Cuenta creada exitosamente. ¡Bienvenido!');
    mostrarPaginaPrincipal();
}

// CERRAR SESIÓN
function cerrarSesion() {
    if (confirm('¿Estás seguro de que deseas cerrar sesión?')) {
        usuarioActual = null;
        localStorage.removeItem('usuarioActual');
        location.reload();
    }
}

// MOSTRAR PÁGINA PRINCIPAL
function mostrarPaginaPrincipal() {
    const authSection = document.getElementById('auth-section');
    const mainContent = document.getElementById('main-content');
    
    authSection.style.display = 'none';
    mainContent.style.display = 'block';
    
    // ACTUALIZAR NOMBRE DE USUARIO
    document.getElementById('usuario-nombre').textContent = `👤 ${usuarioActual.nombre}`;
    const usuarioRolSpan = document.getElementById('usuario-rol');
    if (usuarioRolSpan) {
        usuarioRolSpan.textContent = usuarioActual.rol === 'lider' ? 'Usted es Líder Comunitario' : '';
    }
    
    // MOSTRAR/OCULTAR PANEL ADMIN
    const menuAdmin = document.getElementById('menu-admin');
    const adminPanel = document.getElementById('admin');
    
    if (usuarioActual.rol === 'lider') {
        menuAdmin.style.display = 'list-item';
        if (adminPanel) {
            adminPanel.style.display = 'block';
        }
        // Cargar datos del panel admin
        actualizarEstadisticas();
        actualizarTablasAdmin();
        actualizarTablaUsuarios();
    } else {
        menuAdmin.style.display = 'none';
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
        descripcion: document.getElementById('descripcion').value,
        urgencia: document.getElementById('urgencia').value,
        estado: 'En revisión',
        usuarioId: usuarioActual.id,
        coordenadas: {
            lat: coordenadas.lat,
            lon: coordenadas.lon
        }
    };
    
    // VERIFICAR DUPLICADO IDÉNTICO CONTRA LA NUBE (no bloquea si falla la red)
    if (firebaseEnabled && db) {
        try {
            const snapshot = await db.ref('solicitudes').once('value');
            let duplicado = false;
            if (snapshot.exists()) {
                snapshot.forEach(child => {
                    const s = child.val();
                    if (s &&
                        s.usuarioId === usuarioActual.id &&
                        s.sector === nuevaSolicitud.sector &&
                        s.tipo === nuevaSolicitud.tipo &&
                        s.descripcion === nuevaSolicitud.descripcion) {
                        duplicado = true;
                    }
                    return false;
                });
            }
            if (duplicado) {
                alert('⚠️ Ya enviaste una solicitud idéntica. No se registró de nuevo.');
                return;
            }
        } catch (error) {
            console.warn('No se pudo verificar duplicados en Firebase, se continua:', error);
        }
    }

    if (firebaseEnabled) {
        await firebaseAgregarSolicitud(nuevaSolicitud);
        // El listener de Firebase (on 'value') ya refleja el reporte en el array,
        // así que NO hacemos push local para evitar duplicados.
    } else {
        // Sin Firebase: guardamos solo en este dispositivo.
        solicitudes.push(nuevaSolicitud);
        localStorage.setItem('solicitudes', JSON.stringify(solicitudes));
    }
    
    // MOSTRAR MENSAJE DE ÉXITO
    alert('✅ ¡Solicitud registrada exitosamente!');
    
    // LIMPIAR FORMULARIO
    document.getElementById('formulario-reporte').reset();
    
    // Restaurar nombre y email del usuario
    document.getElementById('nombre').value = usuarioActual.nombre;
    document.getElementById('email').value = usuarioActual.email;
    
    // ACTUALIZAR TABLA
    actualizarTabla();
    
    // Si es un líder, actualizar el panel admin también
    if (usuarioActual.rol === 'lider') {
        actualizarEstadisticas();
        actualizarTablasAdmin();
    }
    
    // SCROLL A MIS SOLICITUDES
    setTimeout(() => scrollTo('solicitudes'), 500);
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
        const spanEstado = document.createElement('span'); spanEstado.className = 'estado'; spanEstado.textContent = sol.estado; tdEstado.appendChild(spanEstado); tr.appendChild(tdEstado);
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
    const tabla = document.getElementById('tabla-admin-cuerpo');
    tabla.innerHTML = '';
    const busqueda = document.getElementById('filtro-busqueda')?.value.toLowerCase() || '';
    const filtroEstado = document.getElementById('filtro-estado')?.value || '';

    let solicitudesFiltradas = solicitudes.slice();

    // Filtrar por búsqueda
    if (busqueda) {
        solicitudesFiltradas = solicitudesFiltradas.filter(s =>
            (s.sector || '').toLowerCase().includes(busqueda) ||
            (s.nombre || '').toLowerCase().includes(busqueda)
        );
    }

    // Filtrar por estado
    if (filtroEstado) {
        solicitudesFiltradas = solicitudesFiltradas.filter(s => s.estado === filtroEstado);
    }

    if (solicitudesFiltradas.length === 0) {
        const tr = document.createElement('tr');
        const td = document.createElement('td');
        td.colSpan = 7; td.style.textAlign = 'center'; td.style.color = '#999'; td.textContent = 'No hay solicitudes';
        tr.appendChild(td);
        tabla.appendChild(tr);
        return;
    }

    solicitudesFiltradas.forEach(sol => {
        const tr = document.createElement('tr');

        const tdFecha = document.createElement('td'); tdFecha.textContent = sol.fecha; tr.appendChild(tdFecha);
        const tdNombre = document.createElement('td'); tdNombre.textContent = sol.nombre; tr.appendChild(tdNombre);
        const tdSector = document.createElement('td'); tdSector.textContent = sol.sector; tr.appendChild(tdSector);
        const tdTipo = document.createElement('td'); tdTipo.textContent = sol.tipo; tr.appendChild(tdTipo);
        const tdUrg = document.createElement('td'); const spanUrg = document.createElement('span'); spanUrg.className = `urgencia-${sol.urgencia}`; spanUrg.textContent = sol.urgencia.toUpperCase(); tdUrg.appendChild(spanUrg); tr.appendChild(tdUrg);
        const tdEstado = document.createElement('td'); tdEstado.textContent = sol.estado; tr.appendChild(tdEstado);
        const tdAcc = document.createElement('td');

        const select = document.createElement('select'); select.className = 'btn-cambiar-estado';
        const opt0 = document.createElement('option'); opt0.value = ''; opt0.textContent = '-- Cambiar --'; select.appendChild(opt0);
        ['En revisión','Aprobada','En proceso','Completada'].forEach(val => { const o = document.createElement('option'); o.value = val; o.textContent = val; select.appendChild(o); });
        select.addEventListener('change', function() { cambiarEstadoSolicitud(sol.id, this.value); });
        tdAcc.appendChild(select);
        tr.appendChild(tdAcc);

        tabla.appendChild(tr);
    });
}

// ACTUALIZAR TABLA DE USUARIOS REGISTRADOS (PANEL ADMIN)
function actualizarTablaUsuarios() {
    const tabla = document.getElementById('tabla-usuarios-cuerpo');
    if (!tabla) return;
    tabla.innerHTML = '';

    const busqueda = document.getElementById('filtro-usuarios')?.value.toLowerCase() || '';
    let lista = usuarios.slice();

    if (busqueda) {
        lista = lista.filter(u =>
            (u.nombre || '').toLowerCase().includes(busqueda) ||
            (u.email || '').toLowerCase().includes(busqueda) ||
            (u.usuario || '').toLowerCase().includes(busqueda)
        );
    }

    if (lista.length === 0) {
        const tr = document.createElement('tr');
        const td = document.createElement('td');
        td.colSpan = 5;
        td.style.textAlign = 'center';
        td.style.color = '#999';
        td.textContent = usuarios.length === 0 ? 'No hay usuarios registrados' : 'Sin coincidencias';
        tr.appendChild(td);
        tabla.appendChild(tr);
        return;
    }

    lista.forEach(u => {
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

        tabla.appendChild(tr);
    });
}

// CAMBIAR ESTADO DE SOLICITUD (SOLO LÍDERES)
function cambiarEstadoSolicitud(solicitudId, nuevoEstado) {
    if (!nuevoEstado) return;
    
    const solicitud = solicitudes.find(s => s.id === solicitudId);
    if (solicitud) {
        solicitud.estado = nuevoEstado;
        localStorage.setItem('solicitudes', JSON.stringify(solicitudes));
        if (firebaseEnabled && solicitud.docId) {
            db.ref('solicitudes/' + solicitud.docId).update({ estado: nuevoEstado })
                .catch(error => console.error('Error actualizando estado en Firebase:', error));
        }
        actualizarEstadisticas();
        actualizarTablasAdmin();
        alert('✅ Estado actualizado correctamente');
    }
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
            color: #007700;
            font-weight: 700;
            background: #e8f5e9;
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
