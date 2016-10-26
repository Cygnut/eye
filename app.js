

// TODO: Allow configurable check period. Should be quite high - like only once every 10 mins.
// TODO: 

/*
	What does this need to do?
	Phase 1:
		Needs to (for each package listed), 
			ensure it is installed in it's own directory under ../apps
			ensure it is up to date
			ensure that it is being run by pm2
	Phase 2:
		Have a web interface to allow editing of the app config file.
		Check pm2 (globally) installed on startup.
*/

var 
	fs = require('fs'),
	path = require('path');

this.cmd = path.join(__dirname, "bin", "nircmd.exe")
var appsPath = path.join(__dirname, '../', 'eye-apps');

function ensureInstalled(pkg)
{
	// Ensure this path exists.
	var path = path.join(appsPath, pkg.id);
	
	if (!fs.existsSync(path))
		fs.mkdirSync(dir);
	
	
}

function ensureUpdated(pkg)
{
	
}

function ensureInPm2(pkg)
{
	
}

function ensureInstalledUpdatedAndInPm2(pkg)
{
	ensureInstalled(pkg);
	ensureUpdated(pkg);
	ensureInPm2(pkg);
}

var pkg = {
	id: 'hookshot-server',
		// Must be unique against all other packages. 
		// (Should also ideally contain the name of the app)
		// Used to locate the app on disk uniquely.
	name: 'hookshot-server',
	version: '1.0.0'	// or something like @latest
};

ensureInstalledUpdatedAndInPm2(pkg);