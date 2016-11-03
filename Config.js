'use strict'

const 
	fs = require('fs-extra'),
	path = require('path');

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