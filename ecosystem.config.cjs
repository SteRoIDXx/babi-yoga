module.exports = {
  apps: [{
    name: "babi-yoga",
    script: "server/entry.mjs",
    cwd: "/var/www/babi-yoga.qualitywebdesign.de/app",
    env: {
      HOST: "127.0.0.1",
      PORT: 4321,
      NODE_ENV: "production"
    },
    instances: 1,
    exec_mode: "fork",
    autorestart: true,
    max_memory_restart: "256M",
  }]
};
