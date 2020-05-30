'use strict'

var 
    CustomErrors = require("node-custom-errors"),
    log = require('winston'),
    Config = require('../Config');

function ConfigurationController(config)
{
    this.config = config;
}

(function() {
    
    this.register = function(app)
    {
        // Other config management?
        app.get('/config/maintenance', this.getMaintenance.bind(this));
        app.post('/config/maintenance', this.editMaintenance.bind(this));
        
        // App management
        app.get('/config/apps', this.getApps.bind(this));
        app.put('/config/apps', this.addApp.bind(this));
        app.delete('/config/apps/:id', this.deleteApp.bind(this));
    };
    
    this.saveConfig = function(next)
    {
        Config.save(this.config, function(err) {
            if (err)
                log.error(`Failed to save config file back to disk with error ${err}`);
            
            return next();
        });
    };
    
    this.getMaintenance = function(req, res)
    {
        return res.json(this.config.maintenance);
    };
    
    this.editMaintenance = function(req, res)
    {
        let key = req.query.key;
        let value = req.query.value;
        if (Object.keys(this.config.maintenance).indexOf(key) >= 0)
        {
            this.config.maintenance[key] = value;
            log.info(`Updated config.maintenance.${key} to ${value}`);
        }
        
        this.saveConfig(function() { return res.end(); });
    };
    
    this.getApps = function(req, res)
    {
        return res.json(this.config.apps);
    };
    
    /*
    req.body should resemble:
        {
            "id": "test-tags",        // [Required] Unique name amongst all other apps maintained.
            "repo": {
                "owner": "Cygnut",        // [Required] Github repo owner.
                "name": "test-tags",    // [Required] Github repo name.
                "release": {
                    "id": null            // [Optional] Desired github release id. Leave null to get latest.
                }
            }
        }    
    */
    let ValidationError = CustomErrors.create('ValidationError');
    
    this.addApp = function(req, res)
    {
        let self = this;
        
        function map(body, next)
        {
            // Map the body to an app element.
            function exists(name, element)
            {
                if (!element) throw new ValidationError(`The ${name} element must exist.`);
            }
            
            function getRequired(name, value) {
                if (!value)
                    throw new ValidationError(`The '${name}' element is required.`);
                else return value;
            }
            
            try {
                let app = {
                    id: getRequired('id', body.id)
                };
                
                exists('repo', body.repo);
                app.repo = {
                    owner: getRequired('repo.owner', body.repo.owner),
                    name: getRequired('repo.name', body.repo.name)
                };
                
                exists('repo.release', body.repo.release);
                app.repo.release = {
                    id: body.repo.release.id
                };
                
                return next(null, app);
            }
            catch (e)
            {
                return next(e.message);
            }
        }
        
        map(req.body, function(err, app) {
            if (err)
                return res.status(400).json({ error: err });
            
            // Check if the app id is unique.
            if (self.config.apps.findIndex((a) => a.id === app.id) >= 0)
                return res.status(400).json({ error: `App id '${app.id}' not unique.` });
            
            // Add the app to config.
            self.config.apps.push(app);
            
            // Save the config to disk.
            self.saveConfig(function() { return res.end(); });
        });
    };
    
    this.deleteApp = function(req, res)
    {
        let id = req.params.id;
        
        let idx = this.config.apps.findIndex((app) => app.id === id);
        
        if (idx < 0)
            return res.status(404).end();
        
        this.config.apps.splice(idx, 1);
        
        this.saveConfig(function() { return res.end(); });
    };
    
}).call(ConfigurationController.prototype);

module.exports = ConfigurationController;