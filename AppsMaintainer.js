'use strict'

var 
	async = require('async'),
	log = require('winston'),
	AppMaintainer = require('./AppMaintainer');

function AppsMaintainer(apps_path)
{
	this.apps_path = apps_path;
}

AppsMaintainer.prototype.maintain = function(apps, next)
{
	let self = this;
	
	async.mapSeries(
		apps, 
		function(app, next) {
			
			log.info(`Starting to maintain app "${app.id}".`);
			
			new AppMaintainer(self.apps_path, app).run(function(err) {
				if (err)
					log.error(`Failed to ensure ${app.id} up to date, due to error ${err}.`);
				
				log.info(`Finished maintaining app "${app.id}".`);
				
				return next();	// trap errors to treat apps independently.
			});
		},
		function(err)
		{
			return next(err && `Error while maintaining apps ${err}`);
		});
}

module.exports = AppsMaintainer;