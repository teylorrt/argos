FROM node:24.10.0-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

FROM node:24.10.0-alpine
WORKDIR /app
ENV NODE_ENV=production HOST=0.0.0.0
COPY package*.json ./
RUN npm ci --omit=dev
COPY --from=build /app/dist ./dist
COPY public ./public
COPY migrations ./migrations
RUN mkdir -p /app/data/keys && chown -R node:node /app/data
USER node
EXPOSE 3000
CMD ["node", "dist/main.js"]
