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
      exp_backoff_restart_delay: 2000, // 指数退避重启
      kill_timeout: 5000, // 优雅关闭超时
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
}
