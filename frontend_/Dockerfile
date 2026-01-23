FROM node:20-alpine

WORKDIR /app

# Copy manifests first for better caching (still useful locally)
COPY package*.json ./
RUN npm ci

# Copy source
COPY . .

# Install a static server
RUN npm i -g serve

EXPOSE 8080

# Build at runtime so VITE_* vars are available, then serve
CMD ["sh", "-lc", "npm run build && serve -s dist -l tcp://0.0.0.0:${PORT:-8080}"]
