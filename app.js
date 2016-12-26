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
		Implement MainController.js										# done
		Get around github rate limiting.								# done
		Deep clone config object before each run.						# done
		Print time of next maintain action.								# done
		Have a web interface to allow editing of the app config file.	# done
		Review AppsMaintainer code & reproduction of eye. shit			# done
			Need to correctly handle removal of apps.					# done
				Remove from disk.										# done
				Remove from pm2.										# done
		
		put self in pm2 if no existing instance?
		flesh out simplistic web gui
		misc options:
			be able to delete content of apps folder.
			get status of running apps
			be able to restart/stop an app.
		
		Check pm2 (globally) installed on startup.						
		Check for any other dependencies on startup.					
		Improve npm update code.										
		Handle any other TODOs in code.									
*/

var 
	_ = require('lodash'),
	moment = require('moment'),
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
const DEFAULT_AUTH_TYPE = 'basic';
const DEFAULT_AUTH_USERNAME = '<username>';
const DEFAULT_AUTH_PASSWORD = '<password>';

Config.load(function(err, config) {
	if (err)
	{
		log.warn(`A .config file could be loaded from ${Config.path} - a default one will be created.`);
		// Create an empty config object in this case - to be saved back to disc with defaults.
		config = {};
	}
	
	// Ensure that the .config file has the correct structure, or is built from scratch if it does not exist.
	function ensure(obj, field, def) {
		obj[field] = obj[field] || def;
	}
	
	ensure(config, 'maintenance', {});
	ensure(config.maintenance, 'period', DEFAULT_MAINTAIN_PERIOD);
	ensure(config.maintenance, 'appsPath', DEFAULT_APPS_PATH);

	ensure(config.maintenance, 'repo', {});
	ensure(config.maintenance.repo, 'auth', {});
	ensure(config.maintenance.repo.auth, 'type', DEFAULT_AUTH_TYPE);
	ensure(config.maintenance.repo.auth, 'username', DEFAULT_AUTH_USERNAME);
	ensure(config.maintenance.repo.auth, 'password', DEFAULT_AUTH_PASSWORD);
	
	ensure(config, 'web', {});
	ensure(config.web, 'port', DEFAULT_WEB_PORT);
	
	ensure(config, 'apps', []);
	
	// Let's go, boys!
	Config.save(config, function(err) {
		runEye(config);
	});
});

function runEye(config) {	
	hostWebServer(config);
	
	startMaintenence(config);
}

function startMaintenence(config)
{
	// cb = function(next)
	function loop(cb, getInterval) {
		
		cb(function() {
			setTimeout(function() {
				loop(cb, getInterval);
			}, getInterval());
		});
	};
	
	function getPeriod() {
		return config.maintenance.period;
	}
	
	loop(
		function(next) {
			log.info(`Starting to maintain apps.`);
			
			// Take a copy of config here so that config can be modified without affecting the current maintenance run.
			let c = _.cloneDeep(config);
			
			new AppsMaintainer(c.maintenance).maintain(c.apps, function() {
					let scheduled = moment().add(getPeriod(), 'milliseconds').format('DD-MM-YYYY HH:mm:ss');
					log.info(`Finished maintaining apps. Next run at ${scheduled}.`);
					return next();
				});
		},
		getPeriod
		);
}

// TODO: Load from disk. Update on change from web interface.

function hostWebServer(config)
{
	var app = express();
	// Templating:
	app.set('views', './views');
	app.set('view engine', 'pug');
	// Allow sending json bodies.
	app.use(require('body-parser').json());
	
	app.use(express.static('public'));
	
	// Create controllers:
	var controllers = {
		ping: new (require('./controllers/PingController'))(),
		api: new (require('./controllers/ApiController'))(app),
		config: new (require('./controllers/ConfigurationController'))(config),
		maintenance: new (require('./controllers/MaintenanceController'))(config),
	};
	// Register controllers:
	Object.keys(controllers).forEach(function(key) { controllers[key].register(app); });

	// Listen:
	var server = app.listen(config.web.port, () => {
		var host = server.address().address;
		var port = server.address().port;
		
		log.info(`App listening at http://${host}:${port}`);
	});
}