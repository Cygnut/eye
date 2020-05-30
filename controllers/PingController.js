
function PingController()
{
}

(function() {
    
    this.register = function(app)
    {
        app.get('/ping', this.get.bind(this));
    };
    
    this.get = function(req, res)
    {
        res.json({
            msg: req.query.msg
        });
    };
    
}).call(PingController.prototype);

module.exports = PingController;