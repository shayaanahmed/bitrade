FROM node:24-alpine AS dependencies
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts --no-audit --no-fund

FROM dependencies AS build
ARG NEXT_PUBLIC_BINANCE_WS_URL=wss://stream.binance.com:9443/ws
ENV NEXT_PUBLIC_BINANCE_WS_URL=$NEXT_PUBLIC_BINANCE_WS_URL
COPY . .
RUN npm run build

FROM node:24-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app ./
EXPOSE 3000
CMD ["npm", "run", "start", "--", "--hostname", "0.0.0.0", "--port", "3000"]
