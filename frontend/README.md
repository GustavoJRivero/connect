## Frontend (React)

### Setup

Recomendado: **Node.js 18+** (tu Node 14.15 puede fallar con dependencias modernas).

Podés configurar la URL de la API con:

- `REACT_APP_API_BASE_URL` (por defecto `http://localhost:5001`)

Nota: con Node viejo, CRA puede fallar por ESLint. Dejé `frontend/.env` con:

- `DISABLE_ESLINT_PLUGIN=true`

```bash
npm install
npm start
```

Por defecto intenta leer el healthcheck de la API en:

- `http://localhost:5001/api/health`

