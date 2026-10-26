# E-Stellarium

Plataforma de práctica gamificada para clientes de [WeAreSRV](https://wearesrv.com).
Los alumnos resuelven desafíos de código, ganan experiencia y suben de nivel
para obtener descuentos en otros cursos.

## Estructura

| Carpeta   | Qué es                                 | Deploy  |
| --------- | -------------------------------------- | ------- |
| `client/` | Front: React + Vite + TypeScript       | Netlify |
| `api/`    | API: Express + TypeScript + PostgreSQL | Railway |

## Desarrollo local

### API

    cd api
    npm install
    npm run dev

Queda en http://localhost:3000. Probá http://localhost:3000/health.

### Client

    cd client
    npm install
    npm run dev

Queda en http://localhost:5173.

## Ramas

- `main`: producción.
- `develop`: integración.
- `feature/<nombre>`: una rama por funcionalidad, que se mergea a `develop`.