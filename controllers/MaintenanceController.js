'use strict'

var 
    fs = require('fs-extra'),
    log = require('winston');

function MaintenanceController(config)
{
    this.config = config;
}

(function() {
    
    this.register = function(app)
    {
        // Other config management?
        app.delete('/maintenance/deleteInstalledApps', this.deleteInstalledApps.bind(this));
    };
    
    this.deleteInstalledApps = function(req, res)
    {
        fs.emptyDir(this.config.maintenance.appsPath, function(err) {
            if (err) return res.status(400).json({ error: `Failed to delete installed apps with error ${err}.` });
            return res.json({});
        });
    }
    
}).call(MaintenanceController.prototype);

module.exports = MaintenanceController;