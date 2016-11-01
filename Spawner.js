const
	spawn = require('child_process').spawn;


function Spawner() 
{
	this._options = { };
	this._command = '';
	this._args = [];
	this._error = function(err) {};
	this._close = function(code, stdout, stderr) {};
}

Spawner.prototype.options = function(options)
{
	this._options = options;
	return this;
}

Spawner.prototype.command = function(c) 
{
	this._command = c;
	return this;
}

Spawner.prototype.args = function(a)
{
	this._args = a;
	return this;
}

Spawner.prototype.error = function(e)
{
	this._error = e;
	return this;
}

Spawner.prototype.close = function(c)
{
	this._close = c;
	return this;
}

Spawner.prototype.run = function()
{
	var opts = this._options;
	opts.detached = true;
	
	var cmd = spawn(this._command, this._args, opts);
	var stdout = '';
	var stderr = '';
	
	cmd.stdout.on('data', function(d) { stdout += d.toString() });
	cmd.stderr.on('data', function(d) { stderr += d.toString() });
	
	cmd.on('error', function(err) {
		return this._error(`Command "${this._command} ${this._args}" failed with error ${err}`);
	}.bind(this));
	
	cmd.on('close', function(code)
	{
		stdout = stdout.trim();
		stderr = stderr.trim();
		
		return this._close(code, stdout, stderr);
	}.bind(this));
}
	
module.exports = Spawner;