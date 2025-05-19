# Use official Node.js image as base
FROM node:20-slim

# Install Linux dependencies and Chromium
RUN apt-get update && \
    apt-get install -y \
        libxkbcommon0 \
        libnss3 \
        libxss1 \
        libasound2 \
        fonts-liberation \
        libappindicator3-1 \
        libatk-bridge2.0-0 \
        libatspi2.0-0 \
        libgtk-3-0 \
        libgbm-dev \
        curl \
        chromium && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

# Create app directory
WORKDIR /app

# Create a non-root user
RUN useradd -m -s /bin/bash pptruser
USER pptruser
WORKDIR /home/pptruser/app

# Copy project files and install dependencies
COPY --chown=pptruser:pptruser package.json package-lock.json* ./
RUN npm install

# Copy source files and build
COPY --chown=pptruser:pptruser . .
# RUN npm run build

# Set environment variable to tell Puppeteer to use installed Chromium
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

# Default command to run site2pdf with args
ENTRYPOINT ["npx", "site2pdf"]