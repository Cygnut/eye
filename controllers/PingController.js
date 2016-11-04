
function PingController()
{
}

PingController.prototype.register = function(app)
{
	app.get('/ping', this.get.bind(this));
}

PingController.prototype.get = function(req, res)
{
	res.json({
		msg: req.query.msg
	});
}

module.exports = PingController;