'use strict'

const 
    fs = require('fs-extra'),
    path = require('path');

/*
Example config file.

{
    "web": 
    {
        "port": 3100,        // [Optional] Configuration web port.
    },
    "maintenance":
    {
        "period": 30000,        // [Optional] Run eye maintenance every 30 seconds.
        "appsPath": "./here",    // [Optional] Location to install apps in.
        "repo":        // [Required] Authentication to use for repo access.
        {
            "auth": {
                "type": "basic"        // [Optional] Defaults to "basic"
                "username": "",        // For basic auth.
                "password": ""        // For basic auth.
            }
        }
    },
    "apps": [
        {
            "id": "test-tags",        // [Required] Unique name amongst all other apps maintained.
            "repo": {
                "owner": "Cygnut",        // [Required] Github repo owner.
                "name": "test-tags",    // [Required] Github repo name.
                "release": {
                    "id": null            // [Optional] Desired github release id. Leave null to get latest.
                }
            }
        }]
}


*/

var Config = {};

Config.path = path.join(__dirname, '.config');
    
/*
    next = function(err, obj)
*/
Config.load = function(next)
{
    fs.readJson(this.path, next);
};

/*
    next = function(err)
*/
Config.save = function(config, next)
{
    fs.writeJson(this.path, config, next);
};

module.exports = Config;