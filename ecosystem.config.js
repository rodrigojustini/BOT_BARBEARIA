module.exports = {
  apps: [{
    name: 'sr-justini-bot',
    script: './chatbot.js',
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '1G',
    env: {
      NODE_ENV: 'production',
      PORT: 3001
    },
    error_file: './logs/error.log',
    out_file: './logs/out.log',
    log_file: './logs/combined.log',
    time: true,
    merge_logs: true,
    kill_timeout: 5000,
    wait_ready: true,
    listen_timeout: 10000,
    shutdown_with_message: true,
    // Configurações de restart
    max_restarts: 10,
    min_uptime: '10s',
    restart_delay: 4000,
    // Variáveis de ambiente específicas
    env_production: {
      NODE_ENV: 'production',
      PORT: 3001,
      AUTH_DATA_PATH: '/var/lib/srjustini-bot',
      CHROME_PATH: '/usr/bin/chromium'
    }
  }]
};
