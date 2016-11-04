'use strict'

// TODO: Allow configurable check period. Should be quite high - like only once every 10 mins.
// TODO: 

/*
	What does this need to do?
	Phase 1:
		Needs to (for each package listed), 
			ensure it is installed in it's own directory under ../apps
			ensure it is up to date
			ensure that it is being run by pm2
		# All Done!
	Phase 2:
		Make maintain period configurable.
		Print time of next maintain action.
		Completely clean install option?
		Have a web interface to allow editing of the app config file.
		Check pm2 (globally) installed on startup.
		Improve npm update code.
*/

var 
	path = require('path'),
	log = require('winston'),
	AppsMaintainer = require('./AppsMaintainer'),
	Config = require('./Config');

// Initialise logging.
require('./Logging').init();

const DEFAULT_MAINTAIN_PERIOD = 60 * 60 * 1000;	// 1 hour.
const DEFAULT_APPS_PATH = path.join(__dirname, '../', 'eye-apps');

Config.load(function(err, config) {
	if (err)
		return log.error(`No configuration could be loaded from ${Config.path}`);
	
	config.maintain_period = config.maintain_period || DEFAULT_MAINTAIN_PERIOD;
	config.apps_path = config.apps_path || DEFAULT_APPS_PATH;
	// TODO: Save config back to disk here, to capture defaults.
	
	new AppsMaintainer(config).run();
});

// TODO: Load from disk. Update on change from web interface.
