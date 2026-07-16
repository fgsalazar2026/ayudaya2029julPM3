# 🤝 Plataforma de Gestión de Solicitudes de Ayuda Comunitaria

**Proyecto Integrador de Saberes 2026-S1**  
*Plataforma móvil y web de gestión de solicitudes de ayuda comunitaria para sectores urbano-marginales de Guayaquil*

---

## 📋 Descripción del Proyecto

Una plataforma digital integrada que facilita el reporte y gestión de necesidades comunitarias en sectores urbano-marginales de Guayaquil, permitiendo una respuesta oportuna de líderes comunitarios.

### Problema a Resolver
Falta de un canal digital ágil y accesible para que ciudadanos reporten necesidades comunitarias (baches, alumbrado, inseguridad) y coordinen voluntariado o donaciones.

### Objetivo General
Desarrollar una plataforma digital integrada (app móvil + panel web) que facilite el reporte y gestión de necesidades comunitarias.

---

## 🎯 Características Principales

- ✅ **Sistema de Autenticación**: Registro e inicio de sesión con correo y contraseña
- ✅ **Dos Roles de Usuario**:
  - **👤 Ciudadano**: Solo puede reportar necesidades
  - **👨‍💼 Líder Comunitario**: Acceso completo al panel de administración
- ✅ **Reporte de Necesidades**: Formulario intuitivo para reportar problemas comunitarios
- ✅ **Detección Automática de Ubicación**: Obtiene coordenadas GPS y nombre del barrio automáticamente
- ✅ **Seguimiento de Solicitudes**: Tabla con estado de todos los reportes registrados
- ✅ **Panel de Administración**: Solo visible para líderes comunitarios
- ✅ **Categorización**: Múltiples categorías de necesidades
- ✅ **Niveles de Urgencia**: Clasificación según crítica de la necesidad
- ✅ **Almacenamiento Local**: Datos guardados en LocalStorage del navegador
- ✅ **Interfaz Responsiva**: Funciona en dispositivos móviles y computadoras

---

## 📁 Estructura del Proyecto

```
web clase/
├── index.html          # Página principal con autenticación
├── estilos.css         # Estilos y diseño responsivo
├── script.js           # Funcionalidad, autenticación e interactividad
├── README.md           # Este archivo
└── .gitignore          # Archivos a ignorar en Git
```

---

## 🚀 Cómo Usar

### 1. Crear una Cuenta
- Abre `index.html` en tu navegador
- Haz clic en "Regístrate aquí"
- Completa el formulario con:
  - **Nombre Completo**
  - **Nombre de Usuario** (sin espacios, solo letras, números y guion bajo)
  - **Correo Electrónico**
  - **Contraseña** (mínimo 4 caracteres)
  - **Confirmar Contraseña**
  - Selecciona tu rol: **Ciudadano** o **Líder Comunitario**
- Haz clic en "Crear Cuenta"

### 2. Iniciar Sesión
- Ingresa tu **Usuario** o **Correo** y **Contraseña**
- Haz clic en "Ingresar"
- ✅ Puedes iniciar sesión con tu usuario O tu correo

### 3. Reportar una Necesidad (Para Ciudadanos y Líderes)
- Haz clic en "Reportar Necesidad"
- Haz clic en "📍 Detectar Ubicación" para obtener automáticamente:
  - Coordenadas GPS (latitud y longitud)
  - Nombre del barrio
- Completa el formulario con:
  - Tipo de necesidad
  - Descripción detallada
  - Nivel de urgencia
- Haz clic en "Enviar Reporte"

### 4. Ver Mis Solicitudes
- Navega a "Mis Solicitudes"
- Verás una tabla con todos tus reportes registrados

### 5. Panel de Administración (Solo Líderes)
- Si eres un **Líder Comunitario**, verás la opción "📊 Panel Admin" en el menú
- **Estadísticas**: Ver total de solicitudes, en revisión, aprobadas y críticas
- **Tabla de Solicitudes**: Ver todas las solicitudes de la comunidad
- **Filtrar Solicitudes**: Buscar por sector/nombre y filtrar por estado
- **Cambiar Estado**: Actualizar el estado de cada solicitud:
  - En revisión
  - Aprobada
  - En proceso
  - Completada

---

## 👥 Sistema de Roles

### Ciudadano (👤)
- Puede registrarse con correo y contraseña
- Puede reportar necesidades comunitarias
- Puede ver solo sus propias solicitudes
- No tiene acceso al panel de administración

### Líder Comunitario (👨‍💼)
- Puede registrarse con correo y contraseña
- Puede reportar necesidades como ciudadano
- Acceso a panel de administración
- Puede ver todas las solicitudes de la comunidad
- Puede cambiar el estado de las solicitudes
- Puede filtrar y buscar solicitudes

---

## 🛠️ Tecnologías Utilizadas

- **HTML5**: Estructura semántica
- **CSS3**: Diseño responsivo con gradientes y animaciones
- **JavaScript (Vanilla)**: Lógica de la aplicación y autenticación
- **LocalStorage**: Almacenamiento de datos en el cliente
  - `usuarios`: Lista de usuarios registrados
  - `solicitudes`: Lista de solicitudes reportadas
  - `usuarioActual`: Usuario actual en sesión
- **Geolocation API**: Acceso a coordenadas GPS del dispositivo
- **Nominatim OpenStreetMap**: Geocodificación inversa (convertir coordenadas a nombre de lugar)

---

## ✅ Validaciones de Registro

**Nombre de Usuario:**
- Mínimo 3 caracteres
- Solo se permite: letras, números y guion bajo (_)
- Debe ser único (no puede repetirse)

**Contraseña:**
- Mínimo 4 caracteres
- Debe coincidir con la confirmación
- Las contraseñas deben ser idénticas

**Correo Electrónico:**
- Debe ser único (no puede repetirse)
- Formato válido de correo

**Rol:**
- Obligatorio seleccionar uno: Ciudadano o Líder

---

## 📱 Secciones del Sitio

### 1. Autenticación
- **Iniciar Sesión**: Ingresa con tu correo y contraseña
- **Crear Cuenta**: Registro nuevo con selección de rol

### 2. Navegación
Menú principal con enlaces a todas las secciones (varía según el rol)

### 3. Hero (Inicio)
Sección de bienvenida con descripción del proyecto

### 4. Reportar Necesidad
Formulario completo para registrar nuevas solicitudes:
- Datos del usuario (prerellenados)
- Ubicación Automática (coordenadas GPS + nombre del barrio)
- Tipo de necesidad
- Descripción detallada
- Nivel de urgencia

### 5. Mis Solicitudes
Tabla con histórico de reportes enviados por el usuario actual

### 6. Panel Administrativo (Solo Líderes)
- **Estadísticas**: Resumen de solicitudes
- **Tabla de Solicitudes Comunitarias**: Ver y gestionar todas las solicitudes
- **Filtros**: Búsqueda por sector/nombre y por estado
- **Cambio de Estado**: Actualizar estado de solicitudes

### 7. Acerca De
Información sobre el proyecto integrador

---

## 💾 Estructura de Datos

### Usuario
```javascript
{
    id: 1234567890,
    nombre: "Juan Pérez",
    usuario: "juan_perez",
    email: "juan@example.com",
    password: "contraseña",
    rol: "ciudadano", // o "lider"
    fechaRegistro: "14/7/2026"
}
```

### Solicitud
```javascript
{
    id: 1234567890,
    fecha: "14/7/2026",
    nombre: "Juan Pérez",
    email: "juan@example.com",
    telefono: "0987654321",
    sector: "Barrio Obrero",
    tipo: "infraestructura",
    descripcion: "Hay un bache grande...",
    urgencia: "alta",
    estado: "En revisión",
    usuarioId: 1234567890,
    coordenadas: {
        lat: -2.1520,
        lon: -79.5244
    }
}
```

---

## 🔄 Próximos Pasos

- [ ] Crear backend para almacenar datos en servidor
- [ ] Implementar base de datos (MongoDB, PostgreSQL, etc.)
- [ ] Desarrollar app móvil
- [ ] Integrar sistema de notificaciones
- [ ] Agregar mapa interactivo de reportes
- [ ] Sistema de seguimiento y respuesta en tiempo real
- [ ] Envío de correos de confirmación
- [ ] Recuperación de contraseña

---

## ⚠️ Notas Importantes

- Los datos se guardan localmente en tu navegador usando **LocalStorage**
- Cada navegador/dispositivo tendrá sus propios datos
- Las contraseñas se guardan en texto plano (solo para demostración educativa)
- Para versión de producción se necesitará:
  - Backend con autenticación segura
  - Base de datos
  - Encriptación de contraseñas
  - Validación de correos
  - Recuperación de contraseña

---

## 👥 Proyecto Integrador

**Cátedra Integradora**: Programación Móvil  
**Año**: 2026  
**Período**: S1  
**Institución**: UNEMI

---

## 📝 Ejemplos de Prueba

### Usuario Ciudadano
- **Usuario**: ciudadano123
- **Correo**: ciudadano@test.com
- **Contraseña**: test123
- **Rol**: Ciudadano

### Usuario Líder
- **Usuario**: lider_Juan
- **Correo**: lider@test.com
- **Contraseña**: test123
- **Rol**: Líder Comunitario

**Nota**: Puedes iniciar sesión con el usuario O con el correo

---

## 📧 Contacto

Para más información sobre el proyecto, contacta a tu profesor responsable.

---

*Última actualización: Julio 2026*


---

## 📁 Estructura del Proyecto

```
web clase/
├── index.html          # Página principal
├── estilos.css         # Estilos y diseño responsivo
├── script.js           # Funcionalidad y interactividad
├── README.md           # Este archivo
└── .gitignore          # Archivos a ignorar en Git
```

---

## 🚀 Cómo Usar

1. **Abrir el proyecto**
   ```bash
   # Simplemente abre index.html en tu navegador
   ```

2. **Reportar una necesidad**
   - Haz clic en "Reportar Necesidad" o "Comenzar Ahora"
   - Completa el formulario con tus datos y la descripción
   - Haz clic en "Enviar Reporte"

3. **Ver mis solicitudes**
   - Navega a la sección "Mis Solicitudes"
   - Verás una tabla con todos tus reportes registrados

---

## 🛠️ Tecnologías Utilizadas

- **HTML5**: Estructura semántica
- **CSS3**: Diseño responsivo con gradientes y animaciones
- **JavaScript (Vanilla)**: Lógica de la aplicación
- **LocalStorage**: Almacenamiento de datos en el cliente
- **Geolocation API**: Acceso a coordenadas GPS del dispositivo
- **Nominatim OpenStreetMap**: Geocodificación inversa (convertir coordenadas a nombre de lugar)

---

## 📱 Secciones del Sitio

### 1. Navegación
Menú principal con enlaces a todas las secciones

### 2. Hero (Inicio)
Sección de bienvenida con descripción del proyecto

### 3. Reportar Necesidad
Formulario completo para registrar nuevas solicitudes:
- Datos del usuario (nombre, email, teléfono)
- **Ubicación Automática** (coordenadas GPS + nombre del barrio)
- Tipo de necesidad
- Descripción detallada
- Nivel de urgencia

**🌍 Cómo funciona la Ubicación Automática:**
1. Haz clic en el botón "📍 Detectar Ubicación"
2. El navegador te pedirá permiso para acceder a tu ubicación
3. Se obtienen automáticamente: **Coordenadas GPS** y **Nombre del barrio**
4. Aparecerán las coordenadas debajo del campo (Lat | Lon)
5. El nombre del barrio se carga automáticamente en el campo "Sector/Barrio"

### 4. Mis Solicitudes
Tabla con histórico de reportes enviados

### 5. Acerca De
Información sobre el proyecto integrador

---

## 💾 Datos Almacenados

Cada solicitud guarda:
- Fecha y hora del reporte
- Datos del usuario
- Sector/barrio (obtenido automáticamente)
- Coordenadas GPS (latitud y longitud)
- Tipo de necesidad
- Descripción
- Nivel de urgencia
- Estado (En revisión)

---

## 🔄 Próximos Pasos

- [ ] Crear backend para almacenar datos en servidor
- [ ] Implementar panel de administración
- [ ] Desarrollar app móvil
- [ ] Integrar sistema de notificaciones
- [ ] Agregar mapa interactivo de reportes
- [ ] Sistema de seguimiento y respuesta

---

## 👥 Proyecto Integrador

**Cátedra Integradora**: Programación Móvil  
**Año**: 2026  
**Período**: S1  
**Institución**: UNEMI

---

## 📝 Notas Importantes

- Los datos se guardan localmente en tu navegador
- Cada navegador/dispositivo tendrá sus propios datos
- Para versión de producción se necesitará backend

---

## 📧 Contacto

Para más información sobre el proyecto, contacta a tu profesor responsable.

---

*Última actualización: Julio 2026*

