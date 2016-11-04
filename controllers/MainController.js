
function MainController(config)
{
	this.config = config;
}

MainController.prototype.register = function(app)
{
	// Other config management?
	
	// App management
	app.get('/apps', this.getApps.bind(this));
	app.put('/apps', this.addApp.bind(this));
	app.delete('/apps/:id', this.deleteApp.bind(this));
}

MainController.prototype.getApps = function(req, res)
{
	res.json(this.config.apps);
}

MainController.prototype.addApp = function(req, res)
{
	res.json({
		msg: req.query.msg
	});
}

MainController.prototype.deleteApp = function(req, res)
{
	res.json({
		msg: req.query.msg
	});
}

module.exports = MainController;