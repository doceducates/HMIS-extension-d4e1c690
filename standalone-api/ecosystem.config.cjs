module.exports = {
  apps: [
    {
      name: 'hmis-automation-worker',
      script: 'server.js',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      env: {
        NODE_ENV: 'production',
        PORT: 8080,
        HEADLESS_MODE: 'true',
      },
    },
  ],
};
