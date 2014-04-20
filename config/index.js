var config = {
  local: {
    mode: 'local',
    port: 3000,
    atb_user: '',
    atb_pass: ''
  }
};

module.exports = function (mode) {
  return config[mode || process.argv[2] || 'local'] || config.local;
};