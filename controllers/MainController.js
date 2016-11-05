'use strict'

var 
	log = require('winston'),
	Config = require('../Config');

function MainController(config)
{
	this.config = config;
}

MainController.prototype.register = function(app)
{
	// Other config management?
	app.get('/maintenance', this.getMaintenance.bind(this));
	app.post('/maintenance', this.editMaintenance.bind(this));
	
	// App management
	app.get('/apps', this.getApps.bind(this));
	app.put('/apps', this.addApp.bind(this));
	app.delete('/apps/:id', this.deleteApp.bind(this));
}

MainController.prototype.saveConfig = function(next)
{
	Config.save(this.config, function(err) {
		if (err)
			log.error(`Failed to save config file back to disk with error ${err}`);
		
		return next();
	});
}

MainController.prototype.getMaintenance = function(req, res)
{
	res.json(this.config.maintenance);
}

MainController.prototype.editMaintenance = function(req, res)
{
	let key = req.query.key;
	let value = req.query.value;
	if (Object.keys(this.config.maintenance).indexOf(key) >= 0)
	{
		this.config.maintenance[key] = value;
		log.info(`Updated config.maintenance.${key} to ${value}`);
	}
	
	this.saveConfig(function() { res.end(); });
}

MainController.prototype.getApps = function(req, res)
{
	res.json(this.config.apps);
}

MainController.prototype.addApp = function(req, res)
{
	// TODO: To be implemented.
}

MainController.prototype.deleteApp = function(req, res)
{
	let id = req.params.id;
	
	let idx = this.config.apps.findIndex((app) => app.id === id);
	
	if (idx < 0)
		return res.status(404).end();
	
	this.config.apps.splice(idx, 1);
	
	this.saveConfig(function() { res.end(); });
}

module.exports = MainController;