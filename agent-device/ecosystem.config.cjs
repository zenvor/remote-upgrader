module.exports = {
  apps: [
    {
      name: 'device-agent',
      script: './src/app.js',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_memory_restart: '512M',
      env: {
        NODE_ENV: 'development'
      },
      env_production: {
        NODE_ENV: 'production'
      },
      // 日志配置
      log_file: './logs/agent-combined.log',
      out_file: './logs/agent-out.log',
      error_file: './logs/agent-error.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      // 进程管理
      min_uptime: '10s',
      max_restarts: 10,
      restart_delay: 4000
    }
  ]
};