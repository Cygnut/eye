

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
		Completely clean install option?
		Have a web interface to allow editing of the app config file.
		Check pm2 (globally) installed on startup.
*/

var 
	fs = require('fs-extra'),
	async = require('async'),
	path = require('path'),
	log = require('winston'),
	AppUpdater = require('./AppUpdater'),
	Config = require('./Config');

// Initialise logging.
require('./Logging').init();

var POLL_PERIOD = 10 * 60 * 1000;

Config.load(function(err, config) {
	if (err)
		return log.error(`No configuration could be loaded from ${Config.path}`);
	
	setTimeout(function() {
		
		async.mapSeries(
			config.apps, 
			function(app, next) {
				new AppUpdater(app).run(function(err) {
					if (err)
						log.error(`Failed to ensure ${this.app.id} up to date, due to error ${err}.`);
					return next();	// trap errors.
				});
			},
			function(err, results)
			{
				log.info(`Finished installing apps.`);
			});
			
	}, POLL_PERIOD);
});

// TODO: Load from disk. Update on change from web interface.
