# Guia de Operaciones IA para Tenant Admin

## Resumen

El modulo de Operaciones IA permite a los administradores de tenant:
- Estimar rutas y tiempos de viaje
- Gestionar horarios de conductores
- Obtener recomendaciones automaticas de asignacion de conductores
- Ver un dashboard de insights operativos

## Como estimar una ruta

1. Navegar al dashboard del tenant
2. En la tarjeta de un viaje, expandir "Estimacion de Ruta"
3. El viaje debe tener al menos 2 paradas con coordenadas
4. Hacer clic en "Calcular Estimacion"
5. El sistema calculara distancia, duracion y ETA por parada

### Modos de estimacion

- **Deshabilitado**: no calcula (default sin configuracion)
- **Simulado**: calcula por formula matematica (para demos)
- **Google**: usa Google Maps Routes API (requiere API key)

## Como gestionar horarios de conductores

1. Ir a Admin > Conductores
2. Hacer clic en "Horario" junto al conductor
3. Configurar dias de la semana con horario de inicio/fin
4. Opcionalmente agregar descansos
5. Guardar el horario
6. Para excepciones (vacaciones, dia libre), usar el formulario de excepciones

## Como obtener recomendacion de conductor

1. En la tarjeta de viaje, expandir "Recomendacion de Conductor"
2. Hacer clic en "Generar Recomendacion"
3. El sistema evaluara todos los conductores disponibles
4. Se mostrara el conductor recomendado con su score y nivel de riesgo
5. Opciones:
   - **Aceptar**: asigna el conductor recomendado al viaje
   - **Override**: elegir otro conductor (requiere escribir una razon)

## Dashboard de Insights Operativos

Acceder desde Admin > Operaciones IA. Muestra:

- **Viajes sin conductor**: viajes activos sin conductor asignado
- **Viajes sin ETA**: viajes sin estimacion de ruta
- **Conductores sin horario**: conductores sin horario semanal configurado
- **Conductores sobrecargados**: conductores con 5+ viajes hoy
- **Recomendaciones recientes**: lista de ultimas recomendaciones generadas
