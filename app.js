

// TODO: Allow configurable check period. Should be quite high - like only once every 10 mins.
// TODO: 

/*
	What does this need to do?
	Phase 1:
		Needs to (for each package listed), 
			ensure it is installed in it's own directory under ../apps
			ensure it is up to date
			ensure that it is being run by pm2
	Phase 2:
		Have a web interface to allow editing of the app config file.
		Check pm2 (globally) installed on startup.
*/

var 
	fs = require('fs-extra'),
	path = require('path'),
	log = require('winston'),
	AppUpdater = require('./AppUpdater'),
	Config = require('./Config');

// Initialise logging.
require('./Logging').init();

Config.load(function(err, config) {
	if (err)
		return log.error(`No configuration could be loaded from ${Config.path}`);
	
	setTimeout(function() {
		
		// TODO: Use async.series here! To run for each config.apps item serially.
		
	}, 10 * 60 * 1000);
});

// TODO: Load from disk. Update on change from web interface.
/*
let app = config.apps[0];
new AppUpdater(app).run(function(err) {
	if (err)
		return log.error(`Failed to ensure ${this.app.id} up to date, due to error ${err}.`);
});
*/