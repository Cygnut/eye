'use strict'

var 
	async = require('async'),
	log = require('winston'),
	AppMaintainer = require('./AppMaintainer');

function AppsMaintainer(config)
{
	this.config = config;
}

AppsMaintainer.prototype.run = function()
{
	let self = this;
	
	log.info(`Starting to maintain apps.`);
	
	// TODO: Take a clone of config here to be independent of config changes in this loop.
	async.mapSeries(
		self.config.apps, 
		function(app, next) {
			
			log.info(`Starting to maintain app "${app.id}".`);
			
			new AppMaintainer(self.config.apps_path, app).run(function(err) {
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
				self.run(); 
			}, self.config.maintain_period);
		});
}

module.exports = AppsMaintainer;