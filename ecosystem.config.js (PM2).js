module.exports = {
  apps: [
    {
      name: 'srjustini-bot',
      script: 'server.js',
      instances: 1,           // ou 'max' se quiser cluster
      exec_mode: 'fork',      // mantém 1 sessão WhatsApp estável
      watch: false,
      env: {
        NODE_ENV: 'production',
        TZ: 'America/Fortaleza',
        PORT: 3001,

        // ===== Fluxo e regras =====
        STRICT_MENU: 'true',
        MAX_CONCURRENT_BOOKINGS: '1',

        // ===== Sessão =====
        AUTH_CLIENT_ID: 'sr-justini-minimal',
        AUTH_DATA_PATH: '/var/lib/srjustini-bot',

        // ===== Chromium =====
        CHROME_PATH: '/usr/bin/chromium',

        // ===== Resposta inteligente opcional =====
        ENABLE_INTEL_RESPONSE: 'false'
      },
      error_file: './logs/err.log',
      out_file: './logs/out.log',
      merge_logs: true,
      max_restarts: 10,
      restart_delay: 5000
    }
  ]
}