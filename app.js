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
	Phase 2:
		Make maintain period configurable.
		Print time of next maintain action.
		Completely clean install option?
		Have a web interface to allow editing of the app config file.
		Check pm2 (globally) installed on startup.
		Improve npm update code.
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

var MAINTAIN_PERIOD = 10 * 60 * 1000;
var APPS_PATH = path.join(__dirname, '../', 'eye-apps');

function runLoop(config)
{
	log.info(`Starting to maintain apps.`);
	
	async.mapSeries(
		config.apps, 
		function(app, next) {
			
			log.info(`Starting to maintain app "${app.id}".`);
			
			new AppUpdater(APPS_PATH, app).run(function(err) {
				if (err)
					log.error(`Failed to ensure ${app.id} up to date, due to error ${err}.`);
				
				log.info(`Finished maintaining app "${app.id}".`);
				
				return next();	// trap errors to treat apps independently.
			});
		},
		function(err, results)
		{
			log.info(`Finished maintaining apps.`);
			// When done, schedule another execution.
			setTimeout(function() { 
				runLoop(config); 
			}, MAINTAIN_PERIOD);
		});
}

Config.load(function(err, config) {
	if (err)
		return log.error(`No configuration could be loaded from ${Config.path}`);
	
	runLoop(config);
});

// TODO: Load from disk. Update on change from web interface.
