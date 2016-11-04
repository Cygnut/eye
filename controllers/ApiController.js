
function ApiController(app)
{
	this.app = app;
}

ApiController.prototype.register = function(app)
{
	app.get('/api', this.get.bind(this));
}

function getApi(app)
{
	return {
		endpoints: app._router.stack
				.filter(r => r.route)	// Must have a route element to be a real registered path.
				.map(r => ({
					path: r.route.path,
					method: r.route.stack[0].method.toUpperCase()
				}))
	};
}

ApiController.prototype.get = function(req, res)
{
	var format = req.query.format || 'html';
	
	if (format === 'json')
		return res.json({
			api: getApi(this.app)
		});
	else
		return res.render('api', getApi(this.app));
}

module.exports = ApiController;