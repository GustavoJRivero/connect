# --- Etapa 1: build ---
FROM node:18-alpine AS build

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

# La URL de la API se inyecta en build-time
ARG REACT_APP_API_BASE_URL=http://localhost:5001
ENV REACT_APP_API_BASE_URL=$REACT_APP_API_BASE_URL
ENV DISABLE_ESLINT_PLUGIN=true

RUN npm run build

# --- Etapa 2: servir con nginx ---
FROM nginx:stable-alpine

COPY --from=build /app/build /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
