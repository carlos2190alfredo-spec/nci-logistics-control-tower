# Guia del Copiloto IA

## Que es el Copiloto

El Copiloto IA es un asistente operativo que analiza datos de su operacion y genera informes, analisis de riesgo y explicaciones en espanol. Las sugerencias son informativas — las decisiones son suyas.

## Acceso

Navegue a **Administracion > Copiloto IA** desde el menu lateral del tenant.

Roles con acceso:
- Propietario del Tenant
- Administrador del Tenant
- Gerente de Operaciones

## Funciones

### Resumen operativo
Genera un resumen ejecutivo del estado actual: viajes activos, conductores sin horario, viajes sin ETA, riesgos detectados, y acciones sugeridas.

### Resumen de feedback
Analiza el feedback recibido en los ultimos 30 dias: temas recurrentes, categorizacion, prioridad, y sugerencias.

### Resumen de incidencias
Identifica patrones en incidencias recientes: tipos frecuentes, conductores relacionados, tendencias, y recomendaciones.

### Analisis de riesgo de viaje
Disponible desde la vista del viaje. Evalua factores de riesgo: conductor, horario, conflictos, incidentes previos, datos faltantes.

### Explicacion de recomendacion
Cuando el motor de reglas recomienda un conductor, el copiloto explica la recomendacion en lenguaje natural: factores positivos, negativos, alternativas y riesgos.

## Proveedores

El copiloto funciona con dos proveedores:

| Proveedor | Cuando se usa | Calidad |
|-----------|---------------|---------|
| DeepSeek | Cuando `DEEPSEEK_API_KEY` esta configurado | Analisis detallado con razonamiento |
| Motor de reglas | Sin API key o como fallback | Respuestas deterministas basicas |

## Panel de estado

La pagina del copiloto muestra:
- **Proveedor activo**: DeepSeek, Reglas, o Desactivado
- **Solicitudes hoy**: total de invocaciones del dia
- **Exitosas**: invocaciones completadas
- **Bloqueadas**: intentos de inyeccion detectados
- **Invocaciones recientes**: historial con proveedor, duracion y estado

## Seguridad

- Los datos de usuario se sanitizan antes de enviar al modelo
- Se detectan intentos de manipulacion del modelo
- Cada invocacion queda registrada en el log de actividad
- El copiloto nunca ejecuta acciones: solo analiza y sugiere
