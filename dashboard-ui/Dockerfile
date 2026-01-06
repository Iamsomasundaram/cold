FROM node:20-slim AS build

WORKDIR /app

COPY package.json ./
RUN npm install

COPY tsconfig.json tsconfig.node.json vite.config.ts index.html ./
COPY src ./src

ARG VITE_API_BASE_URL
ARG VITE_WS_URL
ARG VITE_API_TOKEN
ARG VITE_DEFAULT_TENANT_KEY

ENV VITE_API_BASE_URL=${VITE_API_BASE_URL}
ENV VITE_WS_URL=${VITE_WS_URL}
ENV VITE_API_TOKEN=${VITE_API_TOKEN}
ENV VITE_DEFAULT_TENANT_KEY=${VITE_DEFAULT_TENANT_KEY}

RUN npm run build

FROM nginx:1.27-alpine

COPY nginx.conf /etc/nginx/conf.d/default.conf

COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 4300
