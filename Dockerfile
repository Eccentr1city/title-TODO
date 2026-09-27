FROM node:22-bookworm-slim AS build
# Toolchain in case better-sqlite3 has to compile from source
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
# `next build` imports the db module; keep that throwaway DB out of the image
ENV NEXT_TELEMETRY_DISABLED=1 TITLE_TODO_DATA_DIR=/tmp/build-data
RUN npm run build

FROM node:22-bookworm-slim
WORKDIR /app
COPY --from=build /app ./
RUN chmod -R a+rX /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 TITLE_TODO_DATA_DIR=/data
USER node
EXPOSE 3000
CMD ["node_modules/.bin/next", "start", "-H", "0.0.0.0", "-p", "3000"]
