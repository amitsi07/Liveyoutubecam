FROM node:22-bookworm-slim

# Install system dependencies including FFmpeg
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy package files and install dependencies
COPY package*.json ./
RUN npm install

# Copy application source code
COPY . .

# Build frontend production bundle
RUN npm run build

# Expose port (Render/Railway injects PORT environment variable)
ENV PORT=3000
ENV NODE_ENV=production
EXPOSE 3000

# Start full-stack server
CMD ["npm", "start"]
