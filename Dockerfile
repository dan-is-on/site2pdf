# Use official Node.js image as base
FROM node:20-slim

# Install Linux dependencies
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
        curl && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

# Create app directory
WORKDIR /app

# Copy project files and install dependencies
COPY package.json package-lock.json* ./
RUN npm install

# Copy the rest of the project files
COPY . .

# Default command to run site2pdf-cli with args
ENTRYPOINT ["npx", "site2pdf-cli"]