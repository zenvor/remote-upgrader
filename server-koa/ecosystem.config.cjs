module.exports = {
  apps: [
    {
      name: 'remote-upgrade-server',
      script: './src/app.js',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      exp_backoff_restart_delay: 2000, // 指数退避重启
      kill_timeout: 5000, // 优雅关闭超时
      env: {
        NODE_ENV: 'development',
        PORT: 9005
      },
      env_production: {
        NODE_ENV: 'production',
        PORT: 9005
      },
      // 日志配置
      log_file: './logs/server-combined.log',
      out_file: './logs/server-out.log',
      error_file: './logs/server-error.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      // 进程管理
      min_uptime: '10s',
      max_restarts: 10,
      restart_delay: 4000
    }
  ]
}
