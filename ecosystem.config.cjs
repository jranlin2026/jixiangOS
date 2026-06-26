module.exports = {
  apps: [
    {
      name: 'jixiang-os-api',
      script: 'node_modules/tsx/dist/cli.mjs',
      args: 'server/index.ts',
      cwd: __dirname,
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      max_memory_restart: '512M',
      time: true,
      env: {
        NODE_ENV: 'production',
        AI_PROXY_PORT: '3001',
      },
    },
  ],
};
