const 
	winston = require('winston'),
	util = require('util'),
	moment = require('moment');

module.exports.init = function()
{
	// Replace default Console logging with our improved one.
	winston.remove(winston.transports.Console);
	winston.add(winston.transports.Console, {
		formatter: function(options)
		{
			// Return string will be passed to logger.
			return '[' + moment().format('DD-MM-YYYY HH:mm:ss') + ']'
				+ ' ' 
				+ options.level.toUpperCase() 
				+ ' ' 
				+ (undefined !== options.message ? options.message : '') 
				+ (options.meta && Object.keys(options.meta).length ? '\n\t'+ JSON.stringify(options.meta) : '' );
		},
		colorize: true
	});
	
	winston.setLevels( winston.config.npm.levels );
	winston.addColors( winston.config.npm.colors );
}