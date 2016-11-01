const 
	fs = require('fs-extra'),
	path = require('path');

module.exports = {
	
	path: path.join(__dirname, '.config');
	
	/*
		next = function(err, obj)
	*/
	load: function(next)
	{
		fs.readJson(this.path, next);
	};
	
	/*
		next = function(err)
	*/
	save: function(config, next)
	{
		fs.writeJson(this.path, config, next);
	};
};

