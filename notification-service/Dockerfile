FROM node:20-slim AS build

WORKDIR /app

COPY package.json ./
RUN npm install

COPY tsconfig.json tsconfig.build.json nest-cli.json ./
COPY src ./src

RUN npm run build

FROM node:20-slim AS runtime

WORKDIR /app

ENV NODE_ENV=production

COPY package.json ./
RUN npm install --omit=dev

COPY --from=build /app/dist ./dist

EXPOSE 4003

CMD ["node", "dist/main.js"]
