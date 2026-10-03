FROM mcr.microsoft.com/playwright:v1.44.0-jammy

# Set working directory
WORKDIR /usr/src/app

# Install app dependencies
COPY package*.json ./
RUN npm ci --only=production

# Bundle app source
COPY . .

# Set production environment defaults
ENV NODE_ENV=production
ENV PORT=8080
ENV HEADLESS_MODE=true

# Expose API port
EXPOSE 8080

# Run standalone API server
CMD ["node", "server.js"]
