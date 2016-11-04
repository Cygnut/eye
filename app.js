'use strict'

// TODO: Allow configurable check period. Should be quite high - like only once every 10 mins.
// TODO: 

/*
	What does this need to do?
	Phase 1:
		Needs to (for each package listed), 							# done
			ensure it is installed in it's own directory under ../apps	# done
			ensure it is up to date										# done
			ensure that it is being run by pm2							# done
		# All Done!
	Phase 2:
		Make maintain period configurable.								# done
		Implement MainController.js										# next up
		Print time of next maintain action.								
		Deep clone config object before each run.						
		Completely clean install option?								
		Have a web interface to allow editing of the app config file.	
		Check pm2 (globally) installed on startup.						
		Improve npm update code.										
*/

var 
	express = require('express'),
	path = require('path'),
	log = require('winston'),
	AppsMaintainer = require('./AppsMaintainer'),
	Config = require('./Config');

// Initialise logging.
require('./Logging').init();

// TODO: Add to Config.js
const DEFAULT_MAINTAIN_PERIOD = 60 * 60 * 1000;	// 1 hour.
const DEFAULT_APPS_PATH = path.join(__dirname, '../', 'eye-apps');
const DEFAULT_WEB_PORT = 3100;

Config.load(function(err, config) {
	if (err)
		return log.error(`No configuration could be loaded from ${Config.path}`);
	
	// TODO: Save a config file and exit if one not found.
	
	config.maintain_period = config.maintain_period || DEFAULT_MAINTAIN_PERIOD;
	config.apps_path = config.apps_path || DEFAULT_APPS_PATH;
	config.web_port = config.web_port || DEFAULT_WEB_PORT;
	// TODO: Save config back to disk here, to capture defaults.
	
	createWebInterface(config);
	
	new AppsMaintainer(config).run();
});

// TODO: Load from disk. Update on change from web interface.

function createWebInterface(config)
{
	var app = express();
	// Templating:
	app.set('views', './views');
	app.set('view engine', 'pug');

	// Create controllers:
	var controllers = {
		ping: new (require('./controllers/PingController'))(),
		api: new (require('./controllers/ApiController'))(app),
		main: new (require('./controllers/MainController'))(config)
	};
	// Register controllers:
	Object.keys(controllers).forEach(function(key) { controllers[key].register(app); });

	// Listen:
	var server = app.listen(config.web_port, () => {
		var host = server.address().address;
		var port = server.address().port;
		
		log.info(`App listening at http://${host}:${port}`);
	});
}